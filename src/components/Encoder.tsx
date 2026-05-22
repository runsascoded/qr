import { useEffect, useMemo, useState } from 'react'
import { boolParam, defStringParam, enumParam, intParam, useUrlStates } from 'use-prms'
import {
  downloadBlob,
  getQRInfo,
  type ECL,
  type Lib,
  renderMinimalPng,
  renderMinimalSvg,
  renderStyledPng,
  renderStyledSvg,
  slugify,
  svgToBlob,
} from '../lib/qr'
import type { DotType } from 'qr-code-styling'
import './Encoder.sass'

const ECLs: ECL[] = ['L', 'M', 'Q', 'H']
const DOT_TYPES: DotType[] = ['square', 'dots', 'rounded', 'classy', 'classy-rounded', 'extra-rounded']

// Encoder state lives in the URL, so every QR is a shareable link.
const PARAMS = {
  t: defStringParam('https://qr.rbw.sh/'),
  u: boolParam,
  lib: enumParam<Lib>('minimal', ['minimal', 'styled']),
  ecl: enumParam<ECL>('L', ECLs),
  m: intParam(1),
  s: intParam(10),
  fg: defStringParam('#000000'),
  bg: defStringParam('#ffffff'),
  dot: enumParam<DotType>('square', DOT_TYPES),
}

export default function Encoder() {
  const { values, setValues } = useUrlStates(PARAMS)
  const { t: text, u: uppercase, lib, ecl, m: margin, s: scale, fg, bg, dot: dotType } = values

  const [svg, setSvg] = useState<string>('')
  const [err, setErr] = useState<string | null>(null)

  const finalText = uppercase ? text.toUpperCase() : text

  const opts = useMemo(() => ({
    text: finalText, ecl, margin, scale, fg, bg,
  }), [finalText, ecl, margin, scale, fg, bg])

  const styledOpts = useMemo(() => ({ ...opts, dotType }), [opts, dotType])

  const infoLower = useMemo(() => getQRInfo(text, ecl), [text, ecl])
  const infoUpper = useMemo(() => getQRInfo(text.toUpperCase(), ecl), [text, ecl])
  const info = uppercase ? infoUpper : infoLower

  useEffect(() => {
    let cancelled = false
    setErr(null)
    if (!finalText) { setSvg(''); return }
    const render = lib === 'minimal' ? renderMinimalSvg(opts) : renderStyledSvg(styledOpts)
    render
      .then(s => { if (!cancelled) setSvg(s) })
      .catch(e => { if (!cancelled) { setSvg(''); setErr(String(e?.message ?? e)) } })
    return () => { cancelled = true }
  }, [lib, opts, styledOpts, finalText])

  const stem = slugify(finalText)

  async function downloadSvg() {
    if (!svg) return
    downloadBlob(svgToBlob(svg), `${stem}.svg`)
  }

  async function downloadPng() {
    if (!finalText) return
    try {
      const blob = lib === 'minimal' ? await renderMinimalPng(opts) : await renderStyledPng(styledOpts)
      downloadBlob(blob, `${stem}.png`)
    } catch (e) {
      setErr(String((e as Error).message ?? e))
    }
  }

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
            <span>Library</span>
            <select value={lib} onChange={e => setValues({ lib: e.target.value as Lib })}>
              <option value="minimal">minimal (node-qrcode)</option>
              <option value="styled">styled (qr-code-styling)</option>
            </select>
          </label>
          <label>
            <span>Error correction</span>
            <select value={ecl} onChange={e => setValues({ ecl: e.target.value as ECL })}>
              {ECLs.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
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
          {lib === 'styled' && (
            <label>
              <span>Dot type</span>
              <select value={dotType} onChange={e => setValues({ dot: e.target.value as DotType })}>
                {DOT_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          )}
        </div>
      </fieldset>

      <div className="preview">
        {err && <pre className="err">{err}</pre>}
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

// '#rgb' / 'rgb' / '#rrggbb' / 'rrggbb' → '#rrggbb', else null.
function normalizeHex(v: string): string | null {
  let h = v.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(h)) h = h.split('').map(c => c + c).join('')
  return /^[0-9a-f]{6}$/.test(h) ? `#${h}` : null
}

function ColorInput({ label, value, onChange }: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])

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
