// Layout + PDF tests: real fonts, all styles, stress content, demo marking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFLib, fontkit, nodeRegistry } from './helpers.mjs';
import { layoutLetter } from '../js/doc/letter-layout.js';
import { layoutTemplate } from '../js/doc/template-layout.js';
import { renderPdf } from '../js/doc/render-pdf.js';
import { pageToSvg } from '../js/doc/render-svg.js';
import { STYLES, styleFonts } from '../js/doc/styles.js';
import { DEMO_NOTICE, TEMPLATE_ORDER } from '../js/doc/templates.js';
import { SAMPLE_INPUT, SAMPLE_CONTENT } from '../js/doc/samples.js';

const reg = nodeRegistry();
await reg.ensure(Object.values(STYLES).flatMap(styleFonts));
const LONG = 'Because of an unexpected situation at home that needed my presence for several days in a row, I could not attend the lectures, tutorials and laboratory sessions scheduled during this period, and I have been in touch with classmates to understand what was covered. ';

const stress = {
  ...SAMPLE_INPUT,
  student: { ...SAMPLE_INPUT.student, name: 'Aaravkumar Sanjayrao Patil-Deshmukh', college: 'Shri Guru Gobind Singhji Institute of Engineering and Technology, Vishnupuri, Nanded, Maharashtra' },
  recipient: { name: 'Prof. Dr. Rajendra Krishnamurthy Venkataraghavan Subramaniam', designation: 'Professor and Head of the Department of Electronics and Telecommunication Engineering', salutation: 'Sir/Madam' }
};
const longContent = { ...SAMPLE_CONTENT, paragraphs: [LONG.repeat(7), LONG.repeat(6), 'Supercalifragilisticexpialidociousandevenlongerwordwithoutanyspacesatallthatmustbreak.', LONG] };

function checkBounds(pages, style) {
  for (const p of pages) for (const it of p.items) {
    if (it.t !== 'text' || it.opacity) continue;
    assert.ok(it.x >= 0 && it.x + it.w <= 210.01, `x out of page: ${it.s}`);
    assert.ok(it.y > 5 && it.y < 296, `y out of page: ${it.y} ${it.s}`);
    if (style && it.b) assert.ok(it.x + it.w <= style.margin.right + 0.6, `beyond right margin (${(it.x + it.w).toFixed(2)}): ${it.s}`);
  }
}

for (const id of Object.keys(STYLES)) {
  test(`${id}: sample fits one page`, () => {
    const r = layoutLetter({ input: SAMPLE_INPUT, content: SAMPLE_CONTENT, styleId: id, registry: reg });
    assert.equal(r.pages.length, 1);
    checkBounds(r.pages, STYLES[id]);
  });
  test(`${id}: stress content paginates cleanly and exports with its own font`, async () => {
    const r = layoutLetter({ input: stress, content: longContent, styleId: id, registry: reg });
    assert.ok(r.pages.length >= 2, 'expected multiple pages');
    checkBounds(r.pages, STYLES[id]);
    // signature block stays together on the last page
    const last = r.pages[r.pages.length - 1].items.filter((i) => i.b === 'signature');
    assert.ok(last.length >= 3, 'signature on last page');
    const bytes = await renderPdf({ pages: r.pages, registry: reg, PDFLib, fontkit });
    const pdf = await PDFLib.PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), r.pages.length);
    const names = [];
    for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFLib.PDFDict && obj.get(PDFLib.PDFName.of('Type')) === PDFLib.PDFName.of('Font')) names.push(String(obj.get(PDFLib.PDFName.of('BaseFont'))));
    }
    const ps = reg.get(STYLES[id].fonts.body).font.postscriptName;
    assert.ok(names.some((n) => n.includes(ps)), `embedded ${ps} (found ${names})`);
    assert.ok(!names.some((n) => /Helvetica|Times|Arial|Courier/.test(n)), 'no standard-font fallback');
    // preview is drawn from the same items
    const svg = pageToSvg(r.pages[0]);
    const texts = r.pages[0].items.filter((i) => i.t === 'text').length;
    assert.equal((svg.match(/<text /g) || []).length, texts);
  });
}

test('unsupported characters are reported, rupee substituted', () => {
  const r = layoutLetter({ input: SAMPLE_INPUT, content: { ...SAMPLE_CONTENT, paragraphs: ['Fee of ₹500 paid 😀.'] }, styleId: 'classic', registry: reg });
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
