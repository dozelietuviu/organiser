/* Organiser: food, training, weigh-ins, tasks and calendar in one place.
   Everything is stored on this device (localStorage). Use Settings > Backup to save a copy. */
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
const monday = s => { const d = parseDay(s); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return iso(d); };
const r0 = n => Math.round(n || 0);
const r1 = n => Math.round((n || 0) * 10) / 10;
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const fmtDay = s => parseDay(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekdayIdx = s => (parseDay(s).getDay() + 6) % 7;

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 1800);
}

// ---------- data ----------
const KEY = 'organiser.v1';
const SLOTS = ['Morning shake', 'Breakfast', 'Lunch', 'Afternoon shake', 'Dinner', 'Snack'];
const SLOT_TIMES = [[0, 9], [9, 12], [12, 17], [17, 20], [20, 24]]; // hour ranges for default slot

// Starter foods, values per 100 g (generic averages). Edit or add your own in Food > My foods.
const STARTER = [
  ['Egg, whole', 143, 12.6, 0.7, 9.5, 'egg', 50],
  ['Egg white', 52, 10.9, 0.7, 0.2],
  ['Chicken breast, raw', 120, 22.5, 0, 2.6],
  ['Chicken breast, cooked', 165, 31, 0, 3.6],
  ['Chicken thigh, skinless raw', 121, 19.7, 0, 4.1],
  ['Chicken thigh, skinless cooked', 179, 24.8, 0, 8.2],
  ['Beef mince 5%, raw', 137, 21.4, 0, 5],
  ['Salmon, raw', 208, 20, 0, 13],
  ['Tuna in water, drained', 116, 25.5, 0, 0.8],
  ['Tofu, firm', 144, 17.3, 2.8, 8.7],
  ['Cottage cheese (varškė) 5%', 121, 17, 3, 5],
  ['Greek yoghurt 2%', 73, 9.9, 3.9, 2],
  ['Milk 2.5%', 52, 3.3, 4.8, 2.5, 'glass', 250],
  ['Buckwheat, dry', 343, 13.3, 71.5, 3.4],
  ['Buckwheat, cooked', 92, 3.4, 19.9, 0.6],
  ['Rice, white dry', 360, 6.6, 79, 0.6],
  ['Rice, white cooked', 130, 2.7, 28.2, 0.3],
  ['Oats', 389, 16.9, 66.3, 6.9],
  ['Potato, boiled', 87, 1.9, 20.1, 0.1],
  ['Sweet potato, baked', 90, 2, 20.7, 0.2],
  ['Broccoli', 34, 2.8, 6.6, 0.4],
  ['Spinach', 23, 2.9, 3.6, 0.4],
  ['Napa cabbage', 16, 1.2, 3.2, 0.2],
  ['Banana', 89, 1.1, 22.8, 0.3, 'banana', 120],
  ['Raspberries, frozen', 52, 1.2, 11.9, 0.7],
  ['Avocado', 160, 2, 8.5, 14.7],
  ['Mixed nuts', 607, 20, 21, 54, 'serving', 30],
  ['Peanut butter', 588, 25, 20, 50, 'tbsp', 16],
  ['Olive oil', 884, 0, 0, 100, 'tbsp', 13.5],
].map(([name, kcal, p, c, f, unit, unitG]) => ({ id: uid(), name, kcal, p, c, f, unit: unit || '', unitG: unitG || 0, kind: 'food' }));

function blank() {
  return {
    settings: {
      kcal: 1757, p: 107, c: 179, f: 60,
      sheetUrl: '', sheetSynced: '',
      startW: 96.2, startDate: '2026-10-28', goalW: 70, goalDate: '2027-06-19',
      calEmail: '', offLT: true,
    },
    foods: STARTER,
    cards: [],
    log: {},       // date -> [{id, slot, name, g, kcal, p, c, f}]
    day: {},       // date -> {water, steps}
    weights: [],   // [{date, kg, waist, hips}]
    tasks: [],     // [{id, text, due, done, doneOn}]
    templates: [], // [{id, name, items:[text]}]
    week: {},      // weekday index -> template id
    workouts: {},  // date -> {tid, name, items:[text], done:[bool], note, trainer}
    recent: [],    // food ids
  };
}
let S;
try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || 'null') || {}); } catch { S = blank(); }
S.settings = Object.assign(blank().settings, S.settings);
const save = () => localStorage.setItem(KEY, JSON.stringify(S));
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

// macros of a food for g grams
const macroFor = (food, g) => ({ kcal: food.kcal * g / 100, p: food.p * g / 100, c: food.c * g / 100, f: food.f * g / 100 });
const sumM = list => list.reduce((a, x) => ({ kcal: a.kcal + (x.kcal || 0), p: a.p + (x.p || 0), c: a.c + (x.c || 0), f: a.f + (x.f || 0) }), { kcal: 0, p: 0, c: 0, f: 0 });
const foodById = id => S.foods.find(f => f.id === id);
const defaultSlot = () => { const h = new Date().getHours(); const i = SLOT_TIMES.findIndex(([a, b]) => h >= a && h < b); return SLOTS[i < 0 ? 5 : i]; };

// ---------- UI state ----------
const UI = { tab: 'today', day: today(), foodSeg: 'add', planSeg: 'tasks', search: '' };
const TITLES = { today: 'Today', food: 'Food', train: 'Train', progress: 'Progress', plan: 'Plan' };

function render() {
  $('#title').textContent = TITLES[UI.tab];
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.tab));
  const v = $('#view');
  v.innerHTML = VIEWS[UI.tab]();
  (BIND[UI.tab] || (() => {}))(v);
}
$$('.tabs button').forEach(b => b.onclick = () => { UI.tab = b.dataset.tab; render(); scrollTo(0, 0); });
$('#btnSettings').onclick = () => openSettings();

// ---------- dialog ----------
function dialog(html, onOk, okLabel = 'Save') {
  const d = $('#dlg'), body = $('#dlgBody');
  body.innerHTML = html + `<div class="dlg-actions"><button value="cancel" class="ghost">Cancel</button>${onOk ? `<button value="ok" class="primary">${okLabel}</button>` : ''}</div>`;
  d.onclose = null;
  body.onsubmit = e => {
    const btn = e.submitter;
    if (btn && btn.value === 'ok' && onOk) {
      const keep = onOk(body) === false;
      if (keep) { e.preventDefault(); return; }
      save(); render();
    }
  };
  d.showModal();
  return body;
}

// ---------- TODAY ----------
function dayBar() {
  return `<div class="row" style="margin-bottom:10px">
    <button class="mini" data-day="-1">‹</button>
    <div class="grow" style="text-align:center">${UI.day === today() ? 'Today, ' : ''}${fmtDay(UI.day)}</div>
    <button class="mini" data-day="1">›</button></div>`;
}
function bindDayBar(v) { $$('[data-day]', v).forEach(b => b.onclick = () => { UI.day = addDays(UI.day, +b.dataset.day); render(); }); }

