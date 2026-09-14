import { useCallback, useState, type DragEvent } from 'react'
import { useAction } from 'use-kbd'
import { decodeImageFile, type DecodeResult } from '../lib/decode'
import { useCamera } from '../lib/useCamera'
import { usePagePaste } from '../lib/paste'
import './Decoder.sass'

export default function Decoder({ onDecoded }: { onDecoded: (r: DecodeResult) => void }) {
  const [result, setResult] = useState<DecodeResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [dims, setDims] = useState<{ w: number, h: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [copied, setCopied] = useState(false)

  // Swap the shown image, revoking any prior object URL (data: URLs no-op).
  const showImage = useCallback((url: string) => {
    setImgUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })
  }, [])

  const accept = useCallback((r: DecodeResult) => {
    setErr(null)
    setResult(r)
    setCopied(false)
    onDecoded(r)
  }, [onDecoded])

  const handleFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return
    setErr(null)
    setResult(null)
    setDims(null)
    setCopied(false)
    showImage(URL.createObjectURL(file))
    try {
      const r = await decodeImageFile(file)
      if (!r) { setErr('No QR code found in image.'); return }
      accept(r)
    } catch (e) {
      setErr(String((e as Error).message ?? e))
    }
  }, [accept, showImage])

  const onCameraResult = useCallback((r: DecodeResult, snapshot: string) => {
    setDims(null)
    showImage(snapshot)
    accept(r)
  }, [accept, showImage])

  const { videoRef, state: camState, error: camError, start: startCamera, stop: stopCamera } = useCamera(onCameraResult)

  usePagePaste({ onImage: handleFile })

  async function copy() {
    if (!result) return
    await navigator.clipboard.writeText(result.data)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  useAction('dec:copy', {
    label: 'Copy decoded text',
    group: 'Decode',
    keywords: ['clipboard'],
    enabled: !!result,
    handler: () => { void copy() },
  })

  const scanning = camState === 'scanning'
  const starting = camState === 'starting'

  useAction('dec:camera', {
    label: scanning ? 'Stop camera scan' : 'Scan a QR with the camera',
    group: 'Decode',
    keywords: ['camera', 'scan', 'webcam'],
    handler: () => { if (scanning) stopCamera(); else void startCamera() },
  })

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  return (
    <section className="decoder" id="decode">
      <h2>Scan</h2>
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

      <div className="cam-controls">
        <button type="button" onClick={() => { if (scanning || starting) stopCamera(); else void startCamera() }}>
          {scanning ? 'Stop camera' : starting ? 'Starting… (cancel)' : 'Scan with camera'}
        </button>
      </div>

      <div className={`camera ${scanning ? 'live' : ''}`} hidden={!scanning && !starting}>
        <video ref={videoRef} muted playsInline />
      </div>

      {camError && <pre className="err">{camError}</pre>}

      {imgUrl && (
        <div className="thumb">
          <img
            src={imgUrl}
            alt="scanned QR"
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
