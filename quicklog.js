/* Organiser: quick logging.
   1) Unplanned food in one tap: your recent ones + common grab-and-go foods with a typical estimate.
      No numbers needed. Size (small / normal / big) and why can be set later on the entry in Log.
   2) Batch safety: a "plate" card that is really a whole recipe (pie, soup pot) gets caught before
      the whole thing is logged, and can be turned into a batch card (servings) in one step.
   Loaded before app.js; only functions here. */
'use strict';

// ---------- 1) unplanned in one tap ----------
const QUICK_COMMON = ['croissant', 'pastry', 'donut', 'muffin', 'cake', 'cookie', 'chocolate bar', 'sweets', 'ice cream', 'crisps',
  'sandwich', 'burger', 'pizza', 'kebab', 'hot dog', 'latte', 'caramel latte', 'hot choc', 'smoothie', 'cola', 'wine', 'beer'];
// typed something the app doesn't know: pick how big it was [label, kcal, P, C, F, fibre]
const QUICK_KINDS = [['Small snack', 150, 4, 20, 6, 1], ['Snack', 300, 6, 35, 15, 2], ['Meal-sized', 650, 25, 70, 28, 4], ['Drink', 200, 5, 30, 6, 0]];
const QUICK_SIZES = [['s', 'S', .7], ['m', 'M', 1], ['l', 'L', 1.4]];
function quickTiles() {
  const seen = new Set(), mine = [];
  for (let i = 0; i < 45 && mine.length < 6; i++) for (const e of (S.log[addDays(today(), -i)] || []).slice().reverse()) {
    if (e.slot !== UNPL || !e.name) continue; const k = e.name.toLowerCase(); if (seen.has(k)) continue; seen.add(k);
    const b = e.base || e; mine.push({ name: e.name, kcal: b.kcal, p: b.p, c: b.c, f: b.f, fib: b.fib || 0, mine: true }); if (mine.length >= 6) break;
  }
  const common = QUICK_COMMON.map(findEstimate).filter(Boolean).filter((m, i, a) => a.indexOf(m) === i)
    .map(([, name, kcal, p, c, f, fib]) => ({ name, kcal, p, c, f, fib })).filter(t => !seen.has(t.name.toLowerCase()));
  return { mine, common };
}
function quickLog(t, extra = {}) {
  const base = { kcal: t.kcal, p: t.p, c: t.c, f: t.f, fib: t.fib || 0 };
  addLog(Object.assign({ slot: UNPL, g: 0, why: '', name: t.name, est: true, base, size: 'm' }, base, extra));
  save(); closeDlg(); render(); toast(`Logged ≈ ${r0(t.kcal)} kcal ✓ Size or why: in Food › Log`);
}
function quickUnpl() {
  const { mine, common } = quickTiles();
  const tile = (t, i, set) => `<button class="qtile" data-qt="${set}|${i}"><span>${esc(t.name)}</span><span class="muted small">≈ ${r0(t.kcal)}</span></button>`;
  const body = dialog(`<h2>🍩 Ate something</h2><p class="muted small">Tap it. That's it. A typical amount is logged; change size or add why later in Log.</p>
    ${mine.length ? `<h3>Yours lately</h3><div class="qgrid">${mine.map((t, i) => tile(t, i, 'm')).join('')}</div>` : ''}
    <h3>Grab and go</h3><div class="qgrid">${common.map((t, i) => tile(t, i, 'c')).join('')}</div>
    <h3>Something else</h3><input name="qn" placeholder="What was it? (optional)" autocomplete="off" enterkeyhint="done">
    <div class="note sm" id="qEst" hidden></div>
    <div class="chips" id="qKinds">${QUICK_KINDS.map((k, i) => `<button class="chip" data-qk="${i}">${k[0]} · ≈${k[1]}</button>`).join('')}</div>
    <p><button class="mini ghost" id="qExact">I know the numbers</button></p>`, null);
  const pick = (set, i) => quickLog((set === 'm' ? mine : common)[i]);
  $$('[data-qt]', body).forEach(b => b.onclick = e => { e.preventDefault(); const [set, i] = b.dataset.qt.split('|'); pick(set, +i); });
  noEnterSubmit(body.qn);
  // typed a name the estimates know: offer it as one tap
  body.qn.oninput = () => { const m = findEstimate(body.qn.value), box = $('#qEst', body);
    box.hidden = !m; if (m) box.innerHTML = `<button class="chip on" id="qMatch">${esc(m[1])} · ≈${m[2]} kcal</button>`;
    const qm = $('#qMatch', body); if (qm) qm.onclick = e => { e.preventDefault(); const [, , kcal, p, c, f, fib] = m; quickLog({ name: body.qn.value.trim() || m[1], kcal, p, c, f, fib }); }; };
  $$('[data-qk]', body).forEach(b => b.onclick = e => { e.preventDefault(); const [l, kcal, p, c, f, fib] = QUICK_KINDS[+b.dataset.qk]; quickLog({ name: body.qn.value.trim() || l, kcal, p, c, f, fib }); });
  $('#qExact', body).onclick = e => { e.preventDefault(); unplDialog(); };
}
// size chips on a logged unplanned entry (S / M / L of the typical amount)
const sizeChips = e => e.base ? `<span class="qsize">${QUICK_SIZES.map(([k, l]) => `<button class="chip sm ${(e.size || 'm') === k ? 'on' : ''}" data-usz="${e.id}|${k}">${l}</button>`).join('')}</span>` : '';
function bindSizeChips(v) {
  $$('[data-usz]', v).forEach(b => b.onclick = () => { const [id, k] = b.dataset.usz.split('|'), e = (S.log[UI.day] || []).find(x => x.id === id); if (!e || !e.base) return;
    const m = QUICK_SIZES.find(z => z[0] === k)[2]; e.size = k; for (const x of ['kcal', 'p', 'c', 'f', 'fib']) e[x] = r1((e.base[x] || 0) * m); save(); render(); });
}

// ---------- 2) whole recipe saved as a plate ----------
// a meal is 380-480 kcal and under 400 g, so a "plate" over 900 kcal or 700 g is almost surely the whole pot
const looksWhole = c => !!c && !isBatch(c) && !c.wholeOk && !JONAS_ONLY.includes(c.slot) && (cardTotals(c).kcal > 900 || cardGrams(c) > 700);
function wholeAsk(c, then) {
  const t = cardTotals(c);
  const body = dialog(`<h2>🍲 ${esc(c.name)}</h2>
    <div class="note warn sm">This card adds up to ${r0(t.kcal)} kcal and ${r0(cardGrams(c))} g. That looks like the whole recipe, not one plate.</div>
    <label>How many servings does the recipe make?</label><input name="sv" inputmode="numeric" placeholder="e.g. 6">
    <label>Cooked weight of the whole dish, g (optional)</label><input name="ck" inputmode="decimal" placeholder="weigh the pot or dish once">
    <p class="muted small">From then on you log servings (or the weight on your plate), and leftovers count as stock.</p>
    <p><button class="mini ghost" id="wNo">No, it really is one plate</button></p>`, f => {
    const sv = Math.round(num(f.sv.value)); if (!(sv > 1)) { toast('Add the number of servings'); return false; }
    c.batch = { serv: sv, cookedG: num(f.ck.value) || 0, left: 0 };
    toast(`${c.name}: ${sv} servings ✓`); if (then) setTimeout(then, 50);
  }, 'Make it a batch');
  noEnterSubmit(body.sv); noEnterSubmit(body.ck);
  $('#wNo', body).onclick = e => { e.preventDefault(); c.wholeOk = true; save(); closeDlg(); if (then) then(); };
}
