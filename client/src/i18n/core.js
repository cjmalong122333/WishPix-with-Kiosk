import fil from './fil.js'

// English / Filipino. The English text is the key and fil.js holds its
// Filipino; anything missing from fil.js shows in English, so nothing ever
// goes blank. The language is one setting for the Teacher App, the kiosk and
// the child phone (Settings page).

export const LANG_KEY = 'wp_lang'

export function storedLang() {
  try {
    return localStorage.getItem(LANG_KEY) === 'fil' ? 'fil' : 'en'
  } catch {
    return 'en'
  }
}

export function translate(lang, text, vars) {
  let s = lang === 'fil' ? (fil[text] ?? text) : text
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
  return s
}

// Messages from the server that carry a value inside them.
const ERROR_PATTERNS = [
  [/^(.+)\. Fix the printer first\.$/, '{problem}. Fix the printer first.', (m, t) => ({ problem: t(m[1]) })],
]

// t('Text', { vars }) in one language. t.lang, t.locale for dates and
// numbers, and t.error(message) for messages that came from the server.
export function makeT(lang) {
  const t = (text, vars) => translate(lang, text, vars)
  t.lang = lang
  t.locale = lang === 'fil' ? 'fil-PH' : 'en-PH'
  t.error = (message) => {
    for (const [re, key, vars] of ERROR_PATTERNS) {
      const m = String(message).match(re)
      if (m) return t(key, vars(m, t))
    }
    return t(message)
  }
  return t
}
