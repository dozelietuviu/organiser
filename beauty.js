/* Organiser: Beauty (Body tab › Beauty). Maintenance, not goals:
   1) skin routine: AM / PM steps, some only on set days, some only in certain weather (SPF when UV is up,
      rich cream when it's cold or dry). Weather: Open-Meteo for Vilnius (free, no key), fetched once a day;
      offline it falls back to the season.
   2) roots: one salon, one colour. Log each colour + a weekly roots check (Fine / Showing / Need it now).
      The app learns your real gap (starts at 6 weeks) and reminds you to book ahead. After a year it can
      tell seasons apart.
   3) products: pantry-style. Opened / finished dates teach how long each lasts; running low or about to
      run out goes on the shopping list (Also buy, Beauty).
   4) optional skin check-in (one tap): over time shows whether breakouts follow your cycle.
   Loaded before app.js; only functions here. Data: S.beauty. */
'use strict';

const BEA = () => { const b = S.beauty ||= {}; for (const [k, v] of Object.entries({ steps: [], done: {}, skin: {}, products: [], hair: { colours: [], checks: [], start: 42, lead: 7 }, wx: null })) b[k] ||= v; return b; };
const WX_URL = 'https://api.open-meteo.com/v1/forecast?latitude=54.69&longitude=25.28&daily=temperature_2m_max,temperature_2m_min,uv_index_max&current=relative_humidity_2m&timezone=Europe%2FVilnius&forecast_days=1';
// weather rules a step can have; each with the offline (season) fallback, months 1-12
const WX_RULES = {
  '': ['Always', () => true],
  uv: ['When UV is 3+', w => w ? w.uv >= 3 : (m => m >= 4 && m <= 9)(new Date().getMonth() + 1)],
  cold: ['Cold or dry days', w => w ? w.tmin <= 0 || w.rh < 45 : (m => m >= 11 || m <= 3)(new Date().getMonth() + 1)],
  mild: ['Not cold or dry', w => !WX_RULES.cold[1](w)],
};
const SKIN = [['clear', 'Clear'], ['dry', 'Dry'], ['oily', 'Oily'], ['breakout', 'Breakout'], ['irritated', 'Irritated']];
const P_CATS = ['Skin', 'Hair', 'Body', 'Makeup', 'Other'];
// the routine (Nov 2026), all editable. days: Mon = 0. active: 'ret' (retinal) / 'bha' (salicylic): never on the same night.
// opt = optional step (doesn't count towards done). note = small reminder under the step.
const BEAUTY_SEED = {
  steps: [
    { name: 'Rinse with water', when: 'am', note: 'Dokdo cleanser only if your skin feels oily' },
    { name: 'NMF + PhytoCeramides', when: 'am' },
    { name: 'Birch Juice sunscreen SPF 45', when: 'am' },
    { name: 'Makeup remover', when: 'pm', opt: true, note: 'eye shadow nights only' },
    { name: 'Dokdo cleanser', when: 'pm' },
    { name: 'Salicylic Acid 2%', when: 'pm', days: [1, 5], active: 'bha' },
    { name: 'NMF + PhytoCeramides', when: 'pm' },
    { name: 'Retinal 0.2%', when: 'pm', days: [0, 3], active: 'ret', note: 'pea-sized for the whole face · after the moisturiser for now, to buffer it' },
  ],
  products: [['Round Lab 1025 Dokdo Cleanser', 'Skin', 12], ['The Ordinary Salicylic Acid 2% Solution', 'Skin', 12], ['The Ordinary Retinal 0.2% Emulsion', 'Skin', 6],
    ['The Ordinary NMF + PhytoCeramides', 'Skin', 12], ['Round Lab Birch Juice Sunscreen SPF 45', 'Skin', 12], ['Makeup remover', 'Skin', 12],
    ['Shampoo', 'Hair', 12], ['Conditioner', 'Hair', 12], ['Hair mask', 'Hair', 12], ['Body lotion', 'Body', 12], ['Deodorant', 'Body', 24], ['Mascara', 'Makeup', 3]],
};
const ACTIVES = { '': 'None', ret: 'Retinal', bha: 'Salicylic acid' };
// short "what it is and why" shown under the product name (editable per product). Matched by name.
const PRODUCT_ABOUT = [
  [/dokdo/i, 'Gentle, low-pH gel cleanser with deep-sea water minerals. Takes off oil, sunscreen and the day without stripping your skin barrier, which matters when you use actives.'],
  [/salicylic/i, 'BHA exfoliant. Oil-soluble, so it gets inside pores and clears them out: fewer blackheads and breakouts, smoother texture. Exfoliating, so never on retinal nights.'],
  [/retinal/i, 'Vitamin A (retinaldehyde), one step stronger and faster than retinol. Speeds up skin renewal: smoother texture, fewer breakouts, softer fine lines over months. Can sting at first, so pea-sized, buffered, and sunscreen every morning.'],
  [/nmf|phytoceramide/i, 'Barrier moisturiser. Natural moisturising factors pull in and hold water; plant ceramides patch up the skin barrier. Keeps skin calm and comfortable while the actives work.'],
  [/birch juice|sunscreen|spf/i, 'Light, hydrating daily sunscreen. UV causes most dark marks and skin ageing, and retinal and salicylic acid make skin more sun-sensitive, so this protects the results.'],
  [/makeup remover/i, 'Melts eye shadow and mascara so the cleanser can do the rest. Less rubbing around the eyes, where the skin is thinnest.'],
  [/mascara/i, 'Replace about every 3 months: bacteria build up in the tube and can cause eye irritation.'],
];
const aboutFor = p => p.about != null ? p.about : ((PRODUCT_ABOUT.find(([re]) => re.test(p.name)) || [])[1] || '');
function seedBeauty() {
  const b = BEA(); if (b.routineV === 2) return;
  const mk = x => Object.assign({ id: uid(), days: null, rule: '', opt: false, active: '', note: '' }, x);
  const prod = ([name, cat, pao]) => ({ id: uid(), name, cat, pao, opened: null, spare: 0, hist: [] });
  b.steps = BEAUTY_SEED.steps.map(mk);
  // skin products replaced by the new ones; hair / body / makeup kept as they are
  b.products = b.seeded ? [...BEAUTY_SEED.products.filter(p => p[1] === 'Skin').map(prod), ...b.products.filter(p => p.cat !== 'Skin')] : BEAUTY_SEED.products.map(prod);
  b.actStart = today(); b.pauseUntil = null; b.seeded = 1; b.routineV = 2;
  save();
}

