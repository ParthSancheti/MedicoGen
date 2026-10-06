/**
 * Document studio. The page you see is the page you export: both come from the same layout.
 * Editing and restyling are local + saved to the backend for free; only "Write a new version"
 * calls the AI (Mistral) and uses a generation.
 */
import { api } from '../core/api.js';
import { session } from '../core/session.js';
import { h, clear, fill, debounce } from '../core/dom.js';
import { haptic } from '../core/haptics.js';
import { icon, iconEl } from '../ui/icons.js';
import { openSheet, confirmSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { app } from '../core/state.js';
import { PAPERS, PAPER_ORDER, WRITING, WRITING_ORDER } from '../doc/styles.js';
import { TEMPLATES, DEMO_NOTICE } from '../doc/templates.js';
import { toDoc, docTitle } from './common.js';
import { generate } from './generate.js';

const dev = new URLSearchParams(location.search).get('dev') === '1';

export async function render(root, { param, navigate }) {
  let gen = app.docs.get(param);
  if (!gen || !gen.content) {
    root.append(h('div.empty', h('span.btn.ghost.loading', ' '), h('p.subtle', 'Opening your document…')));
    try {
      const res = await api('generation.get', { code: session.code, generationId: param });
      gen = res.generation;
      app.remember(gen);
    } catch (e) {
      fill(root, h('div.empty.card', h('div.art', iconEl('alert', 28)), h('h3.title', 'Document not found'), h('p.muted', e.message),
        h('button.btn.primary', { type: 'button', onclick: () => navigate('history') }, 'Go to history')));
      return;
    }
    clear(root);
  }

  const fresh = (() => { try { const f = JSON.parse(sessionStorage.getItem('mg.fresh') || 'null'); if (f && f.id === gen.id) { sessionStorage.removeItem('mg.fresh'); return f; } } catch { /* ignore */ } return null; })();
  let doc = toDoc(gen);
  const isDemo = doc.kind === 'demo';
  const humanKey = 'mg.human.' + gen.id;
  try { doc.humanize = localStorage.getItem(humanKey) || 'natural'; } catch { doc.humanize = 'natural'; }
  let zoom = 1;

  /* ---------- layout ---------- */
  const pagesEl = h('div.pages', { 'aria-label': 'Document preview' });
  const warnEl = h('div');
  const saveState = h('span.subtle.small', { 'aria-live': 'polite' });
  const zoomLabel = h('span', '100%');
  const zoomCtl = h('div.zoom-ctl.glass',
    h('button', { type: 'button', 'aria-label': 'Zoom out', onclick: () => setZoom(zoom - 0.25) }, iconEl('zoomOut', 20)),
    zoomLabel,
    h('button', { type: 'button', 'aria-label': 'Zoom in', onclick: () => setZoom(zoom + 0.25) }, iconEl('zoomIn', 20)));

  const headBadges = h('div.row.wrap', { style: { gap: '6px' } });
  const head = h('div.studio-head',
    h('button.icon-btn', { type: 'button', 'aria-label': 'Back to home', onclick: () => navigate('home') }, iconEl('back', 20)),
    h('div.grow.stack.sm', { style: { gap: '2px' } }, h('h1', docTitle(gen)), headBadges));

  const paperStrip = h('div.style-grid', { role: 'radiogroup', 'aria-label': 'Page style' });
  const writingStrip = h('div.style-grid', { role: 'radiogroup', 'aria-label': 'Handwriting style' });
  const side = h('aside.studio-side');

  const exportBtn = h('button.btn.primary', { type: 'button', onclick: () => doExport(exportBtn) }, iconEl('download', 20), 'Download PDF');
  const actions = h('div.studio-actions', h('div.inner.glass-strong',
    h('button.btn.secondary', { type: 'button', 'aria-label': 'Edit text', onclick: () => openEditor() }, iconEl('edit', 20), h('span.sr-only', 'Edit')),
    isDemo ? h('span') : h('button.btn.secondary', { type: 'button', 'aria-label': 'More', onclick: () => openMore() }, iconEl('more', 20)),
    exportBtn));

  // How human the handwriting looks: neat (no slips) → natural → rushed (more wobble and slips).
  const humanCtl = h('div.segmented.human-ctl', { role: 'radiogroup', 'aria-label': 'Handwriting realism' });
  const renderHuman = () => {
    humanCtl.hidden = isDemo || WRITING[doc.writing || 'kalam'].type !== 'hand';
    fill(humanCtl, ...[['neat', 'Neat'], ['natural', 'Natural'], ['rushed', 'Rushed']].map(([v, l]) => {
      const b = h('button' + (doc.humanize === v ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': String(doc.humanize === v) }, l);
      b.addEventListener('click', () => {
        if (doc.humanize === v) return;
        haptic('select');
        doc = { ...doc, humanize: v };
        try { localStorage.setItem(humanKey, v); } catch { /* per-device preference */ }
        renderHuman(); draw();
      });
      return b;
    }));
  };
  renderHuman();

  const main = h('div.stack', { style: { gap: '12px', minWidth: 0 } },
    warnEl, humanCtl, zoomCtl, pagesEl);
  root.append(h('div.studio-wrap', h('div.stack', { style: { minWidth: 0 } }, head, main), side));
  document.body.append(actions);

  if (fresh && fresh.notice) {
    warnEl.append(h('div.notice.warn', iconEl('info', 18), h('span', fresh.notice === 'AI_BUSY'
      ? 'AI writing is busy right now, so we used our standard letter with your details. Read it through and edit anything you like.'
      : 'AI writing isn’t available right now, so we used our standard letter with your details. Read it through and edit anything you like.')));
  }

  function badges() {
    clear(headBadges);
    if (isDemo) headBadges.append(h('span.badge.danger', 'Sample · demonstration only'), h('span.badge.neutral', TEMPLATES[doc.templateId].name));
    else {
      headBadges.append(h('span.badge', PAPERS[doc.paper || 'classmate'].name), h('span.badge', WRITING[doc.writing || 'kalam'].name));
      headBadges.append(gen.source === 'mistral' ? h('span.badge.success', iconEl('sparkle', 13), 'AI-written') : h('span.badge.neutral', 'Standard template'));
      if (gen.source === 'mock') headBadges.append(h('span.badge.warn', 'Mock'));
    }
    headBadges.append(saveState);
  }

  let drawSeq = 0;
  async function draw({ reveal = false } = {}) {
    const seq = ++drawSeq;
    const { layoutDocument, pagesToSvg } = await import('../doc/engine.js');
    const res = await layoutDocument(doc, { dev });
    if (seq !== drawSeq) return;
    const svgs = pagesToSvg(res.pages, { interactive: true });
    fill(pagesEl, ...svgs.map((svg, i) => {
      const f = h('div.page-frame' + (reveal ? '.reveal' : ''), { style: { animationDelay: (i * 0.12) + 's' } });
      f.innerHTML = svg; // generated by the engine; all text escaped
      if (svgs.length > 1) f.append(h('span.page-no', `Page ${i + 1} of ${svgs.length}`));
      return f;
    }));
    pagesEl.style.setProperty('--zoom', zoom);
    [...warnEl.querySelectorAll('.font-warn')].forEach((x) => x.remove());
    const missing = res.warnings.filter((w) => w !== '…');
    if (missing.length) warnEl.append(h('div.notice.warn.font-warn', iconEl('alert', 18), h('span', `Some characters aren’t in this font and were left out: ${missing.join(' ')}. Try rewording or another style.`)));
    if (res.warnings.includes('…')) warnEl.append(h('div.notice.warn.font-warn', iconEl('alert', 18), h('span', 'Some text was too long for its box and was shortened. Edit it to fit.')));
  }

  function setZoom(z) {
    zoom = Math.max(0.5, Math.min(2.5, Math.round(z * 100) / 100));
    zoomLabel.textContent = Math.round(zoom * 100) + '%';
    pagesEl.style.setProperty('--zoom', zoom);
    haptic('select');
  }

  function renderPickers() {
    clear(paperStrip);
    PAPER_ORDER.forEach((id) => {
      const p = PAPERS[id];
      const prev = h('div.preview');
      const card = h('button.style-card' + (doc.paper === id ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': String(doc.paper === id) },
        prev, h('h3', p.name), h('p', p.blurb), h('span.tick', iconEl('check', 14)));
      card.addEventListener('click', () => setPaper(id));
      paperStrip.append(card);
      pickerPreview(prev, id, doc.writing);
    });

    clear(writingStrip);
    WRITING_ORDER.forEach((id) => {
      const w = WRITING[id];
      const prev = h('div.preview');
      const card = h('button.style-card' + (doc.writing === id ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': String(doc.writing === id) },
        prev, h('h3', w.name), h('p', w.tag), h('span.tick', iconEl('check', 14)));
      card.addEventListener('click', () => setWriting(id));
      writingStrip.append(card);
      pickerPreview(prev, doc.paper, id);
    });
  }

  async function pickerPreview(host, paperId, writingId) {
    const { layoutDocument, pagesToSvg } = await import('../doc/engine.js');
    const previewDoc = { ...doc, paper: paperId, writing: writingId, content: { ...doc.content, paragraphs: ['Sample text showing this style.'] } };
    try {
      const { pages } = await layoutDocument(previewDoc);
      host.innerHTML = pagesToSvg([pages[0]])[0];
      const svg = host.querySelector('svg');
      if (svg) { svg.setAttribute('viewBox', '18 58 122 106'); svg.setAttribute('preserveAspectRatio', 'xMinYMin slice'); }
    } catch { /* preview optional */ }
  }

  async function setPaper(id) {
    if (doc.paper === id) return;
    haptic('select');
    doc = { ...doc, paper: id };
    gen.paper = id;
    session.lastPaper = id;
    renderPickers(); renderSide(); badges();
    await draw();
    persist({ paper: id });
  }

  async function setWriting(id) {
    if (doc.writing === id) return;
    haptic('select');
    doc = { ...doc, writing: id };
    gen.writing = id;
    session.lastWriting = id;
    renderPickers(); renderSide(); badges(); renderHuman();
    await draw();
    persist({ writing: id });
  }

  /* ---------- side panel ---------- */
  function renderSide() {
    clear(side);
    if (isDemo) {
      side.append(h('div.card.side-card.stack',
        h('div.demo-ribbon', iconEl('shield', 18), h('span', DEMO_NOTICE)),
        h('p.small.muted', 'The sample marking is part of the page itself and is included in the PDF. Issuer details are intentionally left blank.'),
        h('button.btn.secondary.block.desk-only', { type: 'button', onclick: () => openEditor() }, iconEl('edit', 18), 'Edit details'),
        h('button.btn.primary.block.desk-only', { type: 'button', onclick: (e) => doExport(e.currentTarget) }, iconEl('download', 18), 'Download sample PDF')));
    } else {
      side.append(
        h('div.card.side-card.stack.desk-only',
          h('button.btn.secondary.block', { type: 'button', onclick: () => openEditor() }, iconEl('edit', 18), 'Edit text'),
          h('button.btn.secondary.block', { type: 'button', onclick: () => regenerate() }, iconEl('refresh', 18), 'Write a new version'),
          h('button.btn.primary.block', { type: 'button', onclick: (e) => doExport(e.currentTarget) }, iconEl('download', 18), 'Download PDF'),
          h('p.small.subtle', 'Tap any line on the page to edit it. Edits and style changes are free.')));
    }
    if (dev) side.append(devPanel());
  }

  /* ---------- persistence ---------- */
  const pending = {};
  const flush = debounce(async () => {
    const patch = { ...pending };
    Object.keys(pending).forEach((k) => delete pending[k]);
    saveState.textContent = 'Saving…';
    try {
      const res = await api('document.save', { code: session.code, generationId: gen.id, ...patch });
      Object.assign(gen, { style: res.generation.style, paper: res.generation.paper, writing: res.generation.writing, content: res.generation.content, input: res.generation.input });
      app.remember(gen);
      saveState.textContent = 'Saved';
      setTimeout(() => { if (saveState.textContent === 'Saved') saveState.textContent = ''; }, 1600);
    } catch (e) {
      saveState.textContent = '';
      toast('Couldn’t save your changes: ' + e.message, { tone: 'error' });
    }
  }, 700);
  function persist(patch) { Object.assign(pending, patch); flush(); }

  /* ---------- editor ---------- */
  function openEditor(focusBlock) {
    haptic('tap');
    if (isDemo) return openDemoEditor(focusBlock);
    const c = structuredClone(doc.content);
    const input = structuredClone(doc.input);
    const live = debounce(() => { doc = { ...doc, content: structuredClone(c), input: structuredClone(input) }; draw(); }, 200);
    const area = (value, onInput, { rows = 4, label, id } = {}) => {
      const t = h('textarea.textarea', { rows, 'aria-label': label, 'data-block': id || '' });
      t.value = value;
      t.addEventListener('input', () => { onInput(t.value); live(); });
      return t;
    };
    const line = (value, onInput, label, id) => {
      const i = h('input.input', { value, 'aria-label': label, 'data-block': id || '' });
      i.addEventListener('input', () => { onInput(i.value); live(); });
      return i;
    };
    const parasHost = h('div.stack');
    const drawParas = () => {
      fill(parasHost, ...c.paragraphs.map((p, i) => h('div.field',
        h('div.para-head', h('label', `Paragraph ${i + 1}`),
          c.paragraphs.length > 1 ? h('button.btn.ghost.sm', { type: 'button', onclick: () => { c.paragraphs.splice(i, 1); drawParas(); live(); } }, 'Remove') : null),
        area(p, (v) => { c.paragraphs[i] = v; }, { rows: 5, label: `Paragraph ${i + 1}`, id: 'p' + i }))),
      c.paragraphs.length < 6 ? h('button.btn.ghost.sm', { type: 'button', style: { alignSelf: 'flex-start' }, onclick: () => { c.paragraphs.push(''); drawParas(); } }, iconEl('plus', 16), 'Add paragraph') : null);
    };
    drawParas();
    const s = input.student, r = input.recipient;
    const sheet = openSheet({
      title: 'Edit letter', size: 'lg',
      onClose: () => {
        doc = { ...doc, content: c, input };
        draw();
        persist({ content: c, input });
      },
      content: () => h('div.editor',
        h('div.divider', 'Visuals'),
        h('div.field', h('label', 'Paper style'), paperStrip),
        h('div.field', h('label', 'Handwriting style'), writingStrip),
        h('div.divider', 'Text Content'),
        h('div.field', h('label', 'Subject'), area(c.subject, (v) => { c.subject = v; }, { rows: 2, label: 'Subject', id: 'subject' })),
        h('div.field', h('label', 'Greeting'), line(c.salutation, (v) => { c.salutation = v; }, 'Greeting', 'salutation')),
        parasHost,
        h('div.grid-2',
          h('div.field', h('label', 'Closing'), line(c.closing, (v) => { c.closing = v; }, 'Closing', 'closing')),
          h('div.field', h('label', 'Sign-off'), line(c.signoff, (v) => { c.signoff = v; }, 'Sign-off', 'signoff'))),
        h('div.divider', 'Your details'),
        h('div.field', h('label', 'Name'), line(s.name, (v) => { s.name = v; }, 'Name', 'signature')),
        h('div.grid-3',
          h('div.field', h('label', 'Year'), line(s.year, (v) => { s.year = v; }, 'Year')),
          h('div.field', h('label', 'Div.'), line(s.division, (v) => { s.division = v; }, 'Division')),
          h('div.field', h('label', 'Roll no.'), line(s.rollNo, (v) => { s.rollNo = v; }, 'Roll number'))),
        h('div.field', h('label', 'Addressed to'), line(r.name || '', (v) => { r.name = v; }, 'Recipient name', 'recipient')),
        h('div.field', h('label', 'Designation'), line(r.designation, (v) => { r.designation = v; }, 'Designation')),
        h('div.field', h('label', 'Letter date'), (() => { const d = h('input.input', { type: 'date', value: input.date }); d.addEventListener('change', () => { if (d.value) { input.date = d.value; live(); } }); return d; })()),
        h('button.btn.primary.block', { type: 'button', onclick: () => sheet.close() }, iconEl('check', 18), 'Done'))
    });
    focusIn(sheet, focusBlock);
  }

  function openDemoEditor(focusBlock) {
    const t = TEMPLATES[doc.templateId];
    const fields = { ...doc.fields };
    const live = debounce(() => { doc = { ...doc, fields: { ...fields } }; draw(); }, 200);
    const sheet = openSheet({
      title: 'Edit details', size: 'lg',
      onClose: () => { doc = { ...doc, fields }; draw(); persist({ content: { fields } }); },
      content: () => h('div.editor',
        t.fields.map((f) => {
          const el = f.input === 'textarea' ? h('textarea.textarea', { rows: 3, maxlength: f.max || 300, 'data-block': f.id }) : h('input.input', { type: f.input === 'date' ? 'date' : f.input === 'number' ? 'number' : 'text', maxlength: f.max || 120, 'data-block': f.id });
          el.value = fields[f.id] || '';
          el.addEventListener('input', () => { fields[f.id] = el.value; live(); });
          return h('div.field', h('label', f.label), el);
        }),
        h('div.demo-ribbon', iconEl('shield', 18), h('span', 'The sample marking can’t be removed.')),
        h('button.btn.primary.block', { type: 'button', onclick: () => sheet.close() }, iconEl('check', 18), 'Done'))
    });
    focusIn(sheet, focusBlock);
  }

  function focusIn(sheet, block) {
    if (!block) return;
    setTimeout(() => {
      const el = sheet.panel.querySelector(`[data-block="${CSS.escape(block)}"]`);
      if (el) { el.scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true }); }
    }, 380);
  }

  // tap on the page → edit that block
  pagesEl.addEventListener('click', (e) => {
    const t = e.target.closest('[data-block]');
    if (dev && isDemo) { readout(e); return; }
    if (t) openEditor(t.getAttribute('data-block'));
  });

  /* ---------- more / regenerate ---------- */
  function openMore() {
    const s = openSheet({
      title: 'More', size: 'sm',
      content: () => h('div.stack',
        h('button.btn.secondary.block', { type: 'button', onclick: () => { s.close(); regenerate(); } }, iconEl('refresh', 18), 'Write a new version'),
        h('button.btn.secondary.block', { type: 'button', onclick: () => { s.close(); openEditor(); } }, iconEl('edit', 18), 'Edit text'),
        h('p.small.subtle', 'A new version uses one generation. This version stays in your history.'))
    });
  }

  async function regenerate() {
    const left = app.token.remaining;
    if (!left) { toast('No generations left on this code.', { tone: 'error' }); return; }
    const ok = await confirmSheet({ title: 'Write a new version?', message: `Mistral AI will write a fresh letter from the same details. This uses 1 generation (${left} left). Your current version stays in History.`, confirm: 'Write new version' });
    if (!ok) return;
    const data = {};
    const res = await generate({ action: 'letter.generate', kind: 'letter', data, saveDraft: () => {}, params: { paper: doc.paper, writing: doc.writing, input: doc.input } });
    if (!res) return;
    sessionStorage.setItem('mg.fresh', JSON.stringify({ id: res.generation.id, notice: res.notice || null }));
    navigate('studio/' + res.generation.id);
  }

  /* ---------- export ---------- */
  async function doExport(btn) {
    if (btn.classList.contains('loading')) return;
    haptic('tap');
    btn.classList.add('loading');
    try {
      const { exportPdf } = await import('../doc/engine.js');
      const { blob, fileName, pages } = await exportPdf(doc);
      const file = new File([blob], fileName, { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: fileName });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      haptic('success');
      const canShare = navigator.canShare && navigator.canShare({ files: [file] });
      const s = openSheet({
        title: 'PDF ready', size: 'sm',
        content: () => h('div.stack.center', { style: { alignItems: 'center' } },
          h('div.success-mark', iconEl('check', 34)),
          h('p.muted', `${fileName} · A4 · ${pages} page${pages > 1 ? 's' : ''} · ${Math.round(blob.size / 1024)} KB`),
          isDemo ? h('div.demo-ribbon', iconEl('shield', 18), h('span', 'Contains the SAMPLE marking on every page.')) : null,
          canShare ? h('button.btn.primary.block', { type: 'button', onclick: async () => { try { await navigator.share({ files: [file], title: fileName }); } catch { /* cancelled */ } } }, iconEl('share', 18), 'Share PDF') : null,
          h('a.btn.secondary.block', { href: URL.createObjectURL(blob), target: '_blank', rel: 'noopener' }, iconEl('doc', 18), 'Open PDF'),
          h('button.btn.ghost.block', { type: 'button', onclick: () => s.close() }, 'Done'))
      });
    } catch (e) {
      console.error(e);
      toast('Export failed: ' + e.message, { tone: 'error', ms: 5000 });
    } finally {
      btn.classList.remove('loading');
    }
  }

  /* ---------- developer tools (?dev=1) ---------- */
  let readoutEl = null;
  function readout(e) {
    const svg = e.target.closest('svg');
    if (!svg) return;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const field = e.target.closest('[data-field]')?.getAttribute('data-field');
    readoutEl = readoutEl || document.body.appendChild(h('div.dev-readout.glass-strong'));
    readoutEl.textContent = `x ${p.x.toFixed(1)} mm · y ${p.y.toFixed(1)} mm${field ? ' · field ' + field : ''}`;
    console.info('[template-inspector]', { x: +p.x.toFixed(1), y: +p.y.toFixed(1), field });
  }
  function devPanel() {
    const box = h('div.card.side-card.dev-panel.stack.sm', h('b', 'Developer · font diagnostics'), h('p.subtle', 'Loading…'));
    import('../doc/engine.js').then(async ({ fontDiagnostics }) => {
      const rows = await fontDiagnostics();
      box.replaceChildren(h('b', 'Developer · font diagnostics'),
        h('table', h('tr', h('th', 'id'), h('th', 'PostScript'), h('th', 'glyphs'), h('th', '₹')),
          rows.map((r) => h('tr', h('td', r.id), h('td', r.postscript), h('td', String(r.glyphs)), h('td', r.rupee ? 'yes' : 'no')))),
        h('p.subtle', isDemo ? 'Tap the page to read mm coordinates; dashed boxes are template fields.' : 'Preview and PDF use these exact files.'));
    });
    return box;
  }

  renderPickers();
  renderSide();
  badges();
  await draw({ reveal: !!fresh });
  if (fresh && !fresh.notice) toast(isDemo ? 'Sample ready' : 'Your letter is ready', { tone: 'success' });
  return () => { actions.remove(); readoutEl && readoutEl.remove(); };
}
