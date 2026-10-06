/**
 * PDF renderer: draws the same layout pages with pdf-lib on true A4 pages.
 * Every font used by the pages is embedded in full from the registry's TTF bytes. If a page refers
 * to a font that is not loaded, export fails loudly — there is no silent fallback to a standard
 * PDF font.
 */
import { glyphMatrix, hasTransform } from './matrix.js';

const MM = 72 / 25.4;

function hexToRgb(PDFLib, hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * @param {object} opts
 * @param {object[]} opts.pages     layout pages
 * @param {FontRegistry} opts.registry
 * @param {object} opts.PDFLib      pdf-lib namespace
 * @param {object} opts.fontkit     @pdf-lib/fontkit
 * @param {(href:string)=>Promise<Uint8Array>} [opts.loadImage]
 * @param {object} [opts.meta]      { title, subject, keywords }
 * @returns {Promise<Uint8Array>}
 */
export async function renderPdf({ pages, registry, PDFLib, fontkit, loadImage, meta = {} }) {
  const doc = await PDFLib.PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(meta.title || 'Document');
  doc.setCreator('Medico Gen');
  doc.setProducer('Medico Gen document engine');
  if (meta.subject) doc.setSubject(meta.subject);
  if (meta.keywords) doc.setKeywords(meta.keywords);
  doc.setCreationDate(new Date());

  const fontIds = new Set();
  pages.forEach((p) => p.items.forEach((it) => it.t === 'text' && fontIds.add(it.f)));
  const embedded = {};
  for (const id of fontIds) {
    const entry = registry.get(id); // throws if missing — by design
    // Full embedding: pdf-lib's subsetter drops glyph outlines for some fonts (Kalam among them),
    // which would print blank letters. A complete font is larger but always correct.
    embedded[id] = await doc.embedFont(entry.bytes, { subset: false, customName: entry.font.postscriptName });
  }
  const images = {};

  for (const page of pages) {
    const W = page.w * MM, H = page.h * MM;
    const pdfPage = doc.addPage([W, H]);
    for (const it of page.items) {
      if (it.t === 'rect') {
        pdfPage.drawRectangle({
          x: it.x * MM, y: H - (it.y + it.h) * MM, width: it.w * MM, height: it.h * MM,
          color: it.fill ? hexToRgb(PDFLib, it.fill) : undefined,
          opacity: it.opacity != null ? it.opacity : 1,
          borderColor: it.stroke ? hexToRgb(PDFLib, it.stroke) : undefined,
          borderWidth: it.stroke ? (it.sw || 0.2) * MM : 0
        });
      } else if (it.t === 'line') {
        pdfPage.drawLine({
          start: { x: it.x1 * MM, y: H - it.y1 * MM }, end: { x: it.x2 * MM, y: H - it.y2 * MM },
          thickness: it.sw * MM, color: hexToRgb(PDFLib, it.color), opacity: it.opacity != null ? it.opacity : 1
        });
      } else if (it.t === 'image') {
        if (!images[it.href]) {
          const bytes = await loadImage(it.href);
          images[it.href] = /\.png($|\?)/i.test(it.href) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        }
        pdfPage.drawImage(images[it.href], { x: it.x * MM, y: H - (it.y + it.h) * MM, width: it.w * MM, height: it.h * MM });
      } else if (it.t === 'dot') {
        pdfPage.drawCircle({ x: it.x * MM, y: H - it.y * MM, size: it.r * MM, color: hexToRgb(PDFLib, it.fill) });
      } else if (it.t === 'text') {
        if (!hasTransform(it) && !it.stroke) {
          pdfPage.drawText(it.s, { x: it.x * MM, y: H - it.y * MM, size: it.size, font: embedded[it.f], color: hexToRgb(PDFLib, it.color), opacity: it.opacity != null ? it.opacity : 1 });
        } else {
          drawGlyphRun(PDFLib, pdfPage, embedded[it.f], it, H);
        }
      }
    }
  }
  return doc.save();
}

/**
 * Text with the shared glyph matrix (scale → slant → rotation) and an optional pen stroke, written
 * with raw PDF operators so it matches the SVG preview exactly (pdf-lib's drawText cannot scale
 * glyphs or stroke them).
 */
function drawGlyphRun(PDFLib, page, font, it, H) {
  const P = PDFLib;
  const [a, b, c, d] = glyphMatrix(it);
  const key = page.node.newFontDictionary(font.name, font.ref);
  const op = it.opacity != null ? it.opacity : 1;
  const gs = op < 1 ? page.maybeEmbedGraphicsState({ opacity: op, borderOpacity: op }) : undefined;
  const col = hexToRgb(P, it.color);
  const ops = [P.pushGraphicsState()];
  if (gs) ops.push(P.setGraphicsState(gs));
  ops.push(P.beginText(), P.setFillingColor(col));
  if (it.stroke) {
    ops.push(P.setStrokingColor(col), P.setLineWidth(it.stroke * MM), P.setLineJoin(P.LineJoinStyle.Round),
      P.setTextRenderingMode(P.TextRenderingMode.FillAndOutline));
  }
  ops.push(P.setFontAndSize(key, it.size), P.setTextMatrix(a, b, c, d, it.x * MM, H - it.y * MM), P.showText(font.encodeText(it.s)), P.endText(), P.popGraphicsState());
  page.pushOperators(...ops);
}
