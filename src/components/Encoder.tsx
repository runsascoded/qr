import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { useUrlStates } from 'use-prms'
import { useActions } from 'use-kbd'
import { downloadBlob, getQRInfo, renderPng, renderSvg, slugify, svgToBlob, type ECL } from '../lib/qr'
import { normalizeHex } from '../lib/color'
import { DEFAULT_TEXT, ECLs, type PARAMS } from '../lib/params'
import { usePagePaste } from '../lib/paste'
import Tooltip from './Tooltip'
import './Encoder.sass'

type UrlState = ReturnType<typeof useUrlStates<typeof PARAMS>>

// Next preset strictly greater than the current value, wrapping to the first.
const nextPreset = (presets: number[], v: number): number => presets.find(p => p > v) ?? presets[0]
const ROUND_PRESETS = [0, 25, 50] // square → rounded → circle
// Recents are just hex strings — storage is free; the container scrolls once it
// gets tall (see .swatches), so keep a generous history.
const MAX_RECENT = 32

interface EyeDropperResult { sRGBHex: string }
interface EyeDropperInstance { open(signal?: { signal?: AbortSignal }): Promise<EyeDropperResult> }
declare global {
  interface Window { EyeDropper?: { new (): EyeDropperInstance } }
}
const CAN_EYEDROP = typeof window !== 'undefined' && 'EyeDropper' in window

// Per-channel color palette, persisted in localStorage. Display order is fixed
// (an entry never moves once placed — so the swatch you just picked doesn't
// jump under you); recency is tracked invisibly via a monotonic use-stamp `u`,
// used only to pick the least-recently-used entry to evict when we hit the cap.
// The current value is folded in on a debounce, so dragging the picker doesn't
// spam the list with every intermediate shade.
interface Recent { c: string; u: number }

function loadRecents(key: string): Recent[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '[]')
    // Migrate the old `string[]` format (front = most recent) to `{c,u}`.
    return raw.map((e: string | Recent, i: number): Recent =>
      typeof e === 'string' ? { c: e, u: raw.length - i } : e)
  } catch { return [] }
}

function useRecentColors(key: string, value: string): string[] {
  // The authoritative {c,u} list lives in a ref; React state holds only the
  // displayed colors. That way a pure recency bump (same colors, same order —
  // e.g. mounting, or re-picking a color already in the list) updates storage
  // silently, without a re-render. We only setState when the swatches actually
  // change (a color added or evicted).
  const ref = useRef<Recent[] | null>(null)
  if (ref.current === null) ref.current = loadRecents(key)
  const [display, setDisplay] = useState<string[]>(() => loadRecents(key).map(e => e.c))
  useEffect(() => {
    const hex = normalizeHex(value)
    if (!hex) return
    const id = setTimeout(() => {
      const prev = ref.current!
      const u = prev.reduce((m, e) => Math.max(m, e.u), 0) + 1
      const idx = prev.findIndex(e => e.c === hex)
      let next: Recent[]
      if (idx >= 0) {
        next = prev.map((e, i) => (i === idx ? { ...e, u } : e)) // bump recency in place
      } else {
        next = [{ c: hex, u }, ...prev] // newest at the front
        if (next.length > MAX_RECENT) {
          const lru = next.reduce((min, e) => (e.u < min.u ? e : min))
          next = next.filter(e => e !== lru) // evict least-recently-used
        }
      }
      ref.current = next
      try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* private mode */ }
      const nextColors = next.map(e => e.c)
      const changed = nextColors.length !== prev.length || nextColors.some((c, i) => c !== prev[i].c)
      if (changed) setDisplay(nextColors)
    }, 500)
    return () => clearTimeout(id)
  }, [key, value])
  return display
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2.5v7.5M5 7l3 3 3-3M3 13.5h10" />
    </svg>
  )
}

function DownloadBothIcon() {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2v6M5 6l3 3 3-3" />
      <path d="M2.5 12.5h4M9.5 12.5h4" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 7v4" strokeLinecap="round" />
      <circle cx="8" cy="4.6" r="0.35" fill="currentColor" stroke="none" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.5l3.5 3.5L13 4.5" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 10.5V2.5M5 5.5l3-3 3 3M3 10v2.5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V10" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h1L5.5 2.5h5L11.5 4h1A1.5 1.5 0 0 1 14 5.5v6A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z" />
      <circle cx="8" cy="8.5" r="2.3" />
    </svg>
  )
}

function ResizeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.5 2.5H13.5V6.5M6.5 13.5H2.5V9.5M13.5 2.5l-4 4M2.5 13.5l4-4" />
    </svg>
  )
}

