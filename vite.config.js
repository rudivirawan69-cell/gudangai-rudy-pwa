import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  base: process.env.GITHUB_ACTIONS === 'true' ? '/gudangai-rudy-pwa/' : '/',
  server: { host: true, port: 5173 },
}))
