// Local development server: `npm run dev` → http://localhost:5173
// Serves the static app and, when MISTRAL_API_KEY is set in .env, proxies mock-mode AI calls to the
// real Mistral API so you can test real generations locally. The key never reaches the browser.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 5173);
const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.pdf': 'application/pdf', '.txt': 'text/plain'
};

const json = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

async function readBody(req, limit = 200_000) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw new Error('Request too large');
  }
  return body;
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/api/mistral/health' && req.method === 'GET') {
    const key = process.env.MISTRAL_API_KEY;
    return json(res, 200, key
      ? { status: 'ok', model: process.env.MISTRAL_MODEL || 'mistral-small-latest', keyConfigured: true }
      : { status: 'no-key', keyConfigured: false, message: 'MISTRAL_API_KEY is not set in .env' });
  }

  if (url.pathname === '/api/mistral' && req.method === 'POST') {
    const key = process.env.MISTRAL_API_KEY;
    if (!key) return json(res, 503, { object: 'error', message: 'MISTRAL_API_KEY is missing from the local .env' });
    try {
      const body = JSON.parse(await readBody(req));
      if (process.env.MISTRAL_MODEL && body.model === 'mistral-small-latest') body.model = process.env.MISTRAL_MODEL;
      const upstream = await fetch(MISTRAL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000)
      });
      const text = await upstream.text();
      console.log(`[mistral] ${body.model} → HTTP ${upstream.status}`);
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      return res.end(text);
    } catch (e) {
      return json(res, 502, { object: 'error', message: 'Proxy fetch failed: ' + e.message });
    }
  }

  try {
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path.endsWith('/') || path.endsWith('\\')) path += 'index.html';
    const file = join(root, path);
    // never serve secrets, git data or dependencies
    if (!file.startsWith(root) || /[/\\]\.|[/\\](node_modules|Temp)[/\\]/.test(file.slice(root.length - 1))) throw new Error('forbidden');
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}).listen(port, () => {
  console.log(`Medico Gen dev server → http://localhost:${port}  (mock mode when CONFIG.apiUrl is empty)`);
  console.log(process.env.MISTRAL_API_KEY ? 'Mistral: real key loaded from .env (proxied at /api/mistral)' : 'Mistral: no key in .env, mock letters will use the local composer');
});
