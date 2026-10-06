import { h, clear } from '../core/dom.js';
import { PAPERS, PAPER_ORDER, WRITING, WRITING_ORDER } from '../doc/styles.js';
import { SAMPLE_INPUT, SAMPLE_CONTENT } from '../doc/samples.js';
import { iconEl } from '../ui/icons.js';

export async function render(root, { navigate }) {
  const head = h('div.studio-head',
    h('button.icon-btn', { type: 'button', 'aria-label': 'Back to home', onclick: () => navigate('home') }, iconEl('back', 20)),
    h('div.grow.stack.sm', { style: { gap: '2px' } }, h('h1', 'Developer Font Testing'))
  );

  const controls = h('div.card', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', padding: '16px' } });
  
  const pSelect = h('select.input');
  PAPER_ORDER.forEach(id => pSelect.append(h('option', { value: id }, PAPERS[id].name)));
  
  const wSelect = h('select.input');
  WRITING_ORDER.forEach(id => wSelect.append(h('option', { value: id }, WRITING[id].name)));

  const scaleInput = h('input.input', { type: 'number', step: '0.1', value: '1.2', style: { width: '80px' } });

  const testBtn = h('button.btn.secondary', { type: 'button' }, 'Check Mistral');
  const testRes = h('span.subtle', { style: { fontSize: '13px', alignSelf: 'center' } });

  controls.append(
    h('div.field', h('label', 'Paper'), pSelect),
    h('div.field', h('label', 'Writing'), wSelect),
    h('div.field', h('label', 'Scale'), scaleInput),
    h('div.field', h('label', 'Diagnostic'), h('div.row', { style: { gap: '10px' } }, testBtn, testRes))
  );

  const preview = h('div.pages');

  root.append(h('div.studio-wrap', h('div.stack', { style: { minWidth: 0, padding: '20px' } }, head, controls, preview)));

  const draw = async () => {
    preview.innerHTML = 'Loading...';
    const { layoutDocument, pagesToSvg } = await import('../doc/engine.js');
    const doc = {
      kind: 'letter',
      id: 'dev-test',
      paper: pSelect.value,
      writing: wSelect.value,
      input: SAMPLE_INPUT,
      content: SAMPLE_CONTENT
    };
    try {
      const { pages } = await layoutDocument(doc, { dev: true });
      const svgs = pagesToSvg(pages);
      clear(preview);
      svgs.forEach(svgStr => {
        const f = h('div.page-frame');
        f.innerHTML = svgStr;
        preview.append(f);
      });
      preview.style.setProperty('--zoom', scaleInput.value);
    } catch (e) {
      preview.textContent = 'Error: ' + e.message;
    }
  };

  pSelect.addEventListener('change', draw);
  wSelect.addEventListener('change', draw);
  scaleInput.addEventListener('input', draw);

  // Health check only: never calls letter.generate, so it never uses up a generation.
  testBtn.addEventListener('click', async () => {
    testBtn.disabled = true;
    testRes.textContent = 'Checking\u2026';
    try {
      const { api, isMock } = await import('../core/api.js');
      if (isMock) {
        const r = await fetch('/api/mistral/health').then((x) => x.json()).catch(() => null);
        testRes.textContent = r && r.status === 'ok' ? `Mock + real Mistral via dev proxy (${r.model})` : 'Mock: no MISTRAL_API_KEY in .env, using the local composer';
      } else {
        const { config } = await api('config.get');
        testRes.textContent = config.aiConfigured ? `Live backend: Mistral key set (${config.aiModel})` : 'Live backend: MISTRAL_API_KEY missing, standard letters only';
      }
    } catch (e) {
      testRes.textContent = 'Error: ' + e.message;
    }
    testBtn.disabled = false;
  });

  await draw();
}
