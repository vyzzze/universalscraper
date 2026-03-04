/* ═══════════════════════════════════════════════════════════════════════════
   Universal Scraper — app.js
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const CFG = {
  // Only block actual ad/tracking domains — size filters removed so the user
  // can decide which images are relevant via manual selection.
  adDomains: [
    'doubleclick.net', 'googlesyndication.com', 'adservice.google',
    'adnxs.com', 'pubmatic.com', 'rubiconproject.com', 'openx.net',
    'criteo.com', 'amazon-adsystem.com', 'taboola.com', 'outbrain.com',
    'moatads.com', 'scorecardresearch.com', 'connect.facebook.net',
    'media.net', 'lijit.com', 'adsafeprotected.com',
  ],

  adKeywords: [
    'sidebar', 'side-bar', 'side_bar', 'advert', 'advertisement',
    'ads-', '-ads', '_ads', 'ad-unit', 'adsbygoogle', 'dfp-',
    'sponsor', 'sponsored', 'promoted', 'promo-',
    'banner', 'leaderboard', 'billboard', 'skyscraper', 'mpu-',
    'topbar', 'top-bar', 'toolbar', 'navbar', 'nav-bar',
    'site-header', 'global-header', 'page-header', 'masthead',
    'footer', 'site-footer', 'global-footer',
    'cookie-notice', 'gdpr', 'consent',
    'social-share', 'social-icons', 'share-bar',
    'tracking', 'pixel', 'beacon',
  ],

  excludedTags: ['aside', 'nav', 'header', 'footer', 'script', 'style', 'noscript', 'form'],

  semanticSelectors: [
    '[role="main"]', 'main', 'article',
    '#content', '#main-content', '#main', '#bodyContent', '#mw-content-text',
    '.main-content', '.content', '.article-body', '.post-body',
    '.entry-content', '.page-content', '.wiki-content', '.mw-parser-output',
    '.product-gallery', '.product-images', '.gallery-container',
  ],

  scoring: {
    roleMain: 50, article: 30, semanticHint: 20,
    heading: 10, adKeyword: -80, excludedTag: -60,
  },
};


// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────

let lastResult    = null;
let activeTab     = 'included';
let selectedUrls  = new Set();   // URLs of selected images
let lightboxUrl   = null;        // URL currently shown in lightbox

const LOGS = [];
let logTs  = 0;

function addLog(level, cat, msg) {
  LOGS.push({ ts: logTs, level, category: cat, message: msg });
  logTs += 10 + Math.floor(Math.random() * 22);
}


// ─────────────────────────────────────────────────────────────────────────────
// DOM HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const $  = id => document.getElementById(id);
const qs = s  => document.querySelector(s);

function setStatus(msg, mode = '') {
  $('statusBar').className = 'status-bar' + (mode ? ' ' + mode : '');
  $('statusMsg').textContent = msg;
}
function setStep(id, state) { const el = $(id); if (el) el.className = 'pstep ' + state; }
function setScan(on)        { $('scanOverlay').className = 'scan-overlay' + (on ? ' on' : ''); }
function resetSteps()       { ['s0','s1','s2','s3','s4'].forEach(id => setStep(id, '')); }

function esc(s)  { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escA(s) { return String(s||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

const sleep = ms => new Promise(r => setTimeout(r, ms));


// ─────────────────────────────────────────────────────────────────────────────
// LIGHTBOX
// ─────────────────────────────────────────────────────────────────────────────

function openLightbox(url, alt) {
  lightboxUrl = url;
  const lb  = $('lightbox');
  const img = $('lbImg');
  img.src   = url;
  img.alt   = alt || '';
  $('lbUrl').textContent = url;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  $('lightbox').classList.remove('open');
  $('lbImg').src = '';
  lightboxUrl    = null;
  document.body.style.overflow = '';
}

// Close on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLightbox();
});


// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch a URL and return a Blob, or null on failure */
async function fetchBlob(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.blob();
  } catch {
    return null;  // CORS-blocked or network error — skip silently
  }
}

/** Trigger a browser download for a Blob */
function triggerDownload(blob, filename) {
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}

/** Download a single image — blob download with window.open fallback */
async function downloadBlob(url, filename) {
  const blob = await fetchBlob(url);
  if (blob) {
    triggerDownload(blob, filename || filenameFromUrl(url));
  } else {
    window.open(url, '_blank');  // CORS fallback
  }
}

