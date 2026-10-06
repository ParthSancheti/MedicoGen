/**
 * Stand-in for Mistral's /v1/chat/completions, used only by the mock runtime when no real key is
 * available. It reads the same FACTS block the real prompt sends and answers in the same response
 * shape (choices[0].message.content = JSON string), so the backend parsing path is exercised.
 *
 * Modes (?ai=…): ok | 429 | error | garbage | invent
 */

const TONE_P2 = {
  formal: (leave) => (leave
    ? 'I will stay in touch with my classmates during this time and make sure that I complete all the notes, assignments and practical work that I miss as soon as I return. I request you to kindly grant me leave for these days.'
    : 'I have already started collecting notes from my classmates and I will complete the pending assignments and practical work at the earliest. I request you to kindly grant me leave for these days and consider my attendance for this period.'),
  warm: (leave) => (leave
    ? 'I really value my classes, so I will keep in touch with my friends and catch up on every lecture and practical I miss. I would be grateful if you could grant me leave for these days.'
    : 'I really value my classes, and I am already catching up on the notes and practical work with the help of my friends. I would be grateful if you could grant me leave and consider my attendance for these days.'),
  simple: (leave) => `I will complete all the work I ${leave ? 'miss' : 'missed'} with help from my classmates. Please grant me leave for these days.`,
  sincere: (leave) => `I am sorry for ${leave ? 'the classes I will miss' : 'missing these classes'} and for any inconvenience caused. I will make up for the lectures and practical work at the earliest. I request you to kindly grant me leave for this period${leave ? '' : ' and consider my attendance'}.`,
  brief: () => 'I will cover the missed work. Kindly grant me leave for these days.'
};

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
  const tone = TONE_P2[f.tone] ? f.tone : 'formal';
  const cls = f.student.year ? `${f.student.year}${f.student.division ? ` (Div. ${f.student.division})` : ''} in ` : '';
  const opener = `I am a student of ${cls}the Department of ${dept(f)}.`;
  const p1 = leave
    ? `${opener} I would like to request leave ${f.absence.period}, as ${reasonPhrase(f)}.`
    : `${opener} I was unable to attend my lectures and practicals ${f.absence.period}, as ${reasonPhrase(f)}.`;
  const paragraphs = [p1, TONE_P2[tone](leave)];
  if (f.absence.documentsAttached && tone !== 'brief') paragraphs.push('I have attached the supporting documents with this application for your reference.');
  return {
    subject: `${leave ? 'Request for leave' : 'Application for leave of absence'} ${f.absence.period.replace(/ \(\d+ days\)$/, '')}`,
    salutation: f.recipient.salutation,
    paragraphs,
    closing: tone === 'warm' ? 'Thank you for your understanding.' : 'Thanking you.',
    signoff: tone === 'warm' || tone === 'simple' ? 'Yours sincerely,' : 'Yours obediently,'
  };
}

function respond(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { getResponseCode: () => status, getContentText: () => text };
}

export function mockMistralResponse(mode, request) {
  if (mode === '429') return respond(429, { object: 'error', message: 'Requests rate limit exceeded (mock)', type: 'rate_limited', code: '1300' });
  if (mode === 'error') return respond(500, { object: 'error', message: 'Mock failure', type: 'internal_error' });
  const userMsg = (request?.messages || []).find((m) => m.role === 'user')?.content || '';
  const facts = JSON.parse(String(userMsg).replace(/^FACTS:\s*/, ''));
  const letter = compose(facts);
  if (mode === 'invent') letter.paragraphs[0] += ' Dr. Mehta at City Hospital diagnosed me with typhoid.';
  const content = mode === 'garbage' ? '{"subject": "Leave", "paragr' : JSON.stringify(letter);
  return respond(200, {
    id: 'mock-' + Date.now(), object: 'chat.completion', model: request?.model || 'mock',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  });
}
