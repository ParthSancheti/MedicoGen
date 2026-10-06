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
  school: ruled({ id: 'school', name: 'Double margin', blurb: 'School page, margins both sides', paper: '#ffffff', rule: '#bfcde0', lineGap: 7.8, first: 38, last: 282, header: 27,
    marginLines: [{ x: 22, color: '#d36b6b', w: 0.3 }, { x: 23.2, color: '#d36b6b', w: 0.18 }, { x: 191, color: '#d36b6b', w: 0.3 }], margin: { left: 27, right: 187 } }),
  legal: ruled({ id: 'legal', name: 'Legal Pad', blurb: 'Yellow ruled notepad', paper: '#fdfce6', rule: '#a9cfe0', lineGap: 8.5, first: 40, last: 280, header: 25, indent: 0,
    marginLines: [{ x: 32, color: '#ff9999', w: 0.28 }, { x: 33.5, color: '#ff9999', w: 0.18 }], margin: { left: 38, right: 196 } }),
  kraft: ruled({ id: 'kraft', name: 'Recycled', blurb: 'Warm recycled-paper tone', paper: '#f3ead8', rule: '#c9b99a', lineGap: 7.8, first: 34, last: 283,
    marginLines: [{ x: 24, color: '#b9776a', w: 0.28 }], margin: { left: 29, right: 196 } }),
  graph: { ...ruled({ id: 'graph', name: 'Graph', blurb: '4 mm squares, writing every 2', paper: '#fdfffd', rule: null, lineGap: 8, first: 36, last: 284, header: null,
    marginLines: [], margin: { left: 24, right: 194 }, subjectUnderline: false }), kind: 'grid', pitch: 4, gridColor: '#cfe6d4', gridBold: '#b6d6be' },
  dots: { ...ruled({ id: 'dots', name: 'Dot grid', blurb: 'Bullet-journal dots', paper: '#fffefc', rule: null, lineGap: 7.6, first: 34, last: 284, header: null,
    marginLines: [], margin: { left: 22, right: 192 }, subjectUnderline: false, first: 34.2 }), kind: 'dots', pitch: 3.8, dotColor: '#b9bec8' },
  cream: { id: 'cream', kind: 'plain', name: 'Warm cream', blurb: 'Unruled, writing spaced by the pen', paper: '#fffdf4', align: 'left', indent: 12, lineGap: 7.6, first: 34, last: 272,
    margin: { left: 25, right: 185 }, blockGap: 0.7, paraGap: 0.25, sigGap: 2, subjectUnderline: false, lift: 0 },
  plain: { id: 'plain', kind: 'plain', name: 'Plain A4', blurb: 'Clean white sheet', paper: '#ffffff', align: 'justify', indent: 0, lineGap: 6.05, first: 34, last: 272,
    margin: { left: 26, right: 184 }, blockGap: 0.7, paraGap: 0.5, sigGap: 2.5, subjectUnderline: false, lift: 0 }
};

/** The four papers students choose from. The rest stay available to the developer Handwriting Lab. */
export const PAPER_ORDER = ['classmate', 'black_margin', 'school', 'cream'];
export const PAPER_LIBRARY = ['classmate', 'black_margin', 'school', 'cream', 'college', 'wide', 'register', 'legal', 'kraft', 'graph', 'dots', 'plain'];
PAPERS.exam = PAPERS.school; // documents saved before the rename

/* ---------- writing profiles ---------- */
/**
 * A handwriting profile is a tuned personality, not just a font:
 *   optical     target x-height as a fraction of the line spacing (sizes every font to the same visual scale)
 *   height/width/slant/letterSpacing/wordSpacing   base geometry of this writer
 *   persona     how much this writer varies: baseline, rotation, scale, spacing, number of glyph variants
 *   ink/density pen personality
 *   papers      pairings that suit the hand
 */
const PERSONA = { baseline: 1, rotation: 1, scale: 1, spacing: 1, variants: 4, drift: 1, pressure: 1, retrace: 1 };
const hand = (id, name, font, o = {}) => ({
  id, name, blurb: o.blurb || '', tag: o.tag || 'Handwritten', type: 'hand',
  fonts: { body: font, bold: font },   // a hand has one weight; subjects are underlined, not bolded
  optical: o.optical || 0.39, height: o.height || 1.06, width: o.width || 1, slant: o.slant || 0,
  letterSpacing: o.letterSpacing || 0, wordSpacing: o.wordSpacing || 1, lineFactor: o.lineFactor || 1,
  persona: { ...PERSONA, ...(o.persona || {}) },
  ink: o.ink || '#1c2a63', labelInk: o.ink || '#1c2a63', density: o.density || 0.94,
  papers: o.papers || ['classmate', 'black_margin', 'school', 'cream'], cursive: !!o.cursive
});

