#!/usr/bin/env node

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const DEFAULTS = { maxPages: 50, timeout: 30000, delay: 500, output: path.join(__dirname, 'output') };

function usage() {
  console.log(`Usage: node crawler.js --url <url> [options]

Options:
  --url <url>             Starting URL (required)
  --output <directory>   Capture directory (default: ./output)
  --max-pages <number>   Maximum pages to crawl (default: 50)
  --timeout <ms>         Navigation/download timeout (default: 30000)
  --delay <ms>           Delay between pages (default: 500)
  --ignore-robots        Ignore robots.txt (only for sites you control)
  --no-assets            Save rendered HTML without downloading assets
  --help                 Show this help
`);
}

function parseArgs(argv) {
  const options = { ...DEFAULTS, assets: true, ignoreRobots: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--ignore-robots') { options.ignoreRobots = true; continue; }
    if (arg === '--no-assets') { options.assets = false; continue; }
    const key = { '--url': 'url', '--output': 'output', '--max-pages': 'maxPages', '--timeout': 'timeout', '--delay': 'delay' }[arg];
    if (!key || i + 1 >= argv.length) throw new Error(`Missing value for ${arg}`);
    options[key] = key === 'url' || key === 'output' ? argv[++i] : Number(argv[++i]);
    if (typeof options[key] === 'number' && (!Number.isFinite(options[key]) || options[key] < 0)) throw new Error(`Invalid value for ${arg}`);
  }
  if (!options.url) throw new Error('--url is required');
  if (!/^https?:\/\//i.test(options.url)) options.url = `https://${options.url}`;
  const parsed = new URL(options.url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('URL must use http or https');
  options.url = normalizeUrl(parsed);
  options.output = path.resolve(options.output);
  return options;
}

function normalizeUrl(value) {
  const url = new URL(value);
  url.hash = '';
  url.search = '';
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString();
}

function safeName(value) { return value.replace(/[^a-z0-9._-]/gi, '_').slice(0, 120) || 'root'; }
function pagePath(urlString, output) {
  const url = new URL(urlString);
  const relative = url.pathname === '/' ? 'index.html' : `${url.pathname.replace(/^\/+|\/+$/g, '')}.html`;
  return path.join(output, 'pages', relative);
}
function assetPath(urlString, output) {
  const url = new URL(urlString);
  const host = safeName(url.hostname);
  let pathname = url.pathname.replace(/^\/+/, '') || 'index';
  if (url.search) pathname += `__${safeName(url.search.slice(1))}`;
  return path.join(output, 'assets', host, pathname);
}

async function robotsFor(context, origin, timeout) {
  try {
    const response = await context.request.get(`${origin}/robots.txt`, { timeout });
    if (!response.ok()) return () => true;
    const text = await response.text();
    let applies = false; const rules = [];
    for (const line of text.split(/\r?\n/)) {
      const [rawKey, ...rest] = line.split(':'); if (!rawKey) continue;
      const key = rawKey.trim().toLowerCase(); const value = rest.join(':').trim();
      if (key === 'user-agent') applies = value === '*' || value.toLowerCase() === 'playwright';
      if (applies && (key === 'disallow' || key === 'allow') && value) rules.push({ allow: key === 'allow', path: value });
    }
    return pathname => rules.filter(rule => pathname.startsWith(rule.path)).sort((a, b) => b.path.length - a.path.length)[0]?.allow !== false;
  } catch { return () => true; }
}

async function scrollPage(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let last = -1; let stable = 0;
      const timer = setInterval(() => {
        window.scrollBy(0, 400);
        const height = document.documentElement.scrollHeight;
        stable = height === last ? stable + 1 : 0; last = height;
        if (window.scrollY + window.innerHeight >= height && stable >= 2) { clearInterval(timer); window.scrollTo(0, 0); resolve(); }
      }, 80);
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2)); if (options.help) return usage();
  fs.mkdirSync(options.output, { recursive: true });
  const start = new URL(options.url); const origin = start.origin; const hostname = start.hostname;
  const report = { startedAt: new Date().toISOString(), target: options.url, pages: [], assets: [], skipped: [] };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const robots = options.ignoreRobots ? () => true : await robotsFor(context, origin, options.timeout);
  const queue = [options.url]; const queued = new Set(queue); const visited = new Set();
  console.log(`Starting crawl of ${hostname} (max ${options.maxPages} pages)`);
  try {
    while (queue.length && visited.size < options.maxPages) {
      const current = queue.shift(); const parsed = new URL(current);
      if (!robots(parsed.pathname)) { report.skipped.push({ url: current, reason: 'robots.txt' }); continue; }
      visited.add(current); const page = await context.newPage(); const started = Date.now();
      try {
        console.log(`Processing ${current}`);
        const response = await page.goto(current, { waitUntil: 'networkidle', timeout: options.timeout });
        await scrollPage(page); await page.waitForTimeout(1000);
        let html = await page.content();
        const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.href));
        if (options.assets) {
          const resources = await page.evaluate(() => [...document.querySelectorAll('[src], [href], link[ rel="icon"], source[srcset]')].flatMap(el => {
            const values = [el.src || el.href]; if (el.srcset) values.push(...el.srcset.split(',').map(v => v.trim().split(/\s+/)[0])); return values;
          }).filter(Boolean));
          for (const resource of [...new Set(resources)]) {
            try {
              const assetUrl = new URL(resource, current); if (!['http:', 'https:'].includes(assetUrl.protocol)) continue;
              const local = assetPath(assetUrl.toString(), options.output); fs.mkdirSync(path.dirname(local), { recursive: true });
              if (!fs.existsSync(local)) { const assetResponse = await context.request.get(assetUrl.toString(), { timeout: options.timeout }); if (!assetResponse.ok()) throw new Error(`HTTP ${assetResponse.status()}`); fs.writeFileSync(local, await assetResponse.body()); }
              const relative = path.relative(path.dirname(pagePath(current, options.output)), local).replaceAll(path.sep, '/');
              html = html.split(resource).join(relative).split(assetUrl.toString()).join(relative).split(assetUrl.pathname).join(relative); report.assets.push({ url: assetUrl.toString(), file: local, status: 'saved' });
            } catch (error) { report.assets.push({ url: resource, status: 'failed', error: error.message }); }
          }
        }
        const destination = pagePath(current, options.output); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, html, 'utf8');
        report.pages.push({ url: current, file: destination, status: 'saved', httpStatus: response?.status(), durationMs: Date.now() - started });
        for (const link of links) { try { const next = new URL(normalizeUrl(link)); if (next.hostname === hostname && next.origin === origin && !queued.has(next.toString())) { queued.add(next.toString()); queue.push(next.toString()); } } catch {} }
      } catch (error) { report.pages.push({ url: current, status: 'failed', error: error.message, durationMs: Date.now() - started }); console.error(`Failed: ${error.message}`); }
      finally { await page.close(); if (queue.length) await new Promise(resolve => setTimeout(resolve, options.delay)); }
    }
  } finally { await browser.close(); }
  report.finishedAt = new Date().toISOString(); report.summary = { pagesDiscovered: queued.size, pagesVisited: visited.size, pagesSaved: report.pages.filter(p => p.status === 'saved').length, pagesFailed: report.pages.filter(p => p.status === 'failed').length, skippedByRobots: report.skipped.length, assetsSaved: report.assets.filter(a => a.status === 'saved').length, assetsFailed: report.assets.filter(a => a.status === 'failed').length };
  fs.writeFileSync(path.join(options.output, 'crawl-report.json'), JSON.stringify(report, null, 2));
  console.log(`Complete: ${report.summary.pagesSaved} pages saved, ${report.summary.assetsSaved} assets saved.`);
}

main().catch(error => { console.error(`Crawler error: ${error.message}`); process.exitCode = 1; });
