/**
 * Demonstration template layout: background image + field values at manifest coordinates +
 * the mandatory SAMPLE marking. The marking is added here, inside the layout, so every renderer
 * (screen and PDF) receives it; no option exists to turn it off.
 */
import { A4 } from './styles.js';
import { TEMPLATES, DEMO_NOTICE, ISSUER_BOX } from './templates.js';
import { wrapTokens, shortDate } from './text.js';

const FONT = 'sans', BOLD = 'sansBold';
const INK = '#14213d';
const MARK = '#c62828';

export function templateFonts() {
  return [FONT, BOLD];
}

export function formatFieldValue(field, value) {
  if (!value) return '';
  if (field.input === 'date') return shortDate(value);
  if (field.input === 'number') return String(value).replace(/\D/g, '').slice(0, 3) + (field.id === 'age' ? ' years' : '');
  return String(value);
}

export function layoutTemplate({ templateId, fields, registry, dev = false }) {
  const t = TEMPLATES[templateId];
  if (!t) throw new Error('Unknown template ' + templateId);
  const warnings = new Set();
  const items = [{ t: 'image', href: t.background, x: 0, y: 0, w: A4.w, h: A4.h }];

  for (const f of t.fields) {
    const raw = formatFieldValue(f, fields[f.id]);
    const { text, missing } = registry.sanitize(FONT, raw);
    missing.forEach((m) => warnings.add(m));
    if (dev) items.push({ t: 'box', id: f.id, x: f.x, y: f.y - 5, w: f.w, h: (f.maxLines || 1) * (f.lineGap || 0) + 6.5 - (f.maxLines > 1 ? f.lineGap : 0) });
    if (!text) continue;
    const pad = 1;
    if (!f.maxLines || f.maxLines === 1) {
      let size = 11;
      while (size > 7.5 && registry.width(FONT, text, size) > f.w - pad * 2) size -= 0.25;
      let s = text;
      while (s.length > 1 && registry.width(FONT, s, size) > f.w - pad * 2) s = s.slice(0, -2) + '…';
      items.push({ t: 'text', x: f.x + pad, y: f.y, s, f: FONT, size, w: registry.width(FONT, s, size), color: INK, b: f.id });
      continue;
    }
    // multi-line: wrap, shrinking the size until it fits maxLines
    let size = 11, lines;
    for (;;) {
      const space = registry.width(FONT, ' ', size);
      const tokens = text.split(/\s+/).filter(Boolean).map((w) => ({ text: w, w: registry.width(FONT, w, size), space }));
      lines = wrapTokens(tokens, f.w - pad * 2, 0, 0, (tok, maxW) => {
        let cut = tok.text.length - 1;
        while (cut > 1 && registry.width(FONT, tok.text.slice(0, cut), size) > maxW) cut--;
        const rest = tok.text.slice(cut);
        return [{ ...tok, text: tok.text.slice(0, cut), w: registry.width(FONT, tok.text.slice(0, cut), size) },
          rest ? { ...tok, text: rest, w: registry.width(FONT, rest, size) } : null];
      });
      if (lines.length <= f.maxLines || size <= 8.5) break;
      size -= 0.5;
    }
    if (lines.length > f.maxLines) warnings.add('…');
    lines.slice(0, f.maxLines).forEach((ln, i) => {
      let s = ln.tokens.map((x) => x.text).join(' ');
      if (i === f.maxLines - 1 && lines.length > f.maxLines) s = s.replace(/\s*\S*$/, '') + '…';
      items.push({ t: 'text', x: f.x + pad, y: f.y + i * f.lineGap, s, f: FONT, size, w: registry.width(FONT, s, size), color: INK, b: f.id });
    });
  }

  addDemoMarking(items, registry);
  return { pages: [{ w: A4.w, h: A4.h, items }], warnings: [...warnings] };
}

/** The non-removable demonstration marking: diagonal repeats + solid bands + issuer note. */
export function addDemoMarking(items, registry) {
  // diagonal repeated notice across the whole page, drawn ABOVE the field values
  const dSize = 13;
  const dW = registry.width(BOLD, DEMO_NOTICE, dSize);
  for (let row = -2; row < 9; row++) {
    for (let col = -1; col < 2; col++) {
      const x = col * (dW + 18) + (row % 2) * 40 - 10;
      const y = 40 + row * 34;
      items.push({ t: 'text', x, y, s: DEMO_NOTICE, f: BOLD, size: dSize, w: dW, color: MARK, opacity: 0.13, rot: -30 });
    }
  }
  // solid bands top and bottom
  const band = (y, text, size) => {
    items.push({ t: 'rect', x: 0, y, w: A4.w, h: 12, fill: MARK });
    const w = registry.width(BOLD, text, size);
    items.push({ t: 'text', x: (A4.w - w) / 2, y: y + 7.6, s: text, f: BOLD, size, w, color: '#ffffff' });
  };
  band(0, DEMO_NOTICE, 9.5);
  band(A4.h - 12, 'Template demonstration generated with Medico Gen · not issued by any clinician', 8);
  // issuer area note
  const note = 'Not issued — demonstration only';
  const nW = registry.width(BOLD, note, 12);
  items.push({ t: 'text', x: ISSUER_BOX.x + (ISSUER_BOX.w - nW) / 2, y: ISSUER_BOX.y + 31, s: note, f: BOLD, size: 12, w: nW, color: MARK, opacity: 0.85 });
}
