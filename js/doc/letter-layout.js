/**
 * Student letter layout.
 *
 * buildLetterBlocks() turns the student's facts + the generated language into ordered blocks.
 * layoutLetter() measures every word with the real font, wraps, paginates and returns pages of
 * absolutely positioned drawing items (mm). Both the SVG preview and the PDF exporter draw exactly
 * these items, so they cannot disagree about line breaks, spacing or page breaks.
 */
import { A4, PAPERS, WRITING, resolveSettings } from './styles.js';
import { PT } from './fonts.js';
import { seededRandom, wrapTokens, longDate } from './text.js';
import { handTokens, lineWander, emitHand, canTypo } from './handwriting.js';

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

/** Fonts the paper itself needs (printed labels on some formats). */
export function paperFonts(paperId) {
  return PAPERS[paperId] && PAPERS[paperId].headerBox ? ['sans'] : [];
}

/**
 * Lays out a letter on a fixed baseline grid.
 * Line spacing and text size never change with the amount of text: overflow goes to a new page.
 * `settings` are the user's precision settings (see SETTINGS_SPEC); `humanize` is a preset name.
 */
export function layoutLetter({ input, content, paperId, writingId, registry, seed = 'mg', settings = null, humanize }) {
  const paper = PAPERS[paperId] || PAPERS.classmate;
  const writing = WRITING[writingId] || WRITING.handlee;
  const raw = settings ? JSON.parse(JSON.stringify(settings)) : {};
  if (humanize && !(raw.human && raw.human.preset)) raw.human = { ...(raw.human || {}), preset: humanize };
  const S = resolveSettings(raw, paper, writing);
  const warnings = new Set();
  const rng = seededRandom(seed + '|' + S.human.seed + '|' + paper.id + writing.id);
  const hand = writing.type === 'hand';
  const bodyFont = writing.fonts.body, boldFont = writing.fonts.bold;
  const lineH = S.page.lineGap;

  // Handwriting is sized from its measured body height so every font sits the same way on the rules.
  const size = hand
    ? (lineH * 0.42 * S.font.size * writing.scale) / (registry.bodyHeight(bodyFont) * PT)
    : writing.size * S.font.size;
  const F = hand ? S.font : { ...S.font, width: 1, height: 1, letterSpacing: 0, wordSpacing: 1, slant: 0 };

  const left = S.page.marginLeft, right = A4.w - S.page.marginRight, width = right - left;
  const lift = paper.kind === 'plain' ? 0 : paper.lift * (lineH / 7.6);
  const firstBaseline = S.page.first - lift;
  const lastBaseline = paper.last - lift;

  const clean = (fontId, text) => {
    const { text: t, missing } = registry.sanitize(fontId, text || '');
    missing.forEach((m) => warnings.add(m));
    return t;
  };

  // Choose which body words get a crossed-out slip (exactly S.human.errors of them, if possible).
  const blocks = buildLetterBlocks(input, content);
  const slips = new Set();
  if (hand && S.human.errors > 0) {
    const pick = seededRandom(seed + '|slips|' + S.human.seed);
    const words = blocks.filter((b) => b.kind === 'para').flatMap((b) => clean(bodyFont, b.text).split(/\s+/).filter(Boolean));
    const eligible = words.map((w, i) => (i > 3 && canTypo(w) ? i : -1)).filter((i) => i >= 0);
    while (slips.size < Math.min(S.human.errors, eligible.length)) slips.add(eligible[Math.floor(pick() * eligible.length)]);
  }
  const wordIndex = { n: 0 };

  const tokenize = (text, fontId, opts = {}) => hand
    ? handTokens(clean(fontId, text), { fontId, size, registry, rng, human: S.human, font: F, slips: opts.body ? slips : null, wordIndex: opts.body ? wordIndex : null })
    : printTokens(clean(fontId, text), fontId, size, registry);

  const splitToken = (tok, maxW) => {
    let cut = tok.text.length - 1;
    while (cut > 1 && registry.width(tok.f, tok.text.slice(0, cut) + '-', tok.size) * F.width > maxW) cut--;
    const headText = tok.text.slice(0, cut) + '-', restText = tok.text.slice(cut);
    const remake = (t) => (hand ? handTokens(t, { fontId: tok.f, size: tok.size, registry, rng, human: S.human, font: F })[0]
      : { ...tok, text: t, w: registry.width(tok.f, t, tok.size) });
    return [remake(headText), restText ? remake(restText) : null];
  };

  /* blocks → units of rows */
  const units = [];
  const gapFor = (g) => (!g ? 0 : g === 'para' ? 'para' : g === 'signature' ? 'signature' : 'block');
  for (const b of blocks) {
    const rows = [];
    if (b.kind === 'head') {
      const l = tokenize(b.left, bodyFont), r = tokenize(b.right, bodyFont);
      const rw = r.reduce((n, t, i) => n + t.w + (i < r.length - 1 ? t.space : 0), 0);
      rows.push({ parts: [{ tokens: l, x: left, align: 'left' }, { tokens: r, x: right - rw, align: 'right' }] });
    } else if (b.kind === 'lines' || b.kind === 'signature') {
      for (const line of b.lines) {
        for (const wl of wrapTokens(tokenize(line, bodyFont), width, 0, paper.kind === 'plain' && !hand ? 6 : 0, splitToken)) {
          rows.push({ parts: [{ tokens: wl.tokens, x: left + wl.indent, align: 'left' }] });
        }
      }
    } else if (b.kind === 'subject') {
      const label = tokenize(b.label, boldFont);
      const labelW = label.reduce((n, t) => n + t.w, 0) + label[label.length - 1].space;
      const lines = wrapTokens(tokenize(b.text, boldFont), width, labelW, labelW, splitToken);
      lines.forEach((wl, i) => {
        const parts = [{ tokens: wl.tokens, x: left + wl.indent, align: 'left', width: width - wl.indent }];
        if (i === 0) parts.unshift({ tokens: label, x: left, align: 'left', label: true });
        rows.push({ parts });
      });
    } else if (b.kind === 'para') {
      const lines = wrapTokens(tokenize(b.text, bodyFont, { body: true }), width, S.page.indent, 0, splitToken);
      lines.forEach((wl, i) => {
        const last = i === lines.length - 1;
        rows.push({ parts: [{ tokens: wl.tokens, x: left + wl.indent, align: S.page.align === 'justify' && !hand && !last ? 'justify' : 'left', width: width - wl.indent }] });
      });
    }
    units.push({ id: b.id, rows, gap: gapFor(b.gap), keepWithNext: !!b.keepWithNext, splittable: b.kind === 'para', underline: paper.subjectUnderline && hand && b.kind === 'subject' });
  }

  /* pagination on the fixed grid */
  const gapMm = { block: S.page.blockGap * lineH, para: paper.paraGap * lineH, signature: S.page.sigGap * lineH };
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

  /* emit */
  const ink = S.font.ink;
  const out = pages.map((rows, pi) => {
    const items = pageDecor(paper, S, pi, pages.length, registry, writing, size);
    for (const { row, y: baseline, unitId, underline } of rows) {
      if (hand) {
        const wander = lineWander(rng, S.human.line);
        const drift = (rng() - 0.5) * 1.0 * S.human.margin;  // ragged left margin, never into the margin line
        let startX = 0, endX = 0;
        row.parts.forEach((part, k) => {
          const x0 = part.x + (k === 0 && part.align !== 'right' ? Math.max(0, drift) - (drift < 0 ? drift * 0.3 : 0) : 0);
          if (k === 0) startX = x0;
          endX = emitHand(items, part.tokens, { x0, baseline, wander, color: ink, blockId: unitId, rng, weight: S.font.weight });
        });
        if (underline) items.push({ t: 'line', x1: startX - 0.4, y1: baseline + 1.3 + wander(0), x2: endX + 0.6, y2: baseline + 1.3 + wander(endX - startX) + (rng() - 0.5) * 0.4, sw: 0.26 + S.font.weight * 0.5, color: ink, opacity: 0.75 });
      } else {
        for (const part of row.parts) emitPart(items, part, baseline, unitId, part.label ? (writing.labelInk === writing.ink ? ink : writing.labelInk) : ink);
      }
    }
    return { w: A4.w, h: A4.h, items };
  });
  return { pages: out, warnings: [...warnings], paper: paper.id, writing: writing.id, settings: S, sizePt: size };
}

