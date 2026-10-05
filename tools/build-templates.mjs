// Generates the demonstration template backgrounds (assets/templates/*.jpg, 150 dpi A4) from the
// field manifest in js/doc/templates.js, so printed blanks line up exactly with field coordinates.
// Usage: node tools/build-templates.mjs
import { writeFileSync, readFileSync } from 'node:fs';
import { TEMPLATES, ISSUER_BOX } from '../js/doc/templates.js';
import { chromium } from './pw.mjs';

const root = new URL('../', import.meta.url);
const font = (f) => 'data:font/ttf;base64,' + readFileSync(new URL('assets/fonts/' + f, root)).toString('base64');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function svgFor(t) {
  const a = t.accent;
  const out = [];
  out.push(`<rect width="210" height="297" fill="#fdfdfb"/>`);
  // header (kept below the 12 mm band the renderer reserves for the SAMPLE marking)
  out.push(`<circle cx="29" cy="30" r="8.5" fill="${a}" fill-opacity=".12"/>`);
  out.push(`<path d="M29 23.5c-3.6 3-5.4 5.8-5.4 8.4a5.4 5.4 0 0 0 10.8 0c0-2.6-1.8-5.4-5.4-8.4z" fill="${a}"/>`);
  out.push(`<path d="M29 27.5v9" stroke="#fff" stroke-width=".7" stroke-linecap="round"/>`);
  out.push(`<text x="42" y="29.5" class="b" font-size="7.4" fill="#1c2430">Sample Health Centre</text>`);
  out.push(`<text x="42" y="35.5" font-size="3.1" fill="#6b7480">Fictional organisation · specimen layout used for software demonstration</text>`);
  out.push(`<text x="190" y="29" font-size="2.9" fill="#6b7480" text-anchor="end">00 Example Road</text>`);
  out.push(`<text x="190" y="33.5" font-size="2.9" fill="#6b7480" text-anchor="end">Demo City</text>`);
  out.push(`<rect x="20" y="41" width="170" height=".5" fill="${a}"/>`);
  out.push(`<text x="105" y="53" class="b" font-size="4.6" fill="${a}" text-anchor="middle" letter-spacing=".9">${esc(t.title)}</text>`);
  // fields: label + baseline rule(s)
  for (const f of t.fields) {
    const labelX = f.id === 'date' ? f.x - 13 : 20;
    const lx = f.id === 'sex' ? f.x - 12 : f.id === 'to' ? f.x - 13 : labelX;
    out.push(`<text x="${lx}" y="${f.y}" font-size="3.5" fill="#4a5361">${esc(f.label)}</text>`);
    const lines = f.maxLines || 1;
    for (let i = 0; i < lines; i++) {
      const y = f.y + 1.6 + i * (f.lineGap || 0);
      out.push(`<rect x="${f.x}" y="${y}" width="${f.w}" height=".25" fill="#b9c0c9"/>`);
    }
  }
  // issuer area: deliberately empty, labelled — no signature line, no seal, no registration number
  const b = ISSUER_BOX;
  out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="3" fill="none" stroke="#c3c9d1" stroke-width=".35" stroke-dasharray="2 1.4"/>`);
  out.push(`<text x="${b.x + 6}" y="${b.y + 8}" class="b" font-size="3.2" fill="#6b7480">Issuer section</text>`);
  out.push(`<text x="${b.x + 6}" y="${b.y + 13.5}" font-size="2.9" fill="#8b939d">Reserved for verified healthcare providers. Left blank in demonstration templates.</text>`);
  out.push(`<rect x="20" y="262" width="170" height=".3" fill="#d9dee4"/>`);
  out.push(`<text x="105" y="268" font-size="2.7" fill="#8b939d" text-anchor="middle">Specimen artwork generated for Medico Gen. Sample Health Centre does not exist.</text>`);

  return `<!doctype html><html><head><style>
    @font-face { font-family: J; src: url(${font('PlusJakartaSans_500Medium.ttf')}); font-weight: 400; }
    @font-face { font-family: J; src: url(${font('PlusJakartaSans_700Bold.ttf')}); font-weight: 700; }
    html, body { margin: 0; }
    svg { display: block; width: 1240px; height: 1754px; font-family: J; }
    .b { font-weight: 700; }
  </style></head><body><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297">${out.join('')}</svg></body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
for (const t of Object.values(TEMPLATES)) {
  await page.setContent(svgFor(t), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const jpg = await page.screenshot({ type: 'jpeg', quality: 86, fullPage: false });
  writeFileSync(new URL(t.background, root), jpg);
  console.log('wrote', t.background, jpg.length, 'bytes');
}
await browser.close();
