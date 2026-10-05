/**
 * Medico Gen — public frontend configuration. Everything a deployer normally changes is here.
 * Nothing secret belongs in this file: the Gemini key, admin password, spreadsheet and Drive ids
 * live in Apps Script → Project Settings → Script Properties.
 */
export const CONFIG = {
  appName: 'Medico Gen',
  appUrl: '',                    // e.g. 'https://medicogen.example.in' — used in referral links; defaults to the current origin

  // Apps Script web app URL (Deploy → Web app → URL ending in /exec). Leave empty to run in mock mode.
  apiUrl: '',

  // Mock mode runs the real backend code in the browser with local storage. It is used when apiUrl
  // is empty, or when the page is opened with ?mock=1.
  mockCode: 'MG-TEST-001',

  support: {
    whatsapp: '919999999999',    // country code + number, digits only
  },

  payment: {
    priceInr: 49,
    upiId: 'medicogen@upi',      // shown under the QR and used for the UPI deep link
    payeeName: 'Medico Gen',
    qrImage: '',                 // optional path to a static QR image; otherwise a UPI QR is generated
    note: 'Medico Gen access'
  },

  // Shown before the backend answers; the backend values always win.
  defaults: { maxAttempts: 3, referralTarget: 5, referralRewardInr: 10 },

  // Background: five colours, two dominate at a time.
  aurora: ['#8cc8ff', '#b7b2ff', '#ffc4d8', '#a8ecd7', '#ffe0b0']
};
