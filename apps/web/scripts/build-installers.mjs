import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(WEB_ROOT, 'public');
const DOWNLOADS_DIR = path.join(PUBLIC_DIR, 'downloads');

fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

function findAndroidTools() {
  const sdkRoot =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');

  const buildToolsParent = path.join(sdkRoot, 'build-tools');
  const platformsParent = path.join(sdkRoot, 'platforms');

  if (!fs.existsSync(buildToolsParent) || !fs.existsSync(platformsParent)) {
    throw new Error(`Android SDK not found at ${sdkRoot}`);
  }

  const buildToolsVersions = fs
    .readdirSync(buildToolsParent)
    .filter((v) => !v.includes('rc'))
    .sort();
  const buildToolsDir = path.join(buildToolsParent, buildToolsVersions[buildToolsVersions.length - 1]);

  const platformDir = fs.existsSync(path.join(platformsParent, 'android-34'))
    ? path.join(platformsParent, 'android-34')
    : path.join(platformsParent, fs.readdirSync(platformsParent).sort().pop());

  const jbrBin = 'C:\\Program Files\\Android\\Android Studio\\jbr\\bin';
  const javaBin = fs.existsSync(jbrBin) ? jbrBin : '';

  return {
    aapt2: path.join(buildToolsDir, 'aapt2.exe'),
    d8: path.join(buildToolsDir, 'd8.bat'),
    zipalign: path.join(buildToolsDir, 'zipalign.exe'),
    apksigner: path.join(buildToolsDir, 'apksigner.bat'),
    androidJar: path.join(platformDir, 'android.jar'),
    javac: javaBin ? path.join(javaBin, 'javac.exe') : 'javac',
    java: javaBin ? path.join(javaBin, 'java.exe') : 'java',
    keytool: javaBin ? path.join(javaBin, 'keytool.exe') : 'keytool',
    javaHome: javaBin ? path.dirname(javaBin) : process.env.JAVA_HOME,
  };
}

function createIcoFromPng(pngPath, icoPath) {
  const pngBuf = fs.readFileSync(pngPath);
  // ICONDIR (6 bytes) + ICONDIRENTRY (16 bytes) + PNG payload
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: 1 = ICO
  header.writeUInt16LE(1, 4); // Count: 1 image
  header.writeUInt8(0, 6); // Width (0 = 256/large PNG)
  header.writeUInt8(0, 7); // Height (0 = 256/large PNG)
  header.writeUInt8(0, 8); // Color count
  header.writeUInt8(0, 9); // Reserved
  header.writeUInt16LE(1, 10); // Color planes
  header.writeUInt16LE(32, 12); // Bits per pixel
  header.writeUInt32LE(pngBuf.length, 14); // Size of image data
  header.writeUInt32LE(22, 18); // Offset of image data
  fs.writeFileSync(icoPath, Buffer.concat([header, pngBuf]));
}

