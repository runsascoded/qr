import { hostname } from 'node:os'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Hostnames the dev server accepts: any explicit VITE_ALLOWED_HOSTS (e.g.
// `.rbw.sh` to allow tailnet FQDNs), plus this machine's own hostname and its
// bare label — so a bare tailnet name like `m3` (MagicDNS short name, sent as
// `Host: m3`) isn't blocked by Vite's allowedHosts DNS-rebinding check.
const host = hostname()
const allowedHosts = [...new Set([
  ...(process.env.VITE_ALLOWED_HOSTS?.split(',').map(s => s.trim()).filter(Boolean) ?? []),
  host,
  host.split('.')[0],
])]

export default defineConfig({
  base: './',  // relative paths: works at both the GHP subpath and the qr.rbw.sh root
  plugins: [react()],
  server: {
    port: 3017,
    host: true,
    allowedHosts,
  },
})
