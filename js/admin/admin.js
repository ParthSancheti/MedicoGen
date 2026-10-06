/**
 * Medico Gen admin console. The password is checked by the backend (ADMIN_PASSWORD script
 * property); this page only ever holds the short-lived session token it returns.
 *
 * Layout: sidebar navigation on desktop, bottom tab bar on phones. Lists are cards on phones and
 * dense rows on wide screens (same markup, CSS decides).
 */
import { CONFIG } from '../config.js';
import { api, isMock } from '../core/api.js';
import { h, clear, fill, debounce } from '../core/dom.js';
import { iconEl } from '../ui/icons.js';
import { openSheet, confirmSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { startAurora } from '../ui/aurora.js';
import { haptic } from '../core/haptics.js';

const root = document.getElementById('admin');
const KEY = 'mg.admin';
let token = sessionStorage.getItem(KEY);
let tab = sessionStorage.getItem('mg.admin.tab') || 'overview';
let reqFilter = 'pending';
let codeFilter = 'all';
let pendingCount = 0;

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'home' },
  { id: 'requests', label: 'Requests', icon: 'history' },
  { id: 'codes', label: 'Codes', icon: 'key' },
  { id: 'referrals', label: 'Referrals', icon: 'gift' }
];

const call = async (action, params = {}) => {
  try {
    return await api(action, { adminToken: token, ...params });
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') { token = null; sessionStorage.removeItem(KEY); login(); }
    throw e;
  }
};

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const ago = (iso) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : fmt(iso);
};
const copy = async (text, msg = 'Copied') => { try { await navigator.clipboard.writeText(text); toast(msg, { tone: 'success' }); haptic('select'); } catch { toast('Copy not available'); } };
const loading = () => h('div.empty', h('span.btn.ghost.loading', ' '));
const empty = (icon, text) => h('div.empty.card', h('div.art', iconEl(icon, 26)), h('p.muted', text));

/* ---------- login ---------- */
function login() {
  const pw = h('input.input', { type: 'password', autocomplete: 'current-password', placeholder: 'Admin password', 'aria-label': 'Admin password' });
  const err = h('p.err', { role: 'alert' });
  const btn = h('button.btn.primary.block', { type: 'submit' }, 'Sign in');
  fill(root, h('div.login', h('form.card.pad-lg.stack.lg.glass-strong', {
    onsubmit: async (e) => {
      e.preventDefault();
      btn.classList.add('loading'); err.textContent = '';
      try {
        const res = await api('admin.login', { password: pw.value });
        token = res.adminToken;
        sessionStorage.setItem(KEY, token);
        haptic('success');
        shell();
      } catch (e2) { err.textContent = e2.message; haptic('error'); }
      finally { btn.classList.remove('loading'); }
    }
  },
  h('div.access-hero', h('img', { src: 'assets/brand/logo-mark.png', alt: '' }), h('h1.title-lg', 'Admin console'), h('p.muted', CONFIG.appName + ' operations')),
  isMock ? h('div.notice', iconEl('info', 18), h('span', 'Mock mode — the local mock password is ', h('b', 'admin'), '. Real deployments verify ADMIN_PASSWORD on the server.')) : null,
  h('div.field', pw, err), btn)));
  pw.focus();
}

/* ---------- shell ---------- */
let view, titleEl, actionsEl, navEls = [];

function shell() {
  view = h('div.adm-view');
  titleEl = h('h1.adm-title');
  actionsEl = h('div.adm-actions');
  const signOut = () => { sessionStorage.removeItem(KEY); token = null; login(); };
  const navItem = (t, cls) => {
    const b = h('button.adm-nav-item' + cls, { type: 'button', 'data-tab': t.id, onclick: () => go(t.id) },
      iconEl(t.icon, 20), h('span', t.label), h('span.adm-count', { hidden: true }));
    return b;
  };
  const side = h('nav.adm-side.glass-strong', { 'aria-label': 'Admin sections' },
    h('a.brand', { href: './' }, h('img', { src: 'assets/brand/logo-mark.png', alt: '' }), h('span', 'Medico Gen')),
    h('span.adm-side-label', 'Admin'),
    ...TABS.map((t) => navItem(t, '')),
    h('div.grow'),
    isMock ? h('span.badge.warn', { style: { alignSelf: 'flex-start' } }, 'Mock mode') : null,
    h('button.adm-nav-item', { type: 'button', onclick: signOut }, iconEl('logout', 20), h('span', 'Sign out')));
  const bottom = h('nav.adm-bottom.glass-strong', { 'aria-label': 'Admin sections' }, ...TABS.map((t) => navItem(t, '.mini')));
  const mobileHead = h('header.adm-mhead.glass-strong',
    h('img', { src: 'assets/brand/logo-mark.png', alt: '' }),
    h('b', 'Admin'),
    isMock ? h('span.badge.warn', 'Mock') : null,
    h('span.grow'),
    h('button.icon-btn', { type: 'button', 'aria-label': 'Sign out', onclick: signOut }, iconEl('logout', 18)));
  fill(root, h('div.adm', side, mobileHead,
    h('main.adm-main', h('div.adm-head', titleEl, actionsEl), view),
    bottom));
  navEls = [...root.querySelectorAll('.adm-nav-item[data-tab]')];
  go(tab, true);
  refreshCount();
}