export const WRITING = {
  // ---- the student-facing profiles (chosen from A4 comparisons, see README) ----
  neat: hand('neat', 'Neat & clear', 'handlee', { blurb: 'Tidy, upright print, easy to read', ink: '#1c2a63', letterSpacing: 0.05,
    persona: { baseline: 0.85, rotation: 0.8, scale: 0.85, spacing: 0.8 }, papers: ['classmate', 'school', 'black_margin'] }),
  flowing: hand('flowing', 'Quick & flowing', 'caveat', { blurb: 'Fast, slanted, naturally varied letters', ink: '#0d2a8a', optical: 0.38, slant: 1.5, letterSpacing: -0.04, wordSpacing: 1.05,
    persona: { baseline: 1.1, rotation: 1, scale: 1, spacing: 1.1, variants: 3 }, papers: ['classmate', 'cream', 'black_margin'] }),
  ballpoint: hand('ballpoint', 'Everyday ballpoint', 'mynerve', { blurb: 'Relaxed hand, like notes written in class', ink: '#24356f', density: 0.95,
    persona: { baseline: 1, rotation: 1, scale: 1, spacing: 1, variants: 3 }, papers: ['black_margin', 'classmate', 'school'] }),
  steady: hand('steady', 'Steady & rounded', 'kalam', { blurb: 'Rounded letters with a calm rhythm', ink: '#14161c', optical: 0.38,
    persona: { baseline: 0.9, rotation: 0.9, scale: 0.9, spacing: 0.95 }, papers: ['school', 'classmate', 'cream'] }),
  quick: hand('quick', 'Light & narrow', 'shadows', { blurb: 'Narrow, quick strokes, like a fast note-taker', ink: '#1a2b6d', optical: 0.385, wordSpacing: 1.1,
    persona: { baseline: 1.1, rotation: 1.1, scale: 1, spacing: 1.15 }, papers: ['classmate', 'black_margin', 'cream'] }),
  slanted: hand('slanted', 'Slanted pen', 'nothing', { blurb: 'Leaning, loose and personal', ink: '#14205a', optical: 0.38,
    persona: { baseline: 1.15, rotation: 1.1, scale: 1.05, spacing: 1.1 }, papers: ['classmate', 'cream', 'school'] }),
  cursive: hand('cursive', 'Joined cursive', 'cedarville', { blurb: 'Joined-up letters, written without lifting the pen', ink: '#1b2459', tag: 'Cursive', cursive: true,
    persona: { baseline: 1, rotation: 0.9, scale: 1, spacing: 0.9 }, papers: ['cream', 'classmate', 'black_margin'] }),
  // ---- library (developer Handwriting Lab and documents saved earlier) ----
  handlee: hand('handlee', 'Handlee', 'handlee'),
  kalam: hand('kalam', 'Kalam', 'kalam', { bold: 'kalamBold' }),
  patrick: hand('patrick', 'Patrick Hand', 'patrick', { ink: '#0d1a45' }),
  caveat: hand('caveat', 'Caveat', 'caveat', { ink: '#111b40', optical: 0.37 }),
  mynerve: hand('mynerve', 'Mynerve', 'mynerve'),
  covered: hand('covered', 'Covered By Your Grace', 'covered'),
  architects: hand('architects', 'Architects Daughter', 'architects', { optical: 0.36 }),
  shadows: hand('shadows', 'Shadows Into Light', 'shadows', { optical: 0.36 }),
  gochi: hand('gochi', 'Gochi Hand', 'gochi'),
  schoolbell: hand('schoolbell', 'Schoolbell', 'schoolbell'),
  indie: hand('indie', 'Indie Flower', 'indie'),
  dawning: hand('dawning', 'Dawning of a New Day', 'dawning', { tag: 'Cursive', cursive: true }),
  cedarville: hand('cedarville', 'Cedarville', 'cedarville', { tag: 'Cursive', cursive: true }),
  nothing: hand('nothing', 'Nothing You Could Do', 'nothing', { tag: 'Cursive', cursive: true }),
  homemade: hand('homemade', 'Homemade Apple', 'homemade', { tag: 'Cursive', cursive: true, optical: 0.33 }),
  academic: { id: 'academic', name: 'Academic', tag: 'Serif', fonts: { body: 'serif', bold: 'serifBold' }, size: 11.4, lineHeight: 6.05, ink: '#16181d', labelInk: '#16181d', type: 'print' },
  modern: { id: 'modern', name: 'Modern', tag: 'Sans', fonts: { body: 'sans', bold: 'sansBold' }, size: 10.4, lineHeight: 5.75, ink: '#15171c', labelInk: '#0b63ce', type: 'print' },
  classic: { id: 'classic', name: 'Classic', tag: 'Formal', fonts: { body: 'baskerville', bold: 'baskervilleBold' }, size: 10.3, lineHeight: 6.3, ink: '#1b1a18', labelInk: '#1b1a18', type: 'print' }
};

