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

**Real Mistral letters while developing:** copy `.env.example` to `.env` and set `MISTRAL_API_KEY=...`. The dev server then proxies the mock backend's AI calls to Mistral (`/api/mistral`), and the key stays in Node. Without a key, a local composer returns letters in Mistral's response format. That composer is **not real AI**. `.env` is git-ignored and the dev server refuses to serve dotfiles.

| Mock item | Value |
|---|---|
| Test access code | `MG-TEST-001`, 3 generations |
| Expired / disabled test codes | `MG-TEST-EXP` / `MG-TEST-OFF` |
| Admin console | `/admin.html`, password `admin` (mock only) |
| Simulate the AI | `?ai=429` · `error` · `garbage` · `invent` · `ok` |
| Reset mock database | `?resetmock=1` |
| Developer tools | `?dev=1` (font diagnostics, template field boxes); `#/dev` font lab with a free **Check Mistral** health check |

Browser walkthroughs (with the dev server running): `node tests/e2e.mjs out/` and `node tests/e2e-admin.mjs out/`.

---

## Enabling Mistral (step by step)

1. Sign in at **https://console.mistral.ai** (Mistral "La Plateforme").
2. **Billing / Plans:** choose a plan. The free *Experiment* plan works for testing, with low rate limits. For real traffic, use a paid *Scale* plan.
3. **API Keys → Create new key.** Copy it once; it is not shown again.
4. In your Apps Script project: **Project Settings → Script Properties → Add** `MISTRAL_API_KEY` = your key.
5. Optional properties: `MISTRAL_MODEL` (default `mistral-small-latest`), `MISTRAL_FALLBACK_MODEL` (default `open-mistral-nemo`), `AI_COOLDOWN_SEC` (default 60).
6. Redeploy the web app (**Deploy → Manage deployments → Edit → New version**).
7. Check it: the admin Overview stops warning about a missing key. In the app's `#/dev` page, **Check Mistral** reports the model.

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
2. Copy every file from `apps-script/` into it (`.js` → `.gs`, or use `clasp push`). Include `appsscript.json`.
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

**Paper × handwriting.**
- **5 papers:** Classmate, Black Margin, Legal Pad, Cream, Plain A4.
- **10 writing styles:** 7 handwriting fonts plus 3 print fonts.
- The student's paper and handwriting choices are saved with the document.

**Human handwriting (`js/doc/handwriting.js`).** Every letter is placed separately, with per-word and per-glyph variation:
- **Glyph shape:** size, rotation and slant, so no two "e"s match.
- **Ink:** pressure changes, and occasional retraced strokes.
- **Lines:** a slowly wandering baseline and slope, and a ragged left margin.
- **Fatigue:** the writing gets looser further down the page.
- **Real slips:** a word written wrong (swapped or dropped letters, or an abandoned half-word), struck through, then rewritten correctly.

All of it is seeded per document, so the preview and the PDF are identical. In the studio, **Neat / Natural / Rushed** controls how strong the effect is; Neat has no slips. Facts (names, dates, numbers) are never "misspelled".

**Demo templates.** Fields come from a millimetre manifest (`js/doc/templates.js`). The fictional backgrounds are generated from it (`node tools/build-templates.mjs`). Every page always carries the SAMPLE marking. There are no signatures, seals, registration numbers or practitioner identities.

> **Not included:** a tool for overlaying text onto the supplied hospital letterhead (`Temp/image1.png`). It carries a real hospital's name, real doctors' registration numbers and a doctor's actual signature and stamp. Filling it would produce documents that look genuinely issued by that doctor. The image is git-ignored and not used.

## Project layout
```
index.html, admin.html, css/, assets/ (brand, fonts, templates), vendor/ (pdf-lib, fontkit, qrcode)
js/config.js            all public configuration
js/core/                api client, session, state, dom, haptics
js/ui/                  aurora background, sheets, toasts, icons
js/views/               landing, access, home, wizards (tone grid), studio, history, referral, dev font lab
js/doc/                 fonts, papers & writing styles, handwriting humaniser, layouts, SVG + PDF renderers, templates
js/mock/                in-browser Apps Script runtime + mock Mistral
apps-script/            backend (Router, Tokens, Generations, Letters (Mistral), Requests, Referrals, Admin, Drive, Messaging, Sheets, Setup)
tests/                  node tests + Playwright walkthroughs
tools/                  dev server (+ Mistral proxy), template background builder
```

## Status: real vs. mocked
- **Implemented and tested locally:**
  - wizard, five-tone prompt, handwriting engine, PDF export with embedded fonts
  - token accounting, idempotency, the two-model fallback chain, fact guard
  - referral rules, admin operations
  - All of this runs the real backend code in mock mode, with 34 unit tests and two browser walkthroughs.
- **Written to Mistral's documented API but not called live from this build environment** (its network blocks api.mistral.ai): the real Mistral request. Test it with your key via `.env` + `npm run dev`, or after deploying.
- **Not executed against Google here:** the Apps Script deployment itself, and the WhatsApp Cloud API path.
