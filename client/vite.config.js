import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const server = 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // reachable from phones on the same Wi-Fi
    port: 5173,
    allowedHosts: true, // allow Cloudflare / ngrok tunnel hostnames
    proxy: {
      // xfwd passes the phone's real address on, so the server can tell
      // the laptop's own kiosk screen apart from phones.
      '/api': { target: server, xfwd: true },
      '/images': server,
      '/socket.io': { target: server, ws: true, xfwd: true },
    },
  },
})
