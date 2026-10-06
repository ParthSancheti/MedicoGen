# Medico Gen

A mobile-first document generator for college students. A student unlocks the app with an access code and answers a short guided wizard. **Mistral AI** writes a respectful leave/absence application to their HOD in the tone they pick, and the app sets it in convincingly human handwriting (or clean print) on the paper they choose, exported as a true A4 PDF. There is also a separate, always-watermarked **medical template demonstration**.

- **Frontend:** vanilla HTML/CSS/JS (ES modules), no build step. Any static host works (GitHub Pages, Netlify, Vercel, a web server).
- **Backend:** Google Apps Script + Google Sheets (database) + Google Drive (payment screenshots).
- **AI:** Mistral (`mistral-small-latest`), called from Apps Script only. The key never reaches the browser.

---

## Quick start (mock mode)

```bash
npm run dev          # http://localhost:5173
npm test             # backend + layout/PDF tests (Node 22+)
```

With `apiUrl` empty in `js/config.js`, the app runs in **mock mode**. The *real* Apps Script code in `apps-script/` runs inside the browser against an in-memory Sheets/Drive/Cache stand-in, saved to localStorage.

**Where is the `.env` file?** It is deliberately not in the repository or the zip, because it holds your secret key. Create it yourself from the template:

```bash
cp .env.example .env      # then edit .env and paste your key after MISTRAL_API_KEY=
npm run dev               # the dev server reads .env at start-up
```

The dev server then proxies the mock backend's AI calls to Mistral (`/api/mistral`), and the key stays in Node. Without a key, a local composer returns letters in Mistral's response format. That composer is **not real AI**, and the studio labels such letters **Mock AI (test mode)**. `.env` is git-ignored and the dev server refuses to serve dotfiles. In production the key does **not** go in a file: it goes in Apps Script → Project Settings → Script Properties as `MISTRAL_API_KEY` (see below).

| Mock item | Value |
|---|---|
| Test access code | `MG-TEST-001`, 3 generations |
| Expired / disabled test codes | `MG-TEST-EXP` / `MG-TEST-OFF` |
| Admin console | `/admin.html`, password `admin` (mock only) |
| Simulate the AI | `?ai=429` · `error` · `garbage` · `invent` · `ok` |
| Reset mock database | `?resetmock=1` |
| Developer tools | `?dev=1` shows the Fine-tune gear and template field boxes; `#/dev?dev=1` opens the **Handwriting Lab** (below) |

Browser walkthroughs (with the dev server running): `node tests/e2e.mjs out/` and `node tests/e2e-admin.mjs out/`.

---

## Enabling Mistral (step by step)

1. Sign in at **https://console.mistral.ai** (Mistral "La Plateforme").
2. **Billing / Plans:** choose a plan. The free *Experiment* plan works for testing, with low rate limits. For real traffic, use a paid *Scale* plan.
3. **API Keys → Create new key.** Copy it once; it is not shown again.
4. In your Apps Script project: **Project Settings → Script Properties → Add** `MISTRAL_API_KEY` = your key.
5. Optional properties: `MISTRAL_MODEL` (default `mistral-small-latest`), `MISTRAL_FALLBACK_MODEL` (default `open-mistral-nemo`), `AI_COOLDOWN_SEC` (default 60).
6. Redeploy the web app (**Deploy → Manage deployments → Edit → New version**).
7. Check it: the admin Overview stops warning about a missing key. In the Handwriting Lab (`#/dev?dev=1`), **Check AI** reports the model.

API used: `POST https://api.mistral.ai/v1/chat/completions` with `Authorization: Bearer <key>` and `response_format: { type: "json_schema", json_schema: { name, schema, strict: true } }`. The reply is read from `choices[0].message.content`.

### The fallback chain: the student always gets a finished letter

1. **Primary model with a strict JSON schema** returns `subject`, `salutation`, `paragraphs[]`, `closing` and `signoff`.
2. **If that fails** (bad JSON, server error, timeout, or the fact check rejects it), there is **one** retry on `MISTRAL_FALLBACK_MODEL` in `json_object` mode.
3. **Built-in letter.** If both fail, or on a 429 rate limit (which also starts a short cooldown, so we never hammer the API), the backend writes a deterministic letter. It uses the **same tone** and only the student's own facts.

