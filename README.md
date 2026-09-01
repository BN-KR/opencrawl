# Site Inspiration Crawler

This standalone crawler renders a website in Chromium, scrolls through each page to trigger lazy content, saves the evaluated HTML, downloads common local assets, and follows same-host links.

## Install

```powershell
cd C:\site-crawler
npm install
npx playwright install chromium
```

## Run

```powershell
node crawler.js --url https://example.com
node crawler.js --url https://example.com --max-pages 10 --output .\output
node crawler.js --url https://example.com --no-assets
```

The crawler respects `robots.txt` and waits between pages. Use `--ignore-robots` only for sites you own or are authorized to test. The crawl is same-host and bounded by `--max-pages` (50 by default).

## Output

- `output/pages/` — rendered HTML snapshots
- `output/assets/` — downloaded assets grouped by hostname and path
- `output/crawl-report.json` — page, asset, skip, and failure diagnostics

## Web dashboard

Open `index.html` directly or serve the project with a static server. The dashboard includes a demo status view and lets you load any generated `output/crawl-report.json` locally in the browser.

Preview the capture over HTTP so browser-relative resources behave correctly:

```powershell
npx serve output
```

Use this tool only where you have permission to crawl and retain the content. It does not bypass authentication, paywalls, bot protections, or access controls.
