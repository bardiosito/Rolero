package mx.rolero.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

/** A small Android host for the bundled, offline scheduling application. */
public final class MainActivity extends Activity {
    private static final int SAVE_BACKUP = 1001;
    private static final int RESTORE_BACKUP = 1002;
    private static final int MAX_BACKUP_BYTES = 5 * 1024 * 1024;
    private WebView webView;
    private String pendingBackup;
    private String pendingRestored;
    private boolean pageReady;
    private boolean backPending;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (savedInstanceState != null) pendingBackup = savedInstanceState.getString("pendingBackup");
        getWindow().setStatusBarColor(Color.rgb(245, 248, 246));
        getWindow().setNavigationBarColor(Color.rgb(245, 248, 246));
        int systemUi = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        else systemUi |= View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
        getWindow().getDecorView().setSystemUiVisibility(systemUi);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.rgb(245, 248, 246));
        frame.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        webView = new WebView(this);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        webView.setBackgroundColor(Color.rgb(245, 248, 246));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        webView.addJavascriptInterface(new NativeActions(), "Android");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                pageReady = true;
                deliverRestoredBackup();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isBundledAsset(request.getUrl());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (isBundledAsset(request.getUrl())) return null;
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
        });
        frame.addView(webView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(frame);
        frame.requestApplyInsets();
        webView.loadUrl("file:///android_asset/index.html");
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
    }

    private static boolean isBundledAsset(Uri uri) {
        return "file".equals(uri.getScheme()) && uri.getPath() != null && uri.getPath().startsWith("/android_asset/") && !uri.getPath().contains("..");
    }

    private void notifyUser(String message) { Toast.makeText(this, message, Toast.LENGTH_SHORT).show(); }

    private void deliverRestoredBackup() {
        if (!pageReady || pendingRestored == null) return;
        String script = "if(typeof window.onBackupRestored==='function'){window.onBackupRestored(" + JSONObject.quote(pendingRestored) + ");}";
        pendingRestored = null;
        webView.evaluateJavascript(script, null);
    }

    public final class NativeActions {
        @JavascriptInterface public void copyText(String text) {
            if (text == null) return;
            runOnUiThread(() -> {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                clipboard.setPrimaryClip(ClipData.newPlainText("Rolero", text));
                notifyUser("Texto copiado");
            });
        }
        @JavascriptInterface public void shareText(String text) {
            if (text == null) return;
            runOnUiThread(() -> {
                Intent share = new Intent(Intent.ACTION_SEND);
                share.setType("text/plain");
                share.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(share, "Compartir rol"));
            });
        }
        @JavascriptInterface public void saveBackup(String text) {
            if (text == null || text.getBytes(StandardCharsets.UTF_8).length > MAX_BACKUP_BYTES) return;
            runOnUiThread(() -> {
                pendingBackup = text;
                Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                save.addCategory(Intent.CATEGORY_OPENABLE);
                save.setType("application/json");
                save.putExtra(Intent.EXTRA_TITLE, "rolero-respaldo-" + LocalDate.now() + ".json");
                startActivityForResult(save, SAVE_BACKUP);
            });
        }
        @JavascriptInterface public void restoreBackup() {
            runOnUiThread(() -> {
                Intent open = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                open.addCategory(Intent.CATEGORY_OPENABLE);
                open.setType("*/*");
                open.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
                startActivityForResult(open, RESTORE_BACKUP);
            });
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            if (requestCode == SAVE_BACKUP) pendingBackup = null;
            return;
        }
        Uri uri = data.getData();
        try {
            if (requestCode == SAVE_BACKUP && pendingBackup != null) {
                try (OutputStream output = getContentResolver().openOutputStream(uri, "wt")) {
                    if (output == null) throw new IllegalStateException("Sin acceso al archivo");
                    output.write(pendingBackup.getBytes(StandardCharsets.UTF_8));
                }
                pendingBackup = null;
                notifyUser("Respaldo guardado");
            } else if (requestCode == RESTORE_BACKUP) {
                String restored;
                try (InputStream input = getContentResolver().openInputStream(uri); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    if (input == null) throw new IllegalStateException("Sin acceso al archivo");
                    byte[] buffer = new byte[8192];
                    int length;
                    while ((length = input.read(buffer)) != -1) {
                        if (output.size() + length > MAX_BACKUP_BYTES) throw new IllegalStateException("Respaldo demasiado grande");
                        output.write(buffer, 0, length);
                    }
                    restored = new String(output.toByteArray(), StandardCharsets.UTF_8);
                }
                pendingRestored = restored;
                deliverRestoredBackup();
            }
        } catch (Exception error) {
            pendingBackup = null;
            notifyUser("No se pudo procesar el respaldo. Revisa el archivo.");
        }
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        if (pendingBackup != null) state.putString("pendingBackup", pendingBackup);
    }

    @Override public void onBackPressed() {
        handleBack();
    }

    private void handleBack() {
        if (backPending || webView == null) return;
        backPending = true;
        webView.evaluateJavascript("(function(){return !!(window.RoleroUI && typeof window.RoleroUI.handleBack === 'function' && window.RoleroUI.handleBack());})()", handled -> {
            backPending = false;
            if ("true".equals(handled) || isFinishing()) return;
            if (webView.canGoBack()) webView.goBack();
            else finish();
        });
    }

    @Override protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("Android");
            webView.destroy();
        }
        super.onDestroy();
    }
}
