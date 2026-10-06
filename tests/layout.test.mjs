// Document engine tests: real fonts, handwriting profiles, papers, humaniser, pagination, PDF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PDFLib, fontkit, nodeRegistry } from './helpers.mjs';
import { layoutLetter, paperFonts } from '../js/doc/letter-layout.js';
import { layoutTemplate } from '../js/doc/template-layout.js';
import { renderPdf } from '../js/doc/render-pdf.js';
import { pageToSvg } from '../js/doc/render-svg.js';
import { PAPERS, PAPER_ORDER, WRITING, WRITING_ORDER, WRITING_LIBRARY, styleFonts, handTypography, resolveSettings } from '../js/doc/styles.js';
import { DEMO_NOTICE, TEMPLATE_ORDER } from '../js/doc/templates.js';
import { SAMPLE_INPUT, SAMPLE_CONTENT, QUALITY_INPUT, QUALITY_CONTENT } from '../js/doc/samples.js';

const reg = nodeRegistry();
await reg.ensure([...new Set(WRITING_LIBRARY.flatMap(styleFonts).concat(['sans', 'sansBold']))]);
const LONG = 'Because of an unexpected situation at home that needed my presence for several days in a row, I could not attend the lectures, tutorials and laboratory sessions scheduled during this period, and I have been in touch with classmates to understand what was covered. ';
const longContent = { ...SAMPLE_CONTENT, paragraphs: [LONG.repeat(5), LONG.repeat(4), 'Supercalifragilisticexpialidociousandevenlongerwordwithoutanyspacesatallthatmustbreak.', LONG] };
const glyphs = (page) => page.items.filter((i) => i.t === 'glyph');
const lay = (o) => layoutLetter({ input: SAMPLE_INPUT, content: SAMPLE_CONTENT, registry: reg, seed: 't', ...o });

async function pdfFontNames(bytes) {
  const pdf = await PDFLib.PDFDocument.load(bytes);
  const names = [];
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFLib.PDFDict && obj.get(PDFLib.PDFName.of('Type')) === PDFLib.PDFName.of('Font')) names.push(String(obj.get(PDFLib.PDFName.of('BaseFont'))));
  }
  return { pdf, names };
}

function checkBounds(r) {
  for (const p of r.pages) for (const it of p.items) {
    if ((it.t !== 'text' && it.t !== 'glyph') || it.opacity < 0.5 || !it.b) continue;
    assert.ok(it.x >= 0 && it.x <= 210, `x out of page: ${it.s || it.ch}`);
    assert.ok(it.y > 5 && it.y < 296, `y out of page: ${it.y}`);
    assert.ok(it.x <= 210 - r.settings.page.marginRight + 0.6, `glyph beyond the right margin: ${(it.x).toFixed(2)} "${it.s || it.ch}"`);
  }
}

/* ---------- every student-facing profile, on every student-facing paper ---------- */
for (const w of WRITING_ORDER) {
  test(`${w}: font loads, sample fits one page on every paper, PDF embeds the same font`, async () => {
    const meta = reg.get(WRITING[w].fonts.body);
    assert.ok(meta.bytes.length > 10000, 'font bytes loaded');
    for (const paperId of PAPER_ORDER) {
      const r = lay({ paperId, writingId: w });
      assert.equal(r.pages.length, 1, `${w} on ${paperId} should fit one page`);
      checkBounds(r);
    }
    const r = lay({ paperId: 'classmate', writingId: w });
    const { names } = await pdfFontNames(await renderPdf({ pages: r.pages, registry: reg, PDFLib, fontkit }));
    assert.ok(names.some((n) => n.includes(meta.font.postscriptName)), `PDF embeds ${meta.font.postscriptName} (found ${names})`);
    assert.ok(!names.some((n) => /Helvetica|Times|Arial|Courier/.test(n)), 'no standard-font fallback');
  });
}

test('profiles have comparable optical size (x-height) despite different point sizes', () => {
  const xs = WRITING_ORDER.map((w) => lay({ paperId: 'classmate', writingId: w }).typography);
  const pts = xs.map((t) => t.sizePt), xh = xs.map((t) => t.xHeightMm);
  assert.ok(Math.max(...pts) - Math.min(...pts) > 3, 'point sizes differ between fonts');
  assert.ok(Math.max(...xh) / Math.min(...xh) < 1.08, `x-heights within 8%: ${xh.map((v) => v.toFixed(2))}`);
  for (const t of xs) assert.ok(t.xHeightMm > 2.6, 'handwriting is large enough for A4 (> 2.6 mm x-height)');
});

