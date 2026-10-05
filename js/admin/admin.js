/**
 * Medico Gen admin console. The password is checked by the backend (ADMIN_PASSWORD script
 * property); this page only ever holds the short-lived session token it returns.
 */
import { CONFIG } from '../config.js';
import { api, isMock } from '../core/api.js';
import { h, clear, fill } from '../core/dom.js';
import { iconEl } from '../ui/icons.js';
import { openSheet, confirmSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { startAurora } from '../ui/aurora.js';

const root = document.getElementById('admin');
const KEY = 'mg.admin';
let token = sessionStorage.getItem(KEY);
let tab = 'overview';
let reqFilter = 'pending';

const call = async (action, params = {}) => {
  try {
    return await api(action, { adminToken: token, ...params });
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') { token = null; sessionStorage.removeItem(KEY); login(); }
    throw e;
  }
};

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const copy = async (text, msg = 'Copied') => { try { await navigator.clipboard.writeText(text); toast(msg, { tone: 'success' }); } catch { toast('Copy not available'); } };

/* ---------- login ---------- */
function login() {
  const pw = h('input.input', { type: 'password', autocomplete: 'current-password', placeholder: 'Admin password', 'aria-label': 'Admin password' });
  const err = h('p.err', { role: 'alert' });
  const btn = h('button.btn.primary.block', { type: 'submit' }, 'Sign in');
  fill(root, h('div.login', h('form.card.pad-lg.stack.lg', {
    onsubmit: async (e) => {
      e.preventDefault();
      btn.classList.add('loading'); err.textContent = '';
      try {
        const res = await api('admin.login', { password: pw.value });
        token = res.adminToken;
        sessionStorage.setItem(KEY, token);
        shell();
      } catch (e2) { err.textContent = e2.message; }
      finally { btn.classList.remove('loading'); }
    }
  },
  h('div.access-hero', h('img', { src: 'assets/brand/logo-mark.png', alt: '' }), h('h1.title-lg', 'Admin console'), h('p.muted', CONFIG.appName + ' operations')),
  isMock ? h('div.notice', iconEl('info', 18), h('span', 'Mock mode — the local mock password is ', h('b', 'admin'), '. Real deployments verify ADMIN_PASSWORD on the server.')) : null,
  h('div.field', pw, err), btn)));
  pw.focus();
}

/* ---------- shell ---------- */
async function shell() {
  const tabs = [['overview', 'Overview'], ['requests', 'Requests'], ['codes', 'Codes'], ['referrals', 'Referrals']];
  const tabBar = h('div.tabs', { role: 'tablist' });
  const view = h('div.stack.lg');
  const draw = () => {
    fill(tabBar, ...tabs.map(([id, label]) => h('button' + (tab === id ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; draw(); } }, label)));
    fill(view, h('div.empty', h('span.btn.ghost.loading', ' ')));
    ({ overview, requests, codes, referrals })[tab](view).catch((e) => { fill(view, h('div.notice.danger', iconEl('alert', 18), h('span', e.message))); });
  };
  fill(root, h('div.admin-shell',
    h('div.admin-top.glass-strong',
      h('a.brand', { href: './' }, h('img', { src: 'assets/brand/logo-mark.png', alt: '' }), h('span', 'Admin')),
      tabBar,
      isMock ? h('span.badge.warn', 'Mock') : null,
      h('button.icon-btn', { type: 'button', 'aria-label': 'Sign out', onclick: () => { sessionStorage.removeItem(KEY); token = null; login(); } }, iconEl('logout', 18))),
    view));
  draw();
}

/* ---------- overview ---------- */
async function overview(view) {
  const s = await call('admin.stats');
  const tiles = [
    ['Pending requests', s.requestsPending], ['Active codes', s.codesActive], ['Generations used', s.generationsUsed], ['Generations today', s.generationsToday],
    ['Written by Gemini', s.aiGenerations], ['Standard fallback', s.fallbackGenerations], ['Verified referrals', s.referralsVerified], ['Rewards to pay', s.rewardsUnpaid]
  ];
  fill(view, 
    h('div.stats', tiles.map(([k, v]) => h('div.card.stat', h('b', String(v)), h('span', k)))),
    s.aiConfigured ? null : h('div.notice.warn', iconEl('alert', 18), h('span', 'GEMINI_API_KEY is not set on the server — every letter uses the standard template.')),
    s.requestsPending ? h('button.btn.primary', { type: 'button', style: { alignSelf: 'flex-start' }, onclick: () => { tab = 'requests'; reqFilter = 'pending'; shell(); } }, `Review ${s.requestsPending} pending request${s.requestsPending > 1 ? 's' : ''}`) : null);
}