// A small "ⓘ" that reveals an explanation — hover on desktop, tap on touch.
function InfoTip({ label }: { label: ReactNode }) {
  return (
    <Tooltip openOnClick label={label}>
      <button type="button" className="tip" aria-label="More information"><InfoIcon /></button>
    </Tooltip>
  )
}

function RecentsIcon() {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" fill="currentColor" aria-hidden="true">
      <rect x="2.5" y="2.5" width="4.4" height="4.4" rx="1" />
      <rect x="9.1" y="2.5" width="4.4" height="4.4" rx="1" />
      <rect x="2.5" y="9.1" width="4.4" height="4.4" rx="1" />
      <rect x="9.1" y="9.1" width="4.4" height="4.4" rx="1" />
    </svg>
  )
}

function EyedropperIcon() {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.5 2.5a2 2 0 0 1 3 3l-1.2 1.2 1 1-1.5 1.5-1-1-5 5-2.8.6.6-2.8 5-5-1-1L9.1 3.6l1 1z" />
    </svg>
  )
}

export default function Encoder({ values, setValues }: Pick<UrlState, 'values' | 'setValues'>) {
  const { t: text, u: uppercase, ecl, v: version, m: margin, s: scale, fg, bg, r, ds, fr } = values

  const [pngErr, setPngErr] = useState<string | null>(null)
  const [copied, setCopied] = useState<'svg' | 'png' | null>(null)

  // Knobs are demoted into a collapsible, starting collapsed so the preview
  // (and the Decode half below it) stay above the fold. Persisted, so once you
  // open it it stays open.
  const [customizeOpen, setCustomizeOpen] = useState(() => {
    try { return localStorage.getItem('qr:customize') === '1' } catch { return false }
  })
  const toggleCustomize = (open: boolean) => {
    setCustomizeOpen(open)
    try { localStorage.setItem('qr:customize', open ? '1' : '0') } catch { /* private mode */ }
  }

  // Pixel size only affects the PNG raster, so its control lives by the PNG
  // buttons behind a small toggle rather than in the Options grid.
  const [pxOpen, setPxOpen] = useState(false)

  // Mobile: once the full preview scrolls out of view, a shrunken QR thumbnail
  // rides along in the sticky Text/URL bar (tap it to jump back up).
  const [pinned, setPinned] = useState(false)
  const previewRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = previewRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setPinned(!e.isIntersecting), { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Text pasted anywhere outside an input becomes the QR payload.
  const onPasteText = useCallback((t: string) => setValues({ t }), [setValues])
  usePagePaste({ onText: onPasteText })

  const finalText = uppercase ? text.toUpperCase() : text

  // `version` is a floor, not an exact size. The smallest version that fits the
  // data (at this ECL) is the true minimum, so a too-small entry bumps up to it
  // rather than erroring — you can force a *larger* code, never a smaller one.
  const autoMin = useMemo(() => getQRInfo(finalText, ecl, 0)?.version ?? null, [finalText, ecl])
  const effVersion = version === 0 || autoMin === null ? version : Math.max(version, autoMin)
  const bumped = version > 0 && autoMin !== null && version < autoMin

  const opts = useMemo(() => ({
    text: finalText, ecl, version: effVersion, margin, scale, fg, bg, r, ds, fr,
  }), [finalText, ecl, effVersion, margin, scale, fg, bg, r, ds, fr])

  const info = useMemo(() => getQRInfo(finalText, ecl, effVersion), [finalText, ecl, effVersion])
  // For the uppercase hint: what each casing auto-picks (version 0), so the
  // comparison reflects the density win, not a forced version.
  const infoLower = useMemo(() => getQRInfo(text, ecl, 0), [text, ecl])
  const infoUpper = useMemo(() => getQRInfo(text.toUpperCase(), ecl, 0), [text, ecl])

  // The resulting version at each ECL, so the segmented control can show the
  // size cost of more redundancy at a glance (respecting the version floor).
  const eclVersions = useMemo(() => {
    const out = {} as Record<ECL, number | null>
    for (const l of ECLs) {
      const min = getQRInfo(finalText, l, 0)?.version ?? null
      out[l] = min === null ? null : version === 0 ? min : Math.max(version, min)
    }
    return out
  }, [finalText, version])

  const recentFg = useRecentColors('qr:recent:fg', fg)
  const recentBg = useRecentColors('qr:recent:bg', bg)

  const { svg, err: renderErr } = useMemo(() => {
    if (!finalText) return { svg: '', err: null }
    try {
      return { svg: renderSvg(opts), err: null }
    } catch (e) {
      return { svg: '', err: String((e as Error).message ?? e) }
    }
  }, [opts, finalText])

  const stem = slugify(finalText)

  async function downloadSvg() {
    if (!svg) return
    downloadBlob(svgToBlob(svg), `${stem}.svg`)
  }

  async function downloadPng() {
    if (!finalText) return
    try {
      downloadBlob(await renderPng(opts), `${stem}.png`)
    } catch (e) {
      setPngErr(String((e as Error).message ?? e))
    }
  }

  function downloadBoth() {
    void downloadSvg()
    void downloadPng()
  }

  const flagCopied = (which: 'svg' | 'png') => {
    setCopied(which)
    setTimeout(() => setCopied(c => (c === which ? null : c)), 1200)
  }

  async function copySvg() {
    if (!svg) return
    try {
      await navigator.clipboard.writeText(svg)
      flagCopied('svg')
    } catch (e) {
      setPngErr(String((e as Error).message ?? e))
    }
  }

  async function copyPng() {
    if (!finalText) return
    try {
      // Pass the Blob promise (not an awaited Blob) so Safari keeps the user
      // gesture that clipboard image writes require.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': renderPng(opts) })])
      flagCopied('png')
    } catch (e) {
      setPngErr(String((e as Error).message ?? e))
    }
  }

  // Hotkeys + omnibar commands for the encode/style options.
  useActions({
    'cfg:ecl': {
      label: `Error correction: cycle (now ${ecl})`,
      group: 'Encode',
      defaultBindings: ['g e'],
      keywords: ['ecl', 'error correction'],
      handler: () => setValues({ ecl: ECLs[(ECLs.indexOf(ecl) + 1) % ECLs.length] }),
    },
    'cfg:uppercase': {
      label: uppercase ? 'Uppercase: turn off' : 'Uppercase: turn on',
      group: 'Encode',
      defaultBindings: ['g u'],
      keywords: ['case'],
      handler: () => setValues({ u: !uppercase }),
    },
    'cfg:dotRound': {
      label: 'Dot rounding: cycle (square → round → circle)',
      group: 'Style',
      defaultBindings: ['g r'],
      keywords: ['rounding', 'dots', 'circle'],
      handler: () => setValues({ r: nextPreset(ROUND_PRESETS, r) }),
    },
    'cfg:finderRound': {
      label: 'Finder rounding: cycle',
      group: 'Style',
      defaultBindings: ['g f'],
      keywords: ['finder', 'corner'],
      handler: () => setValues({ fr: nextPreset(ROUND_PRESETS, fr) }),
    },
    'dl:svg': {
      label: 'Download SVG',
      group: 'Encode',
      defaultBindings: ['g s'],
      enabled: !!svg,
      handler: () => { void downloadSvg() },
    },
    'dl:png': {
      label: 'Download PNG',
      group: 'Encode',
      defaultBindings: ['g p'],
      enabled: !!finalText,
      handler: () => { void downloadPng() },
    },
    'dl:both': {
      label: 'Download SVG + PNG',
      group: 'Encode',
      defaultBindings: ['g b'],
      keywords: ['both', 'download'],
      enabled: !!finalText,
      handler: downloadBoth,
    },
    'cp:svg': {
      label: 'Copy SVG markup',
      group: 'Encode',
      keywords: ['clipboard'],
      enabled: !!svg,
      handler: () => { void copySvg() },
    },
    'cp:png': {
      label: 'Copy PNG image',
      group: 'Encode',
      keywords: ['clipboard'],
      enabled: !!finalText,
      handler: () => { void copyPng() },
    },
  })

  return (
    <section className="encoder" id="encode">
      <h2>Generate</h2>
      <div className={`sticky-head ${pinned ? 'pinned' : ''}`}>
        <label className={`text-input ${text === DEFAULT_TEXT ? '' : 'full'}`}>
          {text === DEFAULT_TEXT && <span>Text / URL</span>}
          <textarea
            value={text}
            onChange={e => setValues({ t: e.target.value })}
            rows={1}
            spellCheck={false}
            placeholder="https://example.com/"
          />
        </label>
        {svg && (
          <button
            type="button"
            className="mini-qr"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Scroll back to top"
            title="Scroll to top"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
        <div className="scan-shortcuts">
          <Tooltip label="Scan a QR image file">
            <button type="button" className="scan-btn" onClick={() => window.dispatchEvent(new CustomEvent('qr:scan-upload'))} aria-label="Scan a QR image file"><UploadIcon /></button>
          </Tooltip>
          <Tooltip label="Scan a QR with the camera">
            <button type="button" className="scan-btn" onClick={() => window.dispatchEvent(new CustomEvent('qr:scan-camera'))} aria-label="Scan with camera"><CameraIcon /></button>
          </Tooltip>
        </div>
      </div>

      <div className="preview" ref={previewRef}>
        {(renderErr ?? pngErr) && <pre className="err">{renderErr ?? pngErr}</pre>}
        {svg && info ? (
          <>
            <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="actions">
              <div className="fmt-row">
                <div className="fmt-group">
                  <span className="fmt">SVG</span>
                  <Tooltip label={copied === 'svg' ? 'Copied!' : 'Copy SVG markup'}>
                    <button className="icon" onClick={copySvg} aria-label="Copy SVG markup">{copied === 'svg' ? <CheckIcon /> : <CopyIcon />}</button>
                  </Tooltip>
                  <Tooltip label="Save .svg file">
                    <button className="icon" onClick={downloadSvg} aria-label="Save SVG file"><DownloadIcon /></button>
                  </Tooltip>
                </div>
                <div className="fmt-group">
                  <span className="fmt">PNG</span>
                  <Tooltip label={copied === 'png' ? 'Copied!' : 'Copy PNG image'}>
                    <button className="icon" onClick={copyPng} aria-label="Copy PNG image">{copied === 'png' ? <CheckIcon /> : <CopyIcon />}</button>
                  </Tooltip>
                  <Tooltip label="Save .png file">
                    <button className="icon" onClick={downloadPng} aria-label="Save PNG file"><DownloadIcon /></button>
                  </Tooltip>
                  <Tooltip label={`PNG resolution: ${scale}px per module`}>
                    <button className={`icon px ${pxOpen ? 'on' : ''}`} onClick={() => setPxOpen(o => !o)} aria-label="PNG resolution" aria-expanded={pxOpen}><ResizeIcon /></button>
                  </Tooltip>
                </div>
                <div className="fmt-group">
                  <Tooltip label="Download both (SVG + PNG)">
                    <button className="icon both" onClick={downloadBoth} aria-label="Download both SVG and PNG"><DownloadBothIcon /></button>
                  </Tooltip>
                </div>
              </div>
              {pxOpen && (
                <div className="px-panel">
                  <label className="slider">
                    <span>PNG px / module <InfoTip label={<>How many image pixels each module renders at — sets the exported/copied PNG’s resolution ({info ? `currently ${(info.modules + 2 * margin) * scale}px square` : ''}). The SVG is resolution-independent.</>} /> <span className="val">{scale}px</span></span>
                    <input type="range" min={1} max={40} value={scale} onChange={e => setValues({ s: +e.target.value })} />
                  </label>
                </div>
              )}
            </div>
            {info && <div className="qr-stats">V{info.version} · {info.modules}²</div>}
          </>
        ) : (
          !renderErr && !pngErr && <p className="empty">Enter text above to generate a QR.</p>
        )}
      </div>

      <details className="customize" open={customizeOpen} onToggle={e => toggleCustomize(e.currentTarget.open)}>
        <summary>Customize</summary>
        <fieldset className="options">
          <legend>Options</legend>
          <div className="ecl-field">
            <span className="field-label">Error correction <InfoTip label={<>Redundancy so a scuffed or partly-covered code still scans. <b>L</b> ≈ 7%, <b>M</b> ≈ 15%, <b>Q</b> ≈ 25%, <b>H</b> ≈ 30% recoverable. Higher = more robust, but denser — the <b>V</b> under each is the resulting size.</>} /></span>
            <div className="ecl-seg" role="radiogroup" aria-label="Error correction level">
              {ECLs.map(l => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={ecl === l}
                  className={`ecl-opt ${ecl === l ? 'on' : ''}`}
                  onClick={() => setValues({ ecl: l })}
                >
                  <span className="lvl">{l}</span>
                  <span className="ev">{eclVersions[l] ? `V${eclVersions[l]}` : '—'}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid scalars">
            <label>
              <span>Version <InfoTip label={<>Size tier, from <b>1</b> (21×21) up to <b>40</b> (177×177). <b>0 = auto</b> picks the smallest that fits. It’s a <b>floor</b>: raise it for a larger, lower-density code — you can’t go smaller than the data needs (it’ll bump up).</>} /></span>
              <input type="number" min={0} max={40} value={version} onChange={e => setValues({ v: +e.target.value })} />
            </label>
            <label>
              <span>Margin <InfoTip label={<>The blank “quiet zone” border around the code, measured in modules. The spec recommends ≥ 4; many scanners tolerate less.</>} /></span>
              <input type="number" min={0} max={10} value={margin} onChange={e => setValues({ m: +e.target.value })} />
            </label>
          </div>
          {bumped && autoMin !== null && (
            <p className="note">Version {version} can’t hold this data — showing <b>V{autoMin}</b> (the smallest that fits).</p>
          )}
          <label className="toggle">
            <input type="checkbox" checked={uppercase} onChange={e => setValues({ u: e.target.checked })} />
            <span>
              Uppercase
              <InfoTip label={<>
                Encodes the text uppercased. Case-insensitive text (many URLs) packs denser in QR <b>alphanumeric</b> mode, often shrinking the code.
                {infoLower && infoUpper && ` This text: ${infoLower.mode} V${infoLower.version} → UPPER ${infoUpper.mode} V${infoUpper.version}.`}
                {' '}⚠ URL paths & queries are case-sensitive, so uppercasing them breaks the link.
              </>} />
            </span>
          </label>
          {uppercase && (
            <p className="warn">
              ⚠ URL paths &amp; queries are case-sensitive — uppercasing <code>/MyPage</code> → <code>/MYPAGE</code> breaks the link. Only use it when the whole text is case-insensitive.
            </p>
          )}
          <div className="grid colors">
            <ColorInput label="Foreground" info="The dark module color. Keep strong contrast with the background (dark-on-light) for reliable scanning." value={fg} recents={recentFg} onChange={v => setValues({ fg: v })} />
            <ColorInput label="Background" info="The light module color. Light-on-dark (inverted) codes often fail to scan — prefer a light background." value={bg} recents={recentBg} onChange={v => setValues({ bg: v })} />
          </div>
        </fieldset>

        <fieldset className="options">
          <legend>Style</legend>
          <div className="grid">
            <Slider label="Dot rounding" info="Rounds the corners of each dark module. 0% = square, 50% = full circle." value={r} min={0} max={50} unit="%" onChange={v => setValues({ r: v })} />
            <Slider label="Dot size" info="Shrinks each dark module within its cell, leaving gaps. Below ~70% can hurt scannability." value={ds} min={40} max={100} unit="%" onChange={v => setValues({ ds: v })} />
            <Slider label="Finder rounding" info="Rounds the three big square “finder” patterns in the corners." value={fr} min={0} max={50} unit="%" onChange={v => setValues({ fr: v })} />
          </div>
        </fieldset>
      </details>
    </section>
  )
}

function Slider({ label, info, value, min, max, unit, onChange }: {
  label: string
  info?: ReactNode
  value: number
  min: number
  max: number
  unit: string
  onChange: (value: number) => void
}) {
  return (
    <label className="slider">
      <span>{label}{info && <> <InfoTip label={info} /></>} <span className="val">{value}{unit}</span></span>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(+e.target.value)} />
    </label>
  )
}

function ColorInput({ label, info, value, recents, onChange }: {
  label: string
  info?: ReactNode
  value: string
  recents: string[]
  onChange: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [showRecents, setShowRecents] = useState(false)
  const [prev, setPrev] = useState(value)
  if (value !== prev) {  // external change (URL, decode) wins over the draft
    setPrev(value)
    setDraft(value)
  }

  function commit() {
    const hex = normalizeHex(draft)
    if (hex) onChange(hex)
    else setDraft(value)  // revert unparseable input
  }

  async function pickFromScreen() {
    if (!window.EyeDropper) return
    try {
      const { sRGBHex } = await new window.EyeDropper().open()
      onChange(sRGBHex)
    } catch { /* user pressed Esc / cancelled */ }
  }

  return (
    <label>
      <span>{label}{info && <> <InfoTip label={info} /></>}</span>
      <div className="color-input">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} />
        <input
          type="text"
          className="hex"
          value={draft}
          spellCheck={false}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        />
        {CAN_EYEDROP && (
          <button type="button" className="eyedropper" onClick={pickFromScreen} title="Pick a color from anywhere on screen" aria-label="Pick a color from screen">
            <EyedropperIcon />
          </button>
        )}
        {recents.length > 0 && (
          <button
            type="button"
            className={`recents-toggle ${showRecents ? 'on' : ''}`}
            onClick={() => setShowRecents(s => !s)}
            aria-label="Recent colors"
            aria-expanded={showRecents}
            title="Recent colors"
          >
            <RecentsIcon />
          </button>
        )}
      </div>
      {showRecents && recents.length > 0 && (
        <div className="swatches">
          {recents.map(c => (
            <button
              key={c}
              type="button"
              className={`swatch ${c.toLowerCase() === value.toLowerCase() ? 'active' : ''}`}
              style={{ background: c }}
              title={c}
              aria-label={`Use ${c}`}
              onClick={() => onChange(c)}
            />
          ))}
        </div>
      )}
    </label>
  )
}
