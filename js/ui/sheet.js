/**
 * Bottom sheet (phones) / centred floating panel (desktop). Glass surface, drag-to-dismiss handle,
 * Escape to close, focus kept inside, background made inert, keyboard-aware via visualViewport.
 */
import { h, prefersReducedMotion } from '../core/dom.js';
import { iconEl } from './icons.js';
import { haptic } from '../core/haptics.js';

const stack = [];

export function openSheet({ title, content, onClose, dismissible = true, size = 'md', label }) {
  const body = h('div.sheet-body');
  const titleEl = title ? h('h2.sheet-title', { id: 'sheet-t-' + stack.length }, title) : null;
  const closeBtn = dismissible ? h('button.icon-btn.sheet-close', { type: 'button', 'aria-label': 'Close', onclick: () => close() }, iconEl('close', 20)) : null;
  const panel = h('div.sheet.glass-strong.size-' + size, {
    role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleEl ? titleEl.id : null, 'aria-label': titleEl ? null : (label || 'Dialog'), tabindex: '-1'
  },
  h('div.sheet-grab', { 'aria-hidden': 'true' }, h('span')),
  (titleEl || closeBtn) ? h('div.sheet-head', titleEl || h('span'), closeBtn) : null,
  body);
  const scrim = h('div.sheet-scrim', { onclick: () => dismissible && close() });
  const root = h('div.sheet-root', scrim, panel);
  document.body.append(root);

  const app = document.getElementById('app');
  const landing = document.getElementById('landing');
  if (stack.length === 0) [app, landing].forEach((el) => el && (el.inert = true));
  stack.push(root);

  const set = (node) => { body.replaceChildren(...[].concat(node)); };
  set(typeof content === 'function' ? content({ close, set }) : content);

  requestAnimationFrame(() => {
    root.classList.add('open');
    const first = panel.querySelector('input:not([type=hidden]),textarea,button:not(.sheet-close),[tabindex="0"]');
    (first && matchMedia('(min-width: 720px)').matches ? first : panel).focus({ preventScroll: true });
  });

  const onKey = (e) => {
    if (e.key === 'Escape' && dismissible && stack[stack.length - 1] === root) close();
    if (e.key === 'Tab') trap(e, panel);
  };
  document.addEventListener('keydown', onKey);

  // keyboard awareness: keep the panel above the on-screen keyboard
  const vv = window.visualViewport;
  const onVV = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    panel.style.setProperty('--kb', kb + 'px');
  };
  vv && vv.addEventListener('resize', onVV);

  // drag to dismiss
  let startY = null, dy = 0;
  const grab = panel.querySelector('.sheet-grab');
  const head = panel.querySelector('.sheet-head');
  [grab, head].forEach((el) => el && el.addEventListener('pointerdown', (e) => {
    if (!dismissible || e.target.closest('button')) return;
    startY = e.clientY; dy = 0; panel.setPointerCapture(e.pointerId); panel.classList.add('dragging');
  }));
  panel.addEventListener('pointermove', (e) => {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
    panel.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (startY === null) return;
    startY = null; panel.classList.remove('dragging'); panel.style.transform = '';
    if (dy > 110) close();
  };
  panel.addEventListener('pointerup', end);
  panel.addEventListener('pointercancel', end);

  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    vv && vv.removeEventListener('resize', onVV);
    root.classList.remove('open');
    root.classList.add('closing');
    const i = stack.indexOf(root);
    if (i >= 0) stack.splice(i, 1);
    if (stack.length === 0) [app, landing].forEach((el) => el && (el.inert = false));
    setTimeout(() => root.remove(), prefersReducedMotion() ? 0 : 320);
    onClose && onClose(result);
  }
  return { close, set, panel, body };
}

function trap(e, panel) {
  const f = [...panel.querySelectorAll('button,input,textarea,select,a[href],[tabindex="0"]')].filter((x) => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export function confirmSheet({ title, message, confirm = 'Continue', cancel = 'Cancel', tone = 'primary' }) {
  return new Promise((resolve) => {
    const s = openSheet({
      title, size: 'sm', onClose: (r) => resolve(!!r),
      content: () => h('div.stack',
        h('p.muted', message),
        h('div.row.end.gap',
          h('button.btn.ghost', { type: 'button', onclick: () => s.close(false) }, cancel),
          h('button.btn.' + tone, { type: 'button', onclick: () => { haptic('tap'); s.close(true); } }, confirm)))
    });
  });
}