// ---- weather (once a day; never blocks anything) ----
async function beautyWeather() {
  const b = BEA(); if (b.wx && b.wx.d === today()) return;
  try {
    const r = await fetch(WX_URL); if (!r.ok) return; const j = await r.json();
    b.wx = { d: today(), tmax: j.daily.temperature_2m_max[0], tmin: j.daily.temperature_2m_min[0], uv: j.daily.uv_index_max[0], rh: j.current.relative_humidity_2m };
    save(); if (UI.tab === 'body' || UI.tab === 'today') render();
  } catch (e) { /* offline: the season fallback is used */ }
}
const wxToday = () => { const w = BEA().wx; return w && w.d === today() ? w : null; };
const wxLine = () => { const w = wxToday(); return w ? `${r0(w.tmin)}…${r0(w.tmax)}°C · UV ${r1(w.uv)} · humidity ${r0(w.rh)}%` : 'No weather today (offline), going by the season'; };

// ---- routine ----
const paused = (d = today()) => BEA().pauseUntil && d < BEA().pauseUntil;
const stepToday = (s, d = today()) => (!s.days || s.days.includes(dowIdx(d))) && (WX_RULES[s.rule || ''] || WX_RULES[''])[1](wxToday()) && !(s.active && paused(d));
const actWeek = () => BEA().actStart ? Math.floor(daysBetween(BEA().actStart, today()) / 7) + 1 : 0;
const routine = (when, d = today()) => BEA().steps.filter(s => s.when === when && stepToday(s, d));
const nowWhen = () => new Date().getHours() < 15 ? 'am' : 'pm';
const routineLeft = (when, d = today()) => { const dn = BEA().done[d] || {}; return routine(when, d).filter(s => !s.opt && !dn[s.id]); };

