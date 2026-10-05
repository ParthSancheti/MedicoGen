/**
 * Generation progress. Stages map to real work (request → AI writing / fact check on the server →
 * local typesetting). The last server stage waits for the real response; nothing pretends to be a
 * human reviewer.
 */
import { h } from '../core/dom.js';
import { iconEl } from '../ui/icons.js';

const STAGES = {
  letter: ['Sending your details securely', 'Writing your letter with Gemini', 'Checking it uses only your facts', 'Setting it on the page'],
  demo: ['Saving your details', 'Placing fields on the template', 'Adding the sample marking']
};

export function showGenerating(kind = 'letter') {
  const stages = STAGES[kind];
  const items = stages.map((s) => h('li', h('span.st'), h('span', s)));
  const paper = h('div.gen-paper', [18, 26, 34, 48, 56, 64, 72, 80].map((top, i) => h('i', { style: { top: top + '%', width: (i % 3 === 2 ? 46 : 72) + '%', animationDelay: (i * 0.22) + 's' } })));
  const title = h('h2.title', kind === 'letter' ? 'Writing your application' : 'Preparing your sample');
  const el = h('div.gen-overlay', { role: 'alertdialog', 'aria-live': 'polite', 'aria-label': 'Generating' },
    h('div.gen-card.glass-strong', paper, title, h('ol.gen-steps', items)));
  document.body.append(el);
  document.getElementById('app').inert = true;

  let current = 0;
  const mark = (i) => items.forEach((li, j) => {
    li.className = j < i ? 'done' : j === i ? 'now' : '';
    li.querySelector('.st').replaceChildren(j < i ? iconEl('check', 14) : '');
  });
  mark(0);
  // advance through the stages that happen while we wait, but never past the last server stage
  const serverStages = stages.length - 1;
  const timer = setInterval(() => {
    if (current < serverStages - 1) { current++; mark(current); }
  }, kind === 'letter' ? 1400 : 500);

  const close = () => {
    clearInterval(timer);
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    document.getElementById('app').inert = false;
    setTimeout(() => el.remove(), 300);
  };
  return {
    async finish() {
      clearInterval(timer);
      for (let i = current + 1; i <= stages.length; i++) { mark(i); await new Promise((r) => setTimeout(r, 260)); }
      close();
    },
    fail: close,
    setTitle: (t) => { title.textContent = t; }
  };
}
