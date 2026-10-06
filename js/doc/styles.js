/**
 * Papers (page geometry), writing styles (typography) and the precision settings that tune both.
 *
 * Every paper is a baseline grid: text always sits on lines that are exactly `lineGap` mm apart,
 * on every page and for every letter length. Nothing is ever shrunk to "fit"; a long letter simply
 * continues on the next page with the same size and spacing.
 */
export const A4 = { w: 210, h: 297 };

/* ---------- papers ---------- */
const ruled = (o) => ({ kind: 'ruled', align: 'left', indent: 9, blockGap: 1, paraGap: 0, sigGap: 2, subjectUnderline: true, header: 21, lift: 1.15, ...o });

export const PAPERS = {
  classmate: ruled({ id: 'classmate', name: 'Classmate', blurb: 'Classic single-ruled notebook', paper: '#fffef9', rule: '#b7cde6', lineGap: 7.6, first: 33.5, last: 284,
    marginLines: [{ x: 23, color: '#e59a9a', w: 0.28 }, { x: 24.1, color: '#e59a9a', w: 0.18 }], margin: { left: 28, right: 196 } }),
  college: ruled({ id: 'college', name: 'Narrow ruled', blurb: 'Tighter lines, more per page', paper: '#fffffb', rule: '#a9c1e0', lineGap: 7.1, first: 31, last: 285,
    marginLines: [{ x: 26, color: '#f0a3b6', w: 0.3 }], margin: { left: 30, right: 197 } }),
  wide: ruled({ id: 'wide', name: 'Wide ruled', blurb: 'Roomy lines, big writing', paper: '#fffef8', rule: '#b4cbe8', lineGap: 8.7, first: 36, last: 282,
    marginLines: [{ x: 24, color: '#e8a0a0', w: 0.3 }], margin: { left: 29, right: 196 } }),
  register: ruled({ id: 'register', name: 'Register', blurb: 'Long notebook with Date / Page box', paper: '#fdfcf6', rule: '#b9cbe2', lineGap: 7.6, first: 38, last: 284, header: 26,
    headerBox: true, marginLines: [{ x: 22, color: '#de8f8f', w: 0.28 }, { x: 23.1, color: '#de8f8f', w: 0.18 }], margin: { left: 27, right: 196 } }),
  black_margin: ruled({ id: 'black_margin', name: 'Black Margin', blurb: 'Grey rules, black margin', paper: '#fafafa', rule: '#d6d6d6', lineGap: 8.0, first: 35, last: 280, header: 20,
    marginLines: [{ x: 28, color: '#222222', w: 0.3 }, { x: 29.1, color: '#222222', w: 0.18 }], margin: { left: 32, right: 196 } }),
  exam: ruled({ id: 'exam', name: 'Exam sheet', blurb: 'Answer-sheet with double margins', paper: '#ffffff', rule: '#c9d3df', lineGap: 7.8, first: 40, last: 282, header: 27,
    marginLines: [{ x: 25, color: '#c05656', w: 0.3 }, { x: 196, color: '#c05656', w: 0.3 }], margin: { left: 29, right: 192 } }),
  legal: ruled({ id: 'legal', name: 'Legal Pad', blurb: 'Yellow ruled notepad', paper: '#fdfce6', rule: '#a9cfe0', lineGap: 8.5, first: 40, last: 280, header: 25, indent: 0,
    marginLines: [{ x: 32, color: '#ff9999', w: 0.28 }, { x: 33.5, color: '#ff9999', w: 0.18 }], margin: { left: 38, right: 196 } }),
  kraft: ruled({ id: 'kraft', name: 'Recycled', blurb: 'Warm recycled-paper tone', paper: '#f3ead8', rule: '#c9b99a', lineGap: 7.8, first: 34, last: 283,
    marginLines: [{ x: 24, color: '#b9776a', w: 0.28 }], margin: { left: 29, right: 196 } }),
  graph: { ...ruled({ id: 'graph', name: 'Graph', blurb: '4 mm squares, writing every 2', paper: '#fdfffd', rule: null, lineGap: 8, first: 36, last: 284, header: null,
    marginLines: [], margin: { left: 24, right: 194 }, subjectUnderline: false }), kind: 'grid', pitch: 4, gridColor: '#cfe6d4', gridBold: '#b6d6be' },
  dots: { ...ruled({ id: 'dots', name: 'Dot grid', blurb: 'Bullet-journal dots', paper: '#fffefc', rule: null, lineGap: 7.6, first: 34, last: 284, header: null,
    marginLines: [], margin: { left: 22, right: 192 }, subjectUnderline: false, first: 34.2 }), kind: 'dots', pitch: 3.8, dotColor: '#b9bec8' },
  cream: { id: 'cream', kind: 'plain', name: 'Cream Smooth', blurb: 'Warm unruled paper', paper: '#fffdf4', align: 'left', indent: 12, lineGap: 7.6, first: 34, last: 272,
    margin: { left: 25, right: 185 }, blockGap: 0.7, paraGap: 0.25, sigGap: 2, subjectUnderline: false, lift: 0 },
  plain: { id: 'plain', kind: 'plain', name: 'Plain A4', blurb: 'Clean white sheet', paper: '#ffffff', align: 'justify', indent: 0, lineGap: 6.05, first: 34, last: 272,
    margin: { left: 26, right: 184 }, blockGap: 0.7, paraGap: 0.5, sigGap: 2.5, subjectUnderline: false, lift: 0 }
};

