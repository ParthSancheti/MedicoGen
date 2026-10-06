/** Student application wizard: type → you → absence → recipient → style → review. */
import { h, todayIso, daysBetween } from '../core/dom.js';
import { haptic } from '../core/haptics.js';
import { session } from '../core/session.js';
import { iconEl } from '../ui/icons.js';
import { app } from '../core/state.js';
import { PAPERS, WRITING, PAPER_ORDER, WRITING_ORDER } from '../doc/styles.js';
import { openFineTune, gearButton, previewCrop } from './fine-tune.js';

const DEV = new URLSearchParams(location.search).get('dev') === '1';
import { longDate } from '../doc/text.js';
import { runWizard, textField, choiceChips } from './wizard.js';
import { generate } from './generate.js';

/** Five voices; ids match TONES_ in apps-script/Letters.js (prompt + offline letter). */
const TONES = [
  { id: 'formal', emoji: '\u{1F393}', label: 'Formal', hint: 'Classic & proper', sample: '\u201cI was unable to attend college from\u2026 I kindly request you to grant me leave.\u201d' },
  { id: 'warm', emoji: '\u{1F60A}', label: 'Warm', hint: 'Polite & friendly', sample: '\u201cI truly value the classes and I would be grateful if you could\u2026\u201d' },
  { id: 'simple', emoji: '\u{270F}\u{FE0F}', label: 'Simple', hint: 'Short, easy words', sample: '\u201cI could not come to college\u2026 Please grant me leave.\u201d' },
  { id: 'sincere', emoji: '\u{1F64F}', label: 'Sincere', hint: 'Apologetic', sample: '\u201cI am sorry that I was not able to attend\u2026 I apologise for the inconvenience.\u201d' },
  { id: 'brief', emoji: '\u{26A1}', label: 'Brief', hint: 'Straight to the point', sample: '\u201cI was absent\u2026 I will cover the missed work.\u201d' }
];

const DEPARTMENTS = ['Computer Engineering', 'Information Technology', 'Electronics & Telecommunication', 'Mechanical Engineering', 'Civil Engineering', 'Electrical Engineering', 'AI & Data Science'];
const YEARS = ['First Year', 'Second Year', 'Third Year', 'Final Year'];
const DESIGNATIONS = ['Head of Department', 'Professor & Head', 'Class Teacher', 'Class Coordinator', 'Principal'];
const TITLES = ['Prof.', 'Dr.', 'Mr.', 'Mrs.', 'Ms.'];
const REASONS = [
  { value: 'illness', label: 'Illness' },
  { value: 'medical', label: 'Medical appointment' },
  { value: 'family', label: 'Family function' },
  { value: 'emergency', label: 'Family emergency' },
  { value: 'travel', label: 'Travel' },
  { value: 'event', label: 'Event / competition' },
  { value: 'other', label: 'Other' }
];
const PHRASES = {
  illness: ['I had high fever', 'I was unwell', 'and was advised rest at home', 'and could not travel to college'],
  medical: ['I had a scheduled medical appointment', 'for a follow-up check-up'],
  family: ['I had to attend my sibling’s wedding', 'a family function at my native place'],
  emergency: ['due to a sudden family emergency', 'I had to travel home urgently'],
  travel: ['I had to travel out of town', 'due to unavoidable travel'],
  event: ['I represented the college at', 'I participated in'],
  other: ['due to unavoidable personal reasons']
};

