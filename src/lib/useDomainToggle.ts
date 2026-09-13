import { useActions } from 'use-kbd'

// `g d` cycles the current URL's host through local → dev → prod, preserving
// path/query/hash, so you never have to remember the dev URL. Direct "Go to …"
// omnibar actions jump to a specific one. Registered at the app root so every
// view inherits it.
const LOCAL = 'http://localhost:3017'
const DEV = 'https://dev.qr.rbw.sh'
const PROD = 'https://qr.rbw.sh'
const CYCLE = [LOCAL, DEV, PROD]

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname.endsWith('.local')
    || /^100\.\d+\.\d+\.\d+$/.test(hostname) // Tailscale 100.64/10 → treat as local
}

// Index of the current origin within CYCLE; localhost on any port counts as
// LOCAL, and an unrecognized host (e.g. a preview alias) counts as PROD so the
// next hop is LOCAL.
function currentIndex(): number {
  const i = CYCLE.indexOf(window.location.origin)
  if (i >= 0) return i
  return isLocalHost(window.location.hostname) ? 0 : CYCLE.length - 1
}

function go(origin: string): void {
  const { pathname, search, hash } = window.location
  window.location.href = `${origin}${pathname}${search}${hash}`
}

export function useDomainToggle(): void {
  useActions({
    'nav:cycleDomain': {
      label: 'Cycle domain (local → dev → prod)',
      group: 'Navigation',
      defaultBindings: ['g d'],
      keywords: ['host', 'localhost', 'staging', 'production'],
      handler: () => go(CYCLE[(currentIndex() + 1) % CYCLE.length]),
    },
    'nav:local': { label: 'Go to localhost', group: 'Navigation', keywords: ['dev server'], handler: () => go(LOCAL) },
    'nav:dev': { label: 'Go to dev / staging', group: 'Navigation', keywords: ['staging'], handler: () => go(DEV) },
    'nav:prod': { label: 'Go to production', group: 'Navigation', keywords: ['prod', 'live'], handler: () => go(PROD) },
  })
}
