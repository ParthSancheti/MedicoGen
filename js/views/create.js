/** Output selection: two clearly different destinations. */
import { h } from '../core/dom.js';
import { haptic } from '../core/haptics.js';
import { iconEl } from '../ui/icons.js';
import { app } from '../core/state.js';
import { toast } from '../ui/toast.js';

export function createTiles(navigate) {
  const go = (route) => {
    haptic('tap');
    if (!app.token.remaining) { toast('No generations left on this code. Your existing documents are still available.', { tone: 'error', ms: 4200 }); return; }
    navigate(route);
  };
  return [
    h('button.tile.letter', { type: 'button', onclick: () => go('letter') },
      h('span.tile-ic', iconEl('letter', 24)),
      h('h3', 'Student application'),
      h('p', 'A leave or absence letter to your HOD, written with AI from your details.'),
      h('div.mini-tags', h('span.badge', 'AI-written'), h('span.badge.neutral', 'Handwriting or print')),
      h('span.go', iconEl('next', 20))),
    h('button.tile.scan', { type: 'button', onclick: () => go('scan') },
      h('span.tile-ic', iconEl('scan', 24)),
      h('h3', 'Letter from prescription'),
      h('p', 'Upload the prescription your doctor gave you. We read it and write your leave letter.'),
      h('div.mini-tags', h('span.badge', 'Reads your photo'), h('span.badge.neutral', 'Reading is free')),
      h('span.go', iconEl('next', 20))),
    h('button.tile.demo', { type: 'button', onclick: () => go('demo') },
      h('span.tile-ic', iconEl('template', 24)),
      h('h3', 'Medical template demo'),
      h('p', 'See how details fill into a document template. Always watermarked as a sample.'),
      h('div.mini-tags', h('span.badge.danger', 'Demonstration only')),
      h('span.go', iconEl('next', 20)))
  ];
}

export function render(root, { navigate }) {
  root.append(h('div.wizard',
    h('div.wiz-q', h('span.eyebrow', 'Create'), h('h1', 'What would you like to make?'), h('p', 'Each new document uses one generation.')),
    h('div.options', createTiles(navigate))));
}
