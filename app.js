/* =========================================================
   FitTrack – personal food & workout tracker
   Plain JavaScript, no build step. All data lives on this phone.

   File map (search for the "=====" headers):
     1. Constants and data model
     2. Small helpers (dates, numbers, text)
     3. Saving and loading data
     4. Nutrition math
     5. UI building blocks (sheets, toasts, confirm, charts)
     6. Diary screen
     7. Adding food (search + portion)
     8. Foods library and recipes
     9. Barcode scanner
    10. Nutrition label scanner (OCR)
    11. AI photo estimate (Gemini)
    12. Workout tracker
    13. Rest timer
    14. Body weight
    15. Settings, backup and restore
    16. Navigation and app start
   ========================================================= */

'use strict';

/* =========================================================
   1. Constants and data model
   ========================================================= */

const STORE_KEY = 'fittrack_v1';
const APP_VERSION = '1.1.0';

const MEALS = [
  { id: 'breakfast', name: 'Breakfast' },
  { id: 'lunch', name: 'Lunch' },
  { id: 'dinner', name: 'Dinner' },
  { id: 'snacks', name: 'Snacks' }
];

const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar'];

// Google Gemini models for the AI photo estimate (free tier from Google AI Studio)
const AI_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (more accurate)' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (faster, lighter)' }
];
const AI_DEFAULT_MODEL = 'gemini-2.5-flash';

// CDN libraries, only downloaded when you first use the feature
const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
const OFF_BASE = 'https://world.openfoodfacts.org';

/*
  Everything the app saves, in one object (stored as JSON in localStorage).

  settings  – goals, API key, theme, current workout profile, rest timer length
  foods     – "My Foods" library: { [id]: Food }
              Food = { id, name, brand, barcode, source: 'builtin'|'off'|'custom'|'recipe',
                       per100: { kcal, protein, carbs, fat, fiber, sugar },
                       units: [{ name, grams }], lastUsed, useCount, lastAmount: { amount, unit },
                       // recipes only:
                       type: 'recipe', servings, totalGrams, ingredients: [{ foodId, name, grams, per100 }] }
  diary     – { 'YYYY-MM-DD': { breakfast: [Entry], lunch: [], dinner: [], snacks: [], water: ml } }
              Entry = { id, foodId, name, brand, grams, amount, unit, per100, time }
              (per100 is a copy, so editing a food later never changes old days)
  weights   – [{ id, date, kg }]
  workout   – { profiles: { me: Profile, gf: Profile } }
              Profile = { name, templates: [Template], sessions: [Session], active: ActiveSession|null }
              Template = { id, name, exercises: [{ id, name, sets, repMin, repMax, targetWeight, targetSetAt }] }
              Session  = { id, date, templateId, templateName, startedAt, finishedAt,
                           exercises: [{ name, sets: [{ w, reps }] }] }
*/
function defaultData() {
  return {
    version: 1,
    settings: {
      goals: { kcal: 2000, protein: 150, carbs: 200, fat: 65, water: 2500 },
      geminiKey: '',
      aiModel: AI_DEFAULT_MODEL,
      theme: 'dark',
      profile: 'me',
      restSeconds: 90,
      autoRest: true
    },
    foods: {},
    diary: {},
    weights: [],
    workout: {
      profiles: {
        me: emptyProfile('Me'),
        gf: emptyProfile('Girlfriend')
      }
    }
  };
}

function emptyProfile(name) {
  return { name: name, templates: [], sessions: [], active: null };
}

// Data loaded from the phone. Filled in by loadData().
let DB = null;

// Screen state that is NOT saved (which tab, which date, etc.)
const UI = {
  tab: 'diary',
  date: null,              // diary date 'YYYY-MM-DD'
  foodsTab: 'foods',       // 'foods' or 'recipes'
  foodsFilter: '',
  bodyRange: 90            // days shown in the weight chart (0 = all)
};

/* =========================================================
   2. Small helpers
   ========================================================= */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

// Make text safe to put inside HTML
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Short random id
function uid(prefix) {
  return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function pad(n) { return String(n).padStart(2, '0'); }

// Today's date as 'YYYY-MM-DD' in the phone's own time zone
function todayStr() { return dateToStr(new Date()); }

function dateToStr(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function strToDate(s) {
  const p = s.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

function addDays(s, n) {
  const d = strToDate(s);
  d.setDate(d.getDate() + n);
  return dateToStr(d);
}

function daysBetween(a, b) {
  return Math.round((strToDate(b) - strToDate(a)) / 86400000);
}

// "Today", "Yesterday", or "Sat, 17 Oct"
function dayLabel(s) {
  const diff = daysBetween(todayStr(), s);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return shortDate(s, true);
}

function shortDate(s, withWeekday) {
  const d = strToDate(s);
  const opts = { day: 'numeric', month: 'short' };
  if (withWeekday) opts.weekday = 'short';
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-GB', opts);
}

function timeAgo(dateStr) {
  const d = daysBetween(dateStr, todayStr());
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return d + ' days ago';
  return shortDate(dateStr);
}

// Read a number typed by the user. Accepts "12,5" and "12.5". Returns null if empty/invalid.
function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

function round(n, dp) {
  const f = Math.pow(10, dp || 0);
  return Math.round((Number(n) || 0) * f) / f;
}

// Nice display for grams of macros: 0.4 → "0.4", 12.36 → "12", 7.25 → "7.3"
function fmtG(n) {
  n = Number(n) || 0;
  return String(Math.abs(n) < 10 ? round(n, 1) : Math.round(n));
}

function fmtKcal(n) { return String(Math.round(Number(n) || 0)); }

// Weight / grams typed by the user: show up to 2 decimals, no trailing zeros
function fmtNum(n) {
  if (n == null || n === '') return '';
  return String(round(n, 2));
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

// Lower case, no accents – used for searching ("Varškė" matches "varske")
function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function debounce(fn, ms) {
  let t;
  return function () {
    const args = arguments;
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), ms);
  };
}

// Load an external script once (used for the scanner and OCR libraries)
const loadedScripts = {};
function loadScript(url) {
  if (!loadedScripts[url]) {
    loadedScripts[url] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => {
        delete loadedScripts[url];
        reject(new Error('Could not download ' + url.split('/npm/')[1] + '. Are you online?'));
      };
      document.head.appendChild(s);
    });
  }
  return loadedScripts[url];
}

// Simple line icons (stroke uses the current text color)
const ICON = {
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  barcode: '<svg viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M17 8v8"/></svg>',
  label: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M4 19l5-6 4 3 7-9"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z"/><path d="M5 17a3 3 0 0 1 3-3h11"/></svg>',
  pot: '<svg viewBox="0 0 24 24"><path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-6zM2 10h20M9 6V4M15 6V4M12 6V3"/></svg>',
  drop: '<svg viewBox="0 0 24 24"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>'
};

/* =========================================================
   3. Saving and loading data
   ========================================================= */

// Fill in any keys missing from saved data (e.g. after an app update or an old backup)
function withDefaults(data) {
  const base = defaultData();
  const out = Object.assign({}, base, data || {});
  out.settings = Object.assign({}, base.settings, (data && data.settings) || {});
  out.settings.goals = Object.assign({}, base.settings.goals, ((data && data.settings) || {}).goals || {});
  out.foods = out.foods && typeof out.foods === 'object' ? out.foods : {};
  out.diary = out.diary && typeof out.diary === 'object' ? out.diary : {};
  out.weights = Array.isArray(out.weights) ? out.weights : [];
  out.workout = out.workout && out.workout.profiles ? out.workout : base.workout;
  ['me', 'gf'].forEach((p) => {
    const prof = out.workout.profiles[p] || emptyProfile(p === 'me' ? 'Me' : 'Girlfriend');
    prof.templates = Array.isArray(prof.templates) ? prof.templates : [];
    prof.sessions = Array.isArray(prof.sessions) ? prof.sessions : [];
    if (prof.active === undefined) prof.active = null;
    out.workout.profiles[p] = prof;
  });
  if (!out.settings.profile || !out.workout.profiles[out.settings.profile]) out.settings.profile = 'me';
  return out;
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    DB = withDefaults(raw ? JSON.parse(raw) : null);
  } catch (e) {
    console.error('Could not read saved data', e);
    DB = defaultData();
    // Keep the broken data so it is not lost
    try { localStorage.setItem(STORE_KEY + '_broken_' + Date.now(), localStorage.getItem(STORE_KEY)); } catch (_) {}
  }
}

function saveData() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(DB));
    return true;
  } catch (e) {
    console.error(e);
    toast('Could not save – phone storage is full. Export a backup and delete old data.', { ms: 6000 });
    return false;
  }
}

// Used while typing in the workout screen so we don't save on every key press
const saveSoon = debounce(saveData, 400);

/* =========================================================
   4. Nutrition math
   ========================================================= */

function emptyNutrients() {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 };
}

// Clean a per-100 g object: numbers only, never negative
function cleanPer100(p) {
  const out = emptyNutrients();
  NUTRIENTS.forEach((k) => {
    const v = Number(p && p[k]);
    out[k] = isFinite(v) && v > 0 ? round(v, 2) : 0;
  });
  return out;
}

// Nutrients for a given number of grams of a food
function calcNutrients(per100, grams) {
  const f = (Number(grams) || 0) / 100;
  const out = emptyNutrients();
  NUTRIENTS.forEach((k) => { out[k] = (Number(per100 && per100[k]) || 0) * f; });
  return out;
}

function addNutrients(a, b) {
  const out = emptyNutrients();
  NUTRIENTS.forEach((k) => { out[k] = (a[k] || 0) + (b[k] || 0); });
  return out;
}

function entryNutrients(entry) { return calcNutrients(entry.per100, entry.grams); }

function mealTotals(day, mealId) {
  return (day[mealId] || []).reduce((t, e) => addNutrients(t, entryNutrients(e)), emptyNutrients());
}

function dayTotals(day) {
  return MEALS.reduce((t, m) => addNutrients(t, mealTotals(day, m.id)), emptyNutrients());
}

// Day object for a date (not saved until something is added)
function getDay(date) {
  return DB.diary[date] || { breakfast: [], lunch: [], dinner: [], snacks: [], water: 0 };
}

function ensureDay(date) {
  if (!DB.diary[date]) DB.diary[date] = { breakfast: [], lunch: [], dinner: [], snacks: [], water: 0 };
  MEALS.forEach((m) => { if (!Array.isArray(DB.diary[date][m.id])) DB.diary[date][m.id] = []; });
  return DB.diary[date];
}

// Remove a day completely when nothing is left in it (keeps the backup small)
function tidyDay(date) {
  const d = DB.diary[date];
  if (!d) return;
  const empty = MEALS.every((m) => !(d[m.id] || []).length) && !(d.water > 0);
  if (empty) delete DB.diary[date];
}

// "118 g" or "1 piece (118 g)"
function amountLabel(entry) {
  const g = fmtNum(round(entry.grams, 1)) + ' g';
  if (!entry.unit || entry.unit === 'g') return g;
  return fmtNum(entry.amount) + ' ' + entry.unit + ' (' + g + ')';
}

function macroLine(n) {
  return 'P ' + fmtG(n.protein) + ' · C ' + fmtG(n.carbs) + ' · F ' + fmtG(n.fat);
}

/* =========================================================
   5. UI building blocks
   ========================================================= */

/* ---------- Toast (small message at the bottom) ---------- */
let toastTimer = null;
function toast(msg, opts) {
  opts = opts || {};
  const el = $('#toast');
  el.innerHTML = '<span>' + esc(msg) + '</span>' + (opts.action ? '<button type="button">' + esc(opts.action) + '</button>' : '');
  el.hidden = false;
  if (opts.action) {
    el.querySelector('button').onclick = () => { el.hidden = true; opts.onAction && opts.onAction(); };
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, opts.ms || (opts.action ? 5000 : 2500));
}

/* ---------- Sheets (pop-up screens) ----------
   Each sheet adds a browser history entry, so the phone's Back
   button/gesture closes the sheet instead of leaving the app. */
const sheetStack = [];
const popWaiters = [];

function openSheet(opts) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML =
    '<div class="sheet' + (opts.full ? ' full' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
      '<div class="sheet-head"><h2 class="ellipsis">' + esc(opts.title) + '</h2>' + (opts.headExtra || '') +
      '<button type="button" class="icon-btn plain" data-close aria-label="Close">' + ICON.x + '</button></div>' +
      '<div class="sheet-body">' + (opts.body || '') + '</div>' +
      (opts.foot ? '<div class="sheet-foot">' + opts.foot + '</div>' : '') +
    '</div>';
  $('#sheets').appendChild(wrap);
  const sheet = { el: wrap, body: $('.sheet-body', wrap), foot: $('.sheet-foot', wrap), opts: opts, closed: false };
  sheetStack.push(sheet);
  history.pushState({ sheet: sheetStack.length }, '');
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) closeSheet();
  });
  document.body.style.overflow = 'hidden';
  return sheet;
}

function removeTopSheet() {
  const s = sheetStack.pop();
  if (!s) return;
  s.closed = true;
  s.el.remove();
  if (s.opts.onClose) { try { s.opts.onClose(); } catch (e) { console.error(e); } }
  if (!sheetStack.length) document.body.style.overflow = '';
}

window.addEventListener('popstate', () => {
  removeTopSheet();
  const w = popWaiters.shift();
  if (w) w();
});

// Close the top sheet. Returns a promise so callers can wait before opening another one.
function closeSheet() {
  return new Promise((resolve) => {
    if (!sheetStack.length) return resolve();
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    popWaiters.push(finish);
    history.back();
    // Safety net in case the browser does not fire "popstate"
    setTimeout(() => {
      if (!done) {
        const i = popWaiters.indexOf(finish);
        if (i >= 0) popWaiters.splice(i, 1);
        removeTopSheet();
        finish();
      }
    }, 600);
  });
}

async function closeAllSheets() {
  while (sheetStack.length) await closeSheet();
}

/* ---------- Confirm dialog ---------- */
function confirmDialog(message, okLabel, danger) {
  return new Promise((resolve) => {
    let answered = false;
    const s = openSheet({
      title: 'Are you sure?',
      body: '<p>' + esc(message) + '</p>',
      foot: '<button type="button" class="btn" data-no>Cancel</button>' +
            '<button type="button" class="btn ' + (danger ? 'danger' : 'primary') + '" data-yes>' + esc(okLabel || 'OK') + '</button>',
      onClose: () => { if (!answered) resolve(false); }
    });
    s.foot.onclick = async (e) => {
      if (e.target.closest('[data-yes]')) { answered = true; await closeSheet(); resolve(true); }
      if (e.target.closest('[data-no]')) { answered = true; await closeSheet(); resolve(false); }
    };
  });
}

