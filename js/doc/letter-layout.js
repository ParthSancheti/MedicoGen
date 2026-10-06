/**
 * Student letter layout.
 *
 * buildLetterBlocks() turns the student's facts + the generated language into ordered blocks.
 * layoutLetter() measures every word with the real font, wraps, paginates and returns pages of
 * absolutely positioned drawing items (mm). Both the SVG preview and the PDF exporter draw exactly
 * these items, so they cannot disagree about line breaks, spacing or page breaks.
 */
import { A4, PAPERS, WRITING } from './styles.js';
import { PT } from './fonts.js';
import { seededRandom, wrapTokens, longDate } from './text.js';
import { HUMANIZE, handTokens, lineWander, emitHand } from './handwriting.js';

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

export function layoutLetter({ input, content, paperId, writingId, registry, seed = 'mg', humanize = 'natural' }) {
  const paper = PAPERS[paperId] || PAPERS.classmate;
  const writing = WRITING[writingId] || WRITING.kalam;
  const levels = paper.ruled ? FIT_LEVELS.ruled : FIT_LEVELS.flow;
  let first = null;
  for (const level of levels) {
    const result = layoutOnce(paper, writing, level, input, content, registry, seed, HUMANIZE[humanize] || HUMANIZE.natural);
    if (!first) first = result;
    if (result.pages.length === 1) return result;
  }
  return first; // honest multi-page layout at full size
}

/** Printed styles: whole words, measured as typeset. */
function printTokens(text, fontId, size, registry) {
  const spaceW = registry.width(fontId, ' ', size);
  return text.split(/\s+/).filter(Boolean).map((w) => ({ text: w, f: fontId, size, w: registry.width(fontId, w, size), space: spaceW }));
}

