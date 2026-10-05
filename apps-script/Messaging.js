/**
 * Medico Gen — WhatsApp delivery.
 *
 * Provider 'link' (default): returns a prefilled wa.me link that the admin taps to send the
 * message from their own WhatsApp. Provider 'cloud_api': sends through the WhatsApp Business
 * Cloud API using WHATSAPP_CLOUD_TOKEN + WHATSAPP_PHONE_NUMBER_ID. Note that Meta only allows
 * free-form text inside a 24-hour customer-service window; outside it you must configure an
 * approved template (WHATSAPP_TEMPLATE_NAME). Any API failure falls back to the link.
 */

function waLink_(phone10, text) {
  return 'https://wa.me/91' + phone10 + '?text=' + encodeURIComponent(text);
}

function approvalMessage_(code, attempts) {
  var url = cfg_('APP_URL');
  return 'Hi! Your ' + cfg_('APP_NAME') + ' payment is verified ✅\n\n' +
    'Access code: ' + code + '\n' +
    'It includes ' + attempts + ' document generations.\n\n' +
    (url ? 'Open ' + url + ' → Get started → enter the code.' : 'Open Medico Gen → Get started → enter the code.');
}

function rejectionMessage_(requestId, reason) {
  return 'Hi! We could not verify the payment for your ' + cfg_('APP_NAME') + ' request ' + requestId + '.' +
    (reason ? '\nReason: ' + reason : '') + '\n\nReply to this message if you think this is a mistake.';
}

function deliverWhatsApp_(phone10, text, templateParams) {
  var link = waLink_(phone10, text);
  if (cfg_('WHATSAPP_PROVIDER') !== 'cloud_api') return { provider: 'link', sent: false, link: link };
  try {
    var phoneId = secret_('WHATSAPP_PHONE_NUMBER_ID');
    var template = secret_('WHATSAPP_TEMPLATE_NAME', true);
    var message = template
      ? { type: 'template', template: { name: template, language: { code: 'en' },
          components: [{ type: 'body', parameters: (templateParams || []).map(function (v) { return { type: 'text', text: String(v) }; }) }] } }
      : { type: 'text', text: { body: text } };
    message.messaging_product = 'whatsapp';
    message.to = '91' + phone10;
    var res = UrlFetchApp.fetch('https://graph.facebook.com/v20.0/' + phoneId + '/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + secret_('WHATSAPP_CLOUD_TOKEN') },
      payload: JSON.stringify(message),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) return { provider: 'cloud_api', sent: true, link: link };
    Logger.log('WhatsApp API ' + res.getResponseCode() + ': ' + String(res.getContentText()).slice(0, 300));
  } catch (e) {
    Logger.log('WhatsApp API error: ' + e);
  }
  return { provider: 'link', sent: false, link: link, fallback: true };
}
