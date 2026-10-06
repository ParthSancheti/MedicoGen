/** Small shared view pieces. */
import { h } from '../core/dom.js';
import { iconEl } from '../ui/icons.js';
import { haptic } from '../core/haptics.js';
import { PAPERS } from '../doc/styles.js';
import { TEMPLATES } from '../doc/templates.js';

export function docSubtitle(gen) {
  const when = new Date(gen.createdAt);
  const date = when.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (gen.kind === 'demo') return [TEMPLATES[gen.style]?.name || 'Template', date];
  const pId = gen.paper || gen.style || 'classmate';
  return [PAPERS[pId]?.name || 'Letter', date];
}

export function docTitle(gen) {
  if (gen.kind === 'demo') return (gen.content?.fields?.name || 'Demo') + ' · ' + (TEMPLATES[gen.style]?.name || 'Template');
  return gen.title || 'Application';
}

/** History row with a real rendered thumbnail. */
export function docItem(gen, onOpen) {
  const thumb = h('div.doc-thumb');
  const [kind, date] = docSubtitle(gen);
  const el = h('button.doc-item', { type: 'button', onclick: () => { haptic('select'); onOpen(gen); } },
    thumb,
    h('div.grow.stack.sm', { style: { gap: '4px' } },
      h('h3', docTitle(gen)),
      h('div.meta',
        gen.kind === 'demo' ? h('span.badge.danger', 'Sample') : h('span.badge', kind),
        h('span', date),
        gen.source === 'fallback' ? h('span', '· standard template') : null)),
    iconEl('next', 18, 'muted'));
  // render thumbnail lazily
  import('../doc/engine.js').then(async ({ layoutDocument, pagesToSvg }) => {
    try {
      const doc = toDoc(gen);
      const { pages } = await layoutDocument(doc);
      thumb.innerHTML = pagesToSvg([pages[0]])[0];
    } catch { /* thumbnail is optional */ }
  });
  return el;
}

/** Converts a backend generation into the engine's document model. */
export function toDoc(gen) {
  if (gen.kind === 'demo') return { kind: 'demo', id: gen.id, templateId: gen.content.templateId, fields: gen.content.fields || {} };
  return { kind: 'letter', id: gen.id, paper: gen.paper, writing: gen.writing, style: gen.style, input: gen.input, content: gen.content };
}

export function emptyState(iconName, title, text, action) {
  return h('div.empty.card',
    h('div.art', iconEl(iconName, 28)),
    h('h3.title', title),
    h('p.muted', text),
    action || null);
}