/* ---------- Ask for a number ---------- */
function askNumber(title, label, suffix, initial) {
  return new Promise((resolve) => {
    let answered = false;
    const s = openSheet({
      title: title,
      body: '<label class="field"><span>' + esc(label) + '</span><div class="input-suffix">' +
            '<input class="input big" inputmode="decimal" autocomplete="off" value="' + esc(initial == null ? '' : initial) + '"><em>' + esc(suffix) + '</em></div></label>',
      foot: '<button type="button" class="btn" data-no>Cancel</button><button type="button" class="btn primary" data-yes>OK</button>',
      onClose: () => { if (!answered) resolve(null); }
    });
    const input = $('input', s.body);
    setTimeout(() => { input.focus(); input.select(); }, 50);
    const ok = async () => {
      const v = parseNum(input.value);
      if (v == null) { toast('Please enter a number'); return; }
      answered = true; await closeSheet(); resolve(v);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    s.foot.onclick = async (e) => {
      if (e.target.closest('[data-yes]')) ok();
      if (e.target.closest('[data-no]')) { answered = true; await closeSheet(); resolve(null); }
    };
  });
}

/* ---------- Ask for text ---------- */
function askText(title, label, initial, listId) {
  return new Promise((resolve) => {
    let answered = false;
    const s = openSheet({
      title: title,
      body: '<label class="field"><span>' + esc(label) + '</span><input class="input" autocomplete="off" ' +
            (listId ? 'list="' + listId + '"' : '') + ' value="' + esc(initial || '') + '"></label>' + exerciseDatalist(),
      foot: '<button type="button" class="btn" data-no>Cancel</button><button type="button" class="btn primary" data-yes>OK</button>',
      onClose: () => { if (!answered) resolve(null); }
    });
    const input = $('input', s.body);
    setTimeout(() => input.focus(), 50);
    const ok = async () => {
      const v = input.value.trim();
      if (!v) { toast('Please type a name'); return; }
      answered = true; await closeSheet(); resolve(v);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    s.foot.onclick = (e) => {
      if (e.target.closest('[data-yes]')) ok();
      if (e.target.closest('[data-no]')) { answered = true; closeSheet().then(() => resolve(null)); }
    };
  });
}

/* ---------- Simple line chart (SVG) ----------
   points: [{ date: 'YYYY-MM-DD', y: number }] sorted by date */
function lineChart(points, opts) {
  opts = opts || {};
  const W = 340, H = opts.height || 180;
  const L = 40, R = 12, T = 12, B = 26;
  if (!points.length) return '<p class="muted small center" style="padding:24px 0">No data yet</p>';

  const xs = points.map((p) => strToDate(p.date).getTime());
  const ys = points.map((p) => p.y);
  let minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
  let minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
  if (maxX === minX) { minX -= 86400000; maxX += 86400000; }
  const padY = Math.max((maxY - minY) * 0.15, 1);
  minY -= padY; maxY += padY;

  const sx = (x) => L + (x - minX) / (maxX - minX) * (W - L - R);
  const sy = (y) => T + (1 - (y - minY) / (maxY - minY)) * (H - T - B);

  let grid = '';
  const dp = maxY - minY < 6 ? 1 : 0;   // small range → show one decimal so labels don't repeat
  for (let i = 0; i <= 3; i++) {
    const v = minY + (maxY - minY) * i / 3;
    const y = sy(v);
    grid += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/>' +
            '<text class="axis" x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + round(v, dp) + '</text>';
  }
  const first = points[0].date, last = points[points.length - 1].date;
  grid += '<text class="axis" x="' + L + '" y="' + (H - 6) + '">' + esc(shortDate(first)) + '</text>';
  if (last !== first) grid += '<text class="axis" x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' + esc(shortDate(last)) + '</text>';

  const coords = points.map((p, i) => [sx(xs[i]), sy(p.y)]);
  const path = coords.map((c, i) => (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
  const area = path + ' L' + coords[coords.length - 1][0].toFixed(1) + ' ' + (H - B) + ' L' + coords[0][0].toFixed(1) + ' ' + (H - B) + ' Z';
  const dots = coords.length <= 40 ? coords.map((c) => '<circle class="pt" r="3.5" cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '"/>').join('') : '';

  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.label || 'Chart') + '">' +
    grid + (coords.length > 1 ? '<path class="area" d="' + area + '"/><path class="line" d="' + path + '"/>' : '') + dots + '</svg>';
}

/* ---------- Image helpers (used by OCR and AI photo) ---------- */

// Shrink a photo so it uploads/processes fast. Returns a canvas.
function fileToCanvas(file, maxSide, grayscale) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      if (grayscale) ctx.filter = 'grayscale(1) contrast(1.4)';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not open that image.')); };
    img.src = url;
  });
}

// Two buttons: take a photo with the camera, or pick one from the gallery
function photoPickerHtml() {
  return '<div class="btn-grid">' +
    '<label class="btn primary">' + ICON.camera + ' Take photo<input type="file" accept="image/*" capture="environment" hidden data-photo></label>' +
    '<label class="btn">Choose photo<input type="file" accept="image/*" hidden data-photo></label>' +
  '</div>';
}

/* =========================================================
   6. Diary screen
   ========================================================= */

function renderDiary() {
  const date = UI.date;
  const day = getDay(date);
  const goals = DB.settings.goals;
  const t = dayTotals(day);
  const isToday = date === todayStr();

  // Calorie ring
  const remaining = goals.kcal - t.kcal;
  const over = remaining < 0;
  const C = 2 * Math.PI * 56;
  const pct = goals.kcal > 0 ? clamp(t.kcal / goals.kcal, 0, 1) : 0;

  const macroBar = (key, label) => {
    const eaten = t[key], goal = goals[key];
    const p = goal > 0 ? clamp(eaten / goal * 100, 0, 100) : 0;
    const isOver = goal > 0 && eaten > goal * 1.05;
    return '<div class="macro"><div class="macro-head"><span><i class="dot ' + key + '"></i>' + label + '</span>' +
      '<span><b class="num">' + fmtG(eaten) + '</b><span class="muted num"> / ' + fmtG(goal) + ' g</span></span></div>' +
      '<div class="bar ' + key + (isOver ? ' over' : '') + '"><i style="width:' + p + '%"></i></div></div>';
  };

  const waterGoal = goals.water || 0;
  const water = day.water || 0;
  const waterPct = waterGoal > 0 ? clamp(water / waterGoal * 100, 0, 100) : 0;

  const mealsHtml = MEALS.map((m) => {
    const list = day[m.id] || [];
    const mt = mealTotals(day, m.id);
    const rows = list.length
      ? list.map((e) => {
          const n = entryNutrients(e);
          return '<button type="button" class="entry" data-act="edit-entry" data-meal="' + m.id + '" data-id="' + esc(e.id) + '">' +
            '<div class="grow"><div class="name ellipsis">' + esc(e.name) + '</div>' +
            '<div class="sub ellipsis">' + esc(amountLabel(e)) + ' · ' + macroLine(n) + '</div></div>' +
            '<div class="kcal num">' + fmtKcal(n.kcal) + '<small>kcal</small></div></button>';
        }).join('')
      : '<div class="empty">Nothing logged yet</div>';
    return '<section class="card meal">' +
      '<div class="meal-head"><div><h3>' + m.name + '</h3>' +
      '<div class="kc num">' + (list.length ? fmtKcal(mt.kcal) + ' kcal · ' + macroLine(mt) : '0 kcal') + '</div></div>' +
      '<button type="button" class="add-btn" data-act="add-food" data-meal="' + m.id + '">+ Add</button></div>' +
      rows + '</section>';
  }).join('');

  const screen = $('#screen');
  screen.innerHTML =
    '<div class="topbar"><h1>Diary</h1>' +
      (isToday ? '' : '<button type="button" class="btn sm" data-act="today">Today</button>') + '</div>' +

    '<div class="date-bar">' +
      '<button type="button" class="icon-btn" data-act="prev-day" aria-label="Previous day">' + ICON.left + '</button>' +
      '<label class="date-label">' + esc(dayLabel(date)) +
        '<input type="date" value="' + date + '" data-act="pick-date" aria-label="Pick a date"></label>' +
      '<button type="button" class="icon-btn" data-act="next-day" aria-label="Next day">' + ICON.right + '</button>' +
    '</div>' +

    '<section class="card mt12">' +
      '<div class="summary">' +
        '<div class="ring' + (over ? ' over' : '') + '">' +
          '<svg viewBox="0 0 132 132"><circle class="track" cx="66" cy="66" r="56"/>' +
          '<circle class="fill" cx="66" cy="66" r="56" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - pct)).toFixed(1) + '"/></svg>' +
          '<div class="ring-text"><b>' + fmtKcal(Math.abs(remaining)) + '</b><small>' + (over ? 'kcal over' : 'kcal left') + '</small></div>' +
        '</div>' +
        '<div>' + macroBar('protein', 'Protein') + macroBar('carbs', 'Carbs') + macroBar('fat', 'Fat') + '</div>' +
      '</div>' +
      '<div class="kcal-line">' +
        '<div>Goal<b class="num">' + fmtKcal(goals.kcal) + '</b></div>' +
        '<div class="center">Eaten<b class="num">' + fmtKcal(t.kcal) + '</b></div>' +
        '<div style="text-align:right">Fiber · Sugar<b class="num">' + fmtG(t.fiber) + ' · ' + fmtG(t.sugar) + ' g</b></div>' +
      '</div>' +
    '</section>' +

    '<section class="card">' +
      '<div class="row between"><div><div class="muted small">Water</div>' +
        '<div class="water-amount num">' + water + ' <span class="muted small">/ ' + waterGoal + ' ml</span></div></div>' +
        '<div style="color:var(--water);width:28px;height:28px">' + ICON.drop.replace('<svg ', '<svg style="width:28px;height:28px;stroke:currentColor;fill:none;stroke-width:2" ') + '</div></div>' +
      '<div class="bar water mt8"><i style="width:' + waterPct + '%"></i></div>' +
      '<div class="water-btns">' +
        '<button type="button" class="btn sm" data-act="water" data-ml="250">+250 ml</button>' +
        '<button type="button" class="btn sm" data-act="water" data-ml="500">+500 ml</button>' +
        '<button type="button" class="btn sm" data-act="water-custom">Custom</button>' +
        '<button type="button" class="btn sm" data-act="water" data-ml="-250" aria-label="Remove 250 ml">−</button>' +
      '</div>' +
    '</section>' +

    mealsHtml;

  screen.onclick = (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'prev-day') { UI.date = addDays(UI.date, -1); renderDiary(); }
    if (act === 'next-day') { UI.date = addDays(UI.date, 1); renderDiary(); }
    if (act === 'today') { UI.date = todayStr(); renderDiary(); }
    if (act === 'add-food') openAddFood({ mode: 'meal', meal: a.dataset.meal, date: UI.date });
    if (act === 'edit-entry') {
      const entry = (getDay(UI.date)[a.dataset.meal] || []).find((x) => x.id === a.dataset.id);
      if (entry) openPortion({ mode: 'edit', date: UI.date, meal: a.dataset.meal, entry: entry });
    }
    if (act === 'water') addWater(Number(a.dataset.ml));
    if (act === 'water-custom') {
      askNumber('Add water', 'Amount (use a minus sign to remove)', 'ml', '').then((ml) => { if (ml) addWater(ml); });
    }
  };
  // Date picker
  $('input[type="date"]', screen).onchange = (e) => {
    if (e.target.value) { UI.date = e.target.value; renderDiary(); }
  };
}

function addWater(ml) {
  const date = UI.date;
  const day = ensureDay(date);
  const before = day.water || 0;
  day.water = Math.max(0, Math.round(before + ml));
  tidyDay(date);
  saveData();
  renderDiary();
  if (ml > 0) {
    toast('+' + Math.round(ml) + ' ml water', {
      action: 'Undo',
      onAction: () => { ensureDay(date).water = before; tidyDay(date); saveData(); renderDiary(); }
    });
  }
}

/* =========================================================
   7. Adding food (search + portion)
   ========================================================= */

/* ---------- Library helpers ---------- */

function libraryList() { return Object.values(DB.foods); }

// Find a food by id in My Foods or the built-in list
function findFood(id) {
  return DB.foods[id] || STARTER_FOODS.find((f) => f.id === id) || null;
}

// Put a food into My Foods (or update it) every time it is used
function rememberFood(food, amount, unit) {
  let f = DB.foods[food.id];
  if (!f) {
    f = JSON.parse(JSON.stringify(food));
    if (!f.id) f.id = uid('f_');
    f.per100 = cleanPer100(f.per100);
    f.units = f.units || [];
    f.useCount = 0;
    DB.foods[f.id] = f;
  }
  f.lastUsed = Date.now();
  f.useCount = (f.useCount || 0) + 1;
  if (amount != null) f.lastAmount = { amount: amount, unit: unit || 'g' };
  return f;
}

// How well does a food match the search words? 0 = no match.
function matchScore(food, words) {
  const hay = normalize(food.name + ' ' + (food.brand || ''));
  if (!words.every((w) => hay.includes(w))) return 0;
  const name = normalize(food.name);
  let s = 1;
  if (name.startsWith(words[0])) s += 3;
  if (name === words.join(' ')) s += 5;
  s += Math.min(food.useCount || 0, 20) / 10;
  return s;
}