// ---- roots ----
// clue per finished colour cycle: tapped "Need it now" after n days -> n; coloured while still "Fine" -> gap + 7 (went early); else the gap
function rootClues() {
  const h = BEA().hair, cs = h.colours.slice().sort(), out = [];
  for (let i = 1; i < cs.length; i++) {
    const a = cs[i - 1], z = cs[i], gap = daysBetween(a, z), ch = h.checks.filter(c => c.d > a && c.d <= z).sort((x, y) => x.d.localeCompare(y.d));
    const need = ch.find(c => c.k === 'need'), last = ch[ch.length - 1];
    out.push({ from: a, n: need ? daysBetween(a, need.d) : last && last.k === 'fine' ? gap + 7 : gap });
  }
  return out;
}
const seasonOf = d => { const m = parseDay(d).getMonth() + 1; return m <= 2 || m === 12 ? 'Winter' : m <= 5 ? 'Spring' : m <= 8 ? 'Summer' : 'Autumn'; };
// learned gap: average of the last 6 clues; once a season has 4+ clues of its own, that season uses its own average
function rootGap(forDay = today()) {
  const h = BEA().hair, cl = rootClues(); if (!cl.length) return { days: h.start, how: 'your guess' };
  const se = cl.filter(c => seasonOf(c.from) === seasonOf(forDay));
  if (se.length >= 4) return { days: Math.round(avg(se.slice(-6).map(c => c.n))), how: `learned for ${seasonOf(forDay).toLowerCase()}` };
  const l = cl.slice(-6); return { days: Math.round((avg(l.map(c => c.n)) * l.length + h.start) / (l.length + 1)), how: `learned from ${l.length} colour${l.length > 1 ? 's' : ''}` };
}
function rootsState() {
  const h = BEA().hair, last = h.colours.slice().sort().pop(); if (!last) return null;
  const g = rootGap(last), due = addDays(last, g.days), since = daysBetween(last, today());
  const lastCheck = h.checks.filter(c => c.d > last).sort((a, b) => a.d.localeCompare(b.d)).pop();
  return { last, since, g, due, bookBy: addDays(due, -h.lead), appt: h.appt && h.appt >= today() ? h.appt : null,
    checkDue: since >= 21 && (!lastCheck || daysBetween(lastCheck.d, today()) >= 7), lastCheck };
}

// ---- products ----
const lastsDays = p => p.hist.length ? Math.round(avg(p.hist.slice(-4).map(x => x.days))) : null;
function prodState(p) {
  const t = today(), L = lastsDays(p);
  const runsOut = p.opened && L ? addDays(p.opened, L) : null, toss = p.opened && p.pao ? addDays(p.opened, Math.round(p.pao * 30.4)) : null;
  return { L, runsOut, soon: runsOut && daysBetween(t, runsOut) <= 7 && !p.spare, toss: toss && toss <= t ? toss : null, onList: (S.extras || []).some(x => x.key === 'bp:' + p.id) };
}
const toShop = p => { S.extras ||= []; if (!S.extras.some(x => x.key === 'bp:' + p.id)) S.extras.push({ id: uid(), name: p.name, qty: 1, cat: 'Beauty', key: 'bp:' + p.id, price: 0 }); };
// predicted to run out within a week and no spare: onto the shopping list by itself (once per bottle)
function beautyRestock() { let n = 0; for (const p of BEA().products) { const s = prodState(p); if (s.soon && p.autoFor !== p.opened) { p.autoFor = p.opened; toShop(p); n++; } } if (n) save(); }

// ---- optional skin check-in insight: breakouts and the cycle ----
function skinInsight() {
  const sk = BEA().skin, bo = Object.entries(sk).filter(([, v]) => v === 'breakout').map(([d]) => d); if (bo.length < 6 || !S.body) return '';
  const pms = bo.filter(d => { const c = cycleInfo(d); return c && (c.phase === 'PMS week' || c.phase === 'Period'); }).length;
  return pms / bo.length >= .6 ? `${pms} of your ${bo.length} breakouts were in the PMS week or on your period. Go gentle on actives that week.` : '';
}

