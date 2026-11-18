import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

export type InstallerPlatform = 'android' | 'windows' | 'ios';

export function resolveInstallerPlatform(param: string | null, userAgent: string): InstallerPlatform {
  const normalized = (param ?? '').trim().toLowerCase();
  if (normalized === 'android' || normalized === 'apk') return 'android';
  if (normalized === 'windows' || normalized === 'exe' || normalized === 'win') return 'windows';
  if (normalized === 'ios' || normalized === 'mobileconfig' || normalized === 'apple') return 'ios';

  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  if (/windows/i.test(userAgent)) return 'windows';
  return 'android';
}

function getRequestOrigin(req: Request): string {
  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const forwardedProto = req.headers.get('x-forwarded-proto');
  if (forwardedHost) {
    const proto = forwardedProto || (forwardedHost.startsWith('localhost') || /^\d+\.\d+\.\d+\.\d+/.test(forwardedHost) ? 'http' : 'https');
    return `${proto}://${forwardedHost}`;
  }
  try {
    return new URL(req.url).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

function buildIosMobileConfig(origin: string, iconBase64: string): string {
  const targetUrl = `${origin.replace(/\/$/, '')}/teacher/login?app=1`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>FullScreen</key>
      <true/>
      <key>Icon</key>
      <data>${iconBase64}</data>
      <key>IgnoreManifestScope</key>
      <false/>
      <key>IsRemovable</key>
      <true/>
      <key>Label</key>
      <string>WishPix Teacher</string>
      <key>PayloadDescription</key>
      <string>Installs the WishPix Teacher App web clip with the Login screen as its landing page.</string>
      <key>PayloadDisplayName</key>
      <string>WishPix Teacher App</string>
      <key>PayloadIdentifier</key>
      <string>com.wishpix.teacher.webclip</string>
      <key>PayloadType</key>
      <string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key>
      <string>8B5E2A10-4D3C-4E9B-9A12-7C6F8E1A0001</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>Precomposed</key>
      <true/>
      <key>URL</key>
      <string>${targetUrl}</string>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>Installs WishPix Teacher App on your device.</string>
  <key>PayloadDisplayName</key>
  <string>WishPix Teacher App</string>
  <key>PayloadIdentifier</key>
  <string>com.wishpix.teacher.profile</string>
  <key>PayloadOrganization</key>
  <string>WishPix</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>8B5E2A10-4D3C-4E9B-9A12-7C6F8E1A0002</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ua = req.headers.get('user-agent') ?? '';
  const platform = resolveInstallerPlatform(url.searchParams.get('platform'), ua);
  const origin = getRequestOrigin(req);
  const publicDir = path.join(process.cwd(), 'public');

  if (platform === 'ios') {
    const iconPath = path.join(publicDir, 'icon-192.png');
    const iconBase64 = fs.existsSync(iconPath) ? fs.readFileSync(iconPath).toString('base64') : '';
    const xml = buildIosMobileConfig(origin, iconBase64);
    const body = Buffer.from(xml, 'utf8');
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-apple-aspen-config; charset=utf-8',
        'Content-Disposition': 'attachment; filename="WishPix-Teacher.mobileconfig"',
        'Content-Length': String(body.length),
        'Cache-Control': 'no-store',
      },
    });
  }

  if (platform === 'windows') {
    const exePath = path.join(publicDir, 'downloads', 'WishPix-Teacher-Setup.exe');
    if (!fs.existsSync(exePath)) {
      return NextResponse.json({ error: 'Windows installer not built' }, { status: 404 });
    }
    const exeBuf = fs.readFileSync(exePath);
    const trailer = Buffer.from(`<<WISHPIX_ORIGIN:${origin}>>`, 'ascii');
    const combined = Buffer.concat([exeBuf, trailer]);
    return new NextResponse(combined, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="WishPix-Teacher-Setup.exe"',
        'Content-Length': String(combined.length),
        'Cache-Control': 'no-store',
      },
    });
  }

  // Default: Android (.apk)
  const apkPath = path.join(publicDir, 'downloads', 'WishPix-Teacher.apk');
  if (!fs.existsSync(apkPath)) {
    return NextResponse.json({ error: 'Android APK installer not built' }, { status: 404 });
  }
  const apkBuf = fs.readFileSync(apkPath);
  return new NextResponse(apkBuf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': 'attachment; filename="WishPix-Teacher.apk"',
      'Content-Length': String(apkBuf.length),
      'Cache-Control': 'no-store',
    },
  });
}
