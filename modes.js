/* Organiser: nutrition modes (Settings › Mode). One tap fills kcal and macros for a goal:
   kcal from your maintenance (estimated from your own log + weight trend once there's enough data),
   protein and fat per kg of body weight, carbs take the rest, fibre scales with kcal.
   Loaded before app.js; only functions here. */
'use strict';

// [key, label, kcal × maintenance, protein g/kg, fat g/kg, one-line what it's for]
const MODES = [
  ['cut', 'Cut', .80, 2.2, .8, 'About 0.5 kg a week down. High protein keeps the muscle.'],
  ['mini', 'Gentle cut', .90, 2.0, .9, 'Slower, easier to live with. Good for long stretches.'],
  ['recomp', 'Recomp', .95, 2.2, .9, 'Weight stays about the same; fat down, muscle up with training.'],
  ['maint', 'Maintain', 1, 1.8, 1, 'Hold your weight. Good between phases.'],
  ['bulk', 'Lean bulk', 1.10, 1.8, 1, 'Small surplus to build muscle with little fat.'],
];
const KCAL_FLOOR = 1400; // below this a plan is too low to recommend without a professional
// maintenance from your own data: average logged kcal + what the weight trend says (7700 kcal ≈ 1 kg).
// Needs 14+ fully logged days in the last 4 weeks and weigh-ins at both ends; otherwise null.
function estMaintenance() {
  const days = Array.from({ length: 28 }, (_, i) => addDays(today(), -i - 1)).filter(d => loggedDay(d));
  if (days.length < 14) return null;
  const w1 = avgW(days[days.length - 1]), w2 = avgW(days[0]); if (!w1 || !w2) return null;
  const span = Math.max(7, daysBetween(days[days.length - 1], days[0]));
  const eat = days.reduce((a, d) => a + sumM(mealsOn(d)).kcal, 0) / days.length;
  return Math.round((eat - (w2 - w1) * 7700 / span) / 10) * 10;
}
const curWeight = () => avgW(today(), 14) || (Object.entries(B().weights || {}).sort().pop() || [])[1] || null;
function modeTargets(key, maint, kg) {
  const [, , k, pk, fk] = MODES.find(m => m[0] === key), kcal = Math.max(KCAL_FLOOR, Math.round(maint * k / 50) * 50);
  const p = Math.round(pk * kg), f = Math.round(Math.max(fk * kg, kcal * .25 / 9)), c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
  return { kcal, p, c, f, fib: Math.max(25, Math.round(kcal / 1000 * 14)) };
}
// the block that sits at the top of Settings
function modesBlock(s) {
  const est = estMaintenance(), kg = curWeight();
  return `<h3>Mode</h3><div class="chips" id="modeChips">${MODES.map(([k, l]) => `<button class="chip ${s.mode === k ? 'on' : ''}" data-mode="${k}">${l}</button>`).join('')}</div>
    <p class="muted small" id="modeWhy">${s.mode && MODES.find(m => m[0] === s.mode) ? MODES.find(m => m[0] === s.mode)[5] : s.mode === 'custom' ? 'Custom numbers.' : 'Tap a mode to fill the targets below. Save to keep them.'}</p>
    <div class="row"><div class="grow"><label>Maintenance kcal</label><input name="maint" inputmode="numeric" value="${s.maint || est || s.kcal}"></div>
      <div class="grow"><label>Weight, kg</label><input name="modeKg" inputmode="decimal" value="${kg ? r1(kg) : ''}" placeholder="from Body"></div></div>
    <p class="muted small">${est ? `From your log and weight trend, your maintenance is about <b>${est} kcal</b>.${s.maint && Math.abs(s.maint - est) > 100 ? ` <button class="mini ghost" id="useEst">Use ${est}</button>` : ''}` : 'Your maintenance gets estimated once you have 14 logged days and weigh-ins. Until then, use your trainer\'s number or a calculator.'}</p>`;
}
function bindModes(body, s) {
  const fill = t => { for (const k of ['kcal', 'p', 'c', 'f', 'fib']) body[k].value = t[k]; };
  $$('[data-mode]', body).forEach(b => b.onclick = e => { e.preventDefault();
    const maint = num(body.maint.value), kg = num(body.modeKg.value); if (!maint || !kg) { toast('Add maintenance kcal and weight first'); return; }
    const m = MODES.find(x => x[0] === b.dataset.mode), t = modeTargets(m[0], maint, kg); fill(t); body.dataset.mode = m[0];
    $$('[data-mode]', body).forEach(x => x.classList.toggle('on', x === b));
    $('#modeWhy', body).innerHTML = `${m[5]}${t.kcal === KCAL_FLOOR && maint * m[2] < KCAL_FLOOR ? ` <b>Held at ${KCAL_FLOOR} kcal:</b> going lower needs a professional.` : ''} Tap Save to keep it.`; });
  const ue = $('#useEst', body); if (ue) ue.onclick = e => { e.preventDefault(); body.maint.value = estMaintenance(); };
  // typing your own numbers makes it Custom
  for (const k of ['kcal', 'p', 'c', 'f']) body[k].addEventListener('input', () => { body.dataset.mode = 'custom'; $$('[data-mode]', body).forEach(x => x.classList.remove('on')); });
}
const saveModes = (body, s) => { s.maint = num(body.maint.value) || s.maint; if (body.dataset.mode) s.mode = body.dataset.mode; };