export function render(root, { navigate }) {
  const profile = session.profile;
  const initial = {
    letterType: 'absence',
    date: todayIso(),
    tone: 'formal',
    paper: PAPER_ORDER.includes(session.lastPaper) ? session.lastPaper : 'classmate',
    writing: WRITING_ORDER.includes(session.lastWriting) ? session.lastWriting : 'neat',
    student: { name: profile.name || '', college: profile.college || '', department: profile.department || '', year: profile.year || '', division: profile.division || '', rollNo: profile.rollNo || '' },
    absence: { from: '', to: '', reasonCategory: '', reason: '', documents: false },
    recipient: { name: profile.hodName || '', designation: profile.designation || 'Head of Department', salutation: profile.salutation || 'Sir' }
  };

  const steps = [
    {
      key: 'type', eyebrow: 'Student application', title: 'What is this application for?',
      text: 'Pick one and we’ll ask only what matters for it.',
      render: (d, ui) => h('div.options', [
        ['absence', 'Absence already taken', 'You missed college and need it approved.', 'history'],
        ['leave', 'Leave in advance', 'You need to be away on upcoming days.', 'calendar']
      ].map(([value, title, text, ic]) => {
        const b = h('button.option' + (d.letterType === value ? '.on' : ''), { type: 'button', 'aria-pressed': String(d.letterType === value) },
          h('span.tile-ic', { style: { background: 'var(--accent-soft)', color: 'var(--accent)', width: '46px', height: '46px', borderRadius: '15px', display: 'grid', placeItems: 'center', flex: 'none' } }, iconEl(ic, 22)),
          h('div.stack.sm', { style: { gap: '2px' } }, h('h3', title), h('p', text)),
          h('span.tick', iconEl('check', 14)));
        b.addEventListener('click', () => { d.letterType = value; ui.changed(); haptic('select'); ui.next(); });
        return b;
      }))
    },
    {
      key: 'student', eyebrow: 'About you', title: 'Who’s writing?', text: 'This goes in the signature and the address. We remember it for next time.',
      render: (d, ui) => h('div.stack',
        textField(ui, 'student.name', { label: 'Your full name', placeholder: 'e.g. Aarav Patil', autocomplete: 'name', max: 60 }),
        textField(ui, 'student.college', { label: 'College', placeholder: 'e.g. Government College of Engineering, Pune', max: 120 }),
        textField(ui, 'student.department', { label: 'Department', placeholder: 'e.g. Computer Engineering', chips: DEPARTMENTS, max: 80 }),
        textField(ui, 'student.year', { label: 'Year / class', placeholder: 'e.g. Third Year', chips: YEARS, max: 30 }),
        h('div.grid-2',
          textField(ui, 'student.division', { label: 'Division', placeholder: 'B', optional: true, max: 10, autocapitalize: 'characters' }),
          textField(ui, 'student.rollNo', { label: 'Roll no.', placeholder: '42', optional: true, max: 20, inputmode: 'text', autocapitalize: 'characters' }))),
      validate: (d) => {
        const e = {};
        if (d.student.name.trim().length < 2) e['student.name'] = 'Please enter your name.';
        if (d.student.college.trim().length < 3) e['student.college'] = 'Please enter your college.';
        if (d.student.department.trim().length < 2) e['student.department'] = 'Please enter your department.';
        if (!d.student.year.trim()) e['student.year'] = 'Please choose or type your year.';
        return e;
      }
    },
    {
      key: 'absence', eyebrow: 'Absence', title: (d) => d.letterType === 'leave' ? 'When will you be away?' : 'When were you absent?',
      text: 'Choose the dates and tell us why, in your own words.',
      render: (d, ui) => {
        const dur = h('div.duration');
        const from = h('input.input', { type: 'date', value: d.absence.from, 'aria-label': 'From date' });
        const to = h('input.input', { type: 'date', value: d.absence.to, 'aria-label': 'To date' });
        const sync = () => {
          d.absence.from = from.value;
          if (from.value && (!to.value || to.value < from.value)) to.value = from.value;
          d.absence.to = to.value;
          to.min = from.value || '';
          const n = daysBetween(d.absence.from, d.absence.to);
          dur.replaceChildren(iconEl('calendar', 22), n > 0
            ? h('div', h('b', n === 1 ? '1 day' : `${n} days`), h('div.subtle', n === 1 ? longDate(d.absence.from) : `${longDate(d.absence.from)} – ${longDate(d.absence.to)}`))
            : h('span.subtle', 'Pick the first and last day'));
          ui.changed();
        };
        from.addEventListener('change', sync); to.addEventListener('change', sync);
        to.addEventListener('input', sync); from.addEventListener('input', sync);
        sync();
        const reasonHost = h('div');
        const drawReason = () => reasonHost.replaceChildren(textField(ui, 'absence.reason', {
          label: 'Reason in your words', type: 'textarea', max: 400, autocapitalize: 'sentences',
          placeholder: 'e.g. I had high fever and was advised rest at home',
          chips: PHRASES[d.absence.reasonCategory] || PHRASES.other, chipMode: 'insert',
          hint: 'Tap a phrase to add it. Only what you write here will be used.'
        }));
        drawReason();
        const docs = h('input', { type: 'checkbox', checked: d.absence.documents, style: { width: '22px', height: '22px', accentColor: 'var(--accent)' } });
        docs.addEventListener('change', () => { d.absence.documents = docs.checked; ui.changed(); haptic('select'); });
        return h('div.stack',
          h('div.grid-2',
            h('div.field', h('label', 'From'), from, ui.error('absence.from')),
            h('div.field', h('label', 'To'), to, ui.error('absence.to'))),
          dur,
          choiceChips(ui.data.absence ? { ...ui, data: d.absence, error: (k) => ui.error('absence.' + k) } : ui, 'reasonCategory', REASONS, { label: 'Reason', onPick: () => drawReason() }),
          reasonHost,
          h('label.row', { style: { gap: '12px', padding: '6px 2px', fontWeight: 600 } }, docs, h('span', 'I’ll attach supporting documents')));
      },
      validate: (d) => {
        const e = {};
        if (!d.absence.from) e['absence.from'] = 'Choose a start date.';
        if (!d.absence.to) e['absence.to'] = 'Choose an end date.';
        const n = daysBetween(d.absence.from, d.absence.to);
        if (d.absence.from && d.absence.to && n < 1) e['absence.to'] = 'End date can’t be before the start.';
        if (n > 120) e['absence.to'] = 'That’s more than 120 days — check the dates.';
        if (!d.absence.reasonCategory) e['absence.reasonCategory'] = 'Choose the closest reason.';
        if (d.absence.reason.trim().length < 4) e['absence.reason'] = 'Write the reason in a few words.';
        return e;
      }
    },
    {
      key: 'recipient', eyebrow: 'Addressed to', title: 'Who will read it?', text: 'Usually your Head of Department. Add their name if you know it.',
      render: (d, ui) => {
        const sal = h('div.segmented', { role: 'group', 'aria-label': 'Salutation' }, ['Sir', 'Madam', 'Sir/Madam'].map((s) => {
          const b = h('button' + (d.recipient.salutation === s ? '.on' : ''), { type: 'button', 'aria-pressed': String(d.recipient.salutation === s) }, 'Respected ' + s);
          b.addEventListener('click', () => { d.recipient.salutation = s; ui.changed(); haptic('select'); sal.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); });
          return b;
        }));
        const nameField = textField(ui, 'recipient.name', { label: 'Name', placeholder: 'e.g. Prof. R. K. Sharma', optional: true, max: 60 });
        const nameInput = nameField.querySelector('input');
        const titles = h('div.chips', TITLES.map((t) => {
          const b = h('button.chip.add', { type: 'button' }, t);
          b.addEventListener('click', () => {
            haptic('select');
            nameInput.value = t + ' ' + nameInput.value.replace(/^(prof|dr|mr|mrs|ms)\.?\s*/i, '');
            nameInput.dispatchEvent(new Event('input'));
            nameInput.focus();
            if (/Mrs|Ms/.test(t)) sal.querySelectorAll('button')[1].click();
            if (t === 'Mr.') sal.querySelectorAll('button')[0].click();
          });
          return b;
        }));
        nameField.insertBefore(titles, nameInput.nextSibling);
        return h('div.stack',
          textField(ui, 'recipient.designation', { label: 'Designation', chips: DESIGNATIONS, placeholder: 'Head of Department', max: 60 }),
          nameField,
          h('div.field', h('label', 'Greeting'), sal));
      },
      validate: (d) => (d.recipient.designation.trim().length < 2 ? { 'recipient.designation': 'Add a designation, e.g. Head of Department.' } : {})
    },
    {
      key: 'style', eyebrow: 'Tone', title: 'How should it sound?', text: 'Pick a voice. The AI writes your letter in this tone using everything you filled in.',
      render: (d, ui) => {
        const grid = h('div.tone-grid', { role: 'radiogroup', 'aria-label': 'Tone of writing' });
        const blurb = h('p.tone-blurb', { 'aria-live': 'polite' });
        const show = () => { const t = TONES.find((x) => x.id === d.tone) || TONES[0]; blurb.replaceChildren(h('b', t.label + ': '), t.sample); };
        TONES.forEach((t) => {
          const tile = h('button.tone-tile' + (d.tone === t.id ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': String(d.tone === t.id), 'aria-label': t.label },
            h('span.tone-emoji', { 'aria-hidden': 'true' }, t.emoji), h('span.tone-label', t.label), h('span.tone-hint', t.hint));
          tile.addEventListener('click', () => {
            d.tone = t.id; ui.changed(); haptic('select');
            grid.querySelectorAll('.tone-tile').forEach((x) => { x.classList.toggle('on', x === tile); x.setAttribute('aria-checked', String(x === tile)); });
            show();
          });
          grid.append(tile);
        });
        show();
        return h('div.stack', grid, blurb);
      }
    },
    {
      key: 'writing', eyebrow: 'Handwriting', title: 'Whose handwriting?', text: 'Four real hands. Each preview is your letter, written exactly as it will print.',
      render: (d, ui) => pickerStep(d, ui, 'writing')
    },
    {
      key: 'paper', eyebrow: 'Paper', title: 'Which paper?', text: 'Pick the sheet it is written on. The handwriting stays the same size on every paper.',
      render: (d, ui) => pickerStep(d, ui, 'paper')
    },
    {
      key: 'review', eyebrow: 'Review', title: 'Ready to write?', text: (d) => `Mistral AI will write your letter using only these details. This uses 1 of your ${app.token.remaining} remaining generations.`,
      render: (d) => {
        const n = daysBetween(d.absence.from, d.absence.to);
        const rows = [
          ['Application', d.letterType === 'leave' ? 'Leave in advance' : 'Absence already taken'],
          ['From', d.student.name],
          ['Class', [d.student.year, d.student.division && 'Div. ' + d.student.division, d.student.rollNo && 'Roll ' + d.student.rollNo].filter(Boolean).join(' · ')],
          ['College', d.student.college],
          ['Dates', n === 1 ? longDate(d.absence.from) : `${longDate(d.absence.from)} – ${longDate(d.absence.to)} (${n} days)`],
          ['Reason', d.absence.reason],
          ['To', [d.recipient.name, d.recipient.designation].filter(Boolean).join(', ')],
          ['Paper', PAPERS[d.paper || 'classmate'].name + ' · ' + (WRITING[d.writing] || WRITING.neat).name + ' (' + ((TONES.find((t) => t.id === d.tone) || TONES[0]).label.toLowerCase()) + ')']
        ];
        return h('div.stack',
          h('div.card', h('dl.summary-dl', rows.map(([k, v]) => h('div', h('dt', k), h('dd', v || '—'))))),
          h('div.notice', iconEl('shield', 18), h('span', 'The AI improves wording and grammar only. It won’t add doctors, diagnoses or anything you didn’t write.')));
      }
    }
  ];

  return runWizard(root, {
    route: 'letter',
    steps,
    initial,
    finishLabel: () => 'Write my letter',
    exit: () => navigate('home'),
    finish: async (d, ctl) => {
      const res = await generate({
        action: 'letter.generate', kind: 'letter', data: d, saveDraft: ctl.saveDraft,
        params: { paper: d.paper, writing: d.writing, settings: d.settings || null, input: { letterType: d.letterType, date: d.date, tone: d.tone, student: d.student, absence: d.absence, recipient: d.recipient } }
      });
      if (!res) return;
      session.profile = { ...d.student, hodName: d.recipient.name, designation: d.recipient.designation, salutation: d.recipient.salutation };
      sessionStorage.setItem('mg.fresh', JSON.stringify({ id: res.generation.id, notice: res.notice || null }));
      navigate('studio/' + res.generation.id);
    }
  });
}

