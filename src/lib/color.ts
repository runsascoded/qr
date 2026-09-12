import type { Param } from 'use-prms'

// '#rgb' / 'rgb' / '#rrggbb' / 'rrggbb' → '#rrggbb', else null.
export function normalizeHex(v: string): string | null {
  let h = v.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(h)) h = h.split('').map(c => c + c).join('')
  return /^[0-9a-f]{6}$/.test(h) ? `#${h}` : null
}

// URL param for a '#rrggbb' color: serialized without the '#' (so it needn't
// be %23-escaped), decoded leniently (with or without '#', 3 or 6 digits).
export function hexParam(init: string): Param<string> {
  return {
    encode: v => v === init ? undefined : v.replace(/^#/, ''),
    decode: e => (e && normalizeHex(e)) || init,
  }
}
