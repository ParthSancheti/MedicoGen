/**
 * Medico Gen — paid access requests.
 * Student: phone + payment reference + screenshot → request id. Admin verifies and approves,
 * which issues an access code and prepares the WhatsApp delivery.
 */

var PROOF_MIME_ = ['image/jpeg', 'image/png', 'image/webp'];

function requestView_(r, withPhone) {
  return {
    requestId: r.requestId,
    phone: withPhone ? r.phone : maskPhone_(r.phone),
    paymentRef: r.paymentRef,
    referralCode: r.referralCode || null,
    status: r.status,
    issuedCode: withPhone ? (r.issuedCode || null) : undefined,
    note: r.note || '',
    hasProof: !!r.proofFileId,
    createdAt: r.createdAt,
    decidedAt: r.decidedAt || null
  };
}

function maskPhone_(p) {
  p = String(p || '');
  return p.length === 10 ? p.slice(0, 2) + '•••••' + p.slice(7) : p;
}

function apiSubmitRequest_(p) {
  var phone = normalizePhone_(p.phone);
  var hash = phoneHash_(phone);
  var paymentRef = String(p.paymentRef || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (paymentRef.length < 6 || paymentRef.length > 30) fail_('VALIDATION', 'Enter the UPI reference / UTR number from your payment (6–30 characters).');
  var proof = p.proof || {};
  if (PROOF_MIME_.indexOf(proof.mime) < 0 || !proof.base64) fail_('VALIDATION', 'Attach a screenshot of your payment.');
  if (String(proof.base64).length > 4 * 1024 * 1024) fail_('VALIDATION', 'That screenshot is too large. Please attach a smaller image.');
  var referralCode = normalizeCode_(p.referralCode);

  return withLock_(function () {
    // Same payment reference twice → return the original request instead of duplicating it.
    var same = findAll_('Requests', 'paymentRef', paymentRef).filter(function (r) { return r.status !== 'rejected'; });
    if (same.length) {
      if (same[0].phoneHash !== hash) fail_('DUPLICATE', 'This payment reference has already been submitted.');
      return { request: requestView_(same[0], false), duplicate: true };
    }
    var pending = findAll_('Requests', 'phoneHash', hash).filter(function (r) { return r.status === 'pending'; });
    if (pending.length >= 3) fail_('RATE_LIMIT', 'You already have requests waiting for verification. We’ll reply on WhatsApp soon.');

    var requestId;
    do { requestId = 'REQ-' + randomChars_(6); } while (findOne_('Requests', 'requestId', requestId));
    var fileId = saveProof_(requestId, proof.mime, proof.base64);

    var referrer = referralCode ? findOne_('Tokens', 'referralCode', referralCode) : null;
    var r = insert_('Requests', {
      requestId: requestId,
      phone: phone,
      phoneHash: hash,
      paymentRef: paymentRef,
      proofFileId: fileId,
      referralCode: referrer ? referralCode : '',
      status: 'pending',
      issuedCode: '',
      note: '',
      createdAt: nowIso_(),
      decidedAt: ''
    });
    if (referrer) recordPendingReferral_(referralCode, requestId, hash);
    logEvent_('request.submit', requestId, referrer ? 'ref:' + referralCode : '');
    return { request: requestView_(r, false), duplicate: false };
  });
}

function apiRequestStatus_(p) {
  var id = String(p.requestId || '').toUpperCase().trim();
  var r = findOne_('Requests', 'requestId', id);
  var phone = normalizePhone_(p.phone);
  if (!r || r.phone !== phone) fail_('NOT_FOUND', 'No request found for that id and phone number.');
  return { request: requestView_(r, false) };
}
