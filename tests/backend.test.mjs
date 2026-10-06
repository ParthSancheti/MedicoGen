// Runs the real Apps Script backend against the in-memory runtime.  `node --test tests/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRuntime, emptyState, loadBackend, BACKEND_FILES } from '../js/mock/gas-runtime.js';

const sources = BACKEND_FILES.map((f) => readFileSync(new URL('../apps-script/' + f, import.meta.url), 'utf8'));
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function boot(props = {}) {
  const state = emptyState();
  Object.assign(state.props, { MOCK_MODE: 'true', MISTRAL_API_KEY: 'mock', ADMIN_PASSWORD: 'admin', APP_URL: 'https://example.test', ...props });
  const fetches = [];
  const be = loadBackend(sources, createRuntime(state, { onFetch: (u) => fetches.push(u) }));
  be.setupMock_();
  const call = (action, p = {}) => be.handle_({ action, ...p });
  return { state, call, fetches };
}

const letterInput = (over = {}) => ({
  letterType: 'absence',
  date: '2026-10-05',
  student: { name: 'Aarav Patil', college: 'Government College of Engineering, Pune', department: 'Computer Engineering', year: 'Third Year', division: 'B', rollNo: '42' },
  absence: { from: '2026-09-12', to: '2026-09-14', reasonCategory: 'illness', reason: 'I had high fever and was advised rest at home', documents: false },
  recipient: { name: '', designation: 'Head of Department', salutation: 'Sir' },
  tone: 'formal',
  ...over
});
const gid = () => 'gen-' + Math.random().toString(36).slice(2) + Date.now();

test('test code validates with 3 attempts', () => {
  const { call } = boot();
  const r = call('access.validate', { code: ' mg-test-001 ' });
  assert.equal(r.ok, true);
  assert.equal(r.data.token.remaining, 3);
  assert.equal(call('access.validate', { code: 'MG-NOPE-0000' }).error.code, 'CODE_INVALID');
  assert.equal(call('access.validate', { code: 'MG-TEST-EXP' }).error.code, 'CODE_EXPIRED');
  assert.equal(call('access.validate', { code: 'MG-TEST-OFF' }).error.code, 'CODE_DISABLED');
});

test('letter generation consumes once per idempotency key and stops at zero', () => {
  const { call } = boot();
  const id = gid();
  const a = call('letter.generate', { code: 'MG-TEST-001', generationId: id, input: letterInput(), style: 'notebook' });
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(a.data.generation.source, 'mock', 'the mock composer is labelled honestly');
  assert.equal(a.data.token.remaining, 2);
  assert.ok(a.data.generation.content.paragraphs.length >= 2);
  const replay = call('letter.generate', { code: 'MG-TEST-001', generationId: id, input: letterInput(), style: 'notebook' });
  assert.equal(replay.data.replay, true);
  assert.equal(replay.data.token.remaining, 2);
  call('letter.generate', { code: 'MG-TEST-001', generationId: gid(), input: letterInput() });
  const third = call('demo.create', { code: 'MG-TEST-001', generationId: gid(), templateId: 'demo-leave', fields: { name: 'A' } });
  assert.equal(third.data.token.remaining, 0);
  const fourth = call('letter.generate', { code: 'MG-TEST-001', generationId: gid(), input: letterInput() });
  assert.equal(fourth.error.code, 'NO_ATTEMPTS');
  assert.equal(call('history.list', { code: 'MG-TEST-001' }).data.items.length, 3);
});

test('Mistral 429 falls back to the standard letter and opens a cooldown', () => {
  const { call } = boot({ MOCK_AI: '429' });
  const r = call('letter.generate', { code: 'MG-TEST-001', generationId: gid(), input: letterInput() });
  assert.equal(r.ok, true);
  assert.equal(r.data.generation.source, 'fallback');
  assert.equal(r.data.notice, 'AI_BUSY');
  assert.match(r.data.generation.content.subject, /12 September 2026/);
});

test('malformed and fact-inventing AI output is rejected', () => {
  for (const mode of ['garbage', 'invent', 'error']) {
    const { call } = boot({ MOCK_AI: mode });
    const r = call('letter.generate', { code: 'MG-TEST-001', generationId: gid(), input: letterInput() });
    assert.equal(r.data.generation.source, 'fallback', mode);
    assert.doesNotMatch(JSON.stringify(r.data.generation.content), /typhoid|Hospital/);
  }
});

