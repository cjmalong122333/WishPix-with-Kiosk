import { createContext, useContext, useEffect, useMemo } from 'react'
import { LANG_KEY, makeT, storedLang } from './core.js'

const LangContext = createContext('en')

// lang: 'en' | 'fil', or null while still unknown (then the last one used).
export function LangProvider({ lang, children }) {
  const value = lang === 'fil' || lang === 'en' ? lang : storedLang()
  useEffect(() => {
    document.documentElement.lang = value === 'fil' ? 'fil' : 'en'
    try {
      localStorage.setItem(LANG_KEY, value)
    } catch {
      // Private windows may block storage; the language still works this visit.
    }
  }, [value])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

// t() for the current language (see core.js).
export function useT() {
  const lang = useContext(LangContext)
  return useMemo(() => makeT(lang), [lang])
}