// ---- views ----
function beautyView() {
  seedBeauty(); beautyWeather(); beautyRestock();
  const b = BEA(), t = today(), dn = b.done[t] || {}, rs = rootsState(), si = skinInsight(), when = nowWhen();
  const stepLi = s => `<li><input type="checkbox" data-bstep="${s.id}" ${dn[s.id] ? 'checked' : ''}><div class="grow">${s.active ? '<b>' + esc(s.name) + '</b>' : esc(s.name)}${s.opt ? ' <span class="muted small">optional</span>' : ''}${s.rule ? ` <span class="muted small">${WX_RULES[s.rule][0].toLowerCase()}</span>` : ''}${s.note ? `<div class="muted small">${esc(s.note)}</div>` : ''}</div></li>`;
  const block = w => { const l = routine(w), need = l.filter(s => !s.opt), left = need.filter(s => !dn[s.id]).length;
    return `<details ${w === when ? 'open' : ''}><summary><b>${w === 'am' ? '☀️ Morning' : '🌙 Evening'}</b> <span class="muted small">${need.length - left}/${need.length}${!left && need.length ? ' ✓' : ''}</span></summary><ul class="list">${l.map(stepLi).join('')}</ul></details>`; };
  const actTonight = b.steps.find(s => s.active && s.when === 'pm' && (!s.days || s.days.includes(dowIdx(t))));
  const wk = actWeek(), rets = b.steps.filter(s => s.active === 'ret'), retN = rets.reduce((a, s) => a + (s.days ? s.days.length : 7), 0);
  const free = [0, 1, 2, 3, 4, 5, 6].filter(i => !b.steps.some(s => s.active && s.days && s.days.includes(i)));
  const actBox = `<div class="note sm">${paused() ? `😣 Actives paused until ${fmtDay(b.pauseUntil)}. Cleanser and moisturiser only. <button class="mini ghost" id="aResume">Resume now</button>`
    : `Tonight: ${actTonight ? `<b>${esc(actTonight.name)}</b>` : 'no active, cleanser and moisturiser only'} · actives week ${wk}${wk <= 12 ? ' of 12' : ''}`}
    ${!paused() ? '<div><button class="mini ghost" id="aPause">😣 Stinging or peeling: skip actives 3 nights</button></div>' : ''}
    ${wk >= 5 && retN < 3 && !b.thirdAsked && !paused() && (!b.thirdLater || t >= b.thirdLater) ? `<div>Week 5+: if your skin is calm, add a third retinal night <span class="muted small">(never on a salicylic night)</span>:<div class="chips">${free.map(i => `<button class="chip sm" data-ret3="${i}">${DOWS[i]}</button>`).join('')}<button class="chip sm" data-ret3="no">Not yet</button></div></div>` : ''}
    ${wk >= 12 ? `<div>📏 12 weeks: time to judge the results. Compare with how your skin was when you started (${fmtDay(b.actStart)}).</div>` : ''}</div>`;
  const prods = P_CATS.map(c => [c, b.products.filter(p => p.cat === c)]).filter(([, l]) => l.length);
  const pLine = p => { const s = prodState(p);
    return `<li data-prod="${p.id}"><div class="grow">${esc(p.name)}${p.spare ? ` <span class="muted small">+${p.spare} spare</span>` : ''}<div class="muted small">${p.opened ? `opened ${fmtDay(p.opened)}` : 'not open'}${s.L ? ` · lasts ~${s.L < 60 ? s.L + ' days' : r1(s.L / 30.4) + ' months'}` : ''}${s.runsOut ? ` · runs out ~${fmtDay(s.runsOut)}` : ''}</div></div>
      ${s.toss ? '<span class="chip sm low">toss?</span>' : s.onList ? '<span class="chip sm">on list</span>' : s.soon ? '<span class="chip sm low">soon</span>' : ''}<span>›</span></li>`; };
  return `<div class="card"><div class="row"><h2 class="grow">Skin routine</h2><button class="mini ghost" id="bSteps">✎</button></div>
    <p class="muted small">🌤 ${wxLine()}</p>${actBox}${block('am')}${block('pm')}
    <div class="row wrap" style="margin-top:10px"><span class="muted small" style="margin-right:6px">Skin today <span class="small">(optional)</span></span><div class="chips">${SKIN.map(([k, l]) => `<button class="chip sm ${b.skin[t] === k ? 'on' : ''}" data-skin="${k}">${l}</button>`).join('')}</div></div>
    ${si ? `<div class="note info sm">${si}</div>` : ''}</div>
  ${bodyCareCard()}
  <div class="card"><div class="row"><h2 class="grow">Roots</h2><button class="mini ghost" id="hEdit">✎</button></div>
    ${rs ? `<p>Coloured ${fmtDay(rs.last)} · ${rs.since} days ago</p>
      <p class="muted small">Next around ${fmtDay(rs.due)} (every ~${r1(rs.g.days / 7)} weeks, ${rs.g.how})${rs.appt ? ` · 📅 booked ${fmtDay(rs.appt)}` : ` · book by ${fmtDay(rs.bookBy)}`}</p>
      ${rs.checkDue ? `<div class="note sm">Roots check: how do they look?<div class="chips">${[['fine', 'Fine'], ['showing', 'Showing'], ['need', 'Need it now']].map(([k, l]) => `<button class="chip sm" data-root="${k}">${l}</button>`).join('')}</div></div>` : rs.lastCheck ? `<p class="muted small">Last check ${fmtDay(rs.lastCheck.d)}: ${{ fine: 'fine', showing: 'showing', need: 'need it now' }[rs.lastCheck.k]}</p>` : ''}`
    : '<p class="muted small">Log your last colour to start. The app starts from 6 weeks and learns your real gap.</p>'}
    ${apptPast() ? `<div class="note sm">📅 Hairdresser was booked for ${fmtDay(b.hair.appt)}. Did it happen?<div class="chips"><button class="chip sm on" data-appt="yes">Yes, coloured that day</button><button class="chip sm" data-appt="moved">Moved it</button><button class="chip sm" data-appt="no">Didn't go</button></div></div>`
      : !rs && b.hair.appt ? `<p class="muted small">📅 Booked ${fmtDay(b.hair.appt)}</p>` : ''}
    <div class="row wrap gap"><button class="mini primary" id="hDone">💇 Coloured today</button><button class="mini" id="hPast">Earlier date</button><button class="mini" id="hBook">${b.hair.appt && b.hair.appt >= t ? 'Change booking' : '📅 Booked'}</button></div></div>
  <div class="card"><div class="row"><h2 class="grow">Products</h2><button class="mini" id="pAdd">+ Product</button></div>
    <p class="muted small">Tap one: opened, finished, running low, bought a spare. It learns how long each lasts and adds it to Shop › Also buy before it runs out.</p>
    ${prods.map(([c, l]) => `<h3>${c}</h3><ul class="list">${l.map(pLine).join('')}</ul>`).join('')}</div>`;
}
function bindBeauty(v) {
  bindChores(v); bindBodyCare(v);
  const b = BEA(), t = today();
  $$('[data-bstep]', v).forEach(c => c.onchange = () => { const dn = b.done[t] ||= {}; if (c.checked) dn[c.dataset.bstep] = 1; else delete dn[c.dataset.bstep]; save(); render(); });
  const ap = $('#aPause', v); if (ap) ap.onclick = () => { b.pauseUntil = addDays(t, 3); save(); render(); toast('Actives off for 3 nights. Be gentle 🤍'); };
  const ar = $('#aResume', v); if (ar) ar.onclick = () => { b.pauseUntil = null; save(); render(); };
  $$('[data-ret3]', v).forEach(x => x.onclick = () => { const k = x.dataset.ret3; b.thirdAsked = 1;
    if (k !== 'no') { const r = b.steps.find(s => s.active === 'ret'); if (r) { r.days = [...(r.days || []), +k].sort(); toast(`Retinal on ${DOWS[+k]} too`); } } else b.thirdAsked = 0, b.thirdLater = addDays(t, 7);
    save(); render(); });
  $$('[data-skin]', v).forEach(x => x.onclick = () => { if (b.skin[t] === x.dataset.skin) delete b.skin[t]; else b.skin[t] = x.dataset.skin; save(); render(); });
  $$('[data-root]', v).forEach(x => x.onclick = () => { b.hair.checks.push({ d: t, k: x.dataset.root }); save(); render(); toast(x.dataset.root === 'need' ? 'Noted. Time to book 📅' : 'Noted ✓'); });
  const colour = d => { if (!b.hair.colours.includes(d)) b.hair.colours.push(d); b.hair.appt = null; save(); render(); toast('Coloured ✓'); };
  $('#hDone', v).onclick = () => colour(t);
  $('#hPast', v).onclick = () => dialog(`<h2>Coloured on</h2><input type="date" name="d" value="${t}">`, f => { if (f.d.value) colour(f.d.value); });
  $$('[data-appt]', v).forEach(x => x.onclick = () => { const k = x.dataset.appt, d = b.hair.appt;
    if (k === 'yes') colour(d); else if (k === 'no') { b.hair.appt = null; save(); render(); } else $('#hBook', v).click(); });
  $('#hBook', v).onclick = () => dialog(`<h2>Hairdresser booked</h2><label>Date</label><input type="date" name="d" value="${(rootsState() || {}).due || t}">`, f => { b.hair.appt = f.d.value || null; });
  $('#hEdit', v).onclick = () => { const body = dialog(`<h2>Roots</h2><label>Starting guess, weeks</label><input name="w" inputmode="decimal" value="${r1(b.hair.start / 7)}"><label>Remind me to book, days ahead</label><input name="lead" inputmode="numeric" value="${b.hair.lead}">
    <h3>Colours</h3><ul class="list">${b.hair.colours.slice().sort().reverse().map(d => `<li><div class="grow">${fmtDay(d)}</div><button class="mini del" data-hdel="${d}">✕</button></li>`).join('') || '<li class="muted small">None yet</li>'}</ul>`, f => {
      b.hair.start = Math.max(14, Math.round(num(f.w.value) * 7) || 42); b.hair.lead = Math.max(0, Math.round(num(f.lead.value))); });
    $$('[data-hdel]', body).forEach(x => x.onclick = e => { e.preventDefault(); b.hair.colours = b.hair.colours.filter(d => d !== x.dataset.hdel); x.closest('li').remove(); save(); }); };
  $('#bSteps', v).onclick = stepsDialog;
  $('#pAdd', v).onclick = () => prodEdit({});
  $$('[data-prod]', v).forEach(x => x.onclick = () => prodDialog(b.products.find(p => p.id === x.dataset.prod)));
}
function stepsDialog() {
  const b = BEA();
  const row = s => `<li data-sid="${s.id}"><div class="grow">${s.when === 'am' ? '☀️' : '🌙'} ${esc(s.name)}<div class="muted small">${s.days ? s.days.map(i => DOWS[i]).join(' ') : 'every day'} · ${WX_RULES[s.rule || ''][0].toLowerCase()}</div></div><span>›</span></li>`;
  const body = dialog(`<h2>Routine steps</h2><ul class="list">${b.steps.map(row).join('')}</ul><button class="mini" id="sAdd">+ Step</button>`, null);
  $$('[data-sid]', body).forEach(x => x.onclick = () => stepEdit(b.steps.find(s => s.id === x.dataset.sid)));
  $('#sAdd', body).onclick = e => { e.preventDefault(); stepEdit({}); };
}
function stepEdit(s) {
  const b = BEA(), isNew = !s.id;
  const body = dialog(`<h2>${isNew ? 'New step' : 'Edit step'}</h2><label>Step</label><input name="name" value="${esc(s.name || '')}" placeholder="e.g. Eye cream">
    <label>When</label><select name="when"><option value="am" ${s.when !== 'pm' ? 'selected' : ''}>Morning</option><option value="pm" ${s.when === 'pm' ? 'selected' : ''}>Evening</option></select>
    <label>Days <span class="muted small">(none ticked = every day)</span></label><div class="chips">${DOWS.map((d, i) => `<label class="chip sm"><input type="checkbox" name="d${i}" ${s.days && s.days.includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}</div>
    <label>Note <span class="muted small">(optional)</span></label><input name="note" value="${esc(s.note || '')}">
    <div class="row"><div class="grow"><label>Active</label><select name="active">${Object.entries(ACTIVES).map(([k, l]) => `<option value="${k}" ${(s.active || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <label class="row tick grow"><input type="checkbox" name="opt" ${s.opt ? 'checked' : ''}> Optional</label></div>
    <label>Weather</label><select name="rule">${Object.entries(WX_RULES).map(([k, [l]]) => `<option value="${k}" ${(s.rule || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    ${isNew ? '' : '<p><button class="mini del" id="sDel">Delete step</button></p>'}`, f => {
    const name = f.name.value.trim(); if (!name) { toast('Name the step'); return false; }
    const days = DOWS.map((_, i) => f['d' + i].checked ? i : -1).filter(i => i >= 0), dd = days.length && days.length < 7 ? days : null, act = f.active.value;
    // never retinal and salicylic acid on the same night
    if (act && f.when.value === 'pm') { const other = b.steps.find(x => x !== s && x.when === 'pm' && x.active && x.active !== act && (!x.days || !dd || x.days.some(i => dd.includes(i))));
      if (other) { toast(`Clashes with ${other.name}. Retinal and salicylic acid never on the same night`); return false; } }
    const o = isNew ? { id: uid() } : s; Object.assign(o, { name, when: f.when.value, days: dd, rule: f.rule.value, active: act, opt: f.opt.checked, note: f.note.value.trim() }); if (isNew) b.steps.push(o);
  });
  const del = $('#sDel', body); if (del) del.onclick = e => { e.preventDefault(); if (!confirmInline(del)) return; b.steps = b.steps.filter(x => x !== s); save(); closeDlg(); render(); };
}
function prodDialog(p) {
  if (!p) return; const s = prodState(p), t = today();
  const ab = aboutFor(p);
  const body = dialog(`<h2>${esc(p.name)}</h2>${ab ? `<p class="small">${esc(ab)}</p>` : ''}<p class="muted small">${p.cat}${p.opened ? ` · opened ${fmtDay(p.opened)}` : ' · not open'}${p.spare ? ` · ${p.spare} spare` : ''}${s.L ? ` · usually lasts ~${s.L} days` : ''}${p.pao ? ` · keep ${p.pao} months once open` : ''}</p>
    ${s.toss ? `<div class="note warn sm">Opened over ${p.pao} months ago. Time to replace it.</div>` : ''}
    <div class="chips">${p.opened ? '<button class="chip on" data-pa="fin">Finished</button>' : '<button class="chip on" data-pa="open">Opened today</button>'}
      <button class="chip" data-pa="low">${s.onList ? 'On the list ✓' : 'Running low'}</button><button class="chip" data-pa="spare">Bought one</button></div>
    ${p.hist.length ? `<h3>History</h3><ul class="list">${p.hist.slice(-5).reverse().map(h => `<li><div class="grow small">${fmtDay(h.opened)} → ${fmtDay(h.finished)}</div><span class="muted small">${h.days} days</span></li>`).join('')}</ul>` : ''}
    <p><button class="mini" id="pEd">✎ Edit</button></p>`, null);
  const act = k => {
    if (k === 'open') p.opened = t;
    if (k === 'fin') { const days = daysBetween(p.opened, t); if (days > 0) p.hist.push({ opened: p.opened, finished: t, days }); if (p.hist.length > 12) p.hist = p.hist.slice(-12);
      if (p.spare) { p.spare--; p.opened = t; toast('Finished ✓ Next one opened'); } else { p.opened = null; toShop(p); toast('Finished ✓ On the shopping list'); } }
    if (k === 'low') { toShop(p); toast('On the shopping list'); }
    if (k === 'spare') { p.spare = (p.spare || 0) + 1; S.extras = (S.extras || []).filter(x => x.key !== 'bp:' + p.id); toast('Spare added'); }
    save(); closeDlg(); render();
  };
  $$('[data-pa]', body).forEach(x => x.onclick = e => { e.preventDefault(); act(x.dataset.pa); });
  $('#pEd', body).onclick = e => { e.preventDefault(); prodEdit(p); };
}
function prodEdit(p) {
  const b = BEA(), isNew = !p.id;
  const body = dialog(`<h2>${isNew ? 'New product' : 'Edit product'}</h2><label>Name</label><input name="name" value="${esc(p.name || '')}" placeholder="e.g. Dry shampoo">
    <label>What it is and why <span class="muted small">(optional)</span></label><textarea name="about" rows="3">${esc(isNew ? '' : aboutFor(p))}</textarea>
    <label>Type</label><select name="cat">${P_CATS.map(c => `<option ${c === (p.cat || 'Skin') ? 'selected' : ''}>${c}</option>`).join('')}</select>
    <label>Opened on <span class="muted small">(empty = not open)</span></label><input type="date" name="op" value="${p.opened || ''}">
    <label>Keep once open, months <span class="muted small">(the little jar symbol, e.g. 12M)</span></label><input name="pao" inputmode="numeric" value="${p.pao || ''}">
    <label>Spares</label><input name="sp" inputmode="numeric" value="${p.spare || 0}">
    ${isNew ? '' : '<p><button class="mini del" id="pDel">Delete product</button></p>'}`, f => {
    const name = f.name.value.trim(); if (!name) { toast('Name the product'); return false; }
    const o = isNew ? { id: uid(), hist: [] } : p; Object.assign(o, { name, about: f.about.value.trim(), cat: f.cat.value, opened: f.op.value || null, pao: Math.round(num(f.pao.value)) || 0, spare: Math.max(0, Math.round(num(f.sp.value))) });
    if (isNew) b.products.push(o);
  });
  const del = $('#pDel', body); if (del) del.onclick = e => { e.preventDefault(); if (!confirmInline(del)) return; b.products = b.products.filter(x => x !== p); save(); closeDlg(); render(); };
}
// a booking that has passed (up to 2 weeks ago) and hasn't been logged as a colour yet
const apptPast = () => { const a = BEA().hair.appt; return !!a && a < today() && daysBetween(a, today()) <= 14 && !BEA().hair.colours.includes(a); };
// Today: one quiet line, only when something is waiting (routine for this part of the day, roots check, booking)
function beautyToday(d) {
  if (d !== today() || !S.beauty || !dayStarted()) return ''; const w = nowWhen(), left = routineLeft(w).length, all = routine(w).length, rs = rootsState(), bits = [];
  if (left) bits.push(`${w === 'am' ? '☀️ Morning' : '🌙 Evening'} routine ${all - left}/${all}`);
  if (rs && rs.checkDue) bits.push('roots check');
  const bc = bodyDue().length; if (bc) bits.push(`${bc} body care`);
  const ap = BEA().hair.appt, ad = ap ? daysBetween(today(), ap) : null;
  if (ad === 0) bits.push('<b>💇 hairdresser today</b>'); else if (ad === 1) bits.push('<b>💇 hairdresser tomorrow</b>'); else if (ad > 1 && ad <= 3) bits.push(`💇 hairdresser ${DOW(ap)}`);
  else if (apptPast()) bits.push('did the hairdresser happen?');
  else if (rs && !rs.appt && !ap && today() >= rs.bookBy) bits.push('<b>book the hairdresser</b>');
  return bits.length ? `<div class="card compact" data-gobeauty><div class="row"><div class="grow">💄 ${bits.join(' · ')}</div><span class="muted">›</span></div></div>` : '';
}
const bindBeautyToday = v => { const x = $('[data-gobeauty]', v); if (x) x.onclick = () => go('beauty'); };
