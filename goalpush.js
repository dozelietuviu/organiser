/* Organiser: goals that push back.
   "😶 Did nothing today" on every open goal. Any logging, tick or to-do on a goal counts as doing something.
   When a deadline is coming up and too many recent days were skipped (or progress is behind the clock),
   the goal goes red with a blunt recommit warning, Today shows it, and the pet takes it personally.
   Recommit = one small step for today (added as a to-do), which calms it down for 2 days.
   Loaded before app.js; only functions here. Data per goal: g.nothing {period:1} (day, Monday of the week, or YYYY-MM), g.cadence, g.acted {day:1}, g.recommit. */
'use strict';

// how often a goal is checked: daily habits by day, weekly habits and weight by week, money / big goals by month
const CADENCES = { day: ['today', 'day', 'days', 7], week: ['this week', 'week', 'weeks', 4], month: ['this month', 'month', 'months', 3] };
const cadence = g => g.cadence || (g.track === 'habit' ? (g.per === 'day' ? 'day' : 'week') : g.track === 'weight' ? 'week' : 'month');
const pkey = (d, c) => c === 'day' ? d : c === 'week' ? monday(d) : d.slice(0, 7);
const pBack = (d, c, n) => c === 'day' ? addDays(d, -n) : c === 'week' ? addDays(d, -7 * n) : (() => { const x = parseDay(d); x.setDate(1); x.setMonth(x.getMonth() - n); return iso(x); })();
const actedIn = (g, key, c) => Object.keys(g.acted || {}).some(d => pkey(d, c) === key) || (g.log || []).some(x => pkey(x.d, c) === key) || (g.todos || []).some(t => t.done && pkey(t.done, c) === key);
const markActed = g => { if (g) { (g.acted ||= {})[today()] = 1; if (g.nothing) delete g.nothing[pkey(today(), cadence(g))]; } };
// skipped periods in the window (7 days / 4 weeks / 3 months): "did nothing" taps, plus past periods with nothing logged
function skippedDays(g, to = today()) {
  const c = cadence(g), N = CADENCES[c][3], from = [g.created, g.resumed].filter(Boolean).sort().pop(), start = from ? pkey(from, c) : ''; // time spent parked doesn't count
  let n = 0;
  for (let i = 0; i < N; i++) { const key = pkey(pBack(to, c, i), c);
    if ((g.nothing || {})[key]) n++;
    else if (i > 0 && key >= start && (g.track === 'habit' || c !== 'day') && g.track !== 'weight' && !actedIn(g, key, c)) n++; }
  return n;
}
// share of the time to the deadline already used, vs share of the goal done
function paceGap(g) {
  if (!g.due || !['manual', 'weight', 'check'].includes(g.track)) return 0;
  const from = g.created || g.startDate || addDays(g.due, -90), total = daysBetween(from, g.due), used = daysBetween(from, today());
  if (total <= 0 || used <= 0) return 0;
  return Math.min(1, used / total) - goalPct(g); // > 0 = behind
}
// 0 = fine, 1 = wobbling, 2 = danger. Deadline windows and skip limits scale with the cadence.
const DANGER = { day: { near: 21, mid: 45, hard: 3, soft: 4 }, week: { near: 56, mid: 90, hard: 2, soft: 3 }, month: { near: 120, mid: 240, hard: 2, soft: 3 } };
function goalDanger(g) {
  if (g.done || g.arch || g.later || !g.due) return 0;
  const c = cadence(g), T = DANGER[c], left = daysBetween(today(), g.due), sk = skippedDays(g), behind = paceGap(g);
  if (g.recommit && daysBetween(g.recommit, today()) < 2 && sk < T.soft + 1) return 0;
  if (left < 0) return sk >= 1 ? 2 : 1;
  if (left <= T.near && (sk >= T.hard || behind > .15)) return 2;
  if (left <= T.mid && (sk >= T.soft || behind > .25)) return 2;
  if (sk >= T.soft || (left <= T.mid && sk >= T.hard - 1 && sk > 0)) return 1;
  return 0;
}
const PUSH_LINES = [
  'Pretending to have a goal is not having a goal.',
  'Future you is watching. She is not impressed.',
  '"Tomorrow" is not a day of the week.',
  'You did not come this far to only come this far.',
  'Either do it or say out loud that you quit. No hiding in between.',
  'The deadline is not moving. Are you?',
  'Discipline is choosing what you want most over what you want now.',
];
function goalWarn(g) {
  const lv = goalDanger(g); if (!lv) return '';
  const left = daysBetween(today(), g.due), sk = skippedDays(g), line = PUSH_LINES[(today().slice(-2) * 1 + g.title.length) % PUSH_LINES.length];
  const when = left < 0 ? `${-left} days PAST the deadline` : left === 0 ? 'Deadline is TODAY' : `${left} days left`;
  return `<div class="note ${lv === 2 ? 'warn' : ''} sm gpush">${lv === 2 ? '🚨 <b>Recommit or let it go.</b>' : '⚠ <b>Slipping.</b>'} ${when}${sk ? `, nothing done in ${sk} of the last ${CADENCES[cadence(g)][3]} ${CADENCES[cadence(g)][2]}` : ''}${paceGap(g) > .15 ? `, and you're ${Math.round(paceGap(g) * 100)}% behind the clock` : ''}. ${line}
    <div class="row wrap gap"><button class="mini primary" data-grecommit="${g.id}">🔥 Recommit</button><button class="mini" data-gedit="${g.id}">Move the deadline</button></div></div>`;
}
const nothingBtn = g => { if (g.done || g.arch || g.later) return ''; const c = cadence(g), on = (g.nothing || {})[pkey(today(), c)];
  return `<button class="mini ${on ? 'on' : ''}" data-gnothing="${g.id}" title="Honest log">😶 Did nothing ${CADENCES[c][0]}</button>`; };
function bindGoalPush(v) {
  $$('[data-gnothing]', v).forEach(x => x.onclick = () => { const g = gById(x.dataset.gnothing), t = pkey(today(), cadence(g)); g.nothing ||= {};
    if (g.nothing[t]) delete g.nothing[t]; else { g.nothing[t] = 1; if (g.acted) delete g.acted[today()]; }
    save(); render(); if (g.nothing[t]) toast(goalDanger(g) === 2 ? 'Noted. And that\'s a problem 🚨' : 'Noted. Honest is good. Next one counts.'); });
  $$('[data-grecommit]', v).forEach(x => x.onclick = () => { const g = gById(x.dataset.grecommit);
    dialog(`<h2>🔥 Recommit: ${esc(g.title)}</h2><p class="small">One small thing you will do <b>today</b>. Small enough that you can't say no.</p><input name="step" placeholder="e.g. 20 minutes of theory questions" enterkeyhint="done">`, f => {
      const s = f.step.value.trim(); if (!s) { toast('Name the small step'); return false; }
      (g.todos ||= []).push({ t: s }); g.recommit = today(); markActed(g); toast('Recommitted. Now go do it 💪'); }, 'Recommit'); });
}
// Today: the worst goal, so it can't be ignored
function goalsTodayWarn() {
  const bad = (G().list || []).filter(g => goalDanger(g) === 2).sort((a, b) => (a.due || '').localeCompare(b.due || ''));
  if (!bad.length) return null;
  const g = bad[0], left = daysBetween(today(), g.due);
  return `🚨 <b>${esc(g.title)}</b>: ${left < 0 ? 'past the deadline' : left + ' days left'} and you're skipping it. Goals tab → Recommit or move the deadline.${bad.length > 1 ? ` (+${bad.length - 1} more goal${bad.length > 2 ? 's' : ''} in trouble)` : ''}`;
}
const goalsInTrouble = () => (G().list || []).filter(g => goalDanger(g) === 2).length;
