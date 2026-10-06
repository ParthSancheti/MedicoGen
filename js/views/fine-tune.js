/**
 * Fine-tune sheet: precision controls for handwriting, humaniser and page format.
 * Opens over a blurred background with a live preview of the real page at the top, so every
 * slider shows its effect immediately. Settings are stored as overrides only; anything left alone
 * follows the chosen paper and writing style.
 */
import { h, fill, debounce } from '../core/dom.js';
import { haptic } from '../core/haptics.js';
import { iconEl } from '../ui/icons.js';
import { openSheet } from '../ui/sheet.js';
import { PAPERS, WRITING, SETTINGS_SPEC, INKS, HUMAN_PRESETS, resolveSettings, cleanSettings } from '../doc/styles.js';

const TABS = [['font', 'Writing'], ['human', 'Humanizer'], ['page', 'Page']];
const fmtVal = (v, step, unit) => {
  const dec = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return (unit === '#' ? '#' : '') + Number(v).toFixed(dec) + (unit && unit !== '#' ? (unit === '×' ? '×' : ' ' + unit) : '');
};

/**
 * @param {object} o
 * @param {object} o.doc        letter document model ({ paper, writing, input, content, settings, id })
 * @param {string} [o.tab]      initial tab
 * @param {(settings)=>void} o.onChange  called (debounced) with the cleaned settings on every change
 */