function searchLocal(query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const lib = libraryList()
    .map((f) => ({ f: f, s: matchScore(f, words) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.f);
  const libIds = new Set(lib.map((f) => f.id));
  const allLibIds = new Set(Object.keys(DB.foods));
  const builtin = STARTER_FOODS
    .filter((f) => !allLibIds.has(f.id) && !libIds.has(f.id))
    .map((f) => ({ f: f, s: matchScore(f, words) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.f);
  return { lib: lib, builtin: builtin };
}

/* ---------- Open Food Facts ---------- */

function offNumber(v) {
  const n = Number(v);
  return isFinite(n) && v !== '' && v != null ? n : null;
}

// Turn an Open Food Facts product into our food format (values per 100 g)
function offToFood(p) {
  const n = p.nutriments || {};
  let kcal = offNumber(n['energy-kcal_100g']);
  if (kcal == null && offNumber(n['energy-kj_100g']) != null) kcal = n['energy-kj_100g'] / 4.184;
  if (kcal == null && offNumber(n['energy_100g']) != null) kcal = n['energy_100g'] / 4.184; // energy_100g is in kJ
  let per100 = {
    kcal: kcal,
    protein: offNumber(n.proteins_100g),
    carbs: offNumber(n.carbohydrates_100g),
    fat: offNumber(n.fat_100g),
    fiber: offNumber(n.fiber_100g),
    sugar: offNumber(n.sugars_100g)
  };
  const servingG = offNumber(p.serving_quantity);
  // Some products only have "per serving" values – convert them to per 100 g
  if (per100.kcal == null && servingG > 0 && offNumber(n['energy-kcal_serving']) != null) {
    const f = 100 / servingG;
    per100 = {
      kcal: n['energy-kcal_serving'] * f,
      protein: (offNumber(n.proteins_serving) || 0) * f,
      carbs: (offNumber(n.carbohydrates_serving) || 0) * f,
      fat: (offNumber(n.fat_serving) || 0) * f,
      fiber: (offNumber(n.fiber_serving) || 0) * f,
      sugar: (offNumber(n.sugars_serving) || 0) * f
    };
  }
  const hasValues = per100.kcal != null;
  const name = (p.product_name || p.product_name_en || p.generic_name || '').trim() || 'Unnamed product';
  return {
    id: 'off_' + (p.code || uid()),
    name: name,
    brand: String(p.brands || '').split(',')[0].trim(),
    barcode: p.code || '',
    source: 'off',
    hasValues: hasValues,
    per100: cleanPer100(per100),
    units: servingG > 0 ? [{ name: 'serving', grams: round(servingG, 1) }] : []
  };
}

const OFF_FIELDS = 'code,product_name,product_name_en,generic_name,brands,nutriments,serving_size,serving_quantity';
const offCache = {};

async function searchOFF(query, signal) {
  const key = normalize(query);
  if (offCache[key]) return offCache[key];
  const url = OFF_BASE + '/cgi/search.pl?search_terms=' + encodeURIComponent(query) +
    '&search_simple=1&action=process&json=1&page_size=25&fields=' + OFF_FIELDS;
  const res = await fetch(url, { signal: signal });
  if (!res.ok) throw new Error('Open Food Facts answered ' + res.status + (res.status === 429 ? ' (too many searches – wait a minute)' : ''));
  const json = await res.json();
  const foods = (json.products || []).map(offToFood).filter((f) => f.hasValues && f.name !== 'Unnamed product');
  offCache[key] = foods;
  return foods;
}

async function lookupBarcodeOFF(code) {
  const url = OFF_BASE + '/api/v2/product/' + encodeURIComponent(code) + '.json?fields=' + OFF_FIELDS;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Open Food Facts answered ' + res.status);
  const json = await res.json();
  if (json.status !== 1 || !json.product) return null;
  json.product.code = json.product.code || code;
  return offToFood(json.product);
}

/* ---------- Food row used in search lists ---------- */
function foodRow(food, extra) {
  const p = food.per100;
  let tags = '';
  if (food.type === 'recipe') tags += '<span class="tag recipe">Recipe</span>';
  else if (DB.foods[food.id]) tags += '<span class="tag mine">Mine</span>';
  if (food.source === 'off' && !DB.foods[food.id]) tags += '<span class="tag online">Online</span>';
  const sub = [food.brand, extra].filter(Boolean).join(' · ');
  return '<button type="button" class="list-item" data-food="' + esc(food.id) + '">' +
    '<div class="grow"><div class="title ellipsis">' + esc(food.name) + tags + '</div>' +
    '<div class="sub ellipsis">' + esc(sub ? sub + ' · ' : '') + macroLine(p) + ' per 100 g</div></div>' +
    '<div class="right num">' + fmtKcal(p.kcal) + '<small>kcal/100g</small></div></button>';
}

/* ---------- Add food sheet ----------
   mode 'meal'       → log to a meal on a date
   mode 'ingredient' → pick an ingredient for a recipe (calls onPick) */
function openAddFood(ctx) {
  const isMeal = ctx.mode === 'meal';
  const mealName = isMeal ? MEALS.find((m) => m.id === ctx.meal).name : '';
  const tools = isMeal
    ? [['scan', ICON.barcode, 'Barcode'], ['label', ICON.label, 'Label'], ['ai', ICON.sparkle, 'AI photo'], ['new', ICON.plus, 'New food']]
    : [['scan', ICON.barcode, 'Barcode'], ['label', ICON.label, 'Label'], ['new', ICON.plus, 'New food']];

  const s = openSheet({
    title: isMeal ? 'Add to ' + mealName : 'Add ingredient',
    full: true,
    body:
      '<div class="search-box">' + ICON.search +
        '<input class="input" type="search" placeholder="Search food or product" autocomplete="off" enterkeyhint="search" data-q></div>' +
      '<div class="tools" style="grid-template-columns:repeat(' + tools.length + ',1fr)">' +
        tools.map((t) => '<button type="button" class="tool" data-tool="' + t[0] + '">' + t[1] + '<span>' + t[2] + '</span></button>').join('') +
      '</div>' +
      '<div data-results></div>'
  });

  const input = $('[data-q]', s.body);
  const results = $('[data-results]', s.body);
  let onlineState = { query: '', status: 'idle', foods: [], error: '' };
  let controller = null;
  // Online results are kept here so tapping one can find it again
  const onlineById = {};

  function draw() {
    const q = input.value.trim();
    let html = '';
    if (!q) {
      const recent = libraryList().filter((f) => f.lastUsed).sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 20);
      if (recent.length) {
        html += '<div class="section-title">Recent</div><div class="card tight">' +
          recent.map((f) => foodRow(f, f.lastAmount ? 'last: ' + fmtNum(f.lastAmount.amount) + ' ' + f.lastAmount.unit : '')).join('') + '</div>';
      } else {
        html += '<div class="empty-big">Type to search ' + STARTER_FOODS.length + ' built-in foods and millions of products online.<br><br>Foods you use are saved to <b>My Foods</b> and show up here.</div>';
      }
    } else {
      const local = searchLocal(q);
      if (local.lib.length) html += '<div class="section-title">My Foods</div><div class="card tight">' + local.lib.slice(0, 30).map((f) => foodRow(f)).join('') + '</div>';
      if (local.builtin.length) html += '<div class="section-title">Built-in</div><div class="card tight">' + local.builtin.slice(0, 20).map((f) => foodRow(f)).join('') + '</div>';

      html += '<div class="section-title">Online · Open Food Facts</div>';
      if (!navigator.onLine) {
        html += '<div class="notice warn">You are offline. Showing My Foods and built-in foods only.</div>';
      } else if (q.length < 3) {
        html += '<div class="muted small" style="padding:0 4px">Type at least 3 letters to search online.</div>';
      } else if (onlineState.query !== q || onlineState.status === 'loading') {
        html += '<div class="row muted small" style="padding:0 4px"><span class="spinner"></span> Searching online…</div>';
      } else if (onlineState.status === 'error') {
        html += '<div class="notice err"><b>Online search failed</b>' + esc(onlineState.error) +
          '<div class="mt8"><button type="button" class="btn sm" data-retry>Try again</button></div></div>';
      } else if (!onlineState.foods.length) {
        html += '<div class="muted small" style="padding:0 4px">No products found online. Try other words, scan the barcode, or tap “New food”.</div>';
      } else {
        html += '<div class="card tight">' + onlineState.foods.map((f) => foodRow(f)).join('') + '</div>';
      }
    }
    results.innerHTML = html;
  }

  const runOnline = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 3 || !navigator.onLine || s.closed) return;
    if (controller) controller.abort();
    controller = new AbortController();
    onlineState = { query: q, status: 'loading', foods: [], error: '' };
    draw();
    try {
      const foods = await searchOFF(q, controller.signal);
      // Hide online items that are already in My Foods
      const mine = foods.filter((f) => !DB.foods[f.id]);
      mine.forEach((f) => { onlineById[f.id] = f; });
      if (input.value.trim() === q) { onlineState = { query: q, status: 'done', foods: mine.slice(0, 20), error: '' }; draw(); }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (input.value.trim() === q) {
        onlineState = { query: q, status: 'error', foods: [], error: navigator.onLine ? err.message : 'You seem to be offline.' };
        draw();
      }
    }
  }, 800);

  input.addEventListener('input', () => { draw(); runOnline(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  draw();
  setTimeout(() => input.focus(), 80);

  s.body.addEventListener('click', (e) => {
    const row = e.target.closest('[data-food]');
    if (row) {
      const food = findFood(row.dataset.food) || onlineById[row.dataset.food];
      if (food) pickFood(food);
      return;
    }
    if (e.target.closest('[data-retry]')) { delete offCache[normalize(input.value)]; onlineState.query = ''; runOnline(); draw(); return; }
    const tool = e.target.closest('[data-tool]');
    if (!tool) return;
    const t = tool.dataset.tool;
    if (t === 'scan') openBarcodeScanner({ onFood: pickFood, forLogging: true });
    if (t === 'label') openLabelScanner({ onSaved: pickFood });
    if (t === 'ai') openAIPhoto({ meal: ctx.meal, date: ctx.date });
    if (t === 'new') openFoodEditor(null, { prefill: { name: input.value.trim() }, onSaved: pickFood });
  });

  function pickFood(food) {
    if (isMeal) openPortion({ mode: 'add', date: ctx.date, meal: ctx.meal, food: food });
    else openPortion({ mode: 'ingredient', food: food, onDone: ctx.onPick });
  }
  return s;
}

/* ---------- Portion sheet: choose amount, see live macros, add ----------
   mode 'add'        → new diary entry   (needs food, date, meal)
   mode 'edit'       → change an entry   (needs entry, date, meal)
   mode 'ingredient' → recipe ingredient (needs food, onDone({ food, grams }))
*/
function openPortion(ctx) {
  const editing = ctx.mode === 'edit';
  // For an existing entry we use its saved nutrition copy
  const food = editing
    ? (findFood(ctx.entry.foodId) || { id: ctx.entry.foodId, name: ctx.entry.name, brand: ctx.entry.brand, per100: ctx.entry.per100, units: [] })
    : ctx.food;
  const per100 = editing ? ctx.entry.per100 : food.per100;
  const libFood = DB.foods[food.id];
  let units = unitsFor(libFood || food);

  // Starting amount: the entry's amount, or the last amount you used for this food, or 100 g
  let amount = 100, unit = 'g';
  if (editing) { amount = ctx.entry.amount != null ? ctx.entry.amount : ctx.entry.grams; unit = ctx.entry.unit || 'g'; }
  else if (libFood && libFood.lastAmount && ctx.mode !== 'ingredient') { amount = libFood.lastAmount.amount; unit = libFood.lastAmount.unit; }
  if (!units.find((u) => u.name === unit)) { unit = 'g'; if (!editing) amount = 100; }
  let meal = ctx.meal;

  const title = editing ? 'Edit entry' : (ctx.mode === 'ingredient' ? 'Ingredient amount' : 'Add food');
  const footHtml = editing
    ? '<button type="button" class="btn danger" data-del>' + ICON.trash + ' Delete</button><button type="button" class="btn primary" data-ok>Save</button>'
    : '<button type="button" class="btn primary" data-ok>' + (ctx.mode === 'ingredient' ? 'Add ingredient' : 'Add to ' + MEALS.find((m) => m.id === meal).name) + '</button>';

  const s = openSheet({
    title: title,
    body:
      '<h3 style="font-size:20px">' + esc(food.name) + '</h3>' +
      '<div class="muted small mt8">' + esc(food.brand ? food.brand + ' · ' : '') + 'Per 100 g: ' + fmtKcal(per100.kcal) + ' kcal · ' + macroLine(per100) + '</div>' +
      '<div class="amount-row mt16">' +
        '<input class="input big" inputmode="decimal" autocomplete="off" aria-label="Amount" data-amount value="' + esc(fmtNum(amount)) + '">' +
        '<select class="input" data-unit aria-label="Unit"></select>' +
      '</div>' +
      '<div class="chips mt12" data-quick></div>' +
      '<div class="portion-macros" data-macros></div>' +
      '<div class="muted small center mt8" data-extra></div>' +
      (ctx.mode !== 'ingredient'
        ? '<div class="section-title">Meal</div><div class="seg" data-meals>' +
            MEALS.map((m) => '<button type="button" data-meal="' + m.id + '"' + (m.id === meal ? ' class="on"' : '') + '>' + m.name + '</button>').join('') + '</div>'
        : '') +
      '<details class="mt16"><summary class="muted small">Add a unit for this food (e.g. 1 piece = 118 g)</summary>' +
        '<div class="unit-row mt8"><input class="input" placeholder="Unit name, e.g. piece" data-newunit-name>' +
        '<input class="input" inputmode="decimal" placeholder="grams" data-newunit-g>' +
        '<button type="button" class="icon-btn" data-newunit aria-label="Save unit">' + ICON.check + '</button></div></details>',
    foot: footHtml
  });

  const amountEl = $('[data-amount]', s.body);
  const unitEl = $('[data-unit]', s.body);

  function fillUnits() {
    unitEl.innerHTML = units.map((u) => '<option value="' + esc(u.name) + '"' + (u.name === unit ? ' selected' : '') + '>' +
      esc(u.name === 'g' ? 'grams' : u.name + ' (' + fmtNum(u.grams) + ' g)') + '</option>').join('');
  }

  function grams() {
    const a = parseNum(amountEl.value);
    const u = units.find((x) => x.name === unit) || units[0];
    return a == null ? null : a * u.grams;
  }

  function update() {
    const g = grams();
    const n = calcNutrients(per100, g || 0);
    $('[data-macros]', s.body).innerHTML =
      '<div class="stat-box kcal"><b class="num">' + fmtKcal(n.kcal) + '</b><span>kcal</span></div>' +
      '<div class="stat-box p"><b class="num">' + fmtG(n.protein) + '</b><span>protein g</span></div>' +
      '<div class="stat-box c"><b class="num">' + fmtG(n.carbs) + '</b><span>carbs g</span></div>' +
      '<div class="stat-box f"><b class="num">' + fmtG(n.fat) + '</b><span>fat g</span></div>';
    $('[data-extra]', s.body).textContent = (g == null ? 'Enter an amount' : (unit === 'g' ? '' : fmtNum(round(g, 1)) + ' g · ')) +
      (g == null ? '' : 'Fiber ' + fmtG(n.fiber) + ' g · Sugar ' + fmtG(n.sugar) + ' g');
    const quick = unit === 'g' ? [50, 100, 150, 200, 250] : [0.5, 1, 1.5, 2, 3];
    $('[data-quick]', s.body).innerHTML = quick.map((q) =>
      '<button type="button" class="chip' + (parseNum(amountEl.value) === q ? ' on' : '') + '" data-q="' + q + '">' + q + (unit === 'g' ? ' g' : '') + '</button>').join('');
  }

  fillUnits();
  update();
  if (!editing) setTimeout(() => { amountEl.focus(); amountEl.select(); }, 80);

  amountEl.addEventListener('input', update);
  amountEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  unitEl.addEventListener('change', () => {
    const oldG = grams();
    unit = unitEl.value;
    // Switching to grams keeps the same weight; switching to a unit starts at 1
    amountEl.value = unit === 'g' ? (oldG != null ? fmtNum(round(oldG, 1)) : '100') : '1';
    update();
  });

  s.body.addEventListener('click', (e) => {
    const q = e.target.closest('[data-q]');
    if (q) { amountEl.value = q.dataset.q; update(); return; }
    const m = e.target.closest('[data-meal]');
    if (m) {
      meal = m.dataset.meal;
      $$('[data-meal]', s.body).forEach((b) => b.classList.toggle('on', b.dataset.meal === meal));
      if (!editing && s.foot) $('[data-ok]', s.foot).textContent = 'Add to ' + MEALS.find((x) => x.id === meal).name;
      return;
    }
    if (e.target.closest('[data-newunit]')) {
      const name = $('[data-newunit-name]', s.body).value.trim();
      const g = parseNum($('[data-newunit-g]', s.body).value);
      if (!name || !g || g <= 0) { toast('Enter a unit name and its weight in grams'); return; }
      if (name.toLowerCase() === 'g') { toast('"g" is already a unit'); return; }
      const f = DB.foods[food.id] || rememberFoodSilently(food);
      f.units = (f.units || []).filter((u) => u.name !== name).concat([{ name: name, grams: g }]);
      saveData();
      units = unitsFor(f);
      unit = name; amountEl.value = '1';
      fillUnits(); update();
      $('details', s.body).open = false;
      toast('Unit saved: 1 ' + name + ' = ' + fmtNum(g) + ' g');
    }
  });

  s.foot.addEventListener('click', async (e) => {
    if (e.target.closest('[data-ok]')) save();
    if (e.target.closest('[data-del]')) deleteEntry();
  });

  async function save() {
    const g = grams();
    if (g == null || g <= 0) { toast('Please enter an amount bigger than 0'); amountEl.focus(); return; }
    const a = parseNum(amountEl.value);

    if (ctx.mode === 'ingredient') {
      const f = rememberFood(food, a, unit);
      saveData();
      await closeSheet();         // portion sheet
      await closeSheet();         // search sheet
      ctx.onDone({ food: f, grams: round(g, 2) });
      return;
    }

    if (editing) {
      const day = ensureDay(ctx.date);
      const list = day[ctx.meal];
      const i = list.findIndex((x) => x.id === ctx.entry.id);
      if (i >= 0) {
        const updated = Object.assign({}, list[i], { grams: round(g, 2), amount: a, unit: unit });
        list.splice(i, 1);
        if (meal === ctx.meal) list.splice(i, 0, updated); else day[meal].push(updated);
      }
      saveData();
      await closeSheet();
      renderDiary();
      toast('Saved');
      return;
    }

    // New entry
    const f = rememberFood(food, a, unit);
    const entry = {
      id: uid('e_'), foodId: f.id, name: f.name, brand: f.brand || '',
      grams: round(g, 2), amount: a, unit: unit,
      per100: cleanPer100(f.per100), time: Date.now()
    };
    ensureDay(ctx.date)[meal].push(entry);
    saveData();
    await closeAllSheets();
    if (UI.tab === 'diary') renderDiary();
    const date = ctx.date, mealId = meal;
    toast('Added ' + f.name, {
      action: 'Undo',
      onAction: () => {
        const list = ensureDay(date)[mealId];
        const k = list.findIndex((x) => x.id === entry.id);
        if (k >= 0) list.splice(k, 1);
        tidyDay(date); saveData(); if (UI.tab === 'diary') renderDiary();
      }
    });
  }

  async function deleteEntry() {
    const day = ensureDay(ctx.date);
    const list = day[ctx.meal];
    const i = list.findIndex((x) => x.id === ctx.entry.id);
    if (i < 0) return;
    const removed = list.splice(i, 1)[0];
    tidyDay(ctx.date);
    saveData();
    await closeSheet();
    renderDiary();
    const date = ctx.date, mealId = ctx.meal;
    toast('Deleted ' + removed.name, {
      action: 'Undo',
      onAction: () => { ensureDay(date)[mealId].splice(i, 0, removed); saveData(); renderDiary(); }
    });
  }
}

// Units for a food: grams first, then its own units
function unitsFor(food) {
  const list = [{ name: 'g', grams: 1 }];
  (food.units || []).forEach((u) => { if (u.name && u.grams > 0 && u.name !== 'g') list.push(u); });
  return list;
}

// Copy a food into My Foods without counting it as "used"
function rememberFoodSilently(food) {
  const f = rememberFood(food);
  f.useCount = Math.max(0, (f.useCount || 1) - 1);
  return f;
}

/* =========================================================
   8. Foods library and recipes
   ========================================================= */

function renderFoods() {
  const all = libraryList();
  const foods = all.filter((f) => f.type !== 'recipe');
  const recipes = all.filter((f) => f.type === 'recipe');
  const showing = UI.foodsTab === 'recipes' ? recipes : foods;
  const words = normalize(UI.foodsFilter).split(/\s+/).filter(Boolean);
  const list = showing
    .filter((f) => !words.length || matchScore(f, words) > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const screen = $('#screen');
  screen.innerHTML =
    '<div class="topbar"><h1>Foods</h1></div>' +
    '<div class="tools" style="margin-top:0">' +
      '<button type="button" class="tool" data-act="scan">' + ICON.barcode + '<span>Scan barcode</span></button>' +
      '<button type="button" class="tool" data-act="label">' + ICON.label + '<span>Scan label</span></button>' +
      '<button type="button" class="tool" data-act="new-food">' + ICON.plus + '<span>New food</span></button>' +
      '<button type="button" class="tool" data-act="new-recipe">' + ICON.pot + '<span>New recipe</span></button>' +
    '</div>' +
    '<div class="seg mt12">' +
      '<button type="button" data-act="tab" data-tab="foods"' + (UI.foodsTab === 'foods' ? ' class="on"' : '') + '>My Foods (' + foods.length + ')</button>' +
      '<button type="button" data-act="tab" data-tab="recipes"' + (UI.foodsTab === 'recipes' ? ' class="on"' : '') + '>Recipes (' + recipes.length + ')</button>' +
    '</div>' +
    '<div class="search-box mt12">' + ICON.search +
      '<input class="input" type="search" placeholder="Filter" value="' + esc(UI.foodsFilter) + '" data-filter></div>' +
    '<div class="mt12" data-list>' + foodsListHtml(list) + '</div>';

  screen.onclick = (e) => {
    const a = e.target.closest('[data-act]');
    const row = e.target.closest('[data-food]');
    if (row) {
      const f = DB.foods[row.dataset.food];
      if (f && f.type === 'recipe') openRecipeEditor(f); else if (f) openFoodEditor(f);
      return;
    }
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'tab') { UI.foodsTab = a.dataset.tab; renderFoods(); }
    if (act === 'scan') openBarcodeScanner({ forLogging: false });
    if (act === 'label') openLabelScanner({});
    if (act === 'new-food') openFoodEditor(null, {});
    if (act === 'new-recipe') openRecipeEditor(null);
  };
  $('[data-filter]', screen).oninput = (e) => {
    UI.foodsFilter = e.target.value;
    const w = normalize(UI.foodsFilter).split(/\s+/).filter(Boolean);
    const filtered = showing.filter((f) => !w.length || matchScore(f, w) > 0).sort((x, y) => x.name.localeCompare(y.name));
    $('[data-list]', screen).innerHTML = foodsListHtml(filtered);
  };
}

function foodsListHtml(list) {
  if (!list.length) {
    return '<div class="empty-big">' + (UI.foodsTab === 'recipes'
      ? 'No recipes yet.<br>Tap <b>New recipe</b> to combine ingredients into one dish.'
      : (UI.foodsFilter ? 'No foods match.' : 'Your library is empty.<br>Every food you log is saved here automatically.')) + '</div>';
  }
  return '<div class="card tight">' + list.map((f) => {
    const extra = f.type === 'recipe'
      ? f.servings + ' serving' + (f.servings === 1 ? '' : 's') + ' · ' + fmtKcal(f.per100.kcal * f.totalGrams / 100 / f.servings) + ' kcal each'
      : '';
    return foodRow(f, extra);
  }).join('') + '</div>';
}

/* ---------- Food editor (new or existing) ----------
   opts.prefill  – starting values (name, brand, barcode, per100, basis, servingGrams)
   opts.onSaved  – called with the saved food (used to log it right away)
   opts.notice   – message shown at the top                                  */
function openFoodEditor(food, opts) {
  opts = opts || {};
  const isNew = !food || !DB.foods[food.id];
  const src = food || {};
  const pre = opts.prefill || {};
  const v = {
    name: src.name || pre.name || '',
    brand: src.brand || pre.brand || '',
    barcode: src.barcode || pre.barcode || '',
    per100: Object.assign(emptyNutrients(), src.per100 || {}, pre.per100 || {}),
    units: JSON.parse(JSON.stringify(src.units || pre.units || []))
  };
  let basis = pre.basis || '100g';          // '100g' or 'serving'
  const hasPrefillValues = !!(src.per100 || pre.per100);

  const numField = (key, label) => {
    const raw = v.per100[key];
    const val = hasPrefillValues && raw != null ? fmtNum(round(raw, 2)) : '';
    return '<label class="field"><span>' + label + '</span><input class="input" inputmode="decimal" autocomplete="off" data-n="' + key + '" value="' + esc(val) + '"></label>';
  };

  const s = openSheet({
    title: isNew ? 'New food' : 'Edit food',
    full: true,
    body:
      (opts.notice ? '<div class="notice ' + (opts.noticeType || 'warn') + '">' + opts.notice + '</div>' : '') +
      '<label class="field"><span>Name</span><input class="input" data-f="name" autocomplete="off" value="' + esc(v.name) + '"></label>' +
      '<div class="field-grid"><label class="field"><span>Brand (optional)</span><input class="input" data-f="brand" autocomplete="off" value="' + esc(v.brand) + '"></label>' +
      '<label class="field"><span>Barcode (optional)</span><input class="input" data-f="barcode" inputmode="numeric" autocomplete="off" value="' + esc(v.barcode) + '"></label></div>' +

      '<div class="section-title">Nutrition values are per</div>' +
      '<div class="seg" data-basis><button type="button" data-b="100g"' + (basis === '100g' ? ' class="on"' : '') + '>100 g / 100 ml</button>' +
        '<button type="button" data-b="serving"' + (basis === 'serving' ? ' class="on"' : '') + '>1 serving</button></div>' +
      '<label class="field mt12" data-serving-wrap' + (basis === 'serving' ? '' : ' hidden') + '><span>Serving size</span><div class="input-suffix">' +
        '<input class="input" inputmode="decimal" data-serving value="' + esc(pre.servingGrams ? fmtNum(pre.servingGrams) : '') + '"><em>g</em></div></label>' +

      '<div class="field-grid three mt12">' +
        numField('kcal', 'Calories (kcal)') + numField('protein', 'Protein (g)') + numField('carbs', 'Carbs (g)') +
        numField('fat', 'Fat (g)') + numField('fiber', 'Fiber (g)') + numField('sugar', 'Sugar (g)') +
      '</div>' +
      '<p class="muted small mt8">Leave calories empty to calculate them from protein, carbs and fat.</p>' +
      (isNew ? '<button type="button" class="btn sm mt12" data-ocr>' + ICON.label + ' Fill from label photo</button>' : '') +

      '<div class="section-title">Units (optional)</div>' +
      '<p class="muted small" style="margin:-4px 4px 10px">e.g. “piece = 118 g” so you can log “1 piece”.</p>' +
      '<div data-units></div>' +
      '<button type="button" class="btn sm" data-addunit>' + ICON.plus + ' Add unit</button>',
    foot: (isNew ? '' : '<button type="button" class="btn danger" data-del>' + ICON.trash + ' Delete</button>') +
          '<button type="button" class="btn primary" data-save>Save' + (opts.onSaved ? ' & continue' : '') + '</button>'
  });

  function drawUnits() {
    $('[data-units]', s.body).innerHTML = v.units.map((u, i) =>
      '<div class="unit-row"><input class="input" placeholder="Unit name" data-uname="' + i + '" value="' + esc(u.name) + '">' +
      '<div class="input-suffix"><input class="input" inputmode="decimal" placeholder="grams" data-ug="' + i + '" value="' + esc(fmtNum(u.grams)) + '"><em>g</em></div>' +
      '<button type="button" class="icon-btn" data-delunit="' + i + '" aria-label="Remove unit">' + ICON.x + '</button></div>').join('');
  }
  drawUnits();
  if (isNew && !v.name) setTimeout(() => $('[data-f="name"]', s.body).focus(), 80);

  s.body.addEventListener('input', (e) => {
    if (e.target.dataset.uname != null) v.units[e.target.dataset.uname].name = e.target.value.trim();
    if (e.target.dataset.ug != null) v.units[e.target.dataset.ug].grams = parseNum(e.target.value);
  });

  s.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-b]');
    if (b) {
      basis = b.dataset.b;
      $$('[data-b]', s.body).forEach((x) => x.classList.toggle('on', x.dataset.b === basis));
      $('[data-serving-wrap]', s.body).hidden = basis !== 'serving';
      return;
    }
    if (e.target.closest('[data-addunit]')) { v.units.push({ name: '', grams: null }); drawUnits(); $$('[data-uname]', s.body).pop().focus(); return; }
    const du = e.target.closest('[data-delunit]');
    if (du) { v.units.splice(Number(du.dataset.delunit), 1); drawUnits(); return; }
    if (e.target.closest('[data-ocr]')) {
      openLabelScanner({ fillOnly: true, onParsed: (p) => fillFromOCR(p) });
    }
  });

  // Put values read from a label photo into this form
  function fillFromOCR(p) {
    NUTRIENTS.forEach((k) => {
      if (p[k] != null) $('[data-n="' + k + '"]', s.body).value = fmtNum(round(p[k], 1));
    });
    basis = p.basis || '100g';
    $$('[data-b]', s.body).forEach((x) => x.classList.toggle('on', x.dataset.b === basis));
    $('[data-serving-wrap]', s.body).hidden = basis !== 'serving';
    if (p.servingGrams) $('[data-serving]', s.body).value = fmtNum(p.servingGrams);
    toast('Values filled – please check them');
  }

  s.foot.addEventListener('click', async (e) => {
    if (e.target.closest('[data-del]')) {
      const ok = await confirmDialog('Delete “' + food.name + '” from My Foods? Days where you already logged it are not changed.', 'Delete', true);
      if (!ok) return;
      delete DB.foods[food.id];
      saveData();
      await closeSheet();
      rerender();
      toast('Food deleted');
      return;
    }
    if (!e.target.closest('[data-save]')) return;

    const name = $('[data-f="name"]', s.body).value.trim();
    if (!name) { toast('Please enter a name'); return; }
    const vals = {};
    NUTRIENTS.forEach((k) => { vals[k] = parseNum($('[data-n="' + k + '"]', s.body).value); });
    const negative = NUTRIENTS.some((k) => vals[k] != null && vals[k] < 0);
    if (negative) { toast('Values cannot be negative'); return; }
    if (vals.kcal == null) {
      if (vals.protein == null && vals.carbs == null && vals.fat == null) { toast('Enter calories or protein/carbs/fat'); return; }
      vals.kcal = (vals.protein || 0) * 4 + (vals.carbs || 0) * 4 + (vals.fat || 0) * 9;
    }
    let units = v.units.filter((u) => u.name && u.grams > 0 && u.name.toLowerCase() !== 'g');
    if (basis === 'serving') {
      const sg = parseNum($('[data-serving]', s.body).value);
      if (!sg || sg <= 0) { toast('Enter the serving size in grams'); return; }
      NUTRIENTS.forEach((k) => { if (vals[k] != null) vals[k] = vals[k] * 100 / sg; });
      if (!units.find((u) => u.name === 'serving')) units = units.concat([{ name: 'serving', grams: sg }]);
    }
    const barcode = $('[data-f="barcode"]', s.body).value.replace(/\D/g, '');

    const id = (food && food.id) || (barcode ? 'off_' + barcode : uid('f_'));
    const existing = DB.foods[id] || {};
    const saved = Object.assign({}, existing, (food && !DB.foods[food.id]) ? food : {}, {
      id: id,
      name: name,
      brand: $('[data-f="brand"]', s.body).value.trim(),
      barcode: barcode,
      source: (food && food.source) || existing.source || 'custom',
      per100: cleanPer100(vals),
      units: units
    });
    delete saved.hasValues;
    DB.foods[id] = saved;
    saveData();
    await closeSheet();
    if (opts.onSaved) opts.onSaved(saved);
    else { rerender(); toast('Saved to My Foods'); }
  });
}

