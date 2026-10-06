/**
 * Handwriting humaniser.
 *
 * A handwriting font alone still looks typed: every "e" is identical and every line is
 * ruler-straight. This module places each glyph individually with the irregularities of a real pen:
 *
 *   per glyph  - height/width, rotation, vertical wobble, spacing, ink pressure, retraced strokes
 *   per word   - slant, pressure, small baseline offset, spacing
 *   per line   - gentle baseline drift that stays on the ruled line, ragged left margin
 *   mistakes   - a set number of words written wrongly, struck through, then rewritten correctly
 *
 * All variation is CENTRED: averaged over a line the text keeps the same size and density, so every
 * line holds a similar amount of writing and the line spacing never changes. Every effect is scaled
 * by the "human" settings and comes from a seeded PRNG, so preview and PDF get identical marks.
 * Units: mm (font sizes in pt).
 */

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

export function canTypo(word) {
  const core = word.replace(/[^A-Za-z]/g, '');
  return core.length >= 5 && !PROTECT.test(word) && !/[A-Z]/.test(core.slice(1));
}

const centred = (rng) => rng() - 0.5; // −0.5 … +0.5, mean 0

/**
 * Turns text into hand tokens (words with measured, individually varied glyphs).
 * @param {string} text
 * @param {object} o { fontId, size, registry, rng, human, font, slips: Set<number>|null, wordIndex: {n} }
 */
export function handTokens(text, o) {
  const { fontId, size, registry, rng, human: H, font: F } = o;
  const words = text.split(/\s+/).filter(Boolean);
  const spaceW = registry.width(fontId, ' ', size) * F.width;
  const out = [];

  const makeWord = (word, extra = {}) => {
    const wordScale = 1 + centred(rng) * 0.016 * H.word;     // tiny, centred: lines keep their density
    const glyphs = [];
    let x = 0;
    for (const ch of word) {
      const sx = F.width * wordScale * (1 + centred(rng) * 0.03 * H.glyph);
      const sy = F.height * wordScale * (1 + centred(rng) * 0.06 * H.glyph);
      const w = registry.width(fontId, ch, size) * sx;
      glyphs.push({
        ch, x, sx, sy, w,
        dy: centred(rng) * 0.22 * H.glyph,
        rot: centred(rng) * 3.2 * H.glyph,
        op: 1 - rng() * 0.08 * H.pressure,
        retrace: rng() < 0.02 * H.retrace && /[a-z]/i.test(ch)       // pen went over the stroke twice
      });
      x += w + F.letterSpacing + centred(rng) * 0.1 * H.glyph;
    }
    const w = Math.max(0, x - F.letterSpacing);
    return {
      text: word, f: fontId, size, w,
      space: Math.max(spaceW * 0.7, spaceW * F.wordSpacing * (1 + centred(rng) * 0.3 * H.word)),
      hand: {
        glyphs,
        slant: F.slant + centred(rng) * 6 * H.slantVar,
        dy: centred(rng) * 0.25 * H.word,
        ink: 1 - rng() * 0.12 * H.pressure
      },
      ...extra
    };
  };

  for (const word of words) {
    const idx = o.wordIndex ? o.wordIndex.n++ : -1;
    if (o.slips && o.slips.has(idx)) {
      const bad = typo(word, rng);
      if (bad) out.push(makeWord(bad, { struck: true }));
    }
    out.push(makeWord(word));
  }
  return out;
}

/** Gentle baseline drift for one written line. It never leaves the ruled line (±0.35 mm at most). */
export function lineWander(rng, strength) {
  const a1 = (0.08 + rng() * 0.12) * strength, a2 = (0.03 + rng() * 0.05) * strength;
  const l1 = 80 + rng() * 60, l2 = 25 + rng() * 20;
  const p1 = rng() * Math.PI * 2, p2 = rng() * Math.PI * 2;
  const slope = centred(rng) * 0.0035 * strength;           // ≤ ±0.3 mm across a full line
  const fn = (dx) => a1 * Math.sin(dx / l1 * Math.PI * 2 + p1) + a2 * Math.sin(dx / l2 * Math.PI * 2 + p2) + slope * dx;
  return (dx) => Math.max(-0.35, Math.min(0.35, fn(dx)));
}

/**
 * Emits drawing items for a row of hand tokens.
 * @returns {number} the x where the row ended
 */
export function emitHand(items, toks, { x0, baseline, wander, color, blockId, rng, weight }) {
  let x = x0;
  toks.forEach((t, i) => {
    const h = t.hand;
    const wordStartX = x;
    for (const g of h.glyphs) {
      const gx = x + g.x;
      const gy = baseline + h.dy + g.dy + wander(gx - x0);
      const base = { t: 'text', x: gx, y: gy, s: g.ch, f: t.f, size: t.size, w: g.w, color, rot: g.rot, skew: h.slant, sx: g.sx, sy: g.sy, stroke: weight, opacity: +(h.ink * g.op).toFixed(3), b: blockId };
      items.push(base);
      if (g.retrace) items.push({ ...base, x: gx + 0.08, y: gy - 0.04, opacity: +(base.opacity * 0.5).toFixed(3), rot: g.rot + 0.6, b: undefined });
    }
    if (t.struck) {
      // one or two quick strokes through the mistake, following the baseline drift
      const strokes = rng() < 0.4 ? 2 : 1;
      const midY = (dx) => baseline + h.dy + wander(dx - x0) - t.size * 0.12 * (h.glyphs[0] ? h.glyphs[0].sy : 1);
      for (let s = 0; s < strokes; s++) {
        const off = s * 0.55 - (strokes - 1) * 0.27;
        items.push({
          t: 'line', x1: wordStartX - 0.25, y1: midY(wordStartX) + off + centred(rng) * 0.4,
          x2: wordStartX + t.w + 0.6, y2: midY(wordStartX + t.w) + off + centred(rng) * 0.5,
          sw: 0.32 + (weight || 0) * 0.5, color, opacity: 0.85, slip: true
        });
      }
    }
    x += t.w + (i < toks.length - 1 ? t.space : 0);
  });
  return x;
}
