/**
 * Medico Gen — shared helpers.
 * All backend files share one global scope (Apps Script V8), so helper names end in "_"
 * to keep them out of the Apps Script "Run" menu and avoid collisions.
 */

/** Throws an error the router turns into a clean { ok:false, error:{ code, message } }. */
function fail_(code, message) {
  var err = new Error(message || code);
  err.appCode = code;
  throw err;
}

function nowIso_() {
  return new Date().toISOString();
}

/** Random id from a UUID (crypto-quality in Apps Script). Alphabet avoids look-alike characters. */
var ID_ALPHABET_ = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomChars_(length) {
  var out = '';
  while (out.length < length) {
    var hex = Utilities.getUuid().replace(/-/g, '');
    for (var i = 0; i + 2 <= hex.length && out.length < length; i += 2) {
      var byte = parseInt(hex.substr(i, 2), 16);
      if (byte >= 224) continue; // 224 = 7 * 32, keeps the distribution uniform
      out += ID_ALPHABET_.charAt(byte % 32);
    }
  }
  return out;
}

function sha256Hex_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

/** Constant-time-ish comparison for secrets. */
function safeEqual_(a, b) {
  a = String(a); b = String(b);
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Trims, collapses whitespace and limits length. Never returns undefined. */
function cleanText_(value, maxLength, multiline) {
  if (value === null || value === undefined) return '';
  var s = String(value).replace(/\u0000/g, '');
  s = multiline ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  s = s.trim();
  if (maxLength && s.length > maxLength) s = s.slice(0, maxLength).trim();
  return s;
}

function requireText_(value, maxLength, field) {
  var s = cleanText_(value, maxLength);
  if (!s) fail_('VALIDATION', 'Please fill in ' + field + '.');
  return s;
}

/** Indian mobile numbers: returns 10 digits or fails. */
function normalizePhone_(value) {
  var digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.indexOf('91') === 0) digits = digits.slice(2);
  if (digits.length === 11 && digits.charAt(0) === '0') digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) fail_('VALIDATION', 'Enter a valid 10-digit mobile number.');
  return digits;
}

function phoneHash_(phone10) {
  return sha256Hex_('mg-phone:' + phone10).slice(0, 32);
}

function isIsoDate_(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(new Date(s + 'T00:00:00Z').getTime());
}

/** Inclusive day count between two YYYY-MM-DD dates. */
function daysInclusive_(from, to) {
  var a = new Date(from + 'T00:00:00Z').getTime();
  var b = new Date(to + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000) + 1;
}

var MONTHS_ = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function longDate_(iso) {
  var p = iso.split('-');
  return Number(p[2]) + ' ' + MONTHS_[Number(p[1]) - 1] + ' ' + p[0];
}

/** End-of-day expiry in India Standard Time. */
function isExpired_(expiresAt) {
  if (!expiresAt) return false;
  var end = new Date(String(expiresAt).slice(0, 10) + 'T23:59:59+05:30').getTime();
  return !isNaN(end) && Date.now() > end;
}

function parseJson_(text, fallback) {
  try { return JSON.parse(text); } catch (e) { return fallback; }
}

function toInt_(value, fallback) {
  var n = parseInt(value, 10);
  return isNaN(n) ? fallback : n;
}
