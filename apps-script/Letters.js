/**
 * Medico Gen — student letter language.
 *
 * Gemini writes LANGUAGE ONLY: subject, salutation, body paragraphs, closing and sign-off, as
 * structured JSON. Addresses, dates, names and layout are assembled deterministically on the
 * client from the facts the student typed. If Gemini is unavailable, rate-limited, returns
 * malformed JSON or mentions facts the student never gave, a deterministic letter is used.
 */

var REASON_CATEGORIES_ = {
  illness: 'illness',
  medical: 'a medical appointment',
  family: 'a family function',
  emergency: 'a family emergency',
  travel: 'unavoidable travel',
  event: 'participation in an event',
  other: 'personal reasons'
};

function normalizeLetterInput_(raw) {
  var s = raw.student || {}, a = raw.absence || {}, r = raw.recipient || {};
  var from = String(a.from || ''), to = String(a.to || a.from || '');
  if (!isIsoDate_(from) || !isIsoDate_(to)) fail_('VALIDATION', 'Please choose valid absence dates.');
  var days = daysInclusive_(from, to);
  if (days < 1) fail_('VALIDATION', 'The end date can’t be before the start date.');
  if (days > 120) fail_('VALIDATION', 'Absence period looks too long. Please check the dates.');
  var letterDate = isIsoDate_(raw.date) ? raw.date : new Date().toISOString().slice(0, 10);
  var salutation = ['Sir', 'Madam', 'Sir/Madam'].indexOf(r.salutation) >= 0 ? r.salutation : 'Sir/Madam';
  return {
    letterType: raw.letterType === 'leave' ? 'leave' : 'absence',
    date: letterDate,
    tone: raw.tone === 'simple' ? 'simple' : 'formal',
    student: {
      name: requireText_(s.name, 80, 'your name'),
      college: requireText_(s.college, 140, 'your college'),
      department: requireText_(s.department, 100, 'your department'),
      year: cleanText_(s.year, 40),
      division: cleanText_(s.division, 20),
      rollNo: cleanText_(s.rollNo, 30)
    },
    absence: {
      from: from,
      to: to,
      days: days,
      reasonCategory: REASON_CATEGORIES_[a.reasonCategory] ? a.reasonCategory : 'other',
      reason: requireText_(a.reason, 600, 'the reason'),
      documents: a.documents === true
    },
    recipient: {
      name: cleanText_(r.name, 80),
      designation: requireText_(r.designation, 80, 'the designation'),
      salutation: salutation
    }
  };
}

function letterTitle_(input) {
  var kind = input.letterType === 'leave' ? 'Leave request' : 'Absence application';
  return kind + ' · ' + longDate_(input.absence.from).replace(/ \d{4}$/, '');
}

function periodText_(a) {
  return a.days === 1
    ? 'on ' + longDate_(a.from)
    : 'from ' + longDate_(a.from) + ' to ' + longDate_(a.to) + ' (' + a.days + ' days)';
}

/* ---------- composition entry point ---------- */

function composeLetter_(input) {
  if (!secret_('GEMINI_API_KEY', true)) {
    return { content: fallbackLetter_(input), source: 'fallback', reason: 'no_key', notice: 'AI_UNAVAILABLE' };
  }
  var cache = CacheService.getScriptCache();
  if (cache.get('gemini_cooldown')) {
    return { content: fallbackLetter_(input), source: 'fallback', reason: 'cooldown', notice: 'AI_BUSY' };
  }
  var res = callGemini_(input);
  if (res.ok) {
    var content = sanitizeLetterContent_(res.data, false);
    var problem = content ? factGuard_(content, input) : 'shape';
    if (!problem) return { content: content, source: 'gemini' };
    return { content: fallbackLetter_(input), source: 'fallback', reason: 'guard_' + problem, notice: 'AI_UNAVAILABLE' };
  }
  if (res.rateLimited) cache.put('gemini_cooldown', '1', cfgInt_('GEMINI_TIMEOUT_COOLDOWN_SEC'));
  return {
    content: fallbackLetter_(input),
    source: 'fallback',
    reason: res.reason,
    notice: res.rateLimited ? 'AI_BUSY' : 'AI_UNAVAILABLE'
  };
}

/* ---------- Gemini ---------- */