/** Printed styles: whole words, measured as typeset. */
function printTokens(text, fontId, size, registry) {
  const spaceW = registry.width(fontId, ' ', size);
  return text.split(/\s+/).filter(Boolean).map((w) => ({ text: w, f: fontId, size, w: registry.width(fontId, w, size), space: spaceW }));
}

/** Printed styles: one run per line, or one item per word when justified. */
function emitPart(items, part, baseline, blockId, color) {
  const toks = part.tokens;
  if (!toks.length) return;
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

function pageDecor(paper, S, pageIndex, pageCount, registry, writing, size) {
  const items = [{ t: 'rect', x: 0, y: 0, w: A4.w, h: A4.h, fill: paper.paper }];
  const gap = S.page.lineGap, first = S.page.first;
  const shiftL = S.page.marginLeft - paper.margin.left, shiftR = (A4.w - S.page.marginRight) - paper.margin.right;
  if (paper.kind === 'ruled') {
    if (paper.header) items.push({ t: 'line', x1: 0, y1: paper.header, x2: A4.w, y2: paper.header, sw: 0.28, color: paper.rule });
    for (let y = first; y <= paper.last + 0.01; y += gap) items.push({ t: 'line', x1: 0, y1: y, x2: A4.w, y2: y, sw: 0.22, color: paper.rule });
    if (paper.headerBox) {
      const bx = 128, by = 8, bw = 68, bh = 10;
      items.push({ t: 'rect', x: bx, y: by, w: bw, h: bh, fill: paper.paper, stroke: paper.rule, sw: 0.3 });
      items.push({ t: 'line', x1: bx + 40, y1: by, x2: bx + 40, y2: by + bh, sw: 0.3, color: paper.rule });
      const lab = (txt, x) => items.push({ t: 'text', x, y: by + 4, s: txt, f: 'sans', size: 5.2, w: registry.width('sans', txt, 5.2), color: '#8aa3c4' });
      lab('DATE', bx + 2); lab('PAGE NO.', bx + 42);
    }
  } else if (paper.kind === 'grid') {
    for (let x = paper.pitch; x < A4.w; x += paper.pitch) items.push({ t: 'line', x1: x, y1: 0, x2: x, y2: A4.h, sw: 0.14, color: paper.gridColor });
    for (let y = paper.pitch; y < A4.h; y += paper.pitch) items.push({ t: 'line', x1: 0, y1: y, x2: A4.w, y2: y, sw: 0.14, color: paper.gridColor });
  } else if (paper.kind === 'dots') {
    for (let y = paper.pitch; y < A4.h; y += paper.pitch) for (let x = paper.pitch; x < A4.w; x += paper.pitch) items.push({ t: 'dot', x, y, r: 0.22, fill: paper.dotColor });
  }
  for (const m of paper.marginLines || []) {
    const x = m.x + (m.x < 100 ? shiftL : shiftR);
    items.push({ t: 'line', x1: x, y1: 0, x2: x, y2: A4.h, sw: m.w, color: m.color });
  }
  if (pageCount > 1) {
    const label = paper.kind === 'plain' ? `Page ${pageIndex + 1} of ${pageCount}` : `${pageIndex + 1}`;
    const f = writing.fonts.body, sz = paper.kind === 'plain' ? 8.5 : size;
    const w = registry.width(f, label, sz);
    items.push({ t: 'text', x: paper.kind === 'plain' ? (A4.w - w) / 2 : A4.w - S.page.marginRight - w, y: paper.kind === 'plain' ? 287 : Math.max(10, (paper.header || first - gap) - 4), s: label, f, size: sz, w, color: paper.kind === 'plain' ? '#8a8f99' : S.font.ink });
  }
  return items;
}