function go(id, quiet) {
  tab = id;
  sessionStorage.setItem('mg.admin.tab', id);
  if (!quiet) haptic('select');
  navEls.forEach((b) => { const on = b.dataset.tab === id; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  titleEl.textContent = TABS.find((t) => t.id === id).label;
  clear(actionsEl);
  fill(view, loading());
  ({ overview, requests, codes, referrals })[id]().catch((e) => fill(view, h('div.notice.danger', iconEl('alert', 18), h('span', e.message))));
  window.scrollTo({ top: 0 });
}

async function refreshCount() {
  try {
    const s = await call('admin.stats');
    pendingCount = s.requestsPending;
    navEls.filter((b) => b.dataset.tab === 'requests').forEach((b) => {
      const c = b.querySelector('.adm-count');
      c.hidden = !pendingCount;
      c.textContent = String(pendingCount);
    });
  } catch { /* badge is optional */ }
}

/* ---------- overview ---------- */
async function overview() {
  const s = await call('admin.stats');
  const tile = (label, value, icon, tone, onclick) => h(onclick ? 'button.adm-stat.card' : 'div.adm-stat.card', { type: onclick ? 'button' : undefined, onclick },
    h('span.adm-stat-ic.tone-' + tone, iconEl(icon, 20)), h('b', String(value)), h('span', label));
  fill(view,
    s.aiConfigured ? null : h('div.notice.warn', iconEl('alert', 18), h('span', 'MISTRAL_API_KEY is not set on the server — every letter uses the built-in standard letter.')),
    h('section.adm-stats',
      tile('Pending requests', s.requestsPending, 'history', 'warn', () => { reqFilter = 'pending'; go('requests'); }),
      tile('Active codes', s.codesActive, 'key', 'accent', () => { codeFilter = 'active'; go('codes'); }),
      tile('Generations used', s.generationsUsed, 'doc', 'accent'),
      tile('Generations today', s.generationsToday, 'calendar', 'accent'),
      tile('Written by Mistral', s.aiGenerations, 'sparkle', 'success'),
      tile('Standard fallback', s.fallbackGenerations, 'shield', 'neutral'),
      tile('Verified referrals', s.referralsVerified, 'user', 'success', () => go('referrals')),
      tile('Rewards to pay', s.rewardsUnpaid, 'gift', s.rewardsUnpaid ? 'warn' : 'neutral', () => go('referrals'))),
    h('section.card.adm-quick',
      h('h2.title', 'Quick actions'),
      h('div.adm-quick-grid',
        h('button.btn.primary', { type: 'button', onclick: () => { reqFilter = 'pending'; go('requests'); } }, iconEl('check', 18), s.requestsPending ? `Review ${s.requestsPending} request${s.requestsPending > 1 ? 's' : ''}` : 'Open requests'),
        h('button.btn.secondary', { type: 'button', onclick: () => createCodesSheet() }, iconEl('plus', 18), 'Create codes'),
        h('button.btn.secondary', { type: 'button', onclick: () => go('referrals') }, iconEl('gift', 18), 'Referral rewards'))));
}

/* ---------- requests ---------- */
async function requests() {
  const search = h('input.input.adm-search', { type: 'search', placeholder: 'Search phone, UTR or request ID', 'aria-label': 'Search requests' });
  const chips = h('div.chips.adm-filter');
  const list = h('div.adm-list');
  fill(actionsEl, h('button.icon-btn', { type: 'button', 'aria-label': 'Refresh', onclick: () => load() }, iconEl('refresh', 18)));
  fill(view, h('div.adm-toolbar', chips, search), list);
  let items = [];
  const drawChips = () => fill(chips, ...['pending', 'approved', 'rejected', 'all'].map((f) =>
    h('button.chip' + (reqFilter === f ? '.on' : ''), { type: 'button', onclick: () => { reqFilter = f; drawChips(); load(); } }, f[0].toUpperCase() + f.slice(1), f === 'pending' && pendingCount ? ` · ${pendingCount}` : '')));
  const tone = { pending: 'warn', approved: 'success', rejected: 'danger' };
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const shown = items.filter((r) => !q || [r.requestId, r.phone, r.paymentRef, r.issuedCode || '', r.referralCode || ''].join(' ').toLowerCase().includes(q));
    fill(list, ...(shown.length ? shown.map((r) => h('article.card.adm-req',
      h('div.adm-req-top',
        h('b.mono', r.requestId),
        h('span.badge.' + tone[r.status], r.status),
        h('span.subtle.small', ago(r.createdAt))),
      h('dl.adm-kv',
        h('div', h('dt', 'Phone'), h('dd', h('a', { href: 'tel:+91' + r.phone }, '+91 ' + r.phone))),
        h('div', h('dt', 'UPI ref'), h('dd.mono', r.paymentRef)),
        h('div', h('dt', 'Referral'), h('dd', r.referralCode || '—')),
        r.issuedCode ? h('div', h('dt', 'Code'), h('dd', h('button.btn.ghost.xs.mono', { type: 'button', onclick: () => copy(r.issuedCode) }, r.issuedCode))) : null,
        r.note ? h('div.wide', h('dt', 'Note'), h('dd', r.note)) : null),
      h('div.adm-req-acts',
        r.hasProof ? h('button.btn.secondary.sm', { type: 'button', onclick: () => showProof(r) }, iconEl('image', 16), 'Proof') : null,
        r.status === 'pending' ? h('button.btn.danger.sm', { type: 'button', onclick: () => reject(r, load) }, 'Reject') : null,
        r.status === 'pending' ? h('button.btn.success.sm', { type: 'button', onclick: () => approve(r, load) }, iconEl('check', 16), 'Approve') : null,
        r.status !== 'pending' ? h('button.btn.secondary.sm', { type: 'button', onclick: async () => { const { link } = await call('admin.whatsappLink', { requestId: r.requestId }); window.open(link, '_blank', 'noopener'); } }, iconEl('whatsapp', 16), 'WhatsApp') : null)))
      : [empty('history', q ? 'No requests match your search.' : 'No requests here.')]));
  };
  const load = async () => {
    fill(list, loading());
    ({ items } = await call('admin.requests', { status: reqFilter === 'all' ? '' : reqFilter }));
    draw();
    refreshCount().then(drawChips);
  };
  search.addEventListener('input', debounce(draw, 120));
  drawChips();
  await load();
}

async function showProof(r) {
  const s = openSheet({ title: 'Payment proof · ' + r.requestId, size: 'lg', content: () => loading() });
  try {
    const { dataUrl } = await call('admin.proof', { requestId: r.requestId });
    s.set(h('div.stack', h('img.proof-img', { src: dataUrl, alt: 'Payment screenshot' }), h('p.subtle', `UPI ref ${r.paymentRef} · +91 ${r.phone}`)));
  } catch (e) { s.set(h('div.notice.danger', iconEl('alert', 18), h('span', e.message))); }
}

function approve(r, done) {
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
      haptic('success');
      s.set(h('div.stack',
        h('div.notice.success', iconEl('check', 18), h('span', `Code issued${res.referral === 'verified' ? ' · referral counted for ' + r.referralCode : res.referral ? ' · referral not counted (' + res.referral.split(':')[1] + ')' : ''}`)),
        h('div.ref-code', h('b', res.token.code), h('button.btn.secondary.sm', { type: 'button', onclick: () => copy(res.token.code) }, iconEl('copy', 16), 'Copy')),
        res.delivery.sent ? h('p.muted', 'Sent through the WhatsApp Business API.') : h('a.btn.whatsapp.block', { href: res.delivery.link, target: '_blank', rel: 'noopener' }, iconEl('whatsapp', 20), 'Send code on WhatsApp'),
        h('button.btn.ghost.block', { type: 'button', onclick: () => s.close() }, 'Done')));
      done();
    } catch (e) { toast(e.message, { tone: 'error' }); btn.classList.remove('loading'); }
  });
}