/* ---------- Recipe editor ---------- */
function openRecipeEditor(recipe) {
  const isNew = !recipe;
  const r = recipe ? JSON.parse(JSON.stringify(recipe)) : { name: '', servings: 1, ingredients: [] };

  const s = openSheet({
    title: isNew ? 'New recipe' : 'Edit recipe',
    full: true,
    body:
      '<label class="field"><span>Recipe name</span><input class="input" data-name autocomplete="off" placeholder="e.g. Chicken pasta" value="' + esc(r.name) + '"></label>' +
      '<label class="field"><span>Number of servings this makes</span><input class="input" inputmode="decimal" data-servings value="' + esc(fmtNum(r.servings)) + '"></label>' +
      '<div class="section-title">Ingredients</div>' +
      '<div data-ings></div>' +
      '<button type="button" class="btn block mt12" data-add>' + ICON.plus + ' Add ingredient</button>' +
      '<div class="section-title">Totals</div><div data-totals></div>',
    foot: (isNew ? '' : '<button type="button" class="btn danger" data-del>' + ICON.trash + ' Delete</button>') +
          '<button type="button" class="btn primary" data-save>Save recipe</button>'
  });

  function totals() {
    let n = emptyNutrients(), g = 0;
    r.ingredients.forEach((ing) => { n = addNutrients(n, calcNutrients(ing.per100, ing.grams)); g += Number(ing.grams) || 0; });
    return { n: n, g: g };
  }

  function drawTotals() {
    const t = totals();
    const sv = parseNum($('[data-servings]', s.body).value) || 1;
    const per = {};
    NUTRIENTS.forEach((k) => { per[k] = t.n[k] / sv; });
    $('[data-totals]', s.body).innerHTML =
      '<div class="card"><div class="row between"><span class="muted">Whole recipe</span><b class="num">' + fmtKcal(t.n.kcal) + ' kcal</b></div>' +
      '<div class="muted small num mt8">' + fmtNum(round(t.g, 1)) + ' g · ' + macroLine(t.n) + '</div></div>' +
      '<div class="card"><div class="row between"><span class="muted">Per serving (1 of ' + fmtNum(sv) + ')</span><b class="num" style="color:var(--accent)">' + fmtKcal(per.kcal) + ' kcal</b></div>' +
      '<div class="muted small num mt8">' + fmtNum(round(t.g / sv, 1)) + ' g · ' + macroLine(per) + '</div></div>';
  }

  function drawIngredients() {
    $('[data-ings]', s.body).innerHTML = r.ingredients.length
      ? r.ingredients.map((ing, i) => {
          const n = calcNutrients(ing.per100, ing.grams);
          return '<div class="ing-row"><div class="grow"><div class="bold ellipsis">' + esc(ing.name) + '</div>' +
            '<div class="muted tiny num" data-ingk="' + i + '">' + fmtKcal(n.kcal) + ' kcal · ' + macroLine(n) + '</div></div>' +
            '<div class="input-suffix"><input class="input" inputmode="decimal" data-ing="' + i + '" value="' + esc(fmtNum(ing.grams)) + '"><em>g</em></div>' +
            '<button type="button" class="icon-btn plain" data-rm="' + i + '" aria-label="Remove">' + ICON.x + '</button></div>';
        }).join('')
      : '<div class="muted small" style="padding:4px">No ingredients yet. Example: 200 g chicken breast + 200 g cooked pasta.</div>';
    drawTotals();
  }
  drawIngredients();
  if (isNew) setTimeout(() => $('[data-name]', s.body).focus(), 80);

  s.body.addEventListener('input', (e) => {
    if (e.target.dataset.ing != null) {
      const i = Number(e.target.dataset.ing);
      r.ingredients[i].grams = parseNum(e.target.value) || 0;
      const n = calcNutrients(r.ingredients[i].per100, r.ingredients[i].grams);
      $('[data-ingk="' + i + '"]', s.body).textContent = fmtKcal(n.kcal) + ' kcal · ' + macroLine(n);
      drawTotals();
    }
    if (e.target.matches('[data-servings]')) drawTotals();
  });

  s.body.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { r.ingredients.splice(Number(rm.dataset.rm), 1); drawIngredients(); return; }
    if (e.target.closest('[data-add]')) {
      openAddFood({
        mode: 'ingredient',
        onPick: (res) => {
          r.ingredients.push({ foodId: res.food.id, name: res.food.name, grams: res.grams, per100: cleanPer100(res.food.per100) });
          drawIngredients();
        }
      });
    }
  });

  s.foot.addEventListener('click', async (e) => {
    if (e.target.closest('[data-del]')) {
      const ok = await confirmDialog('Delete the recipe “' + recipe.name + '”? Days where you already logged it are not changed.', 'Delete', true);
      if (!ok) return;
      delete DB.foods[recipe.id];
      saveData(); await closeSheet(); rerender(); toast('Recipe deleted');
      return;
    }
    if (!e.target.closest('[data-save]')) return;
    const name = $('[data-name]', s.body).value.trim();
    const servings = parseNum($('[data-servings]', s.body).value);
    const t = totals();
    if (!name) { toast('Please name the recipe'); return; }
    if (!servings || servings <= 0) { toast('Servings must be more than 0'); return; }
    if (!r.ingredients.length || t.g <= 0) { toast('Add at least one ingredient with grams'); return; }

    const per100 = {};
    NUTRIENTS.forEach((k) => { per100[k] = t.n[k] / t.g * 100; });
    const id = (recipe && recipe.id) || uid('r_');
    DB.foods[id] = Object.assign({}, DB.foods[id] || {}, {
      id: id, type: 'recipe', source: 'recipe', name: name, brand: '',
      servings: servings, totalGrams: round(t.g, 2),
      ingredients: r.ingredients,
      per100: cleanPer100(per100),
      units: [{ name: 'serving', grams: round(t.g / servings, 2) }]
    });
    // Log recipes by serving by default
    if (!DB.foods[id].lastAmount) DB.foods[id].lastAmount = { amount: 1, unit: 'serving' };
    saveData();
    await closeSheet();
    UI.foodsTab = 'recipes';
    rerender();
    toast('Recipe saved – find it when adding food');
  });
}

/* =========================================================
   9. Barcode scanner
   Uses the phone's built-in BarcodeDetector when it exists
   (Android Chrome), otherwise the free ZXing library (iPhone).
   ========================================================= */

/* opts.forLogging – true: a found product goes to opts.onFood (portion screen)
                     false: a found product opens the food editor (save to My Foods) */
