/* Organiser, phase 1: food.
   All your data is stored on this phone (localStorage). Settings > Backup saves a copy.
   data/foods.json (foods + Lidl prices) is kept up to date by Claude and merged in on start. */
'use strict';

// ---------- helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = () => iso(new Date());
const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return iso(d); };
const monday = s => { const d = parseDay(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso(d); };
const r0 = n => Math.round(n || 0);
const r1 = n => Math.round((n || 0) * 10) / 10;
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const fmtDay = s => parseDay(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const DOW = s => parseDay(s).toLocaleDateString('en-GB', { weekday: 'short' });
const hm = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const eur = n => '€' + (n || 0).toFixed(2);

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2000);
}

// ---------- constants ----------
const SLOTS = [
  { id: 'Pre-workout', time: '08:00', main: false },
  { id: 'Breakfast', time: '10:00', main: true },
  { id: 'Lunch', time: '14:00', main: true },
  { id: 'Snack', time: '18:00', main: false },
  { id: 'Dinner', time: '21:00', main: true },
];
const SLOT_IDS = SLOTS.map(s => s.id);
const PLAN_SLOTS = ['Breakfast', 'Lunch', 'Dinner'];
const CARD_TYPES = [...SLOT_IDS, 'Extra'];
const PLACES = ['Fridge', 'Freezer', 'Cupboard', 'Spice rack', 'Household'];
const SHOPS = ['Lidl', 'IKI', 'Maxima', 'Other'];
const FULL = [['finished', 'Finished'], ['left', 'Left some'], ['toofull', 'Too full'], ['hungry', 'Still hungry']];
const slotAt = (h, m = 0) => { const t = h * 60 + m; let s = SLOTS[0].id; for (const x of SLOTS) { const [a, b] = x.time.split(':').map(Number); if (t >= a * 60 + b - 60) s = x.id; } return s; };
const nowSlot = () => { const d = new Date(); return slotAt(d.getHours(), d.getMinutes()); };

// ---------- data ----------
const KEY = 'organiser.v2';
function blank() {
  return {
    v: 2,
    settings: {
      kcal: 1750, p: 132, c: 158, f: 66, fib: 30, water: 12,
      portionStart: 250, gapH: 6, minP: 20,
      jonasDinner: 900, jonasLunch: 800,
      sheetUrl: '', sheetSeen: '', offLT: true,
      fixed: {}, // slot -> card id (Pre-workout, Snack)
    },
    foods: [], cards: [], plan: {}, pantry: {}, bought: {},
    log: {}, day: {}, recent: [], dataUpdated: '',
  };
}
let S;
try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { S = null; }
const firstRun = !S;
S = Object.assign(blank(), S || {});
S.settings = Object.assign(blank().settings, S.settings);
const save = () => localStorage.setItem(KEY, JSON.stringify(S));
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

const foodById = id => S.foods.find(f => f.id === id);
const cardById = id => S.cards.find(c => c.id === id);
const macroFor = (food, g) => ({ kcal: food.kcal * g / 100, p: food.p * g / 100, c: food.c * g / 100, f: food.f * g / 100, fib: (food.fib || 0) * g / 100 });
const sumM = list => list.reduce((a, x) => ({ kcal: a.kcal + (x.kcal || 0), p: a.p + (x.p || 0), c: a.c + (x.c || 0), f: a.f + (x.f || 0), fib: a.fib + (x.fib || 0) }), { kcal: 0, p: 0, c: 0, f: 0, fib: 0 });
const itemsTotals = items => sumM(items.map(i => { const f = foodById(i.foodId); return f ? macroFor(f, i.g) : {}; }));
const cardTotals = c => itemsTotals(c.items);
const cardGrams = c => c.items.reduce((a, i) => a + i.g, 0);
const amountText = (food, g) => food && food.unit && food.unitG && g % food.unitG === 0 ? `${g / food.unitG} ${food.unit}` : `${r0(g)} g`;

// merge Claude-maintained food list (foods + prices)
async function syncFoodData() {
  try {
    const r = await fetch('data/foods.json', { cache: 'no-cache' }); if (!r.ok) return;
    const j = await r.json();
    if (j.updated === S.dataUpdated && S.foods.length) return;
    for (const src of j.foods || []) {
      let f = S.foods.find(x => x.key === src.key) || (src.barcode && S.foods.find(x => x.barcode === src.barcode));
      if (!f) { f = { id: uid(), kind: 'food' }; S.foods.push(f); }
      const keepMacros = f.edited;
      for (const [k, v] of Object.entries(src)) {
        if (keepMacros && ['name', 'kcal', 'p', 'c', 'f', 'fib', 'unit', 'unitG'].includes(k)) continue;
        f[k] = v;
      }
      // regular buys from receipts go into the pantry once (then you manage them)
      S.pantryAdded ||= {};
      if (src.pantry && !S.pantryAdded[src.key]) { S.pantryAdded[src.key] = 1; if (!S.pantry[f.id]) S.pantry[f.id] = { place: f.place || 'Cupboard', qty: defaultQty(f), have: true }; }
    }
    S.regulars = j.regulars || [];
    S.dataUpdated = j.updated; save();
    if (firstRun) seedCards();
    render();
  } catch {}
}
function seedCards() {
  if (S.cards.length) return;
  const k = key => (S.foods.find(f => f.key === key) || {}).id;
  const mk = (name, slot, items, stars = 4, extra = {}) => { const c = Object.assign({ id: uid(), name, slot, items: items.filter(i => i.foodId), stars }, extra); S.cards.push(c); return c; };
  const pre = mk('Banana', 'Pre-workout', [{ foodId: k('banana'), g: 120 }]);
  const snk = mk('Protein shake', 'Snack', [{ foodId: k('shake'), g: 30 }, { foodId: k('milk'), g: 250 }]);
  mk('Buckwheat breakfast bowl', 'Breakfast', [{ foodId: k('buckwheat'), g: 120 }, { foodId: k('coconut-yog'), g: 200 }, { foodId: k('nut-mix'), g: 20 }, { foodId: k('raspberries'), g: 80 }, { foodId: k('honey'), g: 7 }], 5, { note: 'Locked breakfast. Never swap.' });
  mk('Eggs, peas & parmesan', 'Snack', [{ foodId: k('egg'), g: 100 }, { foodId: k('peas'), g: 80 }, { foodId: k('parmesan'), g: 10 }], 4);
  mk('Chicken thigh soup', 'Dinner', [{ foodId: k('chicken-thigh'), g: 150 }, { foodId: k('napa'), g: 150 }, { foodId: k('ginger'), g: 5 }, { foodId: k('garlic'), g: 5 }, { foodId: k('gochujang'), g: 10 }, { foodId: k('soy-sauce'), g: 10 }], 4, { jonas: true });
  S.settings.fixed = { 'Pre-workout': pre.id, Snack: snk.id };
  save();
}

// ---------- learned portion size ----------
function portionLimit() {
  const fin = [], full = [];
  for (const [d, dd] of Object.entries(S.day)) for (const [slot, v] of Object.entries(dd.full || {})) {
    const g = (S.log[d] || []).filter(e => e.slot === slot).reduce((a, e) => a + (e.g || 0), 0);
    if (!g) continue;
    if (v === 'finished') fin.push(g); if (v === 'toofull') full.push(g);
  }
  if (fin.length + full.length < 3) return { g: S.settings.portionStart, learned: false };
  fin.sort((a, b) => a - b);
  let g = fin.length ? fin[Math.floor(fin.length * 0.75)] : S.settings.portionStart;
  if (full.length) g = Math.min(g, Math.min(...full) - 10);
  return { g: Math.max(120, r0(g)), learned: true, n: fin.length + full.length };
}

// ---------- UI ----------
const UI = { tab: 'today', day: today(), food: 'log', week: monday(today()), search: '' };
const TITLES = { today: 'Today', log: 'Log', plan: 'Plan', cards: 'Meal cards', pantry: 'Pantry', shop: 'Shopping' };
const VIEWS = {}, BIND = {};
const FOOD_TABS = ['log', 'plan', 'cards', 'pantry', 'shop'];
const FOOD_LABELS = { log: 'Log', plan: 'Plan', cards: 'Cards', pantry: 'Pantry', shop: 'Shop' };
function render() {
  const view = UI.tab === 'food' ? UI.food : UI.tab;
  $('#title').textContent = TITLES[view];
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.tab));
  const seg = UI.tab === 'food' ? `<div class="seg">${FOOD_TABS.map(t => `<button data-seg="${t}" class="${UI.food === t ? 'on' : ''}">${FOOD_LABELS[t]}</button>`).join('')}</div>` : '';
  const v = $('#view'); v.innerHTML = seg + VIEWS[view](); BIND[view] && BIND[view](v);
  $$('[data-seg]', v).forEach(b => b.onclick = () => { UI.food = b.dataset.seg; render(); scrollTo(0, 0); });
}
const go = tab => { if (FOOD_TABS.includes(tab)) { UI.food = tab; tab = 'food'; } UI.tab = tab; render(); scrollTo(0, 0); };
$$('.tabs button').forEach(b => b.onclick = () => go(b.dataset.tab));
$('#btnSettings').onclick = () => openSettings();

