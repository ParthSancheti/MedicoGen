/**
 * Medico Gen — Refer & Earn.
 *
 * A referral only counts when a NEW person submits a paid access request with the referral code
 * and an admin verifies that payment. Button presses, link opens and repeat purchases never count.
 * Rules:
 *   - the referred phone must differ from the referrer's own phone (no self-referral)
 *   - a phone can be counted as a referral only once, ever, across all referrers
 *   - every REFERRAL_TARGET verified referrals earns one reward of REFERRAL_REWARD_INR
 */

function recordPendingReferral_(referralCode, requestId, phoneHash) {
  insert_('Referrals', {
    referralId: 'RF-' + randomChars_(8),
    referralCode: referralCode,
    requestId: requestId,
    phoneHash: phoneHash,
    status: 'pending',
    createdAt: nowIso_(),
    decidedAt: ''
  });
}

/** Called inside the approval lock. Returns 'verified' | 'rejected:<why>' | ''. */
function settleReferralOnApproval_(request) {
  var ref = findAll_('Referrals', 'requestId', request.requestId)[0];
  if (!ref || ref.status !== 'pending') return '';
  var referrerTokens = findAll_('Tokens', 'referralCode', ref.referralCode);
  var selfReferral = referrerTokens.some(function (t) { return t.phoneHash && t.phoneHash === ref.phoneHash; });
  var alreadyCounted = findAll_('Referrals', 'phoneHash', ref.phoneHash).some(function (x) { return x.status === 'verified'; });
  var why = selfReferral ? 'self' : alreadyCounted ? 'repeat_phone' : '';
  update_('Referrals', ref, { status: why ? 'rejected' : 'verified', decidedAt: nowIso_() });
  if (why) return 'rejected:' + why;
  maybeGrantReward_(ref.referralCode);
  return 'verified';
}

function settleReferralOnRejection_(request) {
  findAll_('Referrals', 'requestId', request.requestId).forEach(function (ref) {
    if (ref.status === 'pending') update_('Referrals', ref, { status: 'rejected', decidedAt: nowIso_() });
  });
}

function maybeGrantReward_(referralCode) {
  var target = cfgInt_('REFERRAL_TARGET');
  var verified = findAll_('Referrals', 'referralCode', referralCode).filter(function (r) { return r.status === 'verified'; }).length;
  var rewards = findAll_('Rewards', 'referralCode', referralCode).length;
  if (Math.floor(verified / target) > rewards) {
    insert_('Rewards', {
      rewardId: 'RW-' + randomChars_(6),
      referralCode: referralCode,
      amountInr: cfgInt_('REFERRAL_REWARD_INR'),
      status: 'earned',
      createdAt: nowIso_(),
      paidAt: ''
    });
    logEvent_('referral.reward', referralCode, '');
  }
}

function referralSummary_(referralCode) {
  var target = cfgInt_('REFERRAL_TARGET');
  var refs = findAll_('Referrals', 'referralCode', referralCode);
  var verified = refs.filter(function (r) { return r.status === 'verified'; }).length;
  var pending = refs.filter(function (r) { return r.status === 'pending'; }).length;
  var rewards = findAll_('Rewards', 'referralCode', referralCode).map(function (w) {
    return { id: w.rewardId, amountInr: toInt_(w.amountInr, 0), status: w.status, createdAt: w.createdAt, paidAt: w.paidAt || null };
  });
  return {
    referralCode: referralCode,
    target: target,
    rewardInr: cfgInt_('REFERRAL_REWARD_INR'),
    verified: verified,
    pending: pending,
    progress: verified % target,
    rewards: rewards
  };
}

/* ---------- public actions ---------- */

function apiReferral_(p) {
  var t = requireToken_(p.code);
  return { referral: referralSummary_(t.referralCode), appUrl: cfg_('APP_URL') };
}