function macroBars(tot) {
  const s = S.settings;
  const bar = (label, val, target, unit) => {
    const pct = target ? Math.min(100, val / target * 100) : 0;
    return `<div><div class="muted small">${label}</div><div><b>${r0(val)}</b><span class="muted small"> / ${r0(target)}${unit}</span></div>
      <div class="bar ${val > target * 1.05 ? 'over' : ''}"><i style="width:${pct}%"></i></div></div>`;
  };
  const left = s.kcal - tot.kcal;
  return `<div class="row"><div class="grow"><div class="big">${r0(Math.abs(left))}</div>
      <div class="muted">${left >= 0 ? 'kcal left' : 'kcal over'} · eaten ${r0(tot.kcal)} of ${r0(s.kcal)}</div></div></div>
    <div class="bar ${left < 0 ? 'over' : ''}"><i style="width:${Math.min(100, tot.kcal / s.kcal * 100)}%"></i></div>
    <div class="macros">${bar('Protein', tot.p, s.p, 'g')}${bar('Carbs', tot.c, s.c, 'g')}${bar('Fat', tot.f, s.f, 'g')}</div>`;
}

function mealList(day, editable = true) {
  const entries = S.log[day] || [];
  if (!entries.length) return `<p class="muted">Nothing logged yet.</p>`;
  return SLOTS.map(slot => {
    const es = entries.filter(e => e.slot === slot);
    if (!es.length) return '';
    const t = sumM(es);
    return `<div class="slot">${slot} · ${r0(t.kcal)} kcal · ${r0(t.p)} g protein</div><ul class="list">${es.map(e => `
      <li><div class="grow">${esc(e.name)}<div class="muted small">${e.g ? r0(e.g) + ' g · ' : ''}${r0(e.kcal)} kcal · P ${r1(e.p)} · C ${r1(e.c)} · F ${r1(e.f)}</div></div>
      ${editable ? `<button class="mini del" data-del="${e.id}">✕</button>` : ''}</li>`).join('')}</ul>`;
  }).join('');
}

const VIEWS = {};
const BIND = {};

VIEWS.today = () => {
  const d = UI.day, entries = S.log[d] || [], tot = sumM(entries), dd = S.day[d] || {};
  const wo = workoutFor(d);
  const due = S.tasks.filter(t => !t.done && t.due && t.due <= d);
  const wk = weekAvg(monday(d));
  return `${dayBar()}
  <div class="card">${macroBars(tot)}</div>
  <div class="card"><div class="row"><h2 class="grow">Meals</h2><button class="primary mini" id="goFood">+ Add food</button></div>${mealList(d)}</div>
  <div class="card"><div class="row wrap">
    <div class="grow"><label>Water (glasses)</label><div class="row"><button class="mini" data-water="-1">−</button><b style="min-width:2ch;text-align:center">${dd.water || 0}</b><button class="mini" data-water="1">+</button><span class="muted small">/ 12</span></div></div>
    <div class="grow"><label>Steps (from watch)</label><input id="steps" inputmode="numeric" value="${dd.steps || ''}" placeholder="e.g. 8500"></div>
  </div></div>
  <div class="card"><div class="row"><h2 class="grow">Workout</h2><button class="mini" id="goTrain">Open</button></div>
    ${wo ? `<div>${esc(wo.name)} · ${wo.done.filter(Boolean).length}/${wo.items.length} done</div>` : `<p class="muted">Rest day, or nothing planned.</p>`}</div>
  <div class="card"><div class="row"><h2 class="grow">Tasks</h2><button class="mini" id="goPlan">All</button></div>
    ${due.length ? `<ul class="list">${due.map(t => `<li><input type="checkbox" data-task="${t.id}"><div class="grow">${esc(t.text)}${t.due < d ? ` <span class="muted small">(${fmtDay(t.due)})</span>` : ''}</div></li>`).join('')}</ul>` : `<p class="muted">Nothing due.</p>`}</div>
  <div class="card"><div class="row"><div class="grow"><div class="muted small">This week's average weight</div><div class="big">${wk ? r1(wk) + ' kg' : '—'}</div></div><button class="mini" id="goWeigh">+ Weigh-in</button></div></div>`;
};
BIND.today = v => {
  bindDayBar(v);
  $('#goFood', v).onclick = () => { UI.tab = 'food'; UI.foodSeg = 'add'; render(); };
  $('#goTrain', v).onclick = () => { UI.tab = 'train'; render(); };
  $('#goPlan', v).onclick = () => { UI.tab = 'plan'; UI.planSeg = 'tasks'; render(); };
  $('#goWeigh', v).onclick = () => weighDialog();
  $$('[data-del]', v).forEach(b => b.onclick = () => { S.log[UI.day] = S.log[UI.day].filter(e => e.id !== b.dataset.del); save(); render(); });
  $$('[data-water]', v).forEach(b => b.onclick = () => { const dd = S.day[UI.day] ||= {}; dd.water = Math.max(0, (dd.water || 0) + +b.dataset.water); save(); render(); });
  $('#steps', v).onchange = e => { (S.day[UI.day] ||= {}).steps = num(e.target.value) || ''; save(); };
  $$('[data-task]', v).forEach(c => c.onchange = () => { const t = S.tasks.find(x => x.id === c.dataset.task); t.done = true; t.doneOn = today(); save(); toast('Done ✓'); render(); });
};

// ---------- FOOD ----------
VIEWS.food = () => {
  const seg = [['add', 'Log'], ['foods', 'My foods'], ['recipes', 'Recipes'], ['cards', 'Meal cards']]
    .map(([k, l]) => `<button data-seg="${k}" class="${UI.foodSeg === k ? 'on' : ''}">${l}</button>`).join('');
  return `<div class="seg">${seg}</div>` + FOODSEG[UI.foodSeg]();
};
const FOODSEG = {};
FOODSEG.add = () => {
  const recent = S.recent.map(foodById).filter(Boolean).slice(0, 10);
  return `${dayBar()}
  <div class="card">
    <div class="row"><input id="q" class="grow" placeholder="Search your foods, recipes, cards" value="${esc(UI.search)}" autocomplete="off"></div>
    <div class="row wrap" style="margin-top:8px"><button id="scan">📷 Scan barcode</button><button id="online">🔎 Search shops online</button></div>
    ${recent.length ? `<h3>Recent</h3><div class="chips">${recent.map(f => `<button class="chip" data-food="${f.id}">${esc(f.name)}</button>`).join('')}</div>` : ''}
    <div id="results"></div>
  </div>
  ${S.cards.length ? `<div class="card"><h2>Meal cards</h2><div class="chips">${S.cards.map(c => `<button class="chip" data-card="${c.id}">${esc(c.name)} · ${r0(cardTotals(c).kcal)}</button>`).join('')}</div></div>` : ''}
  <div class="card"><h2>${UI.day === today() ? 'Today' : fmtDay(UI.day)}</h2>${mealList(UI.day)}</div>`;
};
function searchLocal(q) {
  q = q.trim().toLowerCase();
  if (!q) return '';
  const words = q.split(/\s+/);
  const hit = s => words.every(w => s.toLowerCase().includes(w));
  const foods = S.foods.filter(f => hit(f.name + ' ' + (f.brand || ''))).slice(0, 25);
  const cards = S.cards.filter(c => hit(c.name));
  if (!foods.length && !cards.length) return `<p class="muted">No match in your foods. Try "Search shops online" or add it in My foods.</p>`;
  return `<ul class="list">${cards.map(c => `<li data-card="${c.id}"><div class="grow">🍱 ${esc(c.name)}<div class="muted small">Meal card · ${r0(cardTotals(c).kcal)} kcal</div></div><span>›</span></li>`).join('')}
    ${foods.map(f => `<li data-food="${f.id}"><div class="grow">${f.kind === 'recipe' ? '🥣 ' : ''}${esc(f.name)}<div class="muted small">${f.brand ? esc(f.brand) + ' · ' : ''}${r0(f.kcal)} kcal · P ${r1(f.p)} per 100 g</div></div><span>›</span></li>`).join('')}</ul>`;
}
function bindPick(v) {
  $$('[data-food]', v).forEach(b => b.onclick = () => logFoodDialog(foodById(b.dataset.food)));
  $$('[data-card]', v).forEach(b => b.onclick = () => logCardDialog(S.cards.find(c => c.id === b.dataset.card)));
}
BIND.food = v => {
  $$('[data-seg]', v).forEach(b => b.onclick = () => { UI.foodSeg = b.dataset.seg; render(); });
  if (UI.foodSeg === 'add') {
    bindDayBar(v);
    const res = $('#results', v), q = $('#q', v);
    const run = () => { UI.search = q.value; res.innerHTML = searchLocal(q.value); bindPick(res); };
    q.oninput = run; run();
    $('#scan', v).onclick = scanDialog;
    $('#online', v).onclick = () => onlineDialog(q.value);
    $$('[data-del]', v).forEach(b => b.onclick = () => { S.log[UI.day] = S.log[UI.day].filter(e => e.id !== b.dataset.del); save(); render(); });
    bindPick($$('.chips', v).length ? v : v);
  }
  (FOODBIND[UI.foodSeg] || (() => {}))(v);
};