/** What students see: seven curated handwriting profiles. */
export const WRITING_ORDER = ['neat', 'flowing', 'ballpoint', 'steady', 'quick', 'slanted', 'cursive'];
export const WRITING_LIBRARY = ['neat', 'flowing', 'ballpoint', 'steady', 'quick', 'slanted', 'cursive', 'handlee', 'kalam', 'patrick', 'caveat', 'mynerve', 'covered', 'architects', 'shadows', 'gochi',
  'schoolbell', 'indie', 'dawning', 'cedarville', 'nothing', 'homemade', 'academic', 'modern', 'classic'];

export function styleFonts(writingId) {
  const w = WRITING[writingId] || WRITING.neat;
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

/**
 * Fills defaults: profile and paper values first, then any developer overrides.
 * page.lineGap is null for handwriting on unruled paper: the layout derives it from font metrics.
 */
export function resolveSettings(raw, paper, writing) {
  const s = cleanSettings(raw);
  const def = (group) => Object.fromEntries(SETTINGS_SPEC[group].map(([k, , , , , d]) => [k, d]));
  const profile = writing.type === 'hand'
    ? { height: writing.height, width: writing.width, slant: writing.slant, letterSpacing: writing.letterSpacing, wordSpacing: writing.wordSpacing }
    : { height: 1, weight: 0 };
  const font = { ...def('font'), ink: writing.ink, ...profile, ...s.font };
  const human = { ...def('human'), ...HUMAN_PRESETS[s.human.preset || 'natural'], ...s.human };
  const page = {
    lineGap: paper.kind === 'plain' ? (writing.type === 'print' ? writing.lineHeight : null) : paper.lineGap,
    first: paper.first, marginLeft: paper.margin.left, marginRight: A4.w - paper.margin.right,
    indent: paper.indent, blockGap: paper.blockGap, sigGap: paper.sigGap, align: paper.align,
    ...s.page
  };
  if (paper.kind !== 'plain') { page.blockGap = Math.round(page.blockGap); page.sigGap = Math.round(page.sigGap); } // whole ruled lines only
  return { font, human, page };
}

/**
 * Optical typography for a handwriting profile, from measured font metrics:
 *  - size: chosen so the x-height is `optical` × line spacing (every hand looks equally large)
 *  - capped so a tall ascender plus a deep descender never reach the neighbouring line
 *  - on unruled paper the line spacing itself comes from the font: x-height ÷ optical, never less
 *    than ascender + descender + breathing room
 * Returns mm and pt values plus the baseline offset above the rule.
 */
export function handTypography(m, writing, paper, page, sizeFactor = 1) {
  const PT = 25.4 / 72;
  const target = writing.optical * sizeFactor;
  const ruledGap = page.lineGap;
  let lineGap = ruledGap;
  let sizeMm;
  if (lineGap) {
    sizeMm = (lineGap * target) / m.xHeight;
    const maxMm = (lineGap * 1.02) / (m.ascender + m.descender); // tails may touch, never collide
    sizeMm = Math.min(sizeMm, maxMm);
  } else {
    sizeMm = Math.min((7.6 * target) / m.xHeight, (7.6 * 1.02) / (m.ascender + m.descender)); // same size as on a notebook
    lineGap = Math.max((sizeMm * m.xHeight) / target, sizeMm * (m.ascender + m.descender) * 1.1) * writing.lineFactor;
  }
  // writing sits just above the rule; deeper descenders lift it a touch less so tails stay short
  const lift = paper.kind === 'plain' ? 0 : Math.min(0.12 * lineGap, 0.45 + sizeMm * m.descender * 0.12);
  return { sizeMm, sizePt: sizeMm / PT, lineGap, lift, xHeightMm: sizeMm * m.xHeight, capMm: sizeMm * m.capHeight, ascMm: sizeMm * m.ascender, descMm: sizeMm * m.descender };
}
