/** Landing page: the hero papers are rendered by the real document engine with the real fonts. */
import { $ } from '../core/dom.js';
import { sampleDoc } from '../doc/samples.js';

let rendered = false;

export async function renderLanding() {
  if (rendered) return;
  rendered = true;
  try {
    const { layoutDocument, pagesToSvg } = await import('../doc/engine.js');
    const targets = [['#hero-paper', 'notebook'], ['#hero-paper-mid', 'academic'], ['#hero-paper-back', 'classic']];
    for (const [sel, style] of targets) {
      const { pages } = await layoutDocument(sampleDoc(style));
      $(sel).innerHTML = pagesToSvg([pages[0]])[0]; // engine output: escaped text only
    }
  } catch (e) {
    rendered = false; // keep the skeleton; the app still works
    console.warn('Preview unavailable', e);
  }
}

/** Warms fonts/layout code while the student reads the landing page. */
export function prefetchEngine() {
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
  idle(() => { import('../doc/engine.js').then((m) => m.getRegistry()).catch(() => {}); });
}
