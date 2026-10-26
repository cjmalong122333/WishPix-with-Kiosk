import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { api, useLive } from '../lib/live.js'

const TOKEN_KEY = 'wp_token'
const TEACHER_KEY = 'wp_teacher'

const AuthContext = createContext(null)

// Holds the teacher's login and the live kiosk connection for every page.
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY))
  const [teacher, setTeacher] = useState(() => JSON.parse(sessionStorage.getItem(TEACHER_KEY) ?? 'null'))
  const live = useLive('teacher', token)

  const signIn = useCallback(async (username, password) => {
    const res = await api('/api/login', { method: 'POST', body: { username, password } })
    sessionStorage.setItem(TOKEN_KEY, res.token)
    sessionStorage.setItem(TEACHER_KEY, JSON.stringify(res.teacher))
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

  const value = useMemo(
    () => ({ token, teacher, signIn, signOut, call, live }),
    [token, teacher, signIn, signOut, call, live]
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
