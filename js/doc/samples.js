/** Sample content used for previews (landing page, style gallery). Real engine, fictional student. */
export const SAMPLE_INPUT = {
  letterType: 'absence',
  date: '2026-10-05',
  student: { name: 'Aarav Patil', college: 'Government College of Engineering, Pune', department: 'Computer Engineering', year: 'Third Year', division: 'B', rollNo: '42' },
  absence: { from: '2026-09-12', to: '2026-09-14', days: 3, reasonCategory: 'illness', reason: 'I had high fever and was advised rest at home', documents: false },
  recipient: { name: '', designation: 'Head of Department', salutation: 'Sir' },
  tone: 'formal'
};

export const SAMPLE_CONTENT = {
  subject: 'Application for leave of absence from 12 September 2026 to 14 September 2026',
  salutation: 'Respected Sir,',
  paragraphs: [
    'I am a student of Third Year (Div. B) in the Department of Computer Engineering. I was unable to attend my lectures and practicals from 12 September 2026 to 14 September 2026 (3 days), as I had high fever and was advised rest at home.',
    'I have already started collecting notes from my classmates and I will complete the pending assignments and practical work at the earliest. I request you to kindly grant me leave for these days and consider my attendance for this period.'
  ],
  closing: 'Thanking you.',
  signoff: 'Yours obediently,'
};

export const sampleDoc = (style) => ({ kind: 'letter', id: 'sample', style, input: SAMPLE_INPUT, content: SAMPLE_CONTENT });

/**
 * Output-quality sample: several paragraphs with repeated letters, punctuation, numbers and mixed
 * case, so handwriting profiles can be judged on a realistic page rather than one sentence.
 */
export const QUALITY_INPUT = {
  ...SAMPLE_INPUT,
  student: { ...SAMPLE_INPUT.student, name: 'Ishaan Deshpande', rollNo: '23' },
  recipient: { name: 'Dr. S. R. Kulkarni', designation: 'Head of Department', salutation: 'Sir' }
};
export const QUALITY_CONTENT = {
  subject: 'Application for leave of absence from 12 September 2026 to 16 September 2026',
  salutation: 'Respected Sir,',
  paragraphs: [
    'I am a student of Third Year (Div. B, Roll No. 23) in the Department of Computer Engineering. I was unable to attend college from 12 September 2026 to 16 September 2026 (5 days), as I had a high fever and was advised complete rest at home.',
    'During this period I missed the lectures of DBMS, Operating Systems and Theory of Computation, along with two practical sessions. I have already collected the notes from my classmates, and I will complete the pending assignments, journals and lab write-ups by 25 September 2026.',
    'I sincerely request you to kindly grant me leave for these five days and consider my attendance for this period. I assure you that I will be regular and attentive in all my classes from now on.'
  ],
  closing: 'Thanking you.',
  signoff: 'Yours obediently,'
};