/* ---------- requests ---------- */
async function requests(view) {
  const { items } = await call('admin.requests', { status: reqFilter === 'all' ? '' : reqFilter });
  const filter = h('div.segmented', { style: { maxWidth: '520px' } }, ['pending', 'approved', 'rejected', 'all'].map((f) =>
    h('button' + (reqFilter === f ? '.on' : ''), { type: 'button', onclick: () => { reqFilter = f; requests(view); } }, f[0].toUpperCase() + f.slice(1))));
  const tone = { pending: 'warn', approved: 'success', rejected: 'danger' };
  fill(view, filter, items.length ? h('div.rows', items.map((r) => h('div.card.req',
    h('div.top', h('b.mono', r.requestId), h('span.badge.' + tone[r.status], r.status), h('span.subtle', fmt(r.createdAt))),
    h('div.kv',
      h('div', h('span', 'Phone'), h('b', '+91 ' + r.phone)),
      h('div', h('span', 'UPI reference'), h('b.mono', r.paymentRef)),
      h('div', h('span', 'Referral'), h('b', r.referralCode || '—')),
      r.issuedCode ? h('div', h('span', 'Issued code'), h('b.mono', r.issuedCode)) : null,
      r.note ? h('div', h('span', 'Note'), h('b', r.note)) : null),
    h('div.acts',
      r.hasProof ? h('button.btn.secondary.xs', { type: 'button', onclick: () => showProof(r) }, iconEl('image', 16), 'Proof') : null,
      r.status === 'pending' ? h('button.btn.success.xs', { type: 'button', onclick: () => approve(r, view) }, iconEl('check', 16), 'Approve') : null,
      r.status === 'pending' ? h('button.btn.danger.xs', { type: 'button', onclick: () => reject(r, view) }, 'Reject') : null,
      r.status !== 'pending' ? h('button.btn.secondary.xs', { type: 'button', onclick: async () => { const { link } = await call('admin.whatsappLink', { requestId: r.requestId }); window.open(link, '_blank', 'noopener'); } }, iconEl('whatsapp', 16), 'WhatsApp') : null)))) : h('div.empty.card', h('p.muted', 'No requests here.')));
}

async function showProof(r) {
  const s = openSheet({ title: 'Payment proof · ' + r.requestId, size: 'lg', content: () => h('div.empty', h('span.btn.ghost.loading', ' ')) });
  try {
    const { dataUrl } = await call('admin.proof', { requestId: r.requestId });
    s.set(h('div.stack', h('img.proof-img', { src: dataUrl, alt: 'Payment screenshot' }), h('p.subtle', `UPI ref ${r.paymentRef} · +91 ${r.phone}`)));
  } catch (e) { s.set(h('div.notice.danger', iconEl('alert', 18), h('span', e.message))); }
}

