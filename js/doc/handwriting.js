/**
 * Handwriting renderer.
 *
 * Runs AFTER line wrapping and pagination. Wrapping uses the font's real shaped widths (kerning,
 * ligatures, contextual alternates); once a line is final, this module turns it into individually
 * placed glyphs with a coherent writing personality:
 *
 *   glyph  small deterministic variation in baseline, rotation, height/width and spacing, taken from
 *          SMOOTH noise along the line so neighbouring letters share a tendency instead of shaking
 *          independently; each letter also picks one of a few personal "variants" (the way a writer
 *          has a few ways of making an e), so repeated letters are never identical
 *   word   a slightly different spacing and ink density per word
 *   line   a gentle baseline slope/drift that stays on the rule, and a tiny start-position variation
 *   slips  a set number of words written wrongly, struck through and rewritten
 *
 * Fonts with OpenType contextual alternates (Caveat, Mynerve) keep them: we draw the shaped glyph
 * IDs, never re-typed characters. Every value is derived from a seeded hash, never Math.random(),
 * so the SVG preview and the PDF receive identical instructions.
 * Units: mm; font size in pt.
 */
import { seededRandom } from './text.js';

/* ---------- deterministic noise ---------- */

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const unit = (str) => hash(str) / 4294967296 * 2 - 1; // −1 … 1

/** Smooth 1-D value noise in −1…1 (cosine-interpolated lattice). */
export function smoothNoise(seed) {
  return (t) => {
    const i = Math.floor(t), f = t - i;
    const a = unit(seed + '|' + i), b = unit(seed + '|' + (i + 1));
    const s = (1 - Math.cos(f * Math.PI)) / 2;
    return a * (1 - s) + b * s;
  };
}

/* ---------- slips of the pen ---------- */

const PROTECT = /\d|^[A-Z][a-z]*\.$|^(I|a|an|the|to|of|in|on|at|is|am|as|my|me|be|by|for|and|was|has|had|you|sir|madam)$/i;

export function canTypo(word) {
  const core = word.replace(/[^A-Za-z]/g, '');
  return core.length >= 5 && !PROTECT.test(word) && !/[A-Z]/.test(core.slice(1));
}

/** A believable slip for a word: swapped letters, a dropped letter or an abandoned half-word. */
export function typo(word, seed) {
  const core = word.replace(/[^A-Za-z]/g, '');
  if (!canTypo(word)) return null;
  const rng = seededRandom(seed + word);
  const i = 1 + Math.floor(rng() * (core.length - 3));
  const kind = rng();
  let bad;
  if (kind < 0.4) bad = core.slice(0, i) + core[i + 1] + core[i] + core.slice(i + 2);
  else if (kind < 0.7) bad = core.slice(0, i) + core.slice(i + 1);
  else bad = core.slice(0, i + 1);
  return bad === core ? null : bad;
}

/* ---------- shaping (no humanisation: used for wrapping) ---------- */

/**
 * A wrap token for one word, measured from the shaped glyph run at the document's fixed size.
 * w/space are NOMINAL widths; humanisation later varies positions around them without changing
 * which words share a line.
 */
export function shapeToken(registry, fontId, word, sizeMm, F, extra = {}) {
  const clusters = registry.shape(fontId, word);
  let w = 0;
  clusters.forEach((c, i) => { w += (c.adv + c.kern) * sizeMm * F.width + (i < clusters.length - 1 ? F.letterSpacing : 0); });
  const spaceAdv = registry.shape(fontId, ' ')[0];
  const space = (spaceAdv ? spaceAdv.adv : 0.25) * sizeMm * F.width * F.wordSpacing;
  return { text: word, f: fontId, sizeMm, w, space, clusters, ...extra };
}

/* ---------- humanised line rendering ---------- */

/**
 * Emits glyph items for one finished line.
 * @param {object[]} items  output list
 * @param {object[]} toks   wrap tokens on this line (from shapeToken)
 * @param {object} c        { x0, baseline, rightLimit, seed, persona, human, F, color, density, weight, blockId, PT, upm, align }
 * @returns {{ start: number, end: number, wander: (dx)=>number }}
 */