test('no API key → deterministic letter, still usable', () => {
  const { call } = boot({ MISTRAL_API_KEY: '' });
  const r = call('letter.generate', { code: 'MG-TEST-001', generationId: gid(), input: letterInput({ letterType: 'leave' }) });
  assert.equal(r.data.generation.source, 'fallback');
  assert.match(r.data.generation.content.paragraphs[0], /request leave/);
});

test('validation errors are friendly', () => {
  const { call } = boot();
  const bad = letterInput();
  bad.absence = { ...bad.absence, from: '2026-09-14', to: '2026-09-12' };
  const r = call('letter.generate', { code: 'MG-TEST-001', generationId: gid(), input: bad });
  assert.equal(r.error.code, 'VALIDATION');
  assert.equal(call('access.validate', { code: 'MG-TEST-001' }).data.token.remaining, 3, 'invalid input must not consume');
});

test('edits are saved without consuming attempts', () => {
  const { call } = boot();
  const id = gid();
  call('letter.generate', { code: 'MG-TEST-001', generationId: id, input: letterInput() });
  const s = call('document.save', { code: 'MG-TEST-001', generationId: id, style: 'academic', content: { subject: 'Edited', salutation: 'Respected Sir,', paragraphs: ['One.'], closing: 'Thanking you.', signoff: 'Yours obediently,' } });
  assert.equal(s.ok, true, JSON.stringify(s));
  const g = call('generation.get', { code: 'MG-TEST-001', generationId: id });
  assert.equal(g.data.generation.content.subject, 'Edited');
  assert.equal(g.data.generation.paper, 'plain');
  assert.equal(g.data.generation.writing, 'academic');
  assert.equal(g.data.token.remaining, 2);
});

