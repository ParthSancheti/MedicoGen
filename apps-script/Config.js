/**
 * Medico Gen — server configuration.
 *
 * Public, non-secret defaults live here. Every key can be overridden without editing code via
 * Project Settings → Script Properties. Secrets ONLY live in Script Properties:
 *
 *   MISTRAL_API_KEY    Mistral La Plateforme key (console.mistral.ai → API Keys). Never sent to the browser.
 *   ADMIN_PASSWORD     Admin console password (compared server-side)
 *   SPREADSHEET_ID     Operational database (created by setup() if missing)
 *   DRIVE_FOLDER_ID    Folder for payment screenshots (created by setup() if missing)
 *   WHATSAPP_CLOUD_TOKEN / WHATSAPP_PHONE_NUMBER_ID   Only when WHATSAPP_PROVIDER = cloud_api
 */
var MG_DEFAULTS = {
  APP_NAME: 'Medico Gen',
  APP_URL: '',                       // public site URL, used in referral links and WhatsApp messages
  MAX_ATTEMPTS: 3,                   // generations per access code
  REFERRAL_TARGET: 5,                // verified invites per reward
  REFERRAL_REWARD_INR: 10,
  PRICE_INR: 49,                     // shown to students; payment itself is verified by an admin
  MISTRAL_MODEL: 'mistral-small-latest',          // primary model, strict JSON schema
  MISTRAL_FALLBACK_MODEL: 'open-mistral-nemo',     // second try (json_object mode) before the offline letter
  AI_COOLDOWN_SEC: 60,               // after a 429 we stop calling Mistral for this long
  WHATSAPP_PROVIDER: 'link',         // 'link' (prefilled wa.me link for the admin) | 'cloud_api'
  ADMIN_SESSION_HOURS: 6,
  MOCK_MODE: 'false'                 // set by the in-browser mock runtime only
};

function cfg_(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (value === null || value === undefined || value === '') return MG_DEFAULTS[key];
  return value;
}

function cfgInt_(key) {
  return toInt_(cfg_(key), toInt_(MG_DEFAULTS[key], 0));
}

function secret_(key, optional) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value && !optional) fail_('SERVER_CONFIG', 'Server is not configured (' + key + ').');
  return value || '';
}

function isMock_() {
  return String(cfg_('MOCK_MODE')) === 'true';
}

/** The subset of configuration the frontend is allowed to see. */
function publicConfig_() {
  return {
    appName: cfg_('APP_NAME'),
    appUrl: cfg_('APP_URL'),
    maxAttempts: cfgInt_('MAX_ATTEMPTS'),
    referralTarget: cfgInt_('REFERRAL_TARGET'),
    referralRewardInr: cfgInt_('REFERRAL_REWARD_INR'),
    priceInr: cfgInt_('PRICE_INR'),
    aiModel: cfg_('MISTRAL_MODEL'),
    aiConfigured: !!secret_('MISTRAL_API_KEY', true),
    mock: isMock_()
  };
}
