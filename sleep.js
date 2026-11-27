/* Organiser: sleep. "Good night" (evening) + "I'm up" (morning, already in the app) = hours slept.
   Each night is matched with the day after it, to find out whether short or late nights go with skipped
   training, unplanned food, skipped meals or missed protein. Links are shown only when your own data
   shows them clearly; a warning appears on Today only the morning after a short night, and only then.
   Data: S.body.bed = { evening date: 'HH:MM' } (a tap after midnight belongs to the evening before).
   Loaded before app.js; only functions here. */
'use strict';

const SLEEP_MIN_NIGHTS = 14, SLEEP_MIN_GROUP = 4;
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fmtH = h => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const fmtClock = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
// bed time as minutes after noon, so 23:30 and 00:30 sort the right way round
const bedLate = t => { const m = toMin(t); return m < 720 ? m + 1440 : m; };
// the evening a "Good night" tap belongs to: before 05:00 it's still last night
const nightOf = (now = new Date()) => now.getHours() < 5 ? addDays(iso(now), -1) : iso(now);
function sleepHours(night) {
  const bed = (B().bed || {})[night], wake = (B().wake || {})[addDays(night, 1)]; if (!bed || !wake) return null;
  const b = toMin(bed), w = toMin(wake), h = (b >= 720 ? 1440 - b + w : w - b) / 60; // in bed before or after midnight
  return h >= 2 && h <= 14 ? h : null;
}
// one row per night that has both taps, with what happened the next day
function sleepNights(to = today(), days = 120) {
  const out = [];
  for (let i = 1; i <= days; i++) {
    const night = addDays(to, -i), day = addDays(night, 1), h = sleepHours(night); if (h == null) continue;
    const plans = dayPlans(day), done = T().logs.filter(l => l.date === day).length;
    const un = mealsOn(day).filter(e => e.slot === UNPL), logged = loggedDay(day);
    const sk = Object.values(((S.day[day] || {}).skip) || {}).filter(r => r !== 'asleep').length;
    out.push({ night, day, h, bed: B().bed[night], train: plans.length ? (done ? 1 : 0) : null,
      unN: un.length, unK: sumM(un).kcal, skipped: sk, protein: logged ? (sumM(mealsOn(day)).p >= S.settings.p * .9 ? 1 : 0) : null });
  }
  return out;
}
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
// compare short (or late) nights with the rest. A link needs 4+ nights on each side and a clear difference.
function sleepLinks(nights = sleepNights()) {
  if (nights.length < SLEEP_MIN_NIGHTS) return { ready: false, n: nights.length, links: [] };
  const medH = median(nights.map(x => x.h)), shortAt = Math.min(7, Math.max(5.5, medH - 1));
  const medBed = median(nights.map(x => bedLate(x.bed))), lateAt = medBed + 60;
  const groups = [['short', `nights under ${fmtH(shortAt)}`, x => x.h < shortAt], ['late', `nights in bed after ${fmtClock(lateAt)}`, x => bedLate(x.bed) > lateAt]];
  const links = [], shortSet = new Set(nights.filter(groups[0][2]).map(x => x.night));
  for (const [kind, label, isIt] of groups) {
    const a = nights.filter(isIt), b = nights.filter(x => !isIt(x)); if (a.length < SLEEP_MIN_GROUP || b.length < SLEEP_MIN_GROUP) continue;
    // late nights that are mostly the same nights as the short ones would just repeat the same links
    if (kind === 'late' && a.filter(x => shortSet.has(x.night)).length >= a.length * .75) continue;
    const rate = (l, k) => { const v = l.filter(x => x[k] != null); return v.length ? { r: avg(v.map(x => x[k])), n: v.length, hit: v.filter(x => x[k]).length } : null; };
    // training: skipped when a session was planned
    const ta = rate(a, 'train'), tb = rate(b, 'train');
    if (ta && tb && ta.n >= 3 && (1 - ta.r) - (1 - tb.r) >= .25 && 1 - ta.r >= .5)
      links.push({ kind, what: 'train', text: `After ${label} you skipped training ${ta.n - ta.hit} of ${ta.n} times, versus ${tb.n - tb.hit} of ${tb.n} otherwise.`, tip: 'Plan a lighter session, or move it to the afternoon.' });
    const ua = avg(a.map(x => x.unK)), ub = avg(b.map(x => x.unK)), ca = avg(a.map(x => x.unN)), cb = avg(b.map(x => x.unN));
    if (ua - ub >= 150 || (ca - cb >= .5 && ua > ub))
      links.push({ kind, what: 'unpl', text: `After ${label} you eat about ${r0(ua)} kcal unplanned, versus ${r0(ub)} otherwise.`, tip: 'Have breakfast on time and a protein snack ready; tired hunger is real hunger.' });
    const sa = avg(a.map(x => x.skipped)), sb = avg(b.map(x => x.skipped));
    if (sa - sb >= .5) links.push({ kind, what: 'skip', text: `After ${label} you skip ${r1(sa)} meals a day, versus ${r1(sb)} otherwise.`, tip: 'Keep a shake within reach so a skipped meal doesn\'t turn into a big one later.' });
    const pa = rate(a, 'protein'), pb = rate(b, 'protein');
    if (pa && pb && pa.n >= 3 && pb.r - pa.r >= .25) links.push({ kind, what: 'prot', text: `After ${label} you hit protein ${pa.hit} of ${pa.n} days, versus ${pb.hit} of ${pb.n} otherwise.`, tip: 'Start the day with eggs, skyr or a shake.' });
  }
  return { ready: true, n: nights.length, medH, shortAt, medBed, lateAt, links };
}

