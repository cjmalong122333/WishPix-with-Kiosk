'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, X } from 'lucide-react';
import { useT } from '@/i18n';
import { LogoMark } from '@/components/logo';

export const INSTALL_DISMISS_KEY = 'wp_install_dismissed';
export const INSTALLED_APP_SESSION_KEY = 'wp_installed_app';
export const PHONE_TABLET_MEDIA_QUERY = '(max-width: 1024px)';
export const STANDALONE_MEDIA_QUERY = '(display-mode: standalone)';

export type ClientPlatform = 'android' | 'ios' | 'windows';

export function getDownloadHref(platform: ClientPlatform): string {
  return `/api/teacher-app/download?platform=${platform}`;
}

export function detectClientPlatform(
  win: Window | undefined = typeof window !== 'undefined' ? window : undefined
): ClientPlatform {
  if (!win) return 'android';
  const ua = win.navigator?.userAgent || '';
  const platform = win.navigator?.platform || '';
  const maxTouchPoints = win.navigator?.maxTouchPoints || 0;

  if (/iPad|iPhone|iPod/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Android/i.test(ua)) {
    return 'android';
  }
  if (isPhoneOrTabletSize(win)) {
    return 'android';
  }
  if (/Win/i.test(platform) || /Windows/i.test(ua)) {
    return 'windows';
  }
  return 'android';
}

export function isStandaloneApp(
  win: Window | undefined = typeof window !== 'undefined' ? window : undefined
): boolean {
  if (!win) return false;
  const standaloneMedia = win.matchMedia?.(STANDALONE_MEDIA_QUERY)?.matches ?? false;
  const iosStandalone = Boolean((win.navigator as Navigator & { standalone?: boolean })?.standalone);
  const ua = win.navigator?.userAgent || '';
  const nativeWrapper = /WishPixTeacherApp/i.test(ua);

  let queryApp = false;
  try {
    const search = win.location?.search || '';
    if (search) {
      const params = new URLSearchParams(search);
      queryApp = params.get('app') === '1';
    }
  } catch {
    // Ignore URL parsing errors
  }

  let sessionApp = false;
  try {
    if (standaloneMedia || iosStandalone || nativeWrapper || queryApp) {
      win.sessionStorage?.setItem(INSTALLED_APP_SESSION_KEY, '1');
      return true;
    }
    sessionApp = win.sessionStorage?.getItem(INSTALLED_APP_SESSION_KEY) === '1';
  } catch {
    // Ignore storage access errors
  }

  return standaloneMedia || iosStandalone || nativeWrapper || queryApp || sessionApp;
}

export function isPhoneOrTabletSize(
  win: Window | undefined = typeof window !== 'undefined' ? window : undefined
): boolean {
  if (!win) return false;
  if (typeof win.matchMedia === 'function') {
    return win.matchMedia(PHONE_TABLET_MEDIA_QUERY).matches;
  }
  return win.innerWidth <= 1024;
}

export function shouldShowInstallPrompt(opts: {
  isMobileOrTablet: boolean;
  isStandalone: boolean;
  dismissed: boolean;
}): boolean {
  return opts.isMobileOrTablet && !opts.isStandalone && !opts.dismissed;
}

function subscribeWindowMedia(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const sizeMql = window.matchMedia(PHONE_TABLET_MEDIA_QUERY);
  const standaloneMql = window.matchMedia(STANDALONE_MEDIA_QUERY);
  sizeMql.addEventListener?.('change', onStoreChange);
  standaloneMql.addEventListener?.('change', onStoreChange);
  window.addEventListener('resize', onStoreChange);
  window.addEventListener('appinstalled', onStoreChange);
  return () => {
    sizeMql.removeEventListener?.('change', onStoreChange);
    standaloneMql.removeEventListener?.('change', onStoreChange);
    window.removeEventListener('resize', onStoreChange);
    window.removeEventListener('appinstalled', onStoreChange);
  };
}

