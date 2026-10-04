import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendPort = process.env.BACKEND_PORT || '8080'
const backendTarget = `http://localhost:${backendPort}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 38942,
    fs: {
      allow: ['..']
    },
    proxy: {
      '/api': { target: backendTarget, changeOrigin: true },
      '/meta': { target: backendTarget, changeOrigin: true },
      '/scenarios': { target: backendTarget, changeOrigin: true },
      '^/(bgimage|bgm|sound|evimage|fgimage|voice|image|rule|video|thum|sysscn|system)': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
