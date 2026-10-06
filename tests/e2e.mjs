// End-to-end walkthrough in mock mode (real backend code, in-browser).
// Usage: npm run dev  (in another terminal), then  node tests/e2e.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '../tools/pw.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
const out = process.argv[2] || 'test-output';
mkdirSync(out, { recursive: true });
const errors = [];
const log = (...a) => console.log('·', ...a);
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); };
// Mobile emulation sometimes mis-scrolls before clicking a position:fixed bar; the button is verified
// topmost via elementFromPoint, then clicked directly if the normal click can't settle.
async function tapContinue(page) {
  const btn = page.locator('.action-bar .btn.primary');
  try { await btn.click({ timeout: 4000 }); }
  catch {
    const top = await btn.evaluate((b) => { const r = b.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.action-bar') !== null; });
    if (!top) throw new Error('Continue button is covered');
    await btn.dispatchEvent('click');
  }
}

const browser = await chromium.launch();

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: viewport.width < 700, isMobile: viewport.width < 700, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return page;
}

async function fillLetterWizard(page, { name = 'Aarav Patil', college = 'Government College of Engineering, Pune', reason = 'I had high fever and was advised rest at home', longText = false } = {}) {
  await page.getByRole('button', { name: /Absence already taken/ }).click();
  await page.getByLabel('Your full name').fill(name);
  await page.getByLabel('College').fill(college);
  await page.getByRole('button', { name: 'Computer Engineering', exact: true }).click();
  await page.getByRole('button', { name: 'Third Year' }).click();
  await page.getByLabel('Division').fill('B');
  await page.getByLabel('Roll no.').fill('42');
  await tapContinue(page);
  await page.getByLabel('From date').fill('2026-09-12');
  await page.getByLabel('To date').fill('2026-09-14');
  await page.getByRole('button', { name: 'Illness' }).click();
  await page.getByLabel('Reason in your words').fill(longText ? (reason + '. ').repeat(5).slice(0, 395) : reason);
  await tapContinue(page);
  if (longText) await page.getByLabel('Name').fill('Prof. Dr. Rajendra Krishnamurthy Venkataraghavan Subramaniam');
  await tapContinue(page);
}

try {
  /* ---------- phone ---------- */
  const page = await newPage({ width: 390, height: 844 });
  await page.goto(BASE + '?resetmock=1');
  await page.waitForSelector('#landing:not([hidden])');
  await page.waitForSelector('#hero-paper svg', { timeout: 15000 });
  await shot(page, '01-landing');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert(!overflow, 'landing has horizontal overflow');

  await page.getByRole('button', { name: /Get started/ }).first().click();
  await page.waitForSelector('.sheet-root.open');
  await shot(page, '02-code-sheet');
  // invalid, expired, disabled codes
  for (const [code, msg] of [['MG-NOPE-1234', /isn.t valid/], ['MG-TEST-EXP', /expired/], ['MG-TEST-OFF', /disabled/]]) {
    await page.getByLabel('Access code').fill(code);
    await page.getByRole('button', { name: 'Unlock Medico Gen' }).click();
    await page.waitForFunction((re) => new RegExp(re).test(document.querySelector('.sheet .err')?.textContent || ''), msg.source);
    log('rejected', code);
  }
  await page.getByLabel('Access code').fill('MG-TEST-001');
  await page.getByRole('button', { name: 'Unlock Medico Gen' }).click();
  await page.waitForSelector('#app:not([hidden]) .allowance-card');
  await page.waitForTimeout(600);
  await shot(page, '03-home');
  assert((await page.textContent('#allowance')).includes('3 left'), 'allowance shows 3');

  // referral sheet
  await page.click('#share');
  await page.waitForSelector('.ref-code b');
  await shot(page, '04-referral');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // letter wizard
  await page.getByRole('button', { name: /Student application/ }).click();
  await page.waitForSelector('.wizard');
  await shot(page, '05-wizard-type');
  await page.getByRole('button', { name: /Absence already taken/ }).click();
  await tapContinue(page); // empty → validation
  await page.waitForSelector('.err:not(:empty)');
  await shot(page, '06-wizard-validation');
  // refresh mid-wizard → draft restore
  await page.getByLabel('Your full name').fill('Aarav Patil');
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForSelector('.wizard');
  assert(await page.getByLabel('Your full name').inputValue() === 'Aarav Patil', 'draft restored after refresh');
  log('draft restored after refresh');
  await page.getByLabel('College').fill('Government College of Engineering, Pune');
  await page.getByRole('button', { name: 'Computer Engineering', exact: true }).click();
  await page.getByRole('button', { name: 'Third Year' }).click();
  await page.getByLabel('Division').fill('B');
  await page.getByLabel('Roll no.').fill('42');
  await tapContinue(page);
  await page.getByLabel('From date').fill('2026-09-12');
  await page.getByLabel('To date').fill('2026-09-14');
  await page.getByRole('button', { name: 'Illness' }).click();
  await page.getByRole('button', { name: 'I had high fever' }).click();
  await page.getByRole('button', { name: 'and was advised rest at home' }).click();
  await shot(page, '07-wizard-absence');
  await tapContinue(page);
  await page.getByRole('button', { name: 'Prof.' }).click();
  await page.getByLabel('Name').fill('Prof. R. K. Sharma');
  await shot(page, '08-wizard-recipient');
  await tapContinue(page);
  // tone: five emoji tiles
  await page.waitForSelector('.tone-tile');
  assert(await page.locator('.tone-tile').count() === 5, 'five tones');
  await page.getByRole('radio', { name: 'Warm' }).click();
  await shot(page, '09-wizard-tone');
  await tapContinue(page);
  // handwriting
  await page.waitForSelector('.style-card .preview svg');
  await page.waitForTimeout(600);
  await shot(page, '09b-wizard-writing');
  await page.locator('.style-card', { hasText: 'Caveat' }).click();
  await tapContinue(page);
  // paper
  await page.waitForSelector('.style-card .preview svg');
  await page.locator('.style-card', { hasText: 'Classmate' }).click();
  await tapContinue(page);
  await shot(page, '10-wizard-review');
  // double tap on generate
  const gen = page.getByRole('button', { name: /Write my letter/ });
  await gen.dblclick();
  await page.waitForSelector('.gen-overlay');
  await shot(page, '11-generating');
  await page.waitForSelector('.page-frame svg', { timeout: 20000 });
  await page.waitForTimeout(900);
  await shot(page, '12-studio');
  assert((await page.textContent('#allowance')).includes('2 left'), 'double tap consumed only one (2 left)');
  log('double tap consumed exactly one generation');

  // edit a sentence
  await page.locator('.page-frame text[data-block="p0"]').first().click();
  await page.waitForSelector('.sheet .editor');
  await page.getByLabel('Paragraph 1').fill('I am a student of Third Year. I could not attend college from 12 September 2026 to 14 September 2026 because I had high fever.');
  await shot(page, '13-editor');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(1500);
  assert((await page.textContent('#allowance')).includes('2 left'), 'edit is free');

  // switch style → classic, export
  await page.getByRole('radio', { name: 'Rushed' }).click();
  await page.waitForTimeout(500);
  await shot(page, '13b-studio-rushed');
  await page.getByRole('radio', { name: 'Natural' }).click();
  await page.waitForTimeout(500);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.studio-actions .btn.primary').click()]);
  const path = `${out}/letter-notebook.pdf`;
  await dl.saveAs(path);
  log('exported', dl.suggestedFilename());
  await page.waitForSelector('.sheet .success-mark');
  await shot(page, '14-export');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(400);

  // demo template
  await page.goto(BASE + '#/home');
  await page.waitForSelector('.allowance-card');
  await page.getByRole('button', { name: /Medical template demo/ }).click();
  await page.waitForSelector('.template-card');
  await shot(page, '15-demo-pick');
  await page.getByRole('button', { name: /Rest advice note/ }).click();
  await tapContinue(page);
  await page.getByLabel('Name').fill('Aarav Patil');
  await page.getByLabel('Rest from').fill('2026-09-12');
  await page.getByLabel('Until').fill('2026-09-14');
  await page.getByLabel('Remarks').fill('Rest at home advised for three days.');
  await shot(page, '16-demo-details');
  await tapContinue(page);
  await page.getByRole('button', { name: /Create sample/ }).click();
  await page.waitForSelector('.err:not(:empty)'); // acknowledgement required
  await page.locator('label.row input[type=checkbox]').check();
  await page.getByRole('button', { name: /Create sample/ }).click();
  await page.waitForSelector('.page-frame svg', { timeout: 20000 });
  await page.waitForTimeout(800);
  await shot(page, '17-demo-studio');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.locator('.studio-actions .btn.primary').click()]);
  await dl2.saveAs(`${out}/demo.pdf`);
  log('exported', dl2.suggestedFilename());
  await page.getByRole('button', { name: 'Done' }).click();

  // third generation via mock 429 → fallback, then exhausted
  await page.goto(BASE + '?ai=429#/letter');
  await page.waitForSelector('.wizard');
  await fillLetterWizard(page, { longText: true, name: 'Aaravkumar Sanjayrao Patil-Deshmukh', college: 'Shri Guru Gobind Singhji Institute of Engineering and Technology, Vishnupuri, Nanded, Maharashtra' });
  for (let i = 0; i < 3; i++) { await tapContinue(page); await page.waitForTimeout(250); } // tone, writing, paper
  await page.getByRole('button', { name: /Write my letter/ }).click();
  await page.waitForSelector('.page-frame svg', { timeout: 20000 });
  await page.waitForTimeout(800);
  await shot(page, '18-fallback-long');
  assert(await page.locator('.notice.warn').count() > 0, 'fallback notice shown');
  const [dl3] = await Promise.all([page.waitForEvent('download'), page.locator('.studio-actions .btn.primary').click()]);
  await dl3.saveAs(`${out}/letter-long-fallback.pdf`);
  await page.getByRole('button', { name: 'Done' }).click();
  assert((await page.textContent('#allowance')).includes('0 left'), 'exhausted');
  await page.goto(BASE + '#/home');
  await page.waitForSelector('.allowance-card');
  await shot(page, '19-exhausted');
  await page.getByRole('button', { name: /Student application/ }).click();
  await page.waitForTimeout(300);
  assert(!page.url().includes('letter'), 'blocked');
  await page.goto(BASE + '#/history');
  await page.waitForSelector('.doc-item');
  await page.waitForTimeout(800);
  await shot(page, '20-history');
  assert(await page.locator('.doc-item').count() === 3, 'history has 3 docs');

  // request flow
  await page.click('#allowance');
  await page.getByRole('button', { name: /Get another code/ }).click();
  await page.getByLabel('WhatsApp number').fill('9876543210');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForSelector('.qr svg');
  await shot(page, '21-pay');
  await page.getByLabel('UPI reference number').fill('412345678901');
  await page.getByRole('button', { name: /paid/ }).click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  await page.setInputFiles('.dropzone input', { name: 'pay.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('.proof-preview');
  await shot(page, '22-proof');
  await page.getByRole('button', { name: 'Submit request' }).click();
  await page.waitForSelector('.req-id');
  await shot(page, '23-request-done');
  const reqId = await page.textContent('.req-id');
  log('request', reqId);
  writeFileSync(`${out}/request-id.txt`, reqId);
  await page.context().close();

  /* ---------- small phone ---------- */
  const small = await newPage({ width: 360, height: 640 });
  await small.goto(BASE);
  await small.waitForSelector('#app:not([hidden]), #landing:not([hidden])');
  await small.goto(BASE + '#/home');
  await small.waitForTimeout(800);
  for (const r of ['home', 'history', 'letter']) {
    await small.goto(BASE + '#/' + r);
    await small.waitForTimeout(900);
    const ov = await small.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await shot(small, `30-small-${r}`);
    assert(ov <= 0, `horizontal overflow on ${r} at 360px: ${ov}`);
  }
  await small.context().close();

  /* ---------- desktop ---------- */
  const desk = await newPage({ width: 1440, height: 900 });
  await desk.goto(BASE + '#/history');
  await desk.waitForTimeout(500);
  await desk.goto(BASE);
  await desk.waitForTimeout(800);
  await shot(desk, '40-desktop-landing');
  log('done');
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (errors.length) { console.log('Console errors:\n' + [...new Set(errors)].join('\n')); }
  await browser.close();
}
