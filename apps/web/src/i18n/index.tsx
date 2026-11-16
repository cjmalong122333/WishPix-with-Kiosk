'use client';

import i18next, { type TOptions } from 'i18next';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { initReactI18next, useTranslation } from 'react-i18next';
import fil from './fil';

// English / Filipino with i18next. The English text is the key and fil.ts
// holds its Filipino; anything missing shows in English, so nothing ever
// goes blank. The language is one setting for the Teacher App and the kiosk
// (Settings page). Placeholders look like {n}.

if (!i18next.isInitialized) {
  void i18next.use(initReactI18next).init({
    resources: { en: { translation: {} }, fil: { translation: fil } },
    lng: 'en',
    fallbackLng: 'en',
    keySeparator: false,
    nsSeparator: false,
    returnEmptyString: false,
    interpolation: { prefix: '{', suffix: '}', escapeValue: false },
    react: { useSuspense: false },
  });
} else {
  // Development: fil.ts was edited and reloaded, but i18next (one copy for the
  // whole server) is already set up. Use the new Filipino, or the server keeps
  // rendering new texts in English until it restarts.
  i18next.addResourceBundle('fil', 'translation', fil, true, true);
}

export type Lang = 'en' | 'fil';
export const LANG_KEY = 'wp_lang';

function storedLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'fil' ? 'fil' : 'en';
  } catch {
    return 'en';
  }
}

const LangContext = createContext<Lang>('en');
const noSubscribe = () => () => {};

// lang: 'en' | 'fil', or null while still unknown (then the last one used).
export function LangProvider({ lang, children }: { lang?: string | null; children: React.ReactNode }) {
  // The server renders English; the browser then uses the saved language.
  const stored = useSyncExternalStore(noSubscribe, storedLang, () => 'en' as Lang);
  const value: Lang = lang === 'fil' || lang === 'en' ? lang : stored;
  useEffect(() => {
    document.documentElement.lang = value === 'fil' ? 'fil' : 'en';
    try {
      localStorage.setItem(LANG_KEY, value);
    } catch {
      // Private windows may block storage; the language still works this visit.
    }
  }, [value]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

// Messages from the server that carry a value inside them.
const ERROR_PATTERNS: [RegExp, string, (m: RegExpMatchArray, t: T) => Record<string, string>][] = [
  [/^(.+)\. Fix the printer first\.$/, '{problem}. Fix the printer first.', (m, t) => ({ problem: t(m[1]) })],
  [/^The printer did not respond: (.+)$/, 'The printer did not respond: {reason}', (m) => ({ reason: m[1] })],
];

export type T = ((text: string, vars?: Record<string, string | number>) => string) & {
  lang: Lang;
  locale: string;
  error: (message: string) => string;
};

export function makeT(lang: Lang): T {
  const t = ((text: string, vars?: Record<string, string | number>) =>
    i18next.t(text, { lng: lang, defaultValue: text, ...(vars as TOptions) }) as string) as T;
  t.lang = lang;
  t.locale = lang === 'fil' ? 'fil-PH' : 'en-PH';
  t.error = (message: string) => {
    for (const [re, key, vars] of ERROR_PATTERNS) {
      const m = String(message).match(re);
      if (m) return t(key, vars(m, t));
    }
    return t(message);
  };
  return t;
}

// t() for the current language.
export function useT(): T {
  const lang = useContext(LangContext);
  useTranslation(); // re-render when i18next finishes loading
  return useMemo(() => makeT(lang), [lang]);
}