function reject(r, done) {
  const reason = h('input.input', { placeholder: 'e.g. Payment not found', 'aria-label': 'Reason' });
  const quick = h('div.chips', ['Payment not found', 'Amount mismatch', 'Screenshot unclear'].map((q) =>
    h('button.chip', { type: 'button', onclick: () => { reason.value = q; haptic('select'); } }, q)));
  const btn = h('button.btn.danger.block', { type: 'button' }, 'Reject request');
  const s = openSheet({ title: 'Reject ' + r.requestId, size: 'sm', content: () => h('div.stack', h('div.field', h('label', 'Reason (sent to the student)'), reason, quick), btn) });
  btn.addEventListener('click', async () => {
    btn.classList.add('loading');
    try {
      const res = await call('admin.reject', { requestId: r.requestId, reason: reason.value });
      s.set(h('div.stack', h('div.notice.warn', iconEl('info', 18), h('span', 'Request rejected.')),
        res.delivery.sent ? null : h('a.btn.whatsapp.block', { href: res.delivery.link, target: '_blank', rel: 'noopener' }, iconEl('whatsapp', 20), 'Tell the student on WhatsApp'),
        h('button.btn.ghost.block', { type: 'button', onclick: () => s.close() }, 'Done')));
      done();
    } catch (e) { toast(e.message, { tone: 'error' }); btn.classList.remove('loading'); }
  });
}

