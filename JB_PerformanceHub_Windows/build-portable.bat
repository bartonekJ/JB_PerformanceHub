@echo off
setlocal
cd /d "%~dp0"
set "PORTABLE_DIR=%~dp0Release\PerformanceHub"
set "ARTIFACTS_DIR=%~dp0.build"

dotnet publish "JB.PerformanceHub.Windows.csproj" -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false --artifacts-path "%ARTIFACTS_DIR%" --output "%PORTABLE_DIR%"
if errorlevel 1 exit /b %errorlevel%
echo.
echo Portable build:
echo %PORTABLE_DIR%\PerformanceHub.exe
