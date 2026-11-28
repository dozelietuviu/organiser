/* Organiser: prepped foods.
   A prepped food is something you make in bulk and use inside meal cards (Korean marinated eggs,
   cooked buckwheat, homemade kimchi, nut mix). It is a food with f.prep = { day, keeps, makes }:
     day   = prep day (Mon 0 … Sun 6), keeps = days it keeps in the fridge, makes = grams one batch makes.
   Its ingredients (f.items, optional) are one batch: they go on the shopping list when a prep is coming,
   and come off the pantry when you tap Done.
   Prep chores come from what's planned: on the prep day (or after, if still not done), if the planned
   meals until the next prep day need more than the fridge has, a chore shows on Today.
   Stock lives in the pantry (S.pantry[id].qty, grams; .made = the day it was prepped).
   Loaded before app.js; only functions here. */
'use strict';

const isPrepped = f => !!(f && f.prep);
const prepMakes = f => f.prep.makes || f.cookedG || (f.items || []).reduce((a, i) => a + i.g, 0) || 500;
const keepsTill = f => { const p = S.pantry[f.id]; return p && p.made && f.prep && f.prep.keeps ? addDays(p.made, f.prep.keeps) : null; };
const prepStale = f => { const k = keepsTill(f); return !!k && k < today(); };
// the most recent prep day on or before today
const prepLastDay = f => { let d = today(); for (let k = 0; k < 7 && dowIdx(d) !== f.prep.day; k++) d = addDays(d, -1); return d; };

// prepped foods in what's planned: stock first, then a batch's ingredients for whatever is short
// (cooked buckwheat has no ingredients: the shopping list turns it into dry buckwheat by itself)
function prepExpand(need) {
  for (const [id, g] of Object.entries({ ...need })) {
    const f = foodById(id); if (!isPrepped(f) || f.buyAs) continue;
    delete need[id];
    const short = g - Math.min(g, pantryQty(id)); if (short <= 0 || !(f.items || []).length) continue;
    const k = Math.ceil(short / prepMakes(f)); // whole batches
    for (const i of f.items) need[i.foodId] = (need[i.foodId] || 0) + i.g * k;
  }
}

function foodPrepJobs() {
  const foods = S.foods.filter(isPrepped); if (!foods.length) return [];
  const t = today(), per = Array.from({ length: 7 }, (_, i) => { const d = addDays(t, i); return [d, planNeed([d])]; });
  const out = [];
  for (const f of foods) {
    const pd = prepLastDay(f), key = `f:${f.id}:${pd}`; if ((S.prepDone || {})[key]) continue;
    const until = addDays(pd, 6); let need = 0, first = null;
    for (const [d, n] of per) if (d <= until && n[f.id]) { need += n[f.id]; first ||= d; }
    const have = Math.min(pantryQty(f.id), 1e9);
    if (!first || need <= have + 1) continue;
    out.push({ key, f, pd, first, need, have, food: true });
  }
  return out;
}
const prepFoodRow = j => { const late = j.pd < today() && j.first <= addDays(today(), 1);
  return `<li class="chore ${late ? 'putoff' : ''}"><div class="row"><div class="grow">🍳 Prep: ${esc(j.f.name)}<div class="muted small">need ${esc(stockText(j.f, j.need))}${j.need > prepMakes(j.f) * 1.2 ? ` (${Math.ceil((j.need - j.have) / prepMakes(j.f))} batches)` : ''} by ${j.first === today() ? 'today' : DOW(j.first)} · ${j.have > 0 ? `${esc(stockText(j.f, j.have))} left` : 'none left'}${late ? ' · <span class="warnc">late</span>' : ''}</div></div></div>
  <div class="chips"><button class="chip sm on" data-prepdone="${j.key}">Done</button><button class="chip sm" data-prepskip="${j.key}">Not this week</button></div></li>`; };

