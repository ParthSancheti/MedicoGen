/**
 * Browser document engine. One structured document → one layout → two views (SVG preview, PDF).
 */
import { FontRegistry } from './fonts.js';
import { STYLES, styleFonts } from './styles.js';
import { layoutLetter } from './letter-layout.js';
import { layoutTemplate, templateFonts } from './template-layout.js';
import { TEMPLATES } from './templates.js';
import { pageToSvg } from './render-svg.js';
import { renderPdf } from './render-pdf.js';

const base = new URL('../../', import.meta.url);
let libs = null;
let registry = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL(src, base).href;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.append(s);
  });
}

/** fontkit is needed for measuring (preview); pdf-lib only when exporting. */
async function ensureFontkit() {
  if (!window.fontkit) await loadScript('vendor/fontkit.umd.min.js');
  return window.fontkit.default || window.fontkit;
}

async function ensurePdfLib() {
  if (!window.PDFLib) await loadScript('vendor/pdf-lib.min.js');
  return window.PDFLib;
}

export async function getRegistry() {
  if (registry) return registry;
  const fontkit = await ensureFontkit();
  registry = new FontRegistry({
    fontkit,
    baseUrl: new URL('assets/fonts/', base).href,
    registerFaces: true,
    loadBytes: async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Font download failed: ' + url);
      return res.arrayBuffer();
    }
  });
  return registry;
}

export function fontsFor(doc) {
  return doc.kind === 'demo' ? templateFonts() : styleFonts(STYLES[doc.style] || STYLES.notebook);
}

/**
 * doc = { kind:'letter', style, input, content, id }  or  { kind:'demo', templateId, fields, id }
 */
export async function layoutDocument(doc, { dev = false } = {}) {
  const reg = await getRegistry();
  await reg.ensure(fontsFor(doc));
  if (doc.kind === 'demo') return layoutTemplate({ templateId: doc.templateId, fields: doc.fields || {}, registry: reg, dev });
  return layoutLetter({ input: doc.input, content: doc.content, styleId: doc.style, registry: reg, seed: doc.id || 'preview' });
}

export function pagesToSvg(pages, opts) {
  return pages.map((p) => pageToSvg(p, opts));
}

export function documentFileName(doc) {
  const name = (doc.kind === 'demo' ? doc.fields?.name : doc.input?.student?.name) || 'document';
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'document';
  return doc.kind === 'demo' ? `SAMPLE-${doc.templateId}-${slug}.pdf` : `application-${slug}.pdf`;
}

export async function exportPdf(doc) {
  const [PDFLib, fontkit] = await Promise.all([ensurePdfLib(), ensureFontkit()]);
  const { pages } = await layoutDocument(doc);
  const reg = await getRegistry();
  const isDemo = doc.kind === 'demo';
  const bytes = await renderPdf({
    pages,
    registry: reg,
    PDFLib,
    fontkit,
    loadImage: async (href) => new Uint8Array(await (await fetch(new URL(href, base))).arrayBuffer()),
    meta: isDemo
      ? { title: 'SAMPLE — ' + TEMPLATES[doc.templateId].name + ' (demonstration only)', subject: 'Demonstration template. Not a medical certificate.', keywords: ['sample', 'demonstration'] }
      : { title: doc.content?.subject || 'Application', subject: 'Student application', keywords: ['application'] }
  });
  return { blob: new Blob([bytes], { type: 'application/pdf' }), fileName: documentFileName(doc), pages: pages.length };
}

export async function fontDiagnostics() {
  const reg = await getRegistry();
  await reg.ensure(Object.values(STYLES).flatMap(styleFonts).concat(templateFonts()));
  return reg.diagnostics();
}