function approve(r, view) {
  const attempts = h('input.input', { type: 'number', min: 1, max: 50, value: String(CONFIG.defaults.maxAttempts), 'aria-label': 'Generations' });
  const expiry = h('input.input', { type: 'date', 'aria-label': 'Expiry (optional)' });
  const btn = h('button.btn.success.block', { type: 'button' }, 'Approve & issue code');
  const s = openSheet({
    title: 'Approve ' + r.requestId, size: 'sm',
    content: () => h('div.stack',
      h('p.muted', `Confirm you received the payment with UPI ref ${r.paymentRef}.`),
      h('div.grid-2', h('div.field', h('label', 'Generations'), attempts), h('div.field', h('label', 'Expires'), expiry)),
      btn)
  });
  btn.addEventListener('click', async () => {
    btn.classList.add('loading');
    try {
      const res = await call('admin.approve', { requestId: r.requestId, attempts: Number(attempts.value), expiresAt: expiry.value || '' });
      s.set(h('div.stack',
        h('div.notice.success', iconEl('check', 18), h('span', `Code issued${res.referral === 'verified' ? ' · referral counted for ' + r.referralCode : res.referral ? ' · referral not counted (' + res.referral.split(':')[1] + ')' : ''}`)),
        h('div.ref-code', h('b', res.token.code), h('button.btn.secondary.sm', { type: 'button', onclick: () => copy(res.token.code) }, iconEl('copy', 16), 'Copy')),
        res.delivery.sent ? h('p.muted', 'Sent through the WhatsApp Business API.') : h('a.btn.whatsapp.block', { href: res.delivery.link, target: '_blank', rel: 'noopener' }, iconEl('whatsapp', 20), 'Send code on WhatsApp'),
        h('button.btn.ghost.block', { type: 'button', onclick: () => s.close() }, 'Done')));
      requests(view);
    } catch (e) { toast(e.message, { tone: 'error' }); btn.classList.remove('loading'); }
  });
}

function reject(r, view) {
  const reason = h('input.input', { placeholder: 'e.g. Payment not found', 'aria-label': 'Reason' });
  const btn = h('button.btn.danger.block', { type: 'button' }, 'Reject request');
  const s = openSheet({ title: 'Reject ' + r.requestId, size: 'sm', content: () => h('div.stack', h('div.field', h('label', 'Reason (sent to the student)'), reason), btn) });
  btn.addEventListener('click', async () => {
    btn.classList.add('loading');
    try {
      const res = await call('admin.reject', { requestId: r.requestId, reason: reason.value });
      s.set(h('div.stack', h('div.notice.warn', iconEl('info', 18), h('span', 'Request rejected.')),
        res.delivery.sent ? null : h('a.btn.whatsapp.block', { href: res.delivery.link, target: '_blank', rel: 'noopener' }, iconEl('whatsapp', 20), 'Tell the student on WhatsApp'),
        h('button.btn.ghost.block', { type: 'button', onclick: () => s.close() }, 'Done')));
      requests(view);
    } catch (e) { toast(e.message, { tone: 'error' }); btn.classList.remove('loading'); }
  });
}

