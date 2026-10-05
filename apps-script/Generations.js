/**
 * Medico Gen — generation accounting and document history.
 *
 * A generation is reserved under the script lock (attempt counted + row written) BEFORE any slow
 * work such as the Gemini call, then completed outside the lock. The client-supplied
 * generationId is an idempotency key: retries, double taps and network replays with the same id
 * return the original generation instead of consuming another attempt.
 */

var DEMO_TEMPLATE_IDS_ = ['demo-fitness', 'demo-leave', 'demo-opd'];
var STYLE_IDS_ = ['notebook', 'academic', 'modern', 'classic'];

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
    title: g.title,
    status: g.status,
    source: g.source,
    input: parseJson_(g.inputJson, {}),
    content: parseJson_(g.contentJson, null),
    createdAt: g.createdAt,
    updatedAt: g.updatedAt
  };
}

/**
 * Reserves one attempt. Returns { gen, existing } where existing=true means the id was seen before
 * and nothing was consumed.
 */
function reserveGeneration_(p, kind, style, title, input) {
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

function cleanStyle_(style) {
  return STYLE_IDS_.indexOf(style) >= 0 ? style : 'notebook';
}

/* ---------- public actions ---------- */

function apiGenerateLetter_(p) {
  var input = normalizeLetterInput_(p.input || {});
  var style = cleanStyle_(p.style);
  var title = letterTitle_(input);
  var reserved = reserveGeneration_(p, 'letter', style, title, input);
  var gen = reserved.gen;

  if (reserved.existing) {
    // Replay of an earlier request: never consumes or regenerates.
    return { generation: generationView_(gen), token: tokenView_(findOne_('Tokens', 'code', gen.code)), replay: true };
  }

  var result = composeLetter_(input);          // Gemini, or deterministic fallback; never throws
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

/** Saves student edits (wording, their own details) and style changes. Free: no attempt is consumed and Gemini is not called. */
function apiSaveDocument_(p) {
  var t = requireToken_(p.code);
  return withLock_(function () {
    var gen = findOne_('Generations', 'generationId', cleanGenerationId_(p.generationId));
    if (!gen || gen.code !== t.code) fail_('NOT_FOUND', 'Document not found.');
    if (gen.status !== 'ready') fail_('VALIDATION', 'Document is still being generated.');
    var patch = { updatedAt: nowIso_() };
    if (p.style && gen.kind === 'letter') patch.style = cleanStyle_(p.style);
    if (p.content && gen.kind === 'letter') patch.contentJson = JSON.stringify(sanitizeLetterContent_(p.content, true));
    if (p.input && gen.kind === 'letter') patch.inputJson = JSON.stringify(normalizeLetterInput_(p.input));
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
