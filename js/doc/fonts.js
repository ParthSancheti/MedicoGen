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
  handlee:        { file: 'Handlee-Regular.ttf',            family: 'MG Handlee',      weight: 400, label: 'Handlee' },
  patrick:        { file: 'PatrickHand-Regular.ttf',        family: 'MG Patrick Hand', weight: 400, label: 'Patrick Hand' },
  caveat:         { file: 'Caveat-VariableFont_wght.ttf',   family: 'MG Caveat',       weight: 400, label: 'Caveat' },
  gochi:          { file: 'GochiHand-Regular.ttf',          family: 'MG Gochi Hand',   weight: 400, label: 'Gochi Hand' },
  indie:          { file: 'IndieFlower-Regular.ttf',        family: 'MG Indie Flower', weight: 400, label: 'Indie Flower' },
  schoolbell:     { file: 'Schoolbell-Regular.ttf',         family: 'MG Schoolbell',   weight: 400, label: 'Schoolbell' },
  justanother:    { file: 'JustAnotherHand-Regular.ttf',    family: 'MG Just Another Hand', weight: 400, label: 'Just Another Hand' },
  shadows:        { file: 'ShadowsIntoLight_400Regular.ttf', family: 'MG Shadows Into Light', weight: 400, label: 'Shadows Into Light' },
  covered:        { file: 'CoveredByYourGrace_400Regular.ttf', family: 'MG Covered By Your Grace', weight: 400, label: 'Covered By Your Grace' },
  architects:     { file: 'ArchitectsDaughter_400Regular.ttf', family: 'MG Architects Daughter', weight: 400, label: 'Architects Daughter' },
  dawning:        { file: 'DawningofaNewDay_400Regular.ttf', family: 'MG Dawning', weight: 400, label: 'Dawning of a New Day' },
  cedarville:     { file: 'CedarvilleCursive_400Regular.ttf', family: 'MG Cedarville', weight: 400, label: 'Cedarville Cursive' },
  nothing:        { file: 'NothingYouCouldDo_400Regular.ttf', family: 'MG Nothing You Could Do', weight: 400, label: 'Nothing You Could Do' },
  homemade:       { file: 'HomemadeApple_400Regular.ttf', family: 'MG Homemade Apple', weight: 400, label: 'Homemade Apple' },
  // OpenType features applied identically by the shaper and the PDF embedder (Mynerve's wide t_t ligature reads as a gap)
  mynerve:        { file: 'Mynerve_400Regular.ttf', family: 'MG Mynerve', weight: 400, label: 'Mynerve', features: { liga: false } },
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
      let faceOk;
      if (this.registerFaces && typeof FontFace !== 'undefined') {
        const face = new FontFace(meta.family, bytes.slice().buffer, { weight: String(meta.weight), style: 'normal' });
        await face.load();
        document.fonts.add(face);
        faceOk = face.status === 'loaded';
      }
      const entry = { id, meta, bytes, font, faceLoaded: faceOk };
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

  /**
   * Measured metrics as fractions of the em. Handwriting fonts often ship wrong OS/2 values
   * (Handlee declares an x-height of 0.33 while its "x" is 0.49 tall), so the optical values come
   * from real glyph outlines; the declared OS/2 values are kept for diagnostics.
   */
  metrics(id) {
    const entry = this.get(id);
    if (entry.metrics) return entry.metrics;
    const { font } = entry;
    const u = font.unitsPerEm;
    const box = (chars, pick, fn) => {
      const v = [...chars].filter((c) => font.hasGlyphForCodePoint(c.codePointAt(0))).map((c) => font.glyphForCodePoint(c.codePointAt(0)).bbox[pick]);
      return v.length ? fn(...v) / u : null;
    };
    const xHeight = box('xvwz', 'maxY', (...v) => v.reduce((a, b) => a + b, 0) / v.length) || font.xHeight / u;
    const capHeight = box('HEIT', 'maxY', (...v) => v.reduce((a, b) => a + b, 0) / v.length) || font.capHeight / u;
    entry.metrics = {
      unitsPerEm: u,
      xHeight,
      capHeight,
      ascender: box('bdfhklt', 'maxY', Math.max) || font.ascent / u,      // tallest lowercase stroke
      descender: -(box('gjpqy', 'minY', Math.min) || font.descent / u),   // deepest tail, positive
      body: (xHeight + capHeight) / 2,
      declared: { ascent: font.ascent / u, descent: -font.descent / u, lineGap: font.lineGap / u, xHeight: font.xHeight / u, capHeight: font.capHeight / u }
    };
    return entry.metrics;
  }

  /** Visual body height of a font as a fraction of its size: mean of x-height and cap height. */
  bodyHeight(id) {
    return this.metrics(id).body;
  }

  /**
   * Shapes a word with the font's own OpenType layout (kerning, ligatures, contextual alternates)
   * and returns its glyphs grouped into clusters: a cluster is a base glyph plus any zero-width
   * marks attached to it, so accents and combined characters always move with their letter.
   * Advances are in em units (multiply by size).
   */
  shape(id, text) {
    const key = id + '§' + text;
    this.shapes = this.shapes || new Map();
    let out = this.shapes.get(key);
    if (out) return out;
    const { font, meta } = this.get(id);
    const run = font.layout(text, meta.features);
    const u = font.unitsPerEm;
    out = [];
    run.glyphs.forEach((g, i) => {
      const p = run.positions[i];
      const glyph = { gid: g.id, ch: String.fromCodePoint(...(g.codePoints.length ? g.codePoints : [0xfffd])), adv: g.advanceWidth / u, dx: p.xOffset / u, dy: p.yOffset / u, kern: (p.xAdvance - g.advanceWidth) / u };
      if (out.length && g.advanceWidth === 0) out[out.length - 1].marks.push(glyph); // mark glyph rides on its base
      else out.push({ ...glyph, marks: [] });
    });
    if (this.shapes.size > 5000) this.shapes.clear();
    this.shapes.set(key, out);
    return out;
  }

  /** SVG path data of a glyph outline, in font units (y up). Cached. */
  glyphPath(id, gid) {
    const entry = this.get(id);
    entry.paths = entry.paths || new Map();
    let d = entry.paths.get(gid);
    if (d === undefined) {
      d = entry.font.getGlyph(gid).path.toSVG();
      entry.paths.set(gid, d);
    }
    return d;
  }

  /** Declared ascent/descent in mm at a size (for vertical centring). */
  metricsAt(id, sizePt) {
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
    return [...this.fonts.values()].map(({ id, meta, bytes, font, faceLoaded }) => ({
      metrics: this.metrics(id),
      faceLoaded: faceLoaded === undefined ? null : faceLoaded,
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