/* ---------- codes ---------- */
async function codes(view) {
  const { items } = await call('admin.tokens');
  const count = h('input.input', { type: 'number', min: 1, max: 50, value: '1', 'aria-label': 'How many' });
  const attempts = h('input.input', { type: 'number', min: 1, max: 50, value: String(CONFIG.defaults.maxAttempts), 'aria-label': 'Generations each' });
  const expiry = h('input.input', { type: 'date', 'aria-label': 'Expiry' });
  const note = h('input.input', { placeholder: 'e.g. Campus promo', maxlength: 120, 'aria-label': 'Note' });
  const out = h('div');
  const createBtn = h('button.btn.primary', { type: 'submit' }, iconEl('plus', 18), 'Create codes');
  const form = h('form.card.stack', {
    onsubmit: async (e) => {
      e.preventDefault();
      createBtn.classList.add('loading');
      try {
        const res = await call('admin.tokens.create', { count: Number(count.value), attempts: Number(attempts.value), expiresAt: expiry.value, note: note.value });
        const text = res.items.map((t) => t.code).join('\n');
        out.replaceChildren(h('div.stack.sm', h('div.codes-out', text), h('button.btn.secondary.sm', { type: 'button', style: { alignSelf: 'flex-start' }, onclick: () => copy(text, 'Codes copied') }, iconEl('copy', 16), 'Copy all')));
        renderTable(await call('admin.tokens'));
      } catch (e2) { toast(e2.message, { tone: 'error' }); }
      finally { createBtn.classList.remove('loading'); }
    }
  },
  h('h2.title', 'Create promotional codes'),
  h('div.grid-2', h('div.field', h('label', 'How many'), count), h('div.field', h('label', 'Generations each'), attempts)),
  h('div.grid-2', h('div.field', h('label', 'Expires (optional)'), expiry), h('div.field', h('label', 'Note'), note)),
  createBtn, out);

  const tableHost = h('div');
  const renderTable = ({ items: list }) => {
    const statusTone = { active: 'success', disabled: 'danger', expired: 'warn' };
    tableHost.replaceChildren(h('div.table-wrap', h('table.data',
      h('thead', h('tr', ['Code', 'Left', 'Status', 'Expires', 'Docs', 'Source', 'Last used', ''].map((x) => h('th', x)))),
      h('tbody', list.map((t) => h('tr',
        h('td', h('button.btn.ghost.xs.mono', { type: 'button', onclick: () => copy(t.code) }, t.code)),
        h('td', `${t.remaining} / ${t.total}`),
        h('td', h('span.badge.' + (statusTone[t.status] || 'neutral'), t.status)),
        h('td', t.expiresAt || '—'),
        h('td', String(t.documents)),
        h('td', t.source + (t.note ? ' · ' + t.note : '')),
        h('td', fmt(t.lastUsedAt)),
        h('td', h('div.actions',
          t.status === 'disabled'
            ? h('button.btn.secondary.xs', { type: 'button', onclick: () => op(t.code, 'enable') }, 'Enable')
            : h('button.btn.danger.xs', { type: 'button', onclick: () => op(t.code, 'disable') }, 'Disable'),
          h('button.btn.secondary.xs', { type: 'button', onclick: async () => { if (await confirmSheet({ title: 'Reset ' + t.code + '?', message: 'Used generations go back to 0.', confirm: 'Reset' })) op(t.code, 'reset'); } }, 'Reset'),
          h('button.btn.secondary.xs', { type: 'button', onclick: () => editToken(t) }, 'Edit')))))))));
  };
  const op = async (code, o, value) => {
    try { await call('admin.tokens.update', { code, op: o, value }); toast('Updated', { tone: 'success' }); renderTable(await call('admin.tokens')); }
    catch (e) { toast(e.message, { tone: 'error' }); }
  };
  const editToken = (t) => {
    const total = h('input.input', { type: 'number', min: 0, max: 500, value: String(t.total), 'aria-label': 'Total generations' });
    const exp = h('input.input', { type: 'date', value: t.expiresAt || '', 'aria-label': 'Expiry' });
    const s = openSheet({
      title: 'Edit ' + t.code, size: 'sm',
      content: () => h('div.stack',
        h('div.grid-2', h('div.field', h('label', 'Total generations'), total), h('div.field', h('label', 'Expires'), exp)),
        h('p.subtle', `${t.used} used so far.`),
        h('button.btn.primary.block', { type: 'button', onclick: async () => { await op(t.code, 'setAttempts', Number(total.value)); await op(t.code, 'setExpiry', exp.value); s.close(); } }, 'Save'))
    });
  };
  renderTable({ items });
  fill(view, form, h('h2.title', `All codes (${items.length})`), tableHost);
}

/* ---------- referrals ---------- */
async function referrals(view) {
  const { items } = await call('admin.referrals');
  fill(view, items.length ? h('div.rows', items.map((r) => h('div.card.req',
    h('div.top', h('b.mono', r.referralCode), h('span.badge.success', `${r.verified} verified`), r.pending ? h('span.badge.warn', `${r.pending} pending`) : null,
      h('span.subtle', r.ownerPhone ? '+91 ' + r.ownerPhone : r.ownerCode || '')),
    h('div.progress-track', { style: { '--n': r.target } }, Array.from({ length: r.target }, (_, i) => h('i' + (i < r.progress ? '.on' : '')))),
    r.rewards.length ? h('div.stack.sm', r.rewards.map((w) => h('div.row.between',
      h('span', `₹${w.amountInr} · earned ${fmt(w.createdAt)}`),
      w.status === 'paid' ? h('span.badge.success', 'Paid ' + fmt(w.paidAt))
        : h('button.btn.success.xs', { type: 'button', onclick: async () => { await call('admin.rewards.paid', { rewardId: w.id }); toast('Marked as paid', { tone: 'success' }); referrals(view); } }, 'Mark paid')))) : h('p.subtle', 'No reward earned yet.')))) : h('div.empty.card', h('p.muted', 'No referrals yet.')));
}

try { startAurora(document.getElementById('aurora'), CONFIG.aurora); } catch { /* decorative */ }
if (token) shell(); else login();
