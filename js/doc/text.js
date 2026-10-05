/** Text helpers shared by the letter and template layouts. All distances are millimetres. */

/** Small deterministic PRNG so the handwriting variation is identical in preview and PDF. */
export function seededRandom(seedText) {
  let h = 1779033703 ^ String(seedText).length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Greedy line breaking over pre-measured tokens.
 * tokens: [{ text, w, space }] where `space` is the gap that follows the token.
 * Returns lines: [{ tokens, width, indent }]. Tokens wider than a line are split by characters
 * using `splitToken(token, maxWidth) -> [token, rest]`.
 */
export function wrapTokens(tokens, maxWidth, firstIndent, restIndent, splitToken) {
  const lines = [];
  let line = { tokens: [], width: 0, indent: firstIndent };
  const avail = () => maxWidth - line.indent;
  const queue = tokens.slice();
  while (queue.length) {
    const tok = queue.shift();
    const lead = line.tokens.length ? line.tokens[line.tokens.length - 1].space : 0;
    if (line.width + lead + tok.w <= avail() + 0.01) {
      line.width += lead + tok.w;
      line.tokens.push(tok);
      continue;
    }
    if (!line.tokens.length) {
      // a single token longer than the whole line: split it
      const [head, rest] = splitToken(tok, avail());
      line.tokens.push(head);
      line.width = head.w;
      lines.push(line);
      line = { tokens: [], width: 0, indent: restIndent };
      if (rest) queue.unshift(rest);
      continue;
    }
    lines.push(line);
    line = { tokens: [], width: 0, indent: restIndent };
    queue.unshift(tok);
  }
  if (line.tokens.length || !lines.length) lines.push(line);
  return lines;
}

export function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function longDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
export function shortDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