var LETTER_SCHEMA_ = {
  type: 'OBJECT',
  properties: {
    subject: { type: 'STRING', description: 'One-line subject, without the word "Subject:".' },
    salutation: { type: 'STRING', description: 'e.g. "Respected Sir," — must end with a comma.' },
    paragraphs: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Two or three body paragraphs.' },
    closing: { type: 'STRING', description: 'e.g. "Thanking you."' },
    signoff: { type: 'STRING', description: 'e.g. "Yours obediently," — must end with a comma.' }
  },
  required: ['subject', 'salutation', 'paragraphs', 'closing', 'signoff'],
  propertyOrdering: ['subject', 'salutation', 'paragraphs', 'closing', 'signoff']
};

function letterSystemPrompt_() {
  return [
    'You write short applications that Indian college students hand to their Head of Department.',
    'Write as the student, in the first person, in clear, respectful, natural Indian-English that a good student would actually write by hand.',
    'Fix grammar and improve flow, but keep it simple and sincere. Avoid corporate or flowery phrases ("I hope this finds you well", "kindly do the needful", "esteemed", "humbly beseech").',
    'STRICT FACT RULE: use only facts present in FACTS. Never invent doctors, hospitals, clinics, diagnoses, medicines, tests, reports, certificates, events, people, places, dates or numbers.',
    'If the reason is vague, stay vague. Do not add medical detail. Do not claim documents are attached unless FACTS.absence.documents is true.',
    'Do not include the address block, the date, the student’s name or class details in the paragraphs — those are printed separately.',
    'Body: 2 or 3 paragraphs, 120–190 words in total. Paragraph 1: who is writing (no name needed — "I am a student of …" is fine) and the absence with its dates and reason. Paragraph 2: a brief, genuine assurance about catching up on missed lectures and practicals, and the request to grant leave / regularise attendance. An optional short third paragraph only if documents are attached.',
    'Subject: concise, e.g. "Application for leave of absence from 12 September 2026 to 14 September 2026".',
    'Return only JSON matching the schema.'
  ].join('\n');
}

function letterUserPrompt_(input) {
  var facts = {
    letterType: input.letterType === 'leave' ? 'request for upcoming leave' : 'application for absence already taken',
    tone: input.tone,
    student: {
      department: input.student.department,
      year: input.student.year,
      college: input.student.college
    },
    absence: {
      period: periodText_(input.absence),
      days: input.absence.days,
      category: REASON_CATEGORIES_[input.absence.reasonCategory],
      reasonInStudentsWords: input.absence.reason,
      documents: input.absence.documents
    },
    recipient: {
      designation: input.recipient.designation,
      salutation: 'Respected ' + input.recipient.salutation + ','
    }
  };
  return 'FACTS:\n' + JSON.stringify(facts, null, 2);
}

