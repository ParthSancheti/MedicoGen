/**
 * Letter styles and papers.
 * Typography (WRITING) and physical page geometry (PAPERS) are independent decisions.
 */
export const A4 = { w: 210, h: 297 };

export const PAPERS = {
  classmate: {
    id: 'classmate', name: 'Classmate', blurb: 'Classic ruled notebook page',
    align: 'left', indent: 9, margin: { left: 28, right: 196, top: 0, bottom: 0 },
    ruled: { paper: '#fffef9', first: 33.5, gap: 7.6, last: 284, rule: '#b7cde6', marginLine: 23, marginColor: '#e59a9a', header: 21 },
    baselineLift: 1.15, blockGap: 1, paraGap: 0, subjectUnderline: true
  },
  black_margin: {
    id: 'black_margin', name: 'Black Margin', blurb: 'Dark ruled margin sheet',
    align: 'left', indent: 9, margin: { left: 32, right: 196, top: 0, bottom: 0 },
    ruled: { paper: '#fafafa', first: 35, gap: 8.0, last: 280, rule: '#e0e0e0', marginLine: 28, marginColor: '#222222', header: 20 },
    baselineLift: 1.15, blockGap: 1, paraGap: 0, subjectUnderline: true
  },
  legal: {
    id: 'legal', name: 'Legal Pad', blurb: 'Yellow ruled notepad',
    align: 'left', indent: 0, margin: { left: 38, right: 196, top: 0, bottom: 0 },
    ruled: { paper: '#fdfce6', first: 40, gap: 8.5, last: 280, rule: '#add8e6', marginLine: 32, marginColor: '#ff9999', marginLine2: 33.5, header: 25 },
    baselineLift: 1.15, blockGap: 1, paraGap: 0, subjectUnderline: true
  },
  cream: {
    id: 'cream', name: 'Cream Smooth', blurb: 'Warm unruled paper',
    align: 'left', indent: 12, margin: { left: 25, right: 185, top: 30, bottom: 272 },
    paper: '#fffdf4', blockGap: 4.4, paraGap: 1.5, subjectUnderline: false
  },
  plain: {
    id: 'plain', name: 'Plain A4', blurb: 'Clean white sheet',
    align: 'justify', indent: 0, margin: { left: 26, right: 184, top: 30, bottom: 272 },
    paper: '#ffffff', blockGap: 4.2, paraGap: 3.2, subjectUnderline: false
  }
};

export const PAPER_ORDER = ['classmate', 'black_margin', 'legal', 'cream', 'plain'];

export const WRITING = {
  kalam: { id: 'kalam', name: 'Kalam', tag: 'Handwritten', fonts: { body: 'kalam', bold: 'kalamBold' }, size: 13.1, lineHeight: 7.6, ink: '#1f2f6b', labelInk: '#1f2f6b', jitter: true, split: 'word', type: 'hand' },
  handlee: { id: 'handlee', name: 'Handlee', tag: 'Handwritten', fonts: { body: 'handlee', bold: 'handlee' }, size: 13.5, lineHeight: 7.6, ink: '#182452', labelInk: '#182452', jitter: true, split: 'char', type: 'hand' },
  caveat: { id: 'caveat', name: 'Caveat', tag: 'Handwritten', fonts: { body: 'caveat', bold: 'caveat' }, size: 17.5, lineHeight: 7.6, ink: '#111b40', labelInk: '#111b40', jitter: true, split: 'word', type: 'hand' },
  patrick: { id: 'patrick', name: 'Patrick Hand', tag: 'Handwritten', fonts: { body: 'patrick', bold: 'patrick' }, size: 14.5, lineHeight: 7.6, ink: '#0a1638', labelInk: '#0a1638', jitter: true, split: 'char', type: 'hand' },
  gochi: { id: 'gochi', name: 'Gochi Hand', tag: 'Handwritten', fonts: { body: 'gochi', bold: 'gochi' }, size: 14.0, lineHeight: 7.6, ink: '#1f2f6b', labelInk: '#1f2f6b', jitter: true, split: 'char', type: 'hand' },
  schoolbell: { id: 'schoolbell', name: 'Schoolbell', tag: 'Handwritten', fonts: { body: 'schoolbell', bold: 'schoolbell' }, size: 13.0, lineHeight: 7.6, ink: '#111b40', labelInk: '#111b40', jitter: true, split: 'char', type: 'hand' },
  indie: { id: 'indie', name: 'Indie Flower', tag: 'Handwritten', fonts: { body: 'indie', bold: 'indie' }, size: 15.0, lineHeight: 7.6, ink: '#182452', labelInk: '#182452', jitter: true, split: 'char', type: 'hand' },
  academic: { id: 'academic', name: 'Academic', tag: 'Serif', fonts: { body: 'serif', bold: 'serifBold' }, size: 11.4, lineHeight: 6.05, ink: '#16181d', labelInk: '#16181d', split: 'word', type: 'print' },
  modern: { id: 'modern', name: 'Modern', tag: 'Sans', fonts: { body: 'sans', bold: 'sansBold' }, size: 10.4, lineHeight: 5.75, ink: '#15171c', labelInk: '#0b63ce', split: 'word', type: 'print' },
  classic: { id: 'classic', name: 'Classic', tag: 'Formal', fonts: { body: 'baskerville', bold: 'baskervilleBold' }, size: 10.3, lineHeight: 6.3, ink: '#1b1a18', labelInk: '#1b1a18', split: 'word', type: 'print' }
};

export const WRITING_ORDER = ['handlee', 'caveat', 'patrick', 'gochi', 'schoolbell', 'indie', 'kalam', 'academic', 'modern', 'classic'];

export function styleFonts(writingId) {
  const w = WRITING[writingId] || WRITING.kalam;
  return [...new Set([w.fonts.body, w.fonts.bold])];
}
