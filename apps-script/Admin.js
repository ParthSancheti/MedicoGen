/**
 * Medico Gen — admin operations. Every admin action requires a session token issued by
 * apiAdminLogin_ after the password is checked against the ADMIN_PASSWORD script property.
 * Sessions live in CacheService (max 6 h) and never in the frontend code.
 */

function apiAdminLogin_(p) {
  var cache = CacheService.getScriptCache();
  var failures = toInt_(cache.get('admin_failures'), 0);
  if (failures >= 8) fail_('RATE_LIMIT', 'Too many attempts. Try again in 10 minutes.');
  var expected = secret_('ADMIN_PASSWORD');
  if (!p.password || !safeEqual_(sha256Hex_(p.password), sha256Hex_(expected))) {
    cache.put('admin_failures', String(failures + 1), 600);
    logEvent_('admin.login_failed', '', '');
    fail_('UNAUTHORIZED', 'Incorrect password.');
  }
  cache.remove('admin_failures');
  var token = Utilities.getUuid() + Utilities.getUuid();
  var ttl = Math.min(6, cfgInt_('ADMIN_SESSION_HOURS')) * 3600;
  cache.put('admin:' + sha256Hex_(token), '1', ttl);
  logEvent_('admin.login', '', '');
  return { adminToken: token, expiresInSec: ttl };
}

function requireAdmin_(p) {
  if (!p.adminToken || !CacheService.getScriptCache().get('admin:' + sha256Hex_(p.adminToken))) {
    fail_('UNAUTHORIZED', 'Your admin session has expired. Sign in again.');
  }
}

function apiAdminStats_() {
  var tokens = rows_('Tokens');
  var gens = rows_('Generations');
  var requests = rows_('Requests');
  var refs = rows_('Referrals');
  var rewards = rows_('Rewards');
  var today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
  return {
    codesActive: tokens.filter(function (t) { return tokenView_(t).status === 'active' && tokenView_(t).remaining > 0; }).length,
    codesTotal: tokens.length,
    generationsUsed: tokens.reduce(function (n, t) { return n + toInt_(t.attemptsUsed, 0); }, 0),
    generationsToday: gens.filter(function (g) { return new Date(new Date(g.createdAt).getTime() + 5.5 * 3600000).toISOString().slice(0, 10) === today; }).length,
    aiGenerations: gens.filter(function (g) { return g.source === 'gemini'; }).length,
    fallbackGenerations: gens.filter(function (g) { return g.source === 'fallback'; }).length,
    requestsPending: requests.filter(function (r) { return r.status === 'pending'; }).length,
    requestsApproved: requests.filter(function (r) { return r.status === 'approved'; }).length,
    referralsVerified: refs.filter(function (r) { return r.status === 'verified'; }).length,
    referralsPending: refs.filter(function (r) { return r.status === 'pending'; }).length,
    rewardsUnpaid: rewards.filter(function (r) { return r.status === 'earned'; }).length,
    aiConfigured: !!secret_('GEMINI_API_KEY', true),
    mock: isMock_()
  };
}

function apiAdminRequests_(p) {
  var status = String(p.status || '');
  var list = rows_('Requests')
    .filter(function (r) { return !status || r.status === status; })
    .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; })
    .slice(0, 200)
    .map(function (r) { return requestView_(r, true); });
  return { items: list };
}

function apiAdminProof_(p) {
  var r = findOne_('Requests', 'requestId', String(p.requestId || ''));
  if (!r) fail_('NOT_FOUND', 'Request not found.');
  return { dataUrl: proofDataUrl_(r.proofFileId) };
}

function apiAdminApprove_(p) {
  var attempts = Math.max(1, Math.min(50, toInt_(p.attempts, cfgInt_('MAX_ATTEMPTS'))));
  var out = withLock_(function () {
    var r = findOne_('Requests', 'requestId', String(p.requestId || ''));
    if (!r) fail_('NOT_FOUND', 'Request not found.');
    if (r.status === 'approved') return { request: r, token: findOne_('Tokens', 'code', r.issuedCode), referral: '', again: true };
    if (r.status !== 'pending') fail_('VALIDATION', 'Only pending requests can be approved.');
    var t = createToken_({ attempts: attempts, source: 'request', requestId: r.requestId, phoneHash: r.phoneHash, expiresAt: p.expiresAt || '' });
    update_('Requests', r, { status: 'approved', issuedCode: t.code, decidedAt: nowIso_(), note: cleanText_(p.note, 200) });
    var referral = settleReferralOnApproval_(r);
    return { request: r, token: t, referral: referral };
  });
  var t = out.token;
  var delivery = deliverWhatsApp_(out.request.phone, approvalMessage_(t.code, toInt_(t.attemptsTotal, attempts)), [t.code, t.attemptsTotal]);
  logEvent_('admin.approve', out.request.requestId, t.code + (out.referral ? ' ' + out.referral : ''));
  return { request: requestView_(out.request, true), token: tokenView_(t), referral: out.referral, delivery: delivery };
}

