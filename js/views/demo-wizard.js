/** Demonstration template wizard: template → details → acknowledge & create. */
import { h, todayIso } from '../core/dom.js';
import { haptic } from '../core/haptics.js';
import { session } from '../core/session.js';
import { iconEl } from '../ui/icons.js';
import { app } from '../core/state.js';
import { TEMPLATES, TEMPLATE_ORDER, DEMO_NOTICE } from '../doc/templates.js';
import { formatFieldValue } from '../doc/template-layout.js';
import { runWizard, textField } from './wizard.js';
import { generate } from './generate.js';

const base = new URL('../../', import.meta.url);

export function render(root, { navigate }) {
  const profile = session.profile;
  const initial = {
    templateId: 'demo-leave',
    acknowledged: false,
    fields: { date: todayIso(), name: profile.name || '', institution: profile.college || '' }
  };

  const steps = [
    {
      key: 'template', eyebrow: 'Demo templates', title: 'Choose a template',
      text: 'These show how details are placed on a document. Every output is marked as a sample.',
      render: (d, ui) => {
        const grid = h('div.template-grid');
        TEMPLATE_ORDER.forEach((id) => {
          const t = TEMPLATES[id];
          const card = h('button.style-card.template-card' + (d.templateId === id ? '.on' : ''), { type: 'button', 'aria-pressed': String(d.templateId === id) },
            h('div.preview', h('img', { src: new URL(t.background, base).href, alt: '', loading: 'lazy' })),
            h('h3', t.name), h('p', t.blurb), h('span.tick', iconEl('check', 14)));
          card.addEventListener('click', () => {
            d.templateId = id; ui.changed(); haptic('select');
            grid.querySelectorAll('.style-card').forEach((c) => { c.classList.toggle('on', c === card); c.setAttribute('aria-pressed', String(c === card)); });
          });
          grid.append(card);
        });
        return h('div.stack', grid,
          h('div.demo-ribbon', iconEl('shield', 18), h('span', 'Demonstration only. No signatures, seals or doctor details are ever added.')));
      }
    },
    {
      key: 'details', eyebrow: 'Details', title: 'Fill in the template', text: (d) => TEMPLATES[d.templateId].name + ' · fields appear exactly where the blanks are.',
      render: (d, ui) => {
        const t = TEMPLATES[d.templateId];
        const nodes = [];
        const pairs = [];
        t.fields.forEach((f) => {
          const key = 'fields.' + f.id;
          let node;
          if (f.input === 'date' || f.input === 'number') {
            const input = h('input.input', { type: f.input, value: d.fields[f.id] || '', min: f.input === 'number' ? 1 : undefined, max: f.input === 'number' ? 120 : undefined, inputmode: f.input === 'number' ? 'numeric' : undefined, 'aria-label': f.label });
            input.addEventListener('input', () => { d.fields[f.id] = input.value; ui.changed(); });
            node = h('div.field', h('label', f.label, f.required ? null : h('span.subtle', ' (optional)')), input, ui.error(key));
          } else if (f.input === 'select') {
            const wrap = h('div.segmented', f.options.map((o) => {
              const b = h('button' + (d.fields[f.id] === o ? '.on' : ''), { type: 'button' }, o);
              b.addEventListener('click', () => { d.fields[f.id] = d.fields[f.id] === o ? '' : o; ui.changed(); haptic('select'); wrap.querySelectorAll('button').forEach((x) => x.classList.toggle('on', d.fields[f.id] === x.textContent)); });
              return b;
            }));
            node = h('div.field', h('label', f.label, h('span.subtle', ' (optional)')), wrap);
          } else {
            node = textField(ui, key, { label: f.label, type: f.input === 'textarea' ? 'textarea' : 'text', max: f.max || 120, optional: !f.required, autocapitalize: f.input === 'textarea' ? 'sentences' : 'words' });
          }
          if (['from', 'to'].includes(f.id)) pairs.push(node); else { flush(); nodes.push(node); }
          if (pairs.length === 2) flush();
        });
        flush();
        function flush() { if (pairs.length === 2) nodes.push(h('div.grid-2', pairs.splice(0))); else if (pairs.length) nodes.push(...pairs.splice(0)); }
        return h('div.stack', nodes);
      },
      validate: (d) => {
        const e = {};
        TEMPLATES[d.templateId].fields.forEach((f) => { if (f.required && !String(d.fields[f.id] || '').trim()) e['fields.' + f.id] = 'Required for this template.'; });
        if (d.fields.from && d.fields.to && d.fields.to < d.fields.from) e['fields.to'] = 'Must be on or after the start date.';
        return e;
      }
    },
    {
      key: 'review', eyebrow: 'Review', title: 'Create the sample', text: () => `This uses 1 of your ${app.token.remaining} remaining generations.`,
      render: (d, ui) => {
        const t = TEMPLATES[d.templateId];
        const ack = h('input', { type: 'checkbox', checked: d.acknowledged, style: { width: '22px', height: '22px', flex: 'none', accentColor: 'var(--danger)' } });
        ack.addEventListener('change', () => { d.acknowledged = ack.checked; ui.changed(); haptic('select'); });
        return h('div.stack',
          h('div.card', h('dl.summary-dl', h('div', h('dt', 'Template'), h('dd', t.name)),
            t.fields.filter((f) => d.fields[f.id]).map((f) => h('div', h('dt', f.label), h('dd', formatFieldValue(f, d.fields[f.id])))))),
          h('div.demo-ribbon', iconEl('alert', 18), h('span', DEMO_NOTICE)),
          h('label.row', { style: { gap: '12px', alignItems: 'flex-start', fontWeight: 600 } }, ack,
            h('span', 'I understand this is a watermarked demonstration and must not be used as a medical certificate.')),
          ui.error('acknowledged'));
      },
      validate: (d) => (d.acknowledged ? {} : { acknowledged: 'Please confirm to continue.' })
    }
  ];

  return runWizard(root, {
    route: 'demo',
    steps,
    initial,
    finishLabel: () => 'Create sample',
    exit: () => navigate('home'),
    finish: async (d, ctl) => {
      const fields = {};
      TEMPLATES[d.templateId].fields.forEach((f) => { if (d.fields[f.id]) fields[f.id] = d.fields[f.id]; });
      const res = await generate({ action: 'demo.create', kind: 'demo', data: d, saveDraft: ctl.saveDraft, params: { templateId: d.templateId, fields } });
      if (!res) return;
      sessionStorage.setItem('mg.fresh', JSON.stringify({ id: res.generation.id }));
      navigate('studio/' + res.generation.id);
    }
  });
}
