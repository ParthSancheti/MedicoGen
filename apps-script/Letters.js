/**
 * Medico Gen — student letter language.
 *
 * Mistral writes LANGUAGE ONLY: subject, salutation, body paragraphs, closing and sign-off, as
 * structured JSON (response_format json_schema). Addresses, dates, names and layout are assembled
 * deterministically on the client from the facts the student typed.
 *
 * Reliability chain (the student always gets a finished letter):
 *   1. primary model (MISTRAL_MODEL) with a strict JSON schema
 *   2. if that fails for any reason except an exhausted quota: one attempt on MISTRAL_FALLBACK_MODEL
 *      in plain json_object mode
 *   3. deterministic, tone-aware letter written from the student's own facts
 * Every AI answer is validated and fact-checked; anything that invents medical facts or numbers
 * is discarded in favour of step 3. A 429 opens a short cooldown so we never hammer the API.
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

/** The five tones offered on "How should it sound?". Each one steers the prompt and the fallback. */
var TONES_ = {
  formal:  'Formal and respectful. Classic Indian college application register, complete sentences, no slang.',
  warm:    'Polite and warm. Respectful but personal and friendly; sounds like a sincere student who respects the reader.',
  simple:  'Simple and clear. Short sentences and everyday words, easy to read; still respectful.',
  sincere: 'Sincere and apologetic. Acknowledge the inconvenience of missing classes, apologise once, without grovelling.',
  brief:   'Short and to the point. Only what is needed: 2 short paragraphs, 70–110 words in total.'
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
    tone: TONES_[raw.tone] ? raw.tone : 'formal',
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
  if (!secret_('MISTRAL_API_KEY', true)) {
    return { content: fallbackLetter_(input), source: 'fallback', reason: 'no_key', notice: 'AI_UNAVAILABLE' };
  }
  var cache = CacheService.getScriptCache();
  if (cache.get('ai_cooldown')) {
    return { content: fallbackLetter_(input), source: 'fallback', reason: 'cooldown', notice: 'AI_BUSY' };
  }
  var attempts = [
    { model: cfg_('MISTRAL_MODEL'), schema: true },
    { model: cfg_('MISTRAL_FALLBACK_MODEL'), schema: false }
  ];
  var last = null;
  for (var i = 0; i < attempts.length; i++) {
    if (i > 0 && (!attempts[i].model || attempts[i].model === attempts[0].model && attempts[i].schema === attempts[0].schema)) break;
    var res = callMistral_(input, attempts[i].model, attempts[i].schema);
    if (res.ok) {
      var content = sanitizeLetterContent_(res.data, false);
      var problem = content ? factGuard_(content, input) : 'shape';
      if (!problem) return { content: content, source: 'mistral', model: attempts[i].model };
      last = { reason: 'guard_' + problem };
      continue; // a second model may phrase it cleanly
    }
    last = res;
    if (res.rateLimited) {
      cache.put('ai_cooldown', '1', cfgInt_('AI_COOLDOWN_SEC'));
      break; // the same key is exhausted for every model
    }
  }
  return {
    content: fallbackLetter_(input),
    source: 'fallback',
    reason: last ? last.reason : 'unknown',
    notice: last && last.rateLimited ? 'AI_BUSY' : 'AI_UNAVAILABLE'
  };
}

/* ---------- Mistral ---------- */

var LETTER_SCHEMA_ = {
  type: 'object',
  properties: {
    subject: { type: 'string', description: 'One-line subject, without the word "Subject:".' },
    salutation: { type: 'string', description: 'e.g. "Respected Sir," and must end with a comma.' },
    paragraphs: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3, description: 'Two or three body paragraphs.' },
    closing: { type: 'string', description: 'e.g. "Thanking you."' },
    signoff: { type: 'string', description: 'e.g. "Yours obediently," and must end with a comma.' }
  },
  required: ['subject', 'salutation', 'paragraphs', 'closing', 'signoff'],
  additionalProperties: false
};