function openBarcodeScanner(opts) {
  let stream = null, stopped = false, timer = null, detect = null;

  const s = openSheet({
    title: 'Scan barcode',
    full: true,
    body:
      '<div class="scanner"><video playsinline muted autoplay></video><div class="frame"></div><div class="msg" data-msg>Starting camera…</div></div>' +
      '<div data-status class="mt12"></div>' +
      '<div class="section-title">Or type the barcode number</div>' +
      '<div class="row"><input class="input grow" inputmode="numeric" autocomplete="off" placeholder="e.g. 4770001234567" data-code>' +
      '<button type="button" class="btn primary" data-look>Look up</button></div>',
    onClose: stopCamera
  });
  const video = $('video', s.body);
  const msg = (t) => { $('[data-msg]', s.body).textContent = t; };
  const status = (html) => { $('[data-status]', s.body).innerHTML = html; };

  function stopCamera() {
    stopped = true;
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  async function startCamera() {
    stopped = false;
    status('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      msg('Camera not available here');
      status('<div class="notice warn">The camera only works when the app is opened over <b>https://</b> (GitHub Pages is fine). You can type the barcode below.</div>');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
    } catch (err) {
      msg('Camera blocked');
      status('<div class="notice err"><b>Could not start the camera</b>' + (err.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow it in your browser/phone settings for this site, or type the barcode below.'
        : esc(err.message || err.name)) + '</div>');
      return;
    }
    if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
    video.srcObject = stream;
    try { await video.play(); } catch (_) { /* autoplay can fail silently; frames still arrive */ }

    if (!detect) {
      // 1) Native detector (fast, built into Android Chrome)
      if ('BarcodeDetector' in window) {
        try {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'].filter((f) => supported.includes(f));
          if (formats.length) {
            const d = new window.BarcodeDetector({ formats: formats });
            detect = async () => { const r = await d.detect(video); return r.length ? r[0].rawValue : null; };
          }
        } catch (_) { detect = null; }
      }
      // 2) Fallback: ZXing from a CDN
      if (!detect) {
        msg('Loading scanner…');
        try {
          await loadScript(ZXING_URL);
          detect = makeZxingDetector(video);
        } catch (err) {
          msg('Scanner could not load');
          status('<div class="notice err"><b>Scanner library could not load</b>' + esc(err.message) + ' You can type the barcode below.</div>');
          return;
        }
      }
    }
    msg('Point the camera at the barcode');
    scanLoop();
  }

  async function scanLoop() {
    if (stopped) return;
    try {
      const code = await detect();
      if (code && /^\d{6,14}$/.test(code)) { onCode(code); return; }
    } catch (_) { /* no barcode in this frame */ }
    timer = setTimeout(scanLoop, 180);
  }

  async function onCode(code) {
    stopCamera();
    if (navigator.vibrate) navigator.vibrate(60);
    msg('Found ' + code);
    $('[data-code]', s.body).value = code;
    status('<div class="row muted"><span class="spinner"></span> Looking up ' + esc(code) + '…</div>');

    // 1) Already in My Foods?
    const mine = libraryList().find((f) => f.barcode === code);
    if (mine) { await closeSheet(); return foundFood(mine, true); }

    // 2) Ask Open Food Facts
    if (!navigator.onLine) return lookupFailed(code, 'You are offline, so the product cannot be looked up.');
    try {
      const food = await lookupBarcodeOFF(code);
      if (s.closed) return;
      if (food && food.hasValues) { await closeSheet(); return foundFood(food, false); }
      await closeSheet();
      openFoodEditor(null, {
        prefill: { barcode: code, name: food ? food.name : '', brand: food ? food.brand : '' },
        notice: food
          ? '<b>No nutrition values online</b>“' + esc(food.name) + '” was found, but without nutrition values. Enter them from the package or use “Fill from label photo”.'
          : '<b>Product not found</b>Barcode ' + esc(code) + ' is not on Open Food Facts. Enter the values from the package or use “Fill from label photo”. It will be saved under this barcode.',
        onSaved: opts.forLogging ? opts.onFood : null
      });
    } catch (err) {
      lookupFailed(code, err.message);
    }
  }

  function lookupFailed(code, why) {
    status('<div class="notice err"><b>Lookup failed</b>' + esc(why) + '</div>' +
      '<div class="btn-grid"><button type="button" class="btn" data-again>Scan again</button>' +
      '<button type="button" class="btn primary" data-manual="' + esc(code) + '">Enter values</button></div>');
  }

  function foundFood(food, inLibrary) {
    if (opts.forLogging) return opts.onFood(food);
    openFoodEditor(food, inLibrary ? {} : {
      notice: '<b>Found on Open Food Facts</b>Check the values and tap Save to add it to My Foods.',
      noticeType: 'ok'
    });
  }

  s.body.addEventListener('click', async (e) => {
    if (e.target.closest('[data-look]')) {
      const code = $('[data-code]', s.body).value.replace(/\D/g, '');
      if (code.length < 6) { toast('Barcodes have at least 6 digits'); return; }
      onCode(code);
    }
    if (e.target.closest('[data-again]')) { msg('Starting camera…'); startCamera(); }
    const manual = e.target.closest('[data-manual]');
    if (manual) {
      const code = manual.dataset.manual;
      await closeSheet();
      openFoodEditor(null, { prefill: { barcode: code }, onSaved: opts.forLogging ? opts.onFood : null });
    }
  });

  startCamera();
}

// Build a "find a barcode in the current video frame" function using ZXing
function makeZxingDetector(video) {
  const Z = window.ZXing;
  const reader = new Z.MultiFormatReader();
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [
    Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128
  ]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  reader.setHints(hints);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  return async function () {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    // Only look at the middle band of the picture (where the green frame is) – faster
    const bandY = vh * 0.2, bandH = vh * 0.6;
    const scale = Math.min(1, 960 / vw);
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(bandH * scale);
    ctx.drawImage(video, 0, bandY, vw, bandH, 0, 0, canvas.width, canvas.height);
    try {
      const source = new Z.HTMLCanvasElementLuminanceSource(canvas);
      const bitmap = new Z.BinaryBitmap(new Z.HybridBinarizer(source));
      return reader.decodeWithState(bitmap).getText();
    } catch (_) {
      return null;  // nothing found in this frame
    }
  };
}

/* =========================================================
   10. Nutrition label scanner (OCR with Tesseract.js)
   ========================================================= */

/* opts.fillOnly + opts.onParsed → send the values back to an open food editor
   otherwise → open a new food editor with the values (then opts.onSaved)       */
function openLabelScanner(opts) {
  opts = opts || {};
  let worker = null;
  const s = openSheet({
    title: 'Scan nutrition label',
    full: true,
    body:
      '<p class="muted small" style="margin-bottom:12px">Take a sharp, straight photo of the nutrition table in good light. The text is read on your phone. The first time, it downloads a ~10 MB text reader (needs internet).</p>' +
      photoPickerHtml() +
      '<div data-out class="mt16"></div>',
    onClose: () => { if (worker) worker.terminate().catch(() => {}); worker = null; }
  });
  const out = $('[data-out]', s.body);

  s.body.addEventListener('change', (e) => {
    if (!e.target.matches('[data-photo]')) return;
    const file = e.target.files[0];
    e.target.value = '';
    if (file) run(file);
  });

  async function run(file) {
    const url = URL.createObjectURL(file);
    out.innerHTML = '<img class="photo-preview" alt="Label photo" src="' + url + '">' +
      '<div class="progress-line"><i data-bar></i></div><div class="muted small" data-st>Loading text reader…</div>';
    const bar = $('[data-bar]', out), st = $('[data-st]', out);
    try {
      await loadScript(TESSERACT_URL);
      const canvas = await fileToCanvas(file, 2000, true);
      if (!worker) {
        worker = await window.Tesseract.createWorker('eng', 1, {
          logger: (m) => {
            if (s.closed) return;
            st.textContent = ocrStatusText(m.status);
            if (typeof m.progress === 'number') bar.style.width = Math.round(m.progress * 100) + '%';
          }
        });
      }
      const result = await worker.recognize(canvas);
      if (s.closed) return;
      const text = (result && result.data && result.data.text) || '';
      const parsed = parseLabel(text);
      const foundCount = NUTRIENTS.filter((k) => parsed[k] != null).length;

      if (!foundCount) {
        out.innerHTML = '<div class="notice err"><b>No nutrition values found</b>Try a sharper, closer photo of just the table, or enter the values by hand.</div>' +
          rawTextHtml(text) +
          (opts.fillOnly ? '' : '<button type="button" class="btn block mt12" data-hand>Enter values by hand</button>');
        return;
      }
      await closeSheet();
      if (opts.fillOnly) { opts.onParsed(parsed); return; }
      openFoodEditor(null, {
        prefill: { per100: pickValues(parsed), basis: parsed.basis, servingGrams: parsed.servingGrams },
        notice: '<b>Check every number</b>These values were read from your photo. Text reading can mix up digits (e.g. 8 and 3), so compare with the label before saving.' + rawTextHtml(text),
        onSaved: opts.onSaved || null
      });
    } catch (err) {
      out.innerHTML = '<div class="notice err"><b>Could not read the label</b>' + esc(err.message || String(err)) + '</div>';
    }
  }

  s.body.addEventListener('click', async (e) => {
    if (e.target.closest('[data-hand]')) {
      await closeSheet();
      openFoodEditor(null, { onSaved: opts.onSaved || null });
    }
  });
}

function pickValues(p) {
  const o = {};
  NUTRIENTS.forEach((k) => { o[k] = p[k]; });
  return o;
}

function rawTextHtml(text) {
  return '<details class="mt8"><summary class="small">Show the text read from the photo</summary>' +
    '<pre style="white-space:pre-wrap;font-size:12px;max-height:200px;overflow:auto">' + esc(text) + '</pre></details>';
}

function ocrStatusText(status) {
  const map = {
    'loading tesseract core': 'Loading text reader…',
    'initializing tesseract': 'Starting text reader…',
    'loading language traineddata': 'Downloading English text model (first time only)…',
    'initializing api': 'Starting…',
    'recognizing text': 'Reading the label…'
  };
  return map[status] || 'Working…';
}

/* Find nutrition numbers in OCR text.
   Understands English labels plus common Lithuanian, German and Polish words.
   Returns per-label values and whether they are per 100 g or per serving. */
function parseLabel(rawText) {
  const text = normalize(rawText)
    // Common OCR mix-ups inside numbers: "1O" → "10", "O.5" → "0.5"
    .replace(/(\d)o/g, '$10').replace(/o(\d)/g, '0$1');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const num = (s) => parseFloat(String(s).replace(',', '.'));
  const out = { kcal: null, protein: null, carbs: null, fat: null, fiber: null, sugar: null, servingGrams: null, basis: '100g' };

  // ---- Energy ----
  let m = text.match(/(\d+(?:[.,]\d+)?)\s*kcal/);
  if (m) out.kcal = num(m[1]);
  if (out.kcal == null) { m = text.match(/kcal\D{0,6}(\d+(?:[.,]\d+)?)/); if (m) out.kcal = num(m[1]); }
  if (out.kcal == null) { m = text.match(/calories\D{0,6}(\d+(?:[.,]\d+)?)/); if (m) out.kcal = num(m[1]); }
  if (out.kcal == null) { m = text.match(/(\d+(?:[.,]\d+)?)\s*kj/); if (m) out.kcal = round(num(m[1]) / 4.184, 1); }

  // ---- Other nutrients: keyword on a line, first number after it ----
  const rules = {
    fat:     { inc: /(total fat|fat\b|fats|riebal|fett|tluszcz|lipides|grassi)/, exc: /(satur|socios|gesatt|nasycon|trans|mono|poly|of which|is kuriu|davon|w tym)/ },
    carbs:   { inc: /(carbohydrate|carbs?\b|angliavand|kohlenhydrat|weglowodan|glucides)/, exc: /^$/ },
    sugar:   { inc: /(sugars?\b|cukr|zucker|sucres)/, exc: /(added sugars|alcohol)/ },
    fiber:   { inc: /(fibre|fiber|skaidul|ballaststoff|blonnik)/, exc: /^$/ },
    protein: { inc: /(protein|baltym|eiweiss|bialk)/, exc: /^$/ }
  };
  Object.keys(rules).forEach((key) => {
    const r = rules[key];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const hit = line.match(r.inc);
      if (!hit || r.exc.test(line)) continue;
      const after = line.slice(hit.index + hit[0].length);
      let n = after.match(/(\d+(?:[.,]\d+)?)/);
      // Value may be on the next line when the table is split
      if (!n && lines[i + 1]) n = lines[i + 1].match(/^\D{0,3}(\d+(?:[.,]\d+)?)/);
      if (n) { out[key] = num(n[1]); break; }
    }
  });

  // ---- Serving size and which column we read ----
  m = text.match(/(serving size|per serving|portion|porcij)[^\n]*?(\d+(?:[.,]\d+)?)\s*(g|ml)\b/);
  if (m) out.servingGrams = num(m[2]);
  const per100 = /100\s*(g|ml)\b/.test(text);
  out.basis = per100 || !out.servingGrams ? '100g' : 'serving';

  // Values that cannot be right for 100 g get dropped (OCR noise)
  ['protein', 'carbs', 'fat', 'fiber', 'sugar'].forEach((k) => { if (out[k] != null && out[k] > 100 && out.basis === '100g') out[k] = null; });
  if (out.kcal != null && out.kcal > 950 && out.basis === '100g') out.kcal = null;
  return out;
}

/* =========================================================
   11. AI photo estimate (Gemini, optional, free)
   Needs your own API key (Settings). The key stays on this phone
   and is only sent to Google (generativelanguage.googleapis.com).
   ========================================================= */

const AI_PROMPT =
  'You are a nutrition estimation assistant. Look at this photo of a meal.\n' +
  'Identify each separate food item, estimate the weight in grams that is visible (as served/cooked), ' +
  'and estimate calories, protein, carbs and fat for that weight using standard nutrition database values.\n' +
  'Count hidden fats (cooking oil, butter, sauces) when they are likely. Be realistic, not optimistic.\n' +
  'If the user added a note, trust it over what you see.\n' +
  'Reply with ONLY valid JSON (no markdown, no extra text) in exactly this shape:\n' +
  '{"dish": "short name of the meal", "items": [{"name": "food name", "grams": 0, "kcal": 0, "protein": 0, "carbs": 0, "fat": 0}], ' +
  '"confidence": "low" | "medium" | "high", "notes": "one short sentence about what is uncertain"}\n' +
  'All numbers are for the whole item as shown (not per 100 g). If there is no food in the photo, return an empty "items" list.';

// Calls Google Gemini. The key is sent in a request header and is only sent to Google.
async function callGemini(model, body, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs || 90000);
  let res;
  try {
    res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': DB.settings.geminiKey
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(t);
    if (err.name === 'AbortError') throw new Error('The request took too long. Check your internet and try again.');
    throw new Error(navigator.onLine ? 'Could not reach Google. Check your internet connection.' : 'You are offline. The AI estimate needs internet.');
  }
  clearTimeout(t);
  let json = null;
  try { json = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(apiErrorText(res.status, json));
  return json;
}

function apiErrorText(status, json) {
  const m = (json && json.error && json.error.message) || '';
  if (status === 400 && /api key|API_KEY|invalid/i.test(m)) return 'Your Gemini API key was rejected. Check it in Settings.';
  if (status === 400) return 'The request was not accepted: ' + m;
  if (status === 401 || status === 403) return 'Your Gemini API key is not allowed to do this. Check it in Settings. ' + m;
  if (status === 404) return 'Model not found. Pick another model in Settings. ' + m;
  if (status === 413) return 'The photo is too large.';
  if (status === 429) return 'Free limit reached or too many requests right now. Wait a minute, or try again tomorrow. ' + m;
  if (status >= 500) return 'Google is busy or having problems (' + status + '). Try again in a moment.';
  return 'Request failed (' + status + '). ' + m;
}

async function estimateMealFromPhoto(file, note) {
  const canvas = await fileToCanvas(file, 1280, false);
  const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
  const model = AI_MODELS.some((m) => m.id === DB.settings.aiModel) ? DB.settings.aiModel : AI_DEFAULT_MODEL;
  const json = await callGemini(model, {
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64 } },
        { text: AI_PROMPT + (note ? '\n\nUser note: ' + note : '') }
      ]
    }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 4000 }
  });
  const cand = (json.candidates || [])[0] || {};
  const text = ((cand.content && cand.content.parts) || []).map((p) => p.text || '').join('\n');
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end < start) {
    if (!cand.content && json.promptFeedback) throw new Error('Google did not process this photo (' + (json.promptFeedback.blockReason || 'blocked') + '). Try another photo.');
    throw new Error(cand.finishReason === 'MAX_TOKENS' ? 'The answer was cut off. Try again.' : 'The AI did not return a usable answer. Try again.');
  }
  let data;
  try { data = JSON.parse(text.slice(start, end + 1)); } catch (_) { throw new Error('The AI answer could not be read. Try again.'); }
  const num = (v) => { const n = Number(v); return isFinite(n) && n > 0 ? n : 0; };
  data.items = (Array.isArray(data.items) ? data.items : []).map((it) => ({
    name: String(it.name || 'Food').slice(0, 80),
    grams: round(num(it.grams), 0),
    kcal: round(num(it.kcal), 0),
    protein: round(num(it.protein), 1),
    carbs: round(num(it.carbs), 1),
    fat: round(num(it.fat), 1),
    on: true
  }));
  return data;
}

