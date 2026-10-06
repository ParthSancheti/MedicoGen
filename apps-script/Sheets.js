/**
 * Medico Gen — Google Sheets as a small operational database.
 * The rest of the backend only uses these helpers; nothing else knows about rows or columns.
 * Every sheet is formatted as plain text so codes, phone numbers and dates are never coerced.
 */
var SCHEMA_ = {
  Tokens: ['code', 'attemptsTotal', 'attemptsUsed', 'status', 'expiresAt', 'createdAt', 'source', 'requestId', 'phoneHash', 'referralCode', 'note', 'lastUsedAt'],
  Generations: ['generationId', 'code', 'sessionId', 'kind', 'style', 'title', 'status', 'source', 'inputJson', 'contentJson', 'createdAt', 'updatedAt', 'settingsJson'],
  Requests: ['requestId', 'phone', 'phoneHash', 'paymentRef', 'proofFileId', 'referralCode', 'status', 'issuedCode', 'note', 'createdAt', 'decidedAt'],
  Referrals: ['referralId', 'referralCode', 'requestId', 'phoneHash', 'status', 'createdAt', 'decidedAt'],
  Rewards: ['rewardId', 'referralCode', 'amountInr', 'status', 'createdAt', 'paidAt'],
  Events: ['at', 'type', 'ref', 'detail']
};

var dbCache_ = null;
function spreadsheet_() {
  if (dbCache_) return dbCache_;
  var id = secret_('SPREADSHEET_ID', true);
  dbCache_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!dbCache_) fail_('SERVER_CONFIG', 'Server is not configured (SPREADSHEET_ID). Run setup().');
  return dbCache_;
}

function sheet_(name) {
  var headers = SCHEMA_[name];
  if (!headers) throw new Error('Unknown table ' + name);
  var ss = spreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1000, headers.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < headers.length) {
    // schema grew (new columns are only ever appended): add the missing header names
    var have = sh.getLastColumn();
    sh.getRange(1, have + 1, 1, headers.length - have).setValues([headers.slice(have)]);
  }
  return sh;
}

/** Returns every row as an object; `_row` is the 1-based sheet row for updates. */
function rows_(name) {
  var sh = sheet_(name);
  var headers = SCHEMA_[name];
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  var out = [];
  for (var r = 0; r < values.length; r++) {
    var obj = { _row: r + 2 };
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = values[r][c] === null ? '' : String(values[r][c]);
    out.push(obj);
  }
  return out;
}

function findOne_(name, column, value) {
  var all = rows_(name);
  for (var i = all.length - 1; i >= 0; i--) if (all[i][column] === String(value)) return all[i];
  return null;
}

function findAll_(name, column, value) {
  return rows_(name).filter(function (r) { return r[column] === String(value); });
}

function insert_(name, obj) {
  var headers = SCHEMA_[name];
  var sh = sheet_(name);
  var row = headers.map(function (h) { return obj[h] === undefined || obj[h] === null ? '' : String(obj[h]); });
  var at = sh.getLastRow() + 1;
  sh.getRange(at, 1, 1, headers.length).setNumberFormat('@').setValues([row]);
  var stored = { _row: at };
  headers.forEach(function (h, i) { stored[h] = row[i]; });
  return stored;
}

function update_(name, record, patch) {
  var headers = SCHEMA_[name];
  var sh = sheet_(name);
  var row = headers.map(function (h) {
    var v = patch.hasOwnProperty(h) ? patch[h] : record[h];
    return v === undefined || v === null ? '' : String(v);
  });
  sh.getRange(record._row, 1, 1, headers.length).setValues([row]);
  headers.forEach(function (h, i) { record[h] = row[i]; });
  return record;
}

function logEvent_(type, ref, detail) {
  try {
    insert_('Events', { at: nowIso_(), type: type, ref: ref || '', detail: detail ? String(detail).slice(0, 500) : '' });
  } catch (e) { /* logging must never break a request */ }
}

/** Runs fn while holding the script lock so shared counters cannot race. */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) fail_('BUSY', 'The server is busy. Please try again in a moment.');
  try {
    return fn();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}
