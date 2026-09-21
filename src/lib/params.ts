import { boolParam, defStringParam, enumParam, intParam } from 'use-prms'
import { hexParam } from './color'
import type { ECL } from './qr'

export const ECLs: ECL[] = ['L', 'M', 'Q', 'H']

// The seed payload shown on a cold load; the input reverts to a labelled,
// non-full-width state only while it still holds this exact value.
export const DEFAULT_TEXT = 'https://qr.rbw.sh/'

// Encoder state lives in the URL, so every QR is a shareable link.
export const PARAMS = {
  t: defStringParam(DEFAULT_TEXT),
  u: boolParam,
  ecl: enumParam<ECL>('L', ECLs),
  v: intParam(0),    // QR version 1–40; 0 = smallest that fits
  m: intParam(1),    // margin (modules)
  s: intParam(10),   // px per module
  fg: hexParam('#000000'),
  bg: hexParam('#ffffff'),
  r: intParam(0),    // dot corner radius, % (50 = circle)
  ds: intParam(100), // dot size, % of module
  fr: intParam(0),   // finder corner radius, % (50 = round)
}
