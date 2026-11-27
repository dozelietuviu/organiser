/* Organiser: goals that push back.
   "😶 Did nothing today" on every open goal. Any logging, tick or to-do on a goal counts as doing something.
   When a deadline is coming up and too many recent days were skipped (or progress is behind the clock),
   the goal goes red with a blunt recommit warning, Today shows it, and the pet takes it personally.
   Recommit = one small step for today (added as a to-do), which calms it down for 2 days.
   Loaded before app.js; only functions here. Data per goal: g.nothing {day:1}, g.acted {day:1}, g.recommit. */
'use strict';

const actedOn = (g, d) => !!((g.acted || {})[d] || (g.log || []).some(x => x.d === d) || (g.todos || []).some(t => t.done === d));
const markActed = g => { if (g) { (g.acted ||= {})[today()] = 1; if (g.nothing) delete g.nothing[today()]; } };
// skipped days in the last 7 (today included only if you tapped it): explicit "did nothing", plus for daily habit goals any day with nothing logged
function skippedDays(g, to = today()) {
  let n = 0;
  for (let i = 0; i < 7; i++) { const d = addDays(to, -i);
    if ((g.nothing || {})[d]) n++;
    else if (i > 0 && g.track === 'habit' && g.per === 'day' && !actedOn(g, d) && (!g.created || d >= g.created)) n++; }
  return n;
}
// share of the time to the deadline already used, vs share of the goal done
function paceGap(g) {
  if (!g.due || !['manual', 'weight', 'check'].includes(g.track)) return 0;
  const from = g.created || g.startDate || addDays(g.due, -90), total = daysBetween(from, g.due), used = daysBetween(from, today());
  if (total <= 0 || used <= 0) return 0;
  return Math.min(1, used / total) - goalPct(g); // > 0 = behind
}
// 0 = fine, 1 = wobbling, 2 = danger
function goalDanger(g) {
  if (g.done || g.arch || !g.due) return 0;
  const left = daysBetween(today(), g.due), sk = skippedDays(g), behind = paceGap(g);
  if (g.recommit && daysBetween(g.recommit, today()) < 2 && sk < 5) return 0;
  if (left < 0) return sk >= 2 ? 2 : 1;
  if (left <= 21 && (sk >= 3 || behind > .15)) return 2;
  if (left <= 45 && (sk >= 4 || behind > .25)) return 2;
  if (sk >= 4 || (left <= 45 && sk >= 2)) return 1;
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
  return `<div class="note ${lv === 2 ? 'warn' : ''} sm gpush">${lv === 2 ? '🚨 <b>Recommit or let it go.</b>' : '⚠ <b>Slipping.</b>'} ${when}${sk ? `, nothing done on ${sk} of the last 7 days` : ''}${paceGap(g) > .15 ? `, and you're ${Math.round(paceGap(g) * 100)}% behind the clock` : ''}. ${line}
    <div class="row wrap gap"><button class="mini primary" data-grecommit="${g.id}">🔥 Recommit</button><button class="mini" data-gedit="${g.id}">Move the deadline</button></div></div>`;
}
const nothingBtn = g => g.done || g.arch ? '' : `<button class="mini ${(g.nothing || {})[today()] ? 'on' : ''}" data-gnothing="${g.id}" title="Honest log">😶 Did nothing today</button>`;
function bindGoalPush(v) {
  $$('[data-gnothing]', v).forEach(x => x.onclick = () => { const g = gById(x.dataset.gnothing), t = today(); g.nothing ||= {};
    if (g.nothing[t]) delete g.nothing[t]; else { g.nothing[t] = 1; if (g.acted) delete g.acted[t]; }
    save(); render(); if (g.nothing[t]) toast(goalDanger(g) === 2 ? 'Noted. And that\'s a problem 🚨' : 'Noted. Honest is good. Tomorrow counts.'); });
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
