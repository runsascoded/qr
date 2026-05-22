/// <reference types="@cloudflare/workers-types" />
import QRCode from 'qrcode'
import { ImageResponse } from 'workers-og'

// On-the-fly 1200×630 OpenGraph image: the QR for `?t=…` on the same
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

const ECLS = ['L', 'M', 'Q', 'H']

export const onRequest: PagesFunction = async (ctx) => {
  const params = new URL(ctx.request.url).searchParams
  const text = params.get('t') || 'https://qr.rbw.sh/'
  try {
    // Mirror the app's encode options so the preview matches the page.
    const eclRaw = params.get('ecl') ?? ''
    const ecl = (ECLS.includes(eclRaw) ? eclRaw : 'L') as 'L' | 'M' | 'Q' | 'H'
    const mRaw = params.get('m')
    const margin = mRaw && Number.isFinite(+mRaw) ? Math.min(20, Math.max(0, Math.trunc(+mRaw))) : 1
    const qrText = params.has('u') ? text.toUpperCase() : text

    const qrSvg = await QRCode.toString(qrText, {
      type: 'svg',
      errorCorrectionLevel: ecl,
      margin,
      color: { dark: '#0d1117', light: '#ffffff' },
    })
    const qr = `data:image/svg+xml;base64,${btoa(qrSvg)}`
    const font = await loadFont()

    const display = text.replace(/^https?:\/\//i, '')
    const left = div(
      'flex-direction:column;flex:1;justify-content:center;',
      div('font-size:28px;font-weight:700;color:#58a6ff;', 'qr.rbw.sh')
      + div('font-size:27px;color:#8b949e;margin:36px 0 12px;', 'QR code for')
      + div('font-size:54px;font-weight:700;line-height:1.2;word-break:break-all;', escapeHtml(clip(display, 60))),
    )
    const card = div(
      'background:#fff;border-radius:26px;padding:18px;',
      `<img src="${qr}" width="500" height="500" />`,
    )
    const html = div(
      'width:1200px;height:630px;background:#0d1117;color:#e6edf3;'
      + 'font-family:Inter;align-items:center;gap:56px;padding:0 64px;',
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
      // The QR for a given set of params never changes — cache hard so
      // reshared links don't re-invoke the renderer (also blunts abuse).
      headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' },
    })
  } catch (e) {
    // A broken render still previews — fall back to the static card.
    console.error('og render failed', e)
    return Response.redirect(new URL('/og.jpg', ctx.request.url).href, 302)
  }
}