Every AI answer is validated, then checked for invented facts: any doctor, hospital, diagnosis, medicine or number the student never typed gets the answer thrown out. Raw API errors are never shown to students.

### The five tones ("How should it sound?")
🎓 **Formal** · 😊 **Warm** · ✏️ **Simple** · 🙏 **Sincere** (apologetic) · ⚡ **Brief**

Each tone changes the system prompt and the built-in letter. The prompt receives everything the student entered:
- name, year, division, department, college
- letter type, exact dates and day count
- reason category and the reason in their own words
- whether documents are attached
- the recipient's name, designation and salutation

---

### Letter from a prescription (home screen: "Letter from prescription")
1. **Photo.** The student photographs the prescription their doctor actually gave them. The app shrinks it to at most 1600 px as a JPEG (about 300 KB).
2. **Read.** `prescription.read` (`apps-script/Prescriptions.js`) sends the photo to Mistral's vision model (`MISTRAL_VISION_MODEL`, default `mistral-small-latest`) with a strict JSON schema: patient, age/sex, visit date, symptoms in plain words, written diagnosis, days of rest advised, doctor/clinic.
   - The model is told to transcribe only, never guess. Unreadable fields come back empty and are validated again on the server.
3. **Check.** The student sees what was found. Anything missing is marked "we'll ask you".
   - If the patient name doesn't match the student's name, continuing is blocked until they confirm it is theirs.
4. **Write.** The normal letter wizard opens pre-filled:
   - the dates (visit date + rest days);
   - the reason in plain words, e.g. "I had high fever and body ache and the doctor advised me to rest for 4 days";
   - "documents attached" ticked.
   The student checks every step, and only the final "Write my letter" spends a generation.

**Limits and privacy:**
- Reading is free but limited to 10 photos per code every 6 hours.
- The photo goes to Mistral only. It is never stored in Sheets, Drive or the event log.

**Test mode:** in mock mode without a key, the reader can't see the photo. It returns fixed sample values, and the app says so on both the result and the wizard.

## Do we need Google Apps Script, or is the website alone enough?

**The website alone is not enough.** A static website runs entirely in the student's browser, and anything a browser stores or decides can be edited by that student. Without a server:

- **Access codes and attempt counts could be faked.** Students could edit localStorage, or the JavaScript itself, to unlock the app or give themselves unlimited generations.
- **The Mistral key would be public.** Anyone could copy it from the page source and run up your bill.
- **There is no shared database.** Payment requests, screenshots, issued codes, referrals and admin approvals need one place that every device and the admin see. Browser storage is per-device and per-browser.
- **The admin password can't be checked safely.** It would have to ship inside the website.

**Apps Script is the smallest server that solves all of this, for free.** It keeps the key and password secret, holds the counters in Sheets, and uses `LockService` so two simultaneous taps can't both spend the last generation. Screenshots go to your Drive.

**Alternatives** if you outgrow it: Cloudflare Workers + D1, Supabase, Firebase, or a small Node server. The frontend only talks to one API contract (`js/core/api.js`), so you would swap the backend without touching the UI. For a small product, Apps Script + Sheets is the simplest secure option.

Mock mode is the one exception: it deliberately runs the backend in the browser for testing, and it must never be used in production.

---

## Going live

### 1. Apps Script backend
1. Create a new Apps Script project (script.google.com).
2. Copy every file from `apps-script/` into it (`.js` → `.gs`, or use `clasp push`), including `Prescriptions.js`. Include `appsscript.json`.
3. **Project Settings → Script Properties**, add:
   | Property | Required | Notes |
   |---|---|---|
   | `ADMIN_PASSWORD` | yes | admin console password (checked server-side) |
   | `MISTRAL_API_KEY` | recommended | see *Enabling Mistral*; without it every letter uses the built-in letter |
   | `APP_URL` | recommended | your public site URL (referral links, WhatsApp messages) |
   | `MISTRAL_MODEL`, `MISTRAL_FALLBACK_MODEL`, `AI_COOLDOWN_SEC` | optional | |
   | `MAX_ATTEMPTS`, `REFERRAL_TARGET`, `REFERRAL_REWARD_INR`, `PRICE_INR` | optional | defaults 3 / 5 / 10 / 49 |
   | `SPREADSHEET_ID`, `DRIVE_FOLDER_ID` | auto | created by `setup()` |
   | `WHATSAPP_PROVIDER` (+ `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`) | optional | `link` (default) or `cloud_api` |
