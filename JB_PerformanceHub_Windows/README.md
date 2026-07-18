# PerformanceHub Windows

Native Windows host for the existing PerformanceHub HTML/CSS/JavaScript application.

## Components

- .NET 10 WPF shell
- Microsoft Edge WebView2
- SQLite local store at `%LOCALAPPDATA%\JB PerformanceHub\PerformanceHubLocal.db`
- packaged web assets copied from the parent PerformanceHub repository

The ForcePlate roster is mirrored into the native local store. The native snapshot is injected before the web application starts, so clearing WebView browser data does not remove the last synchronized roster.

## Build

```powershell
dotnet build .\JB.PerformanceHub.Windows.csproj
```

Portable x64 build:

```powershell
.\build-portable.bat
```

Press `F11` to toggle fullscreen and `F5` to reload the web UI.