export const PAPER_ORDER = ['classmate', 'college', 'wide', 'register', 'black_margin', 'exam', 'legal', 'kraft', 'graph', 'dots', 'cream', 'plain'];

/* ---------- writing ---------- */
const hand = (id, name, font, o = {}) => ({ id, name, tag: o.tag || 'Handwritten', fonts: { body: font, bold: o.bold || font }, type: 'hand', ink: o.ink || '#1c2a63', labelInk: o.ink || '#1c2a63', scale: o.scale || 1, cursive: !!o.cursive });

export const WRITING = {
  handlee: hand('handlee', 'Handlee', 'handlee'),
  kalam: hand('kalam', 'Kalam', 'kalam', { bold: 'kalamBold' }),
  patrick: hand('patrick', 'Patrick Hand', 'patrick', { ink: '#0d1a45' }),
  caveat: hand('caveat', 'Caveat', 'caveat', { ink: '#111b40' }),
  mynerve: hand('mynerve', 'Mynerve', 'mynerve'),
  covered: hand('covered', 'Covered By Your Grace', 'covered', { scale: 0.95 }),
  architects: hand('architects', 'Architects Daughter', 'architects', { scale: 0.92 }),
  shadows: hand('shadows', 'Shadows Into Light', 'shadows', { scale: 0.92 }),
  gochi: hand('gochi', 'Gochi Hand', 'gochi'),
  schoolbell: hand('schoolbell', 'Schoolbell', 'schoolbell', { scale: 0.95 }),
  indie: hand('indie', 'Indie Flower', 'indie'),
  dawning: hand('dawning', 'Dawning of a New Day', 'dawning', { tag: 'Cursive', cursive: true, scale: 0.9 }),
  cedarville: hand('cedarville', 'Cedarville', 'cedarville', { tag: 'Cursive', cursive: true, scale: 0.88 }),
  nothing: hand('nothing', 'Nothing You Could Do', 'nothing', { tag: 'Cursive', cursive: true, scale: 0.86 }),
  homemade: hand('homemade', 'Homemade Apple', 'homemade', { tag: 'Cursive', cursive: true, scale: 0.72 }),
  academic: { id: 'academic', name: 'Academic', tag: 'Serif', fonts: { body: 'serif', bold: 'serifBold' }, size: 11.4, lineHeight: 6.05, ink: '#16181d', labelInk: '#16181d', type: 'print' },
  modern: { id: 'modern', name: 'Modern', tag: 'Sans', fonts: { body: 'sans', bold: 'sansBold' }, size: 10.4, lineHeight: 5.75, ink: '#15171c', labelInk: '#0b63ce', type: 'print' },
  classic: { id: 'classic', name: 'Classic', tag: 'Formal', fonts: { body: 'baskerville', bold: 'baskervilleBold' }, size: 10.3, lineHeight: 6.3, ink: '#1b1a18', labelInk: '#1b1a18', type: 'print' }
};

export const WRITING_ORDER = ['handlee', 'kalam', 'patrick', 'caveat', 'mynerve', 'covered', 'architects', 'shadows', 'gochi', 'schoolbell', 'indie',
  'dawning', 'cedarville', 'nothing', 'homemade', 'academic', 'modern', 'classic'];

export function styleFonts(writingId) {
  const w = WRITING[writingId] || WRITING.handlee;
  return [...new Set([w.fonts.body, w.fonts.bold])];
}

/* ---------- precision settings ---------- */
/**
 * One spec drives the settings sheet, validation and defaults.
 * [key, label, min, max, step, default, unit]
 */
