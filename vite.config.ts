import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const allowedHosts = process.env.VITE_ALLOWED_HOSTS?.split(',') ?? []

export default defineConfig({
  base: './',  // relative paths: works at both the GHP subpath and the qr.rbw.sh root
  plugins: [react()],
  server: {
    port: 3017,
    host: true,
    allowedHosts,
  },
})
