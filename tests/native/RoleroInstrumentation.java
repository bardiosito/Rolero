package mx.rolero.qa;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;

/** Temporary QA runner. Uses the target WebView API, not its DevTools transport. */
public final class RoleroInstrumentation extends Instrumentation {
    private static final String TARGET = "mx.rolero.app";
    private static final String DATE = "2026-11-03";
    private static final String STORAGE_KEY = "rolero-state-v1";
    private Bundle arguments;
    private Activity activity;
    private WebView webView;
    private JSONObject baseline;
    private final JSONArray passed = new JSONArray();
    private final JSONArray failures = new JSONArray();
    private boolean originalRestored;
    private boolean restoreOnly;
    private String phase = "initialization";

    @Override public void onCreate(Bundle args) {
        super.onCreate(args);
        arguments = args == null ? new Bundle() : args;
        start();
    }

    @Override public void onStart() {
        try {
            String encoded = arguments.getString("baseline");
            restoreOnly = "true".equalsIgnoreCase(arguments.getString("restoreOnly", "false"));
            require(encoded != null && !encoded.isEmpty(), "Missing baseline argument; no fixtures were loaded.");
            JSONObject envelope = new JSONObject(new String(Base64.decode(encoded, Base64.DEFAULT), StandardCharsets.UTF_8));
            baseline = envelope.getJSONObject("entries");
            for (Iterator<String> keys = baseline.keys(); keys.hasNext();) {
                require(baseline.get(keys.next()) instanceof String, "Baseline entries must be strings.");
            }
            phase = "launch";
            status("Launching the target Activity.");
            launch();
            phase = "initial baseline restore";
            restoreBaseline();
            status("Original data restored and verified before fixtures.");
            originalRestored = restoreOnly;
            if (!restoreOnly) {
                loadFixture();
                checkResidentOptions();
                checkRoleAndGuardSummary();
                checkSaveAndRelaunch();
                checkNativeClipboard();
            }
        } catch (Throwable error) {
            failure(phase, error);
        } finally {
            if (baseline != null) {
                try {
                    phase = "final baseline restore";
                    if (activity == null || activity.isFinishing() || activity.isDestroyed()) launch();
                    restoreBaseline();
                    originalRestored = true;
                    SystemClock.sleep(2000);
                    status("Original data restored and verified after fixtures.");
                } catch (Throwable error) { failure("final baseline restore", error); }
            }
            JSONObject result = new JSONObject();
            boolean success = (restoreOnly || passed.length() == 4) && failures.length() == 0 && originalRestored;
            try {
                result.put("version", "1.9.0");
                result.put("method", "native-instrumentation");
                result.put("passed", passed);
                result.put("failures", failures);
                result.put("originalRestored", originalRestored);
                result.put("restoreOnly", restoreOnly);
                result.put("success", success);
            } catch (Exception ignored) { success = false; }
            Bundle output = new Bundle();
            output.putString("roleroResult", result.toString());
            output.putString("stream", "\nROLERO_RESULT " + result + "\n");
            finish(success ? Activity.RESULT_OK : Activity.RESULT_CANCELED, output);
        }
    }

    private void launch() throws Exception {
        Intent intent = new Intent(Intent.ACTION_MAIN);
        intent.setClassName(TARGET, TARGET + ".MainActivity");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity = startActivitySync(intent);
        onMain(() -> webView = findWebView(activity.getWindow().getDecorView()));
        require(webView != null, "Target Activity has no WebView.");
        if (!restoreOnly) {
            status("Waiting for target Activity focus before UI actions.");
            waitFor("target Activity focus and shown WebView", () -> {
                boolean[] interactive = new boolean[1];
                onMain(() -> interactive[0] = activity.hasWindowFocus() && webView.isShown());
                return interactive[0];
            });
        }
        waitFor("bundled document", () -> bool("location.href.indexOf('file:///android_asset/index.html')===0 && document.readyState!=='loading'"));
    }

