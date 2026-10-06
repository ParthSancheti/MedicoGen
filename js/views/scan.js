/**
 * Letter from a prescription: the student photographs the prescription their doctor gave them, the
 * backend reads it (free, no generation spent), the student checks what was found, and the normal
 * letter wizard opens pre-filled. Anything the reader could not find is asked in the wizard.
 */
import { api, ApiError } from '../core/api.js';
import { session } from '../core/session.js';
import { h, fill, todayIso } from '../core/dom.js';
import { haptic } from '../core/haptics.js';
import { iconEl } from '../ui/icons.js';
import { longDate } from '../doc/text.js';
import { newLetterDraft } from './letter-wizard.js';

const MAX_SIDE = 1600;

export function render(root, { navigate }) {
  const input = h('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-label': 'Prescription photo' });
  const body = h('div.stack');
  root.append(h('div.wizard.scan',
    h('div.wiz-top', h('button.icon-btn', { type: 'button', 'aria-label': 'Back', onclick: () => navigate('home') }, iconEl('back', 20))),
    h('div.wiz-q',
      h('span.eyebrow', 'Letter from prescription'),
      h('h1', 'Upload your prescription'),
      h('p', 'Take a clear photo of the prescription your doctor gave you. We read the details and start your leave letter. Reading is free.')),
    body, input));

  input.addEventListener('change', () => { if (input.files && input.files[0]) read(input.files[0]); input.value = ''; });
  const pick = () => { haptic('tap'); input.click(); };
  const manual = () => navigate('letter');

  showPicker();

  function showPicker() {
    fill(body,
      h('button.scan-drop', { type: 'button', onclick: pick },
        h('span.tile-ic', iconEl('scan', 28)),
        h('b', 'Take or choose a photo'),
        h('span.small.muted', 'The whole page, flat, in good light')),
      h('ul.scan-tips.small.muted',
        h('li', 'We read the patient name, visit date, symptoms and the rest your doctor advised.'),
        h('li', 'Your photo is only sent to the reader. It is not saved.'),
        h('li', 'Use your own prescription: the letter is in your name.')),
      h('button.btn.ghost.block', { type: 'button', onclick: manual }, 'Skip and fill in myself'));
  }

  async function read(file) {
    let image, url;
    try {
      ({ image, url } = await shrink(file));
    } catch {
      return showError('We couldn’t open that file. Please choose a JPG or PNG photo.');
    }
    fill(body,
      h('div.scan-preview', h('img', { src: url, alt: 'Your prescription' }), h('div.scan-busy', h('span.spinner'), h('b', 'Reading your prescription…'))));
    try {
      const { details, source } = await api('prescription.read', { code: session.code, image }, { timeoutMs: 90000 });
      haptic('success');
      showResult(details, source, url);
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    }
  }

  function showError(message) {
    haptic('error');
    fill(body,
      h('div.notice.danger', iconEl('alert', 18), h('span', message)),
      h('button.btn.primary.block', { type: 'button', onclick: pick }, iconEl('scan', 18), 'Try another photo'),
      h('button.btn.ghost.block', { type: 'button', onclick: manual }, 'Fill in myself'));
  }

  function showResult(d, source, url) {
    const draft = newLetterDraft();
    const ownName = draft.student.name;
    const mismatch = ownName && d.patientName && !namesMatch(ownName, d.patientName);
    const confirm = h('input', { type: 'checkbox', style: { width: '22px', height: '22px', accentColor: 'var(--accent)', flex: 'none' } });
    const go = h('button.btn.primary.block', { type: 'button', disabled: !!mismatch, onclick: () => start(d, source, draft) }, iconEl('sparkle', 18), 'Continue to my letter');
    confirm.addEventListener('change', () => { go.disabled = !confirm.checked; });

    const missing = [];
    const row = (label, value, need) => {
      if (!value && need) missing.push(need);
      return h('div.rx-row', h('span.muted', label), value ? h('b', value) : h('span.rx-missing', 'Not found, we’ll ask you'));
    };
    const rest = d.restDays ? `${d.restDays} day${d.restDays > 1 ? 's' : ''}` : '';
    fill(body,
      source === 'mock' ? h('div.notice.warn', iconEl('info', 18), h('span', h('b', 'Test mode. '), 'No AI is connected, so these are sample values, not read from your photo.')) : null,
      h('div.card.rx-card',
        h('img.rx-thumb', { src: url, alt: '' }),
        h('div.stack.sm.grow',
          row('Patient', [d.patientName, [d.patientAge, d.patientSex].filter(Boolean).join(' / ')].filter(Boolean).join(', '), 'name'),
          row('Visit date', d.visitDate ? longDate(d.visitDate) : '', 'dates'),
          row('Symptoms', d.complaints.join(', ') || d.diagnosis, 'reason'),
          row('Advised rest', rest || d.advice, 'dates'),
          d.doctorName || d.clinicName ? row('Doctor', [d.doctorName, d.clinicName].filter(Boolean).join(', ')) : null)),
      d.legibility !== 'clear' ? h('p.small.muted', 'Parts of the page were hard to read. You can check and correct everything on the next screens.') : null,
      mismatch ? h('div.notice.danger.stack.sm',
        h('div.row', { style: { gap: '10px' } }, iconEl('alert', 18), h('span', `This prescription is for “${d.patientName}”, but your letter is in the name of “${ownName}”. A leave letter must be backed by your own prescription.`)),
        h('label.row', { style: { gap: '10px', fontWeight: 600 } }, confirm, h('span', 'It is mine, my name is just written differently'))) : null,
      go,
      h('button.btn.ghost.block', { type: 'button', onclick: pick }, 'Use a different photo'));
  }

  function start(d, source, draft) {
    haptic('tap');
    const today = todayIso();
    const from = d.visitDate || '';
    const to = from && d.restDays ? addDays(from, d.restDays - 1) : from;
    if (!draft.student.name && d.patientName) draft.student.name = d.patientName;
    draft.letterType = from && from > today ? 'leave' : 'absence';
    draft.absence = { ...draft.absence, from, to, reasonCategory: 'illness', reason: reasonFrom(d), documents: true };
    draft.fromRx = { source, legibility: d.legibility };
    session.draft = { route: 'letter', step: 0, data: draft };
    navigate('letter');
  }
}

/** The student's reason, in their words, from what the doctor wrote. Nothing is added. */
export function reasonFrom(d) {
  const list = d.complaints.length ? d.complaints : d.diagnosis ? [d.diagnosis.toLowerCase()] : [];
  const what = list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] : list[0] || '';
  let s = what ? `I had ${what}` : 'I was unwell';
  if (d.restDays) s += ` and the doctor advised me to rest for ${d.restDays} day${d.restDays > 1 ? 's' : ''}`;
  return s;
}

export function namesMatch(a, b) {
  const words = (s) => s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  const A = words(a), B = words(b);
  return A.some((w) => B.some((x) => x === w || (w.length > 3 && x.length > 3 && (x.startsWith(w.slice(0, 4)) || w.startsWith(x.slice(0, 4))))));
}

function addDays(iso, n) {
  const t = new Date(iso + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** Downscales the photo to ≤1600 px and re-encodes it as JPEG (~200–400 KB). */
async function shrink(file) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
  const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return { image: c.toDataURL('image/jpeg', 0.82), url };
}