4. Run `setup` once and accept the permissions. It needs Sheets, Drive and external-request access (for Mistral).
5. **Deploy → New deployment → Web app**: *Execute as: Me*, *Who has access: Anyone*. Copy the `/exec` URL.

### 2. Frontend
Edit `js/config.js`:
- `apiUrl`: the `/exec` URL. Setting this turns mock mode off.
- `appUrl`, `support.whatsapp`, and `payment` (UPI ID, payee, price, or a QR image).
- `aurora`: the five background colours.

Upload the folder to any static host. Do **not** upload `.env`.

### 3. Operating it (admin console: `/admin.html`)
The admin console works on phone (bottom tabs, cards) and desktop (sidebar, dense table).
- **Requests:** filter, search, view the proof, then approve (this issues a code and opens a prefilled WhatsApp message) or reject with a quick reason.
- **Codes:** create batches, then filter, search, disable, enable, reset, or edit attempts and expiry.
- **Referrals:** progress per referrer; mark ₹ rewards as paid.

---

## How it works

**Access & accounting.** The Tokens sheet is the only authority on remaining generations. Each generation is reserved under `LockService` before the AI call, keyed by an idempotency ID. Retries, double taps and refreshes never consume twice. Editing, restyling and downloading are free.

**Document engine (`js/doc/`).**
- **One set of font files** is used three ways: registered for the on-screen preview, measured with fontkit for line wrapping, and embedded in full in the PDF.
- **One layout, two renderers.** The layout produces items positioned in millimetres. `render-svg.js` (preview) and `render-pdf.js` (export) draw the same items, using the same text matrix for glyph rotation and slant.
- **No silent fallback.** A missing font fails loudly rather than quietly switching to Helvetica.

**Writing × paper (chosen separately).** Students pick from seven curated handwriting profiles and four papers. Every card is drawn by the real renderer: writing cards show several lines of the student's own letter, paper cards show the page's real geometry.

| Writing profile | Font | Character |
|---|---|---|
| Neat & clear | Handlee | upright, even, easy to read |
| Quick & flowing | Caveat | slanted, uses the font's contextual alternates |
| Everyday ballpoint | Mynerve | casual pen, contextual alternates |
| Steady & rounded | Kalam | rounded, darker ink |
| Light & narrow | Shadows Into Light | narrow, quick strokes |
| Slanted pen | Nothing You Could Do | leaning, loose, personal |
| Joined cursive | Cedarville Cursive | joined-up letters; its long loops keep its x-height a little smaller |

| Paper | Geometry |
|---|---|
| Classmate | single-ruled notebook, 7.6 mm lines, red margin |
| Black Margin | grey rules, black margin, 8.0 mm lines |
| Double margin | school page with margins on both sides, 7.8 mm lines |
| Warm cream | unruled; line spacing comes from the font's own metrics |

The other fonts and papers remain in a developer library (Lab only). Fonts are SIL OFL, except Homemade Apple (Apache 2.0); licences are in `assets/fonts/`.

**Metric typography: same size on every line and page.** Each font's x-height, cap height, ascender and descender are measured from its real outlines (fontkit), not guessed from the font size. The base size is then set so that the x-height is a fixed fraction of the line spacing. Print-style profiles therefore look the same size (x-height about 2.9–3.0 mm on Classmate rules). Every hand is capped so ascenders and descenders never collide with the next line, on unruled paper too.
- **Ruled paper:** the paper's rules set the baseline grid.
- **Unruled paper:** spacing comes from the font's metrics.

The size **never** shrinks for a long letter: it continues on page 2 with the same size and grid. Tests check this.

**Glyph pipeline (`js/doc/letter-layout.js`, `js/doc/handwriting.js`).**
1. **Shape.** Each word is shaped with fontkit, which applies kerning and OpenType contextual alternates (Caveat, Mynerve).
2. **Wrap and paginate** using the nominal shaped widths.
3. **Humanize.** Only after the lines are final does the handwriting layer place each glyph by its glyph ID. Humanizing can never change which words share a line, and a final fit pass keeps every line inside the margin.

