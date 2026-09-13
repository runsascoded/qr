import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',  // relative paths: works at both the GHP subpath and the qr.rbw.sh root
  plugins: [react()],
  server: {
    port: 3017,
    host: true,
    // Accept any Host header. The dev server is only exposed on a trusted
    // tailnet, and I reach it by bare MagicDNS name (`m3`), which is the
    // machine's Tailscale device name — independent of `os.hostname()` and not
    // matched by a `.rbw.sh` wildcard — so no allowlist can cover it. This
    // disables Vite's DNS-rebinding check, fine for a personal dev server.
    allowedHosts: true,
  },
})