export function emitHandLine(items, toks, c) {
  const P = c.persona, H = c.human, F = c.F;
  const sizeMm = toks.length ? toks[0].sizeMm : 0;
  const sizePt = sizeMm / c.PT;
  const seed = c.seed;

  // line-level personality: slope + slow wander (≤ ±0.35 mm, stays on the rule) and start offset
  const nLine = smoothNoise(seed + 'L');
  const slope = unit(seed + 'slope') * 0.0028 * H.line * P.drift;           // ≤ ±0.25 mm over a full line
  const wanderAmp = 0.16 * H.line * P.drift;
  const wander = (dx) => Math.max(-0.35, Math.min(0.35, nLine(dx / 55) * wanderAmp + slope * dx));
  const startShift = c.align === 'right' ? 0 : (unit(seed + 'start') * 0.5 + 0.25) * 0.9 * H.margin; // −0.2 … +0.7 mm

  // correlated glyph-level fields along the line
  const nBase = smoothNoise(seed + 'B'), nScale = smoothNoise(seed + 'S'), nRot = smoothNoise(seed + 'R');
  const nSpace = smoothNoise(seed + 'P'), nSlant = smoothNoise(seed + 'K'), nInk = smoothNoise(seed + 'I');
  const A = {
    base: 0.16 * P.baseline * H.glyph,        // mm
    scale: 0.032 * P.scale * H.glyph,         // fraction of height
    width: 0.018 * P.scale * H.glyph,
    rot: 1.5 * P.rotation * H.glyph,          // degrees
    space: 0.09 * P.spacing * H.word,         // mm between letters
    word: 0.22 * P.spacing * H.word,          // fraction of a space
    slant: 2.0 * H.slantVar,                  // degrees, slow drift
    ink: 0.05 * P.pressure * H.pressure
  };

  // 1) nominal positions + personality deltas
  const glyphs = [];
  let x = c.x0 + startShift;
  let gi = 0;
  toks.forEach((t, ti) => {
    const wordStart = x;
    const wordInk = c.density * (1 - A.ink * (0.5 + 0.5 * nInk(ti * 0.9)));
    const wordDy = unit(seed + 'wd' + ti) * 0.08 * H.word;
    t.clusters.forEach((cl, ci) => {
      const occ = (c.occurrences.get(cl.ch) || 0) + 1;
      c.occurrences.set(cl.ch, occ);
      const k = Math.floor(((unit(c.docSeed + cl.ch + '#' + occ) + 1) / 2) * P.variants) % Math.max(1, P.variants);
      const variant = { s: unit(c.docSeed + 'vs' + cl.ch + k), w: unit(c.docSeed + 'vw' + cl.ch + k), r: unit(c.docSeed + 'vr' + cl.ch + k), y: unit(c.docSeed + 'vy' + cl.ch + k) };
      const nx = (x - c.x0) / 9;
      const sy = F.height * (1 + A.scale * (0.55 * nScale(nx) + 0.45 * variant.s));
      const sx = F.width * (1 + A.width * (0.5 * nScale(nx + 40) + 0.5 * variant.w));
      const adv = (cl.adv + cl.kern) * sizeMm * sx;
      glyphs.push({
        cl, t, ti, x, adv, sx, sy,
        dy: wordDy + A.base * (0.65 * nBase(nx) + 0.35 * variant.y),
        rot: A.rot * (0.5 * nRot(gi * 0.6) + 0.5 * variant.r),
        skew: F.slant + A.slant * nSlant((x - c.x0) / 45),
        op: wordInk * (1 - 0.025 * (1 + unit(seed + 'gi' + gi)) * P.pressure * H.pressure)
      });
      const gap = ci < t.clusters.length - 1 ? F.letterSpacing + A.space * nSpace(gi * 0.7) : 0;
      x += adv + gap;
      gi++;
    });
    t._start = wordStart;
    t._end = x;
    if (ti < toks.length - 1) x += t.space * (1 + A.word * unit(seed + 'ws' + ti));
  });

  // 2) never cross the right margin: take back spacing first, then (rarely) <1% horizontal squeeze
  let end = x;
  if (end > c.rightLimit && glyphs.length > 1) {
    const over = end - c.rightLimit;
    const span = end - (c.x0 + startShift);
    const f = Math.max(0.985, 1 - over / span);
    const origin = c.x0 + startShift;
    glyphs.forEach((g) => { g.x = origin + (g.x - origin) * f; g.sx *= f; g.adv *= f; });
    toks.forEach((t) => { t._start = origin + (t._start - origin) * f; t._end = origin + (t._end - origin) * f; });
    end = origin + (end - origin) * f;
  }

  // 3) emit
  const upm = c.upm;
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    const y = c.baseline + g.dy + wander(g.x - c.x0);
    const base = { t: 'glyph', f: g.t.f, gid: g.cl.gid, ch: g.cl.ch, upm, x: g.x, y, size: sizePt, sx: g.sx, sy: g.sy, rot: g.rot, skew: g.skew,
      opacity: +g.op.toFixed(3), color: c.color, stroke: c.weight, b: c.blockId };
    if (i === 0 || glyphs[i - 1].t !== g.t) base.word = g.t.text; // lets the PDF register the shaped run (ToUnicode)
    items.push(base);
    for (const m of g.cl.marks) {
      items.push({ ...base, word: undefined, gid: m.gid, ch: m.ch, x: g.x + m.dx * sizeMm * g.sx, y: y - m.dy * sizeMm * g.sy });
    }
  }
  for (const t of toks) if (t.struck) strike(items, t, c, wander);
  return { start: c.x0 + startShift, end, wander };
}

/** One or two quick strokes through a slip, following the line's drift. */
function strike(items, t, c, wander) {
  const strokes = unit(c.seed + 'st' + t.text) > 0.2 ? 1 : 2;
  const mid = t.sizeMm * 0.2;
  for (let s = 0; s < strokes; s++) {
    const off = s * 0.5 - (strokes - 1) * 0.25;
    items.push({
      t: 'line',
      x1: t._start - 0.3, y1: c.baseline + wander(t._start - c.x0) - mid + off + unit(c.seed + 'sa' + s) * 0.2,
      x2: t._end + 0.5, y2: c.baseline + wander(t._end - c.x0) - mid + off + unit(c.seed + 'sb' + s) * 0.25,
      sw: 0.3 + (c.weight || 0) * 0.6, color: c.color, opacity: 0.88, slip: true
    });
  }
}
