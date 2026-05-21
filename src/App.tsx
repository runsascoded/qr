import Decoder from './components/Decoder'
import Encoder from './components/Encoder'
import './App.sass'

export default function App() {
  return (
    <div className="app">
      <header>
        <h1>QR</h1>
        <p className="tagline">
          Static, browser-only QR generator + decoder. No accounts, no redirects, smallest-possible QRs.
        </p>
      </header>
      <main>
        <Encoder />
        <Decoder />
      </main>
      <footer>
        <a href="https://github.com/runsascoded/qr" target="_blank" rel="noopener noreferrer">source</a>
      </footer>
    </div>
  )
}
