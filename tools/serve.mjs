// Minimal static server for local development: `npm run dev` → http://localhost:5173
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 5173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.pdf': 'application/pdf', '.txt': 'text/plain'
};

createServer(async (req, res) => {
  if (req.url === '/api/gemini/health' && req.method === 'GET') {
    const key = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    if (!key) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: 'GEMINI_API_KEY is not configured in the environment' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', model, keyConfigured: true }));
    }
    return;
  }
  
  if (req.url === '/api/gemini' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const key = process.env.GEMINI_API_KEY;
        if (!key) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'GEMINI_API_KEY is missing from local environment.', code: 503 } }));
          return;
        }
        const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        const fetchRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body
        });
        
        const data = await fetchRes.text();
        if (!res.headersSent) {
          res.writeHead(fetchRes.status, { 'Content-Type': 'application/json' });
          res.end(data);
        }
      } catch (e) {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Proxy fetch failed: ' + e.message, code: 500 } }));
        }
      }
    });
    return;
  }
  try {
    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path.endsWith('/') || path.endsWith('\\')) path += 'index.html';
    const file = join(root, path);
    console.log(`[REQ] ${req.url} -> ${path} -> ${file}`);
    if (!file.startsWith(root) || /[/\\](\.git|node_modules)[/\\]/.test(file)) throw Object.assign(new Error('forbidden'), { code: 'ENOENT' });
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}).listen(port, () => console.log(`Medico Gen dev server → http://localhost:${port}  (mock mode when CONFIG.apiUrl is empty)`));