function letterSystemPrompt_(tone) {
  return [
    'You write short applications that Indian college students hand to their Head of Department or teacher.',
    'Write as the student, in the first person, in natural Indian-English that a good student would actually write by hand.',
    'TONE: ' + TONES_[tone],
    'Fix grammar and improve flow. Avoid corporate or flowery phrases ("I hope this finds you well", "kindly do the needful", "esteemed", "humbly beseech").',
    'STRICT FACT RULE: use only facts present in FACTS. Never invent doctors, hospitals, clinics, diagnoses, medicines, tests, reports, certificates, events, people, places, dates or numbers.',
    'If the reason is vague, stay vague. Do not add medical detail. Mention attached documents only if FACTS.absence.documentsAttached is true.',
    'Do not put the address block, the letter date, the student’s name or roll number inside the paragraphs: they are printed separately on the page.',
    tone === 'brief'
      ? 'Body: exactly 2 short paragraphs, 70–110 words in total.'
      : 'Body: 2 or 3 paragraphs, 120–190 words in total. Paragraph 1: who is writing (class and department, no name) and the absence with its exact dates and reason. Paragraph 2: a genuine assurance about catching up on missed lectures, practicals and assignments, and the request to grant leave / regularise attendance. A short third paragraph only if documents are attached.',
    'Subject: concise, e.g. "Application for leave of absence from 12 September 2026 to 14 September 2026".',
    'Use exactly the salutation given in FACTS.recipient.salutation.',
    'Reply with JSON only: {"subject": string, "salutation": string, "paragraphs": [string], "closing": string, "signoff": string}.'
  ].join('\n');
}

function letterUserPrompt_(input) {
  var facts = {
    letterType: input.letterType === 'leave' ? 'request for upcoming leave' : 'application for absence already taken',
    tone: input.tone,
    student: {
      name: input.student.name,
      year: input.student.year,
      division: input.student.division,
      department: input.student.department,
      college: input.student.college
    },
    absence: {
      period: periodText_(input.absence),
      from: longDate_(input.absence.from),
      to: longDate_(input.absence.to),
      days: input.absence.days,
      category: REASON_CATEGORIES_[input.absence.reasonCategory],
      reasonInStudentsWords: input.absence.reason,
      documentsAttached: input.absence.documents
    },
    recipient: {
      name: input.recipient.name || null,
      designation: input.recipient.designation,
      salutation: 'Respected ' + input.recipient.salutation + ','
    }
  };
  return 'FACTS:\n' + JSON.stringify(facts, null, 2);
}

/**
 * One Mistral chat-completions call. useSchema=true sends a strict json_schema; false sends the
 * simpler json_object mode (works on every chat model). Never throws.
 */
