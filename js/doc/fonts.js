/**
 * Font registry — the single source of font truth.
 *
 * The same TTF bytes are (1) registered with the browser as a FontFace for the on-screen preview,
 * (2) parsed by fontkit to measure text for line wrapping, and (3) embedded into the exported PDF.
 * There is no fallback font: if a file cannot be loaded the export is refused with a clear error
 * instead of quietly producing a PDF in Helvetica.
 */
export const PT = 25.4 / 72; // 1 pt in mm

export const FONT_FILES = {
  kalam:          { file: 'Kalam_400Regular.ttf',           family: 'MG Kalam',        weight: 400, label: 'Kalam' },
  kalamBold:      { file: 'Kalam_700Bold.ttf',              family: 'MG Kalam',        weight: 700, label: 'Kalam Bold' },
  serif:          { file: 'SourceSerif4_400Regular.ttf',    family: 'MG Source Serif', weight: 400, label: 'Source Serif 4' },
  serifBold:      { file: 'SourceSerif4_600SemiBold.ttf',   family: 'MG Source Serif', weight: 600, label: 'Source Serif 4 SemiBold' },
  sans:           { file: 'Inter_400Regular.ttf',           family: 'MG Inter',        weight: 400, label: 'Inter' },
  sansBold:       { file: 'Inter_600SemiBold.ttf',          family: 'MG Inter',        weight: 600, label: 'Inter SemiBold' },
  baskerville:    { file: 'LibreBaskerville_400Regular.ttf', family: 'MG Baskerville', weight: 400, label: 'Libre Baskerville' },
  baskervilleBold:{ file: 'LibreBaskerville_700Bold.ttf',   family: 'MG Baskerville',  weight: 700, label: 'Libre Baskerville Bold' }
};

/** Characters we can safely substitute when a font lacks them. */
const SUBSTITUTES = { '₹': 'Rs.', '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', ' ': ' ' };

export class FontRegistry {
  /**
   * @param {object} deps
   * @param {object} deps.fontkit   @pdf-lib/fontkit
   * @param {(url:string)=>Promise<ArrayBuffer>} deps.loadBytes
   * @param {string} deps.baseUrl   folder containing the TTF files
   * @param {boolean} [deps.registerFaces] register FontFace objects with the document (browser)
   */
  constructor({ fontkit, loadBytes, baseUrl, registerFaces = false }) {
    this.fontkit = fontkit;
    this.loadBytes = loadBytes;
    this.baseUrl = baseUrl.replace(/\/?$/, '/');
    this.registerFaces = registerFaces;
    this.fonts = new Map();     // id -> { bytes, font }
    this.pending = new Map();   // id -> Promise
    this.widths = new Map();
  }

  ensure(ids) {
    return Promise.all([...new Set(ids)].map((id) => this.load(id)));
  }

  load(id) {
    if (this.fonts.has(id)) return Promise.resolve(this.fonts.get(id));
    if (this.pending.has(id)) return this.pending.get(id);
    const meta = FONT_FILES[id];
    if (!meta) return Promise.reject(new Error(`Unknown font "${id}"`));
    const p = (async () => {
      const buf = await this.loadBytes(this.baseUrl + meta.file);
      const bytes = new Uint8Array(buf);
      if (bytes.length < 1000) throw new Error(`Font file ${meta.file} is empty or missing`);
      const font = this.fontkit.create(bytes);
      if (this.registerFaces && typeof FontFace !== 'undefined') {
        const face = new FontFace(meta.family, bytes.slice().buffer, { weight: String(meta.weight), style: 'normal' });
        await face.load();
        document.fonts.add(face);
      }
      const entry = { id, meta, bytes, font };
      this.fonts.set(id, entry);
      return entry;
    })();
    this.pending.set(id, p);
    p.catch(() => this.pending.delete(id));
    return p;
  }

  get(id) {
    const f = this.fonts.get(id);
    if (!f) throw new Error(`Font "${id}" used before it was loaded`);
    return f;
  }

  /** Advance width in mm, computed exactly the way pdf-lib positions glyphs (no kerning). */
  width(id, text, sizePt) {
    const key = id + '|' + text;
    let units = this.widths.get(key);
    if (units === undefined) {
      const { font } = this.get(id);
      const { glyphs } = font.layout(text);
      units = 0;
      for (const g of glyphs) units += g.advanceWidth;
      units /= font.unitsPerEm;
      if (this.widths.size > 20000) this.widths.clear();
      this.widths.set(key, units);
    }
    return units * sizePt * PT;
  }

  /** Ascent/descent in mm at a size (for vertical centring). */
  metrics(id, sizePt) {
    const { font } = this.get(id);
    const s = (sizePt * PT) / font.unitsPerEm;
    return { ascent: font.ascent * s, descent: -font.descent * s, capHeight: (font.capHeight || font.ascent * 0.7) * s };
  }

  /**
   * Makes text renderable in a font: substitutes common characters the font lacks and drops the
   * rest. Returns { text, missing } so the studio can warn the student.
   */
  sanitize(id, text) {
    const { font } = this.get(id);
    let out = '';
    const missing = new Set();
    for (const ch of String(text).normalize('NFC')) {
      const cp = ch.codePointAt(0);
      if (ch === '\n' || font.hasGlyphForCodePoint(cp)) { out += ch; continue; }
      const sub = SUBSTITUTES[ch];
      if (sub && [...sub].every((c) => font.hasGlyphForCodePoint(c.codePointAt(0)))) { out += sub; continue; }
      missing.add(ch);
    }
    return { text: out, missing: [...missing] };
  }

  /** Development diagnostics: what is loaded and what each font covers. */
  diagnostics() {
    return [...this.fonts.values()].map(({ id, meta, bytes, font }) => ({
      id,
      file: meta.file,
      family: font.familyName,
      postscript: font.postscriptName,
      bytes: bytes.length,
      glyphs: font.numGlyphs,
      unitsPerEm: font.unitsPerEm,
      latin: [...'AaZz09.,;:!?\'"()-'].every((c) => font.hasGlyphForCodePoint(c.codePointAt(0))),
      rupee: font.hasGlyphForCodePoint(0x20b9),
      devanagari: font.hasGlyphForCodePoint(0x0915)
    }));
  }
}
