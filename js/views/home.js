/** Home: allowance, two destinations, recent documents. */
import { api } from '../core/api.js';
import { session } from '../core/session.js';
import { h } from '../core/dom.js';
import { haptic } from '../core/haptics.js';
import { iconEl } from '../ui/icons.js';
import { app } from '../core/state.js';
import { docItem, emptyState } from './common.js';
import { openAccessSheet } from './access.js';
import { createTiles } from './create.js';

export async function render(root, { navigate }) {
  const t = app.token;
  const first = (session.profile.name || '').split(' ')[0];
  const ring = h('div.ring', { style: { '--p': t.total ? (t.remaining / t.total) * 100 : 0 } }, h('div.in', h('b', String(t.remaining)), h('small', 'left')));
  const draft = session.draft;

  const recent = h('div.doc-list', h('div.card.flat', { style: { height: '76px', opacity: '.5' } }));
  root.append(h('div.home',
    h('div.hello.stack.sm',
      h('span.eyebrow', greeting()),
      h('h1.title-lg', first ? `Hi ${first}, what are we writing today?` : 'What are we writing today?')),
    h('div.card.allowance-card',
      ring,
      h('div.stack.sm.grow',
        h('h2.title', t.remaining ? `${t.remaining} of ${t.total} generations left` : 'No generations left'),
        h('p.small.muted', t.remaining ? 'Editing, restyling and downloading are always free.' : 'Your documents stay available. Get a new code to create more.'),
        t.remaining ? null : h('div', h('button.btn.primary.sm', { type: 'button', onclick: () => openAccessSheet({ mode: 'request', onUnlocked: (tok) => { app.setToken(tok); navigate('home'); } }) }, 'Get a new code')))),
    draft && draft.route ? h('button.notice', { type: 'button', style: { border: 0, textAlign: 'left', cursor: 'pointer' }, onclick: () => { haptic('select'); navigate(draft.route); } },
      iconEl('edit', 18), h('span.grow', h('b', 'Continue your draft'), h('br'), h('span.small', 'You were filling in ' + (draft.route === 'demo' ? 'a demo template' : 'a student application') + '.')), iconEl('next', 18)) : null,
    h('div.create-grid', createTiles(navigate)),
    h('div.section-head', h('h2', 'Recent'), h('button.btn.ghost.sm', { type: 'button', onclick: () => navigate('history') }, 'See all')),
    recent));

  try {
    const { items, token } = await api('history.list', { code: session.code });
    app.setToken(token);
    items.forEach((g) => app.remember(g));
    recent.replaceChildren(...(items.length
      ? items.slice(0, 3).map((g) => docItem(g, () => navigate('studio/' + g.id)))
      : [emptyState('doc', 'Nothing here yet', 'Your documents will appear here after you create one.')]));
  } catch (e) {
    recent.replaceChildren(h('div.notice.warn', iconEl('alert', 18), h('span', e.message)));
  }
}

function greeting() {
  const hr = new Date().getHours();
  return hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
}
