# Universal Scraper

A fully client-side web tool that extracts main-content images from any URL — filtering out ads, sidebars, and UI chrome — with selection, fullscreen preview, and zip download.

No server. No API key. No build step. Drop the three files in a folder and open `index.html`.

![Universal Scraper](https://img.shields.io/badge/client--side-DOMParser-00dda0?style=flat-square) ![License](https://img.shields.io/github/license/vyzzze/universalscraper)

---

## How it works

1. **Fetch** — the target page HTML is fetched through a CORS proxy
2. **Parse** — `DOMParser` converts the raw HTML into a live DOM tree
3. **Score** — a weighted heuristics engine evaluates every candidate container to find the main content area (`<main>`, `[role=main]`, `<article>`, `#mw-content-text`, etc.)
4. **Extract** — all image sources are collected from the container: `src`, `srcset`, `data-src`/`data-lazy`, `<picture>`, inline `background-image`, SVG `<image>`
5. **Filter** — ad networks and tracker pixels are removed; everything else is shown so you can decide
6. **Select & download** — pick images manually, or grab them all as a `.zip`

---

## Features

| Feature | Detail |
|---|---|
| Main-content detection | 6-factor weighted scoring: semantic role, image density, text richness, heading presence, DOM depth, ad-keyword penalty |
| Image sources | `<img src>`, `srcset` (best resolution), `data-src`/`data-lazy`, `<picture>`, CSS `background-image`, SVG `<image>` |
| Deduplication | Wikimedia-style `/NNNpx-filename` suffix stripping so srcset + img-src variants of the same file don't both appear |
| Ad filtering | Blocks 17 known ad/tracking domains + tracker pixel URL patterns |
| Selection UI | Click cards or use Select All to build a download set |
| Download single | Hover any card → download icon, or open in lightbox → Download |
| Download multiple | 2+ images → automatic `.zip` via JSZip (parallel fetch, deduplicated filenames) |
| Fullscreen lightbox | Click any image or the expand icon; close with `Esc` or click outside |
| Debug views | Log tab (per-step timing + categories), JSON tab (full structured output), Excluded tab |
| CORS proxy selector | corsproxy.io · allorigins.win · cors-anywhere · none |
| 413 handling | Clear error message for large sites (Amazon, eBay) that exceed proxy body limits |

---

## Usage

### GitHub Pages (recommended)

```
your-repo/
├── index.html
├── style.css
└── app.js
```

Push to `main`, then go to **Settings → Pages → Deploy from branch (main / root)**. Your tool is live at `https://your-username.github.io/your-repo/`.

### Local

```bash
# Any static file server works — examples:
npx serve .
python3 -m http.server 8080
```

Or just open `index.html` directly in your browser (CORS proxy is still required for fetching remote pages).

---

## CORS Proxies

A CORS proxy is required because browsers block cross-origin `fetch()` requests to arbitrary URLs.

| Proxy | Notes |
|---|---|
| **corsproxy.io** | Default. Works for most public pages. |
| **allorigins.win** | Good fallback if corsproxy.io fails. |
| **cors-anywhere** | Requires [manual activation](https://cors-anywhere.herokuapp.com/corsdemo) before first use. |
| **none** | Only works for same-origin URLs. |

> **Amazon, eBay and similar large retail sites** return HTTP 413 because their HTML exceeds the proxy's body limit. This is a proxy-side constraint and can't be worked around in a purely client-side tool.

---

## Project structure

```
index.html   — shell, lightbox overlay, CDN links
style.css    — all styles: terminal/radar design system, card grid, lightbox, toolbar
app.js       — scraper engine: config, heuristics, extraction, filtering, render, download
```

### `app.js` internals

```
CFG                  configuration: ad domains, ad keywords, excluded tags,
                     semantic selectors, scoring weights

findContainer()      scores every candidate DOM element and returns the
                     highest-scoring main content container

extractImages()      walks the container collecting all image URLs from
                     every possible source attribute

filterImages()       separates included vs excluded; only hard-blocks
                     ad domains and tracker pixel patterns

downloadAsZip()      fetches all URLs in parallel via Promise.all,
                     packs into a JSZip blob, triggers a single download

openLightbox()       fullscreen modal with URL bar and per-image download
toggleSelect()       manages the selectedUrls Set and updates card UI
updateToolbar()      keeps the download toolbar count in sync
```

---

## Heuristics scoring

The container detector scores every `<div>`, `<section>`, `<article>`, and `<main>` element using six signals:

| Signal | Weight |
|---|---|
| Has `role="main"` or is `<main>` | +50 |
| Is `<article>` | +30 |
| Matches a semantic selector (`.mw-parser-output`, `#content`, etc.) | +20 |
| Contains `<h1>` or `<h2>` | +10 |
| Image count (capped at +20) | up to +20 |
| Text richness (capped at +15) | up to +15 |
| Child element count (capped at +12) | up to +12 |
| Ad/chrome keyword in `class` or `id` | −80 |
| Inside an excluded structural ancestor (`<nav>`, `<aside>`, `<footer>`, etc.) | −60 |
| DOM depth penalty (per level, capped at −20) | up to −20 |

The top five candidates and their scores are written to the Log tab on every run.

---

## Filtering philosophy

The filter is intentionally lenient. Only two categories of images are automatically excluded:

- **Ad/tracking domains** — a curated list of 17 known ad networks and tracking services
- **Tracker pixel patterns** — URL patterns like `spacer.gif`, `1x1`, `beacon.gif`, `pixel.gif`

Size-based filtering is intentionally absent. HTML `width`/`height` attributes reflect rendered thumbnail dimensions, not actual image dimensions — filtering on them would incorrectly exclude real content images. Users can reject unwanted images by simply not selecting them.

---

## Dependencies

| Library | Version | Purpose |
|---|---|---|
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | Pack multiple images into a single `.zip` download |
| [IBM Plex Mono / Sans](https://fonts.google.com/specimen/IBM+Plex+Mono) | — | Typography (loaded from Google Fonts) |

Both are loaded from CDN — no `npm install` required.

---

## Browser support

Any modern browser (Chrome 80+, Firefox 75+, Safari 14+, Edge 80+). Uses: `fetch`, `DOMParser`, `AbortSignal.timeout`, `CSS.escape`, `navigator.clipboard`, `URL.createObjectURL`.

---

## License

Apache-2.0