export function InstallAppPrompt() {
  const t = useT();
  const isMobileOrTablet = useSyncExternalStore(
    subscribeWindowMedia,
    () => isPhoneOrTabletSize(window),
    () => false
  );
  const isStandalone = useSyncExternalStore(
    subscribeWindowMedia,
    () => isStandaloneApp(window),
    () => false
  );
  const platform = useSyncExternalStore(
    subscribeWindowMedia,
    () => detectClientPlatform(window),
    (): ClientPlatform => 'android'
  );
  const storedDismissed = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return sessionStorage.getItem(INSTALL_DISMISS_KEY) === '1';
      } catch {
        return false;
      }
    },
    () => false
  );

  const [manualDismissed, setManualDismissed] = useState(false);
  const [downloadedPlatform, setDownloadedPlatform] = useState<ClientPlatform | null>(null);
  const dismissed = storedDismissed || manualDismissed;

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  if (!shouldShowInstallPrompt({ isMobileOrTablet, isStandalone, dismissed })) {
    return null;
  }

  function handleDismiss() {
    setManualDismissed(true);
    try {
      sessionStorage.setItem(INSTALL_DISMISS_KEY, '1');
    } catch {
      // Ignore storage access errors
    }
  }

  function triggerInstallerDownload(targetPlatform: ClientPlatform) {
    setDownloadedPlatform(targetPlatform);
    const link = document.createElement('a');
    link.href = getDownloadHref(targetPlatform);
    link.setAttribute('download', '');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <aside
      role="dialog"
      aria-label={t('Download WishPix Teacher App')}
      className="no-print fixed inset-x-[16px] bottom-[16px] z-50 mx-auto max-w-[420px] rounded-[20px] border border-[#ebe4f7] bg-white p-[16px] font-teacher text-[#302344] shadow-[0_12px_32px_rgba(48,35,68,0.18)]"
    >
      <div className="flex items-start gap-[12px]">
        <LogoMark size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-[8px]">
            <b className="block text-[16px] leading-[1.25] font-extrabold text-[#302344]">
              {t('Download WishPix Teacher App')}
            </b>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label={t('Close')}
              className="-mt-[2px] -mr-[4px] rounded-[8px] border-0 bg-transparent p-[4px] text-[#756b86] hover:text-[#302344]"
            >
              <X size={18} />
            </button>
          </div>
          <p className="mt-[4px] mb-0 text-[13px] leading-[1.4] font-medium text-[#756b86]">
            {t('Would you like to download the WishPix Teacher App for quick access on this device?')}
          </p>
        </div>
      </div>

      {downloadedPlatform && (
        <p
          role="status"
          className="mt-[12px] mb-0 rounded-[12px] bg-[#eee6fc] px-[12px] py-[10px] text-[13px] leading-[1.4] font-semibold text-[#7950d5]"
        >
          {downloadedPlatform === 'ios'
            ? t('Downloading WishPix-Teacher.mobileconfig… Open the downloaded profile in Settings to install the app.')
            : downloadedPlatform === 'windows'
              ? t('Downloading WishPix-Teacher-Setup.exe… Open the downloaded file to install the app.')
              : t('Downloading WishPix-Teacher.apk… Open the downloaded file to install the app.')}
        </p>
      )}

      <div className="mt-[12px] flex flex-wrap items-center gap-[6px] text-[12px] font-bold text-[#756b86]">
        <span>{t('Installer file:')}</span>
        <a
          href={getDownloadHref('android')}
          download="WishPix-Teacher.apk"
          onClick={() => setDownloadedPlatform('android')}
          className="rounded-full bg-[#f8f6ff] px-[10px] py-[3px] text-[#7950d5] no-underline hover:bg-[#eee6fc]"
        >
          Android (.apk)
        </a>
        <a
          href={getDownloadHref('windows')}
          download="WishPix-Teacher-Setup.exe"
          onClick={() => setDownloadedPlatform('windows')}
          className="rounded-full bg-[#f8f6ff] px-[10px] py-[3px] text-[#7950d5] no-underline hover:bg-[#eee6fc]"
        >
          Windows (.exe)
        </a>
        <a
          href={getDownloadHref('ios')}
          download="WishPix-Teacher.mobileconfig"
          onClick={() => setDownloadedPlatform('ios')}
          className="rounded-full bg-[#f8f6ff] px-[10px] py-[3px] text-[#7950d5] no-underline hover:bg-[#eee6fc]"
        >
          iOS (.mobileconfig)
        </a>
      </div>

      <div className="mt-[14px] flex items-center justify-end gap-[8px]">
        <button
          type="button"
          onClick={handleDismiss}
          className="h-[38px] rounded-full border border-[#ebe4f7] bg-white px-[16px] text-[13px] font-extrabold text-[#756b86] transition-colors hover:bg-[#f8f6ff] hover:text-[#302344]"
        >
          {t('Not now')}
        </button>
        <button
          type="button"
          onClick={() => triggerInstallerDownload(platform)}
          className="inline-flex h-[38px] items-center gap-[6px] rounded-full border-0 bg-[#7950d5] px-[18px] text-[13px] font-extrabold text-white transition-opacity hover:opacity-95"
        >
          <Download size={15} />
          {t('Download app')}
        </button>
      </div>
    </aside>
  );
}
