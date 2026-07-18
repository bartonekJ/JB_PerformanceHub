using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Input;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;
using JB.PerformanceHub.Windows.Services;

namespace JB.PerformanceHub.Windows;

public partial class MainWindow : Window
{
    private const string ForcePlateRosterKey = "forceplate.roster.v1";
    private const string ResultsHostName = "jb-performancehub-results.local";
    private readonly string _dataDirectory;
    private readonly string _resultsDirectory;
    private readonly LocalStore _localStore;
    private WindowStyle _windowStyleBeforeFullscreen;
    private WindowState _windowStateBeforeFullscreen;
    private ResizeMode _resizeModeBeforeFullscreen;
    private bool _fullscreen;

    public MainWindow()
    {
        InitializeComponent();
        _dataDirectory = Path.Combine(AppContext.BaseDirectory, "Data");
        _resultsDirectory = Path.Combine(AppContext.BaseDirectory, "Results");
        _localStore = new LocalStore(Path.Combine(_dataDirectory, "PerformanceHubLocal.db"));
        Loaded += OnLoaded;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        Loaded -= OnLoaded;
        try
        {
            await InitializeAsync();
        }
        catch (Exception error)
        {
            StartupStatus.Text = $"Startup failed: {error.Message}";
            await LogAsync(error.ToString());
        }
    }

    private async Task InitializeAsync()
    {
        Directory.CreateDirectory(_dataDirectory);
        Directory.CreateDirectory(_resultsDirectory);
        StartupStatus.Text = "Migrating portable data...";
        await Task.Run(MigrateLegacyData);
        StartupStatus.Text = "Opening local data store...";
        await _localStore.InitializeAsync();

        var webRoot = Path.Combine(AppContext.BaseDirectory, "app");
        var indexPath = Path.Combine(webRoot, "index.html");
        if (!File.Exists(indexPath))
        {
            throw new FileNotFoundException("Packaged PerformanceHub UI was not found.", indexPath);
        }

        StartupStatus.Text = "Starting WebView2...";
        var userDataFolder = Path.Combine(_dataDirectory, "WebView2");
        var options = new CoreWebView2EnvironmentOptions(
            "--allow-file-access-from-files --autoplay-policy=no-user-gesture-required");
        var environment = await CoreWebView2Environment.CreateAsync(null, userDataFolder, options);
        await Browser.EnsureCoreWebView2Async(environment);
        Browser.CoreWebView2.SetVirtualHostNameToFolderMapping(
            ResultsHostName,
            _resultsDirectory,
            CoreWebView2HostResourceAccessKind.Allow);

        var settings = Browser.CoreWebView2.Settings;
        settings.IsStatusBarEnabled = false;
        settings.IsZoomControlEnabled = false;
        settings.AreBrowserAcceleratorKeysEnabled = true;
#if DEBUG
        settings.AreDevToolsEnabled = true;
        settings.AreDefaultContextMenusEnabled = true;
#else
        settings.AreDevToolsEnabled = false;
        settings.AreDefaultContextMenusEnabled = false;
#endif

        var rosterJson = await _localStore.GetAsync(ForcePlateRosterKey);
        var bootstrapRoster = IsJsonObject(rosterJson) ? rosterJson : "null";
        await Browser.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync($$"""
            window.JBPerformanceHubNative = Object.freeze({ platform: 'windows', localStore: true });
            window.JBPerformanceHubNativeBootstrap = Object.freeze({ forceplateRoster: {{bootstrapRoster}} });
            """);

        Browser.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
        Browser.CoreWebView2.NavigationCompleted += OnNavigationCompleted;
        Browser.CoreWebView2.NavigationStarting += OnNavigationStarting;
        StartupStatus.Text = "Loading PerformanceHub...";
        Browser.Source = new Uri(indexPath);
    }

    private async void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var document = JsonDocument.Parse(e.WebMessageAsJson);
            var root = document.RootElement;
            if (!root.TryGetProperty("type", out var typeElement))
            {
                return;
            }