// Done: the batch goes into the fridge, its ingredients come off the pantry
// k = batches: enough for what's planned until the next prep day (at least one)
function prepFoodDone(f, j) {
  const p = S.pantry[f.id] ||= { place: f.place || 'Fridge', qty: 0, have: true };
  const old = prepStale(f) ? 0 : Math.min(p.qty || 0, 1e9), k = j ? Math.max(1, Math.ceil((j.need - old) / prepMakes(f))) : 1, mk = prepMakes(f) * k;
  p.qty = r1(old + mk); p.have = true; p.made = today();
  const take = (id, g) => { const q = S.pantry[id]; if (q && q.qty != null) { q.qty = Math.max(0, r1(q.qty - g)); if (!q.qty) q.have = false; } };
  for (const i of f.items || []) take(i.foodId, i.g * k);
  return k;
  if (f.buyAs) { const raw = S.foods.find(x => x.key === f.buyAs.key); if (raw) take(raw.id, mk * f.buyAs.ratio); }
}
function bindPrepJobs(v) {
  $$('[data-prepskip]', v).forEach(b => b.onclick = () => { (S.prepDone ||= {})[b.dataset.prepskip] = 'skip'; save(); render(); toast('Skipped this week'); });
}

// one-off: set up her bulk preps and point the cards at them
function prepSetupV1() {
  if (S.prepFix >= 1) return prepCards();
  const find = re => S.foods.find(f => re.test(f.name || '') && f.kind !== 'item');
  const eggs = find(/^eggs\b/i), soy = find(/^soy sauce/i), honey = find(/^honey$/i), garlic = find(/^garlic$/i);
  const pant0 = f => { S.pantry[f.id] = { place: 'Fridge', qty: 0, have: false }; };
  let ke = find(/korean.*egg/i);
  if (!ke && eggs) {
    const items = [[eggs, 500], [soy, 60], [honey, 14], [garlic, 10]].filter(([f]) => f).map(([f, g]) => ({ foodId: f.id, g }));
    const t = itemsTotals(items), w = 500;
    ke = { id: uid(), kind: 'recipe', name: 'Korean marinated eggs', place: 'Fridge', shop: 'Other', items, cookedG: w, unit: 'egg', unitG: 50,
      kcal: r1(t.kcal / w * 100), p: r1(t.p / w * 100), c: r1(t.c / w * 100), f: r1(t.f / w * 100), fib: r1(t.fib / w * 100) };
    S.foods.push(ke); pant0(ke);
  }
  if (ke) ke.prep ||= { day: 6, keeps: 4, makes: 500 };
  const bc = find(/^buckwheat, cooked/i); if (bc) bc.prep ||= { day: 6, keeps: 4, makes: 650 };
  const km = find(/^kimchi$/i); if (km) km.prep ||= { day: 6, keeps: 30, makes: 1000 };
  const nm = find(/^nut mix/i); if (nm) nm.prep ||= { day: 6, keeps: 30, makes: 300 };
  // this week's prep day has already passed: start fresh from the next one (no pile of late chores on day one)
  for (const f of S.foods.filter(isPrepped)) { const pd = prepLastDay(f); if (pd < today()) (S.prepDone ||= {})[`f:${f.id}:${pd}`] = 'setup'; }
  S.prepFix = 1; prepCards(); save();
}
// cards whose old "Prep job" text is now covered by prepped foods: use those foods, drop the text
// (runs on start and after new cards arrive; only touches cards that still have that text)
function prepCards() {
  const find = re => S.foods.find(f => re.test(f.name || '') && f.kind !== 'item');
  const eggs = find(/^eggs\b/i), ke = find(/korean.*egg/i), bc = find(/^buckwheat, cooked/i);
  const dry = bc && bc.buyAs && S.foods.find(x => x.key === bc.buyAs.key);
  for (const c of S.cards || []) {
    const a = c.ahead || '';
    if (ke && eggs && /korean.*egg/i.test(a)) for (const i of c.items) if (i.foodId === eggs.id) i.foodId = ke.id;
    if (bc && dry && /buckwheat/i.test(a)) for (const i of c.items) if (i.foodId === dry.id) { i.foodId = bc.id; i.g = Math.round(i.g / bc.buyAs.ratio); }
    // these prep jobs now come from the prepped foods themselves
    if (/^(korean soy marinated eggs \+ cook buckwheat \(bulk\)|cook buckwheat for the week)$/i.test(a)) { delete c.ahead; delete c.aheadDay; }
  }
}
