/** History: every document created with the current access code. */
import { api } from '../core/api.js';
import { session } from '../core/session.js';
import { h } from '../core/dom.js';
import { iconEl } from '../ui/icons.js';
import { app } from '../core/state.js';
import { docItem, emptyState } from './common.js';

export async function render(root, { navigate }) {
  const list = h('div.doc-list.grid', [1, 2, 3].map(() => h('div.card.flat', { style: { height: '82px', opacity: '.5' } })));
  root.append(h('div.stack.lg',
    h('div.wiz-q', h('span.eyebrow', 'History'), h('h1', 'Your documents'), h('p', 'Open any document to read, edit, restyle or download it again.')),
    list));
  try {
    const { items, token } = await api('history.list', { code: session.code });
    app.setToken(token);
    items.forEach((g) => app.remember(g));
    list.replaceChildren(...(items.length
      ? items.map((g) => docItem(g, () => navigate('studio/' + g.id)))
      : [emptyState('history', 'No documents yet', 'Create your first application and it will be saved here.',
          h('button.btn.primary', { type: 'button', onclick: () => navigate('create') }, iconEl('plus', 18), 'Create'))]));
  } catch (e) {
    list.replaceChildren(h('div.notice.warn', iconEl('alert', 18), h('span', e.message)));
  }
}
