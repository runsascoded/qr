/// <reference types="@cloudflare/workers-types" />
import QRCode from 'qrcode'
import { ImageResponse } from 'workers-og'

// On-the-fly 1200×630 OpenGraph image: the QR for `?text=…` on the same
// dark card as the static /og.jpg. Referenced by _middleware.ts.

const clip = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

// Inter 700, fetched once per isolate (Satori needs a real font).
let fontPromise: Promise<ArrayBuffer> | null = null
function loadFont(): Promise<ArrayBuffer> {
  if (!fontPromise) {
    fontPromise = fetch(
      'https://cdn.jsdelivr.net/npm/@fontsource/inter@5/files/inter-latin-700-normal.woff',
    ).then(r => r.arrayBuffer())
  }
  return fontPromise
}

export const onRequest: PagesFunction = async (ctx) => {
  const text = new URL(ctx.request.url).searchParams.get('text') || 'https://qr.rbw.sh/'

  const qrSvg = await QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: { dark: '#0d1117', light: '#ffffff' },
  })
  const qr = `data:image/svg+xml;base64,${btoa(qrSvg)}`

  const html = `
<div style="display:flex;width:1200px;height:630px;background:#0d1117;color:#e6edf3;font-family:Inter;align-items:center;gap:72px;padding:0 88px;">
  <div style="display:flex;flex-direction:column;flex:1;">
    <div style="font-size:128px;font-weight:700;letter-spacing:1px;">QR</div>
    <div style="display:flex;width:96px;height:8px;background:#58a6ff;border-radius:4px;margin:24px 0 30px;"></div>
    <div style="font-size:30px;color:#8b949e;">QR code for</div>
    <div style="font-size:40px;font-weight:700;line-height:1.25;margin-top:6px;">${escapeHtml(clip(text, 84))}</div>
  </div>
  <div style="display:flex;background:#fff;border-radius:28px;padding:36px;">
    <img src="${qr}" width="396" height="396" />
  </div>
</div>`

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    fonts: [{ name: 'Inter', data: await loadFont(), weight: 700, style: 'normal' }],
  })
}
