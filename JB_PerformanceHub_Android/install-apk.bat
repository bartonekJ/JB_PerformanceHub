@echo off
setlocal

set "APK=%~dp0app\build\outputs\apk\debug\app-debug.apk"
set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"

if not exist "%APK%" (
  echo ERROR: APK not found:
  echo %APK%
  echo.
  echo Build it first with gradlew.bat assembleDebug.
  pause
  exit /b 1
)

if not exist "%ADB%" (
  where adb.exe >nul 2>&1
  if errorlevel 1 (
    echo ERROR: adb.exe was not found in the Android SDK or PATH.
    pause
    exit /b 1
  )
  set "ADB=adb.exe"
)

echo Connected Android devices:
"%ADB%" devices
echo.
echo Installing JB ForcePlate...
"%ADB%" install -r "%APK%"

if errorlevel 1 (
  echo.
  echo INSTALL FAILED. Check USB debugging and confirm the phone authorization dialog.
  pause
  exit /b 1
)

echo.
echo JB ForcePlate installed successfully.
pause
