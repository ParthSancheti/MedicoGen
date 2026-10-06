// Layout + PDF tests: real fonts, all styles, stress content, demo marking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFLib, fontkit, nodeRegistry } from './helpers.mjs';
import { layoutLetter } from '../js/doc/letter-layout.js';
import { layoutTemplate } from '../js/doc/template-layout.js';
import { renderPdf } from '../js/doc/render-pdf.js';
import { pageToSvg } from '../js/doc/render-svg.js';
import { PAPERS, WRITING, WRITING_ORDER, styleFonts } from '../js/doc/styles.js';
import { DEMO_NOTICE, TEMPLATE_ORDER } from '../js/doc/templates.js';
import { SAMPLE_INPUT, SAMPLE_CONTENT } from '../js/doc/samples.js';

const reg = nodeRegistry();
await reg.ensure(WRITING_ORDER.flatMap(styleFonts));
const LONG = 'Because of an unexpected situation at home that needed my presence for several days in a row, I could not attend the lectures, tutorials and laboratory sessions scheduled during this period, and I have been in touch with classmates to understand what was covered. ';

const stress = {
  ...SAMPLE_INPUT,
  student: { ...SAMPLE_INPUT.student, name: 'Aaravkumar Sanjayrao Patil-Deshmukh', college: 'Shri Guru Gobind Singhji Institute of Engineering and Technology, Vishnupuri, Nanded, Maharashtra' },
  recipient: { name: 'Prof. Dr. Rajendra Krishnamurthy Venkataraghavan Subramaniam', designation: 'Professor and Head of the Department of Electronics and Telecommunication Engineering', salutation: 'Sir/Madam' }
};
const longContent = { ...SAMPLE_CONTENT, paragraphs: [LONG.repeat(7), LONG.repeat(6), 'Supercalifragilisticexpialidociousandevenlongerwordwithoutanyspacesatallthatmustbreak.', LONG] };

function checkBounds(pages, paper) {
  for (const p of pages) for (const it of p.items) {
    if (it.t !== 'text' || it.opacity) continue;
    assert.ok(it.x >= 0 && it.x + it.w <= 210.01, `x out of page: ${it.s}`);
    assert.ok(it.y > 5 && it.y < 296, `y out of page: ${it.y} ${it.s}`);
    if (paper && it.b) assert.ok(it.x + it.w <= paper.margin.right + 2.5, `beyond right margin (${(it.x + it.w).toFixed(2)}): ${it.s}`);
  }
}

for (const id of WRITING_ORDER) {
  const paperId = WRITING[id].type === 'hand' ? 'classmate' : 'plain';
  const paper = PAPERS[paperId];
  test(`${id}: sample fits one page`, () => {
    const r = layoutLetter({ input: SAMPLE_INPUT, content: SAMPLE_CONTENT, paperId, writingId: id, registry: reg });
    assert.equal(r.pages.length, 1);
    checkBounds(r.pages, paper);
  });
  test(`${id}: stress content paginates cleanly and exports with its own font`, async () => {
    const r = layoutLetter({ input: stress, content: longContent, paperId, writingId: id, registry: reg });
    assert.ok(r.pages.length >= 2, 'expected multiple pages');
    checkBounds(r.pages, paper);
    const last = r.pages[r.pages.length - 1].items.filter((i) => i.b === 'signature');
    assert.ok(last.length >= 3, 'signature on last page');
    const bytes = await renderPdf({ pages: r.pages, registry: reg, PDFLib, fontkit });
    const pdf = await PDFLib.PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), r.pages.length);
    const names = [];
    for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFLib.PDFDict && obj.get(PDFLib.PDFName.of('Type')) === PDFLib.PDFName.of('Font')) names.push(String(obj.get(PDFLib.PDFName.of('BaseFont'))));
    }
    const ps = reg.get(WRITING[id].fonts.body).font.postscriptName;
    assert.ok(names.some((n) => n.includes(ps)), `embedded ${ps} (found ${names})`);
    assert.ok(!names.some((n) => /Helvetica|Times|Arial|Courier/.test(n)), 'no standard-font fallback');
    const svg = pageToSvg(r.pages[0]);
    assert.equal((svg.match(/<text /g) || []).length, r.pages[0].items.filter((i) => i.t === 'text').length);
  });
}

