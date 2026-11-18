import { describe, expect, it } from 'vitest';
import manifest from '@/app/manifest';
import {
  isPhoneOrTabletSize,
  isStandaloneApp,
  PHONE_TABLET_MEDIA_QUERY,
  shouldShowInstallPrompt,
  STANDALONE_MEDIA_QUERY,
} from './install-prompt';

function mockWindow(opts: { width: number; standalone?: boolean; iosStandalone?: boolean }): Window {
  return {
    innerWidth: opts.width,
    navigator: { standalone: opts.iosStandalone ?? false },
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

describe('Teacher PWA manifest & install prompt logic', () => {
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

  it('detects standalone mode via media query or iOS navigator.standalone', () => {
    expect(isStandaloneApp(mockWindow({ width: 390, standalone: false }))).toBe(false);
    expect(isStandaloneApp(mockWindow({ width: 390, standalone: true }))).toBe(true);
    expect(isStandaloneApp(mockWindow({ width: 768, iosStandalone: true }))).toBe(true);
  });

  it('only prompts to download on phone/tablet in browser when not dismissed', () => {
    // Phone in browser -> ask
    expect(
      shouldShowInstallPrompt({ isMobileOrTablet: true, isStandalone: false, dismissed: false })
    ).toBe(true);
    // Desktop in browser -> do not ask
    expect(
      shouldShowInstallPrompt({ isMobileOrTablet: false, isStandalone: false, dismissed: false })
    ).toBe(false);
    // Phone in installed app -> do not ask
    expect(
      shouldShowInstallPrompt({ isMobileOrTablet: true, isStandalone: true, dismissed: false })
    ).toBe(false);
    // Phone in browser after dismissing -> do not ask
    expect(
      shouldShowInstallPrompt({ isMobileOrTablet: true, isStandalone: false, dismissed: true })
    ).toBe(false);
  });
});