    private static WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView result = findWebView(group.getChildAt(i));
                if (result != null) return result;
            }
        }
        return null;
    }

    private Object eval(String expression) throws Exception {
        final CountDownLatch done = new CountDownLatch(1);
        final String[] value = new String[1];
        String guarded = "(function(){try{return(" + expression + ");}catch(e){return{__roleroQaError:String(e),stack:e&&e.stack||''};}})()";
        onMain(() -> webView.evaluateJavascript(guarded, result -> { value[0] = result; done.countDown(); }));
        require(done.await(60, TimeUnit.SECONDS), "WebView evaluation timed out during " + phase);
        require(value[0] != null, "WebView returned no evaluation result.");
        Object decoded = new JSONTokener(value[0]).nextValue();
        if (decoded instanceof JSONObject && ((JSONObject) decoded).has("__roleroQaError")) {
            throw new AssertionError(((JSONObject) decoded).optString("__roleroQaError") + " during " + phase);
        }
        return decoded;
    }

    private boolean bool(String expression) throws Exception { return Boolean.TRUE.equals(eval("Boolean(" + expression + ")")); }
    private String text(String expression) throws Exception { Object value = eval(expression); return value == JSONObject.NULL ? "" : String.valueOf(value); }
    private void run(String body) throws Exception { require(Boolean.TRUE.equals(eval("(function(){" + body + ";return true;})()")), "Script did not complete during " + phase); }
    private static String q(String value) { return JSONObject.quote(value); }
    private void onMain(Runnable action) throws Exception {
        if (Looper.myLooper() == Looper.getMainLooper()) { action.run(); return; }
        CountDownLatch done = new CountDownLatch(1);
        Throwable[] thrown = new Throwable[1];
        Handler handler = new Handler(Looper.getMainLooper());
        Runnable guarded = () -> {
            try { action.run(); }
            catch (Throwable error) { thrown[0] = error; }
            finally { done.countDown(); }
        };
        require(handler.post(guarded), "Could not post QA operation to the main thread.");
        if (!done.await(60, TimeUnit.SECONDS)) {
            handler.removeCallbacks(guarded);
            throw new AssertionError("Main thread operation timed out during " + phase);
        }
        if (thrown[0] instanceof Exception) throw (Exception) thrown[0];
        if (thrown[0] != null) throw new AssertionError("Main thread operation failed during " + phase, thrown[0]);
    }
    private interface Probe { boolean ready() throws Exception; }
    private void waitFor(String label, Probe probe) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 90000;
        Throwable last = null;
        while (SystemClock.elapsedRealtime() < deadline) {
            try { if (probe.ready()) return; } catch (Throwable error) { last = error; }
            SystemClock.sleep(250);
        }
        throw new AssertionError("Timed out waiting for " + label + (last == null ? "" : ": " + last));
    }

    private JSONObject entries() throws Exception {
        return new JSONObject(text("JSON.stringify(Object.fromEntries(Object.entries(localStorage)))"));
    }

    private static void requireEntries(JSONObject actual, JSONObject expected) throws Exception {
        require(actual.length() == expected.length(), "Storage entry count changed.");
        for (Iterator<String> keys = expected.keys(); keys.hasNext();) {
            String key = keys.next();
            require(actual.has(key) && expected.getString(key).equals(actual.getString(key)), "Stored entry was not preserved: " + key);
        }
    }

    private void reloadAndWait() throws Exception {
        String marker = "native-qa-" + SystemClock.elapsedRealtime();
        run("window.__roleroNativeDocument=" + q(marker));
        onMain(() -> webView.reload());
        waitFor("new document and RoleroUI", () -> bool("window.__roleroNativeDocument!==" + q(marker) + " && window.RoleroUI && document.querySelector('#create-date')"));
    }

    private void restoreBaseline() throws Exception {
        run("var entries=" + baseline + ";localStorage.clear();Object.keys(entries).forEach(function(k){localStorage.setItem(k,entries[k]);})");
        reloadAndWait();
        requireEntries(entries(), baseline);
    }

    private void loadFixture() throws Exception {
        phase = "fixture";
        run("var s=JSON.parse(JSON.stringify(ROLERO_DEFAULTS)),p=function(name,grade){return{name:name,grade:grade||1};};"
            + "s.doctors=["
            + "{id:'a',name:'Alfa',title:'Dr.',shift:'matutino',schedule:Array(5).fill('consulta'),residents:[p('Mayor A',4),p('Dos A',2),p('Uno')]},"
            + "{id:'b',name:'Beta',title:'Dra.',shift:'matutino',schedule:Array(5).fill('consulta'),residents:[p('Mayor B',3),p('Dos B',2)]},"
            + "{id:'c',name:'Gamma',title:'Dr.',shift:'vespertino',schedule:Array(5).fill('consulta'),residents:[p('Uno')]},"
            + "{id:'d',name:'Delta',title:'Dra.',shift:'vespertino',schedule:Array(5).fill('urgencias'),residents:[]},"
            + "{id:'u',name:'Urgente',title:'Dr.',shift:'matutino',schedule:Array(5).fill('urgencias'),residents:[p('Heredado')]}];"
            + "s.serviceRules=[];s.dailyOverrides={};s.dailyR1Rooms={};s.absences=[];s.r1Priorities={};s.mobileAssignments={matutino:[],vespertino:[]};"
            + "s.guardGroups.forEach(function(g){g.members=[];});s.guardGroups[0].members=[p('Uno'),p('Libre')];"
            + "s.dutySelection={guardGroupId:'A',referenceDate:" + q(DATE) + "};localStorage.setItem(" + q(STORAGE_KEY) + ",JSON.stringify(s))");
        reloadAndWait();
        setValue("#create-date", DATE);
    }

    private void openDetail(String name) throws Exception {
        run("var d=Array.from(document.querySelectorAll('details[data-detail]')).find(function(d){return d.getAttribute('data-detail')===" + q(name) + ";});if(!d)throw Error('Missing detail');d.open=true");
    }

    private void setValue(String selector, String value) throws Exception {
        run("var e=document.querySelector(" + q(selector) + ");if(!e)throw Error('Missing control');"
            + "var proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;"
            + "Object.getOwnPropertyDescriptor(proto,'value').set.call(e," + q(value) + ");e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))");
    }

    private void tap(String selector) throws Exception {
        JSONObject point = (JSONObject) eval("(function(){var e=document.querySelector(" + q(selector) + ");if(!e)throw Error('Missing tap target');e.scrollIntoView({block:'center',inline:'center'});"
            + "var r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,h=document.elementFromPoint(x,y);"
            + "return{x:x,y:y,width:innerWidth,height:innerHeight,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},visualViewport:window.visualViewport?{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale,offsetTop:visualViewport.offsetTop,offsetLeft:visualViewport.offsetLeft}:null,devicePixelRatio:devicePixelRatio,scrollX:scrollX,scrollY:scrollY,enabled:!e.disabled,hit:!!h&&(h===e||e.contains(h))};})()");
        require(point.getBoolean("enabled") && point.getBoolean("hit"), "Tap target is disabled or covered: " + selector);
        final int[] origin = new int[2];
        final int[] size = new int[2];
        final boolean[] focus = new boolean[2];
        final int[] display = new int[1];
        final Rect visibleFrame = new Rect();
        onMain(() -> {
            webView.getLocationOnScreen(origin);
            size[0] = webView.getWidth(); size[1] = webView.getHeight();
            webView.getWindowVisibleDisplayFrame(visibleFrame);
            focus[0] = activity.hasWindowFocus(); focus[1] = webView.hasWindowFocus();
            display[0] = webView.getDisplay() == null ? -1 : webView.getDisplay().getDisplayId();
        });
        float scale = (float) (size[0] / point.getDouble("width"));
        float x = origin[0] + (float) point.getDouble("x") * scale;
        float y = origin[1] + (float) point.getDouble("y") * scale;
        JSONObject diagnostic = new JSONObject();
        diagnostic.put("selector", selector);
        diagnostic.put("css", point);
        diagnostic.put("webViewOriginX", origin[0]); diagnostic.put("webViewOriginY", origin[1]);
        diagnostic.put("webViewWidth", size[0]); diagnostic.put("webViewHeight", size[1]);
        diagnostic.put("scale", scale); diagnostic.put("nativeX", x); diagnostic.put("nativeY", y);
        diagnostic.put("visibleFrame", visibleFrame.toShortString());
        diagnostic.put("activityHasWindowFocus", focus[0]); diagnostic.put("webViewHasWindowFocus", focus[1]);
        diagnostic.put("displayId", display[0]);
        diagnostic.put("activeRootPackage", activeRootPackage());
        status("TAP " + diagnostic);
        require(x >= origin[0] && x < origin[0] + size[0] && y >= origin[1] && y < origin[1] + size[1], "Tap target is outside the WebView.");
        long now = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, x, y, 0);
        MotionEvent up = MotionEvent.obtain(now, now + 80, MotionEvent.ACTION_UP, x, y, 0);
        try { sendPointerSync(down); SystemClock.sleep(80); sendPointerSync(up); } finally { down.recycle(); up.recycle(); }
        waitForIdleSync();
        SystemClock.sleep(150);
    }

    private String activeRootPackage() {
        FutureTask<String> query = new FutureTask<>(() -> {
            AccessibilityNodeInfo root = getUiAutomation().getRootInActiveWindow();
            if (root == null) return "unavailable:null-root";
            try { return String.valueOf(root.getPackageName()); }
            finally { root.recycle(); }
        });
        Thread thread = new Thread(query, "rolero-qa-active-window");
        thread.setDaemon(true);
        thread.start();
        try { return query.get(1500, TimeUnit.MILLISECONDS); }
        catch (Throwable error) { query.cancel(true); return "unavailable:" + error.getClass().getSimpleName(); }
    }

    private void nav(String name) throws Exception { tap(".bottom-nav [data-tab='" + name + "']"); }
    private String roleForm(String shift) { return "[data-form='r1-priorities'][data-key='uno|R1'][data-shift='" + shift + "']"; }
    private void configureRole(String shift, String destination, String doctor) throws Exception {
        openDetail("r1-priorities");
        openDetail("r1-priority-uno%7CR1");
        openDetail("r1-priority-uno%7CR1-" + shift);
        setValue(roleForm(shift) + " [name='destination']", destination);
        if (doctor != null) setValue(roleForm(shift) + " [name='doctorId']", doctor);
        tap(roleForm(shift) + " [type='submit']");
    }

    private void checkResidentOptions() throws Exception {
        phase = "resident options";
        nav("equipo");
        tap("details[data-detail='absences'] > summary");
        tap("#add-absence label:has(input[name='personType'][value='resident'])");
        require(bool("Array.from(document.querySelectorAll('#add-absence select[name=residentId] option')).filter(function(o){return o.value;}).every(function(o){return /\\|R[12]$/.test(o.value);})"), "Senior residents appear in selectable options.");
        require(bool("Array.from(document.querySelectorAll('#add-absence select[name=residentId] option')).some(function(o){return o.value==='uno|R1';})"), "R1 option is missing.");
        require(bool("Array.from(document.querySelectorAll('#add-absence select[name=residentId] option')).some(function(o){return o.value==='dos a|R2';})"), "R2 option is missing.");
        require(bool("RoleroUI.getState().doctors.find(function(d){return d.id==='a';}).residents.some(function(p){return p.grade===4;})"), "Senior source data was removed.");
        nav("crear");
        require(text("document.querySelector('#preview-text').value").contains("Rotantes"), "Rotantes is missing from the report.");
        pass("Equipo offers only R1/R2 and preserves Rotantes");
    }

    private void checkRoleAndGuardSummary() throws Exception {
        phase = "R1 role and Guardias";
        nav("equipo");
        configureRole("matutino", "service:urgencias", null);
        configureRole("vespertino", "doctor", "d");
        require(bool("Rolero.generate(RoleroUI.getState(),{date:" + q(DATE) + ",shift:'matutino'}).groups.find(function(g){return g.service==='urgencias';}).doctors.some(function(d){return d.residents.some(function(p){return p.name==='Uno';});})"), "Explicit Urgencias role did not win over inherited assignment.");
        nav("guardias");
        openDetail("guard-A");
        String summary = text("document.querySelector('details[data-detail=\"resident-uno%7CR1\"] > summary').innerText");
        require(summary.contains("TM: Urgencias") && summary.contains("TV: Dra. Delta") && !summary.contains("Alfa") && !summary.contains("Gamma"), "Guardias summary does not reflect both chosen roles.");
        openDetail("resident-uno%7CR1");
        openDetail("assignment-uno%7CR1");
        openDetail("assignment-uno%7CR1-matutino");
        openDetail("assignment-uno%7CR1-vespertino");
        require(bool("document.querySelector('[data-form=resident][data-key=\"uno|R1\"] [data-resident-role=matutino]').innerText.indexOf('Urgencias')>=0"), "Guardias TM role is wrong.");
        require(bool("document.querySelector('[data-form=resident][data-key=\"uno|R1\"] [data-resident-role=vespertino]').innerText.indexOf('Delta')>=0"), "Guardias TV doctor is wrong.");
        require(bool("document.querySelectorAll('[data-form=resident][data-key=\"uno|R1\"] input[name^=doctor-]').length===0"), "Configured roles still expose conflicting doctor checkboxes.");
        pass("Explicit R1 roles have priority and appear in Guardias for both shifts");
    }

    private void checkSaveAndRelaunch() throws Exception {
        phase = "resident save and Activity relaunch";
        String form = "[data-form='resident'][data-key='uno|R1']";
        setValue(form + " [name='name']", "Uno Editado");
        setValue(form + " [name='guardGroupId']", "B");
        tap(form + " [type='submit']");
        require(bool("(function(){var s=RoleroUI.getState(),p=s.r1Priorities['uno editado|R1'];return p&&p.matutino[0]==='service:urgencias'&&p.vespertino[0]==='doctor:d'&&s.doctors.find(function(d){return d.id==='a';}).residents.some(function(p){return p.name==='Uno Editado';})&&s.doctors.find(function(d){return d.id==='c';}).residents.some(function(p){return p.name==='Uno Editado';});})()"), "Saving the resident lost a role or a base pairing.");
        JSONObject saved = entries();
        SystemClock.sleep(2000);
        onMain(() -> activity.finish());
        SystemClock.sleep(800);
        launch();
        waitFor("RoleroUI after Activity relaunch", () -> bool("window.RoleroUI && document.querySelector('#create-date')"));
        requireEntries(entries(), saved);
        setValue("#create-date", DATE);
        nav("guardias");
        openDetail("guard-B");
        String summary = text("document.querySelector('details[data-detail=\"resident-uno%20editado%7CR1\"] > summary').innerText");
        require(summary.contains("TM: Urgencias") && summary.contains("TV: Dra. Delta"), "Saved Guardias role did not survive reopening.");
        pass("Changing resident name/group preserves roles, base pairings and Activity persistence");
    }

    private void checkNativeClipboard() throws Exception {
        phase = "native clipboard";
        nav("crear");
        setValue("#create-date", DATE);
        String expected = text("document.querySelector('#preview-text').value");
        require(!expected.isEmpty(), "Preview is empty.");
        tap(".preview-card [data-action='copy']");
        ClipboardManager clipboard = (ClipboardManager) getTargetContext().getSystemService(Context.CLIPBOARD_SERVICE);
        waitFor("real native clipboard", () -> {
            ClipData clip = clipboard.getPrimaryClip();
            return clip != null && clip.getItemCount() > 0 && expected.equals(clip.getItemAt(0).coerceToText(getTargetContext()).toString());
        });
        pass("Copy button writes the exact preview to the native Android clipboard");
    }

    private static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    private void pass(String name) { passed.put(name); status("PASS native: " + name); }
    private void status(String message) { Bundle data = new Bundle(); data.putString("stream", "\n" + message + "\n"); sendStatus(0, data); }
    private void failure(String stage, Throwable error) {
        JSONObject record = new JSONObject();
        try { record.put("phase", stage); record.put("message", error.toString()); } catch (Exception ignored) {}
        failures.put(record);
        status("FAIL native during " + stage + ": " + error);
    }
}
