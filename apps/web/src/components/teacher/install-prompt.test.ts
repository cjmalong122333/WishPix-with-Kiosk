import { describe, expect, it } from 'vitest';
import manifest from '@/app/manifest';
import { GET as downloadInstaller, resolveInstallerPlatform } from '@/app/api/teacher-app/download/route';
import {
  detectClientPlatform,
  getDownloadHref,
  INSTALLED_APP_SESSION_KEY,
  isPhoneOrTabletSize,
  isStandaloneApp,
  PHONE_TABLET_MEDIA_QUERY,
  shouldShowInstallPrompt,
  STANDALONE_MEDIA_QUERY,
} from './install-prompt';

function mockWindow(opts: {
  width: number;
  standalone?: boolean;
  iosStandalone?: boolean;
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  search?: string;
  sessionValue?: string | null;
}): Window {
  const store = new Map<string, string>();
  if (opts.sessionValue) {
    store.set(INSTALLED_APP_SESSION_KEY, opts.sessionValue);
  }
  return {
    innerWidth: opts.width,
    location: { search: opts.search ?? '' },
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    },
    navigator: {
      standalone: opts.iosStandalone ?? false,
      userAgent: opts.userAgent ?? 'Mozilla/5.0',
      platform: opts.platform ?? '',
      maxTouchPoints: opts.maxTouchPoints ?? 0,
    },
    matchMedia: (query: string) => ({
      matches:
        query === PHONE_TABLET_MEDIA_QUERY
          ? opts.width <= 1024
          : query === STANDALONE_MEDIA_QUERY
            ? Boolean(opts.standalone)
            : false,
    }),
  } as unknown as Window;
}

describe('Teacher PWA manifest, real installer download & standalone login landing logic', () => {
  it('configures manifest with star icons and /teacher/login start_url', () => {
    const m = manifest();
    expect(m.start_url).toBe('/teacher/login');
    expect(m.scope).toBe('/teacher');
    expect(m.display).toBe('standalone');
    expect(m.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: '/favicon.svg' }),
        expect.objectContaining({ src: '/icon-192.png', sizes: '192x192' }),
        expect.objectContaining({ src: '/icon-512.png', sizes: '512x512' }),
        expect.objectContaining({ src: '/icon-maskable-512.png', purpose: 'maskable' }),
      ])
    );
  });

  it('detects phone and tablet sizes (<= 1024px) vs desktop (> 1024px)', () => {
    expect(isPhoneOrTabletSize(mockWindow({ width: 390 }))).toBe(true); // Phone
    expect(isPhoneOrTabletSize(mockWindow({ width: 768 }))).toBe(true); // Tablet portrait
    expect(isPhoneOrTabletSize(mockWindow({ width: 1024 }))).toBe(true); // Tablet landscape
    expect(isPhoneOrTabletSize(mockWindow({ width: 1280 }))).toBe(false); // Desktop
    expect(isPhoneOrTabletSize(mockWindow({ width: 1920 }))).toBe(false); // Large Desktop
  });

  it('detects standalone mode via media query, iOS standalone, native APK UA, or ?app=1', () => {
    expect(isStandaloneApp(mockWindow({ width: 390, standalone: false }))).toBe(false);
    expect(isStandaloneApp(mockWindow({ width: 390, standalone: true }))).toBe(true);
    expect(isStandaloneApp(mockWindow({ width: 768, iosStandalone: true }))).toBe(true);
    expect(
      isStandaloneApp(
        mockWindow({
          width: 412,
          userAgent: 'Mozilla/5.0 (Linux; Android 14) WishPixTeacherApp/1.0 (Standalone)',
        })
      )
    ).toBe(true);

    const winWithAppParam = mockWindow({ width: 390, search: '?app=1' });
    expect(isStandaloneApp(winWithAppParam)).toBe(true);
    expect(winWithAppParam.sessionStorage.getItem(INSTALLED_APP_SESSION_KEY)).toBe('1');
  });

  it('detects client platform and constructs installer download hrefs', () => {
    expect(detectClientPlatform(mockWindow({ width: 390, userAgent: 'Mozilla/5.0 (Linux; Android 14)' }))).toBe('android');
    expect(detectClientPlatform(mockWindow({ width: 390, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' }))).toBe('ios');
    expect(detectClientPlatform(mockWindow({ width: 1440, platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }))).toBe('windows');
    expect(getDownloadHref('android')).toBe('/api/teacher-app/download?platform=android');
    expect(getDownloadHref('windows')).toBe('/api/teacher-app/download?platform=windows');
    expect(getDownloadHref('ios')).toBe('/api/teacher-app/download?platform=ios');
  });

  it('only prompts to download on phone/tablet in browser when not dismissed', () => {
    expect(
      shouldShowInstallPrompt({ isMobileOrTablet: true, isStandalone: false, dismissed: false })
    ).toBe(true);
    expect(
      shouldShowInstallPrompt({ isMobileOrTablet: false, isStandalone: false, dismissed: false })
    ).toBe(false);
    expect(
      shouldShowInstallPrompt({ isMobileOrTablet: true, isStandalone: true, dismissed: false })
    ).toBe(false);
    expect(
      shouldShowInstallPrompt({ isMobileOrTablet: true, isStandalone: false, dismissed: true })
    ).toBe(false);
  });

  it('serves real Android .apk, Windows .exe, and iOS .mobileconfig installer files with /teacher/login?app=1', async () => {
    expect(resolveInstallerPlatform(null, 'Mozilla/5.0 (Linux; Android 14)')).toBe('android');
    expect(resolveInstallerPlatform(null, 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('ios');
    expect(resolveInstallerPlatform(null, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');

    const apkRes = await downloadInstaller(
      new Request('http://192.168.1.50:3000/api/teacher-app/download?platform=android')
    );
    expect(apkRes.status).toBe(200);
    expect(apkRes.headers.get('content-type')).toBe('application/vnd.android.package-archive');
    expect(apkRes.headers.get('content-disposition')).toContain('WishPix-Teacher.apk');
    const apkBytes = new Uint8Array(await apkRes.arrayBuffer());
    // APK is a ZIP archive starting with 'PK' (0x50, 0x4b)
    expect(apkBytes.byteLength).toBeGreaterThan(10_000);
    expect(apkBytes[0]).toBe(0x50);
    expect(apkBytes[1]).toBe(0x4b);

    const exeRes = await downloadInstaller(
      new Request('http://192.168.1.50:3000/api/teacher-app/download?platform=windows')
    );
    expect(exeRes.status).toBe(200);
    expect(exeRes.headers.get('content-disposition')).toContain('WishPix-Teacher-Setup.exe');
    const exeBytes = Buffer.from(await exeRes.arrayBuffer());
    // Windows PE executable starts with 'MZ' (0x4d, 0x5a) and ends with origin trailer
    expect(exeBytes.byteLength).toBeGreaterThan(10_000);
    expect(exeBytes[0]).toBe(0x4d);
    expect(exeBytes[1]).toBe(0x5a);
    expect(exeBytes.toString('ascii', exeBytes.length - 64)).toContain('<<WISHPIX_ORIGIN:http://192.168.1.50:3000>>');

    const iosRes = await downloadInstaller(
      new Request('http://192.168.1.50:3000/api/teacher-app/download?platform=ios')
    );
    expect(iosRes.status).toBe(200);
    expect(iosRes.headers.get('content-disposition')).toContain('WishPix-Teacher.mobileconfig');
    const iosText = await iosRes.text();
    expect(iosText).toContain('http://192.168.1.50:3000/teacher/login?app=1');
    expect(iosText).toContain('<key>FullScreen</key>');
  });
});