function callMistral_(input, model, useSchema) {
  model = String(model || '').replace(/[^A-Za-z0-9._-]/g, '');
  var body = {
    model: model,
    temperature: 0.55,
    max_tokens: 900,
    messages: [
      { role: 'system', content: letterSystemPrompt_(input.tone) },
      { role: 'user', content: letterUserPrompt_(input) }
    ],
    response_format: useSchema
      ? { type: 'json_schema', json_schema: { name: 'student_letter', schema: LETTER_SCHEMA_, strict: true } }
      : { type: 'json_object' }
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
  var text = response.getContentText();
  if (status === 429) return { ok: false, rateLimited: true, reason: 'http_429' };
  if (status !== 200) {
    Logger.log('Mistral HTTP ' + status + ' (' + model + '): ' + String(text).slice(0, 300)); // server log only
    return { ok: false, reason: 'http_' + status };
  }
  var json = parseJson_(text, null);
  var choice = json && json.choices && json.choices[0];
  if (!choice || !choice.message) return { ok: false, reason: 'empty' };
  if (choice.finish_reason && choice.finish_reason !== 'stop') return { ok: false, reason: 'finish_' + choice.finish_reason };
  var out = choice.message.content;
  if (Array.isArray(out)) out = out.map(function (c) { return c.text || ''; }).join('');
  out = String(out || '').replace(/^```(?:json)?\s*|\s*```$/g, '');
  var data = parseJson_(out, null);
  if (!data) return { ok: false, reason: 'bad_json' };
  return { ok: true, data: data };
}

/** Normalises any letter content (AI output or student edits). Returns null if unusable. */
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

/** "Third Year (Div. B) in the Department of Computer Engineering" */
function studentIntro_(s) {
  var dept = s.department.replace(/^department of\s+/i, '');
  var cls = s.year ? s.year + (s.division ? ' (Div. ' + s.division.replace(/^div(ision)?\.?\s*/i, '') + ')' : '') + ' in ' : '';
  return 'I am a student of ' + cls + 'the Department of ' + dept;
}

/**
 * Deterministic letter in the chosen tone, built only from the student's facts. Used whenever
 * the AI is missing, rate-limited, slow, malformed or fails the fact check.
 */
function fallbackLetter_(input) {
  var a = input.absence, s = input.student;
  var period = periodText_(a);
  var leave = input.letterType === 'leave';
  var why = reasonClause_(a.reason);
  var intro = studentIntro_(s);
  var docs = a.documents ? 'I have attached the relevant supporting documents with this application for your reference.' : '';
  var T = {
    formal: {
      p1: intro + '. ' + (leave ? 'I would like to request leave ' + period + ' ' + why + '.' : 'I was unable to attend college ' + period + ' ' + why + '.'),
      p2: (leave ? 'I will make sure that I complete the lectures, practicals and assignments that I miss during this period with the help of my classmates and teachers. '
                 : 'I have started covering the lectures, practicals and assignments that I missed with the help of my classmates and teachers. ') +
          'I kindly request you to grant me leave for the above period' + (leave ? '.' : ' and consider my attendance accordingly.'),
      closing: 'Thanking you.', signoff: 'Yours obediently,'
    },
    warm: {
      p1: intro + '. ' + (leave ? 'I am writing to request leave ' + period + ' ' + why + '.' : 'I am writing to let you know that I could not attend college ' + period + ' ' + why + '.'),
      p2: 'I truly value the classes and I will stay in touch with my classmates so that I can catch up on the notes, practicals and assignments as soon as possible. ' +
          'I would be grateful if you could kindly grant me leave for these days' + (leave ? '.' : ' and consider my attendance for this period.'),
      closing: 'Thank you for your understanding.', signoff: 'Yours sincerely,'
    },
    simple: {
      p1: intro + '. ' + (leave ? 'I need leave ' + period + ' ' + why + '.' : 'I could not come to college ' + period + ' ' + why + '.'),
      p2: 'I will complete all the work I ' + (leave ? 'miss' : 'missed') + ' with the help of my friends and teachers. Please grant me leave for these days.',
      closing: 'Thank you.', signoff: 'Yours sincerely,'
    },
    sincere: {
      p1: intro + '. ' + (leave ? 'I am sorry to inform you that I will not be able to attend college ' + period + ' ' + why + '.' : 'I am sorry that I was not able to attend college ' + period + ' ' + why + '.'),
      p2: 'I understand that missing lectures and practicals affects my studies, and I apologise for the inconvenience. I will make up for the missed work at the earliest with the help of my classmates and teachers. ' +
          'I humbly request you to grant me leave for this period' + (leave ? '.' : ' and consider my attendance.'),
      closing: 'Thanking you.', signoff: 'Yours obediently,'
    },
    brief: {
      p1: intro + '. ' + (leave ? 'I request leave ' + period + ' ' + why + '.' : 'I was absent ' + period + ' ' + why + '.'),
      p2: 'I will cover the missed work. Kindly grant me leave for these days.',
      closing: 'Thanking you.', signoff: 'Yours obediently,'
    }
  };
  var t = T[input.tone] || T.formal;
  var paragraphs = [t.p1, t.p2];
  if (docs) paragraphs.push(docs);
  return {
    subject: (leave ? 'Application for leave ' : 'Application for leave of absence ') + period.replace(/ \(\d+ days\)$/, ''),
    salutation: 'Respected ' + input.recipient.salutation + ',',
    paragraphs: paragraphs,
    closing: t.closing,
    signoff: t.signoff
  };
}
