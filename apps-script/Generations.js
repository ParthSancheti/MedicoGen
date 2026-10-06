/**
 * Medico Gen — generation accounting and document history.
 *
 * A generation is reserved under the script lock (attempt counted + row written) BEFORE any slow
 * work such as the Mistral call, then completed outside the lock. The client-supplied
 * generationId is an idempotency key: retries, double taps and network replays with the same id
 * return the original generation instead of consuming another attempt.
 */

var DEMO_TEMPLATE_IDS_ = ['demo-fitness', 'demo-leave', 'demo-opd'];
// A letter's look is stored as "paper|writing" in the style column (e.g. "classmate|handlee").
var PAPER_IDS_ = ['classmate', 'school', 'college', 'wide', 'register', 'black_margin', 'exam', 'legal', 'kraft', 'graph', 'dots', 'cream', 'plain'];
var WRITING_IDS_ = ['neat', 'flowing', 'ballpoint', 'steady', 'quick', 'slanted', 'cursive', 'handlee', 'kalam', 'patrick', 'caveat', 'mynerve', 'covered', 'architects', 'shadows', 'gochi', 'schoolbell', 'indie',
  'dawning', 'cedarville', 'nothing', 'homemade', 'academic', 'modern', 'classic'];
/** Precision settings: group → key → [min, max]. Mirrors SETTINGS_SPEC in js/doc/styles.js. */
var SETTINGS_RANGES_ = {
  font: { size: [0.7, 1.4], height: [0.8, 1.5], width: [0.8, 1.3], letterSpacing: [-0.4, 0.8], wordSpacing: [0.6, 2], slant: [-12, 20], weight: [0, 0.3] },
  human: { glyph: [0, 2], word: [0, 2], line: [0, 2], slantVar: [0, 2], pressure: [0, 2], margin: [0, 2], retrace: [0, 3], errors: [0, 6], seed: [0, 999] },
  page: { lineGap: [5.5, 11], first: [20, 60], marginLeft: [10, 50], marginRight: [8, 40], indent: [0, 25], blockGap: [0, 3], sigGap: [1, 4] }
};

