import { h } from '../core/dom.js';
import { iconEl } from './icons.js';

let host;
export function toast(message, { tone = 'neutral', icon = tone === 'error' ? 'alert' : tone === 'success' ? 'check' : 'info', ms = 3200 } = {}) {
  if (!host) {
    host = h('div.toasts', { role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const el = h('div.toast.glass-strong.tone-' + tone, iconEl(icon, 18), h('span', message));
  host.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, ms);
}
