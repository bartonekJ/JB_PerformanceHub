@echo off
setlocal
cd /d "%~dp0"
dotnet publish "JB.PerformanceHub.Windows.csproj" -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false
if errorlevel 1 exit /b %errorlevel%
echo.
echo Portable build:
echo %~dp0bin\Release\net10.0-windows\win-x64\publish\PerformanceHub.exe
