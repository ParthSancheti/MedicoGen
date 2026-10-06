/**
 * Reading a real doctor's prescription to start a leave letter.
 *
 * The student photographs a prescription they were actually given. Mistral's vision model reads it
 * into structured details (patient, visit date, complaints, advised rest), which pre-fill the
 * letter wizard; the student then checks every field and supplies anything missing.
 *
 *  - Reading is free (no generation is spent) but limited per code, so it cannot be used as a
 *    general-purpose OCR service.
 *  - The image is sent to Mistral only. It is never written to Sheets, Drive or the event log.
 *  - Nothing is invented: unreadable fields come back empty and the wizard asks for them.
 */

var RX_MAX_PER_CODE_ = 10;          // reads per access code per 6 hours
var RX_MAX_IMAGE_CHARS_ = 3000000;  // ~2.2 MB of base64; the app sends ~300 KB

var RX_SCHEMA_ = {
  type: 'object',
  properties: {
    isPrescription: { type: 'boolean', description: 'True only if the image is a doctor\'s prescription, medical certificate or clinic slip.' },
    legibility: { type: 'string', enum: ['clear', 'partial', 'poor'] },
    patientName: { type: 'string', description: 'Exactly as written; empty if not readable.' },
    patientAge: { type: 'string', description: 'Digits only, empty if absent.' },
    patientSex: { type: 'string', enum: ['M', 'F', ''] },
    visitDate: { type: 'string', description: 'YYYY-MM-DD, empty if absent or unreadable. Indian prescriptions write dates day first.' },
    doctorName: { type: 'string', description: 'Empty if not readable.' },
    clinicName: { type: 'string', description: 'Empty if not readable.' },
    complaints: { type: 'array', items: { type: 'string' }, maxItems: 6, description: 'Symptoms or complaints in plain everyday English, e.g. "high fever", "body ache". No drug names.' },
    diagnosis: { type: 'string', description: 'Only if written on the page; empty otherwise.' },
    restDays: { type: 'integer', description: 'Days of rest advised, 0 if none is written.' },
    advice: { type: 'string', description: 'The written advice, e.g. "Rest for 4 days"; empty if none.' }
  },
  required: ['isPrescription', 'legibility', 'patientName', 'patientAge', 'patientSex', 'visitDate', 'doctorName', 'clinicName', 'complaints', 'diagnosis', 'restDays', 'advice'],
  additionalProperties: false
};

function apiReadPrescription_(p) {
  var t = requireToken_(p.code);
  var image = String(p.image || '');
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) fail_('VALIDATION', 'Upload a photo (JPG or PNG) of the prescription.');
  if (image.length > RX_MAX_IMAGE_CHARS_) fail_('VALIDATION', 'That photo is too large. Please try again with a smaller one.');

  var cache = CacheService.getScriptCache();
  var key = 'rx:' + t.code;
  var used = toInt_(cache.get(key), 0);
  if (used >= RX_MAX_PER_CODE_) fail_('RATE_LIMITED', 'You have read several prescriptions already. Please try again later, or fill in the details yourself.');
  if (!secret_('MISTRAL_API_KEY', true)) fail_('AI_UNAVAILABLE', 'Reading prescriptions isn’t available right now. You can fill in the details yourself.');
  if (cache.get('ai_cooldown')) fail_('AI_BUSY', 'The reader is busy right now. Try again in a minute, or fill in the details yourself.');
  cache.put(key, String(used + 1), 21600);

  var res = callMistralVision_(image);
  if (!res.ok) {
    if (res.rateLimited) cache.put('ai_cooldown', '1', cfgInt_('AI_COOLDOWN_SEC'));
    logEvent_('rx.read.failed', t.code, res.reason);
    fail_(res.rateLimited ? 'AI_BUSY' : 'AI_UNAVAILABLE', 'We couldn’t read that photo. Try a sharper, well-lit photo, or fill in the details yourself.');
  }
  var details = sanitizePrescription_(res.data);
  if (!details.isPrescription) fail_('NOT_PRESCRIPTION', 'That doesn’t look like a prescription. Take a photo of the whole page your doctor gave you.');
  logEvent_('rx.read', t.code, details.legibility); // never the content
  return { details: details, source: res.mock ? 'mock' : 'mistral' };
}