test('handwriting is deterministic, varied, and contains struck-through slips', () => {
  const a = layoutLetter({ input: SAMPLE_INPUT, content: SAMPLE_CONTENT, paperId: 'classmate', writingId: 'handlee', registry: reg, seed: 'x' });
  const b = layoutLetter({ input: SAMPLE_INPUT, content: SAMPLE_CONTENT, paperId: 'classmate', writingId: 'handlee', registry: reg, seed: 'x' });
  assert.deepEqual(a.pages, b.pages, 'same seed, same marks (preview == PDF)');
  const es = a.pages[0].items.filter((i) => i.t === 'text' && i.s === 'e');
  assert.ok(new Set(es.map((i) => i.sy.toFixed(3) + i.rot.toFixed(1))).size > es.length * 0.8, 'no two e are alike');
  const strikes = a.pages[0].items.filter((i) => i.slip);
  assert.ok(strikes.length >= 1, 'at least one corrected slip');
  const neat = layoutLetter({ input: SAMPLE_INPUT, content: SAMPLE_CONTENT, paperId: 'classmate', writingId: 'handlee', registry: reg, seed: 'x', humanize: 'neat' });
  assert.equal(neat.pages[0].items.filter((i) => i.slip).length, 0, 'neat writing has no slips');
  // the words the student wrote are all still there, in order
  const words = a.pages[0].items.filter((i) => i.b === 'p0').map((i) => i.s).join('');
  assert.ok(words.includes(SAMPLE_CONTENT.paragraphs[0].replace(/\s+/g, '').slice(0, 40)));
});

test('line spacing never changes: same size and grid for short and long letters', () => {
  const LONGP = SAMPLE_CONTENT.paragraphs.map((p) => (p + ' ').repeat(4));
  for (const [paperId, writingId] of [['classmate', 'handlee'], ['plain', 'academic'], ['cream', 'caveat'], ['graph', 'mynerve']]) {
    const short = layoutLetter({ input: SAMPLE_INPUT, content: SAMPLE_CONTENT, paperId, writingId, registry: reg });
    const long = layoutLetter({ input: SAMPLE_INPUT, content: { ...SAMPLE_CONTENT, paragraphs: LONGP }, paperId, writingId, registry: reg });
    assert.equal(short.sizePt, long.sizePt, 'text size is fixed');
    assert.ok(long.pages.length > short.pages.length, 'overflow goes to a new page');
    const gap = short.settings.page.lineGap;
    for (const r of [short, long]) {
      for (const p of r.pages) {
        // every row's baseline sits on the grid: (y - first baseline) is a whole number of lines (± handwriting drift)
        // plain sheets space sections by fractions of a line, so measure from each block's first row there
        const plain = PAPERS[paperId].kind === 'plain';
        const firstOf = {};
        for (const it of p.items) if (it.t === 'text' && it.b && firstOf[it.b] === undefined) firstOf[it.b] = it.y;
        for (const it of p.items) {
          if (it.t !== 'text' || !it.b) continue;
          const base = plain ? firstOf[it.b] : r.settings.page.first - PAPERS[paperId].lift * gap / 7.6;
          const steps = (it.y - base) / gap;
          assert.ok(Math.abs(steps - Math.round(steps)) * gap < 1.1, `${paperId}/${writingId}: "${it.s}" off the line grid by ${(Math.abs(steps - Math.round(steps)) * gap).toFixed(2)} mm`);
        }
      }
    }
  }
});

test('unsupported characters are reported, rupee substituted', () => {
  const r = layoutLetter({ input: SAMPLE_INPUT, content: { ...SAMPLE_CONTENT, paragraphs: ['Fee of ₹500 paid 😀.'] }, paperId: 'plain', writingId: 'classic', registry: reg });
  const words = r.pages[0].items.filter((i) => i.b === 'p0').map((i) => i.s).join(' ');
  assert.match(words, /Rs\.500/);
  assert.deepEqual(r.warnings, ['😀']);
});

test('every demo template carries the non-removable SAMPLE marking', async () => {
  await reg.ensure(['sans', 'sansBold']);
  for (const id of TEMPLATE_ORDER) {
    const r = layoutTemplate({ templateId: id, fields: { name: 'X'.repeat(200), remarks: LONG.repeat(3), notes: LONG, date: '2026-10-05' }, registry: reg });
    const marks = r.pages[0].items.filter((i) => i.t === 'text' && i.s === DEMO_NOTICE);
    assert.ok(marks.length > 10, 'diagonal + band marking');
    assert.ok(marks.some((m) => !m.opacity), 'solid band notice');
    checkBounds(r.pages, null);
    for (const it of r.pages[0].items) if (it.t === 'text' && it.b) assert.ok(it.x + it.w <= 191, 'field within its box: ' + it.b);
  }
});