function openAIPhoto(ctx) {
  const mealName = MEALS.find((m) => m.id === ctx.meal).name;

  // No key: explain and offer to go to Settings
  if (!DB.settings.geminiKey) {
    const s = openSheet({
      title: 'AI photo estimate',
      body: '<div class="notice err"><b>No Gemini API key added</b>This optional feature needs a free Gemini API key. Add it in <b>Settings → AI photo estimate</b>. Everything else in the app works without it.</div>',
      foot: '<button type="button" class="btn" data-close>Close</button><button type="button" class="btn primary" data-go>Open Settings</button>'
    });
    s.foot.addEventListener('click', async (e) => {
      if (e.target.closest('[data-go]')) { await closeAllSheets(); go('settings'); }
    });
    return;
  }

  let items = [];
  let lastFile = null;
  const s = openSheet({
    title: 'AI photo estimate',
    full: true,
    body:
      '<p class="muted small" style="margin-bottom:12px">Photograph your meal. Gemini estimates each food, its weight and macros. You can change everything before it is logged. Free with your Gemini API key.</p>' +
      photoPickerHtml() +
      '<label class="field mt12"><span>Note for the AI (optional)</span><input class="input" data-note autocomplete="off" placeholder="e.g. big plate, fried in butter, 2 eggs"></label>' +
      '<div data-out></div>',
    foot: '<button type="button" class="btn primary" data-log disabled>Add to ' + esc(mealName) + '</button>'
  });
  const out = $('[data-out]', s.body);
  const logBtn = $('[data-log]', s.foot);

  s.body.addEventListener('change', (e) => {
    if (!e.target.matches('[data-photo]')) return;
    const file = e.target.files[0];
    e.target.value = '';
    if (file) { lastFile = file; analyze(); }
  });

  async function analyze() {
    const url = URL.createObjectURL(lastFile);
    items = [];
    logBtn.disabled = true;
    out.innerHTML = '<img class="photo-preview mt8" alt="Meal photo" src="' + url + '">' +
      '<div class="row muted mt12"><span class="spinner"></span> Asking Gemini… (usually 5–20 seconds)</div>';
    try {
      const data = await estimateMealFromPhoto(lastFile, $('[data-note]', s.body).value.trim());
      if (s.closed) return;
      items = data.items;
      if (!items.length) {
        out.innerHTML = '<img class="photo-preview mt8" alt="" src="' + url + '"><div class="notice warn mt12"><b>No food recognised</b>' + esc(data.notes || 'Try another photo.') + '</div>';
        return;
      }
      out.innerHTML = '<img class="photo-preview mt8" alt="" src="' + url + '">' +
        '<div class="mt12"><h3>' + esc(data.dish || 'Your meal') + '</h3>' +
        '<div class="muted small mt8">Confidence: <b>' + esc(data.confidence || 'unknown') + '</b>' + (data.notes ? ' · ' + esc(data.notes) : '') + '</div></div>' +
        '<div class="section-title">Items – check and edit</div><div data-items></div><div class="card" data-total></div>';
      drawItems();
      logBtn.disabled = false;
    } catch (err) {
      if (s.closed) return;
      out.innerHTML = '<div class="notice err mt12"><b>AI estimate failed</b>' + esc(err.message) + '</div>' +
        '<button type="button" class="btn block" data-retry>Try again</button>';
    }
  }

  function drawItems() {
    $('[data-items]', out).innerHTML = items.map((it, i) =>
      '<div class="ai-item' + (it.on ? '' : ' off') + '" data-i="' + i + '">' +
        '<div class="row"><input type="checkbox" class="check" data-on' + (it.on ? ' checked' : '') + ' aria-label="Include">' +
        '<input class="input grow" data-k="name" value="' + esc(it.name) + '">' +
        '<div class="input-suffix" style="width:100px"><input class="input" inputmode="decimal" data-k="grams" value="' + fmtNum(it.grams) + '"><em>g</em></div></div>' +
        '<div class="field-grid mt8">' +
          ['kcal', 'protein', 'carbs', 'fat'].map((k) => '<label class="field"><span>' + (k === 'kcal' ? 'kcal' : k + ' g') + '</span>' +
            '<input class="input" inputmode="decimal" data-k="' + k + '" value="' + fmtNum(it[k]) + '"></label>').join('') +
        '</div></div>').join('');
    drawTotal();
  }

  function drawTotal() {
    const t = items.filter((x) => x.on).reduce((a, x) => ({ kcal: a.kcal + x.kcal, protein: a.protein + x.protein, carbs: a.carbs + x.carbs, fat: a.fat + x.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    $('[data-total]', out).innerHTML = '<div class="row between"><span class="muted">Total selected</span><b class="num">' + fmtKcal(t.kcal) + ' kcal</b></div>' +
      '<div class="muted small num mt8">' + macroLine(t) + '</div>';
  }

  out.addEventListener('input', (e) => {
    const box = e.target.closest('[data-i]');
    if (!box) return;
    const it = items[Number(box.dataset.i)];
    if (e.target.matches('[data-on]')) { it.on = e.target.checked; box.classList.toggle('off', !it.on); drawTotal(); return; }
    const k = e.target.dataset.k;
    if (k === 'name') { it.name = e.target.value; return; }
    const v = parseNum(e.target.value);
    if (k === 'grams') {
      // Changing the weight scales calories and macros with it
      const old = it.grams;
      it.grams = v || 0;
      if (old > 0 && it.grams > 0) {
        const f = it.grams / old;
        ['kcal', 'protein', 'carbs', 'fat'].forEach((n) => {
          it[n] = round(it[n] * f, n === 'kcal' ? 0 : 1);
          $('[data-k="' + n + '"]', box).value = fmtNum(it[n]);
        });
      }
    } else {
      it[k] = v || 0;
    }
    drawTotal();
  });
  out.addEventListener('change', (e) => { if (e.target.matches('[data-on]')) e.target.dispatchEvent(new Event('input', { bubbles: true })); });
  out.addEventListener('click', (e) => { if (e.target.closest('[data-retry]') && lastFile) analyze(); });

  logBtn.addEventListener('click', async () => {
    const chosen = items.filter((x) => x.on && x.grams > 0);
    if (!chosen.length) { toast('Select at least one item with grams'); return; }
    const day = ensureDay(ctx.date);
    const ids = [];
    chosen.forEach((it) => {
      const f = 100 / it.grams;
      const entry = {
        id: uid('e_'), foodId: null, name: it.name.trim() || 'Food', brand: 'AI estimate',
        grams: it.grams, amount: it.grams, unit: 'g',
        per100: cleanPer100({ kcal: it.kcal * f, protein: it.protein * f, carbs: it.carbs * f, fat: it.fat * f }),
        time: Date.now()
      };
      ids.push(entry.id);
      day[ctx.meal].push(entry);
    });
    saveData();
    await closeAllSheets();
    renderDiary();
    const date = ctx.date, meal = ctx.meal;
    toast('Added ' + chosen.length + ' item' + (chosen.length > 1 ? 's' : '') + ' to ' + mealName, {
      action: 'Undo',
      onAction: () => {
        const d = ensureDay(date);
        d[meal] = d[meal].filter((x) => !ids.includes(x.id));
        tidyDay(date); saveData(); renderDiary();
      }
    });
  });
}

/* =========================================================
   12. Workout tracker
   Two separate profiles ("Me" and "Girlfriend"). Everything on the
   workout screen belongs to the profile picked at the top.
   History is matched by exercise NAME, so the same exercise in two
   workout days shares one history.
   ========================================================= */

const DEFAULT_REP_MIN = 5;
const DEFAULT_REP_MAX = 9;

function prof() { return DB.workout.profiles[DB.settings.profile]; }
function exKey(name) { return normalize(name).replace(/\s+/g, ' '); }

// Every time an exercise was done (newest first): [{ date, at, sessionId, sets: [{ w, reps }] }]
function exerciseHistory(p, name) {
  const key = exKey(name);
  const out = [];
  p.sessions.forEach((s) => (s.exercises || []).forEach((ex) => {
    if (exKey(ex.name) === key && ex.sets && ex.sets.length) out.push({ date: s.date, at: s.finishedAt || s.startedAt || 0, sessionId: s.id, sets: ex.sets });
  }));
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
}

function lastPerformance(p, name) { return exerciseHistory(p, name)[0] || null; }

// Heaviest weight ever, and the most reps done at that weight
function bestOf(hist) {
  let w = -1, reps = 0;
  hist.forEach((h) => h.sets.forEach((s) => {
    if (s.w > w) { w = s.w; reps = s.reps; } else if (s.w === w && s.reps > reps) reps = s.reps;
  }));
  return w < 0 ? null : { w: w, reps: reps };
}

function topSet(sets) {
  return sets.reduce((best, s) => (!best || s.w > best.w || (s.w === best.w && s.reps > best.reps)) ? s : best, null);
}

// "90 kg × 7, 6" when all sets used the same weight, else "90 × 7, 85 × 8 kg"
function setsText(sets) {
  if (!sets || !sets.length) return '';
  const same = sets.every((s) => s.w === sets[0].w);
  if (same) return (sets[0].w ? fmtNum(sets[0].w) + ' kg' : 'Bodyweight') + ' × ' + sets.map((s) => s.reps).join(', ');
  return sets.map((s) => fmtNum(s.w) + ' × ' + s.reps).join(', ') + ' kg';
}

/* Progress mark for one finished set:
   'PR'  – heavier than ever (with reps in range), or most reps ever at the top weight
   'NEW' – heavier than ever but reps below the range (counted as a new weight, not a PR)
   '+'   – better than the same set last time                                          */
function setMark(set, i, last, best, repMin) {
  if (!set.done || !set.reps) return '';
  const w = set.w || 0;
  if (best) {
    if (w > best.w) return set.reps >= (repMin || 0) ? 'PR' : 'NEW';
    if (w === best.w && set.reps > best.reps) return 'PR';
  }
  const ls = last && last.sets[i];
  if (ls && (w > ls.w || (w === ls.w && set.reps > ls.reps))) return '+';
  return '';
}

function exerciseNames() {
  const p = prof();
  const names = new Map();
  p.templates.forEach((t) => t.exercises.forEach((e) => names.set(exKey(e.name), e.name)));
  p.sessions.forEach((s) => s.exercises.forEach((e) => names.set(exKey(e.name), e.name)));
  return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
}

function exerciseDatalist() {
  return '<datalist id="ex-names">' + exerciseNames().map((n) => '<option value="' + esc(n) + '">').join('') + '</datalist>';
}

function newTemplateExercise(name) {
  return { id: uid('x_'), name: name, sets: 3, repMin: DEFAULT_REP_MIN, repMax: DEFAULT_REP_MAX, targetWeight: null, targetSetAt: 0 };
}

/* ---------- Workout screen ---------- */
function renderWorkout() {
  const p = prof();
  if (p.active) return renderActiveWorkout();
  releaseWakeLock();

  const tplCards = p.templates.map((t) => {
    const lastS = p.sessions.filter((s) => s.templateId === t.id).sort((a, b) => b.date.localeCompare(a.date))[0];
    return '<section class="card tpl-card">' +
      '<div class="row between"><div class="grow"><h3 class="ellipsis">' + esc(t.name) + '</h3>' +
      '<div class="muted small">' + t.exercises.length + ' exercise' + (t.exercises.length === 1 ? '' : 's') +
      (lastS ? ' · last done ' + timeAgo(lastS.date) : ' · not done yet') + '</div></div>' +
      '<button type="button" class="icon-btn" data-act="edit-tpl" data-id="' + t.id + '" aria-label="Edit ' + esc(t.name) + '">' + ICON.pen + '</button></div>' +
      '<div class="tpl-ex">' + (t.exercises.map((e) => esc(e.name)).join(' · ') || 'No exercises yet') + '</div>' +
      '<button type="button" class="btn primary block mt12" data-act="start" data-id="' + t.id + '"' + (t.exercises.length ? '' : ' disabled') + '>' + ICON.play + ' Start ' + esc(t.name) + '</button>' +
      '</section>';
  }).join('');

  const names = exerciseNames().filter((n) => exerciseHistory(p, n).length);
  const progress = names.map((n) => {
    const h = exerciseHistory(p, n);
    const best = bestOf(h);
    return '<button type="button" class="list-item" data-act="ex-history" data-name="' + esc(n) + '">' +
      '<div class="grow"><div class="title ellipsis">' + esc(n) + '</div>' +
      '<div class="sub">Last: ' + esc(setsText(h[0].sets)) + ' · ' + esc(timeAgo(h[0].date)) + '</div></div>' +
      '<div class="right num">' + (best.w ? fmtNum(best.w) + ' kg' : 'BW') + '<small>best × ' + best.reps + '</small></div></button>';
  }).join('');

  const recent = p.sessions.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.finishedAt || 0) - (a.finishedAt || 0)).slice(0, 15).map((s) => {
    const sets = s.exercises.reduce((n, e) => n + e.sets.length, 0);
    return '<button type="button" class="list-item" data-act="session" data-id="' + s.id + '">' +
      '<div class="grow"><div class="title">' + esc(s.templateName || 'Workout') + '</div>' +
      '<div class="sub">' + esc(shortDate(s.date, true)) + ' · ' + s.exercises.length + ' exercises · ' + sets + ' sets</div></div>' +
      '<div class="faint">' + ICON.right.replace('<svg ', '<svg style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2" ') + '</div></button>';
  }).join('');

  $('#screen').innerHTML =
    '<div class="topbar"><h1>Workout</h1></div>' +
    profileSegHtml() +
    '<div class="row between"><div class="section-title" style="margin-top:4px">Workout days</div>' +
      '<button type="button" class="btn xs" data-act="new-tpl">' + ICON.plus + ' New day</button></div>' +
    (tplCards || '<div class="card empty-big">No workout days yet for ' + esc(p.name) + '.<br>Create days like <b>Upper</b> and <b>Lower</b>.' +
      '<div class="btn-grid mt16"><button type="button" class="btn primary" data-act="new-tpl">Create day</button>' +
      '<button type="button" class="btn" data-act="examples">Add examples</button></div></div>') +
    (progress ? '<div class="section-title">Exercise progress</div><div class="card tight">' + progress + '</div>' : '') +
    (recent ? '<div class="section-title">Recent workouts</div><div class="card tight">' + recent + '</div>' : '');

  $('#screen').onclick = (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'profile') switchProfile(a.dataset.p);
    if (act === 'new-tpl') openTemplateEditor(null);
    if (act === 'edit-tpl') openTemplateEditor(p.templates.find((t) => t.id === a.dataset.id));
    if (act === 'start') startWorkout(p.templates.find((t) => t.id === a.dataset.id));
    if (act === 'ex-history') openExerciseHistory(a.dataset.name);
    if (act === 'session') openSessionDetail(a.dataset.id);
    if (act === 'examples') addExampleTemplates();
  };
}

function profileSegHtml() {
  const cur = DB.settings.profile;
  return '<div class="seg profile-seg">' + ['me', 'gf'].map((k) =>
    '<button type="button" data-act="profile" data-p="' + k + '"' + (k === cur ? ' class="on"' : '') + '>' +
    esc(DB.workout.profiles[k].name) + (DB.workout.profiles[k].active ? ' •' : '') + '</button>').join('') + '</div>';
}

function switchProfile(p) {
  if (p === DB.settings.profile) return;
  DB.settings.profile = p;
  saveData();
  window.scrollTo(0, 0);
  renderWorkout();
}

function addExampleTemplates() {
  const mk = (name, list) => ({ id: uid('t_'), name: name, exercises: list.map(newTemplateExercise) });
  prof().templates.push(
    mk('Upper', ['Lat pulldown', 'Chest press', 'Seated cable row', 'Shoulder press', 'Lateral raise', 'Triceps pushdown', 'Biceps curl']),
    mk('Lower', ['Leg press', 'Romanian deadlift', 'Lying hamstring curl', 'Leg extension', 'Hip adductor', 'Calf raise'])
  );
  saveData();
  renderWorkout();
  toast('Added Upper and Lower – tap the pencil to change them');
}

/* ---------- Template editor ---------- */
function openTemplateEditor(tpl) {
  const p = prof();
  const isNew = !tpl;
  const t = tpl ? JSON.parse(JSON.stringify(tpl)) : { id: uid('t_'), name: '', exercises: [] };

  const s = openSheet({
    title: isNew ? 'New workout day' : 'Edit ' + tpl.name,
    full: true,
    body:
      '<label class="field"><span>Name</span><input class="input" data-name autocomplete="off" placeholder="e.g. Upper" value="' + esc(t.name) + '"></label>' +
      '<div class="section-title">Exercises</div>' +
      '<div data-list></div>' +
      '<button type="button" class="btn block" data-add>' + ICON.plus + ' Add exercise</button>' +
      '<p class="muted small mt12">Target kg is optional. Leave it empty to start from what you lifted last time.</p>' +
      exerciseDatalist(),
    foot: (isNew ? '' : '<button type="button" class="btn danger" data-del>' + ICON.trash + ' Delete</button>') +
          '<button type="button" class="btn primary" data-save>Save</button>'
  });

  function draw() {
    $('[data-list]', s.body).innerHTML = t.exercises.length ? t.exercises.map((ex, i) =>
      '<div class="tpl-ex-row" data-i="' + i + '">' +
        '<div class="row"><input class="input grow" list="ex-names" placeholder="Exercise name" data-k="name" value="' + esc(ex.name) + '">' +
        '<button type="button" class="icon-btn" data-move="-1" aria-label="Move up"' + (i ? '' : ' disabled') + '>' + ICON.up + '</button>' +
        '<button type="button" class="icon-btn" data-move="1" aria-label="Move down"' + (i < t.exercises.length - 1 ? '' : ' disabled') + '>' + ICON.down + '</button>' +
        '<button type="button" class="icon-btn" data-rm aria-label="Remove">' + ICON.x + '</button></div>' +
        '<div class="field-grid">' +
          '<label class="field"><span>Sets</span><input class="input" inputmode="numeric" data-k="sets" value="' + esc(ex.sets) + '"></label>' +
          '<label class="field"><span>Reps from</span><input class="input" inputmode="numeric" data-k="repMin" value="' + esc(ex.repMin == null ? '' : ex.repMin) + '"></label>' +
          '<label class="field"><span>Reps to</span><input class="input" inputmode="numeric" data-k="repMax" value="' + esc(ex.repMax == null ? '' : ex.repMax) + '"></label>' +
          '<label class="field"><span>Target kg</span><input class="input" inputmode="decimal" data-k="targetWeight" value="' + esc(fmtNum(ex.targetWeight)) + '"></label>' +
        '</div></div>').join('')
      : '<div class="muted small" style="padding:4px 4px 12px">No exercises yet.</div>';
  }
  draw();
  if (isNew) setTimeout(() => $('[data-name]', s.body).focus(), 80);

  s.body.addEventListener('input', (e) => {
    const row = e.target.closest('[data-i]');
    if (!row) return;
    const ex = t.exercises[Number(row.dataset.i)];
    const k = e.target.dataset.k;
    if (k === 'name') ex.name = e.target.value;
    else if (k === 'targetWeight') { ex.targetWeight = parseNum(e.target.value); ex.targetSetAt = Date.now(); }
    else ex[k] = parseNum(e.target.value);
  });

  s.body.addEventListener('click', (e) => {
    if (e.target.closest('[data-add]')) {
      t.exercises.push(newTemplateExercise(''));
      draw();
      const inputs = $$('[data-k="name"]', s.body);
      inputs[inputs.length - 1].focus();
      return;
    }
    const row = e.target.closest('[data-i]');
    if (!row) return;
    const i = Number(row.dataset.i);
    if (e.target.closest('[data-rm]')) { t.exercises.splice(i, 1); draw(); }
    const mv = e.target.closest('[data-move]');
    if (mv) {
      const j = i + Number(mv.dataset.move);
      if (j < 0 || j >= t.exercises.length) return;
      const tmp = t.exercises[i]; t.exercises[i] = t.exercises[j]; t.exercises[j] = tmp;
      draw();
    }
  });

  s.foot.addEventListener('click', async (e) => {
    if (e.target.closest('[data-del]')) {
      const ok = await confirmDialog('Delete the workout day “' + tpl.name + '”? Your past workouts and exercise history stay.', 'Delete', true);
      if (!ok) return;
      p.templates = p.templates.filter((x) => x.id !== tpl.id);
      saveData(); await closeSheet(); renderWorkout(); toast('Workout day deleted');
      return;
    }
    if (!e.target.closest('[data-save]')) return;
    t.name = $('[data-name]', s.body).value.trim();
    if (!t.name) { toast('Please name the workout day'); return; }
    t.exercises = t.exercises.filter((x) => x.name && x.name.trim());
    t.exercises.forEach((x) => {
      x.name = x.name.trim();
      x.sets = clamp(Math.round(x.sets || 3), 1, 20);
      if (x.repMin != null && x.repMax != null && x.repMin > x.repMax) { const tmp = x.repMin; x.repMin = x.repMax; x.repMax = tmp; }
    });
    const i = p.templates.findIndex((x) => x.id === t.id);
    if (i >= 0) p.templates[i] = t; else p.templates.push(t);
    saveData();
    await closeSheet();
    renderWorkout();
    toast('Saved');
  });
}

/* ---------- Running a workout ---------- */
function startWorkout(tpl) {
  if (!tpl) return;
  const p = prof();
  p.active = {
    id: uid('s_'),
    templateId: tpl.id,
    templateName: tpl.name,
    date: todayStr(),
    startedAt: Date.now(),
    exercises: tpl.exercises.map((ex) => newActiveExercise(p, ex))
  };
  saveData();
  window.scrollTo(0, 0);
  renderWorkout();
}

// Pre-fill sets from last time (or from the target weight if you changed it since then)
function newActiveExercise(p, ex) {
  const last = lastPerformance(p, ex.name);
  const hasTarget = ex.targetWeight != null && ex.targetWeight !== '';
  const useTarget = hasTarget && (!last || (ex.targetSetAt || 0) > (last.at || 0));
  const n = Math.max(1, ex.sets || (last ? last.sets.length : 3));
  const sets = [];
  for (let i = 0; i < n; i++) {
    const ls = last ? (last.sets[i] || last.sets[last.sets.length - 1]) : null;
    sets.push({
      w: useTarget ? ex.targetWeight : (ls ? ls.w : (hasTarget ? ex.targetWeight : null)),
      reps: last && last.sets[i] ? last.sets[i].reps : null,
      done: false
    });
  }
  return { exId: ex.id, name: ex.name, repMin: ex.repMin, repMax: ex.repMax, sets: sets };
}

