/**
 * Student letter layout.
 *
 * buildLetterBlocks() turns the student's facts + the generated language into ordered blocks.
 * layoutLetter() measures every word with the real font, wraps, paginates and returns pages of
 * absolutely positioned drawing items (mm). Both the SVG preview and the PDF exporter draw exactly
 * these items, so they cannot disagree about line breaks, spacing or page breaks.
 */
import { A4, STYLES } from './styles.js';
import { PT } from './fonts.js';
import { seededRandom, wrapTokens, longDate } from './text.js';

/* ---------- content → blocks ---------- */

export function recipientLines(input) {
  const r = input.recipient || {}, s = input.student || {};
  const lines = [];
  let designation = (r.designation || 'Head of Department').trim().replace(/[,.]$/, '');
  if (r.name && r.name.trim()) {
    lines.push(r.name.trim().replace(/[,.]$/, ''));
  } else if (!/^the\s/i.test(designation)) {
    designation = 'The ' + designation;
  }
  lines.push(designation);
  const dept = (s.department || '').trim().replace(/[,.]$/, '');
  if (dept && !/principal|director|dean/i.test(designation)) lines.push(/^department\b/i.test(dept) ? dept : 'Department of ' + dept);
  if (s.college) lines.push(s.college.trim().replace(/[,.]$/, ''));
  return lines.map((l, i) => l + (i === lines.length - 1 ? '.' : ','));
}

export function signatureLines(input) {
  const s = input.student || {};
  const lines = [s.name || ''];
  const cls = [s.year, s.division ? 'Div. ' + s.division.replace(/^div(ision)?\.?\s*/i, '') : ''].filter(Boolean).join(', ');
  if (cls) lines.push(cls);
  if (s.rollNo) lines.push('Roll No. ' + s.rollNo.replace(/^roll\s*no\.?\s*/i, ''));
  return lines.filter(Boolean);
}

export function buildLetterBlocks(input, content) {
  return [
    { id: 'head', kind: 'head', left: 'To,', right: 'Date: ' + longDate(input.date) },
    { id: 'recipient', kind: 'lines', lines: recipientLines(input) },
    { id: 'subject', kind: 'subject', label: 'Subject:', text: content.subject, gap: true },
    { id: 'salutation', kind: 'lines', lines: [content.salutation], gap: true },
    ...content.paragraphs.map((p, i) => ({ id: 'p' + i, kind: 'para', text: p, gap: i === 0 ? 'block' : 'para' })),
    { id: 'closing', kind: 'lines', lines: [content.closing].filter(Boolean), gap: true, keepWithNext: true },
    { id: 'signoff', kind: 'lines', lines: [content.signoff].filter(Boolean), gap: true, keepWithNext: true },
    { id: 'signature', kind: 'signature', lines: signatureLines(input), gap: 'signature' }
  ];
}

/* ---------- layout ---------- */

const FIT_LEVELS = {
  ruled: [{ size: 1, gap: 1 }, { size: 0.96, gap: 1, tight: true }],
  flow: [{ size: 1, gap: 1 }, { size: 0.96, gap: 0.85 }, { size: 0.92, gap: 0.7 }, { size: 0.88, gap: 0.6 }]
};

export function layoutLetter({ input, content, styleId, registry, seed = 'mg' }) {
  const style = STYLES[styleId] || STYLES.notebook;
  const levels = style.ruled ? FIT_LEVELS.ruled : FIT_LEVELS.flow;
  let first = null;
  for (const level of levels) {
    const result = layoutOnce(style, level, input, content, registry, seed);
    if (!first) first = result;
    if (result.pages.length === 1) return result;
  }
  return first; // honest multi-page layout at full size
}

