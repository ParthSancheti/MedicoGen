/**
 * Letter styles. A style is pure typography + page geometry (millimetres, points); the content is
 * the same for every style, so switching styles never needs a new AI generation.
 */
export const A4 = { w: 210, h: 297 };

export const STYLES = {
  notebook: {
    id: 'notebook',
    name: 'Notebook',
    blurb: 'Natural student handwriting on a ruled page',
    tag: 'Handwritten',
    fonts: { body: 'kalam', bold: 'kalam' },
    size: 13.1,
    ink: '#1f2f6b',
    labelInk: '#1f2f6b',
    align: 'left',
    indent: 9,
    margin: { left: 28, right: 196, top: 0, bottom: 0 },
    ruled: {
      paper: '#fffef9',
      first: 33.5,      // first ruled line (mm from top)
      gap: 7.6,         // line spacing of a typical single-ruled college notebook
      last: 284,
      rule: '#b7cde6',
      marginLine: 23,
      marginColor: '#e59a9a',
      header: 21
    },
    baselineLift: 1.15, // handwriting sits slightly above the rule
    jitter: true,
    blockGap: 1,        // in ruled lines
    paraGap: 0,
    subjectUnderline: true
  },
  academic: {
    id: 'academic',
    name: 'Academic',
    blurb: 'Bookish serif, justified like a printed page',
    tag: 'Serif',
    fonts: { body: 'serif', bold: 'serifBold' },
    size: 11.4,
    lineHeight: 6.05,
    ink: '#16181d',
    labelInk: '#16181d',
    align: 'justify',
    indent: 0,
    margin: { left: 26, right: 184, top: 30, bottom: 272 },
    paper: '#ffffff',
    blockGap: 4.2,
    paraGap: 3.2
  },
  modern: {
    id: 'modern',
    name: 'Modern',
    blurb: 'Crisp sans-serif with generous spacing',
    tag: 'Sans',
    fonts: { body: 'sans', bold: 'sansBold' },
    size: 10.4,
    lineHeight: 5.75,
    ink: '#15171c',
    labelInk: '#0b63ce',
    align: 'left',
    indent: 0,
    margin: { left: 25, right: 185, top: 30, bottom: 272 },
    paper: '#ffffff',
    accentRule: '#0b63ce',
    blockGap: 4.4,
    paraGap: 3.4
  },
  classic: {
    id: 'classic',
    name: 'Classic',
    blurb: 'Traditional Baskerville with indented paragraphs',
    tag: 'Formal',
    fonts: { body: 'baskerville', bold: 'baskervilleBold' },
    size: 10.3,
    lineHeight: 6.3,
    ink: '#1b1a18',
    labelInk: '#1b1a18',
    align: 'justify',
    indent: 8,
    margin: { left: 27, right: 183, top: 31, bottom: 272 },
    paper: '#fffdf8',
    blockGap: 4.2,
    paraGap: 1.2
  }
};

export const STYLE_ORDER = ['notebook', 'academic', 'modern', 'classic'];

export function styleFonts(style) {
  return [...new Set([style.fonts.body, style.fonts.bold])];
}
