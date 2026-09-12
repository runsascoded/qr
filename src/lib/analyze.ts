import type { QRCode } from 'jsqr'
import type { ECL } from './qr'

// Recover encode parameters from a decoded QR image: error-correction level
// (from the format-info bits), module/background colors (sampled at the
// finder patterns, whose layout is fixed), and px/module + quiet-zone width
// (from the symbol's pixel footprint). Lets a decoded QR seed the encoder.

export type Analysis = {
  ecl: ECL
  mask: number
  fg: string     // #rrggbb
  bg: string     // #rrggbb
  scale: number  // px per module
  margin: number // quiet zone, in modules
}

type Point = { x: number, y: number }
type Loc = QRCode['location']

// Unit square → quadrilateral (zxing's PerspectiveTransform).
function squareToQuad(p0: Point, p1: Point, p2: Point, p3: Point) {
  const dx3 = p0.x - p1.x + p2.x - p3.x
  const dy3 = p0.y - p1.y + p2.y - p3.y
  let a11, a12, a13, a21, a22, a23
  if (dx3 === 0 && dy3 === 0) {
    a11 = p1.x - p0.x; a21 = p2.x - p1.x
    a12 = p1.y - p0.y; a22 = p2.y - p1.y
    a13 = 0; a23 = 0
  } else {
    const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x
    const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y
    const denom = dx1 * dy2 - dx2 * dy1
    a13 = (dx3 * dy2 - dx2 * dy3) / denom
    a23 = (dx1 * dy3 - dx3 * dy1) / denom
    a11 = p1.x - p0.x + a13 * p1.x; a21 = p3.x - p0.x + a23 * p3.x
    a12 = p1.y - p0.y + a13 * p1.y; a22 = p3.y - p0.y + a23 * p3.y
  }
  const a31 = p0.x, a32 = p0.y
  return (x: number, y: number): Point => {
    const d = a13 * x + a23 * y + 1
    return { x: (a11 * x + a21 * y + a31) / d, y: (a12 * x + a22 * y + a32) / d }
  }
}

type RGB = [number, number, number]

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[s.length >> 1]
}
const medianRGB = (cs: RGB[]): RGB => [0, 1, 2].map(i => median(cs.map(c => c[i]))) as RGB
const hex = (c: RGB): string => `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`
const dist2 = (a: RGB, b: RGB): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// Format info is BCH(15,5)-coded then XORed with 0x5412; the 5 data bits are
// [ecl:2][mask:3]. Rebuild the 32 valid codewords and take the nearest.
const FORMAT_CODES: number[] = Array.from({ length: 32 }, (_, data) => {
  let rem = data << 10
  for (let i = 14; i >= 10; i--) if (rem & (1 << i)) rem ^= 0x537 << (i - 10)
  return ((data << 10) | rem) ^ 0x5412
})
const ECL_BITS: ECL[] = ['M', 'L', 'H', 'Q']
const popcount = (n: number): number => { let c = 0; while (n) { n &= n - 1; c++ } return c }

function decodeFormat(bits: number): { data: number, dist: number } {
  let best = { data: 0, dist: 16 }
  FORMAT_CODES.forEach((code, data) => {
    const d = popcount(code ^ bits)
    if (d < best.dist) best = { data, dist: d }
  })
  return best
}

export function analyze(img: ImageData, loc: Loc, version: number): Analysis {
  const n = 17 + 4 * version
  const map = squareToQuad(loc.topLeftCorner, loc.topRightCorner, loc.bottomRightCorner, loc.bottomLeftCorner)
  // Color at a module's center; (mx, my) in module coords.
  const sample = (mx: number, my: number): RGB => {
    const p = map((mx + 0.5) / n, (my + 0.5) / n)
    const x = clamp(Math.round(p.x), 0, img.width - 1)
    const y = clamp(Math.round(p.y), 0, img.height - 1)
    const i = (y * img.width + x) * 4
    return [img.data[i], img.data[i + 1], img.data[i + 2]]
  }

  // Finder patterns: 7×7, dark outer ring + dark 3×3 core, light ring between.
  const dark: RGB[] = [], light: RGB[] = []
  for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
      const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3))
      ;(ring === 2 ? light : dark).push(sample(ox + dx, oy + dy))
    }
  }
  const fgRGB = medianRGB(dark), bgRGB = medianRGB(light)
  const isDark = (mx: number, my: number): number => {
    const c = sample(mx, my)
    return dist2(c, fgRGB) < dist2(c, bgRGB) ? 1 : 0
  }

  // Both copies of the 15 format bits (zxing's read order, MSB first).
  let f1 = 0
  for (let i = 0; i < 6; i++) f1 = (f1 << 1) | isDark(i, 8)
  f1 = (f1 << 1) | isDark(7, 8)
  f1 = (f1 << 1) | isDark(8, 8)
  f1 = (f1 << 1) | isDark(8, 7)
  for (let j = 5; j >= 0; j--) f1 = (f1 << 1) | isDark(8, j)
  let f2 = 0
  for (let j = n - 1; j >= n - 7; j--) f2 = (f2 << 1) | isDark(8, j)
  for (let i = n - 8; i < n; i++) f2 = (f2 << 1) | isDark(i, 8)
  const d1 = decodeFormat(f1), d2 = decodeFormat(f2)
  const { data } = d1.dist <= d2.dist ? d1 : d2

  const len = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
  const modulePx = (len(loc.topLeftCorner, loc.topRightCorner) + len(loc.topLeftCorner, loc.bottomLeftCorner)) / 2 / n
  const quiet = Math.min(
    loc.topLeftCorner.x, loc.topLeftCorner.y,
    img.width - loc.topRightCorner.x, img.height - loc.bottomLeftCorner.y,
  )
  return {
    ecl: ECL_BITS[data >> 3],
    mask: data & 7,
    fg: hex(fgRGB),
    bg: hex(bgRGB),
    scale: clamp(Math.round(modulePx), 1, 40),
    // Beyond the spec's 4-module quiet zone the image is likely a screenshot
    // or embed, not a tight crop — don't propagate its padding.
    margin: clamp(Math.round(quiet / modulePx), 0, 4),
  }
}