function layoutOnce(paper, writing, level, input, content, registry, seed, human) {
  const warnings = new Set();
  const rng = seededRandom(seed + paper.id + writing.id);
  const size = writing.size * level.size;
  const bodyFont = writing.fonts.body, boldFont = writing.fonts.bold;
  const left = paper.margin.left, right = paper.margin.right, width = right - left;

  const clean = (fontId, text) => {
    const { text: t, missing } = registry.sanitize(fontId, text || '');
    missing.forEach((m) => warnings.add(m));
    return t;
  };

  const hand = writing.type === 'hand';
  // Mistakes only inside the body paragraphs, at most a couple per letter.
  const budget = { left: Math.round(2 * human.errors) };
  const tokenize = (text, fontId, opts = {}) => hand
    ? handTokens(clean(fontId, text), { fontId, size, registry, rng, strength: human, errors: !!opts.errors, budget })
    : printTokens(clean(fontId, text), fontId, size, registry);

  const splitToken = (tok, maxW) => {
    let cut = tok.text.length - 1;
    while (cut > 1 && registry.width(tok.f, tok.text.slice(0, cut) + '-', tok.size) > maxW) cut--;
    const headText = tok.text.slice(0, cut) + '-', restText = tok.text.slice(cut);
    const remake = (t) => (hand ? handTokens(t, { fontId: tok.f, size: tok.size, registry, rng, strength: human, errors: false, budget })[0]
      : { ...tok, text: t, w: registry.width(tok.f, t, tok.size) });
    return [remake(headText), restText ? remake(restText) : null];
  };

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
        for (const wl of wrapTokens(tokenize(line, bodyFont), width, 0, paper.ruled ? 0 : 6, splitToken)) {
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
      const lines = wrapTokens(tokenize(b.text, bodyFont, { errors: true }), width, paper.indent, 0, splitToken);
      lines.forEach((wl, i) => {
        const last = i === lines.length - 1;
        rows.push({ parts: [{ tokens: wl.tokens, x: left + wl.indent, align: paper.align === 'justify' && !last ? 'justify' : 'left', width: width - wl.indent }] });
      });
    }
    units.push({ id: b.id, rows, gap: gapFor(b.gap), keepWithNext: !!b.keepWithNext, splittable: b.kind === 'para', underline: paper.subjectUnderline && b.kind === 'subject' });
  }

  let lineH, gapMm, firstBaseline, lastBaseline;
  if (paper.ruled) {
    const R = paper.ruled;
    lineH = R.gap;
    firstBaseline = R.first - paper.baselineLift;
    lastBaseline = R.last - paper.baselineLift;
    const blockLines = level.gap;
    gapMm = { block: blockLines * lineH, para: paper.paraGap * lineH, signature: (level.tight ? 1 : 2) * lineH };
    if (level.tight) gapMm.block = Math.min(gapMm.block, lineH);
  } else {
    lineH = writing.lineHeight * level.size;
    firstBaseline = paper.margin.top + size * PT * 0.78;
    lastBaseline = paper.margin.bottom;
    gapMm = { block: paper.blockGap * level.gap, para: paper.paraGap * level.gap, signature: 15 * Math.max(level.gap, 0.75) };
  }
  const gapOf = (u) => (u.gap ? gapMm[u.gap] : 0);

  const pages = [[]];
  let y = firstBaseline;
  const place = (row, unit) => { pages[pages.length - 1].push({ row, y, unitId: unit.id, underline: unit.underline }); y += lineH; };
  const newPage = () => { pages.push([]); y = firstBaseline; };
  const room = () => Math.floor((lastBaseline - y) / lineH + 1e-6) + 1;

  for (let ui = 0; ui < units.length; ui++) {
    const u = units[ui];
    const pageEmpty = pages[pages.length - 1].length === 0;
    if (!pageEmpty) y += gapOf(u);
    let need = u.rows.length;
    for (let k = ui; units[k] && units[k].keepWithNext && units[k + 1]; k++) need += units[k + 1].rows.length + Math.ceil(gapOf(units[k + 1]) / lineH);
    if (need > room() && !pageEmpty) {
      if (u.splittable && u.rows.length >= 4 && room() >= 2 && u.rows.length - room() >= 2) {
        const fit = room();
        u.rows.slice(0, fit).forEach((r) => place(r, u));
        newPage();
        u.rows.slice(fit).forEach((r) => { if (room() < 1) newPage(); place(r, u); });
        continue;
      }
      newPage();
    }
    for (const r of u.rows) {
      if (room() < 1) newPage();
      place(r, u);
    }
  }

  const totalRows = pages.reduce((n, p) => n + p.length, 0) || 1;
  let rowNo = 0;
  const out = pages.map((rows, pi) => {
    const items = pageDecor(paper, pi, pages.length, registry, writing);
    for (const { row, y: baseline, unitId, underline } of rows) {
      const fatigue = rowNo++ / totalRows;             // writing gets a little looser down the page
      let endX = 0, startX = row.parts[0].x;
      if (hand) {
        const wander = lineWander(rng, human.line * (1 + fatigue * 0.4));
        const drift = (rng() - 0.5) * 1.3 * human.line;  // ragged left margin
        row.parts.forEach((part, pi2) => {
          const x0 = part.x + (pi2 === 0 && part.align !== 'right' ? drift : 0);
          if (pi2 === 0) startX = x0;
          endX = emitHand(items, part.tokens, { x0, baseline, wander, color: part.label ? writing.labelInk : writing.ink, blockId: unitId, rng, fatigue });
        });
        if (underline) {
          items.push({ t: 'line', x1: startX - 0.4, y1: baseline + 1.3 + wander(0), x2: endX + 0.6, y2: baseline + 1.3 + wander(endX - startX) + (rng() - 0.5) * 0.5, sw: 0.26, color: writing.ink, opacity: 0.75 });
        }
      } else {
        for (const part of row.parts) emitPart(items, part, baseline, unitId, writing);
        if (underline && row.parts.length) {
          const lastPart = row.parts[row.parts.length - 1];
          const span = lastPart.tokens.reduce((n, t, i) => n + t.w + (i < lastPart.tokens.length - 1 ? t.space : 0), 0);
          items.push({ t: 'line', x1: row.parts[0].x, y1: baseline + 1.5, x2: lastPart.x + span, y2: baseline + 1.5, sw: 0.25, color: writing.ink, opacity: 0.7 });
        }
      }
    }
    return { w: A4.w, h: A4.h, items };
  });
  return { pages: out, warnings: [...warnings], paper: paper.id, writing: writing.id, fitLevel: level.tight || level.size < 1 ? 1 : 0 };
}

