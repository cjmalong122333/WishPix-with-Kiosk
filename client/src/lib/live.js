import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

// Opens the live connection to the laptop server and keeps the latest state.
// role: 'kiosk' | 'teacher' | 'child'; token: login token or QR join token.
export function useLive(role, token) {
  const [state, setState] = useState(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(null)
  const socketRef = useRef(null)

  useEffect(() => {
    if (role !== 'kiosk' && !token) return
    const socket = io({ auth: { role, token } })
    socketRef.current = socket
    socket.on('connect', () => { setConnected(true); setError(null) })
    socket.on('disconnect', (reason) => {
      setConnected(false)
      // The server only drops children itself when the session ends.
      if (reason === 'io server disconnect' && role === 'child') setError('This activity has ended. Scan the kiosk again to play.')
    })
    socket.on('connect_error', (err) => setError(err.message))
    socket.on('state', setState)
    return () => socket.disconnect()
  }, [role, token])

  return { state, connected, error, socket: socketRef }
}

export async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}
