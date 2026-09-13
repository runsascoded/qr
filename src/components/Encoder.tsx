import { useCallback, useMemo, useState } from 'react'
import type { useUrlStates } from 'use-prms'
import { useActions } from 'use-kbd'
import { downloadBlob, getQRInfo, renderPng, renderSvg, slugify, svgToBlob, type ECL } from '../lib/qr'
import { normalizeHex } from '../lib/color'
import { ECLs, type PARAMS } from '../lib/params'
import { usePagePaste } from '../lib/paste'
import './Encoder.sass'

type UrlState = ReturnType<typeof useUrlStates<typeof PARAMS>>

// Next preset strictly greater than the current value, wrapping to the first.
const nextPreset = (presets: number[], v: number): number => presets.find(p => p > v) ?? presets[0]
const ROUND_PRESETS = [0, 25, 50] // square → rounded → circle

export default function Encoder({ values, setValues }: Pick<UrlState, 'values' | 'setValues'>) {
  const { t: text, u: uppercase, ecl, v: version, m: margin, s: scale, fg, bg, r, ds, fr } = values

  const [pngErr, setPngErr] = useState<string | null>(null)

  // Text pasted anywhere outside an input becomes the QR payload.
  const onPasteText = useCallback((t: string) => setValues({ t }), [setValues])
  usePagePaste({ onText: onPasteText })

  const finalText = uppercase ? text.toUpperCase() : text

  const opts = useMemo(() => ({
    text: finalText, ecl, version, margin, scale, fg, bg, r, ds, fr,
  }), [finalText, ecl, version, margin, scale, fg, bg, r, ds, fr])

  const infoLower = useMemo(() => getQRInfo(text, ecl, version), [text, ecl, version])
  const infoUpper = useMemo(() => getQRInfo(text.toUpperCase(), ecl, version), [text, ecl, version])
  const info = uppercase ? infoUpper : infoLower

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
  })

  return (
    <section className="encoder">
      <h2>Encode</h2>
      <label className="text-input">
        <span>Text / URL</span>
        <textarea
          value={text}
          onChange={e => setValues({ t: e.target.value })}
          rows={3}
          spellCheck={false}
          placeholder="https://example.com/"
        />
      </label>

      {infoLower && infoUpper && (
        <div className="case">
          <span className="hint">Uppercasing can shrink QRs for case-insensitive URLs:</span>
          <div className="info">
            <Stat label="lower" info={infoLower} active={!uppercase} onClick={() => setValues({ u: false })} />
            <Stat label="UPPER" info={infoUpper} active={uppercase} onClick={() => setValues({ u: true })} />
          </div>
        </div>
      )}

      <fieldset className="options">
        <legend>Options</legend>
        <div className="grid">
          <label>
            <span>Error correction</span>
            <select value={ecl} onChange={e => setValues({ ecl: e.target.value as ECL })}>
              {ECLs.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label>
            <span>Version (0 = auto)</span>
            <input type="number" min={0} max={40} value={version} onChange={e => setValues({ v: +e.target.value })} />
          </label>
          <label>
            <span>Margin (modules)</span>
            <input type="number" min={0} max={10} value={margin} onChange={e => setValues({ m: +e.target.value })} />
          </label>
          <label>
            <span>Pixel size (px/module)</span>
            <input type="number" min={1} max={40} value={scale} onChange={e => setValues({ s: +e.target.value })} />
          </label>
          <ColorInput label="Foreground" value={fg} onChange={v => setValues({ fg: v })} />
          <ColorInput label="Background" value={bg} onChange={v => setValues({ bg: v })} />
        </div>
      </fieldset>

      <fieldset className="options">
        <legend>Style</legend>
        <div className="grid">
          <Slider label="Dot rounding" value={r} min={0} max={50} unit="%" onChange={v => setValues({ r: v })} />
          <Slider label="Dot size" value={ds} min={40} max={100} unit="%" onChange={v => setValues({ ds: v })} />
          <Slider label="Finder rounding" value={fr} min={0} max={50} unit="%" onChange={v => setValues({ fr: v })} />
        </div>
      </fieldset>

      <div className="preview">
        {(renderErr ?? pngErr) && <pre className="err">{renderErr ?? pngErr}</pre>}
        {svg && info && (
          <>
            <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="actions">
              <button onClick={downloadSvg}>Download {stem}.svg</button>
              <button onClick={downloadPng}>Download {stem}.png</button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function Stat({ label, info, active, onClick }: {
  label: string
  info: ReturnType<typeof getQRInfo>
  active: boolean
  onClick: () => void
}) {
  if (!info) return null
  return (
    <button type="button" className={`stat ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="label">{label}</span>
      <span>V{info.version}</span>
      <span>{info.modules}×{info.modules}</span>
      <span className="mode">{info.mode}</span>
    </button>
  )
}

function Slider({ label, value, min, max, unit, onChange }: {
  label: string
  value: number
  min: number
  max: number
  unit: string
  onChange: (value: number) => void
}) {
  return (
    <label className="slider">
      <span>{label} <span className="val">{value}{unit}</span></span>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(+e.target.value)} />
    </label>
  )
}

function ColorInput({ label, value, onChange }: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
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

  return (
    <label>
      <span>{label}</span>
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
      </div>
    </label>
  )
}