/* ---------- codes ---------- */
function createCodesSheet(after) {
  const count = h('input.input', { type: 'number', min: 1, max: 50, value: '1', 'aria-label': 'How many' });
  const attempts = h('input.input', { type: 'number', min: 1, max: 50, value: String(CONFIG.defaults.maxAttempts), 'aria-label': 'Generations each' });
  const expiry = h('input.input', { type: 'date', 'aria-label': 'Expiry' });
  const note = h('input.input', { placeholder: 'e.g. Campus promo', maxlength: 120, 'aria-label': 'Note' });
  const btn = h('button.btn.primary.block', { type: 'submit' }, iconEl('plus', 18), 'Create codes');
  const s = openSheet({
    title: 'Create promotional codes',
    content: () => h('form.stack', {
      onsubmit: async (e) => {
        e.preventDefault();
        btn.classList.add('loading');
        try {
          const res = await call('admin.tokens.create', { count: Number(count.value), attempts: Number(attempts.value), expiresAt: expiry.value, note: note.value });
          const text = res.items.map((t) => t.code).join('\n');
          haptic('success');
          s.set(h('div.stack',
            h('div.notice.success', iconEl('check', 18), h('span', `${res.items.length} code${res.items.length > 1 ? 's' : ''} · ${attempts.value} generations each`)),
            h('div.codes-out', text),
            h('button.btn.primary.block', { type: 'button', onclick: () => copy(text, 'Codes copied') }, iconEl('copy', 18), 'Copy all'),
            h('button.btn.ghost.block', { type: 'button', onclick: () => s.close() }, 'Done')));
          after && after();
        } catch (e2) { toast(e2.message, { tone: 'error' }); btn.classList.remove('loading'); }
      }
    },
    h('div.grid-2', h('div.field', h('label', 'How many'), count), h('div.field', h('label', 'Generations each'), attempts)),
    h('div.grid-2', h('div.field', h('label', 'Expires (optional)'), expiry), h('div.field', h('label', 'Note'), note)),
    btn)
  });
}

