import { useCallback, useState, type DragEvent } from 'react'
import { decodeImageFile, type DecodeResult } from '../lib/decode'
import { usePagePaste } from '../lib/paste'
import './Decoder.sass'

export default function Decoder({ onDecoded }: { onDecoded: (r: DecodeResult) => void }) {
  const [result, setResult] = useState<DecodeResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [dims, setDims] = useState<{ w: number, h: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return
    setErr(null)
    setResult(null)
    setDims(null)
    setCopied(false)
    setImgUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    try {
      const r = await decodeImageFile(file)
      if (!r) { setErr('No QR code found in image.'); return }
      setResult(r)
      onDecoded(r)
    } catch (e) {
      setErr(String((e as Error).message ?? e))
    }
  }, [onDecoded])

  usePagePaste({ onImage: handleFile })

  async function copy() {
    if (!result) return
    await navigator.clipboard.writeText(result.data)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  return (
    <section className="decoder">
      <h2>Decode</h2>
      <label
        className={`dropzone ${dragOver ? 'over' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept="image/*"
          onChange={e => handleFile(e.target.files?.[0])}
          hidden
        />
        <span>Drop a QR-code image here, paste one (<kbd>⌘V</kbd> / <kbd>Ctrl+V</kbd>), or click to choose</span>
      </label>

      {imgUrl && (
        <div className="thumb">
          <img
            src={imgUrl}
            alt="uploaded QR"
            onLoad={e => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
          {dims && (
            <div className="meta">
              <span>{dims.w}×{dims.h} px</span>
              {result && <span>V{result.version}</span>}
              {result && <span>{result.modules}×{result.modules} modules</span>}
              {result && <span>ECL {result.ecl}</span>}
            </div>
          )}
        </div>
      )}

      {err && <pre className="err">{err}</pre>}

      {result && (
        <div className="result">
          <textarea readOnly value={result.data} rows={Math.min(6, Math.max(1, Math.ceil(result.data.length / 60)))} />
          <div className="actions">
            <button onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
            {looksLikeUrl(result.data) && (
              <a href={result.data} target="_blank" rel="noopener noreferrer">Open ↗</a>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function looksLikeUrl(s: string): boolean {
  try { new URL(s); return true } catch { return false }
}
