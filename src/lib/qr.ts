import QRCode from 'qrcode'
import QRCodeStyling, { type DotType } from 'qr-code-styling'

export type Lib = 'minimal' | 'styled'
export type ECL = 'L' | 'M' | 'Q' | 'H'

export type EncodeOpts = {
  text: string
  ecl: ECL
  margin: number   // in modules
  scale: number    // px per module
  fg: string       // #rrggbb
  bg: string       // #rrggbb
}

export type StyledOpts = EncodeOpts & {
  dotType: DotType  // 'square' | 'dots' | 'rounded' | 'classy' | 'classy-rounded' | 'extra-rounded'
}

export type QRInfo = {
  version: number       // 1-40
  modules: number       // NxN
  mode: string          // 'numeric' | 'alphanumeric' | 'byte' | 'kanji' | 'mixed'
  dataBits: number
}

function segmentMode(seg: { mode?: { id?: string }; segments?: unknown[] }): string {
  if (Array.isArray(seg.segments)) return 'mixed'
  return seg.mode?.id ?? 'unknown'
}

export function getQRInfo(text: string, ecl: ECL): QRInfo | null {
  if (!text) return null
  try {
    // QRCode.create returns { version, modules: { size }, segments }
    const qr = QRCode.create(text, { errorCorrectionLevel: ecl })
    const segs = (qr as unknown as { segments: Array<{ data: { length?: number }; mode?: { id?: string } }> }).segments
    const mode = segs.length === 1 ? segmentMode(segs[0]) : 'mixed'
    const dataBits = segs.reduce((n, s) => n + (s.data?.length ?? 0) * 8, 0)
    return { version: qr.version, modules: qr.modules.size, mode, dataBits }
  } catch {
    return null
  }
}

// ────── minimal (node-qrcode) ──────

const minimalOpts = (o: EncodeOpts) => ({
  errorCorrectionLevel: o.ecl,
  margin: o.margin,
  scale: o.scale,
  color: { dark: o.fg, light: o.bg },
})

export async function renderMinimalSvg(o: EncodeOpts): Promise<string> {
  return QRCode.toString(o.text, { type: 'svg', ...minimalOpts(o) })
}

export async function renderMinimalPng(o: EncodeOpts): Promise<Blob> {
  // toBuffer is node-only; use canvas in the browser
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, o.text, minimalOpts(o))
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas.toBlob failed')), 'image/png'),
  )
}

// ────── styled (qr-code-styling) ──────

function styledInstance(o: StyledOpts) {
  const info = getQRInfo(o.text, o.ecl)
  // qr-code-styling sizes in pixels (incl. margin). Match minimal's `scale` semantics:
  // total px = (modules + 2*margin) * scale.
  const modules = info?.modules ?? 21
  const px = (modules + 2 * o.margin) * o.scale
  return new QRCodeStyling({
    width: px,
    height: px,
    data: o.text,
    margin: o.margin * o.scale,
    qrOptions: { errorCorrectionLevel: o.ecl },
    dotsOptions: { color: o.fg, type: o.dotType },
    backgroundOptions: { color: o.bg },
    cornersSquareOptions: { color: o.fg, type: o.dotType === 'square' ? 'square' : 'extra-rounded' },
    cornersDotOptions: { color: o.fg, type: o.dotType === 'square' ? 'square' : 'dot' },
  })
}

export async function renderStyledSvg(o: StyledOpts): Promise<string> {
  const qr = styledInstance(o)
  const out = await qr.getRawData('svg')
  if (!(out instanceof Blob)) throw new Error('styled SVG render failed')
  return await out.text()
}

export async function renderStyledPng(o: StyledOpts): Promise<Blob> {
  const qr = styledInstance(o)
  const out = await qr.getRawData('png')
  if (!(out instanceof Blob)) throw new Error('styled PNG render failed')
  return out
}

// ────── utilities ──────

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function svgToBlob(svg: string): Blob {
  return new Blob([svg], { type: 'image/svg+xml' })
}

export function slugify(text: string): string {
  try {
    const u = new URL(text)
    const seg = u.pathname.split('/').filter(Boolean).pop() || u.hostname
    return seg.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'qr'
  } catch {
    return text.slice(0, 32).replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'qr'
  }
}
