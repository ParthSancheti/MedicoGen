/**
 * The one glyph transform shared by the SVG preview and the PDF exporter.
 * Order: scale (sx, sy) → forward slant (skew°) → rotation (rot°, clockwise on the page).
 * Returned in PDF (y-up) form [a, b, c, d]; svgMatrix() mirrors it into y-down space.
 */
export function glyphMatrix(it) {
  const th = (-(it.rot || 0) * Math.PI) / 180;
  const k = Math.tan(((it.skew || 0) * Math.PI) / 180);
  const sx = it.sx || 1, sy = it.sy || 1;
  const c = Math.cos(th), s = Math.sin(th);
  return [c * sx, s * sx, (c * k - s) * sy, (s * k + c) * sy];
}

export const hasTransform = (it) => !!(it.rot || it.skew || (it.sx && it.sx !== 1) || (it.sy && it.sy !== 1));

export function svgMatrix(it) {
  const [a, b, c, d] = glyphMatrix(it);
  return [a, -b, -c, d].map((v) => Math.round(v * 1e5) / 1e5);
}
