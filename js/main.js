/**
 * Medico Gen — application entry: boot, access gate, shell and hash router.
 */
import { CONFIG } from './config.js';
import { api, ApiError, isMock } from './core/api.js';
import { session, captureReferral } from './core/session.js';
import { $, $$, h, clear, fill } from './core/dom.js';
import { haptic } from './core/haptics.js';
import { icon, iconEl } from './ui/icons.js';
import { toast } from './ui/toast.js';
import { startAurora } from './ui/aurora.js';
import { app } from './core/state.js';
import { openAccessSheet } from './views/access.js';
import { openReferralSheet } from './views/referral.js';
import { renderLanding, prefetchEngine } from './views/landing.js';

const ROUTES = {
  home: () => import('./views/home.js'),
  create: () => import('./views/create.js'),
  letter: () => import('./views/letter-wizard.js'),
  demo: () => import('./views/demo-wizard.js'),
  studio: () => import('./views/studio.js'),
  history: () => import('./views/history.js')
};
const FOCUS_ROUTES = new Set(['letter', 'demo', 'studio']);

let cleanup = null;
let renderSeq = 0;

function parseHash() {
  const [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || '', param: rest.join('/') || null };
}

export function navigate(path, { replace = false } = {}) {
  const target = '#/' + path.replace(/^#?\/?/, '');
  if (replace) history.replaceState(null, '', target);
  else if (location.hash !== target) { location.hash = target; return; }
  route();
}

async function route() {
  const { name, param } = parseHash();
  if (!app.token) {
    showLanding();
    return;
  }
  const routeName = ROUTES[name] ? name : 'home';
  if (!ROUTES[name]) history.replaceState(null, '', '#/home');
  showApp();
  const seq = ++renderSeq;
  const mod = await ROUTES[routeName]();
  if (seq !== renderSeq) return;
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  const view = $('#view');
  view.className = FOCUS_ROUTES.has(routeName) ? 'focus' + (routeName === 'studio' ? ' studio' : '') : '';
  clear(view);
  $('#tabbar').classList.toggle('hide', FOCUS_ROUTES.has(routeName));
  $$('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === routeName));
  const container = h('div.view-enter');
  view.append(container);
  cleanup = (await mod.render(container, { param, navigate })) || null;
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function showLanding() {
  $('#app').hidden = true;
  $('#landing').hidden = false;
  renderLanding();
}

function showApp() {
  $('#landing').hidden = true;
  $('#app').hidden = false;
}

/* ---------- shell ---------- */

function renderAllowance() {
  const pill = $('#allowance');
  const t = app.token;
  if (!t) return;
  const dots = Array.from({ length: Math.min(t.total, 6) }, (_, i) => h('i' + (i < t.remaining ? '.on' : '')));
  fill(pill, h('span.dots', dots), h('span', t.remaining === 1 ? '1 left' : `${t.remaining} left`));
  pill.classList.toggle('empty', t.remaining === 0);
  pill.setAttribute('aria-label', `${t.remaining} of ${t.total} generations left`);
}

function buildShell() {
  $('#share').innerHTML = icon('gift', 20);
  $('#share').addEventListener('click', () => { haptic('tap'); openReferralSheet(); });
  $('#allowance').addEventListener('click', () => { haptic('select'); openAllowanceSheet(); });
  const labels = { home: ['home', 'Home'], create: ['plus', 'Create'], history: ['history', 'History'] };
  $$('#tabbar button').forEach((b) => {
    const [ic, label] = labels[b.dataset.tab];
    b.append(iconEl(ic, b.dataset.tab === 'create' ? 26 : 22), h('span', label));
    b.setAttribute('aria-label', label);
    b.addEventListener('click', () => { haptic('select'); navigate(b.dataset.tab); });
  });
  $$('[data-action=start]').forEach((b) => b.addEventListener('click', () => { haptic('tap'); startAccess(); }));
  app.subscribe(renderAllowance);
}

async function openAllowanceSheet() {
  const { openSheet } = await import('./ui/sheet.js');
  const t = app.token;
  const s = openSheet({
    title: 'Your access',
    size: 'sm',
    content: () => h('div.stack',
      h('div.card.flat.stack.sm',
        h('div.row.between', h('span.subtle', 'Access code'), h('span.mono', t.code)),
        h('div.row.between', h('span.subtle', 'Generations left'), h('b', `${t.remaining} of ${t.total}`)),
        t.expiresAt ? h('div.row.between', h('span.subtle', 'Valid until'), h('b', t.expiresAt)) : null),
      h('p.subtle', 'Every new AI letter or demo template uses one generation. Editing, switching styles and downloading are free.'),
      h('button.btn.secondary.block', { type: 'button', onclick: () => { s.close(); openAccessSheet({ mode: 'request', onUnlocked }); } }, iconEl('key', 18), 'Get another code'),
      h('button.btn.ghost.block', { type: 'button', onclick: () => { s.close(); session.signOut(); app.setToken(null); toast('Signed out on this device'); navigate('', { replace: true }); } }, iconEl('logout', 18), 'Use a different code'))
  });
}

/* ---------- access ---------- */

function onUnlocked(token) {
  app.setToken(token);
  haptic('success');
  navigate('home');
}

function startAccess() {
  if (app.token) { navigate('home'); return; }
  openAccessSheet({ onUnlocked });
}

async function boot() {
  captureReferral();
  try { startAurora($('#aurora'), CONFIG.aurora); } catch { /* decorative */ }
  buildShell();
  if (isMock) console.info('%cMedico Gen mock mode', 'font-weight:bold', '— test code', CONFIG.mockCode, '· admin password "admin" at admin.html');

  const code = session.code;
  if (code) {
    try {
      const data = await api('access.validate', { code, sessionId: session.id });
      app.setConfig(data.config);
      app.setToken(data.token);
    } catch (e) {
      if (e instanceof ApiError && /^CODE_/.test(e.code)) {
        session.signOut();
        toast(e.message, { tone: 'error' });
      } else if (session.token) {
        app.setToken(session.token); // offline: show cached state; the server re-checks before any generation
        toast('Offline — showing your last known status', { tone: 'neutral' });
      }
    }
  }
  window.addEventListener('hashchange', route);
  await route();
  const b = $('#boot');
  b.classList.add('gone');
  setTimeout(() => b.remove(), 450);
  if (!app.token) prefetchEngine();
}

boot();

export { onUnlocked };
