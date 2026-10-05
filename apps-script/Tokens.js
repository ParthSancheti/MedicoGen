/**
 * Medico Gen — access codes ("tokens"). The Tokens sheet is the only authority on how many
 * generations a code has left; the browser only ever displays what this returns.
 */

function normalizeCode_(value) {
  return String(value || '').toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '').slice(0, 24);
}

function newAccessCode_() {
  return 'MG-' + randomChars_(4) + '-' + randomChars_(4);
}

function newReferralCode_() {
  return 'R' + randomChars_(6);
}

function tokenView_(t) {
  var total = toInt_(t.attemptsTotal, 0);
  var used = toInt_(t.attemptsUsed, 0);
  var status = t.status;
  if (status === 'active' && isExpired_(t.expiresAt)) status = 'expired';
  return {
    code: t.code,
    total: total,
    used: used,
    remaining: Math.max(0, total - used),
    status: status,
    expiresAt: t.expiresAt || null,
    referralCode: t.referralCode
  };
}

/** Finds a code and rejects disabled/expired ones. Exhausted codes are still returned. */
function requireToken_(code) {
  code = normalizeCode_(code);
  if (!code) fail_('CODE_INVALID', 'Enter your access code.');
  var t = findOne_('Tokens', 'code', code);
  if (!t) fail_('CODE_INVALID', 'That code isn’t valid. Check it and try again.');
  if (t.status === 'disabled') fail_('CODE_DISABLED', 'This code has been disabled. Contact support on WhatsApp.');
  if (isExpired_(t.expiresAt)) fail_('CODE_EXPIRED', 'This code has expired.');
  return t;
}

/** Creates a token row. Reuses the referral code of an earlier token bought with the same phone. */
function createToken_(opts) {
  var code;
  do { code = opts.code || newAccessCode_(); } while (!opts.code && findOne_('Tokens', 'code', code));
  var referralCode = '';
  if (opts.phoneHash) {
    var earlier = findAll_('Tokens', 'phoneHash', opts.phoneHash).filter(function (t) { return t.referralCode; });
    if (earlier.length) referralCode = earlier[0].referralCode;
  }
  if (!referralCode) {
    do { referralCode = newReferralCode_(); } while (findOne_('Tokens', 'referralCode', referralCode));
  }
  return insert_('Tokens', {
    code: code,
    attemptsTotal: opts.attempts || cfgInt_('MAX_ATTEMPTS'),
    attemptsUsed: 0,
    status: 'active',
    expiresAt: opts.expiresAt || '',
    createdAt: nowIso_(),
    source: opts.source || 'admin',
    requestId: opts.requestId || '',
    phoneHash: opts.phoneHash || '',
    referralCode: referralCode,
    note: opts.note || ''
  });
}

/* ---------- public actions ---------- */

function apiValidateCode_(p) {
  var t = requireToken_(p.code);
  logEvent_('access.validate', t.code, p.sessionId || '');
  return { token: tokenView_(t), config: publicConfig_() };
}
