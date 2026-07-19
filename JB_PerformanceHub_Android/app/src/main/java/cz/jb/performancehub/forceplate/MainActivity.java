package cz.jb.performancehub.forceplate;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final String APP_URL = "file:///android_asset/modules/forceplates/index.html?mobile=1";
    private static final int FILE_CHOOSER_REQUEST = 42;
    private static final int RESULTS_FOLDER_REQUEST = 43;
    private static final String RESULTS_HOST = "jb-performancehub-results.local";
    private static final String STORAGE_PREFERENCES = "performancehub-storage";
    private static final String RESULTS_URI_KEY = "results-uri";

    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private ForcePlateAndroidBridge androidBridge;
    private volatile Uri resultsFolderUri;
    private PendingExport pendingExport;
    private boolean resultsFolderPickerOpen;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback wifiNetworkCallback;
    private Network boundWifiNetwork;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = new WebView(this);
        String storedResultsUri = getSharedPreferences(STORAGE_PREFERENCES, MODE_PRIVATE)
            .getString(RESULTS_URI_KEY, "");
        if (storedResultsUri != null && !storedResultsUri.isBlank()) {
            resultsFolderUri = Uri.parse(storedResultsUri);
        }
        configureWebView();
        webView.clearCache(true);
        bindAppToWifi();
        setContentView(webView);
        webView.post(this::enterImmersiveMode);
        webView.loadUrl(APP_URL);
    }

    private void bindAppToWifi() {
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkRequest request = new NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .build();
        wifiNetworkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                boundWifiNetwork = network;
                connectivityManager.bindProcessToNetwork(network);
            }

            @Override
            public void onLost(Network network) {
                if (network.equals(boundWifiNetwork)) {
                    connectivityManager.bindProcessToNetwork(null);
                    boundWifiNetwork = null;
                }
            }
        };
        connectivityManager.registerNetworkCallback(request, wifiNetworkCallback);
    }

    private void enterImmersiveMode() {
        View decorView = getWindow().getDecorView();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = decorView.getWindowInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                return;
            }
        }

        // OxygenOS can report a null insets controller until DecorView is attached.
        // Legacy immersive flags remain a safe fallback on those Android 11/12 builds.
        decorView.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setUseWideViewPort(false);
        settings.setLoadWithOverviewMode(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.setBackgroundColor(Color.rgb(29, 29, 28));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debuggable);
        androidBridge = new ForcePlateAndroidBridge();
        webView.addJavascriptInterface(androidBridge, "JBForcePlateAndroid");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return !"file".equalsIgnoreCase(uri.getScheme())
                    && !RESULTS_HOST.equalsIgnoreCase(uri.getHost());
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!RESULTS_HOST.equalsIgnoreCase(uri.getHost())) return null;
                return openResultResponse(uri.getLastPathSegment());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                WebView view,
                ValueCallback<Uri[]> callback,
                FileChooserParams params
            ) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception error) {
                    fileChooserCallback = null;
                    Toast.makeText(MainActivity.this, "File picker is not available", Toast.LENGTH_LONG).show();
                    return false;
                }
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileChooserCallback != null) {
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            fileChooserCallback.onReceiveValue(result);
            fileChooserCallback = null;
            return;
        }
        if (requestCode == RESULTS_FOLDER_REQUEST) {
            resultsFolderPickerOpen = false;
            handleResultsFolderSelection(resultCode, data);
        }
    }

    public class ForcePlateAndroidBridge {
        @JavascriptInterface
        public String saveBase64(String filename, String mimeType, String base64Payload) {
            final String safeName = sanitizeFilename(filename);
            final String safeMime = mimeType == null || mimeType.isBlank()
                ? "application/octet-stream"
                : mimeType;
            try {
                byte[] bytes = Base64.decode(base64Payload, Base64.DEFAULT);
                if (resultsFolderUri == null) {
                    pendingExport = new PendingExport(safeName, safeMime, bytes);
                    chooseResultsFolder();
                    return "folder_required";
                }
                saveResultBytes(safeName, safeMime, bytes);
                showToast("Saved to JB PerformanceHub/Results: " + safeName);
                return "saved";
            } catch (Exception error) {
                showToast("Export failed: " + safeName);
                return "failed";
            }
        }

        @JavascriptInterface
        public String listResults() {
            return buildResultsListing().toString();
        }

        @JavascriptInterface
        public void chooseResultsFolder() {
            runOnUiThread(MainActivity.this::launchResultsFolderPicker);
        }

        private String sanitizeFilename(String filename) {
            String name = filename == null ? "" : filename.trim();
            if (name.isEmpty()) name = "ForcePlate-export.bin";
            return name.replaceAll("[\\\\/:*?\"<>|]+", "_");
        }

        private void showToast(String message) {
            MainActivity.this.showToast(message);
        }
    }

    private void launchResultsFolderPicker() {
        if (resultsFolderPickerOpen) return;
        resultsFolderPickerOpen = true;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent.putExtra(
                DocumentsContract.EXTRA_INITIAL_URI,
                Uri.parse("content://com.android.externalstorage.documents/document/primary%3ADocuments"));
        }
        showToast("Choose Documents (or another parent folder). PerformanceHub will create JB PerformanceHub/Results inside it.");
        try {
            startActivityForResult(intent, RESULTS_FOLDER_REQUEST);
        } catch (Exception error) {
            resultsFolderPickerOpen = false;
            showToast("Results folder picker is not available");
        }
    }

    private void handleResultsFolderSelection(int resultCode, Intent data) {
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            pendingExport = null;
            return;
        }
        Uri selectedTree = data.getData();
        try {
            int flags = data.getFlags()
                & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            getContentResolver().takePersistableUriPermission(selectedTree, flags);
            Uri selectedDocument = DocumentsContract.buildDocumentUriUsingTree(
                selectedTree,
                DocumentsContract.getTreeDocumentId(selectedTree));
            Uri appDirectory = ensureDirectory(selectedDocument, "JB PerformanceHub");
            resultsFolderUri = ensureDirectory(appDirectory, "Results");
            getSharedPreferences(STORAGE_PREFERENCES, MODE_PRIVATE)
                .edit()
                .putString(RESULTS_URI_KEY, resultsFolderUri.toString())
                .apply();

            PendingExport export = pendingExport;
            pendingExport = null;
            if (export != null) {
                saveResultBytes(export.filename, export.mimeType, export.bytes);
                showToast("Saved to JB PerformanceHub/Results: " + export.filename);
            }
            notifyResultsFolderChanged();
        } catch (Exception error) {
            resultsFolderUri = null;
            pendingExport = null;
            getSharedPreferences(STORAGE_PREFERENCES, MODE_PRIVATE).edit().remove(RESULTS_URI_KEY).apply();
            showToast("Cannot prepare JB PerformanceHub/Results in the selected folder");
        }
    }

    private Uri ensureDirectory(Uri parentUri, String name) throws Exception {
        Uri existing = findChild(parentUri, name);
        if (existing != null) return existing;
        Uri created = DocumentsContract.createDocument(
            getContentResolver(),
            parentUri,
            DocumentsContract.Document.MIME_TYPE_DIR,
            name);
        if (created == null) throw new IllegalStateException("Cannot create directory " + name);
        return created;
    }

    private synchronized void saveResultBytes(String name, String mimeType, byte[] bytes) throws Exception {
        Uri folderUri = resultsFolderUri;
        if (folderUri == null) throw new IllegalStateException("Results folder is not selected");
        Uri documentUri = findChild(folderUri, name);
        if (documentUri == null) {
            documentUri = DocumentsContract.createDocument(getContentResolver(), folderUri, mimeType, name);
        }
        if (documentUri == null) throw new IllegalStateException("Cannot create Results file");
        try (OutputStream output = getContentResolver().openOutputStream(documentUri, "rwt")) {
            if (output == null) throw new IllegalStateException("Cannot open Results file");
            output.write(bytes);
        }
    }

    private Uri findChild(Uri parentUri, String wantedName) throws Exception {
        String parentId = DocumentsContract.getDocumentId(parentUri);
        Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(parentUri, parentId);
        String[] projection = {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        };
        try (Cursor cursor = getContentResolver().query(childrenUri, projection, null, null, null)) {
            if (cursor == null) return null;
            while (cursor.moveToNext()) {
                if (!wantedName.equals(cursor.getString(1))) continue;
                return DocumentsContract.buildDocumentUriUsingTree(parentUri, cursor.getString(0));
            }
        }
        return null;
    }

    private JSONObject buildResultsListing() {
        JSONObject listing = new JSONObject();
        JSONArray files = new JSONArray();
        try {
            listing.put("folderName", "JB PerformanceHub/Results");
            Uri folderUri = resultsFolderUri;
            if (folderUri == null) {
                listing.put("needsFolder", true);
                listing.put("files", files);
                return listing;
            }
            String folderId = DocumentsContract.getDocumentId(folderUri);
            Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(folderUri, folderId);
            String[] projection = {
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE,
                DocumentsContract.Document.COLUMN_SIZE,
                DocumentsContract.Document.COLUMN_LAST_MODIFIED,
            };
            try (Cursor cursor = getContentResolver().query(childrenUri, projection, null, null, null)) {
                if (cursor != null) {
                    while (cursor.moveToNext()) {
                        String name = cursor.getString(0);
                        String lowerName = name == null ? "" : name.toLowerCase();
                        if (!lowerName.endsWith(".jbbin") && !lowerName.endsWith(".json")) continue;
                        String mimeType = cursor.getString(1);
                        long size = cursor.isNull(2) ? 0 : cursor.getLong(2);
                        long lastModified = cursor.isNull(3) ? 0 : cursor.getLong(3);
                        JSONObject file = new JSONObject();
                        file.put("name", name);
                        file.put("mimeType", mimeType == null ? "application/octet-stream" : mimeType);
                        file.put("size", size);
                        file.put("lastModified", lastModified);
                        file.put("url", "https://" + RESULTS_HOST + "/" + Uri.encode(name) + "?v=" + lastModified);
                        files.put(file);
                    }
                }
            }
            listing.put("needsFolder", false);
            listing.put("files", files);
        } catch (Exception error) {
            resultsFolderUri = null;
            getSharedPreferences(STORAGE_PREFERENCES, MODE_PRIVATE).edit().remove(RESULTS_URI_KEY).apply();
            try {
                listing.put("needsFolder", true);
                listing.put("files", files);
            } catch (Exception ignored) {
                // JSONObject with constant keys should not fail.
            }
        }
        return listing;
    }

    private WebResourceResponse openResultResponse(String filename) {
        try {
            if (filename == null || resultsFolderUri == null) throw new IllegalArgumentException("Missing result file");
            Uri documentUri = findChild(resultsFolderUri, filename);
            if (documentUri == null) throw new IllegalArgumentException("Result file not found");
            InputStream input = getContentResolver().openInputStream(documentUri);
            if (input == null) throw new IllegalStateException("Cannot open result file");
            String mimeType = getContentResolver().getType(documentUri);
            WebResourceResponse response = new WebResourceResponse(
                mimeType == null ? "application/octet-stream" : mimeType,
                null,
                input);
            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "no-store");
            response.setResponseHeaders(headers);
            return response;
        } catch (Exception error) {
            WebResourceResponse response = new WebResourceResponse(
                "text/plain",
                "UTF-8",
                new ByteArrayInputStream("Not found".getBytes()));
            response.setStatusCodeAndReasonPhrase(404, "Not Found");
            return response;
        }
    }

    private void notifyResultsFolderChanged() {
        webView.post(() -> webView.evaluateJavascript(
            "window.JBForcePlateResultsFolderChanged && window.JBForcePlateResultsFolderChanged()",
            null));
    }

    private void showToast(String message) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show());
    }

    private static final class PendingExport {
        final String filename;
        final String mimeType;
        final byte[] bytes;

        PendingExport(String filename, String mimeType, byte[] bytes) {
            this.filename = filename;
            this.mimeType = mimeType;
            this.bytes = bytes;
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersiveMode();
    }

    @Override
    protected void onResume() {
        super.onResume();
        enterImmersiveMode();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView == null) {
            performDefaultBack();
            return;
        }
        webView.evaluateJavascript(
            "(function(){try{return !!(window.JBForcePlateMobileBack && window.JBForcePlateMobileBack());}catch(error){return false;}})()",
            handled -> {
                if (!"true".equals(handled)) performDefaultBack();
            }
        );
    }

    @SuppressWarnings("deprecation")
    private void performDefaultBack() {
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
        if (connectivityManager != null && wifiNetworkCallback != null) {
            connectivityManager.unregisterNetworkCallback(wifiNetworkCallback);
            connectivityManager.bindProcessToNetwork(null);
        }
        webView.removeJavascriptInterface("JBForcePlateAndroid");
        webView.destroy();
        super.onDestroy();
    }
}
