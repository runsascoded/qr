/// <reference types="@cloudflare/workers-types" />
import QRCode from 'qrcode'
import { ImageResponse } from 'workers-og'

// On-the-fly 1200×630 OpenGraph image: the QR for `?text=…` on the same
// dark card as the static /og.jpg. Referenced by _middleware.ts.
//
// Satori (inside workers-og) requires every element with >1 child to
// declare `display:flex`, and treats inter-tag whitespace as child nodes
// — so the markup below is built whitespace-free with flex on every div.

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

const div = (style: string, inner = '') => `<div style="display:flex;${style}">${inner}</div>`

export const onRequest: PagesFunction = async (ctx) => {
  const text = new URL(ctx.request.url).searchParams.get('text') || 'https://qr.rbw.sh/'
  try {
    const qrSvg = await QRCode.toString(text, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      color: { dark: '#0d1117', light: '#ffffff' },
    })
    const qr = `data:image/svg+xml;base64,${btoa(qrSvg)}`
    const font = await loadFont()

    const left = div('flex-direction:column;flex:1;',
      div('font-size:128px;font-weight:700;letter-spacing:1px;', 'QR')
      + div('width:96px;height:8px;background:#58a6ff;border-radius:4px;margin:24px 0 30px;')
      + div('font-size:30px;color:#8b949e;', 'QR code for')
      + div('font-size:40px;font-weight:700;line-height:1.3;word-break:break-all;', escapeHtml(clip(text, 84))),
    )
    const card = div(
      'background:#fff;border-radius:28px;padding:36px;',
      `<img src="${qr}" width="396" height="396" />`,
    )
    const html = div(
      'width:1200px;height:630px;background:#0d1117;color:#e6edf3;'
      + 'font-family:Inter;align-items:center;gap:72px;padding:0 88px;',
      left + card,
    )

    const rendered = new ImageResponse(html, {
      width: 1200,
      height: 630,
      fonts: [{ name: 'Inter', data: font, weight: 700, style: 'normal' }],
    })
    const png = await rendered.arrayBuffer()
    if (!png.byteLength) throw new Error('ImageResponse produced 0 bytes')
    return new Response(png, {
      headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=300' },
    })
  } catch (e) {
    // A broken render still previews — fall back to the static card.
    console.error('og render failed', e)
    return Response.redirect(new URL('/og.jpg', ctx.request.url).href, 302)
  }
}
