/**
 * Conversational wizard engine: one logical step at a time, sticky actions, inline validation,
 * keyboard Enter to continue, and automatic draft recovery (survives refresh).
 */
import { h, clear, fill, debounce } from '../core/dom.js';
import { haptic } from '../core/haptics.js';
import { iconEl } from '../ui/icons.js';
import { session } from '../core/session.js';
import { toast } from '../ui/toast.js';

/**
 * @param {HTMLElement} root
 * @param {object} cfg
 * @param {string} cfg.route              draft key / route name
 * @param {object[]} cfg.steps            [{ key, eyebrow, title, text, render(data, ui), validate?(data) }]
 * @param {object} cfg.initial            initial data (used when no draft)
 * @param {(data, ctl) => Promise} cfg.finish
 * @param {string} cfg.finishLabel
 * @param {() => void} cfg.exit
 */
export function runWizard(root, cfg) {
  const draft = session.draft;
  const restored = draft && draft.route === cfg.route && draft.data;
  const data = restored ? draft.data : structuredClone(cfg.initial);
  let index = restored ? Math.min(draft.step || 0, cfg.steps.length - 1) : 0;
  let dir = 'fwd';
  const errors = new Map();

  const save = debounce(() => { session.draft = { route: cfg.route, step: index, data }; }, 250);

  const progress = h('div.wiz-progress', { 'aria-hidden': 'true' }, cfg.steps.map(() => h('i')));
  const stepLabel = h('span.wiz-step-label');
  const backTop = h('button.icon-btn', { type: 'button', 'aria-label': 'Back', onclick: () => back() }, iconEl('back', 20));
  const q = h('div.wiz-q');
  const body = h('div.wiz-body');
  const nextBtn = h('button.btn.primary', { type: 'button', onclick: () => next() });
  const backBtn = h('button.btn.ghost', { type: 'button', onclick: () => back() }, 'Back');
  const bar = h('div.action-bar', h('div.inner.glass-strong', backBtn, nextBtn));

  const form = h('form.wizard', { novalidate: true, onsubmit: (e) => { e.preventDefault(); next(); } },
    h('div.wiz-top', backTop, progress, stepLabel), q, body, h('button', { type: 'submit', hidden: true }));
  root.append(form);
  document.body.append(bar); // fixed bars live outside animated containers

  const ui = {
    data,
    changed: () => save(),
    /** Registers an input container so validation messages appear under it. */
    error(key) {
      const el = h('p.err', { role: 'alert', 'data-err': key });
      errors.set(key, el);
      return el;
    },
    rerender: () => draw(false),
    next: () => next()
  };

  function draw(animate = true) {
    const step = cfg.steps[index];
    errors.clear();
    [...progress.children].forEach((el, i) => { el.className = i < index ? 'done' : i === index ? 'now' : ''; });
    stepLabel.textContent = `${index + 1} of ${cfg.steps.length}`;
    fill(q, 
      step.eyebrow ? h('span.eyebrow', step.eyebrow) : null,
      h('h1', { tabindex: '-1' }, typeof step.title === 'function' ? step.title(data) : step.title),
      step.text ? h('p', typeof step.text === 'function' ? step.text(data) : step.text) : null);
    fill(body, step.render(data, ui));
    body.className = 'wiz-body' + (animate ? ' anim-' + dir : '');
    const last = index === cfg.steps.length - 1;
    nextBtn.replaceChildren(...(last ? [iconEl('sparkle', 20), cfg.finishLabel(data)] : ['Continue', iconEl('arrowRight', 18)]));
    backBtn.hidden = index === 0;
    if (animate) {
      const hd = q.querySelector('h1');
      hd && hd.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    save();
  }

  function validate() {
    const step = cfg.steps[index];
    const result = step.validate ? step.validate(data) : null;
    errors.forEach((el) => { el.textContent = ''; });
    if (!result || !Object.keys(result).length) return true;
    let firstEl = null;
    for (const [key, msg] of Object.entries(result)) {
      const el = errors.get(key);
      if (el) { el.textContent = msg; firstEl = firstEl || el; }
      else toast(msg, { tone: 'error' });
    }
    haptic('error');
    if (firstEl) {
      const input = firstEl.parentElement && firstEl.parentElement.querySelector('input,textarea,select,button');
      firstEl.parentElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
      input && input.focus && input.focus({ preventScroll: true });
    }
    return false;
  }

  let busy = false;
  async function next() {
    if (busy || !validate()) return;
    if (index < cfg.steps.length - 1) {
      haptic('tap');
      dir = 'fwd';
      index++;
      draw();
      return;
    }
    busy = true;
    nextBtn.disabled = true; backBtn.disabled = true;
    try {
      await cfg.finish(data, { saveDraft: () => { session.draft = { route: cfg.route, step: index, data }; } });
    } finally {
      busy = false;
      if (nextBtn.isConnected) { nextBtn.disabled = false; backBtn.disabled = false; }
    }
  }

  function back() {
    if (busy) return;
    haptic('select');
    if (index === 0) { cfg.exit(); return; }
    dir = 'back';
    index--;
    draw();
  }

  draw(false);
  if (restored) {
    toast('Restored your draft', { tone: 'neutral' });
  }
  return () => { bar.remove(); };
}

/* ---------- field helpers ---------- */

export function textField(ui, key, { label, placeholder, hint, type = 'text', inputmode, autocomplete, max = 120, chips, chipMode = 'replace', optional, autocapitalize = 'words' }) {
  const path = key.split('.');
  const get = () => path.reduce((o, k) => (o || {})[k], ui.data) || '';
  const set = (v) => { let o = ui.data; path.slice(0, -1).forEach((k) => { o = o[k] = o[k] || {}; }); o[path[path.length - 1]] = v; ui.changed(); };
  const input = h(type === 'textarea' ? 'textarea.textarea' : 'input.input', {
    type: type === 'textarea' ? undefined : type, placeholder, inputmode, autocomplete, maxlength: max, value: get(), autocapitalize, 'aria-label': label
  });
  if (type === 'textarea') input.value = get();
  input.addEventListener('input', () => { set(input.value); input.classList.remove('invalid'); if (counter) counter.textContent = `${input.value.length}/${max}`; });
  const counter = type === 'textarea' ? h('span.count.subtle.small', `${get().length}/${max}`) : null;
  let chipRow = null;
  if (chips && chips.length) {
    chipRow = h('div.chips' + (chipMode === 'insert' ? '' : '.scroll'), chips.map((c) => {
      const btn = h('button.chip' + (chipMode === 'insert' ? '.add' : ''), { type: 'button' }, c.label || c);
      btn.addEventListener('click', () => {
        haptic('select');
        const value = c.value || c;
        if (chipMode === 'insert') {
          const start = input.selectionStart ?? input.value.length;
          const before = input.value.slice(0, start), after = input.value.slice(input.selectionEnd ?? start);
          const sep = before && !/\s$/.test(before) ? ' ' : '';
          input.value = (before + sep + value + (after && !/^\s/.test(after) ? ' ' : '') + after).slice(0, max);
          const pos = (before + sep + value).length;
          input.focus({ preventScroll: true });
          input.setSelectionRange(pos, pos);
        } else {
          input.value = value;
        }
        input.dispatchEvent(new Event('input'));
        if (chipMode !== 'insert') chipRow.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === btn));
      });
      if (chipMode !== 'insert' && get() === (c.value || c)) btn.classList.add('on');
      return btn;
    }));
  }
  return h('div.field',
    h('label', label, optional ? h('span.subtle', ' (optional)') : null),
    chipMode === 'replace' && chipRow ? chipRow : null,
    input,
    chipMode === 'insert' && chipRow ? chipRow : null,
    hint || counter ? h('div.row.between', hint ? h('p.hint', hint) : h('span'), counter) : null,
    ui.error(key));
}

export function choiceChips(ui, key, options, { label, onPick } = {}) {
  const wrap = h('div.chips');
  options.forEach((o) => {
    const btn = h('button.chip' + (ui.data[key] === o.value ? '.on' : ''), { type: 'button', 'aria-pressed': String(ui.data[key] === o.value) }, o.label);
    btn.addEventListener('click', () => {
      haptic('select');
      ui.data[key] = o.value;
      wrap.querySelectorAll('.chip').forEach((x) => { x.classList.toggle('on', x === btn); x.setAttribute('aria-pressed', String(x === btn)); });
      ui.changed();
      onPick && onPick(o.value);
    });
    wrap.append(btn);
  });
  return h('div.field', label ? h('label', label) : null, wrap, ui.error(key));
}
