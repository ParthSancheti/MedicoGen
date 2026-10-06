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

  const testBtn = h('button.btn.secondary', { type: 'button' }, 'Test Gemini');
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

  testBtn.addEventListener('click', async () => {
    testBtn.disabled = true;
    testRes.textContent = 'Testing...';
    try {
      const { api, isMock, newRequestId } = await import('../core/api.js');
      const { session } = await import('../core/session.js');
      const data = {
        letterType: 'absence', date: '2026-10-05', tone: 'formal',
        student: { name: 'Test', college: 'Test', department: 'Test', year: 'First', division: 'A', rollNo: '1' },
        absence: { from: '2026-10-01', to: '2026-10-02', reasonCategory: 'illness', reason: 'sick' },
        recipient: { designation: 'HOD' }
      };
      // For testing without a real code, we use a placeholder that the mock DB usually ignores, or we rely on session.code
      const res = await api('letter.generate', { code: session.code || 'TEST-123', generationId: newRequestId('gen'), input: data });
      if (isMock) testRes.textContent = `Mock (local): ${res.generation.source}`;
      else testRes.textContent = `Live backend: ${res.generation.source}`;
    } catch (e) {
      testRes.textContent = 'Error: ' + e.message;
    }
    testBtn.disabled = false;
  });

  await draw();
}
