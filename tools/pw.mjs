// Resolves Playwright from the project or a global install (tools only; not used by the app).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', process.env.PLAYWRIGHT_PATH].filter(Boolean)) {
  try { pw = require(p); break; } catch { /* try next */ }
}
if (!pw) throw new Error('Playwright not found. Install it (npm i -D playwright) or set PLAYWRIGHT_PATH.');
export const { chromium } = pw;
