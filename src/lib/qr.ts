import { createQR, renderSvg, type ECL, type RenderOpts } from './render'

export type { ECL, RenderOpts }

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

export function getQRInfo(text: string, ecl: ECL, version = 0): QRInfo | null {
  if (!text) return null
  try {
    const qr = createQR(text, ecl, version)
    const segs = (qr as unknown as { segments: Array<{ data: { length?: number }; mode?: { id?: string } }> }).segments
    const mode = segs.length === 1 ? segmentMode(segs[0]) : 'mixed'
    const dataBits = segs.reduce((n, s) => n + (s.data?.length ?? 0) * 8, 0)
    return { version: qr.version, modules: qr.modules.size, mode, dataBits }
  } catch {
    return null
  }
}

export { renderSvg }

// Rasterize our SVG at its declared pixel size (browser only).
export async function renderPng(o: RenderOpts): Promise<Blob> {
  const svg = renderSvg(o)
  const url = URL.createObjectURL(svgToBlob(svg))
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('SVG rasterization failed'))
      i.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    ctx.drawImage(img, 0, 0)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas.toBlob failed')), 'image/png'),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
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
