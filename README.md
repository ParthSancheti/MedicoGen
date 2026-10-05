# Medico Gen

A mobile-first document generator for college students. Students unlock the app with an access code, answer a short guided wizard, and get a respectful leave/absence application to their HOD. Gemini writes it, and the app sets it in real handwriting or clean print and exports it as a true A4 PDF. There is also a separate, always-watermarked **medical template demonstration**.

- **Frontend:** vanilla HTML/CSS/JS (ES modules), no build step. Static hosting works (GitHub Pages, Netlify, any web server).
- **Backend:** Google Apps Script + Google Sheets (database) + Google Drive (payment screenshots).
- **AI:** Gemini through Apps Script only. The key never reaches the browser.

---

## Quick start (mock mode, no credentials)

```bash
npm run dev          # http://localhost:5173
npm test             # backend + layout/PDF tests (Node 18+)
```

With `apiUrl` empty in `js/config.js`, the app runs in **mock mode**. The *real* Apps Script code in `apps-script/` runs inside the browser against an in-memory Sheets/Drive/Cache stand-in, saved to localStorage.

| Mock item | Value |
|---|---|
| Test access code | `MG-TEST-001`, 3 generations |
| Expired / disabled test codes | `MG-TEST-EXP` / `MG-TEST-OFF` |
| Admin console | `/admin.html`, password `admin` (mock only) |
| Simulate Gemini | `?gemini=429` · `error` · `garbage` · `invent` · `ok` |
| Reset mock database | `?resetmock=1` |
| Developer tools | `?dev=1` (font diagnostics, template field boxes + mm coordinate readout) |

In mock mode, the "Gemini" answer comes from a local composer (`js/mock/mock-gemini.js`) that returns the same JSON shape as the real API. **It is not real AI.**

Browser walkthroughs (with the dev server running): `node tests/e2e.mjs out/` and `node tests/e2e-admin.mjs out/`.

---

## Going live

### 1. Apps Script backend
1. Create a new Apps Script project (script.google.com).
2. Copy every file from `apps-script/` into it (`.js` → `.gs`, or use `clasp push`). Include `appsscript.json`.
3. **Project Settings → Script Properties**, add:
   | Property | Required | Notes |
   |---|---|---|
   | `ADMIN_PASSWORD` | yes | admin console password (checked server-side) |
   | `GEMINI_API_KEY` | recommended | from Google AI Studio; without it letters use the standard template |
   | `APP_URL` | recommended | your public site URL (referral links, WhatsApp messages) |
   | `GEMINI_MODEL` | optional | default `gemini-2.5-flash` |
   | `MAX_ATTEMPTS`, `REFERRAL_TARGET`, `REFERRAL_REWARD_INR`, `PRICE_INR` | optional | defaults 3 / 5 / 10 / 49 |
   | `SPREADSHEET_ID`, `DRIVE_FOLDER_ID` | auto | created by `setup()` |
   | `WHATSAPP_PROVIDER` | optional | `link` (default) or `cloud_api` |
   | `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME` | only for `cloud_api` | |
4. Run the `setup` function once and accept the permissions. It creates the database spreadsheet and the proofs folder.
5. Optional: run `seedTestCode` to create `MG-TEST-001` on the real backend.
6. **Deploy → New deployment → Web app**: *Execute as: Me*, *Who has access: Anyone*. Copy the `/exec` URL.

### 2. Frontend
Edit `js/config.js`:
- `apiUrl`: the `/exec` URL. Setting this turns mock mode off.
- `appUrl`, `support.whatsapp`, and `payment` (`upiId`, `payeeName`, `priceInr`, or a `qrImage` path). A UPI QR is generated automatically if no image is set.
- `aurora`: the five background colours.

Then upload the whole folder (including `apps-script/` is harmless; it is only fetched in mock mode) to any static host.

### 3. Operating it
- Students pay by UPI, enter their phone number and UTR, and upload a screenshot. They get a request ID.
- In `/admin.html`: **Requests → Proof → Approve**. This issues a code and gives you a prefilled WhatsApp link to send it.
- **Codes** tab: create batches (attempts, expiry, note), and disable, enable, reset or edit codes.
- **Referrals** tab: see progress and mark ₹ rewards as paid.

---

## How it works

**Access & accounting.** The Tokens sheet is the only authority on remaining generations. Every generation is reserved under `LockService` before the Gemini call, keyed by a client-generated idempotency ID. Retries, double taps and refreshes return the original result and never consume twice. Editing, restyling and downloading are free.

**Gemini.** `Letters.js` sends only the student's facts and requests structured JSON (`subject`, `salutation`, `paragraphs[]`, `closing`, `signoff`) via `responseSchema`. The output is validated and passed through a fact guard: if it mentions doctors, hospitals, diagnoses or numbers the student never typed, it is rejected. On 429/quota errors, a 90-second cooldown starts and the app falls back to a deterministic letter. There are no endless retries, raw errors are never shown, and the student always gets a letter.

**Document engine (`js/doc/`).** `fonts.js` loads one set of TTF files. Each file is registered as a browser `FontFace` (preview), measured with fontkit (line wrapping), and embedded in the PDF with pdf-lib. Layout produces positioned items in millimetres, and both `render-svg.js` (preview) and `render-pdf.js` (export) draw those same items. Preview and PDF therefore share line breaks, page breaks and fonts. If a font is missing, export fails loudly; it never falls back to Helvetica. Fonts are embedded in full because pdf-lib's subsetter drops Kalam glyphs.

**Styles.** Notebook (Kalam handwriting on a ruled page, with subtle seeded per-word variation), Academic (Source Serif 4), Modern (Inter), Classic (Libre Baskerville). All are SIL Open Font License; licences are in `assets/fonts/`.

**Demo templates.** `js/doc/templates.js` defines fields in millimetres. The backgrounds in `assets/templates/` are generated from that same manifest (`node tools/build-templates.mjs`). The layout always adds the SAMPLE marking (top and bottom bands, diagonal repeats, and an issuer note); there is no option to remove it. No signatures, seals, registration numbers or practitioner identities exist anywhere. To use your own background, swap the image path and tune the coordinates with `?dev=1`.

## Project layout
```
index.html, admin.html, css/, assets/ (brand, fonts, templates), vendor/ (pdf-lib, fontkit, qrcode)
js/config.js            all public configuration
js/core/                api client, session, state, dom, haptics
js/ui/                  aurora background, sheets, toasts, icons
js/views/               landing, access, home, wizards, studio, history, referral
js/doc/                 fonts, styles, layouts, SVG + PDF renderers, templates
js/mock/                in-browser Apps Script runtime + mock Gemini
apps-script/            backend (Router, Tokens, Generations, Letters, Requests, Referrals, Admin, Drive, Messaging, Sheets, Setup)
tests/                  node tests + Playwright walkthroughs
tools/                  dev server, template background builder
```

## Status: real vs. mocked
- **Fully implemented, tested locally:** wizard, document engine, PDF export with embedded fonts, token accounting, idempotency, fallback, referral rules, admin operations. All of this runs the real backend code in mock mode.
- **Written for production but not executed against Google here:** the Apps Script deployment itself (Sheets, Drive, LockService, UrlFetch to Gemini), and the WhatsApp Cloud API path. Test these after deploying.
- **The supplied hospital letterhead is not included.** It carries a real hospital's name and real doctors' registration numbers, so the demo templates use fictional "Sample Health Centre" artwork instead.
