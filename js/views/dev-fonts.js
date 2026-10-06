/**
 * Handwriting Lab (developer only: open #/dev with ?dev=1 or in mock mode).
 * Compare every handwriting profile and paper at real A4 scale, inspect typography metrics, seeds and
 * font loading, run the quality grid, open the precision fine-tune panel and verify PDF embedding.
 */
import { h, clear, fill } from '../core/dom.js';
import { iconEl } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { isMock } from '../core/api.js';
import { PAPERS, PAPER_ORDER, PAPER_LIBRARY, WRITING, WRITING_ORDER, WRITING_LIBRARY } from '../doc/styles.js';
import { FONT_FILES } from '../doc/fonts.js';
import { SAMPLE_INPUT, SAMPLE_CONTENT, QUALITY_INPUT, QUALITY_CONTENT } from '../doc/samples.js';
import { openFineTune } from './fine-tune.js';

const SAMPLES = {
  standard: [SAMPLE_INPUT, SAMPLE_CONTENT],
  quality: [QUALITY_INPUT, QUALITY_CONTENT],
  long: [QUALITY_INPUT, { ...QUALITY_CONTENT, paragraphs: [...QUALITY_CONTENT.paragraphs, ...QUALITY_CONTENT.paragraphs] }]
};

export async function render(root, { navigate }) {
  const allowed = isMock || new URLSearchParams(location.search).get('dev') === '1';
  if (!allowed) { navigate('home'); return; }

  const state = { writing: 'neat', paper: 'classmate', preset: 'natural', seed: 0, sample: 'quality', settings: null, zoom: 1 };
  const select = (opts, value, onChange, label) => {
    const s = h('select.input', { 'aria-label': label, onchange: () => onChange(s.value) }, opts.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
    return s;
  };
  const field = (label, el) => h('div.field', h('label', label), el);

  const preview = h('div.pages', { style: { '--zoom': 1 } });
  const diag = h('div.dev-panel.stack.sm');
  const grid = h('div.lab-grid');

  const controls = h('div.card.lab-controls',
    field('Profile', select(WRITING_LIBRARY.map((id) => [id, (WRITING_ORDER.includes(id) ? '★ ' : '') + WRITING[id].name + ' · ' + WRITING[id].fonts.body]), state.writing, (v) => { state.writing = v; draw(); }, 'Profile')),
    field('Paper', select(PAPER_LIBRARY.map((id) => [id, (PAPER_ORDER.includes(id) ? '★ ' : '') + PAPERS[id].name]), state.paper, (v) => { state.paper = v; draw(); }, 'Paper')),
    field('Humanizer', select([['neat', 'Neat'], ['natural', 'Natural'], ['rushed', 'Rushed']], state.preset, (v) => { state.preset = v; draw(); }, 'Humanizer preset')),
    field('Sample', select([['standard', 'Standard letter'], ['quality', 'Quality sample'], ['long', 'Long (multi-page)']], state.sample, (v) => { state.sample = v; draw(); }, 'Sample')),
    field('Seed', (() => { const i = h('input.input', { type: 'number', min: 0, max: 999, value: '0', 'aria-label': 'Seed' }); i.addEventListener('change', () => { state.seed = Number(i.value) || 0; draw(); }); return i; })()),
    field('Zoom', select([['0.6', '60%'], ['1', '100%'], ['1.6', '160%']], '1', (v) => { preview.style.setProperty('--zoom', v); }, 'Zoom')),
    h('div.row.wrap', { style: { gap: '8px', alignItems: 'flex-end' } },
      h('button.btn.secondary.sm', { type: 'button', onclick: () => openFineTune({ doc: labDoc(), onChange: (s) => { state.settings = s; draw(); } }) }, iconEl('settings', 16), 'Fine-tune'),
      h('button.btn.secondary.sm', { type: 'button', onclick: () => verifyPdf() }, iconEl('download', 16), 'Export & verify PDF'),
      h('button.btn.secondary.sm', { type: 'button', onclick: () => qualityGrid() }, iconEl('template', 16), 'Quality grid'),
      h('button.btn.ghost.sm', { type: 'button', onclick: () => checkMistral() }, iconEl('sparkle', 16), 'Check AI')));

  root.append(h('div.stack.lg',
    h('div.studio-head', h('button.icon-btn', { type: 'button', 'aria-label': 'Back', onclick: () => navigate('home') }, iconEl('back', 20)),
      h('div.grow', h('h1', 'Handwriting Lab'), h('p.subtle.small', 'Developer tool · ★ = shown to students'))),
    controls,
    h('div.lab-main', h('div', preview), h('aside.card.side-card', diag)),
    grid));

  function labDoc(writing = state.writing, paper = state.paper, sample = state.sample) {
    const [input, content] = SAMPLES[sample];
    const settings = { ...(state.settings || {}), human: { ...((state.settings && state.settings.human) || {}), preset: state.preset, seed: state.seed } };
    return { kind: 'letter', id: 'lab', paper, writing, input, content, settings };
  }

  let seq = 0;
  async function draw() {
    const my = ++seq;
    const { layoutDocument, pagesToSvg, getRegistry } = await import('../doc/engine.js');
    let res;
    try { res = await layoutDocument(labDoc()); } catch (e) { fill(diag, h('div.notice.danger', iconEl('alert', 18), h('span', 'Render failed: ' + e.message))); throw e; }
    if (my !== seq) return;
    fill(preview, ...pagesToSvg(res.pages).map((svg, i) => { const f = h('div.page-frame'); f.innerHTML = svg; f.append(h('span.page-no', `Page ${i + 1} of ${res.pages.length}`)); return f; }));
    const reg = await getRegistry();
    const w = WRITING[state.writing];
    const fid = w.fonts.body, meta = FONT_FILES[fid], entry = reg.get(fid), m = reg.metrics(fid), t = res.typography || {};
    const S = res.settings;
    const faceOk = typeof document !== 'undefined' && document.fonts ? document.fonts.check(`16px "${meta.family}"`) : null;
    const row = (k, v) => h('tr', h('th', k), h('td', v));
    const n = (v, d = 2) => (v == null || isNaN(v) ? '—' : Number(v).toFixed(d));
    fill(diag,
      h('b', 'Typography'),
      h('table', h('tbody',
        row('Font file', meta.file), row('Family / PostScript', `${entry.font.familyName} / ${entry.font.postscriptName}`),
        row('Bytes / glyphs', `${entry.bytes.length.toLocaleString()} / ${entry.font.numGlyphs}`),
        row('FontFace loaded', faceOk === null ? 'n/a' : faceOk ? 'yes' : 'NO'),
        row('OpenType features', (entry.font.availableFeatures || []).join(' ') || '—'),
        row('Shaping overrides', meta.features ? JSON.stringify(meta.features) : 'none'),
        row('Units per em', m.unitsPerEm),
        row('x-height (measured / OS/2)', `${n(m.xHeight, 3)} / ${n(m.declared.xHeight, 3)}`),
        row('Cap height (measured / OS/2)', `${n(m.capHeight, 3)} / ${n(m.declared.capHeight, 3)}`),
        row('Ascender / descender (measured)', `${n(m.ascender, 3)} / ${n(m.descender, 3)}`),
        row('Ascent / descent / lineGap (OS/2)', `${n(m.declared.ascent, 3)} / ${n(m.declared.descent, 3)} / ${n(m.declared.lineGap, 3)}`))),
      h('b', 'Layout'),
      h('table', h('tbody',
        row('Base size', `${n(res.sizePt)} pt · ${n(t.sizeMm || res.sizePt * 0.3528)} mm`),
        row('x-height on page', `${n(t.xHeightMm)} mm (target ${n(w.optical)} × line)`),
        row('Line spacing', `${n(S.page.lineGap)} mm ${PAPERS[state.paper].kind === 'plain' ? '(from font metrics)' : '(paper rules)'}`),
        row('Baseline lift above rule', `${n(t.lift)} mm`),
        row('Writing width', `${n(210 - S.page.marginLeft - S.page.marginRight)} mm (${n(S.page.marginLeft)} → ${n(210 - S.page.marginRight)})`),
        row('Pages / glyphs on p1', `${res.pages.length} / ${res.pages[0].items.filter((i) => i.t === 'glyph').length}`),
        row('Seed', `doc "lab" · variation #${state.seed} · ${state.preset}`),
        row('Persona', Object.entries(w.persona || {}).map(([k, v]) => `${k} ${v}`).join(', ') || '—'),
        row('Ink / density', `${S.font.ink} / ${w.density || 1}`))),
      res.warnings.length ? h('div.notice.warn', iconEl('alert', 18), h('span', 'Missing glyphs: ' + res.warnings.join(' '))) : null);
  }

  async function verifyPdf() {
    try {
      const { exportPdf, getRegistry } = await import('../doc/engine.js');
      const doc = labDoc();
      const { blob, pages } = await exportPdf(doc);
      const PDFLib = window.PDFLib;
      const pdf = await PDFLib.PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
      const names = [];
      for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
        if (obj instanceof PDFLib.PDFDict && obj.get(PDFLib.PDFName.of('Type')) === PDFLib.PDFName.of('Font')) names.push(String(obj.get(PDFLib.PDFName.of('BaseFont'))));
      }
      const ps = (await getRegistry()).get(WRITING[state.writing].fonts.body).font.postscriptName;
      const ok = names.some((x) => x.includes(ps)) && !names.some((x) => /Helvetica|Times|Arial|Courier/.test(x));
      if (!ok) throw new Error(`Expected ${ps}, PDF has ${names.join(', ')}`);
      toast(`PDF OK · ${pages} page(s) · embeds ${ps}`, { tone: 'success', ms: 4000 });
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch (e) {
      console.error(e);
      toast('PDF verification FAILED: ' + e.message, { tone: 'error', ms: 8000 });
    }
  }

  async function qualityGrid() {
    const { layoutDocument, pagesToSvg } = await import('../doc/engine.js');
    fill(grid, h('h2.title', 'Quality grid · same text and seed on every paper'));
    const table = h('div.lab-quality', { style: { '--cols': PAPER_ORDER.length } });
    grid.append(table);
    table.append(h('span'), ...PAPER_ORDER.map((p) => h('b.small', PAPERS[p].name)));
    for (const w of WRITING_ORDER) {
      table.append(h('b.small', WRITING[w].name));
      for (const p of PAPER_ORDER) {
        const cell = h('div.page-frame');
        table.append(cell);
        const { pages } = await layoutDocument(labDoc(w, p, 'quality'));
        cell.innerHTML = pagesToSvg([pages[0]])[0];
      }
    }
  }

  async function checkMistral() {
    if (isMock) {
      const r = await fetch('/api/mistral/health').then((x) => x.json()).catch(() => null);
      toast(r && r.keyConfigured ? `Mock backend + real Mistral via dev proxy (${r.model})` : 'Mock: no MISTRAL_API_KEY in .env, letters come from the local mock composer', { ms: 5000 });
    } else {
      const { api } = await import('../core/api.js');
      const { config } = await api('config.get');
      toast(config.aiConfigured ? `Live: Mistral key set (${config.aiModel})` : 'Live: MISTRAL_API_KEY missing, standard letters only', { ms: 5000 });
    }
  }

  await draw();
}
