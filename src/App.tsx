import { useCallback } from 'react'
import { useUrlStates } from 'use-prms'
import Decoder from './components/Decoder'
import Encoder from './components/Encoder'
import type { DecodeResult } from './lib/decode'
import { PARAMS } from './lib/params'
import { getQRInfo } from './lib/qr'
import './App.sass'

export default function App() {
  const { values, setValues } = useUrlStates(PARAMS)

  // A decoded QR seeds the encoder with everything we could recover from
  // the image, so customizing an existing code is one drop/paste away.
  const onDecoded = useCallback((r: DecodeResult) => {
    const auto = getQRInfo(r.data, r.ecl)
    setValues({
      t: r.data,
      u: false,
      ecl: r.ecl,
      v: auto?.version === r.version ? 0 : r.version,
      s: r.scale,
      m: r.margin,
      fg: r.fg,
      bg: r.bg,
    })
  }, [setValues])

  return (
    <div className="app">
      <header>
        <h1>QR</h1>
        <p className="tagline">
          Static, browser-only QR generator + decoder. No accounts, no redirects, smallest-possible QRs.
        </p>
      </header>
      <main>
        <Encoder values={values} setValues={setValues} />
        <Decoder onDecoded={onDecoded} />
      </main>
      <footer>
        <a href="https://github.com/runsascoded/qr" target="_blank" rel="noopener noreferrer">source</a>
      </footer>
    </div>
  )
}
