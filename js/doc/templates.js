/**
 * Demonstration template manifest.
 *
 * Coordinates are millimetres on an A4 page (origin top-left). `y` is the text BASELINE.
 * The background artwork is generated from this same manifest (tools/build-templates.mjs), so the
 * printed blanks and the field positions can never drift apart. To use a different background,
 * replace `background` and tune x/y here — open the studio with ?dev=1 to see field boxes and
 * read coordinates by tapping the page.
 *
 * These are demonstrations only. The renderer always adds the SAMPLE marking; there is no
 * signature, seal, registration number or practitioner identity anywhere in these templates.
 */
export const DEMO_NOTICE = 'SAMPLE / DEMONSTRATION ONLY — NOT A MEDICAL CERTIFICATE';

const common = (y0) => [
  { id: 'date', label: 'Date', x: 150, y: y0, w: 40, input: 'date', required: true },
  { id: 'name', label: 'Name', x: 52, y: y0 + 16, w: 138, input: 'text', required: true, max: 60 },
  { id: 'age', label: 'Age', x: 52, y: y0 + 28, w: 30, input: 'number', max: 3 },
  { id: 'sex', label: 'Sex', x: 104, y: y0 + 28, w: 30, input: 'select', options: ['Female', 'Male', 'Other'] },
  { id: 'institution', label: 'Institution', x: 52, y: y0 + 40, w: 138, input: 'text', max: 90 }
];

export const TEMPLATES = {
  'demo-leave': {
    id: 'demo-leave',
    name: 'Rest advice note',
    blurb: 'Dates of advised rest with a short remark',
    title: 'REST ADVICE NOTE',
    background: 'assets/templates/demo-leave.jpg',
    accent: '#0f6fbf',
    fields: [
      ...common(64),
      { id: 'from', label: 'Rest from', x: 52, y: 122, w: 50, input: 'date', required: true },
      { id: 'to', label: 'Until', x: 130, y: 122, w: 60, input: 'date', required: true },
      { id: 'remarks', label: 'Remarks', x: 52, y: 140, w: 138, input: 'textarea', maxLines: 4, lineGap: 10, max: 300 }
    ]
  },
  'demo-fitness': {
    id: 'demo-fitness',
    name: 'Fitness to resume',
    blurb: 'Return-to-classes note with a resume date',
    title: 'FITNESS TO RESUME NOTE',
    background: 'assets/templates/demo-fitness.jpg',
    accent: '#118a6a',
    fields: [
      ...common(64),
      { id: 'resume', label: 'May resume on', x: 62, y: 122, w: 60, input: 'date', required: true },
      { id: 'remarks', label: 'Remarks', x: 52, y: 140, w: 138, input: 'textarea', maxLines: 4, lineGap: 10, max: 300 }
    ]
  },
  'demo-opd': {
    id: 'demo-opd',
    name: 'Consultation summary',
    blurb: 'Visit summary with notes and general advice',
    title: 'CONSULTATION SUMMARY',
    background: 'assets/templates/demo-opd.jpg',
    accent: '#6b4fd8',
    fields: [
      ...common(64),
      { id: 'notes', label: 'Notes', x: 52, y: 122, w: 138, input: 'textarea', maxLines: 3, lineGap: 10, max: 240, required: true },
      { id: 'advice', label: 'Advice', x: 52, y: 160, w: 138, input: 'textarea', maxLines: 3, lineGap: 10, max: 240 }
    ]
  }
};

export const TEMPLATE_ORDER = ['demo-leave', 'demo-fitness', 'demo-opd'];

/** Where the generated artwork leaves the issuer area empty (never filled by the app). */
export const ISSUER_BOX = { x: 20, y: 206, w: 170, h: 46 };
