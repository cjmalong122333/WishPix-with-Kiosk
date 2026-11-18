'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useT } from '@/i18n';
import { LogoMark } from '@/components/logo';

export const INSTALL_DISMISS_KEY = 'wp_install_dismissed';
export const PHONE_TABLET_MEDIA_QUERY = '(max-width: 1024px)';
export const STANDALONE_MEDIA_QUERY = '(display-mode: standalone)';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function isStandaloneApp(win: Window | undefined = typeof window !== 'undefined' ? window : undefined): boolean {
  if (!win) return false;
  const standaloneMedia = win.matchMedia?.(STANDALONE_MEDIA_QUERY)?.matches ?? false;
  const iosStandalone = Boolean((win.navigator as Navigator & { standalone?: boolean })?.standalone);
  return standaloneMedia || iosStandalone;
}

export function isPhoneOrTabletSize(win: Window | undefined = typeof window !== 'undefined' ? window : undefined): boolean {
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

export function InstallAppPrompt() {
  const t = useT();
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    const ua = window.navigator.userAgent || '';
    const iosDevice = /iPad|iPhone|iPod/.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    setIsIos(iosDevice);

    try {
      if (sessionStorage.getItem(INSTALL_DISMISS_KEY) === '1') {
        setDismissed(true);
      }
    } catch {
      // Ignore storage access errors
    }

    const sizeMql = window.matchMedia(PHONE_TABLET_MEDIA_QUERY);
    const standaloneMql = window.matchMedia(STANDALONE_MEDIA_QUERY);

    const updateDeviceState = () => {
      setIsMobileOrTablet(isPhoneOrTabletSize(window));
      setIsStandalone(isStandaloneApp(window));
    };

    updateDeviceState();

    sizeMql.addEventListener?.('change', updateDeviceState);
    standaloneMql.addEventListener?.('change', updateDeviceState);
    window.addEventListener('resize', updateDeviceState);

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      sizeMql.removeEventListener?.('change', updateDeviceState);
      standaloneMql.removeEventListener?.('change', updateDeviceState);
      window.removeEventListener('resize', updateDeviceState);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  if (!shouldShowInstallPrompt({ isMobileOrTablet, isStandalone, dismissed })) {
    return null;
  }

  function handleDismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(INSTALL_DISMISS_KEY, '1');
    } catch {
      // Ignore storage access errors
    }
  }

  async function handleDownload() {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setDeferredPrompt(null);
          setDismissed(true);
        }
      } catch {
        setShowInstructions(true);
      }
      return;
    }
    setShowInstructions(true);
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

      {showInstructions && (
        <p className="mt-[12px] mb-0 rounded-[12px] bg-[#eee6fc] px-[12px] py-[10px] text-[13px] leading-[1.4] font-semibold text-[#7950d5]">
          {isIos
            ? t('Tap the Share button in your browser, then tap “Add to Home Screen”.')
            : t('Open your browser menu (⋮) and tap “Install app” or “Add to Home screen”.')}
        </p>
      )}

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
          onClick={() => void handleDownload()}
          className="inline-flex h-[38px] items-center gap-[6px] rounded-full border-0 bg-[#7950d5] px-[18px] text-[13px] font-extrabold text-white transition-opacity hover:opacity-95"
        >
          <Download size={15} />
          {t('Download app')}
        </button>
      </div>
    </aside>
  );
}
