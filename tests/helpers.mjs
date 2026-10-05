// Loads the vendored browser builds of pdf-lib and fontkit into Node for tests and tooling.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { FontRegistry } from '../js/doc/fonts.js';

export const root = new URL('../', import.meta.url);

function loadUmd(file) {
  // Same realm as the caller (instanceof checks inside pdf-lib must see our arrays), CommonJS shape.
  const module = { exports: {} };
  const fn = vm.runInThisContext('(function (module, exports, self, window, define) {' + readFileSync(new URL(file, root), 'utf8') + '\n})');
  const scope = {};
  fn(module, module.exports, scope, scope, undefined);
  return Object.keys(module.exports).length ? module.exports : scope.PDFLib || scope.fontkit;
}

export const PDFLib = loadUmd('vendor/pdf-lib.min.js');
const fk = loadUmd('vendor/fontkit.umd.min.js');
export const fontkit = fk.default || fk;

export function nodeRegistry() {
  return new FontRegistry({
    fontkit,
    baseUrl: new URL('assets/fonts/', root).href,
    loadBytes: async (url) => readFileSync(new URL(url)).buffer.slice(0)
  });
}

export const sampleInput = {
  letterType: 'absence',
  date: '2026-10-05',
  student: { name: 'Aarav Patil', college: 'Government College of Engineering, Pune', department: 'Computer Engineering', year: 'Third Year', division: 'B', rollNo: '42' },
  absence: { from: '2026-09-12', to: '2026-09-14', days: 3, reasonCategory: 'illness', reason: 'I had high fever and was advised rest at home', documents: false },
  recipient: { name: '', designation: 'Head of Department', salutation: 'Sir' },
  tone: 'formal'
};

export const sampleContent = {
  subject: 'Application for leave of absence from 12 September 2026 to 14 September 2026',
  salutation: 'Respected Sir,',
  paragraphs: [
    'I am a student of Third Year, the Department of Computer Engineering. I was unable to attend my lectures and practicals from 12 September 2026 to 14 September 2026 (3 days), as I had high fever and was advised rest at home.',
    'I have already started collecting notes from my classmates and I will complete the pending assignments and practical work at the earliest. I request you to kindly grant me leave for these days and consider my attendance for this period.'
  ],
  closing: 'Thanking you.',
  signoff: 'Yours obediently,'
};