function templateExercise(active, exItem) {
  const tpl = prof().templates.find((t) => t.id === active.templateId);
  return tpl ? tpl.exercises.find((x) => x.id === exItem.exId) : null;
}

function exCardHtml(ex, i) {
  const p = prof();
  const hist = exerciseHistory(p, ex.name);
  const last = hist[0] || null;
  const best = bestOf(hist);
  const tex = templateExercise(p.active, ex);
  const range = ex.repMin != null || ex.repMax != null
    ? (ex.repMin != null ? ex.repMin : '?') + (ex.repMax != null && ex.repMax !== ex.repMin ? '–' + ex.repMax : '') + ' reps'
    : '';
  const marks = ex.sets.map((s, k) => setMark(s, k, last, best, ex.repMin));
  const hint = last && ex.repMax && last.sets.length && last.sets.every((s) => s.reps >= ex.repMax)
    ? 'Last time every set reached ' + ex.repMax + ' reps – try a bit more weight.' : '';

  return '<section class="card ex-card" data-ex="' + i + '">' +
    '<div class="row between"><h3 class="grow ellipsis">' + esc(ex.name) + '</h3><span data-badge>' + badgeHtml(marks) + '</span></div>' +
    '<div class="ex-last">' + (last ? 'Last (' + esc(shortDate(last.date)) + '): <b>' + esc(setsText(last.sets)) + '</b>' : 'First time – no history yet') +
      (range ? ' · Target ' + ex.sets.length + ' × ' + range : '') + '</div>' +
    (hint ? '<div class="ex-hint">' + esc(hint) + '</div>' : '') +
    '<div class="set-head"><span>Set</span><span>kg</span><span>Reps</span><span></span><span>Done</span></div>' +
    ex.sets.map((s, k) =>
      '<div class="set-row' + (s.done ? ' done' : '') + '" data-set="' + k + '">' +
        '<span class="n">' + (k + 1) + '</span>' +
        '<input class="input" inputmode="decimal" autocomplete="off" aria-label="Weight set ' + (k + 1) + '" data-f="w" placeholder="kg" value="' + esc(fmtNum(s.w)) + '">' +
        '<input class="input" inputmode="numeric" autocomplete="off" aria-label="Reps set ' + (k + 1) + '" data-f="reps" placeholder="reps" value="' + esc(s.reps == null ? '' : s.reps) + '">' +
        '<span class="mark" data-mark>' + markText(marks[k]) + '</span>' +
        '<button type="button" class="set-check" data-check aria-label="Set ' + (k + 1) + ' done">' + ICON.check + '</button>' +
      '</div>').join('') +
    '<div class="ex-tools">' +
      '<button type="button" class="btn xs" data-tool="add-set">' + ICON.plus + ' Set</button>' +
      '<button type="button" class="btn xs" data-tool="rm-set"' + (ex.sets.length > 1 ? '' : ' disabled') + '>' + ICON.minus + ' Set</button>' +
      '<button type="button" class="btn xs" data-tool="target">Target' + (tex && tex.targetWeight != null ? ': ' + fmtNum(tex.targetWeight) + ' kg' : ' kg') + '</button>' +
      '<button type="button" class="btn xs" data-tool="history">' + ICON.chart + ' History</button>' +
      '<button type="button" class="btn xs ghost" data-tool="remove" aria-label="Skip today">Skip</button>' +
    '</div></section>';
}

function markText(m) { return m === 'NEW' ? 'NEW' : (m || ''); }

function badgeHtml(marks) {
  if (marks.includes('PR')) return '<span class="badge pr">PR</span>';
  if (marks.includes('NEW')) return '<span class="badge newwt">NEW WEIGHT</span>';
  if (marks.includes('+')) return '<span class="badge plus">+ PROGRESS</span>';
  return '';
}

function renderActiveWorkout() {
  const p = prof();
  const a = p.active;
  const scrollY = window.scrollY;
  const started = new Date(a.startedAt);
  const doneSets = a.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const totalSets = a.exercises.reduce((n, e) => n + e.sets.length, 0);
  const rest = DB.settings.restSeconds;

  $('#screen').innerHTML =
    '<div class="topbar"><div class="grow"><h1 class="ellipsis">' + esc(a.templateName) + '</h1>' +
      '<div class="muted small">' + esc(p.name) + ' · started ' + pad(started.getHours()) + ':' + pad(started.getMinutes()) + ' · ' + doneSets + '/' + totalSets + ' sets</div></div>' +
      '<button type="button" class="btn primary sm" data-act="finish">Finish</button></div>' +
    profileSegHtml() +
    '<div class="card"><div class="row between"><span class="muted small">Rest timer</span>' +
      '<label class="row small muted"><input type="checkbox" class="check" style="width:20px;height:20px" data-act="auto-rest"' + (DB.settings.autoRest ? ' checked' : '') + '> start after each set</label></div>' +
      '<div class="chips mt8">' + [60, 90, 120, 150, 180].map((sec) =>
        '<button type="button" class="chip' + (sec === rest ? ' on' : '') + '" data-act="rest-len" data-s="' + sec + '">' + fmtClock(sec) + '</button>').join('') +
      '<button type="button" class="chip" data-act="rest-now">' + ICON.play.replace('<svg ', '<svg style="width:14px;height:14px;fill:currentColor;vertical-align:-2px" ') + ' Start</button></div></div>' +
    a.exercises.map(exCardHtml).join('') +
    '<button type="button" class="btn block" data-act="add-ex">' + ICON.plus + ' Add exercise</button>' +
    '<div class="btn-grid mt16"><button type="button" class="btn danger" data-act="discard">Discard workout</button>' +
      '<button type="button" class="btn primary" data-act="finish">Finish & save</button></div>';

  window.scrollTo(0, scrollY);
  requestWakeLock();

  const screen = $('#screen');
  screen.onclick = (e) => {
    const t = e.target.closest('[data-act],[data-check],[data-tool]');
    if (!t) return;
    const card = t.closest('[data-ex]');
    const ei = card ? Number(card.dataset.ex) : -1;
    if (t.dataset.check != null) return toggleSet(ei, Number(t.closest('[data-set]').dataset.set));
    if (t.dataset.tool) return exerciseTool(ei, t.dataset.tool);
    const act = t.dataset.act;
    if (act === 'profile') switchProfile(t.dataset.p);
    if (act === 'finish') finishWorkout();
    if (act === 'discard') discardWorkout();
    if (act === 'add-ex') addExerciseToWorkout();
    if (act === 'rest-len') { DB.settings.restSeconds = Number(t.dataset.s); saveData(); $$('[data-act="rest-len"]', screen).forEach((c) => c.classList.toggle('on', c === t)); }
    if (act === 'rest-now') { unlockAudio(); startRest(DB.settings.restSeconds); }
  };
  screen.onchange = (e) => {
    if (e.target.matches('[data-act="auto-rest"]')) { DB.settings.autoRest = e.target.checked; saveData(); }
  };
  // Typing weight or reps: save quietly, don't redraw (keeps the keyboard open)
  screen.oninput = (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    const ei = Number(e.target.closest('[data-ex]').dataset.ex);
    const si = Number(e.target.closest('[data-set]').dataset.set);
    const set = a.exercises[ei].sets[si];
    const v = parseNum(e.target.value);
    set[f] = v == null ? null : (f === 'reps' ? Math.round(v) : v);
    if (set.done) updateMarks(ei);
    saveSoon();
  };
}

function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  return Math.floor(sec / 60) + ':' + pad(sec % 60);
}

// Refresh the "+" / "PR" marks of one exercise card without redrawing it
function updateMarks(ei) {
  const p = prof();
  const ex = p.active.exercises[ei];
  const hist = exerciseHistory(p, ex.name);
  const marks = ex.sets.map((s, k) => setMark(s, k, hist[0], bestOf(hist), ex.repMin));
  const card = $('[data-ex="' + ei + '"]');
  if (!card) return;
  $$('[data-mark]', card).forEach((el, k) => { el.textContent = markText(marks[k]); });
  $('[data-badge]', card).innerHTML = badgeHtml(marks);
}

function toggleSet(ei, si) {
  const a = prof().active;
  const set = a.exercises[ei].sets[si];
  const row = $('[data-ex="' + ei + '"] [data-set="' + si + '"]');
  if (!set.done) {
    // Read what is in the boxes right now (in case "input" did not fire)
    set.w = parseNum($('[data-f="w"]', row).value);
    const r = parseNum($('[data-f="reps"]', row).value);
    set.reps = r == null ? null : Math.round(r);
    if (!set.reps || set.reps <= 0) { toast('Enter the reps first'); $('[data-f="reps"]', row).focus(); return; }
    if (set.w == null) set.w = 0;   // empty weight = bodyweight exercise
    set.done = true;
    unlockAudio();
    if (DB.settings.autoRest) startRest(DB.settings.restSeconds);
  } else {
    set.done = false;
  }
  row.classList.toggle('done', set.done);
  updateMarks(ei);
  saveData();
  // Update "x/y sets" in the header
  const doneSets = a.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const totalSets = a.exercises.reduce((n, e) => n + e.sets.length, 0);
  const sub = $('#screen .topbar .muted');
  if (sub) sub.textContent = sub.textContent.replace(/\d+\/\d+ sets/, doneSets + '/' + totalSets + ' sets');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

async function exerciseTool(ei, tool) {
  const p = prof();
  const a = p.active;
  const ex = a.exercises[ei];
  const tex = templateExercise(a, ex);

  if (tool === 'add-set') {
    const lastSet = ex.sets[ex.sets.length - 1];
    ex.sets.push({ w: lastSet ? lastSet.w : null, reps: null, done: false });
    if (tex) tex.sets = ex.sets.length;           // remember in the workout day
    saveData(); renderActiveWorkout();
  }
  if (tool === 'rm-set') {
    if (ex.sets.length <= 1) return;
    const lastSet = ex.sets[ex.sets.length - 1];
    if (lastSet.done && !(await confirmDialog('The last set is already checked. Remove it?', 'Remove', true))) return;
    ex.sets.pop();
    if (tex) tex.sets = ex.sets.length;
    saveData(); renderActiveWorkout();
  }
  if (tool === 'target') {
    const v = await askNumber('Target weight', ex.name + ' – saved to “' + a.templateName + '” and used for sets not done yet', 'kg', tex && tex.targetWeight != null ? fmtNum(tex.targetWeight) : '');
    if (v == null) return;
    if (tex) { tex.targetWeight = v; tex.targetSetAt = Date.now(); }
    ex.sets.forEach((s) => { if (!s.done) s.w = v; });
    saveData(); renderActiveWorkout();
    toast('Target ' + fmtNum(v) + ' kg saved');
  }
  if (tool === 'history') openExerciseHistory(ex.name);
  if (tool === 'remove') {
    const ok = await confirmDialog('Skip “' + ex.name + '” in this workout? It stays in your workout day.', 'Skip', true);
    if (!ok) return;
    a.exercises.splice(ei, 1);
    saveData(); renderActiveWorkout();
  }
}

async function addExerciseToWorkout() {
  const name = await askText('Add exercise', 'Exercise name (also added to “' + prof().active.templateName + '”)', '', 'ex-names');
  if (!name) return;
  const p = prof();
  const tpl = p.templates.find((t) => t.id === p.active.templateId);
  const tex = newTemplateExercise(name);
  if (tpl) tpl.exercises.push(tex);
  p.active.exercises.push(newActiveExercise(p, tex));
  saveData();
  renderActiveWorkout();
  window.scrollTo(0, document.body.scrollHeight);
}

async function finishWorkout() {
  const p = prof();
  const a = p.active;
  const unchecked = a.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.done).length, 0);
  const exercises = a.exercises
    .map((e) => ({ name: e.name, sets: e.sets.filter((s) => s.done && s.reps > 0).map((s) => ({ w: s.w || 0, reps: s.reps })) }))
    .filter((e) => e.sets.length);

  if (!exercises.length) {
    const ok = await confirmDialog('No sets are checked, so there is nothing to save. Discard this workout?', 'Discard', true);
    if (ok) { p.active = null; saveData(); stopRest(); renderWorkout(); }
    return;
  }
  if (unchecked) {
    const ok = await confirmDialog(unchecked + ' set' + (unchecked > 1 ? 's are' : ' is') + ' not checked and will not be saved. Finish anyway?', 'Finish', false);
    if (!ok) return;
  }
  // Count PRs before saving (compared with history)
  let prs = 0;
  a.exercises.forEach((e) => {
    const hist = exerciseHistory(p, e.name);
    if (e.sets.some((s, k) => setMark(s, k, hist[0], bestOf(hist), e.repMin) === 'PR')) prs++;
  });
  p.sessions.push({
    id: a.id, date: a.date || todayStr(), templateId: a.templateId, templateName: a.templateName,
    startedAt: a.startedAt, finishedAt: Date.now(), exercises: exercises
  });
  p.active = null;
  saveData();
  stopRest();
  window.scrollTo(0, 0);
  renderWorkout();
  toast('Workout saved' + (prs ? ' · ' + prs + ' PR' + (prs > 1 ? 's' : '') + '!' : ''), { ms: 4000 });
}

async function discardWorkout() {
  const ok = await confirmDialog('Discard this workout? Nothing from it will be saved.', 'Discard', true);
  if (!ok) return;
  prof().active = null;
  saveData();
  stopRest();
  renderWorkout();
}

/* ---------- Exercise history (chart + list) ---------- */
function openExerciseHistory(name) {
  const p = prof();
  const hist = exerciseHistory(p, name);
  const best = bestOf(hist);
  // One point per day: the heaviest weight that day
  const byDate = {};
  hist.forEach((h) => { const t = topSet(h.sets); if (!byDate[h.date] || t.w > byDate[h.date]) byDate[h.date] = t.w; });
  const points = Object.keys(byDate).sort().map((d) => ({ date: d, y: byDate[d] }));

  openSheet({
    title: name,
    full: true,
    body:
      '<div class="muted small">' + esc(p.name) + '</div>' +
      (best ? '<div class="card mt12"><div class="row between"><span class="muted">Best</span><b class="num" style="font-size:22px">' +
        (best.w ? fmtNum(best.w) + ' kg' : 'Bodyweight') + ' × ' + best.reps + '</b></div></div>' : '') +
      '<div class="section-title">Top weight over time (kg)</div>' +
      '<div class="card">' + lineChart(points, { label: 'Top weight for ' + name }) +
        (points.length === 1 ? '<p class="muted small center">Do it again to see a line.</p>' : '') + '</div>' +
      '<div class="section-title">All sessions</div>' +
      (hist.length ? '<div class="card tight">' + hist.map((h) =>
        '<div class="list-item"><div class="grow"><div class="title">' + esc(shortDate(h.date, true)) + '</div>' +
        '<div class="sub">' + esc(setsText(h.sets)) + '</div></div>' +
        '<div class="right num">' + h.sets.length + '<small>sets</small></div></div>').join('') + '</div>'
        : '<div class="muted">No history yet.</div>')
  });
}

/* ---------- One past workout ---------- */
function openSessionDetail(id) {
  const p = prof();
  const sess = p.sessions.find((x) => x.id === id);
  if (!sess) return;
  const mins = sess.finishedAt && sess.startedAt ? Math.round((sess.finishedAt - sess.startedAt) / 60000) : null;
  const s = openSheet({
    title: sess.templateName || 'Workout',
    full: true,
    body:
      '<div class="muted">' + esc(shortDate(sess.date, true)) + (mins ? ' · ' + mins + ' min' : '') + ' · ' + esc(p.name) + '</div>' +
      sess.exercises.map((e) =>
        '<div class="card mt12"><div class="row between"><b>' + esc(e.name) + '</b>' +
        '<button type="button" class="btn xs" data-hist="' + esc(e.name) + '">' + ICON.chart + ' History</button></div>' +
        e.sets.map((st, k) => '<div class="row between small mt8"><span class="muted">Set ' + (k + 1) + '</span><span class="num bold">' +
          (st.w ? fmtNum(st.w) + ' kg' : 'BW') + ' × ' + st.reps + '</span></div>').join('') + '</div>').join(''),
    foot: '<button type="button" class="btn danger" data-del>' + ICON.trash + ' Delete workout</button>'
  });
  s.body.addEventListener('click', (e) => {
    const h = e.target.closest('[data-hist]');
    if (h) openExerciseHistory(h.dataset.hist);
  });
  s.foot.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-del]')) return;
    const ok = await confirmDialog('Delete this workout from ' + shortDate(sess.date) + '? Its sets are removed from your history.', 'Delete', true);
    if (!ok) return;
    p.sessions = p.sessions.filter((x) => x.id !== id);
    saveData();
    await closeSheet();
    renderWorkout();
    toast('Workout deleted');
  });
}

/* ---------- Keep the screen on during a workout (where supported) ---------- */
let wakeLock = null;
async function requestWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (_) { wakeLock = null; }
}
function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

/* =========================================================
   13. Rest timer
   Counts down from an end time, so it stays correct even if
   the phone sleeps. Beeps and vibrates when time is up.
   ========================================================= */

const REST = { endsAt: 0, doneAt: 0, interval: null };
let audioCtx = null;

// Phones only allow sound after a tap, so we create the audio on a tap
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (_) { audioCtx = null; }
}

function beep() {
  if (!audioCtx) return;
  try {
    [0, 0.25, 0.5].forEach((delay) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.4, audioCtx.currentTime + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + delay + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + delay);
      o.stop(audioCtx.currentTime + delay + 0.2);
    });
  } catch (_) {}
}

function startRest(seconds) {
  REST.endsAt = Date.now() + seconds * 1000;
  REST.doneAt = 0;
  const bar = $('#timer-bar');
  bar.innerHTML =
    '<div class="grow"><div class="lbl" data-lbl>Rest</div><div class="t" data-t>' + fmtClock(seconds) + '</div></div>' +
    '<button type="button" class="btn sm" data-r="-15">−15</button>' +
    '<button type="button" class="btn sm" data-r="15">+15</button>' +
    '<button type="button" class="icon-btn" data-r="stop" aria-label="Stop timer">' + ICON.x + '</button>';
  bar.hidden = false;
  document.body.classList.add('timer-on');
  clearInterval(REST.interval);
  REST.interval = setInterval(tickRest, 250);
  tickRest();
}