/** Card grid for handwriting or paper, with a fine-tune gear on the selected card. */
function pickerStep(d, ui, kind) {
  const grid = h('div.style-grid');
  const ids = kind === 'writing' ? WRITING_ORDER : PAPER_ORDER;
  const meta = kind === 'writing' ? WRITING : PAPERS;
  const cards = new Map();
  const tune = () => openFineTune({
    doc: tuneDoc(d), tab: kind === 'paper' ? 'page' : 'font',
    onChange: (settings) => { d.settings = settings; ui.changed(); cards.forEach((c, id) => drawPreview(c, id)); }
  });
  const drawPreview = (card, id) => pickerPreview(card.querySelector('.preview'), kind === 'paper' ? id : d.paper || 'classmate', kind === 'writing' ? id : d.writing || 'neat', d, kind === 'paper');
  const mark = () => cards.forEach((card, id) => {
    const on = d[kind] === id;
    card.classList.toggle('on', on);
    card.setAttribute('aria-pressed', String(on));
    card.querySelector('.gear-btn')?.remove();
    if (on && DEV) card.prepend(gearButton(tune)); // precision controls are a developer tool (?dev=1)
  });
  ids.forEach((id) => {
    const m = meta[id];
    const card = h('div.style-card', { role: 'button', tabindex: '0', 'aria-label': m.name },
      h('div.preview'), h('h3', m.name), h('p', kind === 'writing' ? m.tag : m.blurb), h('span.tick', iconEl('check', 14)));
    const pick = () => {
      if (d[kind] === id) return;
      d[kind] = id;
      if (kind === 'writing') session.lastWriting = id; else session.lastPaper = id;
      ui.changed(); haptic('select'); mark();
    };
    card.addEventListener('click', pick);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    cards.set(id, card);
    grid.append(card);
    drawPreview(card, id);
  });
  mark();
  return h('div.stack', grid);
}