test('line spacing comes from font metrics: ruled pages follow the rules, unruled pages follow the font', () => {
  const ruled = WRITING_ORDER.map((w) => lay({ paperId: 'classmate', writingId: w }).settings.page.lineGap);
  assert.ok(ruled.every((g) => g === PAPERS.classmate.lineGap));
  const cream = WRITING_ORDER.map((w) => {
    const r = lay({ paperId: 'cream', writingId: w });
    const m = reg.metrics(WRITING[w].fonts.body);
    const expect = handTypography(m, WRITING[w], PAPERS.cream, resolveSettings({}, PAPERS.cream, WRITING[w]).page).lineGap;
    assert.ok(Math.abs(r.settings.page.lineGap - expect) < 1e-9);
    assert.ok(r.settings.page.lineGap >= r.typography.sizeMm * (m.ascender + m.descender) * 0.99, 'no collisions between lines');
    return r.settings.page.lineGap;
  });
  assert.ok(new Set(cream.map((g) => g.toFixed(2))).size > 1, 'different fonts get different unruled spacing');
});

test('long letters paginate; size and line grid never change (page 1 = page 2 = short letter)', () => {
  for (const [paperId, writingId] of [['classmate', 'neat'], ['school', 'flowing'], ['cream', 'ballpoint'], ['black_margin', 'steady'], ['plain', 'academic']]) {
    const short = lay({ paperId, writingId });
    const long = lay({ paperId, writingId, content: longContent });
    assert.equal(short.sizePt, long.sizePt, 'text size is fixed for the profile');
    assert.ok(long.pages.length > short.pages.length, 'overflow goes to a new page');
    const sizes = new Set(long.pages.flatMap((p) => p.items.filter((i) => (i.t === 'glyph' || i.t === 'text') && i.b).map((i) => i.size.toFixed(4))));
    assert.equal(sizes.size, 1, `one base size on every page (${[...sizes]})`);
    checkBounds(long);
    const gap = long.settings.page.lineGap;
    const plain = PAPERS[paperId].kind === 'plain';
    for (const p of long.pages) {
      const firstOf = {};
      for (const it of p.items) if (it.b && firstOf[it.b] === undefined) firstOf[it.b] = it.y;
      for (const it of p.items) {
        if ((it.t !== 'glyph' && it.t !== 'text') || !it.b) continue;
        const base = plain ? firstOf[it.b] : long.settings.page.first - (long.typography ? long.typography.lift : PAPERS[paperId].lift * gap / 7.6);
        const off = Math.abs((it.y - base) / gap - Math.round((it.y - base) / gap)) * gap;
        assert.ok(off < 0.9, `${paperId}/${writingId}: "${it.ch || it.s}" ${off.toFixed(2)} mm off the line grid`);
      }
    }
  }
});

test('humanisation is deterministic and never changes line breaks', () => {
  const a = lay({ paperId: 'classmate', writingId: 'flowing', content: QUALITY_CONTENT, input: QUALITY_INPUT });
  const b = lay({ paperId: 'classmate', writingId: 'flowing', content: QUALITY_CONTENT, input: QUALITY_INPUT });
  assert.deepEqual(a.pages, b.pages, 'same document → identical instructions (preview == PDF)');
  // same content and slips, but all variation switched off: identical line breaks (first glyph of every line)
  const still = lay({ paperId: 'classmate', writingId: 'flowing', content: QUALITY_CONTENT, input: QUALITY_INPUT,
    settings: { human: { glyph: 0, word: 0, line: 0, slantVar: 0, pressure: 0, margin: 0, retrace: 0 } } });
  const gap = a.settings.page.lineGap;
  const breaks = (r) => r.pages.map((p) => {
    const rows = new Map();
    for (const g of glyphs(p)) { const k = Math.round(g.y / gap); if (!rows.has(k)) rows.set(k, g.word || g.ch); }
    return [...rows.values()];
  });
  assert.deepEqual(breaks(a), breaks(still), 'humanisation never moves a word to another line');
  const other = lay({ paperId: 'classmate', writingId: 'flowing', content: QUALITY_CONTENT, input: QUALITY_INPUT, seed: 'another-document' });
  assert.notDeepEqual(glyphs(a.pages[0]).map((g) => g.rot), glyphs(other.pages[0]).map((g) => g.rot), 'different documents get different variation');
});