function apiAdminReject_(p) {
  var reason = cleanText_(p.reason, 200);
  var r = withLock_(function () {
    var r = findOne_('Requests', 'requestId', String(p.requestId || ''));
    if (!r) fail_('NOT_FOUND', 'Request not found.');
    if (r.status !== 'pending') fail_('VALIDATION', 'Only pending requests can be rejected.');
    update_('Requests', r, { status: 'rejected', note: reason, decidedAt: nowIso_() });
    settleReferralOnRejection_(r);
    return r;
  });
  var delivery = deliverWhatsApp_(r.phone, rejectionMessage_(r.requestId, reason), [r.requestId]);
  logEvent_('admin.reject', r.requestId, reason);
  return { request: requestView_(r, true), delivery: delivery };
}

function apiAdminWhatsAppLink_(p) {
  var r = findOne_('Requests', 'requestId', String(p.requestId || ''));
  if (!r) fail_('NOT_FOUND', 'Request not found.');
  var text = r.status === 'approved'
    ? approvalMessage_(r.issuedCode, tokenView_(findOne_('Tokens', 'code', r.issuedCode)).total)
    : rejectionMessage_(r.requestId, r.note);
  return { link: waLink_(r.phone, text) };
}

function apiAdminTokens_() {
  var gens = rows_('Generations');
  var items = rows_('Tokens')
    .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; })
    .slice(0, 500)
    .map(function (t) {
      var v = tokenView_(t);
      v.createdAt = t.createdAt;
      v.source = t.source;
      v.note = t.note;
      v.lastUsedAt = t.lastUsedAt || null;
      v.documents = gens.filter(function (g) { return g.code === t.code; }).length;
      return v;
    });
  return { items: items };
}

function apiAdminCreateTokens_(p) {
  var count = Math.max(1, Math.min(50, toInt_(p.count, 1)));
  var attempts = Math.max(1, Math.min(50, toInt_(p.attempts, cfgInt_('MAX_ATTEMPTS'))));
  var expiresAt = p.expiresAt ? String(p.expiresAt).slice(0, 10) : '';
  if (expiresAt && !isIsoDate_(expiresAt)) fail_('VALIDATION', 'Invalid expiry date.');
  var note = cleanText_(p.note, 120);
  var created = withLock_(function () {
    var list = [];
    for (var i = 0; i < count; i++) list.push(tokenView_(createToken_({ attempts: attempts, expiresAt: expiresAt, note: note, source: 'admin' })));
    return list;
  });
  logEvent_('admin.tokens.create', '', count + ' x ' + attempts);
  return { items: created };
}

function apiAdminUpdateToken_(p) {
  var code = normalizeCode_(p.code);
  return withLock_(function () {
    var t = findOne_('Tokens', 'code', code);
    if (!t) fail_('NOT_FOUND', 'Code not found.');
    var patch = {};
    switch (p.op) {
      case 'disable': patch.status = 'disabled'; break;
      case 'enable': patch.status = 'active'; break;
      case 'reset': patch.attemptsUsed = 0; break;
      case 'setAttempts':
        patch.attemptsTotal = Math.max(0, Math.min(500, toInt_(p.value, toInt_(t.attemptsTotal, 0))));
        break;
      case 'setExpiry':
        if (p.value && !isIsoDate_(p.value)) fail_('VALIDATION', 'Invalid expiry date.');
        patch.expiresAt = p.value || '';
        break;
      default: fail_('VALIDATION', 'Unknown operation.');
    }
    update_('Tokens', t, patch);
    logEvent_('admin.token.' + p.op, code, p.value || '');
    return { token: tokenView_(t) };
  });
}

function apiAdminReferrals_() {
  var byCode = {};
  rows_('Referrals').forEach(function (r) { byCode[r.referralCode] = true; });
  rows_('Rewards').forEach(function (r) { byCode[r.referralCode] = true; });
  var items = Object.keys(byCode).map(function (code) {
    var s = referralSummary_(code);
    var owner = findOne_('Tokens', 'referralCode', code);
    s.ownerCode = owner ? owner.code : null;
    var req = owner && owner.requestId ? findOne_('Requests', 'requestId', owner.requestId) : null;
    s.ownerPhone = req ? req.phone : null;
    return s;
  }).sort(function (a, b) { return b.verified - a.verified; });
  return { items: items };
}

function apiAdminMarkRewardPaid_(p) {
  return withLock_(function () {
    var w = findOne_('Rewards', 'rewardId', String(p.rewardId || ''));
    if (!w) fail_('NOT_FOUND', 'Reward not found.');
    update_('Rewards', w, { status: 'paid', paidAt: nowIso_() });
    return { ok: true };
  });
}