/** Printed styles: one run per line, or one item per word when justified. */
function emitPart(items, part, baseline, blockId, writing) {
  const toks = part.tokens;
  if (!toks.length) return;
  const color = part.label ? writing.labelInk : writing.ink;
  const natural = toks.reduce((n, t, i) => n + t.w + (i < toks.length - 1 ? t.space : 0), 0);
  if (part.align !== 'justify' || toks.length < 2) {
    items.push({ t: 'text', x: part.x, y: baseline, s: toks.map((t) => t.text).join(' '), f: toks[0].f, size: toks[0].size, w: natural, color, b: blockId });
    return;
  }
  let extra = (part.width - natural) / (toks.length - 1);
  if (extra > 6) extra = 0; // never stretch a nearly empty line
  let x = part.x;
  toks.forEach((t, i) => {
    items.push({ t: 'text', x, y: baseline, s: t.text, f: t.f, size: t.size, w: t.w, color, b: blockId });
    x += t.w + (i < toks.length - 1 ? t.space + extra : 0);
  });
}

function pageDecor(paper, pageIndex, pageCount, registry, writing) {
  const items = [];
  if (paper.ruled) {
    const R = paper.ruled;
    items.push({ t: 'rect', x: 0, y: 0, w: A4.w, h: A4.h, fill: R.paper });
    items.push({ t: 'line', x1: 0, y1: R.header, x2: A4.w, y2: R.header, sw: 0.28, color: R.rule });
    for (let y = R.first; y <= R.last + 0.01; y += R.gap) items.push({ t: 'line', x1: 0, y1: y, x2: A4.w, y2: y, sw: 0.22, color: R.rule });
    items.push({ t: 'line', x1: R.marginLine, y1: 0, x2: R.marginLine, y2: A4.h, sw: 0.28, color: R.marginColor });
    if (R.marginLine2) items.push({ t: 'line', x1: R.marginLine2, y1: 0, x2: R.marginLine2, y2: A4.h, sw: 0.18, color: R.marginColor });
    else items.push({ t: 'line', x1: R.marginLine + 1.1, y1: 0, x2: R.marginLine + 1.1, y2: A4.h, sw: 0.18, color: R.marginColor });
    
    if (pageCount > 1) {
      const label = `${pageIndex + 1}`;
      items.push({ t: 'text', x: paper.margin.right - registry.width(writing.fonts.body, label, writing.size), y: R.header - 4, s: label, f: writing.fonts.body, size: writing.size, w: registry.width(writing.fonts.body, label, writing.size), color: writing.ink });
    }
  } else {
    items.push({ t: 'rect', x: 0, y: 0, w: A4.w, h: A4.h, fill: paper.paper });
    if (paper.accentRule) items.push({ t: 'rect', x: paper.margin.left, y: 18, w: 14, h: 1.1, fill: paper.accentRule });
    if (pageCount > 1) {
      const label = `Page ${pageIndex + 1} of ${pageCount}`;
      const size = 8.5, w = registry.width(writing.fonts.body, label, size);
      items.push({ t: 'text', x: (A4.w - w) / 2, y: 287, s: label, f: writing.fonts.body, size, w, color: '#8a8f99' });
    }
  }
  return items;
}