function buildAndroidApk() {
  console.log('Building Android APK (WishPix-Teacher.apk)...');
  const tools = findAndroidTools();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wishpix-apk-'));

  try {
    const srcDir = path.join(workDir, 'src', 'com', 'wishpix', 'teacher');
    const resMipmapHdpi = path.join(workDir, 'res', 'mipmap-hdpi');
    const resMipmapXxxhdpi = path.join(workDir, 'res', 'mipmap-xxxhdpi');
    const resValues = path.join(workDir, 'res', 'values');
    const classesDir = path.join(workDir, 'classes');
    const compiledResDir = path.join(workDir, 'compiled_res');

    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(resMipmapHdpi, { recursive: true });
    fs.mkdirSync(resMipmapXxxhdpi, { recursive: true });
    fs.mkdirSync(resValues, { recursive: true });
    fs.mkdirSync(classesDir, { recursive: true });
    fs.mkdirSync(compiledResDir, { recursive: true });

    fs.copyFileSync(path.join(PUBLIC_DIR, 'icon-192.png'), path.join(resMipmapHdpi, 'ic_launcher.png'));
    fs.copyFileSync(path.join(PUBLIC_DIR, 'icon-512.png'), path.join(resMipmapXxxhdpi, 'ic_launcher.png'));

    const stringsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">WishPix Teacher</string>
</resources>
`;
    fs.writeFileSync(path.join(resValues, 'strings.xml'), stringsXml, 'utf8');

    const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.wishpix.teacher"
    android:versionCode="1"
    android:versionName="1.0.0">

    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="34" />
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />

    <application
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:usesCleartextTraffic="true"
        android:allowBackup="true"
        android:theme="@android:style/Theme.DeviceDefault.Light.NoActionBar">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;
    const manifestPath = path.join(workDir, 'AndroidManifest.xml');
    fs.writeFileSync(manifestPath, manifestXml, 'utf8');

    const mainActivityJava = `package com.wishpix.teacher;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends Activity {
    private static final String PREFS_NAME = "wishpix_teacher_prefs";
    private static final String KEY_SERVER_URL = "server_url";
    private static final int FILE_CHOOSER_RESULT_CODE = 1001;

    private WebView webView;
    private LinearLayout connectOverlay;
    private EditText urlInput;
    private TextView statusLabel;
    private ValueCallback<Uri[]> filePathCallback;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        if (window != null) {
            window.setStatusBarColor(Color.parseColor("#F8F6FF"));
            window.setNavigationBarColor(Color.parseColor("#F8F6FF"));
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#F8F6FF"));

        webView = new WebView(this);
        setupWebView();
        root.addView(webView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        connectOverlay = buildConnectOverlay();
        root.addView(connectOverlay, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        setContentView(root);
        discoverAndLoadServer();
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        String defaultUa = settings.getUserAgentString();
        settings.setUserAgentString(defaultUa + " WishPixTeacherApp/1.0 (Standalone)");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getPath();
                if (path != null && (path.equals("/") || path.equals("/teacher") || path.equals("/teacher/") || path.equals("/teacher/about") || path.equals("/teacher/team"))) {
                    String base = uri.getScheme() + "://" + uri.getAuthority();
                    view.loadUrl(base + "/teacher/login?app=1");
                    return true;
                }
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;
                try {
                    Intent intent = fileChooserParams.createIntent();
                    startActivityForResult(intent, FILE_CHOOSER_RESULT_CODE);
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }
        });
    }

    private LinearLayout buildConnectOverlay() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setBackgroundColor(Color.parseColor("#F8F6FF"));
        int pad = dp(28);
        layout.setPadding(pad, pad, pad, pad);

        TextView badge = new TextView(this);
        badge.setText("WISHPIX TEACHER APP");
        badge.setTextColor(Color.parseColor("#7950D5"));
        badge.setTextSize(13);
        badge.setGravity(Gravity.CENTER);
        layout.addView(badge);

        TextView title = new TextView(this);
        title.setText("Connect to WishPix Kiosk");
        title.setTextColor(Color.parseColor("#302344"));
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(8), 0, dp(8));
        layout.addView(title);

        statusLabel = new TextView(this);
        statusLabel.setText("Searching for WishPix on your Wi-Fi...");
        statusLabel.setTextColor(Color.parseColor("#756B86"));
        statusLabel.setTextSize(15);
        statusLabel.setGravity(Gravity.CENTER);
        statusLabel.setPadding(0, 0, 0, dp(20));
        layout.addView(statusLabel);

        urlInput = new EditText(this);
        urlInput.setHint("http://192.168.1.50:3000");
        urlInput.setSingleLine(true);
        urlInput.setTextColor(Color.parseColor("#302344"));
        urlInput.setBackgroundColor(Color.WHITE);
        urlInput.setPadding(dp(16), dp(14), dp(16), dp(14));
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        urlInput.setText(prefs.getString(KEY_SERVER_URL, "http://wishpix.local:3000"));
        layout.addView(urlInput, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        Button connectBtn = new Button(this);
        connectBtn.setText("Open Teacher Login");
        connectBtn.setTextColor(Color.WHITE);
        connectBtn.setBackgroundColor(Color.parseColor("#7950D5"));
        LinearLayout.LayoutParams btnParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            dp(50)
        );
        btnParams.topMargin = dp(16);
        connectBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String raw = urlInput.getText().toString().trim();
                if (!raw.isEmpty()) {
                    if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
                        raw = "http://" + raw;
                    }
                    if (raw.endsWith("/")) {
                        raw = raw.substring(0, raw.length() - 1);
                    }
                    saveAndOpenServer(raw);
                }
            }
        });
        layout.addView(connectBtn, btnParams);

        return layout;
    }

    private void discoverAndLoadServer() {
        connectOverlay.setVisibility(View.VISIBLE);
        statusLabel.setText("Connecting to WishPix server...");

        final SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        final String savedUrl = prefs.getString(KEY_SERVER_URL, null);

        new Thread(new Runnable() {
            @Override
            public void run() {
                List<String> candidates = new ArrayList<String>();
                if (savedUrl != null && !savedUrl.isEmpty()) {
                    candidates.add(savedUrl);
                }
                candidates.add("http://10.0.2.2:3000");
                candidates.add("http://localhost:3000");
                candidates.add("http://wishpix.local:3000");
                candidates.add("http://wishpix.local");

                for (String c : candidates) {
                    if (isWishPixServer(c, 900)) {
                        onServerFound(c);
                        return;
                    }
                }

                String subnet = getWifiSubnetPrefix();
                if (subnet != null) {
                    final AtomicBoolean found = new AtomicBoolean(false);
                    ExecutorService pool = Executors.newFixedThreadPool(24);
                    for (int i = 1; i <= 254; i++) {
                        final String candidate = "http://" + subnet + "." + i + ":3000";
                        pool.submit(new Runnable() {
                            @Override
                            public void run() {
                                if (!found.get() && isWishPixServer(candidate, 600)) {
                                    if (found.compareAndSet(false, true)) {
                                        onServerFound(candidate);
                                    }
                                }
                            }
                        });
                    }
                    pool.shutdown();
                    try {
                        Thread.sleep(1600);
                    } catch (InterruptedException ignored) {}
                    if (found.get()) return;
                }

                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        statusLabel.setText("Enter your WishPix server address (for example http://192.168.1.50:3000) to sign in:");
                    }
                });
            }
        }).start();
    }

    private void onServerFound(final String baseUrl) {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                saveAndOpenServer(baseUrl);
            }
        });
    }

    private void saveAndOpenServer(String baseUrl) {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        prefs.edit().putString(KEY_SERVER_URL, baseUrl).apply();
        urlInput.setText(baseUrl);
        connectOverlay.setVisibility(View.GONE);
        webView.loadUrl(baseUrl + "/teacher/login?app=1");
    }

    private boolean isWishPixServer(String baseUrl, int timeoutMs) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(baseUrl + "/api/prefs");
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(timeoutMs);
            conn.setReadTimeout(timeoutMs);
            conn.setRequestMethod("GET");
            int code = conn.getResponseCode();
            return code == 200;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private String getWifiSubnetPrefix() {
        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm == null) return null;
            WifiInfo info = wm.getConnectionInfo();
            if (info == null) return null;
            int ip = info.getIpAddress();
            if (ip == 0) return null;
            return String.format("%d.%d.%d", (ip & 0xff), (ip >> 8 & 0xff), (ip >> 16 & 0xff));
        } catch (Exception e) {
            return null;
        }
    }

    private int dp(int v) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(v * density);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_RESULT_CODE) {
            if (filePathCallback != null) {
                Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
`;
    const mainActivityPath = path.join(srcDir, 'MainActivity.java');
    fs.writeFileSync(mainActivityPath, mainActivityJava, 'utf8');

    const env = { ...process.env };
    if (tools.javaHome) {
      env.JAVA_HOME = tools.javaHome;
      env.PATH = `${ path.join(tools.javaHome, 'bin') };${ process.env.PATH }`;
    }

    // 1. Compile resources with aapt2
    const resZip = path.join(workDir, 'res.zip');
    execFileSync(tools.aapt2, ['compile', '--dir', path.join(workDir, 'res'), '-o', resZip], { env, stdio: 'inherit' });

    // 2. Link resources and generate R.java + unsigned base APK
    const unalignedApk = path.join(workDir, 'unaligned.apk');
    const rJavaDir = path.join(workDir, 'src');
    execFileSync(
      tools.aapt2,
      [
        'link',
        '-o',
        unalignedApk,
        '-I',
        tools.androidJar,
        '--manifest',
        manifestPath,
        '--java',
        rJavaDir,
        resZip,
      ],
      { env, stdio: 'inherit' }
    );

    // 3. Compile Java sources with javac (targeting Java 8 bytecode for d8 compatibility)
    const rJavaPath = path.join(srcDir, 'R.java');
    execFileSync(
      tools.javac,
      [
        '-Xlint:-options',
        '-Xlint:-deprecation',
        '-source',
        '1.8',
        '-target',
        '1.8',
        '-bootclasspath',
        tools.androidJar,
        '-classpath',
        tools.androidJar,
        '-d',
        classesDir,
        mainActivityPath,
        rJavaPath,
      ],
      { env, stdio: 'inherit' }
    );

    // 4. Convert .class files to classes.dex with d8
    const classFiles = fs
      .readdirSync(path.join(classesDir, 'com', 'wishpix', 'teacher'))
      .filter((f) => f.endsWith('.class'))
      .map((f) => path.join(classesDir, 'com', 'wishpix', 'teacher', f));

    execFileSync(
      'cmd.exe',
      ['/c', tools.d8, '--lib', tools.androidJar, '--output', workDir, ...classFiles],
      { env, stdio: 'inherit' }
    );

    // 5. Add classes.dex into unaligned.apk using jar (from JDK)
    const jarExe = tools.javaHome ? path.join(tools.javaHome, 'bin', 'jar.exe') : 'jar';
    execFileSync(jarExe, ['uf', unalignedApk, '-C', workDir, 'classes.dex'], { env, stdio: 'inherit' });

    // 6. Zipalign the APK
    const alignedApk = path.join(workDir, 'aligned.apk');
    execFileSync(tools.zipalign, ['-f', '-p', '4', unalignedApk, alignedApk], { env, stdio: 'inherit' });

    // 7. Create a signing keystore and sign the APK with apksigner
    const keystorePath = path.join(workDir, 'release.keystore');
    execFileSync(
      tools.keytool,
      [
        '-genkeypair',
        '-v',
        '-keystore',
        keystorePath,
        '-alias',
        'wishpix',
        '-keyalg',
        'RSA',
        '-keysize',
        '2048',
        '-validity',
        '10000',
        '-storepass',
        'wishpix123',
        '-keypass',
        'wishpix123',
        '-dname',
        'CN=WishPix Teacher, OU=Education, O=WishPix, L=Manila, S=NCR, C=PH',
      ],
      { env, stdio: 'pipe' }
    );

    const finalApk = path.join(DOWNLOADS_DIR, 'WishPix-Teacher.apk');
    execFileSync(
      'cmd.exe',
      [
        '/c',
        tools.apksigner,
        'sign',
        '--ks',
        keystorePath,
        '--ks-key-alias',
        'wishpix',
        '--ks-pass',
        'pass:wishpix123',
        '--key-pass',
        'pass:wishpix123',
        '--out',
        finalApk,
        alignedApk,
      ],
      { env, stdio: 'inherit' }
    );

    // Verify signature
    execFileSync('cmd.exe', ['/c', tools.apksigner, 'verify', finalApk], { env, stdio: 'inherit' });
    const stat = fs.statSync(finalApk);
    console.log(`Built signed Android APK: ${finalApk} (${stat.size} bytes)`);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function buildWindowsInstaller() {
  console.log('Building Windows Installer (WishPix-Teacher-Setup.exe)...');
  const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
  if (!fs.existsSync(cscPath)) {
    throw new Error(`C# compiler not found at ${cscPath}`);
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wishpix-win-'));
  try {
    const icoPath = path.join(workDir, 'WishPix.ico');
    createIcoFromPng(path.join(PUBLIC_DIR, 'icon-192.png'), icoPath);

    const csSource = `using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

[assembly: AssemblyTitle("WishPix Teacher App")]
[assembly: AssemblyDescription("WishPix Teacher App Installer and Standalone Launcher")]
[assembly: AssemblyCompany("WishPix")]
[assembly: AssemblyProduct("WishPix Teacher App")]
[assembly: AssemblyVersion("1.0.0.0")]

namespace WishPixTeacher {
    static class Program {
        private const string MARKER_START = "<<WISHPIX_ORIGIN:";
        private const string MARKER_END = ">>";

        [STAThread]
        static void Main(string[] args) {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string exePath = Assembly.GetExecutingAssembly().Location;
            string installDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs",
                "WishPixTeacher"
            );
            string installedExe = Path.Combine(installDir, "WishPix-Teacher.exe");
            string configPath = Path.Combine(installDir, "server-url.txt");

            string origin = ExtractTrailerOrigin(exePath);
            if (string.IsNullOrEmpty(origin) && File.Exists(configPath)) {
                origin = File.ReadAllText(configPath, Encoding.UTF8).Trim();
            }
            if (string.IsNullOrEmpty(origin)) {
                origin = "http://localhost:3000";
            }

            bool isInstalledRun = string.Equals(
                Path.GetFullPath(exePath),
                Path.GetFullPath(installedExe),
                StringComparison.OrdinalIgnoreCase
            );

            if (!isInstalledRun) {
                try {
                    Directory.CreateDirectory(installDir);
                    File.Copy(exePath, installedExe, true);
                    File.WriteAllText(configPath, origin, Encoding.UTF8);
                    CreateShortcut(
                        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "WishPix Teacher.lnk"),
                        installedExe
                    );
                    CreateShortcut(
                        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs", "WishPix Teacher.lnk"),
                        installedExe
                    );
                } catch {
                    // Continue and launch even if shortcut creation is restricted
                }
            }

            string targetUrl = origin.TrimEnd('/') + "/teacher/login?app=1";
            LaunchStandaloneWindow(targetUrl);
        }

        private static string ExtractTrailerOrigin(string filePath) {
            try {
                byte[] bytes = File.ReadAllBytes(filePath);
                int tailLen = Math.Min(bytes.Length, 512);
                string tail = Encoding.ASCII.GetString(bytes, bytes.Length - tailLen, tailLen);
                int start = tail.LastIndexOf(MARKER_START, StringComparison.Ordinal);
                if (start >= 0) {
                    start += MARKER_START.Length;
                    int end = tail.IndexOf(MARKER_END, start, StringComparison.Ordinal);
                    if (end > start) {
                        return tail.Substring(start, end - start).Trim();
                    }
                }
            } catch {}
            return null;
        }

        private static void CreateShortcut(string shortcutPath, string targetExe) {
            string vbsPath = Path.Combine(Path.GetTempPath(), "wp_shortcut_" + Guid.NewGuid().ToString("N") + ".vbs");
            try {
                string script =
                    "Set ws = CreateObject(\\"WScript.Shell\\")\\r\\n" +
                    "Set sc = ws.CreateShortcut(\\"" + shortcutPath.Replace("\\"", "\\"\\"") + "\\")\\r\\n" +
                    "sc.TargetPath = \\"" + targetExe.Replace("\\"", "\\"\\"") + "\\"\\r\\n" +
                    "sc.WorkingDirectory = \\"" + Path.GetDirectoryName(targetExe).Replace("\\"", "\\"\\"") + "\\"\\r\\n" +
                    "sc.Description = \\"WishPix Teacher App\\"\\r\\n" +
                    "sc.IconLocation = \\"" + targetExe.Replace("\\"", "\\"\\"") + ",0\\"\\r\\n" +
                    "sc.Save\\r\\n";
                File.WriteAllText(vbsPath, script, Encoding.Default);
                ProcessStartInfo psi = new ProcessStartInfo("wscript.exe", "//B //NoLogo \\"" + vbsPath + "\\"");
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                using (Process p = Process.Start(psi)) {
                    if (p != null) p.WaitForExit(3000);
                }
            } finally {
                try { if (File.Exists(vbsPath)) File.Delete(vbsPath); } catch {}
            }
        }

        private static void LaunchStandaloneWindow(string url) {
            string[] candidates = new string[] {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google", "Chrome", "Application", "chrome.exe")
            };

            foreach (string browser in candidates) {
                if (File.Exists(browser)) {
                    Process.Start(new ProcessStartInfo {
                        FileName = browser,
                        Arguments = "--app=\\"" + url + "\\"",
                        UseShellExecute = true
                    });
                    return;
                }
            }

            Process.Start(new ProcessStartInfo {
                FileName = url,
                UseShellExecute = true
            });
        }
    }
}
`;
    const csPath = path.join(workDir, 'WishPixSetup.cs');
    fs.writeFileSync(csPath, csSource, 'utf8');

    const finalExe = path.join(DOWNLOADS_DIR, 'WishPix-Teacher-Setup.exe');
    execFileSync(
      cscPath,
      [
        '/nologo',
        '/target:winexe',
        '/optimize+',
        `/win32icon:${icoPath}`,
        `/out:${finalExe}`,
        '/r:System.dll',
        '/r:System.Windows.Forms.dll',
        csPath,
      ],
      { stdio: 'inherit' }
    );

    const stat = fs.statSync(finalExe);
    console.log(`Built Windows Installer: ${finalExe} (${stat.size} bytes)`);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

buildAndroidApk();
buildWindowsInstaller();