function layoutOnce(style, level, input, content, registry, seed) {
  const warnings = new Set();
  const rng = seededRandom(seed + style.id);
  const size = style.size * level.size;
  const bodyFont = style.fonts.body, boldFont = style.fonts.bold;
  const left = style.margin.left, right = style.margin.right, width = right - left;

  const clean = (fontId, text) => {
    const { text: t, missing } = registry.sanitize(fontId, text || '');
    missing.forEach((m) => warnings.add(m));
    return t;
  };

  // Token measurement, with per-word handwriting variation decided BEFORE wrapping.
  const tokenize = (text, fontId) => {
    const words = clean(fontId, text).split(/\s+/).filter(Boolean);
    const spaceW = registry.width(fontId, ' ', size);
    return words.map((w) => {
      const j = style.jitter
        ? { ds: 1 + (rng() - 0.5) * 0.035, dy: (rng() - 0.5) * 0.42, rot: (rng() - 0.5) * 1.3, sp: (rng() - 0.35) * 0.55 }
        : { ds: 1, dy: 0, rot: 0, sp: 0 };
      return { text: w, f: fontId, size: size * j.ds, w: registry.width(fontId, w, size * j.ds), space: spaceW + j.sp, j };
    });
  };
  const splitToken = (tok, maxW) => {
    let cut = tok.text.length - 1;
    while (cut > 1 && registry.width(tok.f, tok.text.slice(0, cut) + '-', tok.size) > maxW) cut--;
    const head = { ...tok, text: tok.text.slice(0, cut) + '-', w: registry.width(tok.f, tok.text.slice(0, cut) + '-', tok.size) };
    const restText = tok.text.slice(cut);
    const rest = restText ? { ...tok, text: restText, w: registry.width(tok.f, restText, tok.size) } : null;
    return [head, rest];
  };

  /* Build "units": groups of rows. Each row = array of tokens with x offsets, plus extra items. */
  const blocks = buildLetterBlocks(input, content);
  const units = [];
  const gapFor = (g) => (!g ? 0 : g === 'para' ? 'para' : g === 'signature' ? 'signature' : 'block');

  for (const b of blocks) {
    const rows = [];
    if (b.kind === 'head') {
      const l = tokenize(b.left, bodyFont), r = tokenize(b.right, bodyFont);
      const rw = r.reduce((n, t, i) => n + t.w + (i < r.length - 1 ? t.space : 0), 0);
      rows.push({ parts: [{ tokens: l, x: left, align: 'left' }, { tokens: r, x: right - rw, align: 'left' }] });
    } else if (b.kind === 'lines' || b.kind === 'signature') {
      for (const line of b.lines) {
        for (const wl of wrapTokens(tokenize(line, bodyFont), width, 0, style.ruled ? 0 : 6, splitToken)) {
          rows.push({ parts: [{ tokens: wl.tokens, x: left + wl.indent, align: 'left' }] });
        }
      }
    } else if (b.kind === 'subject') {
      const label = tokenize(b.label, boldFont);
      const labelW = label.reduce((n, t) => n + t.w, 0) + label[label.length - 1].space;
      const body = tokenize(b.text, boldFont === bodyFont ? bodyFont : boldFont);
      const lines = wrapTokens(body, width, labelW, labelW, splitToken);
      lines.forEach((wl, i) => {
        const parts = [{ tokens: wl.tokens, x: left + wl.indent, align: 'left', width: width - wl.indent }];
        if (i === 0) parts.unshift({ tokens: label, x: left, align: 'left', label: true });
        rows.push({ parts });
      });
    } else if (b.kind === 'para') {
      const lines = wrapTokens(tokenize(b.text, bodyFont), width, style.indent, 0, splitToken);
      lines.forEach((wl, i) => {
        const last = i === lines.length - 1;
        rows.push({ parts: [{ tokens: wl.tokens, x: left + wl.indent, align: style.align === 'justify' && !last ? 'justify' : 'left', width: width - wl.indent }] });
      });
    }
    units.push({ id: b.id, rows, gap: gapFor(b.gap), keepWithNext: !!b.keepWithNext, splittable: b.kind === 'para' });
  }

  /* Vertical metrics */
  let lineH, gapMm, firstBaseline, lastBaseline;
  if (style.ruled) {
    const R = style.ruled;
    lineH = R.gap;
    firstBaseline = R.first - style.baselineLift;
    lastBaseline = R.last - style.baselineLift;
    const blockLines = level.gap;
    gapMm = { block: blockLines * lineH, para: style.paraGap * lineH, signature: (level.tight ? 1 : 2) * lineH };
    if (level.tight) gapMm.block = Math.min(gapMm.block, lineH);
  } else {
    lineH = style.lineHeight * level.size;
    firstBaseline = style.margin.top + size * PT * 0.78;
    lastBaseline = style.margin.bottom;
    gapMm = { block: style.blockGap * level.gap, para: style.paraGap * level.gap, signature: 15 * Math.max(level.gap, 0.75) };
  }
  const gapOf = (u) => (u.gap ? gapMm[u.gap] : 0);

  /* Pagination with keep-together rules */
  const pages = [[]];
  let y = firstBaseline;
  const place = (row, unitId) => { pages[pages.length - 1].push({ row, y, unitId }); y += lineH; };
  const newPage = () => { pages.push([]); y = firstBaseline; };
  const room = () => Math.floor((lastBaseline - y) / lineH + 1e-6) + 1; // rows that still fit

  for (let ui = 0; ui < units.length; ui++) {
    const u = units[ui];
    const pageEmpty = pages[pages.length - 1].length === 0;
    if (!pageEmpty) y += gapOf(u);
    // keep-with-next chains (closing → signoff → signature)
    let need = u.rows.length;
    for (let k = ui; units[k] && units[k].keepWithNext && units[k + 1]; k++) need += units[k + 1].rows.length + Math.ceil(gapOf(units[k + 1]) / lineH);
    if (need > room() && !pageEmpty) {
      if (u.splittable && u.rows.length >= 4 && room() >= 2 && u.rows.length - room() >= 2) {
        const fit = room();
        u.rows.slice(0, fit).forEach((r) => place(r, u.id));
        newPage();
        u.rows.slice(fit).forEach((r) => { if (room() < 1) newPage(); place(r, u.id); });
        continue;
      }
      newPage();
    }
    for (const r of u.rows) {
      if (room() < 1) newPage();
      place(r, u.id);
    }
  }

  /* Emit drawing items */
  const out = pages.map((rows, pi) => {
    const items = pageDecor(style, pi, pages.length, registry);
    for (const { row, y: baseline, unitId } of rows) {
      const drift = style.jitter ? (rng() - 0.5) * 0.55 : 0;
      for (const part of row.parts) emitPart(items, part, baseline, unitId, style, drift);
    }
    return { w: A4.w, h: A4.h, items };
  });
  return { pages: out, warnings: [...warnings], style: style.id, fitLevel: levels(style).indexOf(level) };
}

