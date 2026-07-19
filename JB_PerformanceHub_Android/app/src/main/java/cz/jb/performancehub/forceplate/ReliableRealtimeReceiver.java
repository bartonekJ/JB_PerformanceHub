package cz.jb.performancehub.forceplate;

import android.net.Network;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.TreeMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;
import java.util.zip.CRC32;

final class ReliableRealtimeReceiver {
    interface Listener {
        void onBatch(String boardLabel, byte[] batch);
        void onStatus(String boardLabel, String status);
    }

    private final Supplier<Network> networkSupplier;
    private final Listener listener;
    private final List<BoardReceiver> boards = new ArrayList<>();

    ReliableRealtimeReceiver(Supplier<Network> networkSupplier, Listener listener) {
        this.networkSupplier = networkSupplier;
        this.listener = listener;
    }

    synchronized void start(String masterUrl, String slaveUrl) {
        stop();
        boards.add(new BoardReceiver("Master / Left", masterUrl));
        boards.add(new BoardReceiver("Right / Slave", slaveUrl));
        for (BoardReceiver board : boards) board.start();
    }

    synchronized void stop() {
        for (BoardReceiver board : boards) board.stop();
        boards.clear();
    }

    private final class BoardReceiver implements Runnable {
        private static final int PORT = 8082;
        private static final int COMMAND_MAGIC = 0x31435246;
        private static final int DATA_MAGIC = 0x31445246;
        private static final int BATCH_MAGIC = 0x31425046;
        private static final int PROTOCOL_VERSION = 1;
        private static final int BATCH_VERSION = 3;
        private static final int COMMAND_SUBSCRIBE = 1;
        private static final int COMMAND_REPAIR = 2;
        private static final int COMMAND_UNSUBSCRIBE = 3;
        private static final int COMMAND_KEEPALIVE = 4;
        private static final int COMMAND_SIZE = 24;
        private static final int DATA_HEADER_SIZE = 28;
        private static final int BATCH_HEADER_SIZE = 24;
        private static final int SAMPLE_SIZE = 48;
        private static final int MAX_REPAIR_SAMPLES = 160;
        private static final int MAX_DELIVERED_SAMPLES = 24;

        private final String label;
        private final InetAddress boardAddress;
        private final AtomicBoolean running = new AtomicBoolean();
        private final TreeMap<Long, byte[]> pending = new TreeMap<>();
        private final int token = nonZeroToken();
        private volatile DatagramSocket socket;
        private Thread thread;
        private long expectedSeq = 1;
        private long oldestSeq = 1;
        private long nextSeq = 1;
        private long lastRepairSeq;
        private long lastRepairMs;
        private boolean receivedData;

        BoardReceiver(String label, String boardUrl) {
            this.label = label;
            this.boardAddress = resolveBoardAddress(boardUrl);
        }

        void start() {
            running.set(true);
            thread = new Thread(this, "fp-udp-" + label.replaceAll("[^A-Za-z]", ""));
            thread.start();
        }

        void stop() {
            running.set(false);
            DatagramSocket activeSocket = socket;
            if (activeSocket != null) activeSocket.close();
            if (thread != null) thread.interrupt();
        }

        @Override
        public void run() {
            int reconnects = 0;
            while (running.get()) {
                try (DatagramSocket activeSocket = createSocket()) {
                    socket = activeSocket;
                    InetSocketAddress endpoint = new InetSocketAddress(boardAddress, PORT);
                    sendCommand(activeSocket, endpoint, COMMAND_SUBSCRIBE, 0, 0);
                    listener.onStatus(label, reconnects == 0 ? "connecting" : "reconnecting " + reconnects);
                    long lastKeepAliveMs = 0;
                    byte[] receiveBuffer = new byte[1200];

                    while (running.get()) {
                        long nowMs = System.currentTimeMillis();
                        if (nowMs - lastKeepAliveMs >= 250) {
                            // Idempotent subscribe also restores the stream if a
                            // ForcePlate reboots while the app remains open.
                            sendCommand(activeSocket, endpoint, COMMAND_SUBSCRIBE, 0, 0);
                            lastKeepAliveMs = nowMs;
                        }
                        DatagramPacket packet = new DatagramPacket(receiveBuffer, receiveBuffer.length);
                        try {
                            activeSocket.receive(packet);
                        } catch (SocketTimeoutException ignored) {
                            continue;
                        }
                        if (!packet.getAddress().equals(boardAddress)) continue;
                        handleDatagram(
                            activeSocket,
                            endpoint,
                            Arrays.copyOfRange(packet.getData(), packet.getOffset(), packet.getOffset() + packet.getLength()));
                    }
                    sendCommandBestEffort(activeSocket, endpoint, COMMAND_UNSUBSCRIBE, 0, 0);
                } catch (Exception error) {
                    if (!running.get()) return;
                    reconnects++;
                    listener.onStatus(label, "socket retry " + reconnects + ": " + error.getMessage());
                    try {
                        Thread.sleep(Math.min(1000, 100L * reconnects));
                    } catch (InterruptedException ignored) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                } finally {
                    socket = null;
                }
            }
        }