async function codes() {
  const search = h('input.input.adm-search', { type: 'search', placeholder: 'Search code or note', 'aria-label': 'Search codes' });
  const chips = h('div.chips.adm-filter');
  const list = h('div.adm-list.adm-codes');
  fill(actionsEl, h('button.btn.primary.sm', { type: 'button', onclick: () => createCodesSheet(load) }, iconEl('plus', 16), 'New codes'));
  fill(view, h('div.adm-toolbar', chips, search), list);
  let items = [];
  const statusTone = { active: 'success', disabled: 'danger', expired: 'warn' };
  const drawChips = () => fill(chips, ...[['all', 'All'], ['active', 'Active'], ['used', 'Used up'], ['disabled', 'Disabled'], ['expired', 'Expired']].map(([f, l]) =>
    h('button.chip' + (codeFilter === f ? '.on' : ''), { type: 'button', onclick: () => { codeFilter = f; drawChips(); draw(); } }, l)));
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const shown = items.filter((t) => (codeFilter === 'all' || (codeFilter === 'used' ? t.remaining === 0 && t.status === 'active' : codeFilter === 'active' ? t.status === 'active' && t.remaining > 0 : t.status === codeFilter))
      && (!q || (t.code + ' ' + (t.note || '') + ' ' + t.source).toLowerCase().includes(q)));
    fill(list,
      h('div.adm-code.adm-code-head', h('span', 'Code'), h('span', 'Left'), h('span', 'Status'), h('span', 'Expires'), h('span', 'Docs'), h('span', 'Last used'), h('span')),
      ...(shown.length ? shown.map((t) => h('article.adm-code.card',
        h('div.adm-code-id', h('button.btn.ghost.xs.mono', { type: 'button', onclick: () => copy(t.code) }, t.code), h('span.subtle.small', t.source + (t.note ? ' · ' + t.note : ''))),
        h('div.adm-meter', { title: `${t.used} used of ${t.total}` },
          h('b', `${t.remaining}/${t.total}`),
          h('i', h('span', { style: { width: (t.total ? (t.remaining / t.total) * 100 : 0) + '%' } }))),
        h('div', h('span.badge.' + (statusTone[t.status] || 'neutral'), t.status)),
        h('div.small', h('span.adm-k', 'Expires '), t.expiresAt || '—'),
        h('div.small', h('span.adm-k', 'Docs '), String(t.documents)),
        h('div.small', h('span.adm-k', 'Last used '), t.lastUsedAt ? ago(t.lastUsedAt) : '—'),
        h('div.adm-code-acts',
          t.status === 'disabled'
            ? h('button.btn.secondary.xs', { type: 'button', onclick: () => op(t.code, 'enable') }, 'Enable')
            : h('button.btn.danger.xs', { type: 'button', onclick: () => op(t.code, 'disable') }, 'Disable'),
          h('button.btn.secondary.xs', { type: 'button', onclick: async () => { if (await confirmSheet({ title: 'Reset ' + t.code + '?', message: 'Used generations go back to 0.', confirm: 'Reset' })) op(t.code, 'reset'); } }, 'Reset'),
          h('button.btn.secondary.xs', { type: 'button', onclick: () => editToken(t) }, 'Edit'))))
        : [empty('key', 'No codes match.')]));
  };
  const op = async (code, o, value) => {
    try { await call('admin.tokens.update', { code, op: o, value }); toast('Updated', { tone: 'success' }); await load(); }
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
        h('button.btn.primary.block', { type: 'button', onclick: async () => {
          await call('admin.tokens.update', { code: t.code, op: 'setAttempts', value: Number(total.value) });
          await call('admin.tokens.update', { code: t.code, op: 'setExpiry', value: exp.value });
          toast('Saved', { tone: 'success' }); s.close(); load();
        } }, 'Save'))
    });
  };
  const load = async () => { ({ items } = await call('admin.tokens')); draw(); };
  search.addEventListener('input', debounce(draw, 120));
  drawChips();
  await load();
}

/* ---------- referrals ---------- */
async function referrals() {
  const { items } = await call('admin.referrals');
  fill(view, items.length ? h('div.adm-list.adm-grid', items.map((r) => h('article.card.adm-req',
    h('div.adm-req-top', h('b.mono', r.referralCode), h('span.badge.success', `${r.verified} verified`), r.pending ? h('span.badge.warn', `${r.pending} pending`) : null),
    h('p.subtle.small', r.ownerPhone ? 'Owner +91 ' + r.ownerPhone : r.ownerCode ? 'Owner code ' + r.ownerCode : ''),
    h('div.progress-track', { style: { '--n': r.target } }, Array.from({ length: r.target }, (_, i) => h('i' + (i < r.progress ? '.on' : '')))),
    r.rewards.length ? h('div.stack.sm', r.rewards.map((w) => h('div.row.between',
      h('span.small', `₹${w.amountInr} · ${fmt(w.createdAt)}`),
      w.status === 'paid' ? h('span.badge.success', 'Paid')
        : h('button.btn.success.xs', { type: 'button', onclick: async () => { await call('admin.rewards.paid', { rewardId: w.id }); toast('Marked as paid', { tone: 'success' }); referrals(); } }, 'Mark paid')))) : h('p.subtle.small', 'No reward earned yet.'))))
    : empty('gift', 'No referrals yet.'));
}

try { startAurora(document.getElementById('aurora'), CONFIG.aurora); } catch { /* decorative */ }
if (token) shell(); else login();
