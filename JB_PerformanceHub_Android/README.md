# JB PerformanceHub ForcePlate Android

Fullscreen Android WebView shell for the mobile ForcePlate workspace.

The app does not maintain a second copy of the ForcePlate product code. During
`preBuild`, Gradle copies the required PerformanceHub core assets and
`modules/forceplates` into the APK. The WebView loads the module with
`?mobile=1`, which enables the portrait/landscape mobile presentation.

## Build

1. Add `local.properties` with the Android SDK path.
2. Run `gradlew.bat assembleDebug`.

The debug APK is generated at `app/build/outputs/apk/debug/app-debug.apk`.

The WebView permits clear-text local network traffic because the ForcePlate
boards expose their APIs on `192.168.4.x`. Exported sessions are saved in
`Downloads/JB ForcePlate` on Android 10 and newer.