/** Download the image currently open in the lightbox */
function downloadSingle() {
  if (lightboxUrl) downloadBlob(lightboxUrl, filenameFromUrl(lightboxUrl));
}

/** Download a card's image directly (hover button) */
function downloadCard(url, event) {
  event.stopPropagation();
  downloadBlob(url, filenameFromUrl(url));
}

/**
 * Download selected images.
 * • 1 selected  → single file download (same as before)
 * • 2+ selected → fetch all in parallel, pack into a .zip, download once
 */
async function downloadSelected() {
  if (selectedUrls.size === 0) return;

  const urls = [...selectedUrls];

  if (urls.length === 1) {
    await downloadBlob(urls[0], filenameFromUrl(urls[0]));
    return;
  }

  await downloadAsZip(urls, 'universal-scraper-selected.zip');
}

/**
 * Download ALL included images.
 * • 1 image  → single file
 * • 2+ images → zip
 */
async function downloadAll() {
  if (!lastResult) return;
  const urls = lastResult.images.map(img => img.url);

  if (urls.length === 1) {
    await downloadBlob(urls[0], filenameFromUrl(urls[0]));
    return;
  }

  await downloadAsZip(urls, 'universal-scraper-all.zip');
}

/**
 * Fetch all URLs in parallel, pack into a JSZip, trigger download.
 * Shows progress in the toolbar while running.
 */
async function downloadAsZip(urls, zipFilename) {
  const dlSelBtn = $('dlSelBtn');
  const dlAllBtn = $('dlAllBtn');
  const infoEl   = $('dlInfo');

  // Disable buttons during packing
  if (dlSelBtn) dlSelBtn.disabled = true;
  if (dlAllBtn) dlAllBtn.disabled = true;

  const zip      = new JSZip();
  const usedNames = new Set();

  // Fetch all blobs in parallel
  const results = await Promise.all(
    urls.map(async (url, i) => {
      if (infoEl) infoEl.innerHTML = `Fetching image ${i + 1} of ${urls.length}…`;
      const blob = await fetchBlob(url);
      return { url, blob };
    })
  );

  let added = 0;
  for (const { url, blob } of results) {
    if (!blob) continue;  // skip CORS-blocked images

    // Deduplicate filenames inside the zip
    let name = filenameFromUrl(url);
    if (usedNames.has(name)) {
      const ext  = name.includes('.') ? '.' + name.split('.').pop() : '';
      const base = ext ? name.slice(0, -ext.length) : name;
      let n = 2;
      while (usedNames.has(`${base}-${n}${ext}`)) n++;
      name = `${base}-${n}${ext}`;
    }
    usedNames.add(name);
    zip.file(name, blob);
    added++;
  }

  if (added === 0) {
    if (infoEl) infoEl.innerHTML = `<span style="color:var(--warn)">No images could be fetched (CORS blocked). Try opening images directly.</span>`;
    if (dlSelBtn) dlSelBtn.disabled = selectedUrls.size === 0;
    if (dlAllBtn) dlAllBtn.disabled = false;
    return;
  }

  if (infoEl) infoEl.innerHTML = `Packing ${added} image${added > 1 ? 's' : ''} into zip…`;

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, zipFilename);

  // Restore toolbar state
  if (infoEl) updateToolbar();
  if (dlSelBtn) dlSelBtn.disabled = selectedUrls.size === 0;
  if (dlAllBtn) dlAllBtn.disabled = false;
}

function filenameFromUrl(url) {
  try {
    const p = new URL(url).pathname;
    const f = p.split('/').pop().split('?')[0];
    return f || 'image';
  } catch { return 'image'; }
}


// ─────────────────────────────────────────────────────────────────────────────
// SELECTION
// ─────────────────────────────────────────────────────────────────────────────

function toggleSelect(url, event) {
  if (event) event.stopPropagation();
  if (selectedUrls.has(url)) {
    selectedUrls.delete(url);
  } else {
    selectedUrls.add(url);
  }
  // Update card UI without full re-render
  const card = document.querySelector(`.img-card[data-url="${CSS.escape(url)}"]`);
  if (card) card.classList.toggle('selected', selectedUrls.has(url));
  updateToolbar();
}

function selectAll() {
  if (!lastResult) return;
  lastResult.images.forEach(img => selectedUrls.add(img.url));
  document.querySelectorAll('.img-card:not(.excl)').forEach(c => c.classList.add('selected'));
  updateToolbar();
}