        private DatagramSocket createSocket() throws Exception {
            DatagramSocket result = new DatagramSocket(null);
            result.setReuseAddress(false);
            result.bind(new InetSocketAddress(0));
            result.setReceiveBufferSize(1024 * 1024);
            result.setSendBufferSize(64 * 1024);
            result.setSoTimeout(50);
            Network network = networkSupplier.get();
            if (network != null) network.bindSocket(result);
            return result;
        }

        private void handleDatagram(
            DatagramSocket activeSocket,
            InetSocketAddress endpoint,
            byte[] datagram
        ) throws Exception {
            if (datagram.length < DATA_HEADER_SIZE) return;
            ByteBuffer header = ByteBuffer.wrap(datagram).order(ByteOrder.LITTLE_ENDIAN);
            if (header.getInt(0) != DATA_MAGIC
                || Byte.toUnsignedInt(header.get(4)) != PROTOCOL_VERSION
                || Byte.toUnsignedInt(header.get(7)) != DATA_HEADER_SIZE
                || header.getInt(8) != token) return;

            int flags = Byte.toUnsignedInt(header.get(6));
            int payloadSize = Short.toUnsignedInt(header.getShort(16));
            int transportSampleCount = Short.toUnsignedInt(header.getShort(18));
            if (payloadSize < BATCH_HEADER_SIZE || DATA_HEADER_SIZE + payloadSize != datagram.length) return;
            byte[] payload = Arrays.copyOfRange(datagram, DATA_HEADER_SIZE, datagram.length);
            if (crc32(payload, 0, payload.length) != Integer.toUnsignedLong(header.getInt(24))) return;

            ByteBuffer batch = ByteBuffer.wrap(payload).order(ByteOrder.LITTLE_ENDIAN);
            if (batch.getInt(0) != BATCH_MAGIC
                || Byte.toUnsignedInt(batch.get(4)) != BATCH_VERSION
                || Short.toUnsignedInt(batch.getShort(6)) != SAMPLE_SIZE) return;
            int sampleCount = Short.toUnsignedInt(batch.getShort(8));
            oldestSeq = Integer.toUnsignedLong(batch.getInt(12));
            nextSeq = Integer.toUnsignedLong(batch.getInt(16));
            if (sampleCount != transportSampleCount
                || BATCH_HEADER_SIZE + sampleCount * SAMPLE_SIZE != payload.length) return;

            if (receivedData && nextSeq < expectedSeq) {
                pending.clear();
                expectedSeq = oldestSeq;
                listener.onStatus(label, "board stream restarted");
            }

            if (expectedSeq < oldestSeq) {
                long lost = oldestSeq - expectedSeq;
                expectedSeq = oldestSeq;
                pending.headMap(expectedSeq).clear();
                listener.onStatus(label, "history gap " + lost + " samples");
            }

            for (int i = 0; i < sampleCount; i++) {
                int offset = BATCH_HEADER_SIZE + i * SAMPLE_SIZE;
                long sequence = Integer.toUnsignedLong(batch.getInt(offset));
                if (sequence < expectedSeq || pending.containsKey(sequence)) continue;
                pending.put(sequence, Arrays.copyOfRange(payload, offset, offset + SAMPLE_SIZE));
            }

            if (!pending.isEmpty() && pending.firstKey() > expectedSeq) {
                requestRepair(activeSocket, endpoint, pending.firstKey());
            }
            deliverContiguous(Byte.toUnsignedInt(batch.get(5)));

            if (!receivedData) {
                receivedData = true;
                listener.onStatus(label, "reliable UDP");
            } else if ((flags & 1) != 0) {
                listener.onStatus(label, "packet repaired");
            }
        }

