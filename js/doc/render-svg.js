/**
 * Screen renderer: draws layout pages as SVG in millimetre units.
 * Text uses the very FontFace registered from the same TTF that the PDF embeds. Each run is pinned
 * to its measured width (textLength) and kerning is disabled to match pdf-lib's glyph positioning,
 * so preview line endings coincide with the exported PDF.
 */
import { FONT_FILES, PT } from './fonts.js';
import { escapeXml } from './text.js';

const r = (n) => Math.round(n * 1000) / 1000;

export function pageToSvg(page, { className = 'doc-page', interactive = false } = {}) {
  const parts = [];
  for (const it of page.items) {
    switch (it.t) {
      case 'rect':
        parts.push(`<rect x="${r(it.x)}" y="${r(it.y)}" width="${r(it.w)}" height="${r(it.h)}" fill="${it.fill}"${it.opacity != null ? ` fill-opacity="${it.opacity}"` : ''}${it.stroke ? ` stroke="${it.stroke}" stroke-width="${it.sw || 0.2}"` : ''}/>`);
        break;
      case 'line':
        parts.push(`<line x1="${r(it.x1)}" y1="${r(it.y1)}" x2="${r(it.x2)}" y2="${r(it.y2)}" stroke="${it.color}" stroke-width="${it.sw}"${it.opacity != null ? ` stroke-opacity="${it.opacity}"` : ''}/>`);
        break;
      case 'image':
        parts.push(`<image href="${escapeXml(it.href)}" x="${r(it.x)}" y="${r(it.y)}" width="${r(it.w)}" height="${r(it.h)}" preserveAspectRatio="none"/>`);
        break;
      case 'text': {
        const meta = FONT_FILES[it.f];
        const size = it.size * PT;
        const fit = it.s.length > 1 && it.w > 0 ? ` textLength="${r(it.w)}" lengthAdjust="spacing"` : '';
        // Same text matrix pdf-lib builds (rotate + ySkew), mirrored into y-down SVG space, so glyph
        // rotation and slant are identical in preview and PDF.
        let rot = '';
        if (it.rot || it.skew) {
          const a = ((it.rot || 0) * Math.PI) / 180, k = Math.tan(((it.skew || 0) * Math.PI) / 180);
          const m = [Math.cos(a), Math.sin(a), -Math.sin(a) - k, Math.cos(a)].map((v) => Math.round(v * 1e5) / 1e5);
          rot = ` transform="matrix(${m.join(' ')} ${r(it.x)} ${r(it.y)}) translate(${r(-it.x)} ${r(-it.y)})"`;
        }
        const op = it.opacity != null ? ` fill-opacity="${it.opacity}"` : '';
        const data = interactive && it.b ? ` data-block="${escapeXml(it.b)}"` : '';
        parts.push(`<text x="${r(it.x)}" y="${r(it.y)}" font-family="'${meta.family}'" font-weight="${meta.weight}" font-size="${r(size)}" fill="${it.color}"${op}${fit}${rot}${data}>${escapeXml(it.s)}</text>`);
        break;
      }
      case 'box': // developer overlay only (template inspector)
        parts.push(`<rect class="dev-box" data-field="${escapeXml(it.id)}" x="${r(it.x)}" y="${r(it.y)}" width="${r(it.w)}" height="${r(it.h)}" fill="rgba(11,99,206,.08)" stroke="#0b63ce" stroke-width="0.25" stroke-dasharray="1 0.6"/>`);
        break;
      default:
        break;
    }
  }
  return `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${page.w} ${page.h}" style="font-kerning:none;text-rendering:geometricPrecision" role="img" aria-label="Document page">${parts.join('')}</svg>`;
}
