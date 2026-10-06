// Output-quality comparison: renders the same representative letter (repeated letters, punctuation,
// numbers, mixed case, several paragraphs) for each handwriting profile on each paper, at A4, with
// a fixed seed, as real PDFs (+ PNG previews and a contact sheet when poppler/Pillow are available).
//
//   node tools/quality-sheet.mjs [outDir] [profiles=neat,flowing,ballpoint,steady] [papers=classmate,black_margin,school,cream]
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PDFLib, fontkit, nodeRegistry } from '../tests/helpers.mjs';
import { layoutLetter, paperFonts } from '../js/doc/letter-layout.js';
import { renderPdf } from '../js/doc/render-pdf.js';
import { WRITING, PAPER_ORDER, WRITING_ORDER, styleFonts } from '../js/doc/styles.js';
import { QUALITY_INPUT, QUALITY_CONTENT } from '../js/doc/samples.js';

const out = process.argv[2] || 'test-output/quality';
const profiles = (process.argv[3] || WRITING_ORDER.join(',')).split(',');
const papers = (process.argv[4] || PAPER_ORDER.join(',')).split(',');
mkdirSync(out, { recursive: true });

const reg = nodeRegistry();
await reg.ensure([...new Set(profiles.flatMap(styleFonts).concat(papers.flatMap(paperFonts)))]);
const rows = [];
for (const w of profiles) {
  for (const p of papers) {
    const r = layoutLetter({ input: QUALITY_INPUT, content: QUALITY_CONTENT, paperId: p, writingId: w, registry: reg, seed: 'quality-1' });
    const file = `${out}/${w}-${p}.pdf`;
    writeFileSync(file, await renderPdf({ pages: r.pages, registry: reg, PDFLib, fontkit }));
    const t = r.typography || {};
    rows.push({ profile: w, font: WRITING[w].fonts.body, paper: p, pages: r.pages.length, sizePt: +r.sizePt.toFixed(2), xHeightMm: +(t.xHeightMm || 0).toFixed(2), lineGapMm: +r.settings.page.lineGap.toFixed(2), liftMm: +(t.lift || 0).toFixed(2) });
    try { execFileSync('pdftoppm', ['-r', '60', '-png', '-singlefile', '-f', '1', '-l', '1', file, file.replace(/\.pdf$/, '')]); } catch { /* optional */ }
  }
}
console.table(rows);
writeFileSync(`${out}/metrics.json`, JSON.stringify(rows, null, 2));
try {
  execFileSync('python3', ['-c', `
import sys,glob
from PIL import Image
P=${JSON.stringify(profiles)}; Q=${JSON.stringify(papers)}
ims=[[Image.open(f"${out}/{w}-{p}.png") for p in Q] for w in P]
W,H=ims[0][0].size
c=Image.new('RGB',(len(Q)*(W+8),len(P)*(H+8)),'#555')
for i,row in enumerate(ims):
  for j,im in enumerate(row): c.paste(im,(j*(W+8),i*(H+8)))
c.save("${out}/contact-sheet.png")`]);
  console.log('contact sheet:', `${out}/contact-sheet.png`);
} catch { /* optional */ }