test('repeated letters vary, within a controlled range, with correlated neighbours', () => {
  const r = lay({ paperId: 'classmate', writingId: 'neat', content: QUALITY_CONTENT, input: QUALITY_INPUT });
  const es = r.pages.flatMap((p) => glyphs(p)).filter((g) => g.ch === 'e');
  assert.ok(es.length > 40);
  const H = r.settings.font.height;
  assert.ok(new Set(es.map((g) => g.sy.toFixed(4) + '/' + g.rot.toFixed(3))).size > es.length * 0.9, 'repeated e are not identical');
  for (const g of es) {
    assert.ok(Math.abs(g.sy / H - 1) < 0.06, 'height variation stays small');
    assert.ok(Math.abs(g.rot) < 3, 'rotation stays small');
  }
  // correlation: neighbouring glyph baselines move together more than distant ones
  const line = glyphs(r.pages[0]).filter((g) => g.b === 'p0').slice(0, 60);
  const dys = line.map((g, i) => g.y - Math.round(g.y));
  let near = 0, far = 0;
  for (let i = 0; i + 12 < dys.length; i++) { near += Math.abs(dys[i + 1] - dys[i]); far += Math.abs(dys[i + 12] - dys[i]); }
  assert.ok(near < far, 'adjacent letters share a tendency');
});

test('fonts with contextual alternates keep them (Caveat cycles glyph variants)', () => {
  const r = lay({ paperId: 'classmate', writingId: 'flowing' });
  const eGids = new Set(glyphs(r.pages[0]).filter((g) => g.ch === 'e').map((g) => g.gid));
  assert.ok(eGids.size >= 2, 'more than one glyph form of "e"');
});

test('struck-through corrections follow the profile settings', () => {
  const natural = lay({ paperId: 'classmate', writingId: 'neat', content: QUALITY_CONTENT, input: QUALITY_INPUT });
  assert.ok(natural.pages.flatMap((p) => p.items).filter((i) => i.slip).length >= 1);
  const neat = lay({ paperId: 'classmate', writingId: 'neat', content: QUALITY_CONTENT, input: QUALITY_INPUT, settings: { human: { preset: 'neat' } } });
  assert.equal(neat.pages.flatMap((p) => p.items).filter((i) => i.slip).length, 0);
});

test('preview and PDF consume the same instructions', async () => {
  const r = lay({ paperId: 'school', writingId: 'ballpoint' });
  const page = r.pages[0];
  const svg = pageToSvg(page);
  assert.equal((svg.match(/<use /g) || []).length, glyphs(page).length, 'one outline per glyph instruction');
  for (const key of Object.keys(page.glyphs)) assert.ok(svg.includes(`id="${key}"`), 'glyph outline defined');
  const bytes = await renderPdf({ pages: r.pages, registry: reg, PDFLib, fontkit });
  const { pdf } = await pdfFontNames(bytes);
  assert.equal(pdf.getPageCount(), r.pages.length);
});

test('the document engine never uses Math.random', () => {
  const dir = new URL('../js/doc/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.ok(!/Math\.random/.test(src), `${f} uses Math.random`);
  }
});

test('printed library styles still typeset and paginate', async () => {
  for (const w of ['academic', 'modern', 'classic']) {
    const r = lay({ paperId: 'plain', writingId: w, content: longContent });
    assert.ok(r.pages.length >= 2);
    checkBounds(r);
    const { names } = await pdfFontNames(await renderPdf({ pages: r.pages, registry: reg, PDFLib, fontkit }));
    assert.ok(names.some((n) => n.includes(reg.get(WRITING[w].fonts.body).font.postscriptName)));
  }
});

test('unsupported characters are reported, rupee substituted', () => {
  const r = lay({ paperId: 'plain', writingId: 'classic', content: { ...SAMPLE_CONTENT, paragraphs: ['Fee of ₹500 paid 😀.'] } });
  const words = r.pages[0].items.filter((i) => i.b === 'p0').map((i) => i.s).join(' ');
  assert.match(words, /Rs\.500/);
  assert.deepEqual(r.warnings, ['😀']);
});

test('every demo template carries the non-removable SAMPLE marking', async () => {
  for (const id of TEMPLATE_ORDER) {
    const r = layoutTemplate({ templateId: id, fields: { name: 'X'.repeat(200), remarks: LONG.repeat(3), notes: LONG, date: '2026-10-05' }, registry: reg });
    const marks = r.pages[0].items.filter((i) => i.t === 'text' && i.s === DEMO_NOTICE);
    assert.ok(marks.length > 10, 'diagonal + band marking');
    assert.ok(marks.some((m) => !m.opacity), 'solid band notice');
    for (const it of r.pages[0].items) if (it.t === 'text' && it.b) assert.ok(it.x + it.w <= 191, 'field within its box: ' + it.b);
  }
});

test('library papers render with every student profile (developer lab)', () => {
  for (const paperId of Object.keys(PAPERS)) {
    if (paperFonts(paperId).length) reg.get('sans');
    const r = lay({ paperId, writingId: 'neat' });
    checkBounds(r);
  }
});
