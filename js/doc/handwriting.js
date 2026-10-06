/**
 * Handwriting humaniser.
 *
 * A handwriting font alone still looks typed: every "e" is identical, every line is ruler-straight.
 * This module turns words into individually placed glyphs with the irregularities of a real pen:
 *
 *   per word   - slant, size, ink pressure, letter spacing, small baseline offset
 *   per glyph  - size, rotation, vertical wobble, spacing; occasional retraced (doubled) stroke
 *   per line   - slow baseline wander + slope, ragged left margin, writer fatigue down the page
 *   mistakes   - a few words written wrongly, struck through, then rewritten correctly
 *
 * Everything comes from a seeded PRNG, so the preview and the PDF get exactly the same marks.
 * All units are mm (sizes in pt).
 */

/** How strong each effect is. "natural" is the default; the studio can lower it. */
export const HUMANIZE = {
  neat:    { glyph: 0.6, word: 0.6, line: 0.6, errors: 0 },
  natural: { glyph: 1,   word: 1,   line: 1,   errors: 1 },
  rushed:  { glyph: 1.5, word: 1.4, line: 1.4, errors: 2 }
};

/** Words we never "misspell": they carry facts or are too short to look like a real slip. */
const PROTECT = /\d|^[A-Z][a-z]*\.$|^(I|a|an|the|to|of|in|on|at|is|am|as|my|me|be|by|for|and|was|has|had|you|sir|madam)$/i;

/** Builds a believable slip of the pen for a word, or null. */
function typo(word, rng) {
  const core = word.replace(/[^A-Za-z]/g, '');
  if (core.length < 5 || PROTECT.test(word) || /[A-Z]/.test(core.slice(1))) return null;
  const i = 1 + Math.floor(rng() * (core.length - 3));
  const kind = rng();
  let bad;
  if (kind < 0.4) bad = core.slice(0, i) + core[i + 1] + core[i] + core.slice(i + 2);        // swapped letters
  else if (kind < 0.7) bad = core.slice(0, i) + core.slice(i + 1);                            // dropped letter
  else bad = core.slice(0, i + 1);                                                            // abandoned half-word
  return bad === core ? null : bad;
}

/**
 * Turns text into hand tokens. Each token is a word (or punctuation run glued to the word before it)
 * with measured glyphs. Returns tokens compatible with wrapTokens (text, w, space).
 *
 * @param {string} text
 * @param {object} o  { fontId, size, registry, rng, strength, errors: boolean, budget: {left} }
 */
export function handTokens(text, o) {
  const { fontId, size, registry, rng, strength: k } = o;
  const words = text.split(/\s+/).filter(Boolean);
  const spaceW = registry.width(fontId, ' ', size);
  const out = [];

  const makeWord = (word, extra = {}) => {
    const wordScale = 1 + (rng() - 0.5) * 0.05 * k.word;
    const tracking = (rng() - 0.45) * 0.18 * k.word;           // tight or airy letters
    const glyphs = [];
    let x = 0;
    for (const ch of word) {
      const ds = wordScale * (1 + (rng() - 0.5) * 0.06 * k.glyph);
      const gs = size * ds;
      const w = registry.width(fontId, ch, gs);
      glyphs.push({
        ch, x, size: gs, w,
        dy: (rng() - 0.5) * 0.28 * k.glyph,
        rot: (rng() - 0.5) * 4.2 * k.glyph,
        op: 0.9 + rng() * 0.1,
        retrace: rng() < 0.025 * k.glyph && /[a-z]/i.test(ch)  // pen went over the stroke twice
      });
      x += w + tracking + (rng() - 0.5) * 0.12 * k.glyph;
    }
    const w = Math.max(0, x - tracking);
    return {
      text: word, f: fontId, size, w,
      space: Math.max(spaceW * 0.85, spaceW * (0.95 + rng() * 0.45) + (rng() - 0.3) * 0.4 * k.word),
      hand: { glyphs, slant: (rng() - 0.5) * 7 * k.word, dy: (rng() - 0.5) * 0.4 * k.word, ink: 0.86 + rng() * 0.14 },
      ...extra
    };
  };

  for (const word of words) {
    // A few mistakes per letter: written wrong, struck out, written again.
    if (o.errors && o.budget.left > 0 && rng() < 0.035 * k.errors) {
      const bad = typo(word, rng);
      if (bad) {
        o.budget.left--;
        out.push(makeWord(bad, { struck: true }));
      }
    }
    out.push(makeWord(word));
  }
  return out;
}

/** Slow, smooth baseline drift for one written line (two sines with random phase + slope). */
export function lineWander(rng, strength) {
  const a1 = (0.18 + rng() * 0.22) * strength, a2 = (0.08 + rng() * 0.1) * strength;
  const l1 = 70 + rng() * 60, l2 = 25 + rng() * 20;
  const p1 = rng() * Math.PI * 2, p2 = rng() * Math.PI * 2;
  const slope = (rng() - 0.5) * 0.012 * strength;           // mm per mm (± 0.6 mm over a line)
  return (dx) => a1 * Math.sin(dx / l1 * Math.PI * 2 + p1) + a2 * Math.sin(dx / l2 * Math.PI * 2 + p2) + slope * dx;
}

/**
 * Emits drawing items for a row of hand tokens.
 * @returns {number} the x where the row ended
 */
export function emitHand(items, toks, { x0, baseline, wander, color, blockId, rng, fatigue }) {
  let x = x0;
  toks.forEach((t, i) => {
    const h = t.hand;
    const slant = h.slant + fatigue * 2.2;
    const wordStartX = x;
    for (const g of h.glyphs) {
      const gx = x + g.x;
      const gy = baseline + h.dy + g.dy + wander(gx - x0);
      const base = { t: 'text', x: gx, y: gy, s: g.ch, f: t.f, size: g.size, w: g.w, color, rot: g.rot, skew: slant, opacity: +(h.ink * g.op).toFixed(3), b: blockId };
      items.push(base);
      if (g.retrace) items.push({ ...base, x: gx + 0.09, y: gy - 0.05, opacity: +(base.opacity * 0.55).toFixed(3), rot: g.rot + 0.6, b: undefined });
    }
    if (t.struck) {
      // one or two quick strokes through the mistake, following the baseline drift
      const strokes = rng() < 0.4 ? 2 : 1;
      const midY = (dx) => baseline + h.dy + wander(dx - x0) - t.size * 0.12;
      for (let s = 0; s < strokes; s++) {
        const off = s * 0.55 - (strokes - 1) * 0.27;
        items.push({
          t: 'line', x1: wordStartX - 0.25, y1: midY(wordStartX) + off + (rng() - 0.5) * 0.4,
          x2: wordStartX + t.w + 0.6, y2: midY(wordStartX + t.w) + off + (rng() - 0.5) * 0.5,
          sw: 0.32, color, opacity: 0.85
        });
      }
    }
    x += t.w + (i < toks.length - 1 ? t.space : 0);
  });
  return x;
}