export function openFineTune({ doc, tab = 'font', onChange }) {
  const paper = PAPERS[doc.paper] || PAPERS.classmate;
  const writing = WRITING[doc.writing] || WRITING.handlee;
  let raw = cleanSettings(doc.settings || {});
  let current = tab;

  const preview = h('div.ft-preview', h('span.btn.ghost.loading', ' '));
  const tabs = h('div.segmented.ft-tabs', { role: 'tablist' });
  const panel = h('div.ft-panel');
  const emit = debounce(() => onChange && onChange(cleanSettings(raw)), 250);

  let drawSeq = 0;
  const drawPreview = debounce(async () => {
    const seq = ++drawSeq;
    const { layoutDocument, pagesToSvg } = await import('../doc/engine.js');
    const { pages } = await layoutDocument({ ...doc, settings: cleanSettings(raw) });
    if (seq !== drawSeq) return;
    preview.innerHTML = pagesToSvg([pages[0]])[0]; // engine output, text escaped
    const svg = preview.querySelector('svg');
    if (svg) { svg.setAttribute('viewBox', '14 52 132 74'); svg.setAttribute('preserveAspectRatio', 'xMinYMin slice'); }
  }, 120);

  const changed = () => { drawPreview(); emit(); };

  function slider(group, [key, label, min, max, step, def, unit]) {
    const resolved = resolveSettings(raw, paper, writing)[group];
    const value = resolved[key] ?? def ?? min;
    const isSet = raw[group] && raw[group][key] !== undefined;
    const out = h('output.ft-val', fmtVal(value, step, unit));
    const input = h('input.ft-range', { type: 'range', min, max, step, value: String(value), 'aria-label': label });
    const reset = h('button.ft-reset', { type: 'button', 'aria-label': 'Reset ' + label, hidden: !isSet, onclick: () => {
      delete raw[group][key];
      if (group === 'human') raw.human.preset = raw.human.preset || undefined;
      haptic('select'); renderPanel(); changed();
    } }, iconEl('refresh', 14));
    input.addEventListener('input', () => {
      raw[group] = raw[group] || {};
      raw[group][key] = Number(input.value);
      out.textContent = fmtVal(input.value, step, unit);
      reset.hidden = false;
      changed();
    });
    input.addEventListener('change', () => haptic('select'));
    return h('div.ft-row', h('div.ft-row-head', h('label', label), h('span.grow'), reset, out), input);
  }

  function renderPanel() {
    fill(tabs, ...TABS.map(([id, label]) => h('button' + (current === id ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': String(current === id), onclick: () => { current = id; haptic('select'); renderPanel(); } }, label)));
    const rows = [];
    if (current === 'font') {
      if (writing.type !== 'hand') rows.push(h('p.subtle.small', 'Printed styles use size and ink only; the handwriting controls apply to handwriting fonts.'));
      const resolvedInk = resolveSettings(raw, paper, writing).font.ink;
      rows.push(h('div.ft-row', h('div.ft-row-head', h('label', 'Ink colour')),
        h('div.ft-swatches', INKS.map(([hex, name]) => h('button.ft-swatch' + (resolvedInk === hex ? '.on' : ''), {
          type: 'button', 'aria-label': name, title: name, style: { background: hex },
          onclick: () => { raw.font.ink = hex; haptic('select'); renderPanel(); changed(); }
        })))));
      SETTINGS_SPEC.font.filter(([k]) => writing.type === 'hand' || k === 'size').forEach((spec) => rows.push(slider('font', spec)));
    } else if (current === 'human') {
      const preset = raw.human.preset || 'natural';
      rows.push(h('div.ft-row', h('div.ft-row-head', h('label', 'Style of writing')),
        h('div.segmented', ['neat', 'natural', 'rushed'].map((p) => h('button' + (preset === p && !Object.keys(raw.human).some((k) => k !== 'preset' && k !== 'seed') ? '.on' : ''), {
          type: 'button', onclick: () => { raw.human = { preset: p, seed: raw.human.seed }; haptic('select'); renderPanel(); changed(); }
        }, p[0].toUpperCase() + p.slice(1))))));
      SETTINGS_SPEC.human.filter(([k]) => k !== 'seed').forEach((spec) => rows.push(slider('human', spec)));
      rows.push(h('div.ft-row', h('div.ft-row-head', h('label', 'Variation'), h('span.grow'), h('output.ft-val', '#' + (raw.human.seed || 0))),
        h('button.btn.secondary.sm', { type: 'button', onclick: () => { raw.human.seed = Math.floor(Math.random() * 999) + 1; haptic('tap'); renderPanel(); changed(); } }, iconEl('refresh', 16), 'Write it differently')));
      if (writing.type !== 'hand') rows.unshift(h('p.subtle.small', 'The humanizer applies to handwriting fonts.'));
    } else {
      SETTINGS_SPEC.page.forEach((spec) => rows.push(slider('page', spec)));
      const align = resolveSettings(raw, paper, writing).page.align;
      rows.push(h('div.ft-row', h('div.ft-row-head', h('label', 'Paragraph alignment')),
        h('div.segmented', [['left', 'Left'], ['justify', 'Justified']].map(([v, l]) => h('button' + (align === v ? '.on' : ''), {
          type: 'button', onclick: () => { raw.page.align = v; haptic('select'); renderPanel(); changed(); }
        }, l)))));
      if (paper.kind !== 'plain') rows.push(h('p.subtle.small', 'On ruled paper, section gaps snap to whole lines so writing always stays on the rules.'));
    }
    fill(panel, ...rows);
  }

  const sheet = openSheet({
    title: 'Fine-tune', size: 'lg', blur: true,
    content: () => h('div.ft',
      preview,
      tabs,
      panel,
      h('div.row.gap.ft-foot',
        h('button.btn.ghost', { type: 'button', onclick: () => { raw = { font: {}, human: {}, page: {} }; haptic('select'); renderPanel(); changed(); } }, 'Reset all'),
        h('button.btn.primary.grow', { type: 'button', onclick: () => sheet.close() }, iconEl('check', 18), 'Done')))
  });
  renderPanel();
  drawPreview();
  return sheet;
}

/** Small round gear button used on selected style cards. */
export function gearButton(onClick, label = 'Fine-tune') {
  return h('button.gear-btn', { type: 'button', 'aria-label': label, title: label, onclick: (e) => { e.stopPropagation(); haptic('tap'); onClick(); } }, iconEl('settings', 18));
}

export { HUMAN_PRESETS };

/**
 * Zooms a picker preview into the salutation and body, where the handwriting is readable. The crop
 * starts one line above the salutation as laid out on this page, so no line is ever cut in half.
 */
export function previewCrop(host, whole = false, page = null) {
  const svg = host.querySelector('svg');
  if (!svg) return;
  if (whole) { svg.setAttribute('viewBox', '0 0 210 172'); svg.setAttribute('preserveAspectRatio', 'xMidYMin slice'); return; } // paper: show its geometry
  const sal = page && page.items.find((it) => it.b === 'salutation' && (it.t === 'glyph' || it.t === 'text'));
  const top = sal ? Math.max(0, sal.y - 9) : 78;
  svg.setAttribute('viewBox', `18 ${Math.round(top * 10) / 10} 122 106`); // several real lines of handwriting
  svg.setAttribute('preserveAspectRatio', 'xMinYMin slice');
}
