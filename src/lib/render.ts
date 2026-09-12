import QRCode from 'qrcode'

// Our own SVG renderer over node-qrcode's raw module bitmap. Dependency-free
// so it also runs in the Cloudflare Pages Function that draws OG images.
//
// Three finder patterns (the big corner squares) are styled independently of
// every other module: data, timing and alignment modules are all "dots".

export type ECL = 'L' | 'M' | 'Q' | 'H'

export type RenderOpts = {
  text: string
  ecl: ECL
  version: number  // 1-40; 0 = auto (smallest that fits)
  margin: number   // quiet zone, in modules
  scale: number    // px per module
  fg: string       // #rrggbb
  bg: string       // #rrggbb
  r: number        // dot corner radius, % of dot size (0 = square, 50 = circle)
  ds: number       // dot size, % of a module (100 = touching)
  fr: number       // finder corner radius, % of finder size (0 = square, 50 = round)
}

export function createQR(text: string, ecl: ECL, version = 0) {
  return QRCode.create(text, { errorCorrectionLevel: ecl, version: version || undefined })
}

const f = (n: number): string => String(+n.toFixed(3))

// Rounded-rect subpath; `pct` is the corner radius as a % of the shorter side
// (50 = capsule/circle). Drawn clockwise so it fills; pass `ccw` to cut a hole
// (paired with fill-rule evenodd).
function rrect(x: number, y: number, w: number, h: number, pct: number, ccw = false): string {
  const r = Math.min(w, h) * Math.min(50, Math.max(0, pct)) / 100
  if (r === 0) {
    return ccw
      ? `M${f(x)} ${f(y)}v${f(h)}h${f(w)}v${f(-h)}z`
      : `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}z`
  }
  const a = (dx: number, dy: number) => `a${f(r)} ${f(r)} 0 0 ${ccw ? 0 : 1} ${f(dx)} ${f(dy)}`
  const iw = w - 2 * r, ih = h - 2 * r
  return ccw
    ? `M${f(x + r)} ${f(y)}${a(-r, r)}v${f(ih)}${a(r, r)}h${f(iw)}${a(r, -r)}v${f(-ih)}${a(-r, -r)}z`
    : `M${f(x + r)} ${f(y)}h${f(iw)}${a(r, r)}v${f(ih)}${a(-r, r)}h${f(-iw)}${a(-r, -r)}v${f(-ih)}${a(r, -r)}z`
}

// Finder: 7×7 outer ring (1 module thick) + 3×3 core, concentric, same
// corner-radius percentage so they read as one shape.
function finder(x: number, y: number, pct: number): string {
  return rrect(x, y, 7, 7, pct) + rrect(x + 1, y + 1, 5, 5, pct, true) + rrect(x + 2, y + 2, 3, 3, pct)
}

export function renderSvg(o: RenderOpts): string {
  const qr = createQR(o.text, o.ecl, o.version)
  const n = qr.modules.size
  const m = o.margin
  const size = n + 2 * m
  const px = size * o.scale
  const ds = Math.min(100, Math.max(10, o.ds)) / 100
  const inset = (1 - ds) / 2

  const inFinder = (row: number, col: number): boolean =>
    (row < 7 && col < 7) || (row < 7 && col >= n - 7) || (row >= n - 7 && col < 7)

  let dots = ''
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (inFinder(row, col) || !qr.modules.get(row, col)) continue
      dots += rrect(m + col + inset, m + row + inset, ds, ds, o.r)
    }
  }
  const finders = finder(m, m, o.fr) + finder(m + n - 7, m, o.fr) + finder(m, m + n - 7, o.fr)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${size} ${size}" shape-rendering="geometricPrecision">`
    + `<rect width="${size}" height="${size}" fill="${o.bg}"/>`
    + `<path fill="${o.fg}" d="${dots}"/>`
    + `<path fill="${o.fg}" fill-rule="evenodd" d="${finders}"/>`
    + `</svg>`
}