function levels(style) {
  return style.ruled ? FIT_LEVELS.ruled : FIT_LEVELS.flow;
}

function emitPart(items, part, baseline, blockId, style, drift) {
  const toks = part.tokens;
  if (!toks.length) return;
  const color = part.label ? style.labelInk : style.ink;
  const natural = toks.reduce((n, t, i) => n + t.w + (i < toks.length - 1 ? t.space : 0), 0);
  // Simple lines without per-word variation are emitted as a single text run.
  if (part.align === 'left' && !style.jitter) {
    const text = toks.map((t) => t.text).join(' ');
    items.push({ t: 'text', x: part.x, y: baseline, s: text, f: toks[0].f, size: toks[0].size, w: natural, color, b: blockId });
    return;
  }
  let extra = 0;
  if (part.align === 'justify' && toks.length > 1) {
    extra = (part.width - natural) / (toks.length - 1);
    if (extra > 6) extra = 0; // never stretch a nearly empty line
  }
  let x = part.x;
  const span = Math.max(natural, 1);
  toks.forEach((t, i) => {
    const dy = t.j.dy + drift * ((x - part.x) / span);
    items.push({ t: 'text', x, y: baseline + dy, s: t.text, f: t.f, size: t.size, w: t.w, color, rot: t.j.rot || 0, b: blockId });
    x += t.w + (i < toks.length - 1 ? t.space + extra : 0);
  });
}

function pageDecor(style, pageIndex, pageCount, registry) {
  const items = [];
  if (style.ruled) {
    const R = style.ruled;
    items.push({ t: 'rect', x: 0, y: 0, w: A4.w, h: A4.h, fill: R.paper });
    items.push({ t: 'line', x1: 0, y1: R.header, x2: A4.w, y2: R.header, sw: 0.28, color: R.rule });
    for (let y = R.first; y <= R.last + 0.01; y += R.gap) items.push({ t: 'line', x1: 0, y1: y, x2: A4.w, y2: y, sw: 0.22, color: R.rule });
    items.push({ t: 'line', x1: R.marginLine, y1: 0, x2: R.marginLine, y2: A4.h, sw: 0.28, color: R.marginColor });
    items.push({ t: 'line', x1: R.marginLine + 1.1, y1: 0, x2: R.marginLine + 1.1, y2: A4.h, sw: 0.18, color: R.marginColor });
    if (pageCount > 1) {
      const label = `${pageIndex + 1}`;
      items.push({ t: 'text', x: style.margin.right - registry.width(style.fonts.body, label, style.size), y: R.header - 4, s: label, f: style.fonts.body, size: style.size, w: registry.width(style.fonts.body, label, style.size), color: style.ink });
    }
  } else {
    items.push({ t: 'rect', x: 0, y: 0, w: A4.w, h: A4.h, fill: style.paper });
    if (style.accentRule) items.push({ t: 'rect', x: style.margin.left, y: 18, w: 14, h: 1.1, fill: style.accentRule });
    if (pageCount > 1) {
      const label = `Page ${pageIndex + 1} of ${pageCount}`;
      const size = 8.5, w = registry.width(style.fonts.body, label, size);
      items.push({ t: 'text', x: (A4.w - w) / 2, y: 287, s: label, f: style.fonts.body, size, w, color: '#8a8f99' });
    }
  }
  return items;
}