function dialog(html, onOk, okLabel = 'Save') {
  const d = $('#dlg'), body = $('#dlgBody');
  if (d.open) { d.onclose && d.onclose(); d.onclose = null; d.close(); }
  body.innerHTML = html + `<div class="dlg-actions"><button value="cancel" class="ghost">${onOk ? 'Cancel' : 'Close'}</button>${onOk ? `<button value="ok" class="primary">${okLabel}</button>` : ''}</div>`;
  d.onclose = null;
  body.onsubmit = e => {
    if (e.submitter && e.submitter.value === 'ok' && onOk) {
      if (onOk(body) === false) { e.preventDefault(); return; }
      save(); render();
    }
  };
  d.showModal(); return body;
}
const closeDlg = () => $('#dlg').open && $('#dlg').close();
function confirmInline(btn) { if (btn.dataset.sure) return true; btn.dataset.sure = 1; btn.textContent = 'Tap again to confirm'; return false; }
function dayBar() {
  return `<div class="row daybar"><button class="mini" data-day="-1">‹</button><div class="grow center">${UI.day === today() ? 'Today · ' : ''}${fmtDay(UI.day)}</div><button class="mini" data-day="1">›</button></div>`;
}
const bindDayBar = v => $$('[data-day]', v).forEach(b => b.onclick = () => { UI.day = addDays(UI.day, +b.dataset.day); render(); });
const stars = n => `<span class="stars">${'★'.repeat(n || 0)}<i>${'★'.repeat(5 - (n || 0))}</i></span>`;

// ---------- warnings ----------
function lastAte() {
  let t = 0;
  for (const d of [today(), addDays(today(), -1)]) for (const e of S.log[d] || []) if (e.at > t) t = e.at;
  return t;
}
function warnings(day) {
  if (day !== today()) return [];
  const s = S.settings, out = [], h = new Date().getHours();
  const last = lastAte();
  if (h >= 7 && h < 23) {
    const gap = last ? (Date.now() - last) / 36e5 : null;
    if (gap != null && gap >= s.gapH) out.push(['warn', `It's been ${Math.floor(gap)} hours since you last ate. Have something small, even a shake.`]);
  }
  const tot = sumM(S.log[day] || []);
  const passed = SLOTS.filter(x => { const [a, b] = x.time.split(':').map(Number); return h * 60 + new Date().getMinutes() >= a * 60 + b + 30; }).length;
  if (h >= 15 && tot.p < s.p * (passed / SLOTS.length) * 0.8) out.push(['warn', `Protein is behind: ${r0(tot.p)} of ${s.p} g. Pick a protein-rich meal next.`]);
  // freezer: things to take out tonight for tomorrow
  const fz = freezerFor(addDays(day, 1));
  if (fz.length && h >= 16) out.push(['info', `Take out of the freezer tonight: ${fz.map(esc).join(', ')}.`]);
  return out;
}
function freezerFor(day) {
  const p = S.plan[day]; if (!p) return [];
  const names = new Set();
  for (const slot of PLAN_SLOTS) {
    const c = cardById(p[slot]); if (!c || (p.cooked || {})[slot]) continue;
    for (const i of c.items) { const f = foodById(i.foodId); const pi = f && S.pantry[f.id]; if (pi && pi.place === 'Freezer' && pantryHas(f.id)) names.add(f.name); }
  }
  return [...names];
}

// ---------- TODAY ----------
function bars(tot) {
  const s = S.settings;
  const bar = (label, val, target, unit) => `<div><div class="muted small">${label}</div><div><b>${r0(val)}</b><span class="muted small"> / ${r0(target)}${unit}</span></div><div class="bar ${val > target * 1.08 && label !== 'Protein' && label !== 'Fibre' ? 'over' : ''}"><i style="width:${Math.min(100, target ? val / target * 100 : 0)}%"></i></div></div>`;
  const left = s.kcal - tot.kcal;
  return `<div class="big">${r0(Math.abs(left))}</div><div class="muted">${left >= 0 ? 'kcal left' : 'kcal over'} · ${r0(tot.kcal)} of ${s.kcal} eaten</div>
    <div class="bar ${left < 0 ? 'over' : ''}"><i style="width:${Math.min(100, tot.kcal / s.kcal * 100)}%"></i></div>
    <div class="macros">${bar('Protein', tot.p, s.p, 'g')}${bar('Carbs', tot.c, s.c, 'g')}${bar('Fat', tot.f, s.f, 'g')}${bar('Fibre', tot.fib, s.fib, 'g')}</div>`;
}
function waterRow(day) {
  const w = (S.day[day] || {}).water || 0, n = S.settings.water;
  return `<div class="row"><div class="grow"><div class="muted small">Water</div><div class="drops">${Array.from({ length: n }, (_, i) => `<button class="drop ${i < w ? 'on' : ''}" data-w="${i + 1}" aria-label="glass ${i + 1}"></button>`).join('')}</div></div><b>${w}/${n}</b></div>`;
}
const bindWater = v => $$('[data-w]', v).forEach(b => b.onclick = () => { const dd = S.day[UI.day] ||= {}; const n = +b.dataset.w; dd.water = dd.water === n ? n - 1 : n; save(); render(); });
function nextMeal() {
  const d = today(), cur = nowSlot(), idx = SLOT_IDS.indexOf(cur);
  for (const slot of SLOT_IDS.slice(idx)) {
    if ((S.log[d] || []).some(e => e.slot === slot)) continue;
    const c = plannedCard(d, slot);
    return { slot, card: c };
  }
  return null;
}
const plannedCard = (d, slot) => cardById((S.plan[d] || {})[slot]) || (PLAN_SLOTS.includes(slot) ? null : cardById(S.settings.fixed[slot]));

VIEWS.today = () => {
  const d = UI.day, tot = sumM(S.log[d] || []), nm = d === today() ? nextMeal() : null, last = lastAte();
  const ws = warnings(d), pl = portionLimit();
  return `${dayBar()}
  ${ws.map(([k, t]) => `<div class="note ${k}">${t}</div>`).join('')}
  <div class="card">${bars(tot)}</div>
  ${nm ? `<div class="card"><div class="row"><div class="grow"><div class="muted small">Next · ${nm.slot} ${SLOTS.find(s => s.id === nm.slot).time}</div><div class="h">${nm.card ? esc(nm.card.name) : 'Nothing planned'}</div>
    ${nm.card ? `<div class="muted small">${r0(cardTotals(nm.card).kcal)} kcal · P ${r0(cardTotals(nm.card).p)} g · ${r0(cardGrams(nm.card))} g</div>` : ''}</div>
    ${nm.card ? `<button class="primary mini" data-lognext="${nm.slot}">Log it</button>` : `<button class="mini" data-gofood>Add</button>`}</div></div>` : ''}
  <div class="card">${waterRow(d)}</div>
  <div class="card"><div class="row"><div class="grow"><div class="muted small">Last ate</div><div>${last ? hm(last) + (iso(new Date(last)) !== today() ? ' yesterday' : '') : '—'}</div></div>
    <div class="grow right"><div class="muted small">Comfortable meal</div><div>${pl.g} g${pl.learned ? ' <span class="muted small">learned</span>' : ''}</div></div></div></div>
  <div class="card"><div class="row"><h2 class="grow">Meals</h2><button class="mini" data-gofood>Open log</button></div>${mealSummary(d)}</div>`;
};
function mealSummary(d) {
  const es = S.log[d] || [];
  return `<ul class="list">${SLOTS.map(s => { const t = sumM(es.filter(e => e.slot === s.id)); const f = ((S.day[d] || {}).full || {})[s.id];
    return `<li><div class="grow">${s.id}<div class="muted small">${s.time}${t.kcal ? ` · ${r0(t.kcal)} kcal · P ${r0(t.p)} g` : ''}</div></div>${f ? `<span class="chip sm">${FULL.find(x => x[0] === f)[1]}</span>` : ''}${t.kcal ? '<span class="ok">✓</span>' : ''}</li>`; }).join('')}</ul>`;
}
BIND.today = v => {
  bindDayBar(v); bindWater(v);
  $$('[data-gofood]', v).forEach(b => b.onclick = () => go('log'));
  $$('[data-lognext]', v).forEach(b => b.onclick = () => { const slot = b.dataset.lognext; logCardDialog(plannedCard(today(), slot), slot); });
};