function tickRest() {
  const bar = $('#timer-bar');
  const left = (REST.endsAt - Date.now()) / 1000;
  if (left <= 0 && !REST.doneAt) {
    REST.doneAt = Date.now();
    beep();
    if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
  }
  if (REST.doneAt && Date.now() - REST.doneAt > 20000) { stopRest(); return; }
  bar.classList.toggle('done', !!REST.doneAt);
  const t = $('[data-t]', bar), l = $('[data-lbl]', bar);
  if (t) t.textContent = REST.doneAt ? 'Go!' : fmtClock(Math.ceil(left));
  if (l) l.textContent = REST.doneAt ? 'Rest over' : 'Rest';
}

function stopRest() {
  clearInterval(REST.interval);
  REST.interval = null;
  const bar = $('#timer-bar');
  bar.hidden = true;
  bar.innerHTML = '';
  document.body.classList.remove('timer-on');
}

$('#timer-bar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-r]');
  if (!b) return;
  if (b.dataset.r === 'stop') return stopRest();
  const add = Number(b.dataset.r) * 1000;
  if (REST.doneAt) { REST.doneAt = 0; REST.endsAt = Date.now(); }
  REST.endsAt = Math.max(Date.now() + 1000, REST.endsAt + add);
  tickRest();
});

/* =========================================================
   14. Body weight
   ========================================================= */

function renderBody() {
  const all = DB.weights.slice().sort((a, b) => a.date.localeCompare(b.date));
  const latest = all[all.length - 1];
  const since = UI.bodyRange ? addDays(todayStr(), -UI.bodyRange) : '0000-00-00';
  const shown = all.filter((w) => w.date >= since);
  const first = shown[0];
  const change = latest && first && shown.length > 1 ? latest.kg - first.kg : null;

  $('#screen').innerHTML =
    '<div class="topbar"><h1>Body weight</h1></div>' +
    '<section class="card"><div class="row between">' +
      '<div><div class="muted small">Latest</div><div class="num" style="font-size:32px;font-weight:800">' + (latest ? fmtNum(latest.kg) + ' <span class="muted" style="font-size:16px">kg</span>' : '–') + '</div>' +
        '<div class="muted small">' + (latest ? esc(shortDate(latest.date, true)) : 'No entries yet') + '</div></div>' +
      '<div style="text-align:right"><div class="muted small">Change (' + (UI.bodyRange ? UI.bodyRange + ' days' : 'all time') + ')</div>' +
        '<div class="num" style="font-size:22px;font-weight:800;color:' + (change == null ? 'var(--muted)' : 'var(--text)') + '">' +
        (change == null ? '–' : (change > 0 ? '+' : '') + fmtNum(round(change, 1)) + ' kg') + '</div></div>' +
    '</div></section>' +

    '<section class="card"><div class="field-grid">' +
      '<label class="field"><span>Date</span><input class="input" type="date" data-date value="' + todayStr() + '" max="' + todayStr() + '"></label>' +
      '<label class="field"><span>Weight (kg)</span><input class="input" inputmode="decimal" autocomplete="off" data-kg placeholder="' + (latest ? fmtNum(latest.kg) : 'e.g. 80.5') + '"></label>' +
    '</div><button type="button" class="btn primary block mt12" data-act="add">Save weight</button></section>' +

    '<div class="seg mt12">' + [[30, '30 days'], [90, '90 days'], [365, '1 year'], [0, 'All']].map((r) =>
      '<button type="button" data-act="range" data-r="' + r[0] + '"' + (UI.bodyRange === r[0] ? ' class="on"' : '') + '>' + r[1] + '</button>').join('') + '</div>' +
    '<section class="card mt12">' + lineChart(shown.map((w) => ({ date: w.date, y: w.kg })), { label: 'Body weight' }) + '</section>' +

    (all.length ? '<div class="section-title">Entries</div><div class="card tight">' + all.slice().reverse().map((w) =>
      '<div class="list-item"><div class="grow"><div class="title num">' + fmtNum(w.kg) + ' kg</div><div class="sub">' + esc(shortDate(w.date, true)) + '</div></div>' +
      '<button type="button" class="icon-btn plain" data-act="del" data-id="' + w.id + '" aria-label="Delete entry">' + ICON.trash + '</button></div>').join('') + '</div>' : '');

  const screen = $('#screen');
  screen.onclick = (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'range') { UI.bodyRange = Number(a.dataset.r); renderBody(); }
    if (a.dataset.act === 'add') {
      const date = $('[data-date]', screen).value || todayStr();
      const kg = parseNum($('[data-kg]', screen).value);
      if (kg == null || kg < 20 || kg > 400) { toast('Enter a weight between 20 and 400 kg'); return; }
      const existing = DB.weights.find((w) => w.date === date);
      if (existing) existing.kg = round(kg, 2);
      else DB.weights.push({ id: uid('w_'), date: date, kg: round(kg, 2) });
      saveData(); renderBody();
      toast(existing ? 'Updated ' + shortDate(date) : 'Saved');
    }
    if (a.dataset.act === 'del') {
      const i = DB.weights.findIndex((w) => w.id === a.dataset.id);
      if (i < 0) return;
      const removed = DB.weights.splice(i, 1)[0];
      saveData(); renderBody();
      toast('Deleted ' + fmtNum(removed.kg) + ' kg', { action: 'Undo', onAction: () => { DB.weights.push(removed); saveData(); renderBody(); } });
    }
  };
}

/* =========================================================
   15. Settings, backup and restore
   ========================================================= */

function renderSettings() {
  const g = DB.settings.goals;
  const macroKcal = g.protein * 4 + g.carbs * 4 + g.fat * 9;
  const hasKey = !!DB.settings.geminiKey;
  const usedKb = Math.round((localStorage.getItem(STORE_KEY) || '').length / 1024);
  const goalField = (k, label, unit) =>
    '<label class="field"><span>' + label + '</span><div class="input-suffix"><input class="input" inputmode="decimal" data-goal="' + k + '" value="' + esc(fmtNum(g[k])) + '"><em>' + unit + '</em></div></label>';

  $('#screen').innerHTML =
    '<div class="topbar"><h1>Settings</h1></div>' +

    '<div class="section-title">Daily goals</div>' +
    '<section class="card">' +
      goalField('kcal', 'Calories', 'kcal') +
      '<div class="field-grid three">' + goalField('protein', 'Protein', 'g') + goalField('carbs', 'Carbs', 'g') + goalField('fat', 'Fat', 'g') + '</div>' +
      '<p class="muted small mt8" data-macro-kcal>Your protein, carbs and fat add up to <b class="num">' + fmtKcal(macroKcal) + ' kcal</b>.</p>' +
      '<div class="mt12">' + goalField('water', 'Water', 'ml') + '</div>' +
    '</section>' +

    '<div class="section-title">AI photo estimate (optional, free)</div>' +
    '<section class="card">' +
      '<p class="small">Lets you photograph a meal and get a calorie and macro estimate from Google Gemini. <b>Everything else in the app works without this.</b></p>' +
      '<ol class="small muted" style="padding-left:18px;margin:10px 0">' +
        '<li>Go to <b>aistudio.google.com</b> and sign in with a Google account.</li>' +
        '<li>Click <b>Get API key</b>, create a key and paste it below.</li>' +
      '</ol>' +
      '<div class="notice ok small"><b>Free to use</b>The Gemini free tier has daily limits set by Google. The key is stored only on this phone and is only sent to Google. It is not included in backups.</div>' +
      '<label class="field mt12"><span>Gemini API key ' + (hasKey ? '<span class="tag mine">Saved</span>' : '<span class="tag">Not set</span>') + '</span>' +
        '<div class="key-row"><input class="input" type="password" autocomplete="off" spellcheck="false" placeholder="AIza…" data-key value="' + esc(DB.settings.geminiKey) + '">' +
        '<button type="button" class="icon-btn" data-act="show-key" aria-label="Show key">' + ICON.eye + '</button></div></label>' +
      '<label class="field"><span>Model</span><select class="input" data-model>' +
        AI_MODELS.map((m) => '<option value="' + m.id + '"' + (m.id === DB.settings.aiModel ? ' selected' : '') + '>' + esc(m.label) + '</option>').join('') + '</select></label>' +
      '<div class="btn-grid"><button type="button" class="btn" data-act="test-key"' + (hasKey ? '' : ' disabled') + '>Test key</button>' +
        '<button type="button" class="btn danger" data-act="remove-key"' + (hasKey ? '' : ' disabled') + '>Remove key</button></div>' +
      '<div data-key-status class="mt12"></div>' +
    '</section>' +

    '<div class="section-title">Workout profiles</div>' +
    '<section class="card"><div class="field-grid">' +
      '<label class="field"><span>Profile 1</span><input class="input" data-pname="me" value="' + esc(DB.workout.profiles.me.name) + '"></label>' +
      '<label class="field"><span>Profile 2</span><input class="input" data-pname="gf" value="' + esc(DB.workout.profiles.gf.name) + '"></label>' +
    '</div></section>' +

    '<div class="section-title">Appearance</div>' +
    '<div class="seg">' +
      '<button type="button" data-act="theme" data-t="dark"' + (DB.settings.theme === 'dark' ? ' class="on"' : '') + '>Dark</button>' +
      '<button type="button" data-act="theme" data-t="light"' + (DB.settings.theme === 'light' ? ' class="on"' : '') + '>Light</button>' +
    '</div>' +

    '<div class="section-title">Backup</div>' +
    '<section class="card">' +
      '<p class="small muted" style="margin-bottom:12px">All data lives only on this phone (' + usedKb + ' KB). Export a backup regularly – if you clear browser data or delete the app, it is gone.</p>' +
      '<div class="btn-grid"><button type="button" class="btn primary" data-act="export">Export backup</button>' +
        '<label class="btn">Import backup<input type="file" accept="application/json,.json" hidden data-import></label></div>' +
      (navigator.canShare ? '<button type="button" class="btn block mt12" data-act="share">Share backup file…</button>' : '') +
      '<button type="button" class="btn danger block mt12" data-act="reset">Delete all data</button>' +
    '</section>' +

    '<div class="section-title">About</div>' +
    '<section class="card small muted">FitTrack ' + APP_VERSION + ' · ' + (navigator.onLine ? 'online' : 'offline') +
      ' · ' + STARTER_FOODS.length + ' built-in foods · food data from Open Food Facts (open database).' +
      '<button type="button" class="btn sm block mt12" data-act="update">Check for app update</button></section>';

  const screen = $('#screen');

  screen.onchange = (e) => {
    const t = e.target;
    if (t.dataset.goal) {
      const v = parseNum(t.value);
      if (v == null || v < 0) { toast('Goals must be a number of 0 or more'); t.value = fmtNum(g[t.dataset.goal]); return; }
      g[t.dataset.goal] = v;
      saveData();
      const mk = g.protein * 4 + g.carbs * 4 + g.fat * 9;
      $('[data-macro-kcal]', screen).innerHTML = 'Your protein, carbs and fat add up to <b class="num">' + fmtKcal(mk) + ' kcal</b>.';
      toast('Goal saved');
    }
    if (t.matches('[data-key]')) {
      DB.settings.geminiKey = t.value.trim();
      saveData();
      renderSettings();
      toast(DB.settings.geminiKey ? 'API key saved on this phone' : 'API key removed');
    }
    if (t.matches('[data-model]')) { DB.settings.aiModel = t.value; saveData(); toast('Model saved'); }
    if (t.dataset.pname) {
      const name = t.value.trim();
      if (!name) { t.value = DB.workout.profiles[t.dataset.pname].name; return; }
      DB.workout.profiles[t.dataset.pname].name = name; saveData(); toast('Saved');
    }
    if (t.matches('[data-import]')) {
      const file = t.files[0];
      t.value = '';
      if (file) importBackup(file);
    }
  };

  screen.onclick = async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'show-key') { const k = $('[data-key]', screen); k.type = k.type === 'password' ? 'text' : 'password'; }
    if (act === 'remove-key') {
      if (await confirmDialog('Remove the API key from this phone?', 'Remove', true)) { DB.settings.geminiKey = ''; saveData(); renderSettings(); toast('API key removed'); }
    }
    if (act === 'test-key') testApiKey();
    if (act === 'theme') { DB.settings.theme = a.dataset.t; saveData(); applyTheme(); renderSettings(); }
    if (act === 'export') exportBackup(false);
    if (act === 'share') exportBackup(true);
    if (act === 'reset') resetAll();
    if (act === 'update') checkForUpdate();
  };
}

async function testApiKey() {
  const box = $('[data-key-status]');
  box.innerHTML = '<div class="row muted small"><span class="spinner"></span> Checking key…</div>';
  try {
    // Listing models is free and proves the key works
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
      headers: { 'x-goog-api-key': DB.settings.geminiKey }
    });
    if (!res.ok) { let j = null; try { j = await res.json(); } catch (_) {} throw new Error(apiErrorText(res.status, j)); }
    box.innerHTML = '<div class="notice ok"><b>Key works</b>You can use the AI photo estimate.</div>';
  } catch (err) {
    box.innerHTML = '<div class="notice err"><b>Key test failed</b>' + esc(err.message) + '</div>';
  }
}

function backupObject() {
  const copy = JSON.parse(JSON.stringify(DB));
  copy.settings.geminiKey = '';         // never put the key in a backup file
  return { app: 'FitTrack', format: 1, exportedAt: new Date().toISOString(), data: copy };
}

async function exportBackup(share) {
  const json = JSON.stringify(backupObject());
  const name = 'fittrack-backup-' + todayStr() + '.json';
  const blob = new Blob([json], { type: 'application/json' });
  if (share) {
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'FitTrack backup' });
        return;
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
    toast('Sharing is not supported here – downloading instead');
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Backup saved as ' + name);
}

async function importBackup(file) {
  let parsed;
  try { parsed = JSON.parse(await file.text()); } catch (_) { toast('That file is not a valid backup (not JSON)'); return; }
  const data = parsed && parsed.data ? parsed.data : parsed;
  if (!data || typeof data !== 'object' || !(data.diary || data.foods || data.workout)) {
    toast('That file does not look like a FitTrack backup'); return;
  }
  const when = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString('en-GB') : 'unknown date';
  const ok = await confirmDialog('Replace ALL data on this phone with the backup from ' + when + '? Data that is only on this phone will be lost.', 'Replace', true);
  if (!ok) return;
  const key = DB.settings.geminiKey;
  DB = withDefaults(data);
  if (!DB.settings.geminiKey) DB.settings.geminiKey = key;   // keep your key
  saveData();
  applyTheme();
  render();
  toast('Backup restored');
}

async function resetAll() {
  if (!(await confirmDialog('Delete ALL food, workout and weight data on this phone? Export a backup first if you might want it back.', 'Continue', true))) return;
  if (!(await confirmDialog('This cannot be undone. Delete everything now?', 'Delete everything', true))) return;
  DB = defaultData();
  saveData();
  applyTheme();
  UI.date = todayStr();
  go('diary');
  toast('All data deleted');
}

/* =========================================================
   16. Navigation and app start
   ========================================================= */

function go(tab) {
  UI.tab = tab;
  $$('.nav-btn').forEach((b) => b.classList.toggle('on', b.dataset.nav === tab));
  window.scrollTo(0, 0);
  render();
}

function render() {
  const screen = $('#screen');
  screen.onclick = screen.oninput = screen.onchange = null;
  if (UI.tab === 'diary') renderDiary();
  else if (UI.tab === 'foods') renderFoods();
  else if (UI.tab === 'workout') renderWorkout();
  else if (UI.tab === 'body') renderBody();
  else renderSettings();
}

// Redraw the current screen after a sheet changed data
function rerender() { render(); }

function applyTheme() {
  document.documentElement.dataset.theme = DB.settings.theme === 'light' ? 'light' : 'dark';
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', DB.settings.theme === 'light' ? '#F3F5F6' : '#0D1013');
}

let swReg = null;
let swReloading = false;
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('service-worker.js').then((reg) => {
    swReg = reg;
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('A new version of the app is ready', {
            action: 'Update', ms: 20000,
            onAction: () => { swReloading = true; nw.postMessage('skipWaiting'); }
          });
        }
      });
    });
  }).catch((err) => console.warn('Service worker not registered', err));
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (swReloading) location.reload(); });
}

function checkForUpdate() {
  if (!swReg) { toast('Offline mode is not active (open the app over https)'); return; }
  if (swReg.waiting) { swReloading = true; swReg.waiting.postMessage('skipWaiting'); return; }
  swReg.update().then(() => {
    setTimeout(() => { if (!swReg.installing && !swReg.waiting) toast('You have the latest version'); }, 1500);
  }).catch(() => toast('Could not check – are you online?'));
}

function init() {
  loadData();
  applyTheme();
  UI.date = todayStr();
  let lastToday = UI.date;

  $$('.nav-btn').forEach((b) => b.addEventListener('click', () => go(b.dataset.nav)));

  // Reopen a running workout if the app was closed during one
  const startTab = prof().active ? 'workout' : 'diary';
  go(startTab);

  // When you come back to the app on a new day, jump to the new "today"
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = todayStr();
    if (now !== lastToday) {
      if (UI.date === lastToday) UI.date = now;
      lastToday = now;
      if (UI.tab === 'diary' && !sheetStack.length) renderDiary();
    }
    if (REST.interval) tickRest();
    if (UI.tab === 'workout' && prof().active) requestWakeLock();
  });

  window.addEventListener('offline', () => toast('You are offline – your foods and workouts still work'));
  window.addEventListener('online', () => toast('Back online'));

  // Ask the browser not to delete our data when the phone is low on space
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  registerServiceWorker();
}

init();