// ---- Today: the sleep card (Good night in the evening, I'm up in the morning) ----
function sleepCard(d) {
  const h = new Date().getHours();
  if (d !== today() || (h >= 5 && h < 20)) return wakeCard(d) + (d === today() ? lastNightLine(d) : '');
  const night = nightOf(), bed = (B().bed || {})[night];
  return `<div class="card compact"><div class="row"><div class="grow"><div class="muted small">Sleep</div><div>🌙 ${bed ? `Good night ${bed} · sleep well` : 'Going to bed?'}</div></div>
    ${bed ? '<button class="mini ghost" id="bedSet">Edit</button>' : '<button class="primary mini" id="bedNow">Good night</button><button class="mini ghost" id="bedSet">Set time</button>'}</div></div>`;
}
// after "I'm up": how long you slept, small, under the wake card
function lastNightLine(d) {
  const night = addDays(d, -1), hrs = sleepHours(night); if (hrs == null) return '';
  return `<p class="muted small" style="margin:-6px 4px 12px">😴 ${fmtH(hrs)} sleep · in bed ${B().bed[night]}</p>`;
}
function bindSleep(v) {
  const bd = () => (B().bed ||= {});
  const n = $('#bedNow', v); if (n) n.onclick = () => { bd()[nightOf()] = new Date().toTimeString().slice(0, 5); save(); render(); toast('Good night 🌙'); };
  const e = $('#bedSet', v); if (e) e.onclick = () => { const night = nightOf();
    const body = dialog(`<h2>Went to bed</h2><p class="muted small">Night of ${fmtDay(night)}</p><label>Time</label><input type="time" name="t" value="${bd()[night] || '23:00'}">${bd()[night] ? '<p><button class="mini del" id="bedDel">Remove</button></p>' : ''}`, f => { if (f.t.value) bd()[night] = f.t.value; });
    const del = $('#bedDel', body); if (del) del.onclick = ev => { ev.preventDefault(); delete bd()[night]; save(); closeDlg(); render(); }; };
}
// Today warning: the morning after a short or late night, only if your data shows a link
function sleepWarning(d) {
  if (d !== today()) return null; const night = addDays(d, -1), hrs = sleepHours(night); if (hrs == null) return null;
  const L = sleepLinks(); if (!L.ready || !L.links.length) return null;
  const short = hrs < L.shortAt, late = bedLate(B().bed[night]) > L.lateAt;
  const hits = L.links.filter(l => (l.kind === 'short' && short) || (l.kind === 'late' && late)); if (!hits.length) return null;
  const train = dayPlans(d).length, pick = hits.find(l => l.what === 'train' && train) || hits.find(l => l.what !== 'train');
  if (!pick) return null;
  const lead = short ? `${fmtH(hrs)} sleep last night.` : `Late night (bed ${B().bed[night]}).`;
  const usually = { train: 'you usually skip training', unpl: 'you usually snack more', skip: 'you often skip meals', prot: 'protein usually comes up short' }[pick.what];
  return `😴 ${lead} After nights like this ${usually}. ${pick.tip}`;
}
// weekly report section
function sleepReport(days) {
  const ns = days.map(d => addDays(d, -1)).map(n => ({ n, h: sleepHours(n) })).filter(x => x.h != null);
  const L = sleepLinks();
  if (!ns.length) return `<h3>Sleep</h3><p class="muted small">Tap 🌙 Good night in the evening and I'm up in the morning to start seeing your sleep.</p>`;
  const bedM = median(ns.map(x => bedLate(B().bed[x.n])));
  return `<h3>Sleep</h3><ul class="list rep"><li><span class="grow">Average sleep</span><b>${fmtH(avg(ns.map(x => x.h)))}</b></li><li><span class="grow">Usual bed time</span><b>${fmtClock(bedM)}</b></li><li><span class="grow">Nights tracked</span><b>${ns.length}/7</b></li></ul>
    ${L.ready ? (L.links.length ? L.links.map(l => `<div class="note info sm">${l.text}</div>`).join('') : '<p class="muted small">No link between sleep and your days so far. 👍</p>') : `<p class="muted small">Collecting: ${L.n}/${SLEEP_MIN_NIGHTS} nights before links can show.</p>`}`;
}
// Body tab: the full picture
function sleepBodyCard() {
  const ns = sleepNights(today(), 14), L = sleepLinks();
  return `<div class="card"><h2>Sleep</h2>
    ${ns.length ? `<ul class="list rep">${ns.slice(0, 7).map(x => `<li><span class="grow small">${fmtDay(x.night)}</span><span class="muted small">bed ${x.bed}</span><b style="margin-left:8px">${fmtH(x.h)}</b></li>`).join('')}</ul>` : '<p class="muted small">No nights yet. Use 🌙 Good night (evening) and I\'m up (morning) on Today.</p>'}
    ${L.ready ? `<p class="small">Your normal: ${fmtH(L.medH)}, in bed around ${fmtClock(L.medBed)}. Short = under ${fmtH(L.shortAt)}.</p>
      ${L.links.length ? L.links.map(l => `<div class="note info sm">${l.text} <span class="muted">${l.tip}</span></div>`).join('') : '<p class="muted small">No clear link with training, snacking, skipped meals or protein yet.</p>'}`
      : `<p class="muted small">Links show after ${SLEEP_MIN_NIGHTS} tracked nights (${L.n} so far), and only when the difference is clear. They're patterns, not proof: a stressful week can cause both.</p>`}</div>`;
}