function addLog(entry) {
  (S.log[UI.day] ||= []).push(Object.assign({ id: uid() }, entry));
}
function slotSelect(sel) {
  return `<label>Meal</label><select name="slot">${SLOTS.map(s => `<option ${s === sel ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
}
function logFoodDialog(food) {
  if (!food) return;
  const unit = food.unit && food.unitG;
  const body = dialog(`<h2>${esc(food.name)}</h2>
    <div class="muted small">${food.brand ? esc(food.brand) + ' · ' : ''}per 100 g: ${r0(food.kcal)} kcal · P ${r1(food.p)} · C ${r1(food.c)} · F ${r1(food.f)}</div>
    <div class="row">
      <div class="grow"><label>Amount</label><input name="amt" inputmode="decimal" value="${unit ? 1 : 100}" autofocus></div>
      <div class="grow"><label>Unit</label><select name="unit"><option value="g">grams</option>${unit ? `<option value="u" selected>${esc(food.unit)} (${food.unitG} g)</option>` : ''}</select></div>
    </div>
    ${slotSelect(defaultSlot())}
    <p class="muted" id="prev"></p>`, b => {
    const g = grams(b); if (!g) return false;
    addLog(Object.assign({ slot: b.slot.value, name: food.name, g }, macroFor(food, g)));
    S.recent = [food.id, ...S.recent.filter(x => x !== food.id)].slice(0, 12);
    toast('Logged ✓');
  }, 'Log it');
  const grams = b => num(b.amt.value) * (b.unit.value === 'u' ? food.unitG : 1);
  const upd = () => { const m = macroFor(food, grams(body)); $('#prev', body).textContent = `${r0(grams(body))} g = ${r0(m.kcal)} kcal · P ${r1(m.p)} · C ${r1(m.c)} · F ${r1(m.f)}`; };
  body.amt.oninput = upd; body.unit.onchange = upd; upd();
}

// ---------- barcode + Open Food Facts ----------
const OFF_FIELDS = 'code,product_name,product_name_lt,product_name_en,brands,nutriments,serving_quantity';
function offToFood(p) {
  const n = p.nutriments || {};
  const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : null);
  if (kcal == null) return null;
  return {
    id: uid(), kind: 'food', barcode: p.code || '',
    name: p.product_name_en || p.product_name || p.product_name_lt || 'Unnamed product',
    brand: (p.brands || '').split(',')[0].trim(),
    kcal: r1(kcal), p: r1(n.proteins_100g), c: r1(n.carbohydrates_100g), f: r1(n.fat_100g),
    unit: p.serving_quantity ? 'serving' : '', unitG: num(p.serving_quantity) || 0,
  };
}
function keepFood(food) {
  const existing = food.barcode && S.foods.find(f => f.barcode === food.barcode);
  if (existing) return existing;
  S.foods.push(food); save(); return food;
}
async function lookupBarcode(code) {
  code = String(code).replace(/\D/g, '');
  const mine = S.foods.find(f => f.barcode === code);
  if (mine) return mine;
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`);
  const j = await r.json();
  if (j.status !== 1 || !j.product) return null;
  const f = offToFood(Object.assign({ code }, j.product));
  return f ? keepFood(f) : null;
}
function notFound(code) {
  foodDialog({ barcode: code, name: '' }, true);
  toast('Not in the database: add it from the label');
}
async function scanDialog() {
  const body = dialog(`<h2>Scan barcode</h2>
    <video class="scan" playsinline muted></video>
    <p class="muted small" id="scanMsg">Point the camera at the barcode.</p>
    <label>Or type the number</label><div class="row"><input name="code" inputmode="numeric" class="grow"><button value="ok" class="mini">Look up</button></div>`, b => {
    const code = b.code.value.trim(); if (!code) return false;
    stop(); find(code);
  }, 'Look up');
  const video = $('video', body), msg = $('#scanMsg', body);
  let stream, alive = true;
  const stop = () => { alive = false; stream && stream.getTracks().forEach(t => t.stop()); };
  $('#dlg').onclose = stop;
  const find = async code => {
    msg.textContent = 'Looking up ' + code + '…';
    try {
      const f = await lookupBarcode(code);
      if ($('#dlg').open) $('#dlg').close();
      f ? logFoodDialog(f) : notFound(code);
    } catch { toast('No connection'); }
  };
  if (!('BarcodeDetector' in window)) { msg.textContent = 'Camera scanning isn\'t supported in this browser. Type the number instead.'; video.remove(); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream; await video.play();
    const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    const tick = async () => {
      if (!alive) return;
      try { const codes = await det.detect(video); if (codes.length) { stop(); return find(codes[0].rawValue); } } catch {}
      setTimeout(tick, 250);
    };
    tick();
  } catch { msg.textContent = 'Camera not available. Type the number instead.'; video.remove(); }
}
function onlineDialog(q0) {
  const body = dialog(`<h2>Search shops online</h2>
    <p class="muted small">Searches Open Food Facts (free, includes many Lidl, Maxima and IKI products).</p>
    <div class="row"><input name="q" class="grow" value="${esc(q0)}" placeholder="e.g. Pilos skyr"><button value="go" class="mini" id="go">Search</button></div>
    <label class="row" style="gap:6px"><input type="checkbox" name="lt" ${S.settings.offLT ? 'checked' : ''} style="width:18px;height:18px"> Products sold in Lithuania only</label>
    <div id="offRes"></div>`, null);
  const go = async e => {
    e && e.preventDefault();
    const q = body.q.value.trim(); if (!q) return;
    S.settings.offLT = body.lt.checked; save();
    const out = $('#offRes', body); out.innerHTML = '<p class="muted">Searching…</p>';
    const lt = body.lt.checked ? '&tagtype_0=countries&tag_contains_0=contains&tag_0=lithuania' : '';
    try {
      const r = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=30${lt}&fields=${OFF_FIELDS}`);
      const j = await r.json();
      const items = (j.products || []).map(offToFood).filter(Boolean);
      if (!items.length) { out.innerHTML = '<p class="muted">Nothing found. Try fewer words, untick Lithuania, or add it yourself in My foods.</p>'; return; }
      out.innerHTML = `<ul class="list">${items.map((f, i) => `<li data-i="${i}"><div class="grow">${esc(f.name)}<div class="muted small">${esc(f.brand)} · ${r0(f.kcal)} kcal · P ${r1(f.p)} per 100 g</div></div><span>›</span></li>`).join('')}</ul>`;
      $$('[data-i]', out).forEach(li => li.onclick = () => { const f = keepFood(items[+li.dataset.i]); $('#dlg').close(); logFoodDialog(f); });
    } catch { out.innerHTML = '<p class="muted">No connection.</p>'; }
  };
  $('#go', body).onclick = go;
  body.q.onkeydown = e => { if (e.key === 'Enter') go(e); };
  if (q0) go();
}

