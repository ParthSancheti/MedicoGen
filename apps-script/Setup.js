/**
 * Medico Gen — one-time setup. Run `setup` once from the Apps Script editor.
 * Creates the database spreadsheet and the proofs folder if their ids are not configured yet,
 * then creates every table with its header row.
 */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SPREADSHEET_ID')) {
    var ss = SpreadsheetApp.create('Medico Gen — database');
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }
  dbCache_ = null;
  Object.keys(SCHEMA_).forEach(function (name) { sheet_(name); });
  proofFolder_();
  Logger.log('Medico Gen is set up. Spreadsheet: ' + props.getProperty('SPREADSHEET_ID') + ', proofs folder: ' + props.getProperty('DRIVE_FOLDER_ID'));
  if (!props.getProperty('ADMIN_PASSWORD')) Logger.log('Set the ADMIN_PASSWORD script property before using the admin console.');
  if (!props.getProperty('MISTRAL_API_KEY')) Logger.log('MISTRAL_API_KEY is not set: letters will use the built-in standard letter.');
}

/** Optional: creates the shared test code MG-TEST-001 (3 attempts). Do not run on a public deployment you don't want tested. */
function seedTestCode() {
  withLock_(function () {
    if (!findOne_('Tokens', 'code', 'MG-TEST-001')) createToken_({ code: 'MG-TEST-001', attempts: 3, source: 'test', note: 'Test code' });
  });
}

/** Mock runtime only: seeds the demo database. Refuses to run on a real deployment. */
function setupMock_() {
  if (!isMock_()) fail_('SERVER_CONFIG', 'Mock seeding is only available in mock mode.');
  Object.keys(SCHEMA_).forEach(function (name) { sheet_(name); });
  if (!findOne_('Tokens', 'code', 'MG-TEST-001')) {
    createToken_({ code: 'MG-TEST-001', attempts: 3, source: 'test', note: 'Mock test code' });
    createToken_({ code: 'MG-TEST-EXP', attempts: 3, source: 'test', note: 'Mock expired code', expiresAt: '2024-01-01' });
    var off = createToken_({ code: 'MG-TEST-OFF', attempts: 3, source: 'test', note: 'Mock disabled code' });
    update_('Tokens', off, { status: 'disabled' });
  }
}