function callGemini_(input) {
  var model = String(cfg_('GEMINI_MODEL')).replace(/[^A-Za-z0-9._-]/g, '');
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
  var body = {
    systemInstruction: { parts: [{ text: letterSystemPrompt_() }] },
    contents: [{ role: 'user', parts: [{ text: letterUserPrompt_(input) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: LETTER_SCHEMA_,
      temperature: 0.6,
      maxOutputTokens: 4096
    }
  };
  var response;
  try {
    response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': secret_('GEMINI_API_KEY') },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
  } catch (e) {
    return { ok: false, reason: 'network' };
  }
  var status = response.getResponseCode();
  var text = response.getContentText();
  if (status === 429 || /RESOURCE_EXHAUSTED/.test(text)) return { ok: false, rateLimited: true, reason: 'http_429' };
  if (status !== 200) {
    Logger.log('Gemini HTTP ' + status + ': ' + String(text).slice(0, 300)); // server log only
    return { ok: false, rateLimited: status === 503, reason: 'http_' + status };
  }
  var json = parseJson_(text, null);
  var cand = json && json.candidates && json.candidates[0];
  if (!cand || !cand.content || !cand.content.parts) return { ok: false, reason: 'empty' };
  if (cand.finishReason && cand.finishReason !== 'STOP') return { ok: false, reason: 'finish_' + cand.finishReason };
  var out = cand.content.parts.map(function (part) { return part.text || ''; }).join('');
  var data = parseJson_(out, null);
  if (!data) return { ok: false, reason: 'bad_json' };
  return { ok: true, data: data };
}

/** Normalises any letter content (Gemini output or student edits). Returns null if unusable. */
function sanitizeLetterContent_(c, lenient) {
  if (!c || typeof c !== 'object') return lenient ? fail_('VALIDATION', 'Invalid document.') : null;
  var paragraphs = Array.isArray(c.paragraphs) ? c.paragraphs : [];
  paragraphs = paragraphs.map(function (p) { return cleanText_(p, 1400, false); }).filter(Boolean).slice(0, 8);
  var out = {
    subject: cleanText_(c.subject, 200).replace(/^subject\s*:\s*/i, ''),
    salutation: cleanText_(c.salutation, 80),
    paragraphs: paragraphs,
    closing: cleanText_(c.closing, 80),
    signoff: cleanText_(c.signoff, 80)
  };
  if (!lenient && (!out.subject || !out.salutation || paragraphs.length < 1 || paragraphs.length > 4)) return null;
  var words = paragraphs.join(' ').split(/\s+/).length;
  if (!lenient && (words < 40 || words > 360)) return null;
  return out;
}

/**
 * Rejects AI text that introduces medical facts or numbers the student never typed.
 * Returns a short problem label, or '' when the letter is clean.
 */
var GUARDED_TERMS_ = ['dr\\b', 'doctor', 'physician', 'hospital', 'clinic', 'nursing\\s+home', 'diagnos', 'prescri', 'medicine', 'medication', 'tablet',
  'tests?\\b', 'report', 'certificate', 'typhoid', 'dengue', 'malaria', 'covid', 'fracture', 'surgery', 'operation', 'admitted', 'infection', 'viral', 'injur'];
function factGuard_(content, input) {
  var source = (input.absence.reason + ' ' + input.recipient.designation + ' ' + input.student.department + ' ' + input.student.college).toLowerCase();
  var text = (content.subject + ' ' + content.paragraphs.join(' ')).toLowerCase();
  for (var i = 0; i < GUARDED_TERMS_.length; i++) {
    var term = GUARDED_TERMS_[i];
    var re = new RegExp('\\b' + term, 'i');
    if (re.test(text) && !re.test(source)) return 'term_' + term.replace(/\W+/g, '');
  }
  // Every number in the letter must come from the facts (dates, day count, year, division, roll no.).
  var allowed = (input.absence.from + ' ' + input.absence.to + ' ' + longDate_(input.absence.from) + ' ' + longDate_(input.absence.to) + ' ' +
    input.absence.days + ' ' + source + ' ' + input.student.year + ' ' + input.student.division + ' ' + input.student.rollNo);
  var nums = text.match(/\d+/g) || [];
  for (var n = 0; n < nums.length; n++) {
    if (!new RegExp('(^|\\D)' + Number(nums[n]) + '(\\D|$)').test(allowed.replace(/\b0+(\d)/g, '$1'))) return 'number';
  }
  return '';
}

/* ---------- deterministic fallback ---------- */

/** Joins the student's own reason into a sentence without changing its meaning. */
function reasonClause_(reason) {
  var r = String(reason).trim().replace(/[.\s]+$/, '');
  if (/^(due to|because|as|since)\b/i.test(r)) return r.charAt(0).toLowerCase() + r.slice(1);
  if (/^(i|my|we|our|there)\b/i.test(r)) return 'as ' + (/^i\b/i.test(r) ? 'I' + r.slice(1) : r.charAt(0).toLowerCase() + r.slice(1));
  return 'because of ' + r.charAt(0).toLowerCase() + r.slice(1);
}

function fallbackLetter_(input) {
  var a = input.absence, s = input.student;
  var period = periodText_(a);
  var leave = input.letterType === 'leave';
  var p1 = 'I am a student of ' + (s.year ? s.year + ', ' : '') + 'the Department of ' + s.department.replace(/^department of\s+/i, '') + '. ' +
    (leave
      ? 'I would like to request leave ' + period + ' ' + reasonClause_(a.reason) + '.'
      : 'I was unable to attend college ' + period + ' ' + reasonClause_(a.reason) + '.');
  var p2 = (leave
    ? 'I will make sure that I complete the lectures and practicals that I miss during this period with the help of my classmates and teachers. '
    : 'I have started covering the lectures and practicals that I missed with the help of my classmates and teachers. ') +
    'I kindly request you to grant me leave for the above period' + (leave ? '.' : ' and consider my attendance accordingly.');
  var paragraphs = [p1, p2];
  if (a.documents) paragraphs.push('I have attached the relevant supporting documents with this application for your reference.');
  return {
    subject: (leave ? 'Application for leave ' : 'Application for leave of absence ') + period.replace(/ \(\d+ days\)$/, ''),
    salutation: 'Respected ' + input.recipient.salutation + ',',
    paragraphs: paragraphs,
    closing: 'Thanking you.',
    signoff: 'Yours obediently,'
  };
}