function tuneDoc(d) {
  const days = Math.max(1, daysBetween(d.absence.from, d.absence.to) || 1);
  return {
    kind: 'letter', id: 'tune-preview', paper: d.paper || 'classmate', writing: d.writing || 'neat', settings: d.settings || null,
    input: { ...d, absence: { ...d.absence, days } },
    content: { subject: 'Application for leave of absence', salutation: `Respected ${d.recipient.salutation || 'Sir'},`,
      paragraphs: ['I am writing to request leave for the above days. I will complete all the lectures and practical work that I miss with the help of my classmates.'],
      closing: 'Thanking you.', signoff: 'Yours obediently,' }
  };
}

/** Style card preview: the top of the real page, rendered with the student's own details. */
async function pickerPreview(host, paperId, writingId, d, whole = false) {
  const { layoutDocument, pagesToSvg } = await import('../doc/engine.js');
  const days = Math.max(1, daysBetween(d.absence.from, d.absence.to) || 1);
  const period = days === 1 ? longDate(d.absence.from) : `${longDate(d.absence.from)} to ${longDate(d.absence.to)}`;
  const doc = {
    kind: 'letter', id: 'style-preview', paper: paperId, writing: writingId, settings: d.settings || null,
    input: { ...d, absence: { ...d.absence, days } },
    content: {
      subject: `Application for leave ${d.absence.from ? (days === 1 ? 'on ' : 'from ') + period : ''}`.trim(),
      salutation: `Respected ${d.recipient.salutation || 'Sir'},`,
      paragraphs: ['I am a student of ' + (d.student.year || 'Third Year') + ' in the Department of ' + (d.student.department || 'Computer Engineering') + '. I was unable to attend my lectures and practicals on these days, and I request you to kindly grant me leave for this period.'],
      closing: 'Thanking you.', signoff: 'Yours obediently,'
    }
  };
  try {
    const { pages } = await layoutDocument(doc);
    host.innerHTML = pagesToSvg([pages[0]])[0];
    previewCrop(host, whole, pages[0]);
  } catch { /* preview optional */ }
}
