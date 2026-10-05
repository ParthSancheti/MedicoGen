// Admin console walkthrough in mock mode. Usage: npm run dev, then node tests/e2e-admin.mjs [outDir]
import { mkdirSync } from 'node:fs';
import { chromium } from '../tools/pw.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
const out = process.argv[2] || 'test-output';
mkdirSync(out, { recursive: true });
const errors = [];
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); };
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + '?resetmock=1');
  await page.waitForSelector('#landing:not([hidden])');
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const reqId = await page.evaluate(async (png) => {
    const { api } = await import('/js/core/api.js');
    const ref = (await api('referral.get', { code: 'MG-TEST-001' })).referral.referralCode;
    const r = await api('access.request', { phone: '9876543210', paymentRef: 'UTR555555', referralCode: ref, proof: { mime: 'image/png', base64: png } });
    return r.request.requestId;
  }, PNG);

  await page.goto(BASE + 'admin.html');
  await page.getByLabel('Admin password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForSelector('.err:not(:empty)');
  await page.getByLabel('Admin password').fill('admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForSelector('.stats');
  await page.screenshot({ path: `${out}/50-admin-overview.png` });
  await page.getByRole('tab', { name: 'Requests' }).click();
  await page.waitForSelector('.req');
  assert((await page.textContent('.req')).includes(reqId), 'request listed');
  await page.getByRole('button', { name: 'Proof' }).click();
  await page.waitForSelector('.proof-img');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/51-admin-requests.png` });
  await page.locator('.req .btn.success').first().click();
  await page.getByRole('button', { name: /Approve & issue code/ }).click();
  await page.waitForSelector('.sheet .ref-code b');
  const code = await page.textContent('.sheet .ref-code b');
  assert(/^MG-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code), 'issued code ' + code);
  assert(await page.locator('a.btn.whatsapp[href^="https://wa.me/919876543210"]').count() === 1, 'whatsapp link');
  assert((await page.textContent('.sheet')).includes('referral counted'), 'referral counted');
  await page.screenshot({ path: `${out}/52-admin-approved.png` });
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(300);

  await page.getByRole('tab', { name: 'Codes' }).click();
  await page.waitForSelector('table.data');
  await page.getByLabel('How many').fill('3');
  await page.getByLabel('Generations each').fill('5');
  await page.getByRole('button', { name: 'Create codes' }).click();
  await page.waitForSelector('.codes-out');
  const created = (await page.textContent('.codes-out')).trim().split('\n');
  assert(created.length === 3, '3 codes created');
  await page.locator('tr', { hasText: created[0] }).getByRole('button', { name: 'Disable' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/53-admin-codes.png`, fullPage: true });
  await page.getByRole('tab', { name: 'Referrals' }).click();
  await page.waitForSelector('.req');
  await page.screenshot({ path: `${out}/54-admin-referrals.png` });

  // the issued code works in the app; the disabled one does not
  const check = await page.evaluate(async ([a, b]) => {
    const { api } = await import('/js/core/api.js');
    const ok = await api('access.validate', { code: a });
    let disabled = '';
    try { await api('access.validate', { code: b }); } catch (e) { disabled = e.code; }
    return { remaining: ok.token.remaining, disabled };
  }, [code, created[0]]);
  assert(check.remaining === 3 && check.disabled === 'CODE_DISABLED', JSON.stringify(check));
  console.log('admin ok', code, created);
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (errors.length) console.log('Console errors:\n' + [...new Set(errors)].join('\n'));
  await browser.close();
}
