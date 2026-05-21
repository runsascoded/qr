/// <reference types="@cloudflare/workers-types" />

// Per-request OpenGraph/Twitter <meta> rewriting. A shared `?text=…` link
// gets a link preview of *that* QR — which static GitHub Pages can't do,
// but a Cloudflare Pages Function can. Crawlers don't run JS, so the tags
// have to be correct in the HTML as served.

class AttrSetter {
  constructor(private attr: string, private value: string) {}
  element(el: Element) {
    el.setAttribute(this.attr, this.value)
  }
}

const clip = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s

export const onRequest: PagesFunction = async (ctx) => {
  const res = await ctx.next()
  if (!(res.headers.get('content-type') ?? '').includes('text/html')) return res

  const url = new URL(ctx.request.url)
  const text = url.searchParams.get('text')
  if (!text) return res // default page keeps the static /og.jpg tags

  const image = `${url.origin}/og?${url.searchParams}`
  const title = `QR — ${clip(text, 60)}`
  const desc = `Scan-ready QR code for ${clip(text, 120)}`
  const set = (attr: string, value: string) => new AttrSetter(attr, value)

  return new HTMLRewriter()
    .on('meta[property="og:url"]', set('content', url.href))
    .on('meta[property="og:title"]', set('content', title))
    .on('meta[name="twitter:title"]', set('content', title))
    .on('meta[property="og:description"]', set('content', desc))
    .on('meta[name="twitter:description"]', set('content', desc))
    .on('meta[property="og:image"]', set('content', image))
    .on('meta[name="twitter:image"]', set('content', image))
    .transform(res)
}