// ---------- LOG ----------
VIEWS.log = () => {
  const d = UI.day, es = S.log[d] || [], dd = S.day[d] || {}, pl = portionLimit();
  const recent = S.recent.map(foodById).filter(Boolean).slice(0, 8);
  return `${dayBar()}
  <div class="card compact">${bars(sumM(es))}</div>
  <div class="card"><div class="row"><input id="q" class="grow" placeholder="Search foods and cards" value="${esc(UI.search)}" autocomplete="off"></div>
    <div class="row wrap gap"><button id="scan">📷 Scan</button><button id="online">🔎 Search shops</button><button id="newFood">+ New food</button></div>
    ${recent.length ? `<div class="chips">${recent.map(f => `<button class="chip" data-food="${f.id}">${esc(f.name)}</button>`).join('')}</div>` : ''}
    <div id="results"></div></div>
  ${SLOTS.map(s => {
    const list = es.filter(e => e.slot === s.id), t = sumM(list), g = list.reduce((a, e) => a + (e.g || 0), 0), pc = plannedCard(d, s.id);
    const over = g > pl.g, lowP = s.main && list.length && t.p < S.settings.minP;
    return `<div class="card slotcard"><div class="row"><div class="grow"><span class="slot">${s.id}</span> <span class="muted small">${s.time}</span></div><span class="muted small">${t.kcal ? r0(t.kcal) + ' kcal · P ' + r0(t.p) : ''}</span><button class="mini" data-add="${s.id}">+</button></div>
      ${list.length ? `<ul class="list">${list.map(e => `<li><div class="grow">${esc(e.name)}<div class="muted small">${e.g ? r0(e.g) + ' g · ' : ''}${r0(e.kcal)} kcal · P ${r1(e.p)} · C ${r1(e.c)} · F ${r1(e.f)} · Fib ${r1(e.fib)}</div></div><button class="mini del" data-del="${e.id}">✕</button></li>`).join('')}</ul>`
        : pc ? `<button class="planned" data-logcard="${pc.id}" data-slot="${s.id}">Planned: <b>${esc(pc.name)}</b> · ${r0(cardTotals(pc).kcal)} kcal · tap to log</button>` : ''}
      ${over ? `<div class="note warn sm">${r0(g)} g is over your comfortable ${pl.g} g. Eat slowly and stop when you feel full.</div>` : ''}
      ${lowP ? `<div class="note warn sm">Only ${r0(t.p)} g protein in this meal (aim for ${S.settings.minP} g+).</div>` : ''}
      ${list.length ? `<div class="chips">${FULL.map(([k, l]) => `<button class="chip sm ${(dd.full || {})[s.id] === k ? 'on' : ''}" data-full="${s.id}|${k}">${l}</button>`).join('')}</div>` : ''}
    </div>`;
  }).join('')}
  <div class="card">${waterRow(d)}</div>`;
};
function searchLocal(q) {
  q = q.trim().toLowerCase(); if (!q) return '';
  const words = q.split(/\s+/), hit = s => words.every(w => s.toLowerCase().includes(w));
  const foods = S.foods.filter(f => f.kind !== 'item' && hit(f.name + ' ' + (f.brand || ''))).slice(0, 20), cards = S.cards.filter(c => hit(c.name)).slice(0, 8);
  if (!foods.length && !cards.length) return `<p class="muted small">No match. Try Search shops, or + New food.</p>`;
  return `<ul class="list">${cards.map(c => `<li data-card="${c.id}"><div class="grow">🍱 ${esc(c.name)}<div class="muted small">${c.slot} card · ${r0(cardTotals(c).kcal)} kcal</div></div><span>›</span></li>`).join('')}${foods.map(f => `<li data-food="${f.id}"><div class="grow">${f.kind === 'recipe' ? '🥣 ' : ''}${esc(f.name)}<div class="muted small">${f.brand ? esc(f.brand) + ' · ' : ''}${r0(f.kcal)} kcal · P ${r1(f.p)} /100 g</div></div><span>›</span></li>`).join('')}</ul>`;
}
const bindPick = (v, slot) => {
  $$('[data-food]', v).forEach(b => b.onclick = () => logFoodDialog(foodById(b.dataset.food), slot));
  $$('[data-card]', v).forEach(b => b.onclick = () => logCardDialog(cardById(b.dataset.card), slot));
};
BIND.log = v => {
  bindDayBar(v); bindWater(v);
  const res = $('#results', v), q = $('#q', v);
  const run = () => { UI.search = q.value; res.innerHTML = searchLocal(q.value); bindPick(res); };
  q.oninput = run; run(); bindPick($('.chips', v) || document.createElement('div'));
  $('#scan', v).onclick = () => scanDialog();
  $('#online', v).onclick = () => onlineDialog(q.value);
  $('#newFood', v).onclick = () => foodDialog({}, true);
  $$('[data-del]', v).forEach(b => b.onclick = () => { S.log[UI.day] = S.log[UI.day].filter(e => e.id !== b.dataset.del); save(); render(); });
  $$('[data-add]', v).forEach(b => b.onclick = () => pickForSlot(b.dataset.add));
  $$('[data-logcard]', v).forEach(b => b.onclick = () => logCardDialog(cardById(b.dataset.logcard), b.dataset.slot));
  $$('[data-full]', v).forEach(b => b.onclick = () => { const [slot, k] = b.dataset.full.split('|'); const dd = S.day[UI.day] ||= {}; dd.full ||= {}; dd.full[slot] = dd.full[slot] === k ? undefined : k; save(); render(); });
};
function pickForSlot(slot) {
  const cards = S.cards.filter(c => c.slot === slot).sort((a, b) => (b.stars || 0) - (a.stars || 0));
  const body = dialog(`<h2>Add to ${slot}</h2>
    ${cards.length ? `<h3>Cards</h3><ul class="list">${cards.map(c => `<li data-card="${c.id}"><div class="grow">🍱 ${esc(c.name)} ${stars(c.stars)}<div class="muted small">${r0(cardTotals(c).kcal)} kcal · P ${r0(cardTotals(c).p)} g</div></div><span>›</span></li>`).join('')}</ul>` : ''}
    <h3>Food</h3><input name="q" placeholder="Search foods" autocomplete="off"><div id="sres"></div>
    <div class="row wrap gap"><button class="mini" id="sScan">📷 Scan</button><button class="mini" id="sOnline">🔎 Search shops</button></div>`, null);
  UI.pendingSlot = slot;
  const res = $('#sres', body);
  body.q.oninput = () => { res.innerHTML = searchLocal(body.q.value); bindPick(res, slot); };
  bindPick(body, slot);
  $('#sScan', body).onclick = e => { e.preventDefault(); scanDialog(slot); };
  $('#sOnline', body).onclick = e => { e.preventDefault(); onlineDialog(body.q.value, slot); };
}
function addLog(entry) { (S.log[UI.day] ||= []).push(Object.assign({ id: uid(), at: UI.day === today() ? Date.now() : parseDay(UI.day).getTime() + 12 * 36e5 }, entry)); }
const slotSelect = sel => `<label>Meal</label><select name="slot">${SLOT_IDS.map(s => `<option ${s === sel ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
function logFoodDialog(food, slot) {
  if (!food) return;
  const unit = food.unit && food.unitG;
  const body = dialog(`<h2>${esc(food.name)}</h2>
    <div class="muted small">${food.brand ? esc(food.brand) + ' · ' : ''}per 100 g: ${r0(food.kcal)} kcal · P ${r1(food.p)} · C ${r1(food.c)} · F ${r1(food.f)} · Fib ${r1(food.fib)}</div>
    <div class="row"><div class="grow"><label>Amount</label><input name="amt" inputmode="decimal" value="${unit ? 1 : 100}"></div>
      <div class="grow"><label>Unit</label><select name="unit"><option value="g">grams</option>${unit ? `<option value="u" selected>${esc(food.unit)} (${food.unitG} g)</option>` : ''}</select></div></div>
    ${slotSelect(slot || UI.pendingSlot || nowSlot())}<p class="muted" id="prev"></p>`, b => {
    const g = grams(b); if (!g) return false;
    addLog(Object.assign({ slot: b.slot.value, name: food.name, g }, macroFor(food, g)));
    S.recent = [food.id, ...S.recent.filter(x => x !== food.id)].slice(0, 12);
    UI.pendingSlot = null; toast('Logged ✓');
  }, 'Log it');
  const grams = b => num(b.amt.value) * (b.unit.value === 'u' ? food.unitG : 1);
  const upd = () => { const m = macroFor(food, grams(body)); $('#prev', body).textContent = `${r0(grams(body))} g = ${r0(m.kcal)} kcal · P ${r1(m.p)} · Fib ${r1(m.fib)}`; };
  body.amt.oninput = upd; body.unit.onchange = upd; upd();
}
function logCardDialog(c, slot) {
  if (!c) return;
  const t = cardTotals(c);
  dialog(`<h2>🍱 ${esc(c.name)}</h2>
    <ul class="list">${c.items.map(i => { const f = foodById(i.foodId); return f ? `<li><div class="grow">${esc(f.name)}</div><span class="muted">${amountText(f, i.g)}</span></li>` : ''; }).join('')}</ul>
    <p class="muted">${r0(t.kcal)} kcal · P ${r0(t.p)} · C ${r0(t.c)} · F ${r0(t.f)} · Fib ${r0(t.fib)} · ${r0(cardGrams(c))} g</p>
    <label>Portion</label><select name="mult"><option value="0.5">Half</option><option value="0.75">Three quarters</option><option value="1" selected>Full</option><option value="1.25">A bit more</option></select>
    ${slotSelect(slot || (c.slot !== 'Extra' ? c.slot : nowSlot()))}`, b => {
    const m = num(b.mult.value);
    addLog({ slot: b.slot.value, card: c.id, name: c.name + (m !== 1 ? ` ×${m}` : ''), g: cardGrams(c) * m, kcal: t.kcal * m, p: t.p * m, c: t.c * m, f: t.f * m, fib: t.fib * m });
    UI.pendingSlot = null; toast('Logged ✓');
  }, 'Log it');
}

// ---------- barcode + Open Food Facts ----------
const OFF_FIELDS = 'code,product_name,product_name_lt,product_name_en,brands,nutriments,serving_quantity';
function offToFood(p) {
  const n = p.nutriments || {};
  const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : null);
  if (kcal == null) return null;
  return { id: uid(), kind: 'food', barcode: p.code || '', name: p.product_name_en || p.product_name || p.product_name_lt || 'Unnamed product',
    brand: (p.brands || '').split(',')[0].trim(), kcal: r1(kcal), p: r1(n.proteins_100g), c: r1(n.carbohydrates_100g), f: r1(n.fat_100g), fib: r1(n.fiber_100g),
    unit: p.serving_quantity ? 'serving' : '', unitG: num(p.serving_quantity) || 0, shop: 'Lidl', place: 'Cupboard' };
}
function keepFood(food) { const ex = food.barcode && S.foods.find(f => f.barcode === food.barcode); if (ex) return ex; S.foods.push(food); save(); return food; }
async function lookupBarcode(code) {
  code = String(code).replace(/\D/g, '');
  const mine = S.foods.find(f => f.barcode === code); if (mine) return mine;
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`);
  const j = await r.json(); if (j.status !== 1 || !j.product) return null;
  const f = offToFood(Object.assign({ code }, j.product)); return f ? keepFood(f) : null;
}
// scanDialog(slot, onFound): onFound(food) is used by the pantry; default logs it.
async function scanDialog(slot, onFound) {
  const done = onFound || (f => logFoodDialog(f, slot));
  const body = dialog(`<h2>Scan barcode</h2><video class="scan" playsinline muted></video><p class="muted small" id="scanMsg">Point the camera at the barcode.</p>
    <label>Or type the number</label><div class="row"><input name="code" inputmode="numeric" class="grow"><button value="ok" class="mini">Look up</button></div>`, b => { const code = b.code.value.trim(); if (!code) return false; stop(); find(code); }, 'Look up');
  const video = $('video', body), msg = $('#scanMsg', body); let stream, alive = true;
  const stop = () => { alive = false; stream && stream.getTracks().forEach(t => t.stop()); };
  $('#dlg').onclose = stop;
  const find = async code => {
    msg.textContent = 'Looking up ' + code + '…';
    try { const f = await lookupBarcode(code); closeDlg(); if (f) done(f); else { foodDialog({ barcode: code }, !onFound, onFound); toast('Not found: add it from the label'); } }
    catch { toast('No connection'); }
  };
  if (!('BarcodeDetector' in window)) { msg.textContent = 'Camera scanning isn\'t supported here. Type the number instead.'; video.remove(); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream; await video.play();
    const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    const tick = async () => { if (!alive) return; try { const c = await det.detect(video); if (c.length) { stop(); return find(c[0].rawValue); } } catch {} setTimeout(tick, 250); };
    tick();
  } catch { msg.textContent = 'Camera not available. Type the number instead.'; video.remove(); }
}
function onlineDialog(q0, slot, onFound) {
  const done = onFound || (f => logFoodDialog(f, slot));
  const body = dialog(`<h2>Search shops</h2><p class="muted small">Open Food Facts: free, with many Lidl, Maxima and IKI products.</p>
    <div class="row"><input name="q" class="grow" value="${esc(q0 || '')}" placeholder="e.g. Pilos skyr"><button class="mini" id="go">Search</button></div>
    <label class="row tick"><input type="checkbox" name="lt" ${S.settings.offLT ? 'checked' : ''}> Sold in Lithuania only</label><div id="offRes"></div>`, null);
  const run = async e => {
    e && e.preventDefault(); const q = body.q.value.trim(); if (!q) return;
    S.settings.offLT = body.lt.checked; save();
    const out = $('#offRes', body); out.innerHTML = '<p class="muted">Searching…</p>';
    const lt = body.lt.checked ? '&tagtype_0=countries&tag_contains_0=contains&tag_0=lithuania' : '';
    try {
      const r = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=30${lt}&fields=${OFF_FIELDS}`);
      const items = ((await r.json()).products || []).map(offToFood).filter(Boolean);
      if (!items.length) { out.innerHTML = '<p class="muted">Nothing found. Try fewer words or untick Lithuania.</p>'; return; }
      out.innerHTML = `<ul class="list">${items.map((f, i) => `<li data-i="${i}"><div class="grow">${esc(f.name)}<div class="muted small">${esc(f.brand)} · ${r0(f.kcal)} kcal · P ${r1(f.p)} /100 g</div></div><span>›</span></li>`).join('')}</ul>`;
      $$('[data-i]', out).forEach(li => li.onclick = () => { const f = keepFood(items[+li.dataset.i]); closeDlg(); done(f); });
    } catch { out.innerHTML = '<p class="muted">No connection.</p>'; }
  };
  $('#go', body).onclick = run; body.q.onkeydown = e => { if (e.key === 'Enter') run(e); };
  if (q0) run();
}
function foodDialog(f, logAfter = false, onSaved) {
  const isNew = !f.id;
  const body = dialog(`<h2>${isNew ? 'New food' : 'Edit food'}</h2>
    <label>Name</label><input name="name" value="${esc(f.name || '')}">
    <p class="muted small">Per 100 g, from the label:</p>
    <div class="grid4"><div><label>kcal</label><input name="kcal" inputmode="decimal" value="${f.kcal ?? ''}"></div><div><label>Protein</label><input name="p" inputmode="decimal" value="${f.p ?? ''}"></div>
      <div><label>Carbs</label><input name="c" inputmode="decimal" value="${f.c ?? ''}"></div><div><label>Fat</label><input name="f" inputmode="decimal" value="${f.f ?? ''}"></div></div>
    <div class="grid4"><div><label>Fibre</label><input name="fib" inputmode="decimal" value="${f.fib ?? ''}"></div><div><label>Unit</label><input name="unit" value="${esc(f.unit || '')}" placeholder="egg"></div>
      <div><label>g per unit</label><input name="unitG" inputmode="decimal" value="${f.unitG || ''}"></div><div><label>Pack g</label><input name="packG" inputmode="decimal" value="${f.packG || ''}"></div></div>
    <div class="row"><div class="grow"><label>Shop</label><select name="shop">${SHOPS.map(s => `<option ${s === (f.shop || 'Lidl') ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="grow"><label>Kept in</label><select name="place">${PLACES.map(s => `<option ${s === (f.place || 'Cupboard') ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="grow"><label>Price €</label><input name="price" inputmode="decimal" value="${f.price || ''}"></div></div>
    <label>Brand / barcode (optional)</label><div class="row"><input name="brand" class="grow" value="${esc(f.brand || '')}"><input name="barcode" class="grow" inputmode="numeric" value="${esc(f.barcode || '')}"></div>
    ${isNew ? '' : '<p><button class="del mini" id="delFood">Delete food</button></p>'}`, b => {
    if (!b.name.value.trim()) { toast('Add a name'); return false; }
    const o = isNew ? { id: uid(), kind: 'food' } : f;
    Object.assign(o, { name: b.name.value.trim(), kcal: num(b.kcal.value), p: num(b.p.value), c: num(b.c.value), f: num(b.f.value), fib: num(b.fib.value), unit: b.unit.value.trim(), unitG: num(b.unitG.value), packG: num(b.packG.value), shop: b.shop.value, place: b.place.value, price: num(b.price.value) || o.price, brand: b.brand.value.trim(), barcode: b.barcode.value.trim(), edited: true });
    if (isNew) S.foods.push(o);
    if (onSaved) setTimeout(() => onSaved(o), 50); else if (logAfter) setTimeout(() => logFoodDialog(o), 50);
  });
  const del = $('#delFood', body);
  if (del) del.onclick = e => { e.preventDefault(); if (confirmInline(del)) { S.foods = S.foods.filter(x => x.id !== f.id); delete S.pantry[f.id]; save(); closeDlg(); render(); } };
}

// ---------- CARDS + recipes ----------
VIEWS.cards = () => {
  const groups = CARD_TYPES.map(t => [t, S.cards.filter(c => c.slot === t).sort((a, b) => (b.stars || 0) - (a.stars || 0) || a.name.localeCompare(b.name))]);
  const recipes = S.foods.filter(f => f.kind === 'recipe');
  return `<div class="card"><div class="row"><p class="muted small grow">Your meals with set portions. Stars push favourites up in suggestions. Dinner and lunch cards can include a Jonas portion.</p><button class="primary mini" id="newCard">+ Card</button></div></div>
  ${groups.map(([t, list]) => `<div class="card"><h2>${t === 'Extra' ? 'Extras (Jonas only)' : t}${S.settings.fixed[t] ? ' <span class="muted small">· set</span>' : ''}</h2>
    ${list.length ? `<ul class="list">${list.map(c => { const x = cardTotals(c); return `<li data-edit="${c.id}"><div class="grow">${esc(c.name)} ${stars(c.stars)}${S.settings.fixed[t] === c.id ? ' <span class="chip sm on">fixed</span>' : ''}<div class="muted small">${r0(x.kcal)} kcal · P ${r0(x.p)} · Fib ${r0(x.fib)} · ${r0(cardGrams(c))} g${c.jonas ? ' · + Jonas' : ''} · ${haveText(c)}</div></div><span>✎</span></li>`; }).join('')}</ul>` : '<p class="muted small">None yet.</p>'}</div>`).join('')}
  <div class="card"><div class="row"><h2 class="grow">Recipes</h2><button class="mini" id="newRec">+ Recipe</button></div><p class="muted small">Sauces and batches: add ingredients once, then use by weight or spoon in any card.</p>
    ${recipes.length ? `<ul class="list">${recipes.map(f => `<li data-rec="${f.id}"><div class="grow">🥣 ${esc(f.name)}<div class="muted small">${r0(f.kcal)} kcal · P ${r1(f.p)} /100 g${f.unit ? ` · 1 ${esc(f.unit)} = ${f.unitG} g` : ''}</div></div><span>✎</span></li>`).join('')}</ul>` : ''}</div>
  <div class="card"><div class="row"><h2 class="grow">All foods</h2><button class="mini" id="foods">Open</button></div></div>`;
};
BIND.cards = v => {
  $('#newCard', v).onclick = () => cardDialog({ items: [], stars: 3, slot: 'Dinner' });
  $$('[data-edit]', v).forEach(li => li.onclick = () => cardDialog(cardById(li.dataset.edit)));
  $('#newRec', v).onclick = () => recipeDialog({ items: [] });
  $$('[data-rec]', v).forEach(li => li.onclick = () => recipeDialog(foodById(li.dataset.rec)));
  $('#foods', v).onclick = foodsList;
};
function foodsList() {
  const list = S.foods.filter(f => f.kind !== 'recipe').sort((a, b) => a.name.localeCompare(b.name));
  const body = dialog(`<h2>All foods</h2><button class="mini" id="nf">+ New food</button><ul class="list">${list.map(f => `<li data-f="${f.id}"><div class="grow">${esc(f.name)}<div class="muted small">${r0(f.kcal)} kcal · P ${r1(f.p)} · Fib ${r1(f.fib)} · ${esc(f.shop || 'Lidl')}${f.price ? ' ' + eur(f.price) : ''}</div></div><span>✎</span></li>`).join('')}</ul>`, null);
  $('#nf', body).onclick = e => { e.preventDefault(); closeDlg(); foodDialog({}); };
  $$('[data-f]', body).forEach(li => li.onclick = () => { closeDlg(); foodDialog(foodById(li.dataset.f)); });
}
const foodOptions = (sel, ex) => S.foods.filter(f => f.id !== ex && f.kind !== 'item').sort((a, b) => a.name.localeCompare(b.name)).map(f => `<option value="${f.id}" ${f.id === sel ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
const itemRow = (it, ex) => `<div class="row item"><select class="grow" name="fid"><option value="">Choose food…</option>${foodOptions(it.foodId, ex)}</select><input name="g" inputmode="decimal" class="gin" value="${it.g || ''}" placeholder="g"><button class="mini del rm">✕</button></div>`;
const itemsEditor = (items, ex) => `<div id="items">${items.map(it => itemRow(it, ex)).join('')}</div><button class="mini" id="addItem">+ Ingredient</button>`;
function bindItems(body, ex, onChange) {
  const box = $('#items', body);
  const wire = () => { $$('.rm', box).forEach(b => b.onclick = e => { e.preventDefault(); b.parentElement.remove(); onChange(); }); $$('select,input', box).forEach(i => i.oninput = onChange); };
  $('#addItem', body).onclick = e => { e.preventDefault(); box.insertAdjacentHTML('beforeend', itemRow({}, ex)); wire(); onChange(); };
  wire(); onChange();
}
const readItems = body => $$('.item', body).map(r => ({ foodId: $('select', r).value, g: num($('input', r).value) })).filter(i => i.foodId && i.g > 0);
const jonasFactor = c => { const t = cardTotals(c).kcal; if (!c.jonas || !t) return 0; return (c.jonasKcal || (c.slot === 'Lunch' ? S.settings.jonasLunch : S.settings.jonasDinner)) / t; };

function cardDialog(c) {
  const isNew = !c.id;
  const body = dialog(`<h2>${isNew ? 'New meal card' : 'Edit meal card'}</h2>
    <label>Name</label><input name="name" value="${esc(c.name || '')}" placeholder="e.g. Peanut chilli noodles">
    <div class="row"><div class="grow"><label>Meal</label><select name="slot">${CARD_TYPES.map(s => `<option ${s === c.slot ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="grow"><label>Stars</label><select name="stars">${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${n === (c.stars || 3) ? 'selected' : ''}>${'★'.repeat(n)}</option>`).join('')}</select></div></div>
    <h3>Your portion</h3>${itemsEditor(c.items || [])}
    <p class="muted" id="sum"></p>
    <div id="jbox"><label class="row tick"><input type="checkbox" name="jonas" ${c.jonas ? 'checked' : ''}> Also cook a Jonas portion</label>
      <label>Jonas portion kcal (empty = ${S.settings.jonasDinner} dinner / ${S.settings.jonasLunch} lunch)</label><input name="jk" inputmode="numeric" value="${c.jonasKcal || ''}"></div>
    <label class="row tick"><input type="checkbox" name="fixed" ${S.settings.fixed[c.slot] === c.id && c.id ? 'checked' : ''}> Use as the set ${esc(c.slot || '')} every day</label>
    <label>Note (optional)</label><input name="note" value="${esc(c.note || '')}">
    ${isNew ? '' : '<p class="row gap"><button class="mini" id="dupCard">Duplicate</button><button class="del mini" id="delCard">Delete card</button></p>'}`, b => {
    const items = readItems(b); if (!b.name.value.trim() || !items.length) { toast('Add a name and foods'); return false; }
    const o = isNew ? { id: uid() } : c;
    Object.assign(o, { name: b.name.value.trim(), slot: b.slot.value, stars: +b.stars.value, items, jonas: b.jonas.checked && ['Lunch', 'Dinner'].includes(b.slot.value), jonasKcal: num(b.jk.value) || 0, note: b.note.value.trim() });
    if (isNew) S.cards.push(o);
    for (const k in S.settings.fixed) if (S.settings.fixed[k] === o.id) delete S.settings.fixed[k];
    if (b.fixed.checked) S.settings.fixed[o.slot] = o.id;
  });
  const upd = () => {
    const items = readItems(body), t = itemsTotals(items);
    const tmp = { items, jonas: body.jonas.checked, jonasKcal: num(body.jk.value), slot: body.slot.value }, k = jonasFactor(tmp);
    $('#sum', body).textContent = `${r0(t.kcal)} kcal · P ${r0(t.p)} · C ${r0(t.c)} · F ${r0(t.f)} · Fib ${r0(t.fib)} · ${r0(items.reduce((a, i) => a + i.g, 0))} g` + (k ? ` · Jonas ×${r1(k)}` : '');
    $('#jbox', body).classList.toggle('hidden', !['Lunch', 'Dinner'].includes(body.slot.value));
  };
  bindItems(body, null, upd); body.slot.onchange = upd; body.jonas.onchange = upd; body.jk.oninput = upd;
  const del = $('#delCard', body);
  if (del) del.onclick = e => { e.preventDefault(); if (confirmInline(del)) { S.cards = S.cards.filter(x => x.id !== c.id); save(); closeDlg(); render(); } };
  const dup = $('#dupCard', body);
  if (dup) dup.onclick = e => { e.preventDefault(); const n = JSON.parse(JSON.stringify(c)); n.id = uid(); n.name += ' (copy)'; S.cards.push(n); save(); closeDlg(); cardDialog(n); };
}
function recipeDialog(r) {
  const isNew = !r.id;
  const body = dialog(`<h2>${isNew ? 'New recipe' : 'Edit recipe'}</h2>
    <label>Name</label><input name="name" value="${esc(r.name || '')}" placeholder="e.g. Peanut chilli sauce">
    <h3>Ingredients (raw)</h3>${itemsEditor(r.items || [], r.id)}
    <label>Weight after cooking, g (empty = ingredients' total)</label><input name="cooked" inputmode="decimal" value="${r.cookedG || ''}">
    <div class="row"><div class="grow"><label>Unit</label><input name="unit" value="${esc(r.unit || '')}" placeholder="tbsp"></div><div class="grow"><label>g per unit</label><input name="unitG" inputmode="decimal" value="${r.unitG || ''}"></div></div>
    <p class="muted" id="sum"></p>${isNew ? '' : '<p><button class="del mini" id="delRec">Delete recipe</button></p>'}`, b => {
    const items = readItems(b); if (!b.name.value.trim() || !items.length) { toast('Add a name and ingredients'); return false; }
    const o = isNew ? { id: uid(), kind: 'recipe', place: 'Fridge', shop: 'Other' } : r;
    const t = itemsTotals(items), w = num(b.cooked.value) || items.reduce((a, i) => a + i.g, 0);
    Object.assign(o, { name: b.name.value.trim(), items, cookedG: num(b.cooked.value), unit: b.unit.value.trim(), unitG: num(b.unitG.value), kcal: r1(t.kcal / w * 100), p: r1(t.p / w * 100), c: r1(t.c / w * 100), f: r1(t.f / w * 100), fib: r1(t.fib / w * 100) });
    if (isNew) S.foods.push(o);
  });
  const upd = () => { const items = readItems(body), t = itemsTotals(items), w = num(body.cooked.value) || items.reduce((a, i) => a + i.g, 0); $('#sum', body).textContent = items.length ? `Batch ${r0(t.kcal)} kcal · P ${r0(t.p)} g. Per 100 g: ${r0(t.kcal / w * 100)} kcal · P ${r1(t.p / w * 100)} g` : ''; };
  bindItems(body, r.id, upd); body.cooked.oninput = upd;
  const del = $('#delRec', body);
  if (del) del.onclick = e => { e.preventDefault(); if (confirmInline(del)) { S.foods = S.foods.filter(x => x.id !== r.id); save(); closeDlg(); render(); } };
}

// ---------- PANTRY ----------
// S.pantry[foodId] = {place, qty, have}. qty is in grams for food (so cooking can use it up) and in units for household items.
// Each food has a stock unit (su) and its size (suG): eggs, loaves, litres, bags, pieces, or plain grams for meat.
const suOf = f => f.su ? { su: f.su, g: f.suG || 1 } : f.unit && f.unitG ? { su: f.unit, g: f.unitG } : f.packG ? { su: 'pack', g: f.packG } : { su: 'g', g: 1 };
const NOPLURAL = ['g', 'kg', 'L'];
const plural = (u, n) => NOPLURAL.includes(u) || n === 1 ? u : /(ch|sh|x)$/.test(u) ? u + 'es' : u === 'loaf' ? 'loaves' : u + 's';
function stockText(f, qty) {
  const { su, g } = suOf(f);
  if (su === 'g') return qty >= 1000 ? `${r1(qty / 1000)} kg` : `${r0(qty)} g`;
  const n = r1(qty / g); return `${n} ${plural(su, n)}`;
}
const stepOf = f => { const { su, g } = suOf(f); return su === 'g' ? 100 : g; };
const defaultQty = f => { const { su, g } = suOf(f); return su === 'g' ? (f.packG || 500) : (f.packG > g ? Math.max(1, Math.round(f.packG / g)) * g : g); };
const pantryHas = id => { const p = S.pantry[id]; return !!p && p.have !== false && (p.qty == null || p.qty > 0); };
const pantryQty = id => { const p = S.pantry[id]; if (!p || p.have === false) return 0; return p.qty == null ? Infinity : p.qty; };
function fixPantryAmounts() { for (const [id, p] of Object.entries(S.pantry)) { const f = foodById(id); if (f && p.qty == null) p.qty = p.have === false ? 0 : defaultQty(f); } }
function haveText(c) {
  const ings = c.items.map(i => foodById(i.foodId)).filter(Boolean);
  const miss = ings.filter(f => !pantryHas(f.id));
  return miss.length ? `missing ${miss.length}/${ings.length}` : 'all in pantry';
}
VIEWS.pantry = () => {
  fixPantryAmounts();
  const ids = Object.keys(S.pantry).filter(id => foodById(id));
  return `<div class="card"><div class="row"><p class="muted small grow">Use − and + as things get used. At zero it moves to Shop → Ran out. Cooking a card takes its ingredients off.</p><button class="primary mini" id="addP">+ Add</button></div></div>
  ${PLACES.map(pl => { const list = ids.filter(id => (S.pantry[id].place || foodById(id).place) === pl).map(foodById).sort((a, b) => a.name.localeCompare(b.name));
    return `<div class="card"><h2>${pl === 'Freezer' ? '❄︎ ' : ''}${pl}</h2>${list.length ? `<ul class="list">${list.map(f => { const p = S.pantry[f.id], has = pantryHas(f.id);
      return `<li class="${has ? '' : 'out'}"><div class="grow" data-pe="${f.id}">${esc(f.name)}</div><button class="mini" data-q="${f.id}|-1">−</button><span class="qty">${has ? stockText(f, p.qty) : 'out'}</span><button class="mini" data-q="${f.id}|1">+</button></li>`; }).join('')}</ul>` : '<p class="muted small">Empty.</p>'}</div>`; }).join('')}`;
};
BIND.pantry = v => {
  $('#addP', v).onclick = () => pantryAdd();
  $$('[data-q]', v).forEach(b => b.onclick = () => { const [id, d] = b.dataset.q.split('|'); const f = foodById(id), p = S.pantry[id]; p.qty = Math.max(0, r1((p.qty || 0) + stepOf(f) * +d)); p.have = p.qty > 0; save(); render(); });
  $$('[data-pe]', v).forEach(el => el.onclick = () => pantryEdit(foodById(el.dataset.pe)));
};
function pantryEdit(f, isAdd) {
  const p = S.pantry[f.id] || { place: f.place || 'Cupboard', qty: defaultQty(f), have: true };
  const { su, g } = suOf(f);
  const body = dialog(`<h2>${esc(f.name)}</h2>
    <label>Kept in</label><select name="place">${PLACES.map(s => `<option ${s === p.place ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <div class="row"><div class="grow"><label>How much you have</label><input name="amt" inputmode="decimal" value="${r1((p.qty ?? defaultQty(f)) / g)}"></div>
      <div class="grow"><label>Counted in</label><input name="su" value="${esc(su)}" placeholder="g, loaf, L, bag, pc"></div>
      <div class="grow"><label>g per ${esc(su)}</label><input name="sug" inputmode="decimal" value="${g}"></div></div>
    <p class="muted small">Meat: keep it in g. Bread: "loaf" and its weight. Household items: g per unit = 1.</p>
    ${isAdd ? '' : '<p><button class="del mini" id="rmP">Remove from pantry</button></p>'}`, b => {
    const nsu = b.su.value.trim() || 'g', ng = nsu === 'g' ? 1 : (num(b.sug.value) || 1);
    if (nsu !== su || ng !== g) { f.su = nsu; f.suG = ng; f.edited = true; }
    const qty = num(b.amt.value) * ng;
    S.pantry[f.id] = { place: b.place.value, qty, have: qty > 0 };
  }, isAdd ? 'Add' : 'Save');
  const rm = $('#rmP', body); if (rm) rm.onclick = e => { e.preventDefault(); delete S.pantry[f.id]; save(); closeDlg(); render(); };
}
function pantryAdd() {
  const body = dialog(`<h2>Add to pantry</h2><input name="q" placeholder="Search foods" autocomplete="off"><div id="pres"></div>
    <div class="row wrap gap"><button class="mini" id="pScan">📷 Scan</button><button class="mini" id="pOnline">🔎 Search shops</button><button class="mini" id="pNew">+ New food</button></div>`, null);
  const pick = f => { closeDlg(); pantryEdit(f, true); };
  const run = () => { const q = body.q.value.trim().toLowerCase(); const list = q ? S.foods.filter(f => f.name.toLowerCase().includes(q)).slice(0, 20) : [];
    $('#pres', body).innerHTML = `<ul class="list">${list.map(f => `<li data-pf="${f.id}"><div class="grow">${esc(f.name)}${S.pantry[f.id] ? ' <span class="muted small">(in pantry)</span>' : ''}</div><span>›</span></li>`).join('')}</ul>`;
    $$('[data-pf]', body).forEach(li => li.onclick = () => pick(foodById(li.dataset.pf))); };
  body.q.oninput = run;
  $('#pScan', body).onclick = e => { e.preventDefault(); scanDialog(null, pick); };
  $('#pOnline', body).onclick = e => { e.preventDefault(); onlineDialog(body.q.value, null, pick); };
  $('#pNew', body).onclick = e => { e.preventDefault(); closeDlg(); foodDialog({ name: body.q.value }, false, pick); };
}
function useUp(card, mult = 1) {
  for (const i of card.items) { const p = S.pantry[i.foodId]; if (!p || p.qty == null) continue; p.qty = Math.max(0, p.qty - i.g * mult); if (!p.qty) p.have = false; }
}

// ---------- PLAN ----------
function suggest(slot, day) {
  const s = S.cards.filter(c => c.slot === slot);
  return s.map(c => {
    const ings = c.items.map(i => foodById(i.foodId)).filter(Boolean);
    const need = ings.filter(f => !pantryHas(f.id));
    const have = ings.length ? (ings.length - need.length) / ings.length : 0;
    const recentUse = Object.entries(S.plan).filter(([d, p]) => d < day && d >= addDays(day, -6) && PLAN_SLOTS.some(x => p[x] === c.id)).length;
    return { c, need, score: have * 3 + (c.stars || 0) * 0.6 - recentUse * 0.8 };
  }).sort((a, b) => b.score - a.score);
}
function dayTotals(day) {
  const p = S.plan[day] || {}, cs = SLOT_IDS.map(s => PLAN_SLOTS.includes(s) ? cardById(p[s]) : cardById(S.settings.fixed[s])).filter(Boolean);
  return sumM(cs.map(cardTotals));
}
VIEWS.plan = () => {
  const days = Array.from({ length: 7 }, (_, i) => addDays(UI.week, i)), s = S.settings;
  return `<div class="row daybar"><button class="mini" data-wk="-7">‹</button><div class="grow center">Week of ${fmtDay(UI.week)}</div><button class="mini" data-wk="7">›</button></div>
  <div class="row gap"><button class="grow" id="canMake">What can I make now?</button><button class="grow" id="autoFill">Fill Mon–Fri</button></div>
  ${days.map((d, i) => { const p = S.plan[d] || {}, t = dayTotals(d), wknd = i > 4;
    return `<div class="card ${wknd ? 'weekend' : ''} ${d === today() ? 'is-today' : ''}"><div class="row"><h2 class="grow">${DOW(d)} <span class="muted small">${parseDay(d).getDate()}</span></h2><span class="muted small ${Math.abs(t.kcal - s.kcal) < 150 ? 'good' : ''}">${r0(t.kcal)} / ${s.kcal} kcal · P ${r0(t.p)}</span></div>
      ${PLAN_SLOTS.map(slot => { const c = cardById(p[slot]), cooked = (p.cooked || {})[slot];
        return `<div class="row pslot"><span class="slot w">${slot}</span>${c ? `<button class="grow pcard" data-pick="${d}|${slot}">${esc(c.name)}${c.jonas ? ' <span class="muted small">+J</span>' : ''}</button><button class="mini ${cooked ? 'on' : ''}" data-cook="${d}|${slot}" title="Cooked">${cooked ? '✓ cooked' : 'Cook'}</button>` : `<button class="grow pcard empty" data-pick="${d}|${slot}">${wknd ? 'Pick if you like' : '+ Choose'}</button>`}</div>`; }).join('')}
      ${(p.extras || []).length ? `<div class="muted small">Jonas extras: ${p.extras.map(id => esc((cardById(id) || {}).name)).join(', ')}</div>` : ''}
    </div>`; }).join('')}`;
};
BIND.plan = v => {
  $$('[data-wk]', v).forEach(b => b.onclick = () => { UI.week = addDays(UI.week, +b.dataset.wk); render(); });
  $$('[data-pick]', v).forEach(b => b.onclick = () => { const [d, slot] = b.dataset.pick.split('|'); planPick(d, slot); });
  $$('[data-cook]', v).forEach(b => b.onclick = () => {
    const [d, slot] = b.dataset.cook.split('|'), p = S.plan[d], c = cardById(p[slot]); p.cooked ||= {};
    if (p.cooked[slot]) { p.cooked[slot] = false; save(); render(); return; }
    useUp(c, 1 + jonasFactor(c)); for (const id of (slot === 'Dinner' ? p.extras || [] : [])) { const x = cardById(id); x && useUp(x); }
    p.cooked[slot] = true; save(); toast('Cooked ✓ pantry updated'); render();
  });
  $('#canMake', v).onclick = canMakeDialog;
  $('#autoFill', v).onclick = () => {
    for (let i = 0; i < 5; i++) { const d = addDays(UI.week, i); const p = S.plan[d] ||= {};
      for (const slot of PLAN_SLOTS) if (!p[slot]) { const top = suggest(slot, d)[0]; if (top) p[slot] = top.c.id; } }
    save(); render(); toast('Filled the gaps. Tap any meal to change it.');
  };
};
function planPick(d, slot) {
  const p = S.plan[d] ||= {}, list = suggest(slot, d), extras = S.cards.filter(c => c.slot === 'Extra');
  const body = dialog(`<h2>${slot} · ${fmtDay(d)}</h2><p class="muted small">Best matches first: what's in your pantry, then your favourites.</p>
    ${list.length ? `<ul class="list">${list.map(({ c, need }) => `<li data-pc="${c.id}" class="${p[slot] === c.id ? 'sel' : ''}"><div class="grow">${esc(c.name)} ${stars(c.stars)}<div class="muted small">${r0(cardTotals(c).kcal)} kcal · P ${r0(cardTotals(c).p)} · ${need.length ? 'need: ' + need.slice(0, 3).map(f => esc(f.name)).join(', ') + (need.length > 3 ? '…' : '') : '✓ all in pantry'}</div></div></li>`).join('')}</ul>` : `<p class="muted">No ${slot.toLowerCase()} cards yet. Make one under Cards.</p>`}
    ${slot === 'Dinner' && extras.length ? `<h3>Jonas extras</h3><div class="chips">${extras.map(x => `<button class="chip ${(p.extras || []).includes(x.id) ? 'on' : ''}" data-ex="${x.id}">${esc(x.name)}</button>`).join('')}</div>` : ''}
    ${p[slot] ? '<p><button class="del mini" id="clr">Clear this meal</button></p>' : ''}`, null);
  $$('[data-pc]', body).forEach(li => li.onclick = () => { p[slot] = li.dataset.pc; if (p.cooked) p.cooked[slot] = false; save(); closeDlg(); render(); });
  $$('[data-ex]', body).forEach(b => b.onclick = e => { e.preventDefault(); p.extras ||= []; const id = b.dataset.ex; p.extras = p.extras.includes(id) ? p.extras.filter(x => x !== id) : [...p.extras, id]; b.classList.toggle('on'); save(); });
  const clr = $('#clr', body); if (clr) clr.onclick = e => { e.preventDefault(); delete p[slot]; save(); closeDlg(); render(); };
}
function canMakeDialog() {
  const rows = S.cards.filter(c => PLAN_SLOTS.includes(c.slot)).map(c => { const ings = c.items.map(i => foodById(i.foodId)).filter(Boolean); return { c, need: ings.filter(f => !pantryHas(f.id)) }; })
    .filter(x => x.need.length <= 2).sort((a, b) => a.need.length - b.need.length || (b.c.stars || 0) - (a.c.stars || 0));
  dialog(`<h2>What can I make now?</h2>${rows.length ? `<ul class="list">${rows.map(({ c, need }) => `<li><div class="grow">${esc(c.name)} ${stars(c.stars)}<div class="muted small">${c.slot} · ${need.length ? 'quick shop: ' + need.map(f => esc(f.name)).join(', ') : '✓ everything is here'}</div></div></li>`).join('')}</ul>` : '<p class="muted">Nothing is close yet. Add cards and fill your pantry.</p>'}`, null);
}

// ---------- SHOPPING ----------
function shoppingNeeds() {
  const need = {}; // foodId -> grams
  const add = (c, mult) => { for (const i of c.items) need[i.foodId] = (need[i.foodId] || 0) + i.g * mult; };
  const from = UI.week < monday(today()) ? UI.week : (UI.week === monday(today()) ? today() : UI.week);
  for (let i = 0; i < 7; i++) {
    const d = addDays(UI.week, i); if (d < from) continue;
    const p = S.plan[d]; if (!p) continue;
    for (const slot of PLAN_SLOTS) { const c = cardById(p[slot]); if (!c || (p.cooked || {})[slot]) continue; add(c, 1 + jonasFactor(c)); if (slot === 'Dinner') for (const id of p.extras || []) { const x = cardById(id); x && add(x, 1); } }
    for (const slot of ['Pre-workout', 'Snack']) { const c = cardById(S.settings.fixed[slot]); if (c) add(c, 1); }
  }
  // cooked foods (e.g. cooked buckwheat) are bought dry: convert, after using what's already cooked in the pantry
  for (const [id, g] of Object.entries({ ...need })) {
    const f = foodById(id); if (!f || !f.buyAs) continue;
    const raw = S.foods.find(x => x.key === f.buyAs.key); if (!raw) continue;
    const short = g - Math.min(g, pantryQty(id)); delete need[id];
    if (short > 0) need[raw.id] = (need[raw.id] || 0) + short * f.buyAs.ratio;
  }
  const out = [];
  for (const [id, g] of Object.entries(need)) {
    const f = foodById(id); if (!f || f.kind === 'recipe') continue;
    const short = g - Math.min(g, pantryQty(id));
    if (short <= 0) continue;
    const packs = f.packG ? Math.ceil(short / f.packG) : null;
    out.push({ f, g: short, packs, cost: f.price ? (packs || 1) * f.price : null });
  }
  return out;
}
const REG_CATS = ['Food', 'Jonas snacks', 'Drinks', 'Cat', 'Household'];
const allRegulars = () => S.foods.filter(f => f.regular).map(f => ({ key: f.key || f.id, id: f.id, name: f.name, cat: f.cat || 'Food', price: f.price || 0 }));
// regulars unticked (run out) in the pantry and not already on the list
const restock = () => S.foods.filter(f => f.regular && S.pantry[f.id] && !pantryHas(f.id) && !(S.extras || []).some(x => x.key === (f.key || f.id)));
const regCats = () => { const m = {}; for (const r of allRegulars()) (m[r.cat] ||= []).push(r); return [...REG_CATS, ...Object.keys(m).filter(c => !REG_CATS.includes(c))].filter(c => m[c]).map(c => [c, m[c]]); };
VIEWS.shop = () => {
  const items = shoppingNeeds(), extras = S.extras || [], rs = restock(), xTotal = extras.reduce((a, x) => a + (x.price || 0) * x.qty, 0) + rs.reduce((a, f) => a + (f.price || 0), 0);
  const byShop = SHOPS.map(s => [s, items.filter(x => (x.f.shop || 'Lidl') === s)]).filter(([, l]) => l.length);
  const total = items.reduce((a, x) => a + (x.cost || 0), 0) + xTotal, missing = items.filter(x => !x.cost).length;
  const ticked = S.bought[UI.week] || {};
  return `<div class="row daybar"><button class="mini" data-wk="-7">‹</button><div class="grow center">Week of ${fmtDay(UI.week)}</div><button class="mini" data-wk="7">›</button></div>
  <p class="muted small">From the meals you've planned (your portions + Jonas's), minus what's in the pantry.</p>
  ${byShop.length ? byShop.map(([s, l]) => { const st = l.reduce((a, x) => a + (x.cost || 0), 0);
    return `<div class="card"><div class="row"><h2 class="grow">${s}</h2><span class="muted">${st ? '≈ ' + eur(st) : ''}</span></div><ul class="list">${l.map(x => `<li class="${ticked[x.f.id] ? 'done' : ''}"><input type="checkbox" data-buy="${x.f.id}" ${ticked[x.f.id] ? 'checked' : ''}><div class="grow">${esc(x.f.name)}<div class="muted small">${x.packs ? `${x.packs} × ${x.f.packG} g` : amountText(x.f, x.g)}${x.cost ? ' · ≈ ' + eur(x.cost) : ''}</div></div></li>`).join('')}</ul></div>`; }).join('')
    : '<div class="card"><p class="muted">Nothing to buy. Plan some meals first, or your pantry already covers them.</p></div>'}
  ${rs.length ? `<div class="card"><div class="row"><h2 class="grow">Ran out</h2><span class="muted small">from your pantry</span></div><ul class="list">${rs.map(f => `<li><input type="checkbox" data-rs="${f.id}"><div class="grow">${esc(f.name)}<div class="muted small">${esc(f.place || '')}${f.price ? ' · ≈ ' + eur(f.price) : ''}</div></div></li>`).join('')}</ul><p class="muted small">Tick when bought and it goes back in the pantry.</p></div>` : ''}
  <div class="card"><div class="row"><h2 class="grow">Also buy</h2><span class="muted">${xTotal ? '≈ ' + eur(xTotal) : ''}</span></div>
    ${extras.length ? `<ul class="list">${extras.map(x => `<li><input type="checkbox" data-xgot="${x.id}"><div class="grow">${esc(x.name)}<div class="muted small">${esc(x.cat)}${x.price ? ' · ≈ ' + eur(x.price * x.qty) : ''}</div></div><button class="mini" data-xm="${x.id}">−</button><span class="qty">${x.qty}</span><button class="mini" data-xq="${x.id}">+</button><button class="icon del" data-xdel="${x.id}" aria-label="Remove">✕</button></li>`).join('')}</ul><p class="muted small">Tick it when it's in the basket and it disappears. − or ✕ fixes a wrong tap.</p>` : '<p class="muted small">Tap regulars below, or type anything (light bulbs…).</p>'}
    <div class="row"><input id="xt" class="grow" placeholder="Misc: e.g. light bulbs"><button class="mini" id="xa">Add</button></div></div>
  <div class="card"><div class="row"><h2 class="grow">Regulars</h2><button class="mini" id="myReg">+ My own</button></div>
    ${regCats().map(([c, list]) => `<h3>${esc(c)}</h3><div class="chips">${list.map(r => `<button class="chip ${extras.some(x => x.key === r.key) ? 'on' : ''}" data-reg="${esc(r.key)}">${esc(r.name)}${r.price ? ` <span class="muted small">€${r.price.toFixed(2)}</span>` : ''}</button>`).join('')}</div>`).join('')}</div>
  <div class="card total"><div class="row"><div class="grow"><div class="muted small">Estimated shop</div><div class="big">≈ ${eur(total)}</div></div>
    ${missing ? `<div class="muted small right">${missing} item${missing > 1 ? 's have' : ' has'} no price yet.<br>Send me your receipts monthly.</div>` : ''}</div>
    ${Object.values(ticked).some(Boolean) ? '<button class="primary" id="putAway">Put ticked items in the pantry</button>' : ''}</div>`;
};
BIND.shop = v => {
  $$('[data-wk]', v).forEach(b => b.onclick = () => { UI.week = addDays(UI.week, +b.dataset.wk); render(); });
  $$('[data-buy]', v).forEach(c => c.onchange = () => { const t = S.bought[UI.week] ||= {}; t[c.dataset.buy] = c.checked; save(); render(); });
  const addX = (name, extra = {}) => { S.extras ||= []; const ex = extra.key && S.extras.find(x => x.key === extra.key); if (ex) { S.extras = S.extras.filter(x => x !== ex); toast('Taken off'); } else S.extras.push(Object.assign({ id: uid(), name, qty: 1, cat: 'Misc' }, extra)); save(); render(); };
  $('#xa', v).onclick = () => { const t = $('#xt', v).value.trim(); if (t) addX(t); };
  $('#xt', v).onkeydown = e => { if (e.key === 'Enter') $('#xa', v).click(); };
  $$('[data-reg]', v).forEach(b => b.onclick = () => { const r = allRegulars().find(x => x.key === b.dataset.reg); if (r) addX(r.name, { key: r.key, cat: r.cat, price: r.price || 0 }); });
  $$('[data-xq]', v).forEach(b => b.onclick = () => { const x = S.extras.find(y => y.id === b.dataset.xq); x.qty++; save(); render(); });
  $$('[data-xm]', v).forEach(b => b.onclick = () => { const x = S.extras.find(y => y.id === b.dataset.xm); if (--x.qty < 1) S.extras = S.extras.filter(y => y !== x); save(); render(); });
  $$('[data-xdel]', v).forEach(b => b.onclick = () => { S.extras = S.extras.filter(y => y.id !== b.dataset.xdel); save(); render(); });
  $$('[data-xgot]', v).forEach(c => c.onchange = () => { S.extras = S.extras.filter(x => x.id !== c.dataset.xgot); save(); toast('Got it ✓'); render(); });
  $$('[data-rs]', v).forEach(c => c.onchange = () => { const p = S.pantry[c.dataset.rs]; p.have = true; if (p.qty === 0) { const f = foodById(c.dataset.rs); p.qty = defaultQty(f); } save(); toast('Back in the pantry ✓'); render(); });
  $('#myReg', v).onclick = () => dialog(`<h2>Add a regular</h2><label>Name</label><input name="n" placeholder="e.g. Oat milk"><div class="row"><div class="grow"><label>Group</label><select name="c">${REG_CATS.map(c => `<option>${c}</option>`).join('')}</select></div><div class="grow"><label>Kept in</label><select name="pl">${PLACES.map(c => `<option>${c}</option>`).join('')}</select></div></div><label>Price € (optional)</label><input name="p" inputmode="decimal"><p class="muted small">It goes in your pantry too. Untick it there when it runs out and it lands on this list.</p>`, b => {
    if (!b.n.value.trim()) return false;
    const f = { id: uid(), key: 'my-' + uid(), kind: ['Food', 'Jonas snacks'].includes(b.c.value) ? 'food' : 'item', name: b.n.value.trim(), cat: b.c.value, place: b.pl.value, price: num(b.p.value) || 0, regular: true, shop: 'Lidl', kcal: 0, p: 0, c: 0, f: 0, fib: 0 };
    S.foods.push(f); f.su = f.kind === 'item' ? 'pc' : 'g'; f.suG = 1; S.pantry[f.id] = { place: f.place, qty: f.kind === 'item' ? 1 : 500, have: true }; }, 'Add');
  const pa = $('#putAway', v);
  if (pa) pa.onclick = () => {
    const t = S.bought[UI.week] || {}, items = shoppingNeeds();
    for (const x of items) if (t[x.f.id]) { const p = S.pantry[x.f.id] ||= { place: x.f.place || 'Cupboard', qty: 0, have: true }; if (p.qty != null) p.qty += x.packs ? x.packs * x.f.packG : x.g; p.have = true; }
    S.bought[UI.week] = {}; save(); toast('In the pantry ✓'); render();
  };
};

// ---------- trainer Sheet ----------
function sheetCsvUrl(url) {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/); if (!m) return url;
  return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv&sheet=Nutrition`;
}
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) { const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch; }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const KEYS = { kcal: /current cal|calor|kcal/i, p: /protein/i, c: /carb/i, f: /^\s*fat/i };
function targetsFromRows(rows) {
  const out = {}, firstNum = s => { const m = String(s).replace(',', '.').match(/\d+(\.\d+)?/); return m ? +m[0] : null; };
  for (const [k, re] of Object.entries(KEYS)) {
    outer: for (const r of rows) for (let c = 0; c < r.length; c++) { if (!re.test(r[c])) continue; for (let c2 = c + 1; c2 < r.length; c2++) { const n = firstNum(r[c2]); if (n != null) { out[k] = n; break outer; } } }
  }
  return out;
}
async function checkSheet() {
  const url = S.settings.sheetUrl; if (!url) return null;
  const r = await fetch(sheetCsvUrl(url)); if (!r.ok) throw 0;
  return targetsFromRows(parseCsv(await r.text()));
}
function applySplit(t) {
  const s = S.settings, k = t.p * 4 + t.c * 4 + t.f * 9; if (!k) return;
  s.p = r0(s.kcal * (t.p * 4 / k) / 4); s.c = r0(s.kcal * (t.c * 4 / k) / 4); s.f = r0(s.kcal * (t.f * 9 / k) / 9);
}
async function sheetWatch() {
  try {
    const t = await checkSheet(); if (!t || !t.p) return;
    const sig = JSON.stringify(t);
    if (!S.settings.sheetSeen) { S.settings.sheetSeen = sig; save(); return; }
    if (sig === S.settings.sheetSeen) return;
    const n = $('#sheetNote'); n.hidden = false;
    n.innerHTML = `Your trainer updated the Sheet: ${t.kcal || '?'} kcal · P ${t.p} · C ${t.c} · F ${t.f}. <button class="mini" id="sApply">Use his split at ${S.settings.kcal} kcal</button> <button class="mini ghost" id="sIgnore">Ignore</button>`;
    $('#sApply').onclick = () => { applySplit(t); S.settings.sheetSeen = sig; save(); n.hidden = true; render(); toast('Targets updated ✓'); };
    $('#sIgnore').onclick = () => { S.settings.sheetSeen = sig; save(); n.hidden = true; };
  } catch {}
}

// ---------- settings ----------
function openSettings() {
  const s = S.settings;
  const body = dialog(`<h2>Settings</h2>
    <h3>Daily targets</h3>
    <div class="grid4"><div><label>kcal</label><input name="kcal" inputmode="decimal" value="${s.kcal}"></div><div><label>Protein</label><input name="p" inputmode="decimal" value="${s.p}"></div><div><label>Carbs</label><input name="c" inputmode="decimal" value="${s.c}"></div><div><label>Fat</label><input name="f" inputmode="decimal" value="${s.f}"></div></div>
    <div class="grid4"><div><label>Fibre</label><input name="fib" inputmode="decimal" value="${s.fib}"></div><div><label>Water</label><input name="water" inputmode="numeric" value="${s.water}"></div><div><label>Min protein/meal</label><input name="minP" inputmode="numeric" value="${s.minP}"></div><div><label>Gap warn (h)</label><input name="gapH" inputmode="numeric" value="${s.gapH}"></div></div>
    <label>Starting comfortable meal size, g (the app learns from your taps)</label><input name="portionStart" inputmode="numeric" value="${s.portionStart}">
    <h3>Jonas portions</h3>
    <div class="row"><div class="grow"><label>Dinner kcal</label><input name="jonasDinner" inputmode="numeric" value="${s.jonasDinner}"></div><div class="grow"><label>Lunch kcal</label><input name="jonasLunch" inputmode="numeric" value="${s.jonasLunch}"></div></div>
    <h3>Trainer's Sheet</h3>
    <label>Link (shared "anyone with the link"). You get a note when he changes it.</label><input name="sheetUrl" value="${esc(s.sheetUrl)}" placeholder="https://docs.google.com/spreadsheets/d/…">
    <button class="mini" id="split">Apply his macro split to my kcal now</button>
    <h3>Backup</h3><p class="muted small">Your data lives on this phone only. Download a backup now and then.</p>
    <div class="row wrap gap"><button class="mini" id="exp">⬇ Download backup</button><label class="btn mini">⬆ Restore<input type="file" id="imp" accept=".json,application/json" hidden></label></div>
    <p class="muted small">Food list updated ${esc(S.dataUpdated || '—')}.</p>`, b => {
    for (const k of ['kcal', 'p', 'c', 'f', 'fib', 'water', 'minP', 'gapH', 'portionStart', 'jonasDinner', 'jonasLunch']) s[k] = num(b[k].value) || s[k];
    if (b.sheetUrl.value.trim() !== s.sheetUrl) { s.sheetUrl = b.sheetUrl.value.trim(); s.sheetSeen = ''; setTimeout(sheetWatch, 100); }
  });
  $('#split', body).onclick = async e => { e.preventDefault(); s.kcal = num(body.kcal.value) || s.kcal; s.sheetUrl = body.sheetUrl.value.trim();
    try { const t = await checkSheet(); if (!t || !t.p) throw 0; applySplit(t); S.settings.sheetSeen = JSON.stringify(t); save(); closeDlg(); render(); toast(`P ${s.p} · C ${s.c} · F ${s.f} ✓`); } catch { toast('Couldn\'t read the Sheet. Is it shared by link?'); } };
  $('#exp', body).onclick = e => { e.preventDefault(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' })); a.download = `organiser-backup-${today()}.json`; a.click(); };
  $('#imp', body).onchange = async e => { try { const d = JSON.parse(await e.target.files[0].text()); if (!d.settings || !d.foods) throw 0; S = Object.assign(blank(), d); save(); closeDlg(); render(); toast('Backup restored ✓'); } catch { toast('That isn\'t an Organiser backup'); } };
}

// ---------- start ----------
render();
syncFoodData();
if (S.settings.sheetUrl) sheetWatch();
let lastDay = today();
document.addEventListener('visibilitychange', () => { if (document.hidden) return; if (today() !== lastDay) { if (UI.day === lastDay) UI.day = today(); lastDay = today(); } render(); });
setInterval(() => { if (!document.hidden && UI.tab === 'today' && !$('#dlg').open) render(); }, 5 * 60e3);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