test('payment request → admin approval → code + referral reward after 5 verified', () => {
  const { call } = boot();
  assert.equal(call('admin.stats', {}).error.code, 'UNAUTHORIZED');
  assert.equal(call('admin.login', { password: 'nope' }).error.code, 'UNAUTHORIZED');
  const adminToken = call('admin.login', { password: 'admin' }).data.adminToken;
  const ref = call('referral.get', { code: 'MG-TEST-001' }).data.referral.referralCode;

  const submit = (phone, utr, referralCode = ref) =>
    call('access.request', { phone, paymentRef: utr, referralCode, proof: { mime: 'image/png', base64: PNG_1PX } });

  // referrer buys their own code first
  const own = submit('9000000000', 'UTR000000', '');
  const ownApproved = call('admin.approve', { adminToken, requestId: own.data.request.requestId });
  const myRef = call('referral.get', { code: ownApproved.data.token.code }).data.referral.referralCode;
  assert.match(ownApproved.data.delivery.link, /^https:\/\/wa\.me\/919000000000\?text=/);

  // self-referral with own phone does not count
  const self = call('access.request', { phone: '9000000000', paymentRef: 'UTR999999', referralCode: myRef, proof: { mime: 'image/png', base64: PNG_1PX } });
  assert.equal(call('admin.approve', { adminToken, requestId: self.data.request.requestId }).data.referral, 'rejected:self');

  const reqs = [];
  for (let i = 1; i <= 5; i++) reqs.push(call('access.request', { phone: '98765' + String(i).padStart(5, '0'), paymentRef: 'UTR10000' + i, referralCode: myRef, proof: { mime: 'image/png', base64: PNG_1PX } }));
  // duplicate payment reference returns the original request
  const dup = call('access.request', { phone: '9876500001', paymentRef: 'UTR100001', referralCode: myRef, proof: { mime: 'image/png', base64: PNG_1PX } });
  assert.equal(dup.data.duplicate, true);
  assert.equal(call('access.requestStatus', { requestId: reqs[0].data.request.requestId, phone: '9876500001' }).data.request.status, 'pending');

  let summary = call('referral.get', { code: ownApproved.data.token.code }).data.referral;
  assert.equal(summary.pending, 5);
  assert.equal(summary.verified, 0);

  // reject one, approve four → 4 verified, no reward
  call('admin.reject', { adminToken, requestId: reqs[4].data.request.requestId, reason: 'Amount mismatch' });
  for (let i = 0; i < 4; i++) {
    const r = call('admin.approve', { adminToken, requestId: reqs[i].data.request.requestId });
    assert.equal(r.data.referral, 'verified');
    assert.match(r.data.token.code, /^MG-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  }
  summary = call('referral.get', { code: ownApproved.data.token.code }).data.referral;
  assert.equal(summary.verified, 4);
  assert.equal(summary.rewards.length, 0);

  // same phone re-requesting later does not count twice
  const again = call('access.request', { phone: '9876500001', paymentRef: 'UTR200001', referralCode: myRef, proof: { mime: 'image/png', base64: PNG_1PX } });
  assert.equal(call('admin.approve', { adminToken, requestId: again.data.request.requestId }).data.referral, 'rejected:repeat_phone');

  const fifth = call('access.request', { phone: '9876500099', paymentRef: 'UTR300001', referralCode: myRef, proof: { mime: 'image/png', base64: PNG_1PX } });
  call('admin.approve', { adminToken, requestId: fifth.data.request.requestId });
  summary = call('referral.get', { code: ownApproved.data.token.code }).data.referral;
  assert.equal(summary.verified, 5);
  assert.equal(summary.rewards.length, 1);
  assert.equal(summary.rewards[0].amountInr, 10);
  assert.equal(summary.progress, 0);

  // double approve is idempotent
  const twice = call('admin.approve', { adminToken, requestId: fifth.data.request.requestId });
  assert.equal(twice.ok, true);
  assert.equal(call('admin.tokens', { adminToken }).data.items.filter((t) => t.source === 'request').length, 8);

  const proof = call('admin.proof', { adminToken, requestId: fifth.data.request.requestId });
  assert.match(proof.data.dataUrl, /^data:image\/png;base64,/);
  const stats = call('admin.stats', { adminToken }).data;
  assert.equal(stats.referralsVerified, 5);
  assert.equal(stats.rewardsUnpaid, 1);
  const paid = call('admin.rewards.paid', { adminToken, rewardId: summary.rewards[0].id });
  assert.equal(paid.ok, true);
});

test('admin token operations', () => {
  const { call } = boot();
  const adminToken = call('admin.login', { password: 'admin' }).data.adminToken;
  const created = call('admin.tokens.create', { adminToken, count: 3, attempts: 5, expiresAt: '2099-01-01', note: 'Batch' });
  assert.equal(created.data.items.length, 3);
  const code = created.data.items[0].code;
  assert.equal(call('access.validate', { code }).data.token.remaining, 5);
  call('admin.tokens.update', { adminToken, code, op: 'disable' });
  assert.equal(call('access.validate', { code }).error.code, 'CODE_DISABLED');
  call('admin.tokens.update', { adminToken, code, op: 'enable' });
  call('admin.tokens.update', { adminToken, code, op: 'setExpiry', value: '2020-01-01' });
  assert.equal(call('access.validate', { code }).error.code, 'CODE_EXPIRED');
  call('admin.tokens.update', { adminToken, code, op: 'setExpiry', value: '' });
  call('letter.generate', { code, generationId: gid(), input: letterInput() });
  call('admin.tokens.update', { adminToken, code, op: 'reset' });
  assert.equal(call('access.validate', { code }).data.token.remaining, 5);
});

test('all five tones produce a complete letter, online and offline', () => {
  for (const tone of ['formal', 'warm', 'simple', 'sincere', 'brief']) {
    for (const props of [{}, { MISTRAL_API_KEY: '' }]) {
      const { call } = boot(props);
      const r = call('letter.generate', { code: 'MG-TEST-001', generationId: gid(), input: letterInput({ tone }) });
      assert.equal(r.ok, true, tone);
      const c = r.data.generation.content;
      assert.ok(c.subject && c.salutation === 'Respected Sir,' && c.paragraphs.length >= 2 && c.closing && c.signoff, tone);
      assert.equal(r.data.generation.input.tone, tone);
    }
  }
});

test('paper and handwriting choices persist', () => {
  const { call } = boot();
  const id = gid();
  const r = call('letter.generate', { code: 'MG-TEST-001', generationId: id, input: letterInput(), paper: 'legal', writing: 'caveat' });
  assert.equal(r.data.generation.paper, 'legal');
  assert.equal(r.data.generation.writing, 'caveat');
  call('document.save', { code: 'MG-TEST-001', generationId: id, writing: 'patrick' });
  const g = call('generation.get', { code: 'MG-TEST-001', generationId: id }).data.generation;
  assert.equal(g.paper, 'legal');
  assert.equal(g.writing, 'patrick');
});

test('precision settings are clamped and persisted, and are free to change', () => {
  const { call } = boot();
  const id = gid();
  const r = call('letter.generate', { code: 'MG-TEST-001', generationId: id, input: letterInput(), paper: 'graph', writing: 'mynerve',
    settings: { font: { height: 9, ink: '#0B2FA0', evil: 1 }, human: { errors: 3, preset: 'rushed' }, page: { lineGap: 8.2 }, extra: { x: 1 } } });
  assert.deepEqual(r.data.generation.settings, { font: { height: 1.5, ink: '#0b2fa0' }, human: { errors: 3, preset: 'rushed' }, page: { lineGap: 8.2 } });
  call('document.save', { code: 'MG-TEST-001', generationId: id, settings: { font: { slant: 6 }, human: { preset: 'neat' }, page: {} } });
  const g = call('generation.get', { code: 'MG-TEST-001', generationId: id }).data;
  assert.equal(g.generation.settings.font.slant, 6);
  assert.equal(g.generation.settings.human.preset, 'neat');
  assert.equal(g.generation.paper, 'graph');
  assert.equal(g.token.remaining, 2);
});

test('changing handwriting, paper or fine-tune settings never calls the AI or spends an attempt', () => {
  const { call, fetches } = boot();
  const id = gid();
  call('letter.generate', { code: 'MG-TEST-001', generationId: id, input: letterInput(), paper: 'classmate', writing: 'neat' });
  const aiCalls = fetches.filter((u) => u.includes('api.mistral.ai')).length;
  assert.equal(aiCalls, 1, 'one AI call to write the letter');
  for (const [paper, writing] of [['school', 'flowing'], ['cream', 'ballpoint'], ['black_margin', 'steady']]) {
    const r = call('document.save', { code: 'MG-TEST-001', generationId: id, paper, writing, settings: { human: { preset: 'rushed' } } });
    assert.equal(r.ok, true);
  }
  assert.equal(fetches.filter((u) => u.includes('api.mistral.ai')).length, aiCalls, 'no further AI calls');
  const g = call('generation.get', { code: 'MG-TEST-001', generationId: id }).data;
  assert.equal(g.token.remaining, 2, 'still only one attempt used');
  assert.equal(g.generation.writing, 'steady');
  assert.equal(g.generation.paper, 'black_margin');
});

test('generation source is honest: mock, fallback (no key / quota)', () => {
  assert.equal(boot().call('letter.generate', { code: 'MG-TEST-001', generationId: gid(), input: letterInput() }).data.generation.source, 'mock');
  assert.equal(boot({ MISTRAL_API_KEY: '' }).call('letter.generate', { code: 'MG-TEST-001', generationId: gid(), input: letterInput() }).data.generation.source, 'fallback');
  assert.equal(boot({ MOCK_AI: '429' }).call('letter.generate', { code: 'MG-TEST-001', generationId: gid(), input: letterInput() }).data.generation.source, 'fallback');
});

test('reading a prescription is free, honest about test mode, validated and rate-limited', () => {
  const { call, state } = boot();
  const image = 'data:image/png;base64,' + PNG_1PX;
  const r = call('prescription.read', { code: 'MG-TEST-001', image });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.source, 'mock', 'the mock reader is labelled as test mode');
  assert.equal(r.data.details.restDays, 4);
  assert.deepEqual(r.data.details.complaints, ['high fever', 'body ache', 'headache']);
  assert.equal(call('access.validate', { code: 'MG-TEST-001' }).data.token.remaining, 3, 'no generation spent');
  // the photo itself is never stored
  assert.ok(!JSON.stringify(state).includes(PNG_1PX), 'image not persisted anywhere');

  assert.equal(call('prescription.read', { code: 'MG-NOPE-0000', image }).error.code, 'CODE_INVALID');
  assert.equal(call('prescription.read', { code: 'MG-TEST-001', image: 'data:text/html;base64,PGI+' }).error.code, 'VALIDATION');
  for (let i = 0; i < 9; i++) call('prescription.read', { code: 'MG-TEST-001', image });
  assert.equal(call('prescription.read', { code: 'MG-TEST-001', image }).error.code, 'RATE_LIMITED');
});

test('prescription reading without a key or on bad AI output fails cleanly (never invents details)', () => {
  const image = 'data:image/png;base64,' + PNG_1PX;
  assert.equal(boot({ MISTRAL_API_KEY: '' }).call('prescription.read', { code: 'MG-TEST-001', image }).error.code, 'AI_UNAVAILABLE');
  assert.equal(boot({ MOCK_AI: 'garbage' }).call('prescription.read', { code: 'MG-TEST-001', image }).error.code, 'AI_UNAVAILABLE');
  const busy = boot({ MOCK_AI: '429' });
  assert.equal(busy.call('prescription.read', { code: 'MG-TEST-001', image }).error.code, 'AI_BUSY');
});