// ---------- My foods ----------
FOODSEG.foods = () => {
  const list = S.foods.filter(f => f.kind !== 'recipe').sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="card"><div class="row"><h2 class="grow">My foods</h2><button class="primary mini" id="newFood">+ New food</button></div>
    <p class="muted small">Values per 100 g. Add a unit (like "egg = 50 g") to log by pieces.</p>
    <ul class="list">${list.map(f => `<li data-edit="${f.id}"><div class="grow">${esc(f.name)}<div class="muted small">${f.brand ? esc(f.brand) + ' · ' : ''}${r0(f.kcal)} kcal · P ${r1(f.p)} · C ${r1(f.c)} · F ${r1(f.f)}${f.unit ? ` · 1 ${esc(f.unit)} = ${f.unitG} g` : ''}</div></div><span>✎</span></li>`).join('')}</ul></div>`;
};
const FOODBIND = {};
FOODBIND.foods = v => {
  $('#newFood', v).onclick = () => foodDialog({});
  $$('[data-edit]', v).forEach(li => li.onclick = () => foodDialog(foodById(li.dataset.edit)));
};
function foodDialog(f, logAfter = false) {
  const isNew = !f.id;
  const body = dialog(`<h2>${isNew ? 'New food' : 'Edit food'}</h2>
    <label>Name</label><input name="name" value="${esc(f.name || '')}" required>
    <label>Brand / shop (optional)</label><input name="brand" value="${esc(f.brand || '')}" placeholder="e.g. Lidl Pilos">
    <p class="muted small">Per 100 g (from the label):</p>
    <div class="row"><div class="grow"><label>kcal</label><input name="kcal" inputmode="decimal" value="${f.kcal ?? ''}"></div>
      <div class="grow"><label>Protein</label><input name="p" inputmode="decimal" value="${f.p ?? ''}"></div></div>
    <div class="row"><div class="grow"><label>Carbs</label><input name="c" inputmode="decimal" value="${f.c ?? ''}"></div>
      <div class="grow"><label>Fat</label><input name="f" inputmode="decimal" value="${f.f ?? ''}"></div></div>
    <div class="row"><div class="grow"><label>Unit name (optional)</label><input name="unit" value="${esc(f.unit || '')}" placeholder="egg, slice, tbsp"></div>
      <div class="grow"><label>Grams per unit</label><input name="unitG" inputmode="decimal" value="${f.unitG || ''}"></div></div>
    <label>Barcode (optional)</label><input name="barcode" inputmode="numeric" value="${esc(f.barcode || '')}">
    ${isNew ? '' : '<p><button value="delete" class="del mini" id="delFood">Delete this food</button></p>'}`, b => {
    if (!b.name.value.trim()) return false;
    const o = isNew ? { id: uid(), kind: 'food' } : f;
    Object.assign(o, { name: b.name.value.trim(), brand: b.brand.value.trim(), kcal: num(b.kcal.value), p: num(b.p.value), c: num(b.c.value), f: num(b.f.value), unit: b.unit.value.trim(), unitG: num(b.unitG.value), barcode: b.barcode.value.trim() });
    if (isNew) S.foods.push(o);
    if (logAfter) setTimeout(() => logFoodDialog(o), 50);
  });
  const del = $('#delFood', body);
  if (del) del.onclick = e => { e.preventDefault(); if (confirmInline(del)) { S.foods = S.foods.filter(x => x.id !== f.id); save(); $('#dlg').close(); render(); } };
}
// two-tap confirm without browser dialogs
function confirmInline(btn) {
  if (btn.dataset.sure) return true;
  btn.dataset.sure = 1; btn.textContent = 'Tap again to confirm'; return false;
}

// ---------- Recipes (sauces, batch meals) ----------
FOODSEG.recipes = () => {
  const list = S.foods.filter(f => f.kind === 'recipe');
  return `<div class="card"><div class="row"><h2 class="grow">Recipes</h2><button class="primary mini" id="newRec">+ New recipe</button></div>
    <p class="muted small">For your sauces and batch cooking. Add the ingredients once, then log any amount by weight or by spoon.</p>
    ${list.length ? `<ul class="list">${list.map(f => `<li data-edit="${f.id}"><div class="grow">🥣 ${esc(f.name)}<div class="muted small">${r0(f.kcal)} kcal · P ${r1(f.p)} per 100 g${f.unit ? ` · 1 ${esc(f.unit)} = ${f.unitG} g` : ''}</div></div><span>✎</span></li>`).join('')}</ul>` : '<p class="muted">No recipes yet.</p>'}</div>`;
};
FOODBIND.recipes = v => {
  $('#newRec', v).onclick = () => recipeDialog({ items: [] });
  $$('[data-edit]', v).forEach(li => li.onclick = () => recipeDialog(foodById(li.dataset.edit)));
};
function foodOptions(sel, excludeId) {
  return S.foods.filter(f => f.id !== excludeId).sort((a, b) => a.name.localeCompare(b.name))
    .map(f => `<option value="${f.id}" ${f.id === sel ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
}
function itemsEditor(items, excludeId) {
  return `<div id="items">${items.map(it => itemRow(it, excludeId)).join('')}</div>
    <button class="mini" id="addItem">+ Add ingredient</button>`;
}
const itemRow = (it, excludeId) => `<div class="row item" style="margin:6px 0">
  <select class="grow" name="fid">${foodOptions(it.foodId, excludeId)}</select>
  <input name="g" inputmode="decimal" style="width:80px" value="${it.g || ''}" placeholder="g">
  <button class="mini del rm">✕</button></div>`;
function bindItems(body, excludeId, onChange) {
  const box = $('#items', body);
  const wire = () => { $$('.rm', box).forEach(b => b.onclick = e => { e.preventDefault(); b.parentElement.remove(); onChange(); }); $$('select,input', box).forEach(i => i.oninput = onChange); };
  $('#addItem', body).onclick = e => { e.preventDefault(); box.insertAdjacentHTML('beforeend', itemRow({}, excludeId)); wire(); onChange(); };
  wire(); onChange();
}
const readItems = body => $$('.item', body).map(r => ({ foodId: $('select', r).value, g: num($('input', r).value) })).filter(i => i.foodId && i.g > 0);
const itemsTotals = items => sumM(items.map(i => { const f = foodById(i.foodId); return f ? macroFor(f, i.g) : {}; }));

function recipeDialog(r) {
  const isNew = !r.id;
  const body = dialog(`<h2>${isNew ? 'New recipe' : 'Edit recipe'}</h2>
    <label>Name</label><input name="name" value="${esc(r.name || '')}" placeholder="e.g. Peanut chilli sauce">
    <h3>Ingredients (raw weight)</h3>${itemsEditor(r.items || [])}
    <label>Final weight after cooking, in g (optional: leave empty to use the ingredients' total)</label>
    <input name="cooked" inputmode="decimal" value="${r.cookedG || ''}">
    <div class="row"><div class="grow"><label>Unit (optional)</label><input name="unit" value="${esc(r.unit || '')}" placeholder="tbsp, portion"></div>
      <div class="grow"><label>Grams per unit</label><input name="unitG" inputmode="decimal" value="${r.unitG || ''}"></div></div>
    <p class="muted" id="sum"></p>
    ${isNew ? '' : '<p><button class="del mini" id="delRec">Delete recipe</button></p>'}`, b => {
    const items = readItems(b); if (!b.name.value.trim() || !items.length) { toast('Add a name and ingredients'); return false; }
    const o = isNew ? { id: uid(), kind: 'recipe' } : r;
    const t = itemsTotals(items), raw = items.reduce((a, i) => a + i.g, 0), w = num(b.cooked.value) || raw;
    Object.assign(o, { name: b.name.value.trim(), items, cookedG: num(b.cooked.value), unit: b.unit.value.trim(), unitG: num(b.unitG.value),
      kcal: r1(t.kcal / w * 100), p: r1(t.p / w * 100), c: r1(t.c / w * 100), f: r1(t.f / w * 100) });
    if (isNew) S.foods.push(o);
  });
  bindItems(body, r.id, () => {
    const items = readItems(body), t = itemsTotals(items), raw = items.reduce((a, i) => a + i.g, 0), w = num(body.cooked.value) || raw;
    $('#sum', body).textContent = items.length ? `Whole batch: ${r0(t.kcal)} kcal · P ${r0(t.p)} g. Per 100 g: ${r0(t.kcal / w * 100)} kcal · P ${r1(t.p / w * 100)} g.` : '';
  });
  body.cooked.oninput = () => $('#items', body).dispatchEvent(new Event('input'));
  const del = $('#delRec', body);
  if (del) del.onclick = e => { e.preventDefault(); if (confirmInline(del)) { S.foods = S.foods.filter(x => x.id !== r.id); save(); $('#dlg').close(); render(); } };
}

// ---------- Meal cards ----------
const cardTotals = c => itemsTotals(c.items);
FOODSEG.cards = () => `<div class="card"><div class="row"><h2 class="grow">Meal cards</h2><button class="primary mini" id="newCard">+ New card</button></div>
  <p class="muted small">Your go-to meals with set portions. Tap one on the Log tab to add it in one go.</p>
  ${S.cards.length ? `<ul class="list">${S.cards.map(c => { const t = cardTotals(c); return `<li data-edit="${c.id}"><div class="grow">🍱 ${esc(c.name)}<div class="muted small">${r0(t.kcal)} kcal · P ${r0(t.p)} · C ${r0(t.c)} · F ${r0(t.f)}${c.slot ? ' · ' + esc(c.slot) : ''}</div></div><span>✎</span></li>`; }).join('')}</ul>` : '<p class="muted">No meal cards yet.</p>'}</div>`;
FOODBIND.cards = v => {
  $('#newCard', v).onclick = () => cardDialog({ items: [] });
  $$('[data-edit]', v).forEach(li => li.onclick = () => cardDialog(S.cards.find(c => c.id === li.dataset.edit)));
};
function cardDialog(c) {
  const isNew = !c.id;
  const body = dialog(`<h2>${isNew ? 'New meal card' : 'Edit meal card'}</h2>
    <label>Name</label><input name="name" value="${esc(c.name || '')}" placeholder="e.g. Buckwheat breakfast">
    <label>Usual meal (optional)</label><select name="slot"><option value="">Any</option>${SLOTS.map(s => `<option ${s === c.slot ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <h3>What's in it</h3>${itemsEditor(c.items || [])}
    <p class="muted" id="sum"></p>
    ${isNew ? '' : '<p><button class="del mini" id="delCard">Delete card</button></p>'}`, b => {
    const items = readItems(b); if (!b.name.value.trim() || !items.length) { toast('Add a name and foods'); return false; }
    const o = isNew ? { id: uid() } : c;
    Object.assign(o, { name: b.name.value.trim(), slot: b.slot.value, items });
    if (isNew) S.cards.push(o);
  });
  bindItems(body, null, () => { const t = itemsTotals(readItems(body)); $('#sum', body).textContent = `${r0(t.kcal)} kcal · P ${r0(t.p)} · C ${r0(t.c)} · F ${r0(t.f)}`; });
  const del = $('#delCard', body);
  if (del) del.onclick = e => { e.preventDefault(); if (confirmInline(del)) { S.cards = S.cards.filter(x => x.id !== c.id); save(); $('#dlg').close(); render(); } };
}
function logCardDialog(c) {
  const t = cardTotals(c);
  dialog(`<h2>🍱 ${esc(c.name)}</h2>
    <ul class="list">${c.items.map(i => { const f = foodById(i.foodId); return f ? `<li><div class="grow">${esc(f.name)}</div><span class="muted">${r0(i.g)} g</span></li>` : ''; }).join('')}</ul>
    <p class="muted">${r0(t.kcal)} kcal · P ${r0(t.p)} · C ${r0(t.c)} · F ${r0(t.f)}</p>
    <label>Portion</label><select name="mult"><option value="0.5">Half</option><option value="0.75">Three quarters</option><option value="1" selected>Full</option><option value="1.5">One and a half</option></select>
    ${slotSelect(c.slot || defaultSlot())}`, b => {
    const m = num(b.mult.value);
    addLog({ slot: b.slot.value, name: c.name + (m !== 1 ? ` ×${m}` : ''), g: c.items.reduce((a, i) => a + i.g, 0) * m, kcal: t.kcal * m, p: t.p * m, c: t.c * m, f: t.f * m });
    toast('Logged ✓');
  }, 'Log it');
}

// ---------- TRAIN ----------
function workoutFor(d) {
  if (S.workouts[d]) return S.workouts[d];
  const tid = S.week[weekdayIdx(d)], t = S.templates.find(x => x.id === tid);
  return t ? { tid, name: t.name, items: [...t.items], done: t.items.map(() => false), note: '' } : null;
}
VIEWS.train = () => {
  const d = UI.day, wo = workoutFor(d);
  const hist = Object.entries(S.workouts).filter(([k, w]) => k < d || k === d).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10);
  return `${dayBar()}
  <div class="card"><div class="row"><h2 class="grow">${wo ? esc(wo.name) : 'No workout'}</h2><button class="mini" id="pickWo">${wo ? 'Change' : 'Choose'}</button></div>
    ${wo ? `<ul class="list">${wo.items.map((it, i) => `<li class="${wo.done[i] ? 'done' : ''}"><input type="checkbox" data-ex="${i}" ${wo.done[i] ? 'checked' : ''}><div class="grow">${esc(it)}</div></li>`).join('')}</ul>
      <label>Notes (weights, how it felt)</label><textarea id="woNote" rows="2">${esc(wo.note || '')}</textarea>
      <label class="row" style="gap:6px"><input type="checkbox" id="woTrainer" ${wo.trainer ? 'checked' : ''} style="width:18px;height:18px"> Session with my trainer</label>`
      : '<p class="muted">Pick a workout or mark it as a rest day.</p>'}</div>
  <div class="card"><div class="row"><h2 class="grow">My workouts</h2><button class="primary mini" id="newTpl">+ New</button></div>
    ${S.templates.length ? `<ul class="list">${S.templates.map(t => `<li data-tpl="${t.id}"><div class="grow">${esc(t.name)}<div class="muted small">${t.items.length} exercises</div></div><span>✎</span></li>`).join('')}</ul>` : '<p class="muted">Design your own sessions here, e.g. "Legs + core".</p>'}</div>
  <div class="card"><h2>Weekly plan</h2>
    ${DAYS.map((dn, i) => `<div class="row" style="margin:6px 0"><div style="width:3ch">${dn}</div><select class="grow" data-wd="${i}"><option value="">Rest</option>${S.templates.map(t => `<option value="${t.id}" ${S.week[i] === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>`).join('')}</div>
  <div class="card"><h2>Recent</h2>${hist.length ? `<ul class="list">${hist.map(([k, w]) => `<li><div class="grow">${fmtDay(k)} · ${esc(w.name)}${w.trainer ? ' 🥊' : ''}<div class="muted small">${w.done.filter(Boolean).length}/${w.items.length} done${w.note ? ' · ' + esc(w.note) : ''}</div></div></li>`).join('')}</ul>` : '<p class="muted">Nothing yet.</p>'}</div>`;
};
BIND.train = v => {
  bindDayBar(v);
  const d = UI.day;
  const persist = () => { if (!S.workouts[d]) S.workouts[d] = workoutFor(d); return S.workouts[d]; };
  $$('[data-ex]', v).forEach(c => c.onchange = () => { const w = persist(); w.done[+c.dataset.ex] = c.checked; save(); render(); });
  const note = $('#woNote', v); if (note) note.onchange = () => { persist().note = note.value; save(); };
  const tr = $('#woTrainer', v); if (tr) tr.onchange = () => { persist().trainer = tr.checked; save(); };
  $('#pickWo', v).onclick = () => {
    dialog(`<h2>Workout for ${fmtDay(d)}</h2><select name="t"><option value="">Rest day</option>${S.templates.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>`, b => {
      const t = S.templates.find(x => x.id === b.t.value);
      if (!t) { delete S.workouts[d]; if (S.week[weekdayIdx(d)]) S.workouts[d] = { name: 'Rest', items: [], done: [], note: '' }; return; }
      S.workouts[d] = { tid: t.id, name: t.name, items: [...t.items], done: t.items.map(() => false), note: '' };
    });
  };
  $('#newTpl', v).onclick = () => tplDialog({ items: [] });
  $$('[data-tpl]', v).forEach(li => li.onclick = () => tplDialog(S.templates.find(t => t.id === li.dataset.tpl)));
  $$('[data-wd]', v).forEach(s => s.onchange = () => { S.week[s.dataset.wd] = s.value; save(); render(); });
};
function tplDialog(t) {
  const isNew = !t.id;
  const body = dialog(`<h2>${isNew ? 'New workout' : 'Edit workout'}</h2>
    <label>Name</label><input name="name" value="${esc(t.name || '')}" placeholder="e.g. Legs + core">
    <label>Exercises, one per line</label>
    <textarea name="items" rows="8" placeholder="Goblet squat 3×10 @ 12 kg&#10;Plank 3×40 s&#10;Shadow boxing 3×3 min">${esc((t.items || []).join('\n'))}</textarea>
    ${isNew ? '' : '<p><button class="del mini" id="delTpl">Delete workout</button></p>'}`, b => {
    const items = b.items.value.split('\n').map(s => s.trim()).filter(Boolean);
    if (!b.name.value.trim() || !items.length) { toast('Add a name and exercises'); return false; }
    const o = isNew ? { id: uid() } : t;
    Object.assign(o, { name: b.name.value.trim(), items });
    if (isNew) S.templates.push(o);
  });
  const del = $('#delTpl', body);
  if (del) del.onclick = e => { e.preventDefault(); if (confirmInline(del)) { S.templates = S.templates.filter(x => x.id !== t.id); for (const k in S.week) if (S.week[k] === t.id) S.week[k] = ''; save(); $('#dlg').close(); render(); } };
}

// ---------- PROGRESS ----------
function weekAvg(mon) {
  const end = addDays(mon, 7);
  const ws = S.weights.filter(w => w.date >= mon && w.date < end);
  return ws.length ? ws.reduce((a, w) => a + w.kg, 0) / ws.length : null;
}
function weeklySeries() {
  const weeks = [...new Set(S.weights.map(w => monday(w.date)))].sort();
  return weeks.map(m => ({ week: m, kg: weekAvg(m), n: S.weights.filter(w => monday(w.date) === m).length }));
}
function weighDialog(w = {}) {
  dialog(`<h2>Weigh-in</h2>
    <div class="row"><div class="grow"><label>Date</label><input type="date" name="date" value="${w.date || today()}"></div>
      <div class="grow"><label>Weight (kg)</label><input name="kg" inputmode="decimal" value="${w.kg || ''}" autofocus></div></div>
    <div class="row"><div class="grow"><label>Waist (cm, optional)</label><input name="waist" inputmode="decimal" value="${w.waist || ''}"></div>
      <div class="grow"><label>Hips (cm, optional)</label><input name="hips" inputmode="decimal" value="${w.hips || ''}"></div></div>`, b => {
    const kg = num(b.kg.value); if (!kg) return false;
    S.weights = S.weights.filter(x => x.date !== b.date.value);
    S.weights.push({ date: b.date.value, kg, waist: num(b.waist.value) || null, hips: num(b.hips.value) || null });
    S.weights.sort((a, b) => a.date.localeCompare(b.date));
    toast('Saved ✓');
  });
}
function chart() {
  const s = S.settings, W = 600, H = 260, P = { l: 34, r: 10, t: 12, b: 24 };
  const pts = S.weights, wk = weeklySeries();
  const x0 = parseDay(s.startDate).getTime(), x1 = Math.max(parseDay(s.goalDate).getTime(), ...pts.map(p => parseDay(p.date).getTime()));
  const all = [s.startW, s.goalW, ...pts.map(p => p.kg)];
  const y0 = Math.floor(Math.min(...all) - 1), y1 = Math.ceil(Math.max(...all) + 1);
  const X = t => P.l + (t - x0) / (x1 - x0) * (W - P.l - P.r), Y = kg => P.t + (y1 - kg) / (y1 - y0) * (H - P.t - P.b);
  const xd = d => X(parseDay(d).getTime());
  let grid = '';
  for (let k = Math.ceil(y0 / 5) * 5; k <= y1; k += 5) grid += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(k)}" y2="${Y(k)}" stroke="#2c4135"/><text x="${P.l - 6}" y="${Y(k) + 4}" text-anchor="end" fill="#9bb0a2" font-size="11">${k}</text>`;
  const months = []; const m = parseDay(s.startDate); m.setDate(1); m.setMonth(m.getMonth() + 1);
  while (m.getTime() <= x1) { months.push(new Date(m)); m.setMonth(m.getMonth() + 1); }
  grid += months.map(d => `<text x="${X(d.getTime())}" y="${H - 6}" text-anchor="middle" fill="#9bb0a2" font-size="11">${d.toLocaleDateString('en-GB', { month: 'short' })}</text>`).join('');
  const plan = `<line x1="${xd(s.startDate)}" y1="${Y(s.startW)}" x2="${xd(s.goalDate)}" y2="${Y(s.goalW)}" stroke="#e6b87a" stroke-dasharray="5 5" stroke-width="1.5"/>`;
  const dots = pts.map(p => `<circle cx="${xd(p.date)}" cy="${Y(p.kg)}" r="2.5" fill="#9bb0a2"/>`).join('');
  const line = wk.length > 1 ? `<polyline fill="none" stroke="#b9d98b" stroke-width="2.5" points="${wk.map(w => `${xd(addDays(w.week, 3))},${Y(w.kg)}`).join(' ')}"/>` : '';
  const wdots = wk.map(w => `<circle cx="${xd(addDays(w.week, 3))}" cy="${Y(w.kg)}" r="3.5" fill="#b9d98b"/>`).join('');
  const now = `<line x1="${xd(today())}" x2="${xd(today())}" y1="${P.t}" y2="${H - P.b}" stroke="#2c4135" stroke-dasharray="2 4"/>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${grid}${now}${plan}${dots}${line}${wdots}</svg>
    <div class="muted small"><span style="color:#b9d98b">●</span> weekly average · <span style="color:#9bb0a2">●</span> single weigh-in · <span style="color:#e6b87a">- -</span> plan to ${s.goalW} kg</div>`;
}
VIEWS.progress = () => {
  const s = S.settings, wk = weeklySeries(), cur = wk.length ? wk[wk.length - 1].kg : s.startW;
  const daysLeft = Math.max(1, (parseDay(s.goalDate) - parseDay(today())) / 864e5);
  const planToday = s.startW + (s.goalW - s.startW) * Math.min(1, Math.max(0, (parseDay(today()) - parseDay(s.startDate)) / (parseDay(s.goalDate) - parseDay(s.startDate))));
  const needed = (cur - s.goalW) / (daysLeft / 7);
  const last = S.weights[S.weights.length - 1];
  return `<div class="card"><div class="row"><h2 class="grow">Goal: ${s.goalW} kg by ${fmtDay(s.goalDate)}</h2><button class="primary mini" id="addW">+ Weigh-in</button></div>
    <div class="stat"><div><b>${r1(cur)}</b><span class="muted small">kg, week avg</span></div><div><b>${r1(s.startW - cur)}</b><span class="muted small">kg lost</span></div><div><b>${r1(cur - s.goalW)}</b><span class="muted small">kg to go</span></div></div>
    <p class="muted small" style="margin-top:10px">${cur <= planToday ? '✓ On track' : '↗ Behind'}: the plan line is at ${r1(planToday)} kg today. To reach the goal you need about ${r1(needed)} kg a week from here.</p></div>
  <div class="card">${chart()}</div>
  <div class="card"><h2>Weekly averages</h2>${wk.length ? `<ul class="list">${wk.slice().reverse().map((w, i, a) => { const prev = a[i + 1]; const d = prev ? w.kg - prev.kg : null; return `<li><div class="grow">Week of ${fmtDay(w.week)}<div class="muted small">${w.n} weigh-in${w.n > 1 ? 's' : ''}</div></div><b>${r1(w.kg)}</b>${d != null ? `<span class="muted small" style="width:5ch;text-align:right">${d > 0 ? '+' : ''}${r1(d)}</span>` : '<span style="width:5ch"></span>'}</li>`; }).join('')}</ul>` : '<p class="muted">No weigh-ins yet.</p>'}</div>
  <div class="card"><h2>All weigh-ins</h2>${S.weights.length ? `<ul class="list">${S.weights.slice().reverse().slice(0, 30).map(w => `<li data-w="${w.date}"><div class="grow">${fmtDay(w.date)}<div class="muted small">${w.waist ? 'waist ' + w.waist + ' cm' : ''}${w.waist && w.hips ? ' · ' : ''}${w.hips ? 'hips ' + w.hips + ' cm' : ''}</div></div><b>${r1(w.kg)}</b><button class="mini del" data-wdel="${w.date}">✕</button></li>`).join('')}</ul>` : ''}
    ${last && last.waist ? `<p class="muted small">Waist: ${s.startWaist || 83} → ${last.waist} cm</p>` : ''}</div>`;
};
BIND.progress = v => {
  $('#addW', v).onclick = () => weighDialog();
  $$('[data-wdel]', v).forEach(b => b.onclick = e => { e.stopPropagation(); if (confirmInline(b)) { S.weights = S.weights.filter(w => w.date !== b.dataset.wdel); save(); render(); } });
};

// ---------- PLAN (tasks + calendar) ----------
VIEWS.plan = () => {
  const seg = `<div class="seg"><button data-pseg="tasks" class="${UI.planSeg === 'tasks' ? 'on' : ''}">Tasks</button><button data-pseg="cal" class="${UI.planSeg === 'cal' ? 'on' : ''}">Calendar</button></div>`;
  if (UI.planSeg === 'cal') {
    const e = S.settings.calEmail;
    return seg + `<div class="card">${e ? `<iframe class="cal" src="https://calendar.google.com/calendar/embed?src=${encodeURIComponent(e)}&ctz=Europe%2FVilnius&mode=AGENDA&showTitle=0&showPrint=0&showCalendars=0&showTz=0"></iframe>
      <p class="muted small">If this is blank, you're not signed in to Google in this browser. Use the button below instead.</p>`
      : '<p class="muted">Add your Google Calendar address in Settings ⚙︎ to see it here.</p>'}
      <a class="btn" href="https://calendar.google.com/calendar/r/day" target="_blank" rel="noopener">Open Google Calendar</a></div>`;
  }
  const open = S.tasks.filter(t => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  const done = S.tasks.filter(t => t.done).sort((a, b) => (b.doneOn || '').localeCompare(a.doneOn || '')).slice(0, 15);
  const li = t => `<li class="${t.done ? 'done' : ''}"><input type="checkbox" data-t="${t.id}" ${t.done ? 'checked' : ''}><div class="grow">${esc(t.text)}${t.due ? `<div class="muted small" style="${!t.done && t.due < today() ? 'color:var(--warn)' : ''}">${fmtDay(t.due)}</div>` : ''}</div><button class="mini del" data-tdel="${t.id}">✕</button></li>`;
  return seg + `<div class="card"><div class="row"><input id="tText" class="grow" placeholder="New task"><input id="tDue" type="date" style="width:9.5em"><button class="primary mini" id="tAdd">Add</button></div></div>
    <div class="card"><h2>To do</h2>${open.length ? `<ul class="list">${open.map(li).join('')}</ul>` : '<p class="muted">All clear.</p>'}</div>
    ${done.length ? `<div class="card"><h2>Done</h2><ul class="list">${done.map(li).join('')}</ul></div>` : ''}`;
};
BIND.plan = v => {
  $$('[data-pseg]', v).forEach(b => b.onclick = () => { UI.planSeg = b.dataset.pseg; render(); });
  if (UI.planSeg !== 'tasks') return;
  const add = () => { const t = $('#tText', v).value.trim(); if (!t) return; S.tasks.push({ id: uid(), text: t, due: $('#tDue', v).value, done: false }); save(); render(); };
  $('#tAdd', v).onclick = add;
  $('#tText', v).onkeydown = e => { if (e.key === 'Enter') add(); };
  $$('[data-t]', v).forEach(c => c.onchange = () => { const t = S.tasks.find(x => x.id === c.dataset.t); t.done = c.checked; t.doneOn = c.checked ? today() : ''; save(); render(); });
  $$('[data-tdel]', v).forEach(b => b.onclick = () => { S.tasks = S.tasks.filter(t => t.id !== b.dataset.tdel); save(); render(); });
};

// ---------- trainer Google Sheet ----------
function sheetCsvUrl(url) {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return url; // already a CSV link
  const gid = (url.match(/[#&?]gid=(\d+)/) || [])[1];
  return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv${gid ? '&gid=' + gid : ''}`;
}
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const KEYS = { kcal: /calor|kcal|energ|kalor/i, p: /protein|baltym/i, c: /carb|angliav/i, f: /\bfat|fats|riebal/i };
function targetsFromRows(rows) {
  const out = {};
  const firstNum = s => { const m = String(s).replace(',', '.').match(/\d+(\.\d+)?/); return m ? +m[0] : null; };
  for (const [k, re] of Object.entries(KEYS)) {
    search: for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
      if (!re.test(rows[r][c])) continue;
      const own = firstNum(rows[r][c]); if (own && own > 5) { out[k] = own; break search; }
      for (let c2 = c + 1; c2 < rows[r].length; c2++) { const n = firstNum(rows[r][c2]); if (n != null) { out[k] = n; break search; } }
      if (rows[r + 1]) { const n = firstNum(rows[r + 1][c]); if (n != null) { out[k] = n; break search; } }
    }
  }
  return out;
}
async function syncSheet(quiet) {
  const url = S.settings.sheetUrl; if (!url) return;
  try {
    const r = await fetch(sheetCsvUrl(url)); if (!r.ok) throw 0;
    const t = targetsFromRows(parseCsv(await r.text()));
    if (!Object.keys(t).length) { if (!quiet) toast('Couldn\'t find targets in the sheet'); return; }
    Object.assign(S.settings, t, { sheetSynced: new Date().toISOString() }); save();
    if (!quiet) toast('Targets updated ✓'); render();
  } catch { if (!quiet) toast('Couldn\'t open the sheet. Is it shared "anyone with the link"?'); }
}

// ---------- settings ----------
function openSettings() {
  const s = S.settings;
  const body = dialog(`<h2>Settings</h2>
    <h3>Daily targets</h3>
    <div class="row"><div class="grow"><label>kcal</label><input name="kcal" inputmode="decimal" value="${s.kcal}"></div><div class="grow"><label>Protein g</label><input name="p" inputmode="decimal" value="${s.p}"></div></div>
    <div class="row"><div class="grow"><label>Carbs g</label><input name="c" inputmode="decimal" value="${s.c}"></div><div class="grow"><label>Fat g</label><input name="f" inputmode="decimal" value="${s.f}"></div></div>
    <label>Trainer's Google Sheet link (targets update from it automatically)</label>
    <div class="row"><input name="sheetUrl" class="grow" value="${esc(s.sheetUrl)}" placeholder="https://docs.google.com/spreadsheets/d/…"><button class="mini" id="sync">Sync</button></div>
    <p class="muted small">${s.sheetSynced ? 'Last synced ' + new Date(s.sheetSynced).toLocaleString('en-GB') : 'The sheet must be shared as "anyone with the link can view".'}</p>
    <h3>Weight goal</h3>
    <div class="row"><div class="grow"><label>Start kg</label><input name="startW" inputmode="decimal" value="${s.startW}"></div><div class="grow"><label>Start date</label><input type="date" name="startDate" value="${s.startDate}"></div></div>
    <div class="row"><div class="grow"><label>Goal kg</label><input name="goalW" inputmode="decimal" value="${s.goalW}"></div><div class="grow"><label>Goal date</label><input type="date" name="goalDate" value="${s.goalDate}"></div></div>
    <h3>Calendar</h3>
    <label>Your Google Calendar address (your Gmail)</label><input name="calEmail" type="email" value="${esc(s.calEmail)}">
    <h3>Backup</h3>
    <p class="muted small">Everything is saved on this phone only. Download a backup now and then (e.g. to Google Drive).</p>
    <div class="row wrap"><button class="mini" id="exp">⬇ Download backup</button><label class="btn mini" style="margin:0;color:var(--text)">⬆ Restore backup<input type="file" id="imp" accept=".json,application/json" hidden></label></div>`, b => {
    for (const k of ['kcal', 'p', 'c', 'f', 'startW', 'goalW']) s[k] = num(b[k].value);
    for (const k of ['sheetUrl', 'startDate', 'goalDate', 'calEmail']) s[k] = b[k].value.trim();
  });
  $('#sync', body).onclick = e => { e.preventDefault(); s.sheetUrl = body.sheetUrl.value.trim(); save(); syncSheet(); $('#dlg').close(); };
  $('#exp', body).onclick = e => {
    e.preventDefault();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }));
    a.download = `organiser-backup-${today()}.json`; a.click();
  };
  $('#imp', body).onchange = async e => {
    try { const data = JSON.parse(await e.target.files[0].text()); if (!data.settings) throw 0; S = Object.assign(blank(), data); save(); $('#dlg').close(); render(); toast('Backup restored ✓'); }
    catch { toast('That file isn\'t an Organiser backup'); }
  };
}

// ---------- start ----------
render();
if (S.settings.sheetUrl && navigator.onLine) syncSheet(true);
document.addEventListener('visibilitychange', () => { if (!document.hidden && UI.day !== today() && UI.day === UI._lastToday) { UI.day = today(); render(); } UI._lastToday = today(); });
UI._lastToday = today();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