The writing personality is coherent rather than random jitter:
- **Smooth noise along the line:** neighbouring letters share a tendency in baseline, height, rotation, spacing, slant and ink.
- **Personal variants:** each letter picks one of a few variants per document, so repeated letters differ but stay within limits.
- **Floating words:** each word lifts or dips a little, climbs or sinks along its length, and has its own size, slant and pen pressure. Word gaps are uneven, some words crowd together and some stand apart, and near the right edge the writer crowds the last words in. Every glyph stays within 0.7 mm of its line (Natural), so the writing never leaves its rule.
- **Line variation:** a gentle line drift (±0.35 mm) and a slightly ragged left margin.
- **Slips:** a few words written wrongly, struck through and rewritten. Neat has none, and names, dates and numbers are never touched.

Everything comes from one seeded hash, never `Math.random`, so the preview and the PDF get identical instructions.

**Preview = PDF.**
- **Preview:** the SVG draws each glyph's real outline from the font file.
- **PDF:** the export embeds the same font in full (vector, never rasterized, with a ToUnicode map so the text stays selectable) and draws the same glyph IDs with the same matrix.

**Students see three choices only:** writing, paper, and Neat / Natural / Rushed. Changing any of them is free and never calls the AI.

**Handwriting Lab (`#/dev?dev=1`, or `#/dev` in mock mode).** For developers only:
- **Pick and compare:** any library profile, paper, humanizer preset, sample (standard / quality / long multi-page), seed and zoom.
- **Diagnostics:** font file, family and PostScript name, FontFace load status, OpenType features, measured vs OS/2 metrics, base size, x-height on the page, line-spacing source, baseline lift, writing width, page and glyph counts, seed and persona.
- **Fine-tune:** the full precision sheet (writing, humanizer, page).
- **Export & verify PDF:** checks that the PDF embeds the profile's own font and no standard font, and fails loudly otherwise.
- **Quality grid:** each student profile × the four papers, with the same text and seed.
- **Check AI.**

The same grid as real PDFs + PNGs + a contact sheet, from the command line:

```bash
node tools/quality-sheet.mjs test-output/quality
```

**Demo templates.** Fields come from a millimetre manifest (`js/doc/templates.js`). The fictional backgrounds are generated from it (`node tools/build-templates.mjs`). Every page always carries the SAMPLE marking. There are no signatures, seals, registration numbers or practitioner identities.

> **Not included:** a tool for overlaying text onto the supplied hospital letterhead (`Temp/image1.png`). It carries a real hospital's name, real doctors' registration numbers and a doctor's actual signature and stamp. Filling it would produce documents that look genuinely issued by that doctor. The image is git-ignored and not used.

## Project layout
```
index.html, admin.html, css/, assets/ (brand, fonts, templates), vendor/ (pdf-lib, fontkit, qrcode)
js/config.js            all public configuration
js/core/                api client, session, state, dom, haptics
js/ui/                  aurora background, sheets, toasts, icons
js/views/               landing, access, home, wizards (tone grid), studio, history, referral, Handwriting Lab
js/doc/                 fonts (shaping + measured metrics), papers & writing profiles, glyph-level handwriting layer, layouts, SVG + PDF renderers, templates
js/mock/                in-browser Apps Script runtime + mock Mistral
apps-script/            backend (Router, Tokens, Generations, Letters (Mistral), Requests, Referrals, Admin, Drive, Messaging, Sheets, Setup)
tests/                  node tests + Playwright walkthroughs
tools/                  dev server (+ Mistral proxy), template background builder, quality-sheet (profile × paper PDFs)
```

## Status: real vs. mocked
- **Implemented and tested locally:**
  - wizard, five-tone prompt, handwriting engine, PDF export with embedded fonts
  - token accounting, idempotency, the two-model fallback chain, fact guard
  - referral rules, admin operations
  - metric typography, glyph-level humanizer, pagination without shrinking, preview/PDF parity
  - All of this runs the real backend code in mock mode, with 37 Node tests and two browser walkthroughs.
  - Generation source is labelled honestly in the studio: **Written by AI** (Mistral), **Mock AI (test mode)** or **Standard letter** (fallback).
- **Written to Mistral's documented API but not called live from this build environment** (its network blocks api.mistral.ai): the real Mistral request. Test it with your key via `.env` + `npm run dev`, or after deploying.
- **Not executed against Google here:** the Apps Script deployment itself, and the WhatsApp Cloud API path.