        private void requestRepair(
            DatagramSocket activeSocket,
            InetSocketAddress endpoint,
            long firstBufferedSeq
        ) throws Exception {
            long missing = firstBufferedSeq - expectedSeq;
            if (missing <= 0) return;
            long nowMs = System.currentTimeMillis();
            if (lastRepairSeq == expectedSeq && nowMs - lastRepairMs < 20) return;
            lastRepairSeq = expectedSeq;
            lastRepairMs = nowMs;
            sendCommand(
                activeSocket,
                endpoint,
                COMMAND_REPAIR,
                expectedSeq,
                (int)Math.min(missing, MAX_REPAIR_SAMPLES));
        }

        private void deliverContiguous(int side) {
            while (pending.containsKey(expectedSeq)) {
                List<byte[]> samples = new ArrayList<>(MAX_DELIVERED_SAMPLES);
                long firstSeq = expectedSeq;
                while (samples.size() < MAX_DELIVERED_SAMPLES) {
                    byte[] sample = pending.remove(expectedSeq);
                    if (sample == null) break;
                    samples.add(sample);
                    expectedSeq++;
                }

                byte[] output = new byte[BATCH_HEADER_SIZE + samples.size() * SAMPLE_SIZE];
                ByteBuffer batch = ByteBuffer.wrap(output).order(ByteOrder.LITTLE_ENDIAN);
                batch.putInt(0, BATCH_MAGIC);
                batch.put(4, (byte)BATCH_VERSION);
                batch.put(5, (byte)side);
                batch.putShort(6, (short)SAMPLE_SIZE);
                batch.putShort(8, (short)samples.size());
                batch.putInt(12, (int)oldestSeq);
                batch.putInt(16, (int)nextSeq);
                batch.putInt(20, (int)firstSeq);
                for (int i = 0; i < samples.size(); i++) {
                    System.arraycopy(samples.get(i), 0, output, BATCH_HEADER_SIZE + i * SAMPLE_SIZE, SAMPLE_SIZE);
                }
                listener.onBatch(label, output);
            }
        }

        private void sendCommand(
            DatagramSocket activeSocket,
            InetSocketAddress endpoint,
            int type,
            long firstSeq,
            int sampleCount
        ) throws Exception {
            byte[] command = buildCommand(type, firstSeq, sampleCount);
            activeSocket.send(new DatagramPacket(command, command.length, endpoint));
        }

        private void sendCommandBestEffort(
            DatagramSocket activeSocket,
            InetSocketAddress endpoint,
            int type,
            long firstSeq,
            int sampleCount
        ) {
            try {
                sendCommand(activeSocket, endpoint, type, firstSeq, sampleCount);
            } catch (Exception ignored) {
                // The receiver is already stopping.
            }
        }

        private byte[] buildCommand(int type, long firstSeq, int sampleCount) {
            byte[] command = new byte[COMMAND_SIZE];
            ByteBuffer buffer = ByteBuffer.wrap(command).order(ByteOrder.LITTLE_ENDIAN);
            buffer.putInt(0, COMMAND_MAGIC);
            buffer.put(4, (byte)PROTOCOL_VERSION);
            buffer.put(5, (byte)type);
            buffer.putShort(6, (short)COMMAND_SIZE);
            buffer.putInt(8, token);
            buffer.putInt(12, (int)firstSeq);
            buffer.putShort(16, (short)sampleCount);
            buffer.putInt(20, (int)crc32(command, 0, 20));
            return command;
        }

        private InetAddress resolveBoardAddress(String value) {
            try {
                URI uri = new URI(value.contains("://") ? value : "http://" + value);
                return InetAddress.getByName(uri.getHost());
            } catch (Exception error) {
                throw new IllegalArgumentException("Invalid ForcePlate address: " + value, error);
            }
        }

        private int nonZeroToken() {
            SecureRandom random = new SecureRandom();
            int value;
            do { value = random.nextInt(); } while (value == 0);
            return value;
        }

        private long crc32(byte[] bytes, int offset, int length) {
            CRC32 crc = new CRC32();
            crc.update(bytes, offset, length);
            return crc.getValue();
        }
    }
}
