/* Organiser: energy availability (EA) and the sleeve protein floor.
   EA = (food eaten - exercise kcal) / fat-free mass, per day. Sports science: about 45 is healthy,
   under ~30 for weeks (or a few very low days) can disturb hormones, periods, bone and recovery.
   The 30 line is a guide, not an exact cut-off, and it comes from lean athletes: someone deliberately
   losing weight with fat to spare sits under it on most cut days. So the Today warning is for a pattern
   of VERY low days (under 20, 3+ in a week); the weekly report shows the under-30 count as information.
   Exercise kcal = watch active kcal above normal daily movement (walking) + gym sessions (estimated,
   the watch doesn't count them) or logged cardio. Fat-free mass = weight × (1 - body fat %); body fat
   defaults to 35% until you enter yours (Settings). Only fully logged days count.
   Loaded before app.js; only functions here. */
'use strict';

const EA_LOW = 30, EA_VERY_LOW = 20, WALK_BASE = 150, GYM_MET = 3.5, PROT_FLOOR = 60;
const ffm = () => { const kg = curWeight(); if (!kg) return null; const bf = num(S.settings.bodyFat) || 35; return kg * (1 - bf / 100); };
// exercise kcal for a day: walking above everyday movement + cardio logged + gym sessions (3.5 MET × kg × ~1 h)
function exerciseKcal(d) {
  const t = S.train || {}, w = ((t.watch || {})[d] || {}).kcal || 0, logs = (t.logs || []).filter(l => l.date === d);
  const cardio = logs.flatMap(l => l.items).filter(i => i.cardio).reduce((a, i) => a + num(i.kcal), 0);
  const gym = logs.filter(l => l.items.some(i => !i.cardio) || !l.items.length).length * GYM_MET * (curWeight() || 70);
  return Math.max(0, w - WALK_BASE) + cardio + gym;
}
const eaOn = d => { const m = ffm(); if (!m) return null; return (sumM(mealsOn(d)).kcal - exerciseKcal(d)) / m; };
// last 7 fully logged days (not today)
function eaWeek(to = today()) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(to, -i - 1)).filter(loggedDay);
  const rows = days.map(d => ({ d, ea: eaOn(d), p: sumM(mealsOn(d)).p })).filter(x => x.ea != null);
  return { rows, low: rows.filter(x => x.ea < EA_LOW).length, veryLow: rows.filter(x => x.ea < EA_VERY_LOW).length,
    avg: rows.length ? avg(rows.map(x => x.ea)) : null, protLow: rows.filter(x => x.p < PROT_FLOOR).length };
}
// notes for Today and Log (as [kind, text, place])
function energyNotes(d) {
  if (d !== today() || !ffm()) return [];
  const out = [], h = new Date().getHours(), ex = exerciseKcal(d), tot = sumM(mealsOn(d)), m = ffm(), w = eaWeek(d), cut = ['cut', 'mini'].includes(S.settings.mode);
  // big burn today, little eaten so far (evening)
  if (h >= 17 && ex >= 300 && (tot.kcal - ex) / m < EA_VERY_LOW + 5)
    out.push(['warn', `🔥 Big burn today (about ${r0(ex)} kcal) and not much eaten yet. Add a shake or a small protein snack; small and dense works with the sleeve.`, 'log']);
  // sleeve protein floor (evening)
  if (h >= 19 && tot.p < PROT_FLOOR) out.push(['warn', `Protein ${r0(tot.p)} g so far. The sleeve minimum is ${PROT_FLOOR} g a day: a shake closes most of the gap.`, 'log']);
  // pattern: 3+ low days in the last 7
  if (w.veryLow >= 3) out.push(['warn', `⚡ Running very low on energy: ${w.veryLow} of the last ${w.rows.length} logged days were under ${EA_VERY_LOW} kcal per kg lean mass after exercise. Over weeks that can upset hormones, your period and recovery.${cut ? ' Try Gentle cut on training days, or eat back part of the gym burn.' : ' Eat back part of the exercise burn on training days.'}`, 'today']);
  else if (w.protLow >= 3) out.push(['warn', `Protein under ${PROT_FLOOR} g on ${w.protLow} of the last ${w.rows.length} days. Protein first at every meal, and a shake on busy days.`, 'today']);
  // cycle running late during a cut or very-low-energy stretch
  const ci = S.body && cycleInfo(d), lowMonth = Array.from({ length: 28 }, (_, i) => addDays(d, -i - 1)).filter(x => loggedDay(x) && (eaOn(x) ?? 99) < EA_VERY_LOW).length;
  if (ci && !ci.onPeriod && ci.toNext <= -5 && (cut || lowMonth >= 6))
    out.push(['warn', `🩸 Your period is ${-ci.toNext} days later than usual while you're cutting. A lengthening cycle can be an early sign of too little energy. Worth mentioning to your doctor or bariatric team.`, 'today']);
  return out;
}
// weekly report section
function energyReport(days) {
  if (!ffm()) return '<h3>Energy</h3><p class="muted small">Add a weigh-in in Body to see energy availability.</p>';
  const rows = days.filter(loggedDay).map(d => ({ d, ea: eaOn(d), p: sumM(mealsOn(d)).p, ex: exerciseKcal(d) }));
  if (!rows.length) return '';
  const low = rows.filter(x => x.ea < EA_LOW).length, pl = rows.filter(x => x.p < PROT_FLOOR).length;
  return `<h3>Energy</h3><ul class="list rep"><li><span class="grow">Energy available, average</span><b>${r0(avg(rows.map(x => x.ea)))}</b><span class="muted small">&nbsp;kcal/kg lean</span></li>
    <li><span class="grow">Under ${EA_LOW} / very low under ${EA_VERY_LOW}</span><b>${low} / ${rows.filter(x => x.ea < EA_VERY_LOW).length}</b><span class="muted small">&nbsp;of ${rows.length}</span></li><li><span class="grow">Exercise, average</span><b>${r0(avg(rows.map(x => x.ex)))} kcal</b></li>
    <li><span class="grow">Days under ${PROT_FLOOR} g protein</span><b>${pl}/${rows.length}</b></li></ul>
    <p class="muted small">About 45 is comfortable for lean athletes. On a cut, under 30 is expected some days; it's the very low days (under 20) piling up that matter. Based on ${num(S.settings.bodyFat) ? `your ${S.settings.bodyFat}% body fat` : 'an estimated 35% body fat (set yours in Settings)'}.</p>`;
}