function deselectAll() {
  selectedUrls.clear();
  document.querySelectorAll('.img-card').forEach(c => c.classList.remove('selected'));
  updateToolbar();
}

function updateToolbar() {
  const n        = selectedUrls.size;
  const total    = lastResult ? lastResult.images.length : 0;
  const infoEl   = $('dlInfo');
  const dlSelBtn = $('dlSelBtn');
  if (!infoEl) return;

  if (n === 0) {
    infoEl.innerHTML = `<strong>${total}</strong> images found — select to download individually, or use Download All`;
  } else {
    infoEl.innerHTML = `<strong>${n}</strong> of ${total} selected`;
  }

  if (dlSelBtn) {
    dlSelBtn.disabled    = n === 0;
    dlSelBtn.textContent = n > 0 ? `Download Selected (${n})` : 'Download Selected';
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// MAIN ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  const url      = $('urlInput').value.trim();
  const proxyPfx = $('proxySelect').value;

  if (!url) { setStatus('please enter a URL', 'error'); return; }
  try { new URL(url); } catch { setStatus('invalid URL — include https://', 'error'); return; }

  LOGS.length = 0; logTs = 0; lastResult = null; activeTab = 'included';
  selectedUrls.clear();
  $('results').innerHTML = '';
  $('runBtn').disabled   = true;
  resetSteps();
  setScan(true);

  try {
    // ── Step 1: Fetch ─────────────────────────────────────────────────────────
    setStatus('fetching…', 'running');
    setStep('s0', 'active');
    addLog('info', 'network', `fetch ${url}`);
    addLog('info', 'network', `cors proxy: ${proxyPfx || 'none'}`);

    const fetchUrl = proxyPfx ? proxyPfx + encodeURIComponent(url) : url;
    let html;
    try {
      const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(20_000) });
      if (res.status === 413) throw new Error(`HTTP 413 — page too large for the CORS proxy. Large retail sites (Amazon, eBay) often exceed proxy body limits.`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
      addLog('info', 'network', `received ${(html.length / 1024).toFixed(1)} KB`);
    } catch (e) {
      const msg = e.message;
      throw new Error(msg.startsWith('HTTP') ? msg : `fetch failed: ${msg} — try switching the CORS proxy`);
    }
    setStep('s0', 'done'); await sleep(50);

    // ── Step 2: Parse DOM ─────────────────────────────────────────────────────
    setStatus('parsing DOM…', 'running');
    setStep('s1', 'active');
    addLog('info', 'scraper', 'DOMParser.parseFromString');
    const parser  = new DOMParser();
    const doc     = parser.parseFromString(html, 'text/html');
    const baseEl  = doc.createElement('base');
    baseEl.href   = url;
    doc.head.prepend(baseEl);
    addLog('info', 'scraper', `${doc.querySelectorAll('*').length} elements in parsed DOM`);
    setStep('s1', 'done'); await sleep(50);

    // ── Step 3: Score containers ──────────────────────────────────────────────
    setStatus('detecting main container…', 'running');
    setStep('s2', 'active');
    const container = findContainer(doc, url);
    addLog('info', 'heuristics', `winner: "${container.selector}" score=${container.score.toFixed(1)}`);
    setStep('s2', 'done'); await sleep(50);

    // ── Step 4: Extract images ────────────────────────────────────────────────
    setStatus('extracting images…', 'running');
    setStep('s3', 'active');
    const raw = extractImages(doc, container.el, url);
    addLog('info', 'extractor', `${raw.length} raw image candidates`);
    setStep('s3', 'done'); await sleep(50);

    // ── Step 5: Filter ────────────────────────────────────────────────────────
    setStatus('filtering…', 'running');
    setStep('s4', 'active');
    const { included, excluded } = filterImages(raw, container);
    addLog('info', 'filter', `included:${included.length}  excluded:${excluded.length}`);
    setStep('s4', 'done'); await sleep(50);

    lastResult = {
      metadata: {
        url, scrapedAt: new Date().toISOString(),
        totalRaw: raw.length,
        totalIncluded: included.length,
        totalExcluded: excluded.length,
        containerSelector: container.selector,
        containerScore: +container.score.toFixed(2),
        containerNotes: container.notes,
      },
      images:   included,
      excluded: excluded,
      log:      LOGS.slice(),
    };

    setStatus(`${included.length} included · ${excluded.length} excluded · ${raw.length} total`, 'done');
    renderResults(lastResult);

  } catch (err) {
    setStatus(err.message, 'error');
    addLog('error', 'scraper', err.message);
    $('results').innerHTML = `
      <div class="warn-box">⚠ ${esc(err.message)}</div>
      <div class="info-box">
        <strong>Troubleshooting</strong><br>
        · A CORS proxy is required — make sure one is selected<br>
        · Try switching to <strong>allorigins.win</strong> if corsproxy.io fails<br>
        · cors-anywhere requires <a href="https://cors-anywhere.herokuapp.com/corsdemo" target="_blank">manual activation</a><br>
        · Some sites block all third-party fetching — try another URL
      </div>`;
  } finally {
    $('runBtn').disabled = false;
    setScan(false);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// HEURISTICS
// ─────────────────────────────────────────────────────────────────────────────

function findContainer(doc, baseUrl) {
  const candidates = [];
  const seen       = new Set();

  function addCandidate(el, hintSel) {
    if (!el || seen.has(el)) return;
    seen.add(el);
    candidates.push({ el, hintSel });
  }

  for (const sel of CFG.semanticSelectors) {
    try { doc.querySelectorAll(sel).forEach(el => addCandidate(el, sel)); } catch {}
  }
  doc.querySelectorAll('div, section, article, main').forEach(el => addCandidate(el, null));

  addLog('info', 'heuristics', `scoring ${candidates.length} candidates`);

  const scored = [];
  for (const { el, hintSel } of candidates) {
    const tag  = el.tagName.toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (CFG.excludedTags.includes(tag)) continue;

    const imgCount = el.querySelectorAll('img').length;
    const textLen  = el.textContent.trim().length;
    if (textLen < 30 && imgCount === 0) continue;

    let score = 0;
    const notes = [];

    // Semantic role
    if (tag === 'main' || role === 'main') {
      score += CFG.scoring.roleMain; notes.push('semantic:main');
    } else if (tag === 'article') {
      score += CFG.scoring.article; notes.push('semantic:article');
    } else if (hintSel) {
      score += CFG.scoring.semanticHint; notes.push(`hint:${hintSel}`);
    }

    // Image density proxy
    const imgScore = Math.min(imgCount * 3, 20);
    score += imgScore;
    if (imgCount > 0) notes.push(`imgs:${imgCount}(+${imgScore | 0})`);

    // Text richness
    const textScore = Math.min(textLen / 500, 1) * 15;
    score += textScore;
    notes.push(`text:${textScore.toFixed(1)}`);

    // Heading presence
    if (el.querySelector('h1, h2')) { score += CFG.scoring.heading; notes.push('has-heading'); }

    // Depth penalty
    let depth = 0, p = el.parentElement;
    while (p && p !== doc.body) { depth++; p = p.parentElement; }
    const dp = Math.min(depth * 1.5, 20);
    score -= dp;
    notes.push(`depth:${depth}(-${dp | 0})`);

    // Breadth bonus
    score += Math.min(el.children.length * 0.4, 12);

    // Ad keyword penalty
    const classId = ((el.className || '') + ' ' + (el.id || '')).toLowerCase();
    if (CFG.adKeywords.some(k => classId.includes(k))) {
      score += CFG.scoring.adKeyword; notes.push('ad-penalty');
    }

    // Excluded ancestor penalty
    let inBad = false;
    let anc   = el.parentElement;
    while (anc && anc !== doc.body) {
      if (CFG.excludedTags.includes(anc.tagName.toLowerCase())) { inBad = true; break; }
      anc = anc.parentElement;
    }
    if (inBad) { score += CFG.scoring.excludedTag; notes.push('in-excl-ancestor'); }

    scored.push({ el, selector: buildSelector(el), score, notes, imgCount });
  }

  if (scored.length === 0) {
    addLog('warn', 'heuristics', 'no scoreable containers — using <body>');
    return { el: doc.body, selector: 'body', score: 0, notes: ['fallback:body'] };
  }

  scored.sort((a, b) => b.score - a.score);
  scored.slice(0, 5).forEach((c, i) =>
    addLog('info', 'heuristics', `  [${i + 1}] score=${c.score.toFixed(1)}  "${c.selector}"  [${c.notes.join(', ')}]`)
  );

  return scored[0];
}


// ─────────────────────────────────────────────────────────────────────────────
// IMAGE EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

function extractImages(doc, container, baseUrl) {
  const results = [];
  const seenKey = new Set();

  function resolveUrl(href) {
    if (!href) return null;
    href = href.trim();
    if (!href || href === '#') return null;
    if (href.startsWith('data:') && href.length < 300) return null;
    if (href.startsWith('data:')) return href;
    try { return new URL(href, baseUrl).href; } catch { return null; }
  }

  function parseSrcset(ss) {
    return (ss || '').split(',')
      .map(s => {
        const parts = s.trim().split(/\s+/);
        const desc  = parts[1] || '';
        return { url: parts[0], w: desc.endsWith('w') ? parseInt(desc, 10) : 0, x: desc.endsWith('x') ? parseFloat(desc) : 1 };
      })
      .filter(c => c.url)
      .sort((a, b) => (b.w || b.x * 1000) - (a.w || a.x * 1000));
  }

  function push(url, source, el, extra = {}) {
    // Canonical dedup key — strips Wikimedia /NNNpx-filename suffix so
    // srcset-best and img-src variants of the same file don't both appear
    let key = url.split('?')[0];
    key = key.replace(/\/\d+px-[^/]+$/, '');
    if (!url || seenKey.has(key)) return;
    seenKey.add(key);

    const w = parseInt(el.getAttribute('width')  || el.getAttribute('data-width')  || '0', 10) || null;
    const h = parseInt(el.getAttribute('height') || el.getAttribute('data-height') || '0', 10) || null;
    results.push({
      url, absolute_url: url, source, width: w, height: h,
      alt: el.getAttribute('alt') || '',
      originElementSelector: buildSelector(el),
      hash: simpleHash(url), isMainContainer: true, ...extra,
    });
  }

  container.querySelectorAll('*').forEach(el => {
    const tag = el.tagName.toLowerCase();

    if (tag === 'img') {
      const lazySrc = el.getAttribute('data-src') || el.getAttribute('data-lazy') ||
                      el.getAttribute('data-lazy-src') || el.getAttribute('data-original') ||
                      el.getAttribute('data-full-url');
      const srcset  = el.getAttribute('srcset') || el.getAttribute('data-srcset') || '';
      const src     = el.getAttribute('src') || lazySrc || '';
      if (srcset) {
        const best = parseSrcset(srcset)[0];
        if (best) { const u = resolveUrl(best.url); if (u) push(u, 'srcset-best', el, { srcsetDescriptor: `${best.w || best.x}` }); }
      }
      if (src) { const u = resolveUrl(src); if (u) push(u, lazySrc ? 'data-lazy' : 'img-src', el); }
    }

    if (tag === 'source' && el.closest('picture')) {
      const best = parseSrcset(el.getAttribute('srcset') || '')[0];
      if (best) { const u = resolveUrl(best.url); if (u) push(u, 'picture-source', el); }
    }

    const bgMatch = (el.getAttribute('style') || '').match(/background(?:-image)?\s*:\s*url\(["']?(.+?)["']?\)/i);
    if (bgMatch) { const u = resolveUrl(bgMatch[1]); if (u && !u.startsWith('data:')) push(u, 'background-image', el); }

    if (tag === 'image') {
      const href = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
      const u = resolveUrl(href); if (u) push(u, 'svg-image', el);
    }
  });

  return results;
}


// ─────────────────────────────────────────────────────────────────────────────
// FILTERING — relaxed: only blocks ads & trackers, no size filter
// User selects which images they want via the UI checkboxes
// ─────────────────────────────────────────────────────────────────────────────

function filterImages(raw, container) {
  const included = [], excluded = [];
  for (const img of raw) {
    const reason = getExclusionReason(img);
    if (reason) {
      img.exclusionReason = reason; img.isMainContainer = false;
      excluded.push(img);
      addLog('debug', 'filter', `EXCL [${reason}] ${img.url.slice(0, 72)}`);
    } else {
      img.inclusionReason = container.notes.slice(0, 3).join(', ') + ` | source:${img.source}`;
      included.push(img);
      addLog('debug', 'filter', `INCL ${img.url.slice(0, 72)}`);
    }
  }
  return { included, excluded };
}

function getExclusionReason(img) {
  const url = img.url || '';
  let host  = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch {}

  // Block ad/tracking domains
  for (const d of CFG.adDomains) {
    if (host.includes(d) || url.toLowerCase().includes(d)) return `ad-domain:${d}`;
  }

  // Block tracker pixel URL patterns
  if (/(\b1x1\b|spacer\.gif|blank\.gif|transparent\.gif|pixel\.gif|beacon\.gif)/i.test(url))
    return 'tracker-pixel-pattern';

  // Block placeholder data-URIs
  if (url.startsWith('data:') && url.length < 150) return 'data-uri-placeholder';

  // NOTE: size filter intentionally removed — user decides via selection UI
  return null;
}


// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function buildSelector(el) {
  if (!el || el.tagName === 'BODY') return 'body';
  if (el.id) return '#' + el.id;
  const parts = [];
  let cur = el;
  for (let i = 0; i < 5 && cur && cur.tagName !== 'BODY'; i++) {
    let s   = cur.tagName.toLowerCase();
    const c = (cur.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    if (c) s += '.' + c;
    parts.unshift(s);
    cur = cur.parentElement;
  }
  return parts.join(' > ');
}

function simpleHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, '0');
}


// ─────────────────────────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────────────────────────

function renderResults(data) {
  const showExcl = $('optExcluded').checked;
  const showLog  = $('optLog').checked;
  const showJson = $('optJson').checked;
  let h = '';

  // ── Meta strip ───────────────────────────────────────────────────────────────
  h += `<div class="meta-strip">
    <div class="meta-card"><div class="meta-val">${data.metadata.totalIncluded}</div><div class="meta-key">included</div></div>
    <div class="meta-card"><div class="meta-val warn">${data.metadata.totalExcluded}</div><div class="meta-key">excluded</div></div>
    <div class="meta-card"><div class="meta-val blue">${data.metadata.totalRaw}</div><div class="meta-key">total raw</div></div>
    <div class="meta-card"><div class="meta-val" style="font-size:16px">${data.metadata.containerScore.toFixed(1)}</div><div class="meta-key">container score</div></div>
  </div>`;

  // ── Container info ────────────────────────────────────────────────────────────
  const notes = data.metadata.containerNotes || [];
  h += `<div class="container-box">
    <span class="cb-label">container</span>
    <span class="cb-sel">${esc(data.metadata.containerSelector)}</span>
    <span class="cb-label">signals</span>
    <div class="cb-notes">${notes.map((n, i) => `<span class="note-chip ${i > 0 ? 'blue' : ''}">${esc(n)}</span>`).join('')}</div>
  </div>`;

  // ── Download toolbar ──────────────────────────────────────────────────────────
  h += `<div class="dl-toolbar">
    <span class="dl-info" id="dlInfo">
      <strong>${data.images.length}</strong> images found — select to download individually, or use Download All
    </span>
    <button class="btn-select-all" onclick="selectAll()">Select All</button>
    <button class="btn-select-all" onclick="deselectAll()">Deselect</button>
    <button class="btn-dl secondary" id="dlSelBtn" onclick="downloadSelected()" disabled>Download Selected</button>
    <button class="btn-dl primary" id="dlAllBtn" onclick="downloadAll()">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M6 1v6M3 4.5l3 3 3-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="1" y1="10.5" x2="11" y2="10.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      </svg>
      Download All (${data.images.length})
    </button>
  </div>`;

  // ── Tabs ──────────────────────────────────────────────────────────────────────
  const tabs = [{ id: 'included', label: 'Included', count: data.images.length }];
  if (showExcl) tabs.push({ id: 'excluded', label: 'Excluded', count: data.excluded.length });
  if (showLog)  tabs.push({ id: 'log',      label: 'Log',      count: data.log.length });
  if (showJson) tabs.push({ id: 'json',     label: 'JSON',     count: null });

  h += `<div class="tabs">${tabs.map(t => `
    <button class="tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="switchTab('${t.id}')">
      ${t.label}
      ${t.count !== null ? `<span class="tab-count">${t.count}</span>` : ''}
    </button>`).join('')}</div>`;

  // ── Panes ─────────────────────────────────────────────────────────────────────
  h += `<div id="panes">`;

  h += mkPane('included',
    data.images.length === 0
      ? `<div class="empty-state" data-icon="🔍">no main-content images found</div>`
      : `<div class="image-grid">${data.images.map(img => imgCard(img, false)).join('')}</div>`
  );

  if (showExcl) {
    h += mkPane('excluded',
      data.excluded.length === 0
        ? `<div class="empty-state" data-icon="✓">nothing excluded</div>`
        : `<div class="image-grid">${data.excluded.map(img => imgCard(img, true)).join('')}</div>`
    );
  }

  if (showLog) {
    h += mkPane('log', `<div class="log-view">${
      data.log.map(e => `
        <div class="log-entry">
          <span class="log-ts">${e.ts}ms</span>
          <span class="log-cat cat-${e.category || 'scraper'}">[${e.category}]</span>
          <span class="log-msg">${esc(e.message)}</span>
        </div>`).join('')
    }</div>`);
  }

  if (showJson) {
    const j = JSON.stringify(data, null, 2);
    h += mkPane('json', `<button class="copy-btn" onclick="copyJson()">Copy JSON</button><div class="json-view">${syntaxHighlight(esc(j))}</div>`);
  }

  h += `</div>`; // #panes
  $('results').innerHTML = h;

  // Wire thumbnail lazy-load
  document.querySelectorAll('.img-thumb img').forEach(img => {
    img.onload  = () => img.classList.add('loaded');
    img.onerror = () => { img.style.display = 'none'; };
  });
}

function mkPane(name, content) {
  return `<div id="pane-${name}" style="display:${activeTab === name ? 'block' : 'none'}">${content}</div>`;
}

function imgCard(img, isExcl) {
  const sz  = (img.width && img.height) ? `${img.width}×${img.height}` : '?×?';
  const rsn = isExcl ? img.exclusionReason : img.inclusionReason;
  const sel = !isExcl && selectedUrls.has(img.url);

  return `
    <div class="img-card${isExcl ? ' excl' : ''}${sel ? ' selected' : ''}"
         data-url="${escA(img.url)}"
         onclick="${isExcl ? '' : `toggleSelect('${escA(img.url)}', event)`}">

      ${!isExcl ? `
      <div class="img-checkbox" onclick="toggleSelect('${escA(img.url)}', event)">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>` : ''}

      <div class="img-actions">
        <button class="img-action-btn" title="Fullscreen"
          onclick="event.stopPropagation(); openLightbox('${escA(img.url)}', '${escA(img.alt || '')}')">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 4V1h3M8 1h3v3M11 8v3H8M4 11H1V8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        ${!isExcl ? `
        <button class="img-action-btn" title="Download"
          onclick="downloadCard('${escA(img.url)}', event)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v7M3 5.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="1" y1="11" x2="11" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>` : ''}
      </div>

      <div class="img-thumb">
        <span class="img-ph">no preview</span>
        <img src="${escA(img.url)}" loading="lazy" alt="${escA(img.alt || '')}">
      </div>
      <div class="img-body">
        <div class="img-url">${esc(img.url)}</div>
        <div class="img-meta">
          <span class="img-size">${esc(sz)}</span>
          <span class="img-source-tag">${esc(img.source || '?')}</span>
        </div>
        ${rsn ? `<div class="img-reason${isExcl ? ' excl-reason' : ''}">${esc(rsn)}</div>` : ''}
      </div>
    </div>`;
}

function switchTab(name) {
  activeTab = name;
  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.textContent.trim().toLowerCase().startsWith(name))
  );
  document.querySelectorAll('#panes > div').forEach(pane =>
    pane.style.display = pane.id === 'pane-' + name ? 'block' : 'none'
  );
}

function copyJson() {
  if (!lastResult) return;
  navigator.clipboard.writeText(JSON.stringify(lastResult, null, 2)).then(() => {
    const btn = qs('.copy-btn');
    if (btn) { btn.textContent = 'copied!'; setTimeout(() => { btn.textContent = 'Copy JSON'; }, 1500); }
  });
}

function syntaxHighlight(s) {
  return s
    .replace(/&quot;([\w\-_$.@ ]+?)&quot;:/g, '<span class="jk">"$1"</span>:')
    .replace(/: &quot;(.*?)&quot;/g,           ': <span class="js">"$1"</span>')
    .replace(/: (-?\d+\.?\d*)/g,               ': <span class="jn">$1</span>')
    .replace(/: (true|false)/g,                ': <span class="jb">$1</span>')
    .replace(/: null/g,                        ': <span class="jl">null</span>');
}


// ─────────────────────────────────────────────────────────────────────────────
// EVENT WIRING
// ─────────────────────────────────────────────────────────────────────────────

$('urlInput').addEventListener('keydown', e => { if (e.key === 'Enter') run(); });

['optExcluded', 'optLog', 'optJson'].forEach(id =>
  $(id).addEventListener('change', () => { if (lastResult) renderResults(lastResult); })
);
