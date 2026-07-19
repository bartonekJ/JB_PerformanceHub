using System.Buffers.Binary;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;

namespace JB.PerformanceHub.Windows.Services;

internal sealed class ReliableRealtimeReceiver : IAsyncDisposable
{
    private readonly Action<string, byte[]> _onBatch;
    private readonly Action<string, string> _onStatus;
    private CancellationTokenSource? _cancellation;
    private Task[] _tasks = [];

    public ReliableRealtimeReceiver(
        Action<string, byte[]> onBatch,
        Action<string, string> onStatus)
    {
        _onBatch = onBatch;
        _onStatus = onStatus;
    }

    public void Start(string masterUrl, string slaveUrl)
    {
        Stop();
        _cancellation = new CancellationTokenSource();
        _tasks =
        [
            new BoardReceiver("Master / Left", masterUrl, _onBatch, _onStatus)
                .RunAsync(_cancellation.Token),
            new BoardReceiver("Right / Slave", slaveUrl, _onBatch, _onStatus)
                .RunAsync(_cancellation.Token),
        ];
    }

    public void Stop()
    {
        var cancellation = Interlocked.Exchange(ref _cancellation, null);
        if (cancellation is null) return;
        cancellation.Cancel();
        cancellation.Dispose();
        _tasks = [];
    }

    public async ValueTask DisposeAsync()
    {
        var tasks = _tasks;
        Stop();
        try
        {
            await Task.WhenAll(tasks);
        }
        catch (OperationCanceledException)
        {
            // Expected during shutdown.
        }
    }

    private sealed class BoardReceiver
    {
        private const int Port = 8082;
        private const uint CommandMagic = 0x31435246;
        private const uint DataMagic = 0x31445246;
        private const uint BatchMagic = 0x31425046;
        private const byte ProtocolVersion = 1;
        private const byte BatchVersion = 3;
        private const byte CommandSubscribe = 1;
        private const byte CommandRepair = 2;
        private const byte CommandUnsubscribe = 3;
        private const byte CommandKeepAlive = 4;
        private const int CommandSize = 24;
        private const int DataHeaderSize = 28;
        private const int BatchHeaderSize = 24;
        private const int SampleSize = 48;
        private const int MaxRepairSamples = 160;
        private const int MaxDeliveredSamples = 24;

        private readonly string _label;
        private readonly IPAddress _boardAddress;
        private readonly Action<string, byte[]> _onBatch;
        private readonly Action<string, string> _onStatus;
        private readonly SortedDictionary<uint, byte[]> _pending = [];
        private readonly uint _token = NonZeroRandomToken();
        private uint _expectedSeq = 1;
        private uint _oldestSeq = 1;
        private uint _nextSeq = 1;
        private uint _lastRepairSeq;
        private long _lastRepairTick;
        private bool _receivedData;

        public BoardReceiver(
            string label,
            string boardUrl,
            Action<string, byte[]> onBatch,
            Action<string, string> onStatus)
        {
            _label = label;
            _boardAddress = ResolveBoardAddress(boardUrl);
            _onBatch = onBatch;
            _onStatus = onStatus;
        }