function cleanSettings_(raw) {
  var out = { font: {}, human: {}, page: {} };
  if (!raw || typeof raw !== 'object') return out;
  Object.keys(SETTINGS_RANGES_).forEach(function (g) {
    var src = raw[g] || {};
    Object.keys(SETTINGS_RANGES_[g]).forEach(function (k) {
      var v = Number(src[k]);
      if (src[k] === null || src[k] === undefined || src[k] === '' || isNaN(v)) return;
      out[g][k] = Math.min(SETTINGS_RANGES_[g][k][1], Math.max(SETTINGS_RANGES_[g][k][0], v));
    });
  });
  if (raw.font && /^#[0-9a-f]{6}$/i.test(String(raw.font.ink || ''))) out.font.ink = String(raw.font.ink).toLowerCase();
  if (raw.page && (raw.page.align === 'left' || raw.page.align === 'justify')) out.page.align = raw.page.align;
  if (raw.human && ['neat', 'natural', 'rushed'].indexOf(raw.human.preset) >= 0) out.human.preset = raw.human.preset;
  return out;
}

var LEGACY_STYLES_ = { notebook: 'classmate|steady', academic: 'plain|academic', modern: 'plain|modern', classic: 'cream|classic' };

function cleanGenerationId_(value) {
  var id = String(value || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
  if (id.length < 12) fail_('VALIDATION', 'Missing request id.');
  return id;
}

function generationView_(g) {
  return {
    id: g.generationId,
    kind: g.kind,
    style: g.style,
    paper: g.kind === 'letter' ? splitLook_(g.style).paper : undefined,
    writing: g.kind === 'letter' ? splitLook_(g.style).writing : undefined,
    title: g.title,
    status: g.status,
    source: g.source,
    input: parseJson_(g.inputJson, {}),
    content: parseJson_(g.contentJson, null),
    settings: parseJson_(g.settingsJson, null),
    createdAt: g.createdAt,
    updatedAt: g.updatedAt
  };
}

/**
 * Reserves one attempt. Returns { gen, existing } where existing=true means the id was seen before
 * and nothing was consumed.
 */
function reserveGeneration_(p, kind, style, title, input, settings) {
  var generationId = cleanGenerationId_(p.generationId);
  return withLock_(function () {
    var prior = findOne_('Generations', 'generationId', generationId);
    var t = requireToken_(p.code);
    if (prior) {
      if (prior.code !== t.code) fail_('VALIDATION', 'Request id already used.');
      return { gen: prior, token: t, existing: true };
    }
    var view = tokenView_(t);
    if (view.remaining <= 0) fail_('NO_ATTEMPTS', 'This code has no generations left.');
    update_('Tokens', t, { attemptsUsed: view.used + 1, lastUsedAt: nowIso_() });
    var gen = insert_('Generations', {
      generationId: generationId,
      code: t.code,
      sessionId: cleanText_(p.sessionId, 64),
      kind: kind,
      style: style,
      title: title,
      status: 'pending',
      source: '',
      inputJson: JSON.stringify(input),
      contentJson: '',
      settingsJson: settings ? JSON.stringify(settings) : '',
      createdAt: nowIso_(),
      updatedAt: nowIso_()
    });
    return { gen: gen, token: t, existing: false };
  });
}

function completeGeneration_(gen, content, source) {
  return withLock_(function () {
    var fresh = findOne_('Generations', 'generationId', gen.generationId) || gen;
    return update_('Generations', fresh, {
      status: 'ready',
      source: source,
      contentJson: JSON.stringify(content),
      updatedAt: nowIso_()
    });
  });
}

function splitLook_(style) {
  var v = LEGACY_STYLES_[style] || String(style || '');
  var parts = v.split('|');
  return {
    paper: PAPER_IDS_.indexOf(parts[0]) >= 0 ? parts[0] : 'classmate',
    writing: WRITING_IDS_.indexOf(parts[1]) >= 0 ? parts[1] : 'neat'
  };
}

/** Builds the stored "paper|writing" from request params, keeping current values for anything not sent. */
function cleanStyle_(p, current) {
  var base = splitLook_(p.style || current);
  var paper = PAPER_IDS_.indexOf(p.paper) >= 0 ? p.paper : base.paper;
  var writing = WRITING_IDS_.indexOf(p.writing) >= 0 ? p.writing : base.writing;
  return paper + '|' + writing;
}

/* ---------- public actions ---------- */

function apiGenerateLetter_(p) {
  var input = normalizeLetterInput_(p.input || {});
  var style = cleanStyle_(p, '');
  var title = letterTitle_(input);
  var reserved = reserveGeneration_(p, 'letter', style, title, input, p.settings ? cleanSettings_(p.settings) : null);
  var gen = reserved.gen;

  if (reserved.existing) {
    // Replay of an earlier request: never consumes or regenerates.
    return { generation: generationView_(gen), token: tokenView_(findOne_('Tokens', 'code', gen.code)), replay: true };
  }

  var result = composeLetter_(input);          // Mistral, or deterministic fallback; never throws
  gen = completeGeneration_(gen, result.content, result.source);
  logEvent_('generate.letter', gen.code, result.source + (result.reason ? ':' + result.reason : ''));
  return {
    generation: generationView_(gen),
    token: tokenView_(findOne_('Tokens', 'code', gen.code)),
    notice: result.notice || null
  };
}

function apiCreateDemo_(p) {
  var templateId = String(p.templateId || '');
  if (DEMO_TEMPLATE_IDS_.indexOf(templateId) < 0) fail_('VALIDATION', 'Unknown template.');
  var fields = {};
  var raw = p.fields || {};
  Object.keys(raw).slice(0, 20).forEach(function (k) {
    var key = String(k).replace(/[^A-Za-z0-9_]/g, '').slice(0, 32);
    if (key) fields[key] = cleanText_(raw[k], 400, true);
  });
  var title = (fields.name ? fields.name + ' · ' : '') + 'Demo template';
  var reserved = reserveGeneration_(p, 'demo', templateId, title, { templateId: templateId });
  var gen = reserved.gen;
  if (!reserved.existing) {
    gen = completeGeneration_(gen, { templateId: templateId, fields: fields, demonstration: true }, 'template');
    logEvent_('generate.demo', gen.code, templateId);
  }
  return { generation: generationView_(gen), token: tokenView_(findOne_('Tokens', 'code', gen.code)), replay: reserved.existing };
}

function apiGetGeneration_(p) {
  var t = requireToken_(p.code);
  var gen = findOne_('Generations', 'generationId', cleanGenerationId_(p.generationId));
  if (!gen || gen.code !== t.code) fail_('NOT_FOUND', 'Document not found.');
  return { generation: generationView_(gen), token: tokenView_(t) };
}

/** Saves student edits (wording, their own details) and style changes. Free: no attempt is consumed and the AI is not called. */
function apiSaveDocument_(p) {
  var t = requireToken_(p.code);
  return withLock_(function () {
    var gen = findOne_('Generations', 'generationId', cleanGenerationId_(p.generationId));
    if (!gen || gen.code !== t.code) fail_('NOT_FOUND', 'Document not found.');
    if (gen.status !== 'ready') fail_('VALIDATION', 'Document is still being generated.');
    var patch = { updatedAt: nowIso_() };
    if ((p.style || p.paper || p.writing) && gen.kind === 'letter') patch.style = cleanStyle_(p, gen.style);
    if (p.content && gen.kind === 'letter') patch.contentJson = JSON.stringify(sanitizeLetterContent_(p.content, true));
    if (p.input && gen.kind === 'letter') patch.inputJson = JSON.stringify(normalizeLetterInput_(p.input));
    if (p.settings && gen.kind === 'letter') patch.settingsJson = JSON.stringify(cleanSettings_(p.settings));
    if (p.content && gen.kind === 'demo') {
      var prev = parseJson_(gen.contentJson, {});
      var fields = {};
      Object.keys(p.content.fields || {}).slice(0, 20).forEach(function (k) {
        var key = String(k).replace(/[^A-Za-z0-9_]/g, '').slice(0, 32);
        if (key) fields[key] = cleanText_(p.content.fields[k], 400, true);
      });
      patch.contentJson = JSON.stringify({ templateId: prev.templateId, fields: fields, demonstration: true });
    }
    update_('Generations', gen, patch);
    return { generation: generationView_(gen) };
  });
}

function apiHistory_(p) {
  var t = requireToken_(p.code);
  var list = findAll_('Generations', 'code', t.code)
    .filter(function (g) { return g.status === 'ready'; })
    .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; })
    .slice(0, 50)
    .map(generationView_);
  return { items: list, token: tokenView_(t) };
}
