const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = __dirname;
const port = Number(process.env.PORT || 4173);
let crawl = null;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

function reply(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function serve(res, requestUrl) {
  let requestPath = decodeURIComponent(requestUrl.split('?')[0]);
  if (requestPath === '/') requestPath = '/index.html';
  const file = path.resolve(root, `.${requestPath}`);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return reply(res, 404, 'Not found', 'text/plain');
  reply(res, 200, fs.readFileSync(file), mime[path.extname(file)] || 'application/octet-stream');
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/status') {
    return reply(res, 200, { active: Boolean(crawl && !crawl.complete), ...(crawl || {}) });
  }
  if (req.method === 'POST' && req.url === '/api/crawl') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const input = JSON.parse(body);
        const target = new URL(input.url);
        if (!['http:', 'https:'].includes(target.protocol)) throw new Error('URL must use http or https');
        if (crawl && !crawl.complete) return reply(res, 409, { error: 'A crawl is already running.' });
        const output = path.join(root, 'output', 'latest');
        fs.mkdirSync(output, { recursive: true });
        crawl = { url: target.toString(), startedAt: new Date().toISOString(), output, phase: 'launching' };
        const maxPages = Math.min(100, Math.max(1, Number(input.maxPages) || 10));
        const child = spawn(process.execPath, ['crawler.js', '--url', target.toString(), '--max-pages', String(maxPages), '--output', output], { cwd: root, windowsHide: true });
        crawl.pid = child.pid;
        child.stdout.on('data', data => { crawl.phase = data.toString().trim().split(/\r?\n/).pop() || crawl.phase; });
        child.stderr.on('data', data => { crawl.error = data.toString().trim(); });
        child.on('close', code => { crawl = { ...crawl, complete: true, code, finishedAt: new Date().toISOString(), phase: code === 0 ? 'complete' : 'failed' }; });
        return reply(res, 202, { started: true, url: target.toString() });
      } catch (error) { return reply(res, 400, { error: error.message }); }
    });
    return;
  }
  serve(res, req.url);
});

server.listen(port, '127.0.0.1', () => console.log(`OpenCrawl running at http://localhost:${port}`));