        public async Task RunAsync(CancellationToken cancellationToken)
        {
            var reconnects = 0;
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    using var socket = CreateSocket(_boardAddress);
                    var endpoint = new IPEndPoint(_boardAddress, Port);
                    await SendCommandAsync(socket, endpoint, CommandSubscribe, 0, 0, cancellationToken);
                    _onStatus(_label, reconnects == 0 ? "connecting" : $"reconnecting {reconnects}");

                    using var keepAliveCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                    var keepAlive = KeepAliveAsync(socket, endpoint, keepAliveCancellation.Token);
                    try
                    {
                        await ReceiveAsync(socket, endpoint, cancellationToken);
                    }
                    finally
                    {
                        keepAliveCancellation.Cancel();
                        try { await keepAlive; } catch (OperationCanceledException) { }
                        await SendCommandBestEffortAsync(socket, endpoint, CommandUnsubscribe, 0, 0);
                    }
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    return;
                }
                catch (Exception error)
                {
                    reconnects++;
                    _onStatus(_label, $"socket retry {reconnects}: {error.Message}");
                    await Task.Delay(Math.Min(1000, 100 * reconnects), cancellationToken);
                }
            }
        }

        private async Task ReceiveAsync(
            Socket socket,
            IPEndPoint boardEndpoint,
            CancellationToken cancellationToken)
        {
            var buffer = new byte[1200];
            EndPoint any = new IPEndPoint(IPAddress.Any, 0);
            while (!cancellationToken.IsCancellationRequested)
            {
                var received = await socket.ReceiveFromAsync(
                    buffer,
                    SocketFlags.None,
                    any,
                    cancellationToken);
                if (received.RemoteEndPoint is not IPEndPoint remote ||
                    !remote.Address.Equals(_boardAddress)) continue;
                HandleDatagram(
                    socket,
                    boardEndpoint,
                    buffer.AsMemory(0, received.ReceivedBytes));
            }
        }

        private void HandleDatagram(
            Socket socket,
            IPEndPoint endpoint,
            ReadOnlyMemory<byte> datagram)
        {
            var span = datagram.Span;
            if (span.Length < DataHeaderSize ||
                BinaryPrimitives.ReadUInt32LittleEndian(span) != DataMagic ||
                span[4] != ProtocolVersion ||
                span[7] != DataHeaderSize ||
                BinaryPrimitives.ReadUInt32LittleEndian(span[8..]) != _token) return;

            var flags = span[6];
            var payloadSize = BinaryPrimitives.ReadUInt16LittleEndian(span[16..]);
            var transportSampleCount = BinaryPrimitives.ReadUInt16LittleEndian(span[18..]);
            if (payloadSize < BatchHeaderSize ||
                DataHeaderSize + payloadSize != span.Length) return;
            var payload = span.Slice(DataHeaderSize, payloadSize);
            if (Crc32(payload) != BinaryPrimitives.ReadUInt32LittleEndian(span[24..])) return;
            if (BinaryPrimitives.ReadUInt32LittleEndian(payload) != BatchMagic ||
                payload[4] != BatchVersion ||
                BinaryPrimitives.ReadUInt16LittleEndian(payload[6..]) != SampleSize) return;

            var sampleCount = BinaryPrimitives.ReadUInt16LittleEndian(payload[8..]);
            var side = payload[5];
            _oldestSeq = BinaryPrimitives.ReadUInt32LittleEndian(payload[12..]);
            _nextSeq = BinaryPrimitives.ReadUInt32LittleEndian(payload[16..]);
            var firstSeq = BinaryPrimitives.ReadUInt32LittleEndian(payload[20..]);
            if (sampleCount != transportSampleCount ||
                BatchHeaderSize + sampleCount * SampleSize != payload.Length) return;

            if (_receivedData && _nextSeq < _expectedSeq)
            {
                _pending.Clear();
                _expectedSeq = _oldestSeq;
                _onStatus(_label, "board stream restarted");
            }

            if (_expectedSeq < _oldestSeq)
            {
                var lost = _oldestSeq - _expectedSeq;
                _expectedSeq = _oldestSeq;
                RemovePendingBefore(_expectedSeq);
                _onStatus(_label, $"history gap {lost} samples");
            }

            for (var i = 0; i < sampleCount; i++)
            {
                var offset = BatchHeaderSize + i * SampleSize;
                var sample = payload.Slice(offset, SampleSize);
                var sequence = BinaryPrimitives.ReadUInt32LittleEndian(sample);
                if (sequence < _expectedSeq || _pending.ContainsKey(sequence)) continue;
                _pending.Add(sequence, sample.ToArray());
            }

            if (_pending.Count > 0 && _pending.Keys.First() > _expectedSeq)
            {
                RequestRepair(socket, endpoint, _pending.Keys.First());
            }
            DeliverContiguous(side);

            if (!_receivedData)
            {
                _receivedData = true;
                _onStatus(_label, "reliable UDP");
            }
            else if ((flags & 1) != 0)
            {
                _onStatus(_label, "packet repaired");
            }
        }

        private void RequestRepair(
            Socket socket,
            IPEndPoint endpoint,
            uint firstBufferedSeq)
        {
            var missing = firstBufferedSeq - _expectedSeq;
            if (missing == 0) return;
            var now = Environment.TickCount64;
            if (_lastRepairSeq == _expectedSeq && now - _lastRepairTick < 20) return;
            _lastRepairSeq = _expectedSeq;
            _lastRepairTick = now;
            var command = BuildCommand(
                CommandRepair,
                _expectedSeq,
                (ushort)Math.Min(missing, MaxRepairSamples));
            socket.SendTo(command, SocketFlags.None, endpoint);
        }

        private void DeliverContiguous(byte side)
        {
            while (_pending.ContainsKey(_expectedSeq))
            {
                var samples = new List<byte[]>(MaxDeliveredSamples);
                var firstSeq = _expectedSeq;
                while (samples.Count < MaxDeliveredSamples && _pending.Remove(_expectedSeq, out var sample))
                {
                    samples.Add(sample);
                    _expectedSeq++;
                }

                var batch = new byte[BatchHeaderSize + samples.Count * SampleSize];
                var span = batch.AsSpan();
                BinaryPrimitives.WriteUInt32LittleEndian(span, BatchMagic);
                span[4] = BatchVersion;
                span[5] = side;
                BinaryPrimitives.WriteUInt16LittleEndian(span[6..], SampleSize);
                BinaryPrimitives.WriteUInt16LittleEndian(span[8..], (ushort)samples.Count);
                BinaryPrimitives.WriteUInt32LittleEndian(span[12..], _oldestSeq);
                BinaryPrimitives.WriteUInt32LittleEndian(span[16..], _nextSeq);
                BinaryPrimitives.WriteUInt32LittleEndian(span[20..], firstSeq);
                for (var i = 0; i < samples.Count; i++)
                {
                    samples[i].CopyTo(span.Slice(BatchHeaderSize + i * SampleSize, SampleSize));
                }
                _onBatch(_label, batch);
            }
        }

        private void RemovePendingBefore(uint sequence)
        {
            foreach (var key in _pending.Keys.TakeWhile(key => key < sequence).ToArray())
            {
                _pending.Remove(key);
            }
        }

        private async Task KeepAliveAsync(
            Socket socket,
            IPEndPoint endpoint,
            CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                await Task.Delay(250, cancellationToken);
                // Repeating SUBSCRIBE is an idempotent keepalive and also
                // re-establishes the receiver automatically after a board reboot.
                await SendCommandAsync(socket, endpoint, CommandSubscribe, 0, 0, cancellationToken);
            }
        }

        private async Task SendCommandAsync(
            Socket socket,
            IPEndPoint endpoint,
            byte type,
            uint firstSeq,
            ushort sampleCount,
            CancellationToken cancellationToken)
        {
            var command = BuildCommand(type, firstSeq, sampleCount);
            await socket.SendToAsync(command, SocketFlags.None, endpoint, cancellationToken);
        }

        private async Task SendCommandBestEffortAsync(
            Socket socket,
            IPEndPoint endpoint,
            byte type,
            uint firstSeq,
            ushort sampleCount)
        {
            try
            {
                await socket.SendToAsync(BuildCommand(type, firstSeq, sampleCount), endpoint);
            }
            catch
            {
                // The receiver is already stopping.
            }
        }

        private byte[] BuildCommand(byte type, uint firstSeq, ushort sampleCount)
        {
            var command = new byte[CommandSize];
            var span = command.AsSpan();
            BinaryPrimitives.WriteUInt32LittleEndian(span, CommandMagic);
            span[4] = ProtocolVersion;
            span[5] = type;
            BinaryPrimitives.WriteUInt16LittleEndian(span[6..], CommandSize);
            BinaryPrimitives.WriteUInt32LittleEndian(span[8..], _token);
            BinaryPrimitives.WriteUInt32LittleEndian(span[12..], firstSeq);
            BinaryPrimitives.WriteUInt16LittleEndian(span[16..], sampleCount);
            BinaryPrimitives.WriteUInt32LittleEndian(span[20..], Crc32(span[..20]));
            return command;
        }

        private static Socket CreateSocket(IPAddress boardAddress)
        {
            var socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
            socket.ReceiveBufferSize = 1024 * 1024;
            socket.SendBufferSize = 64 * 1024;
            socket.Bind(new IPEndPoint(FindForcePlateInterface(boardAddress), 0));
            return socket;
        }

        private static IPAddress FindForcePlateInterface(IPAddress boardAddress)
        {
            var board = boardAddress.GetAddressBytes();
            return NetworkInterface.GetAllNetworkInterfaces()
                .Where(network => network.OperationalStatus == OperationalStatus.Up)
                .SelectMany(network => network.GetIPProperties().UnicastAddresses.Select(
                    unicast => new { network.NetworkInterfaceType, unicast.Address }))
                .Where(candidate => candidate.Address.AddressFamily == AddressFamily.InterNetwork)
                .Where(candidate =>
                {
                    var bytes = candidate.Address.GetAddressBytes();
                    return bytes[0] == board[0] && bytes[1] == board[1] && bytes[2] == board[2];
                })
                .OrderByDescending(candidate =>
                    candidate.NetworkInterfaceType == NetworkInterfaceType.Wireless80211)
                .Select(candidate => candidate.Address)
                .FirstOrDefault() ?? IPAddress.Any;
        }

        private static IPAddress ResolveBoardAddress(string value)
        {
            if (!Uri.TryCreate(value, UriKind.Absolute, out var uri))
            {
                value = $"http://{value}";
                uri = new Uri(value);
            }
            if (IPAddress.TryParse(uri.Host, out var address)) return address;
            return Dns.GetHostAddresses(uri.Host)
                .First(address => address.AddressFamily == AddressFamily.InterNetwork);
        }

        private static uint NonZeroRandomToken()
        {
            uint token;
            Span<byte> bytes = stackalloc byte[sizeof(uint)];
            do
            {
                RandomNumberGenerator.Fill(bytes);
                token = BinaryPrimitives.ReadUInt32LittleEndian(bytes);
            }
            while (token == 0);
            return token;
        }

        private static uint Crc32(ReadOnlySpan<byte> data)
        {
            var crc = 0xFFFFFFFFu;
            foreach (var value in data)
            {
                crc ^= value;
                for (var bit = 0; bit < 8; bit++)
                {
                    crc = (crc >> 1) ^ (0xEDB88320u & (uint)-(int)(crc & 1));
                }
            }
            return ~crc;
        }
    }
}