            switch (typeElement.GetString())
            {
                case "performancehub.local-store.put":
                    if (!root.TryGetProperty("key", out var keyElement)
                        || !root.TryGetProperty("value", out var valueElement)) return;
                    var key = keyElement.GetString();
                    if (string.IsNullOrWhiteSpace(key)) return;
                    await _localStore.PutAsync(key, valueElement.GetRawText());
                    break;
                case "performancehub.results.save":
                    await SaveResultFileAsync(root);
                    break;
                case "performancehub.results.list":
                    SendResultsResponse(root, ListResultFiles());
                    break;
                case "performancehub.results.pick":
                    PickResultFiles(root);
                    break;
            }
        }
        catch (Exception error)
        {
            await LogAsync($"Native message failed: {error}");
        }
    }

    private async Task SaveResultFileAsync(JsonElement message)
    {
        try
        {
            var filename = message.TryGetProperty("fileName", out var filenameElement)
                ? SanitizeFilename(filenameElement.GetString())
                : "ForcePlate-export.bin";
            var payload = message.TryGetProperty("base64", out var payloadElement)
                ? payloadElement.GetString()
                : null;
            if (string.IsNullOrWhiteSpace(payload)) throw new InvalidDataException("Export payload is empty.");

            var targetPath = Path.Combine(_resultsDirectory, filename);
            var temporaryPath = Path.Combine(_resultsDirectory, $".{filename}.{Guid.NewGuid():N}.tmp");
            try
            {
                await File.WriteAllBytesAsync(temporaryPath, Convert.FromBase64String(payload));
                File.Move(temporaryPath, targetPath, true);
            }
            finally
            {
                if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
            }

            SendResultsResponse(message, new { fileName = filename });
        }
        catch (Exception error)
        {
            SendResultsResponse(message, null, error.Message);
            await LogAsync($"Results save failed: {error}");
        }
    }

    private object ListResultFiles()
    {
        Directory.CreateDirectory(_resultsDirectory);
        var files = Directory
            .EnumerateFiles(_resultsDirectory, "*", SearchOption.TopDirectoryOnly)
            .Where(path => Path.GetExtension(path).Equals(".jbbin", StringComparison.OrdinalIgnoreCase)
                || Path.GetExtension(path).Equals(".json", StringComparison.OrdinalIgnoreCase))
            .Select(path => new FileInfo(path));
        return CreateResultFileListing(files);
    }

    private object CreateResultFileListing(IEnumerable<FileInfo> sourceFiles, bool cancelled = false)
    {
        var files = sourceFiles
            .OrderByDescending(file => file.LastWriteTimeUtc)
            .Select(file => new
            {
                name = file.Name,
                size = file.Length,
                lastModified = new DateTimeOffset(file.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                url = $"https://{ResultsHostName}/{Uri.EscapeDataString(file.Name)}?v={file.LastWriteTimeUtc.Ticks}",
            })
            .ToArray();
        return new { files, folderName = "Results", cancelled };
    }

    private void PickResultFiles(JsonElement message)
    {
        Directory.CreateDirectory(_resultsDirectory);
        var dialog = new OpenFileDialog
        {
            Title = "Load ForcePlate Session",
            InitialDirectory = _resultsDirectory,
            Filter = "JB session packages (*.jbbin)|*.jbbin|Session packages (*.jbbin;*.json)|*.jbbin;*.json",
            DefaultExt = ".jbbin",
            CheckFileExists = true,
            Multiselect = true,
            RestoreDirectory = true,
        };
        if (dialog.ShowDialog(this) != true)
        {
            SendResultsResponse(message, CreateResultFileListing([], true));
            return;
        }

        var resultsPath = Path.GetFullPath(_resultsDirectory).TrimEnd(Path.DirectorySeparatorChar);
        var selectedFiles = dialog.FileNames.Select(path => new FileInfo(path)).ToArray();
        if (selectedFiles.Any(file => !string.Equals(
            file.Directory?.FullName.TrimEnd(Path.DirectorySeparatorChar),
            resultsPath,
            StringComparison.OrdinalIgnoreCase)))
        {
            SendResultsResponse(message, null, "Select session files from the portable Results folder.");
            return;
        }
        SendResultsResponse(message, CreateResultFileListing(selectedFiles));
    }

    private void SendResultsResponse(JsonElement message, object? result, string? error = null)
    {
        var requestId = message.TryGetProperty("requestId", out var requestIdElement)
            ? requestIdElement.GetString()
            : null;
        if (string.IsNullOrWhiteSpace(requestId)) return;
        Browser.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new
        {
            type = "performancehub.results.response",
            requestId,
            ok = error is null,
            result,
            error,
        }));
    }

    private void MigrateLegacyData()
    {
        var markerPath = Path.Combine(_dataDirectory, ".portable-data");
        if (File.Exists(markerPath)) return;

        var legacyDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "JB PerformanceHub");
        if (Directory.Exists(legacyDirectory)
            && !Path.GetFullPath(legacyDirectory).Equals(Path.GetFullPath(_dataDirectory), StringComparison.OrdinalIgnoreCase))
        {
            CopyMissingDirectory(legacyDirectory, _dataDirectory);
        }
        File.WriteAllText(markerPath, DateTimeOffset.UtcNow.ToString("O"));
    }

    private static void CopyMissingDirectory(string sourceDirectory, string targetDirectory)
    {
        Directory.CreateDirectory(targetDirectory);
        foreach (var sourceFile in Directory.EnumerateFiles(sourceDirectory))
        {
            var targetFile = Path.Combine(targetDirectory, Path.GetFileName(sourceFile));
            if (File.Exists(targetFile)) continue;
            try
            {
                File.Copy(sourceFile, targetFile);
            }
            catch when (!Path.GetFileName(sourceFile).StartsWith("PerformanceHubLocal.db", StringComparison.OrdinalIgnoreCase))
            {
                // Browser cache lock files are disposable and may still be held by a previous process.
            }
        }
        foreach (var sourceChild in Directory.EnumerateDirectories(sourceDirectory))
        {
            CopyMissingDirectory(sourceChild, Path.Combine(targetDirectory, Path.GetFileName(sourceChild)));
        }
    }

    private static string SanitizeFilename(string? filename)
    {
        var name = Path.GetFileName(filename?.Trim());
        if (string.IsNullOrWhiteSpace(name)) name = "ForcePlate-export.bin";
        foreach (var invalid in Path.GetInvalidFileNameChars()) name = name.Replace(invalid, '_');
        return name;
    }

    private void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (e.IsSuccess)
        {
            StartupOverlay.Visibility = Visibility.Collapsed;
            return;
        }

        StartupStatus.Text = $"Navigation failed: {e.WebErrorStatus}";
    }

    private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) || uri.IsFile) return;
        if (uri.Scheme is not ("http" or "https")) return;
        e.Cancel = true;
        Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
    }

    private void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.F11)
        {
            ToggleFullscreen();
            e.Handled = true;
            return;
        }
        if (e.Key == Key.Escape && _fullscreen)
        {
            ToggleFullscreen();
            e.Handled = true;
            return;
        }
        if (e.Key == Key.F5 && Browser.CoreWebView2 is not null)
        {
            Browser.Reload();
            e.Handled = true;
        }
    }

    private void ToggleFullscreen()
    {
        if (!_fullscreen)
        {
            _windowStyleBeforeFullscreen = WindowStyle;
            _windowStateBeforeFullscreen = WindowState;
            _resizeModeBeforeFullscreen = ResizeMode;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.NoResize;
            WindowState = WindowState.Maximized;
            _fullscreen = true;
            return;
        }

        WindowStyle = _windowStyleBeforeFullscreen;
        ResizeMode = _resizeModeBeforeFullscreen;
        WindowState = _windowStateBeforeFullscreen;
        _fullscreen = false;
    }

    private async Task LogAsync(string message)
    {
        try
        {
            var logDirectory = Path.Combine(_dataDirectory, "Logs");
            Directory.CreateDirectory(logDirectory);
            await File.AppendAllTextAsync(
                Path.Combine(logDirectory, "performancehub.log"),
                $"{DateTimeOffset.Now:O} {message}{Environment.NewLine}");
        }
        catch
        {
            // Logging must never prevent the application from running.
        }
    }

    private static bool IsJsonObject(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return false;
        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.ValueKind == JsonValueKind.Object;
        }
        catch
        {
            return false;
        }
    }
}
