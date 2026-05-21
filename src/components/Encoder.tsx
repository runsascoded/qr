import { useEffect, useMemo, useState } from 'react'
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

export default function Encoder() {
  const [text, setText] = useState('https://qr.rbw.sh/')
  const [uppercase, setUppercase] = useState(false)
  const [lib, setLib] = useState<Lib>('minimal')
  const [ecl, setEcl] = useState<ECL>('L')  // matches qrencode's default; smallest QRs
  const [margin, setMargin] = useState(1)
  const [scale, setScale] = useState(10)
  const [fg, setFg] = useState('#000000')
  const [bg, setBg] = useState('#ffffff')
  const [dotType, setDotType] = useState<DotType>('square')
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
          onChange={e => setText(e.target.value)}
          rows={3}
          spellCheck={false}
          placeholder="https://example.com/"
        />
      </label>

      <div className="row">
        <label className="checkbox">
          <input type="checkbox" checked={uppercase} onChange={e => setUppercase(e.target.checked)} />
          uppercase (smaller QRs for case-insensitive URLs)
        </label>
      </div>

      {infoLower && infoUpper && (
        <div className="info">
          <Stat label="lower" info={infoLower} active={!uppercase} />
          <Stat label="UPPER" info={infoUpper} active={uppercase} />
        </div>
      )}

      <fieldset className="options">
        <legend>Options</legend>
        <div className="grid">
          <label>
            <span>Library</span>
            <select value={lib} onChange={e => setLib(e.target.value as Lib)}>
              <option value="minimal">minimal (node-qrcode)</option>
              <option value="styled">styled (qr-code-styling)</option>
            </select>
          </label>
          <label>
            <span>Error correction</span>
            <select value={ecl} onChange={e => setEcl(e.target.value as ECL)}>
              {ECLs.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label>
            <span>Margin (modules)</span>
            <input type="number" min={0} max={10} value={margin} onChange={e => setMargin(+e.target.value)} />
          </label>
          <label>
            <span>Pixel size (px/module)</span>
            <input type="number" min={1} max={40} value={scale} onChange={e => setScale(+e.target.value)} />
          </label>
          <label>
            <span>Foreground</span>
            <input type="color" value={fg} onChange={e => setFg(e.target.value)} />
          </label>
          <label>
            <span>Background</span>
            <input type="color" value={bg} onChange={e => setBg(e.target.value)} />
          </label>
          {lib === 'styled' && (
            <label>
              <span>Dot type</span>
              <select value={dotType} onChange={e => setDotType(e.target.value as DotType)}>
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

function Stat({ label, info, active }: { label: string; info: ReturnType<typeof getQRInfo>; active: boolean }) {
  if (!info) return null
  return (
    <div className={`stat ${active ? 'active' : ''}`}>
      <span className="label">{label}</span>
      <span>V{info.version}</span>
      <span>{info.modules}×{info.modules}</span>
      <span className="mode">{info.mode}</span>
    </div>
  )
}
