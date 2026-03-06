# Universal Scraper

A website that pulls images from any webpage and lets you download them — individually or as a zip.

No installation. No account. Just open it in a browser and paste a URL.

---

## What it does

1. You paste a URL
2. It fetches the page and finds the main content area
3. It shows you all the images it found
4. You select the ones you want and download them

Ads, navigation icons, and tracking pixels are filtered out automatically. Everything else is shown so you can decide what to keep.

---

## How to use it

**Live version** (if hosted on GitHub Pages):
Just open the link and start using it.

**Running it yourself:**
Download the three files and open `index.html` in any browser. That's it.

```
index.html   ← open this
style.css
app.js
```

---

## The CORS proxy

Because of how browsers work, the website can't fetch pages directly from other domains — it needs a middleman called a CORS proxy.

A proxy is pre-selected by default (corsproxy.io). If a page fails to load, try switching to a different one in the dropdown.

> **Amazon and other large retail sites** will return an error — their pages are simply too big for the proxy to handle. This is a known limitation.

---

## Downloading images

- **Click a card** to select it (green border = selected)
- **Hover a card** for a fullscreen preview and a single-image download button
- **Select All** to grab everything at once
- **Download Selected** → single image if only one is selected, otherwise a `.zip`
- **Download All** → same logic, downloads everything found on the page

---

## Files

| File | What it does |
|---|---|
| `index.html` | The page structure and fullscreen lightbox |
| `style.css` | All the visual styling |
| `app.js` | Everything else: fetching, parsing, filtering, selection, downloads |

---

## Hosting on GitHub Pages

1. Push all three files to a repo
2. Go to **Settings → Pages → Deploy from branch** (select `main`, root folder)
3. Your site will be live at `https://your-username.github.io/your-repo/`

---

## Dependencies

- [JSZip](https://stuk.github.io/jszip/) — for bundling multiple images into a single zip download
- [IBM Plex Mono/Sans](https://fonts.google.com/specimen/IBM+Plex+Mono) — fonts, loaded from Google Fonts

Both load automatically — nothing to install.

---

## Browser support

Works in any modern browser: Chrome, Firefox, Safari, Edge.
