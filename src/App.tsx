import { useCallback, useEffect, useState } from 'react'
import { useUrlStates } from 'use-prms'
import { HotkeysProvider, LookupModal, Omnibar, SequenceModal, ShortcutsModal, SpeedDial } from 'use-kbd'
import 'use-kbd/styles.css'
import Decoder from './components/Decoder'
import Encoder from './components/Encoder'
import Tooltip from './components/Tooltip'
import type { DecodeResult } from './lib/decode'
import { PARAMS } from './lib/params'
import { getQRInfo } from './lib/qr'
import { useDomainToggle } from './lib/useDomainToggle'
import './App.sass'

const REPO = 'https://github.com/runsascoded/qr'
const SECTIONS = ['encode', 'decode'] as const
type Section = (typeof SECTIONS)[number]

// A sticky "Encode / Decode" switch: it smooth-scrolls (the sections stay on
// one scrollable page) and highlights whichever half is centered, so the two
// halves are obvious above the fold without hiding either behind a tab.
const SECTION_LABELS: Record<Section, string> = { encode: 'Generate', decode: 'Scan' }

function ModeNav() {
  const [active, setActive] = useState<Section>('encode')
  useEffect(() => {
    // Active = the last section whose top has scrolled above the bottom of the
    // sticky header. Scroll-position based (not an IntersectionObserver band)
    // so "you are here" is unambiguous even with tall sections.
    const update = () => {
      const header = document.querySelector('.app > header')
      const line = header ? header.getBoundingClientRect().bottom : 60
      let cur: Section = SECTIONS[0]
      for (const id of SECTIONS) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top - line <= 0) cur = id
      }
      // A short final section may never reach the top line (the page bottoms
      // out first), so at the end of the scroll it's the one you're viewing.
      const de = document.documentElement
      if (window.scrollY + window.innerHeight >= de.scrollHeight - 4) {
        cur = SECTIONS[SECTIONS.length - 1]
      }
      setActive(cur)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  return (
    <nav className="mode-nav" aria-label="Jump to section">
      {SECTIONS.map(id => {
        const current = active === id
        const below = SECTIONS.indexOf(id) > SECTIONS.indexOf(active)
        return (
          <a key={id} href={`#${id}`} className={current ? 'current' : ''} aria-current={current || undefined}>
            {SECTION_LABELS[id]}
            {!current && <span className="arr" aria-hidden="true">{below ? ' ↓' : ' ↑'}</span>}
          </a>
        )
      })}
    </nav>
  )
}

// Hooks that only register actions must run inside HotkeysProvider; a
// null-rendering registrar is the idiomatic place for them.
function Registrars() {
  useDomainToggle()
  return null
}

const TAGLINE = 'Static, browser-only QR generator + decoder. No accounts, no redirects, smallest-possible QRs.'

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 7v4" strokeLinecap="round" />
      <circle cx="8" cy="4.6" r="0.35" fill="currentColor" stroke="none" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

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
    <HotkeysProvider>
      <div className="app">
        <header>
          <div className="brand">
            <h1>QR</h1>
            <Tooltip label={TAGLINE} openOnClick>
              <button type="button" className="info" aria-label="About this tool"><InfoIcon /></button>
            </Tooltip>
            <a className="gh" href={REPO} target="_blank" rel="noopener noreferrer" aria-label="Source on GitHub"><GitHubIcon /></a>
          </div>
          <ModeNav />
        </header>
        <main>
          <Encoder values={values} setValues={setValues} />
          <Decoder onDecoded={onDecoded} />
        </main>
      </div>

      <Registrars />
      <Omnibar />
      <SequenceModal />
      <ShortcutsModal />
      <LookupModal />
      <SpeedDial actions={[{ key: 'github', label: 'Source on GitHub', icon: <GitHubIcon />, href: REPO }]} />
    </HotkeysProvider>
  )
}