export const SETTINGS_SPEC = {
  font: [
    ['size', 'Size', 0.7, 1.4, 0.01, 1, '×'],
    ['height', 'Letter height', 0.8, 1.5, 0.01, 1.1, '×'],
    ['width', 'Letter width', 0.8, 1.3, 0.01, 1, '×'],
    ['letterSpacing', 'Letter spacing', -0.4, 0.8, 0.02, 0, 'mm'],
    ['wordSpacing', 'Word spacing', 0.6, 2, 0.05, 1, '×'],
    ['slant', 'Slant', -12, 20, 0.5, 0, '°'],
    ['weight', 'Pen thickness', 0, 0.3, 0.01, 0.04, 'mm']
  ],
  human: [
    ['glyph', 'Letter wobble', 0, 2, 0.05, 1, '×'],
    ['word', 'Word variation', 0, 2, 0.05, 1, '×'],
    ['line', 'Baseline drift', 0, 2, 0.05, 1, '×'],
    ['slantVar', 'Slant variation', 0, 2, 0.05, 1, '×'],
    ['pressure', 'Ink pressure', 0, 2, 0.05, 1, '×'],
    ['margin', 'Margin drift', 0, 2, 0.05, 1, '×'],
    ['retrace', 'Retraced strokes', 0, 3, 0.1, 1, '×'],
    ['errors', 'Corrections (crossed-out slips)', 0, 6, 1, 2, ''],
    ['seed', 'Variation seed', 0, 999, 1, 0, '#']
  ],
  page: [
    ['lineGap', 'Line spacing', 5.5, 11, 0.1, null, 'mm'],
    ['first', 'First line from top', 20, 60, 0.5, null, 'mm'],
    ['marginLeft', 'Left margin', 10, 50, 0.5, null, 'mm'],
    ['marginRight', 'Right margin', 8, 40, 0.5, null, 'mm'],
    ['indent', 'Paragraph indent', 0, 25, 0.5, null, 'mm'],
    ['blockGap', 'Gap between sections', 0, 3, 0.1, null, 'lines'],
    ['sigGap', 'Space for signature', 1, 4, 0.5, null, 'lines']
  ]
};

export const INKS = [['#1c2a63', 'Blue'], ['#0b2fa0', 'Royal blue'], ['#14161c', 'Black'], ['#0f3d6e', 'Blue-black'], ['#5b2a86', 'Purple']];

/** Humaniser presets map onto the "human" group. */
export const HUMAN_PRESETS = {
  neat: { glyph: 0.55, word: 0.5, line: 0.5, slantVar: 0.5, pressure: 0.6, margin: 0.4, retrace: 0.3, errors: 0 },
  natural: { glyph: 1, word: 1, line: 1, slantVar: 1, pressure: 1, margin: 1, retrace: 1, errors: 2 },
  rushed: { glyph: 1.5, word: 1.4, line: 1.4, slantVar: 1.5, pressure: 1.3, margin: 1.5, retrace: 1.6, errors: 4 }
};

/** Clamps user settings against the spec. Unknown keys are dropped; null means "paper default". */
export function cleanSettings(raw = {}) {
  const out = { font: {}, human: {}, page: {} };
  for (const [group, spec] of Object.entries(SETTINGS_SPEC)) {
    for (const [key, , min, max] of spec) {
      const v = raw[group] && raw[group][key];
      if (v === null || v === undefined || v === '' || isNaN(Number(v))) continue;
      out[group][key] = Math.min(max, Math.max(min, Number(v)));
    }
  }
  const ink = raw.font && raw.font.ink;
  if (typeof ink === 'string' && /^#[0-9a-f]{6}$/i.test(ink)) out.font.ink = ink.toLowerCase();
  if (raw.page && ['left', 'justify'].includes(raw.page.align)) out.page.align = raw.page.align;
  if (raw.human && HUMAN_PRESETS[raw.human.preset]) out.human.preset = raw.human.preset;
  return out;
}

/** Fills defaults: writing/paper values first, then the user's overrides. */
export function resolveSettings(raw, paper, writing) {
  const s = cleanSettings(raw);
  const def = (group) => Object.fromEntries(SETTINGS_SPEC[group].map(([k, , , , , d]) => [k, d]));
  const font = { ...def('font'), ink: writing.ink, ...(writing.type === 'print' ? { height: 1, weight: 0 } : {}), ...s.font };
  const human = { ...def('human'), ...HUMAN_PRESETS[s.human.preset || 'natural'], ...s.human };
  const page = {
    lineGap: paper.kind === 'plain' ? (writing.type === 'print' ? writing.lineHeight : 7.6) : paper.lineGap,
    first: paper.first, marginLeft: paper.margin.left, marginRight: A4.w - paper.margin.right,
    indent: paper.indent, blockGap: paper.blockGap, sigGap: paper.sigGap, align: paper.align,
    ...s.page
  };
  if (paper.kind !== 'plain') { page.blockGap = Math.round(page.blockGap); page.sigGap = Math.round(page.sigGap); } // whole ruled lines only
  return { font, human, page };
}
