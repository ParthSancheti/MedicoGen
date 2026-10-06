/**
 * Medico Gen — the single API entry point.
 *
 * Contract: POST (Content-Type text/plain to avoid a CORS preflight) with a JSON body
 *   { "action": "<name>", ...params }
 * Response: { "ok": true, "data": {...} }  or  { "ok": false, "error": { "code", "message" } }
 */

var ROUTES_ = {
  'config.get':           { fn: function () { return { config: publicConfig_() }; } },
  'access.validate':      { fn: apiValidateCode_ },
  'access.request':       { fn: apiSubmitRequest_ },
  'access.requestStatus': { fn: apiRequestStatus_ },
  'letter.generate':      { fn: apiGenerateLetter_ },
  'prescription.read':    { fn: apiReadPrescription_ },
  'demo.create':          { fn: apiCreateDemo_ },
  'generation.get':       { fn: apiGetGeneration_ },
  'document.save':        { fn: apiSaveDocument_ },
  'history.list':         { fn: apiHistory_ },
  'referral.get':         { fn: apiReferral_ },
  'admin.login':          { fn: apiAdminLogin_ },
  'admin.stats':          { fn: apiAdminStats_, admin: true },
  'admin.requests':       { fn: apiAdminRequests_, admin: true },
  'admin.proof':          { fn: apiAdminProof_, admin: true },
  'admin.approve':        { fn: apiAdminApprove_, admin: true },
  'admin.reject':         { fn: apiAdminReject_, admin: true },
  'admin.whatsappLink':   { fn: apiAdminWhatsAppLink_, admin: true },
  'admin.tokens':         { fn: apiAdminTokens_, admin: true },
  'admin.tokens.create':  { fn: apiAdminCreateTokens_, admin: true },
  'admin.tokens.update':  { fn: apiAdminUpdateToken_, admin: true },
  'admin.referrals':      { fn: apiAdminReferrals_, admin: true },
  'admin.rewards.paid':   { fn: apiAdminMarkRewardPaid_, admin: true }
};

/** Pure dispatcher: object in, object out. Used by doPost and by the local mock runtime. */
function handle_(payload) {
  try {
    if (!payload || typeof payload !== 'object') fail_('BAD_REQUEST', 'Malformed request.');
    var route = ROUTES_[payload.action];
    if (!route) fail_('BAD_REQUEST', 'Unknown action.');
    if (route.admin) requireAdmin_(payload);
    return { ok: true, data: route.fn(payload) };
  } catch (err) {
    if (err && err.appCode) return { ok: false, error: { code: err.appCode, message: err.message } };
    Logger.log('Unhandled: ' + (err && err.stack || err));
    return { ok: false, error: { code: 'SERVER_ERROR', message: 'Something went wrong on our side. Please try again.' } };
  }
}

function doPost(e) {
  var payload = parseJson_(e && e.postData && e.postData.contents, null);
  return ContentService.createTextOutput(JSON.stringify(handle_(payload))).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, data: { service: cfg_('APP_NAME'), status: 'up' } }))
    .setMimeType(ContentService.MimeType.JSON);
}
