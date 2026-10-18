# FitTrack – personal food & workout tracker

A free, private PWA. All data stays on your phone (localStorage). No account.

## Files
| File | What it is |
|---|---|
| `index.html` | App shell and bottom navigation |
| `styles.css` | All styling (dark mode default, light mode in Settings) |
| `app.js` | All app logic, split into 16 numbered sections |
| `foods-db.js` | 122 built-in foods (per 100 g) that work offline |
| `manifest.json` | Makes "Add to Home Screen" install it like an app |
| `service-worker.js` | Offline support |
| `icons/` | App icons (PNG + SVG) |

## Put it online with GitHub Pages
1. Create a free account at github.com and click **New repository**. Name it e.g. `fittrack`, set it to **Public**, click **Create**.
2. On the new repo page click **uploading an existing file**, drag in **everything inside this folder** (including the `icons` folder), and click **Commit changes**.
3. Go to **Settings → Pages**. Under "Branch" pick **main** and **/(root)**, click **Save**.
4. Wait 1–2 minutes. Your app is at `https://YOUR-USERNAME.github.io/fittrack/`.

## Install on your phone
- **iPhone (Safari):** open the URL → Share button → **Add to Home Screen**.
- **Android (Chrome):** open the URL → ⋮ menu → **Add to Home screen** / **Install app**.

Open it once while online so it saves itself for offline use.

## Online vs offline
| Works offline | Needs internet |
|---|---|
| Diary, editing, water, goals | Online product search (Open Food Facts) |
| My Foods, recipes, built-in foods | Barcode **lookup** of new products |
| Workout tracker, rest timer, history | First use of the barcode scanner on iPhone and of label OCR (they download a library; usually work offline after) |
| Body weight, charts, backup export/import | AI photo estimate (always, free Gemini key) |

## AI photo estimate (optional, free)
Uses Google Gemini. Go to aistudio.google.com, create an API key, and paste it in Settings → AI photo estimate. The key stays on your phone and is sent only to Google.

## Updating the app later
Upload changed files to GitHub, and in `service-worker.js` raise `CACHE_VERSION` (e.g. `fittrack-v3`). The app will show "A new version is ready – Update".

## Backups
Settings → **Export backup** saves a `.json` file (your Gemini API key is never included). **Import backup** replaces all data with that file. Export regularly: clearing Safari/Chrome website data deletes everything.
