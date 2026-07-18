# PerformanceHub TODO

## ForcePlate OTA firmware delivery

Goal: publish a ForcePlate application firmware build to Librarian, cache it in
PerformanceHub while internet is available, and safely update both boards over
the `JB_ForcePlate` AP from Windows or Android.

### Release package

- Publish `JB_ForcePlate_FW.ino.bin` only. Never use `merged.bin` for OTA.
- Add explicit firmware version/build ID to the firmware and expose it through
  `/api/firmware/status` together with hardware ID, protocol version, role and
  running OTA partition.
- Librarian stores immutable binary artifacts plus a manifest containing:
  product/hardware target, semantic version/build ID, Stable or Bring-up
  channel, size, SHA-256, protocol compatibility, creation time and release
  notes.
- Add a small publish script that hashes the Arduino build output and uploads
  the binary and manifest to Librarian.

### PerformanceHub workflow

- Connect to Librarian and check the selected firmware channel.
- Download and verify a new package while internet is available, then persist
  it locally:
  - Windows portable app: `Data/Firmware/`.
  - Android: app-private persistent storage.
- The cached package must remain available after switching Android from the
  internet connection to the ForcePlate AP.
- Wire the existing Settings > Firmware Deploy placeholder to show:
  available/cached release, master version, slave version, compatibility,
  release notes and update progress.
- Disable deployment while measurement, realtime streaming or maintenance is
  active. Require both boards online for normal pair deployment.

### Safe pair deployment

1. Query and validate both boards before writing anything.
2. Verify target hardware, image size and SHA-256; refuse incompatible or
   oversized images.
3. Upload and reboot the slave first.
4. Wait for the slave and verify its new version.
5. Upload and reboot the master last; expect the AP to disappear temporarily.
6. Reconnect to the AP and verify that both boards run the requested build and
   pair normally.
7. Report an explicit success/failure state and keep the previous cached
   package available for recovery.

### Firmware OTA safety

- Stream upload chunks directly into the inactive OTA partition; never buffer
  the complete image in ESP32 RAM.
- Keep calibration, tare, noise profile and device identity in NVS untouched.
- Use the existing `app0`/`app1` partition layout and enabled bootloader app
  rollback. Mark a new image valid only after the board completes essential
  startup/self-checks.
- Preserve USB flashing as the recovery path for partition-table changes,
  oversized firmware or a board that cannot boot either application image.
- Development MVP may use SHA-256 integrity. Before trainer-facing release,
  add a signed manifest/image verified against a public key embedded in the
  firmware.

### Delivery estimate

- Development MVP: roughly 3-4 focused days.
- Trainer-ready flow including interrupted-update recovery and real pair tests:
  roughly 5-7 focused days.
- Signed packages and hardened recovery: add roughly 1-2 days.
