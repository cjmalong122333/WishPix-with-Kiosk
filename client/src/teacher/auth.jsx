import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, useLive } from '../lib/live.js'
import { LangProvider } from '../i18n/index.jsx'

const TOKEN_KEY = 'wp_token'
const TEACHER_KEY = 'wp_teacher'
export const IDLE_KEY = 'wp_idle_signout' // tells the login page why the teacher was signed out

const AuthContext = createContext(null)

// Holds the teacher's login and the live kiosk connection for every page,
// and applies the shared settings: language, theme color and auto sign-out.
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY))
  const [teacher, setTeacher] = useState(() => JSON.parse(sessionStorage.getItem(TEACHER_KEY) ?? 'null'))
  const [publicLang, setPublicLang] = useState(null)
  const live = useLive('teacher', token)
  const prefs = live.state?.prefs

  // Before sign-in there is no live state, so ask for the language directly.
  useEffect(() => {
    api('/api/prefs').then((p) => setPublicLang(p.language)).catch(() => {})
  }, [token])

  const signIn = useCallback(async (username, password) => {
    const res = await api('/api/login', { method: 'POST', body: { username, password } })
    sessionStorage.setItem(TOKEN_KEY, res.token)
    sessionStorage.setItem(TEACHER_KEY, JSON.stringify(res.teacher))
    sessionStorage.removeItem(IDLE_KEY)
    setToken(res.token)
    setTeacher(res.teacher)
  }, [])

  const signOut = useCallback(() => {
    if (token) api('/api/logout', { token, method: 'POST' }).catch(() => {})
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(TEACHER_KEY)
    setToken(null)
    setTeacher(null)
  }, [token])

  const updateTeacher = useCallback((next) => {
    sessionStorage.setItem(TEACHER_KEY, JSON.stringify(next))
    setTeacher(next)
  }, [])

  // API call that signs the teacher out when the login has expired
  // (for example after the server restarted).
  const call = useCallback(
    async (path, opts = {}) => {
      try {
        return await api(path, { ...opts, token })
      } catch (err) {
        if (/sign in again/i.test(err.message)) signOut()
        throw err
      }
    },
    [token, signOut]
  )

  useAutoSignOut(token && prefs?.autoLogout ? prefs.autoLogoutMinutes : null, signOut)

  // Theme color for the Teacher App only; the kiosk keeps its own colors.
  useEffect(() => {
    document.documentElement.dataset.theme = prefs?.themeColor ?? 'deep_blue'
  }, [prefs?.themeColor])

  const value = useMemo(
    () => ({ token, teacher, signIn, signOut, call, live, updateTeacher }),
    [token, teacher, signIn, signOut, call, live, updateTeacher]
  )
  return (
    <AuthContext.Provider value={value}>
      <LangProvider lang={prefs?.language ?? publicLang}>{children}</LangProvider>
    </AuthContext.Provider>
  )
}

// Signs the teacher out after `minutes` without a tap, click, key or scroll.
function useAutoSignOut(minutes, signOut) {
  useEffect(() => {
    if (!minutes) return
    let timer
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        sessionStorage.setItem(IDLE_KEY, String(minutes))
        signOut()
      }, minutes * 60_000)
    }
    const events = ['pointerdown', 'keydown', 'scroll', 'wheel']
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [minutes, signOut])
}

export const useAuth = () => useContext(AuthContext)