function callMistralVision_(image) {
  var body = {
    model: String(cfg_('MISTRAL_VISION_MODEL')).replace(/[^A-Za-z0-9._-]/g, ''),
    temperature: 0,
    max_tokens: 700,
    messages: [
      { role: 'system', content: [
        'You read photos of Indian doctors\' prescriptions and clinic slips for a student who is writing a leave application.',
        'Transcribe only what is actually written on the page. Never guess, complete or invent a value: if a field is missing or unreadable, return an empty string (or 0 / an empty list).',
        'Describe complaints in plain everyday English a student would use (e.g. "high fever", "body ache"). Do not list medicines or doses.',
        'Dates on Indian prescriptions are written day first (18/02/25 is 18 February 2025). Return YYYY-MM-DD.'
      ].join('\n') },
      { role: 'user', content: [
        { type: 'text', text: 'Read this prescription and return the details as JSON.' },
        { type: 'image_url', image_url: image }
      ] }
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'prescription', schema: RX_SCHEMA_, strict: true } }
  };
  var response;
  try {
    response = UrlFetchApp.fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + secret_('MISTRAL_API_KEY'), Accept: 'application/json' },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
  } catch (e) {
    return { ok: false, reason: 'network' };
  }
  var status = response.getResponseCode();
  if (status === 429) return { ok: false, rateLimited: true, reason: 'http_429' };
  if (status !== 200) {
    Logger.log('Mistral vision HTTP ' + status + ': ' + String(response.getContentText()).slice(0, 300));
    return { ok: false, reason: 'http_' + status };
  }
  var json = parseJson_(response.getContentText(), null);
  var choice = json && json.choices && json.choices[0];
  var out = choice && choice.message && choice.message.content;
  if (Array.isArray(out)) out = out.map(function (c) { return c.text || ''; }).join('');
  var data = parseJson_(String(out || '').replace(/^```(?:json)?\s*|\s*```$/g, ''), null);
  if (!data || typeof data !== 'object') return { ok: false, reason: 'bad_json' };
  return { ok: true, data: data, mock: /^mock/.test(String(json.model || '')) };
}

/** Keeps only well-formed values; anything doubtful becomes empty so the student is asked. */
function sanitizePrescription_(d) {
  var age = String(d.patientAge || '').replace(/\D/g, '').slice(0, 3);
  var date = isIsoDate_(d.visitDate) ? String(d.visitDate) : '';
  if (date && (date < '2000-01-01' || date > isoDaysFromToday_(30))) date = '';
  var rest = toInt_(d.restDays, 0);
  return {
    isPrescription: d.isPrescription === true,
    legibility: ['clear', 'partial', 'poor'].indexOf(d.legibility) >= 0 ? d.legibility : 'poor',
    patientName: cleanText_(d.patientName, 80).replace(/[^\p{L}\p{M} .'-]/gu, '').trim(),
    patientAge: age && Number(age) > 0 && Number(age) < 120 ? age : '',
    patientSex: d.patientSex === 'M' || d.patientSex === 'F' ? d.patientSex : '',
    visitDate: date,
    doctorName: cleanText_(d.doctorName, 80),
    clinicName: cleanText_(d.clinicName, 120),
    complaints: (Array.isArray(d.complaints) ? d.complaints : []).map(function (c) { return cleanText_(c, 60).toLowerCase(); }).filter(Boolean).slice(0, 6),
    diagnosis: cleanText_(d.diagnosis, 120),
    restDays: rest > 0 && rest <= 60 ? rest : 0,
    advice: cleanText_(d.advice, 160)
  };
}

function isoDaysFromToday_(n) {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}
