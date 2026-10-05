/**
 * Stand-in for the Gemini generateContent endpoint used only by the mock runtime.
 * It reads the same FACTS block the real prompt sends and answers in the same response shape
 * (candidates[0].content.parts[0].text = JSON string), so the backend parsing path is exercised.
 *
 * Modes (Script Property MOCK_GEMINI): ok | 429 | error | garbage | invent
 */

const OPENERS = [
  (f) => `I am a student of ${f.student.year ? f.student.year + ', ' : ''}the Department of ${dept(f)}.`,
  (f) => `I am studying in ${f.student.year ? f.student.year + ' of ' : ''}the Department of ${dept(f)}.`
];

function dept(f) {
  return String(f.student.department || '').replace(/^department of\s+/i, '');
}

function reasonPhrase(f) {
  let r = String(f.absence.reasonInStudentsWords || '').trim().replace(/[.\s]+$/, '');
  r = r.replace(/^(because|due to|as)\s+/i, '');
  if (/^i\b/i.test(r)) return 'I' + r.slice(1);
  return r.charAt(0).toLowerCase() + r.slice(1);
}

function compose(f) {
  const leave = /upcoming/.test(f.letterType);
  const opener = OPENERS[(reasonPhrase(f).length + f.absence.days) % OPENERS.length](f);
  const p1 = leave
    ? `${opener} I would like to request leave ${f.absence.period}, as ${reasonPhrase(f)}.`
    : `${opener} I was unable to attend my lectures and practicals ${f.absence.period}, as ${reasonPhrase(f)}.`;
  const p2 = leave
    ? 'I will stay in touch with my classmates during this time and make sure that I complete all the notes, assignments and practical work that I miss as soon as I return. I request you to kindly grant me leave for these days.'
    : 'I have already started collecting notes from my classmates and I will complete the pending assignments and practical work at the earliest. I request you to kindly grant me leave for these days and consider my attendance for this period.';
  const paragraphs = [p1, p2];
  if (f.absence.documents) paragraphs.push('I have attached the supporting documents with this application for your reference.');
  return {
    subject: `${leave ? 'Request for leave' : 'Application for leave of absence'} ${f.absence.period.replace(/ \(\d+ days\)$/, '')}`,
    salutation: f.recipient.salutation,
    paragraphs,
    closing: 'Thanking you.',
    signoff: f.tone === 'simple' ? 'Yours sincerely,' : 'Yours obediently,'
  };
}

function respond(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { getResponseCode: () => status, getContentText: () => text };
}

export function mockGeminiResponse(mode, request) {
  if (mode === '429') return respond(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded (mock)' } });
  if (mode === 'error') return respond(500, { error: { code: 500, status: 'INTERNAL', message: 'Mock failure' } });
  const userText = request?.contents?.[0]?.parts?.[0]?.text || '';
  const facts = JSON.parse(userText.replace(/^FACTS:\s*/, ''));
  let letter = compose(facts);
  if (mode === 'invent') letter.paragraphs[0] += ' Dr. Mehta at City Hospital diagnosed me with typhoid.';
  const text = mode === 'garbage' ? '{"subject": "Leave", "paragr' : JSON.stringify(letter);
  return respond(200, { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] });
}
