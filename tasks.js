/* Organiser: household chores (Household tab > Chores, and "Chores today" at the top of Today).
   No fixed weekdays: each chore rolls over from the last time it was done, and learns its real gap from your taps.
   Loaded before app.js. Only functions here: they run after app.js has set everything up. Data: S.tasks. */
'use strict';

// What each button means. The labels change per chore, the meaning stays the same:
//   early = done, and it couldn't wait (the gap is too long)       -> next one counted from today
//   done  = done                                                    -> next one counted from today
//   later = not yet, a bit early (half full)                        -> wait ~1/3 of the gap (trash: 1 day)
//   more  = not yet, far too early (too little)                     -> wait a whole gap (trash: 3 days)
//   skip  = (fixed chores only) skip this time, learns nothing      -> wait a whole gap
//   life  = 'Life happened': putting it off, learns nothing          -> stays on Today (and every day after), red, until done
const CHORE_SETS = {
  bin: ['Overflowing', 'Done', 'Half full', 'Too little'],
  clean: ['Really needed it', 'Done', 'Still OK', 'Still clean'],
  plants: ['Soil was dry', 'Watered', 'Still damp', 'Still wet'],
  laundry: ['Nothing to wear', 'Done', 'Half a load', 'Barely any'],
  litter: ['Smelly', 'Done', 'Still OK', 'Barely used'],
  fresh: ['Needed it', 'Done', 'Still fresh', 'Barely used'],
};
const CHORE_KINDS = ['early', 'done', 'later', 'more'];
const FIXED_BTNS = [['done', 'Done'], ['skip', 'Skip this time']];
const LIFE = ['life', 'Life happened'];
const CHORE_AREAS = ['Kitchen', 'Bathroom', 'Bedroom', 'Flat', 'Plants', 'Laundry', 'Cat', 'Us', 'Admin'];
// [name, area, start gap in days, label set or 'fixed' (keeps its gap, doesn't learn)]
const CHORE_SEED = [
  ['Empty trash', 'Kitchen', 3, 'bin'], ['Take out recycling', 'Kitchen', 7, 'bin'], ['Wipe stove and counters', 'Kitchen', 2, 'clean'],
  ['Clean microwave', 'Kitchen', 14, 'clean'], ['Clean sink drain', 'Kitchen', 14, 'clean'], ['Descale kettle', 'Kitchen', 30, 'clean'],
  ['Clean fridge', 'Kitchen', 30, 'clean'], ['Clean oven', 'Kitchen', 60, 'clean'], ['Defrost freezer', 'Kitchen', 180, 'clean'], ['Check pantry', 'Kitchen', 7, 'fixed'],
  ['Clean bathroom', 'Bathroom', 7, 'clean'], ['Clean toilet', 'Bathroom', 4, 'clean'], ['Change towels', 'Bathroom', 4, 'fresh'],
  ['Clean shower drain', 'Bathroom', 30, 'clean'], ['Replace toothbrush heads', 'Bathroom', 90, 'fixed'],
  ['Wash bedding', 'Bedroom', 7, 'fresh'], ['Wash pillows and duvet', 'Bedroom', 90, 'clean'], ['Vacuum mattress', 'Bedroom', 90, 'clean'],
  ['Vacuum', 'Flat', 4, 'clean'], ['Mop floor', 'Flat', 7, 'clean'], ['Dust surfaces', 'Flat', 7, 'clean'], ['Wash sofa throws', 'Flat', 14, 'fresh'], ['Clean windows', 'Flat', 60, 'clean'],
  ['Water plants', 'Plants', 4, 'plants'], ['Fertilise plants', 'Plants', 30, 'fixed'],
  ['Laundry', 'Laundry', 3, 'laundry'],
  ['Scoop litter', 'Cat', 1, 'litter'], ['Empty cat litter', 'Cat', 7, 'litter'], ['Wash cat bowls', 'Cat', 2, 'clean'], ['Clean water fountain', 'Cat', 7, 'clean'],
  ['Trim cat nails', 'Cat', 14, 'clean'], ['Cat bath', 'Cat', 90, 'clean'],
  ['Date night', 'Us', 7, 'fixed'], ['Plan the week together', 'Us', 7, 'fixed'],
  ['Pay bills', 'Admin', 30, 'fixed'],
];
const CH = () => (S.tasks ||= { list: [] });
const dayDiff = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 864e5); // days from a to b
// first start: due dates spread out so you don't get 35 chores on day one (short ones first)
// chores that can't be put off ('Life happened' hidden): they stay on the list until done
const MUST_DO = ['Scoop litter', 'Empty cat litter'];
function seedChores() {
  if (!S.tasksMust) { S.tasksMust = 1; for (const c of (S.tasks || {}).list || []) if (MUST_DO.includes(c.name)) c.must = true; }
  if (S.tasksSeeded) return; S.tasksSeeded = 1; const t = today();
  CHORE_SEED.forEach(([name, area, gap, set], i) => {
    const off = gap <= 1 ? 0 : (i * 5) % gap, due = addDays(t, off); // monthly+ chores spread over their whole gap
    CH().list.push({ id: uid(), name, area, gap, fixed: set === 'fixed', must: MUST_DO.includes(name), labels: set === 'fixed' ? null : CHORE_SETS[set].slice(), due, last: addDays(due, -gap), log: [] });
  });
  save();
}
const choreBtns = c => [...(c.fixed ? FIXED_BTNS : CHORE_KINDS.map((k, i) => [k, (c.labels || CHORE_SETS.clean)[i]])), ...(c.must ? [] : [LIFE])];
const pushDays = (c, k) => k === 'later' ? (c.fixed ? 1 : Math.max(1, Math.min(14, Math.round(gapOf(c) * 0.35)))) : gapOf(c);

// ---- learning ----
// every tap is a clue about the right gap:
//   couldn't wait after n days -> n is about right (shorter than planned)
//   done after n days          -> about right; done late isn't counted against it (life happens)
//   half full / too little     -> n + the wait was needed
// After 4 clues the learned gap takes over: a weighted average of the last 8, newest counting most.
function choreClue(c, k, n) {
  const g = c.gap;
  if (k === 'early') return Math.max(1, n);
  if (k === 'done') return n >= g ? g : (n + g) / 2;
  if (k === 'later' || k === 'more') return n + pushDays(c, k);
  return null;
}
function gapOf(c) {
  if (c.fixed) return c.gap;
  const cl = (c.log || []).map(x => x.clue).filter(x => x > 0).slice(-8); if (cl.length < 4) return c.gap;
  let a = 0, w = 0; cl.forEach((x, i) => { a += x * (i + 1); w += i + 1; });
  return Math.max(1, Math.round(a / w * 2) / 2);
}
// weekly rhythm: after 6 done taps, if half or more were on the same weekday, longer chores move to that day
// when it's within a day or two of the due date (e.g. mopping always ends up on Saturday)
function choreDay(c) {
  const ds = (c.log || []).filter(x => x.k === 'early' || x.k === 'done').slice(-12); if (ds.length < 6) return null;
  const cnt = [0, 0, 0, 0, 0, 0, 0]; for (const x of ds) cnt[parseDay(x.d).getDay()]++;
  const best = cnt.indexOf(Math.max(...cnt)); return cnt[best] / ds.length >= 0.5 ? best : null;
}
function nextDue(c, from) {
  const g = gapOf(c); let d = addDays(from, Math.max(1, Math.round(g)));
  const wd = g >= 5 ? choreDay(c) : null;
  if (wd != null) { const reach = g >= 14 ? 2 : 1;
    for (let k = 0; k <= reach; k++) for (const s of [k, -k]) { const x = addDays(d, s); if (parseDay(x).getDay() === wd && x > from) return x; } }
  return d;
}
function tapChore(c, k) {
  const t = today(), n = Math.max(0, dayDiff(c.last || addDays(t, -c.gap), t));
  c.undo = { due: c.due, last: c.last, putOff: c.putOff || 0, putDay: c.putDay, n: (c.log || []).length };
  const clue = c.fixed ? null : choreClue(c, k, n);
  (c.log ||= []).push({ d: t, k, n, clue }); if (c.log.length > 40) c.log = c.log.slice(-40);
  if (k === 'early' || k === 'done') { c.last = t; c.due = nextDue(c, t); c.putOff = 0; }
  else if (k === 'life') { if (c.due > t) c.due = t; if (c.putDay !== t) { c.putOff = (c.putOff || 0) + 1; c.putDay = t; } }
  else c.due = addDays(t, pushDays(c, k));
  save(); render();
  const lbl = (choreBtns(c).find(b => b[0] === k) || [])[1];
  toast(k === 'early' || k === 'done' ? `${c.name} ✓ next ${dueTxt2(c.due)}` : k === 'life' ? `Life happens. ${c.name} stays here until it's done` : `${lbl}: back ${dueTxt2(c.due)}`);
}
function undoChore(c) {
  if (!c.undo) return; Object.assign(c, { due: c.undo.due, last: c.undo.last, putOff: c.undo.putOff, putDay: c.undo.putDay }); c.log = (c.log || []).slice(0, c.undo.n); c.undo = null; save();
}
const dueTxt2 = d => { const n = dayDiff(today(), d); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n < 7 ? DOW(d) : fmtDay(d); };
const lateTxt = c => { const n = dayDiff(c.due, today()); return n <= 0 ? '' : n === 1 ? '1 day late' : `${n} days late`; };
const gapTxt = g => g === 1 ? 'every day' : `every ${g} days`;
const live = () => CH().list.filter(c => !c.off);
const dueNow = () => live().filter(c => c.due <= today()).sort((a, b) => a.due.localeCompare(b.due) || a.gap - b.gap);

// ---- views ----
function choreRow(c, withBtns = true) {
  const late = lateTxt(c), po = c.putOff || 0;
  return `<li class="chore ${po ? 'putoff' : ''}"><div class="row"><div class="grow" data-ch="${c.id}">${esc(c.name)}<div class="muted small">${esc(c.area)}${po ? ` · <span class="warnc">put off ${po === 1 ? 'once' : po + '×'}</span>` : late ? ` · <span class="warnc">${late}</span>` : ''}</div></div><span data-ch="${c.id}" class="muted">›</span></div>
    ${withBtns ? `<div class="chips">${choreBtns(c).map(([k, l]) => `<button class="chip sm ${k === 'done' ? 'on' : k === 'life' ? 'life' : ''}" data-ctap="${c.id}|${k}">${esc(l)}</button>`).join('')}</div>` : ''}</li>`;
}
// freezer: meals planned for tomorrow that need something from the freezer become a one-off chore today
// (done = ticked for today; it comes back on its own whenever tomorrow's plan needs the freezer again)
function freezerChore() {
  const t = today(); if ((S.day[t] || {}).fzOut) return null;
  const fz = typeof freezerFor === 'function' ? freezerFor(addDays(t, 1)) : []; return fz.length ? fz : null;
}
const freezerRow = fz => `<li class="chore"><div class="row"><div class="grow">🧊 Take out of the freezer tonight<div class="muted small">${fz.map(esc).join(', ')} · for tomorrow</div></div></div>
  <div class="chips"><button class="chip sm on" data-fzout>Done</button></div></li>`;
// top of Today: only what's due (nothing shows when nothing is due), so the morning plan is one glance
function choresToday(d) {
  if (d !== today()) return ''; const l = dueNow(), fz = freezerChore(); if (!l.length && !fz) return '';
  const shown = l.slice(0, 6);
  return `<div class="card"><div class="row"><h2 class="grow">Chores today</h2><button class="mini ghost" data-gochores>All</button></div>
    <ul class="list">${fz ? freezerRow(fz) : ''}${shown.map(c => choreRow(c)).join('')}</ul>${l.length > shown.length ? `<p class="muted small">+${l.length - shown.length} more in Household › Chores</p>` : ''}</div>`;
}
function choresView() {
  const t = today(), all = live(), due = dueNow(), fz = freezerChore(), soon = all.filter(c => c.due > t && c.due <= addDays(t, 7)).sort((a, b) => a.due.localeCompare(b.due)),
    later = all.filter(c => c.due > addDays(t, 7)).sort((a, b) => a.due.localeCompare(b.due)), off = CH().list.filter(c => c.off);
  const mini = c => `<li data-ch="${c.id}"><div class="grow">${esc(c.name)}<div class="muted small">${esc(c.area)} · ${gapTxt(gapOf(c))}</div></div><span class="muted small">${dueTxt2(c.due)}</span><span>›</span></li>`;
  return `<div class="card"><div class="row"><h2 class="grow">Due now</h2><button class="mini" id="chAdd">+ Chore</button></div>
    ${due.length || fz ? `<ul class="list">${fz ? freezerRow(fz) : ''}${due.map(c => choreRow(c)).join('')}</ul>` : '<p class="muted small">Nothing due. Enjoy it ✨</p>'}</div>
  ${soon.length ? `<div class="card"><h2>Next 7 days</h2><ul class="list">${soon.map(mini).join('')}</ul></div>` : ''}
  ${later.length ? `<div class="card"><details><summary><b>Later</b> <span class="muted small">${later.length}</span></summary><ul class="list">${later.map(mini).join('')}</ul></details></div>` : ''}
  ${off.length ? `<div class="card"><details><summary class="muted">Paused <span class="small">${off.length}</span></summary><ul class="list">${off.map(c => `<li data-ch="${c.id}"><div class="grow muted">${esc(c.name)}</div><span>›</span></li>`).join('')}</ul></details></div>` : ''}
  <p class="muted small">Tap a chore to do it early, change its buttons or gap, or see what the app has learned.</p>`;
}
const choreById = id => CH().list.find(c => c.id === id);
function bindChores(v) {
  $$('[data-ctap]', v).forEach(b => b.onclick = () => { const [id, k] = b.dataset.ctap.split('|'), c = choreById(id); if (c) tapChore(c, k); });
  $$('[data-ch]', v).forEach(b => b.onclick = () => choreDialog(choreById(b.dataset.ch)));
  const g = $('[data-gochores]', v); if (g) g.onclick = () => go('tasks');
  const fz = $('[data-fzout]', v); if (fz) fz.onclick = () => { (S.day[today()] ||= {}).fzOut = 1; save(); render(); toast('Thawing ✓'); };
}
function bindChoresPage(v) { $('#chAdd', v).onclick = () => choreEdit({}); }
function choreDialog(c) {
  if (!c) return;
  const g = gapOf(c), wd = choreDay(c), n = (c.log || []).filter(x => x.clue > 0).length, hist = (c.log || []).slice(-8).reverse();
  const lbl = k => (choreBtns(c).find(b => b[0] === k) || [, k])[1];
  const body = dialog(`<h2>${esc(c.name)}</h2>
    <div class="muted small">${esc(c.area)} · next ${dueTxt2(c.due)}${c.last ? ` · last done ${fmtDay(c.last)}` : ''}</div>
    <div class="chips" style="margin:12px 0">${choreBtns(c).map(([k, l]) => `<button class="chip ${k === 'done' ? 'on' : k === 'life' ? 'life' : ''}" data-ctap="${c.id}|${k}">${esc(l)}</button>`).join('')}</div>
    <p class="small">${c.fixed ? `Fixed: ${gapTxt(c.gap)}.` : n >= 4 ? `Learned: ${gapTxt(g)} (you started at ${c.gap}).` : `Learning: ${gapTxt(c.gap)} for now, ${4 - n} more tap${4 - n > 1 ? 's' : ''} until it adjusts to you.`}
      ${wd != null && g >= 5 ? ` You usually do it on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][wd]}, so it's planned near then.` : ''}</p>
    ${c.putOff ? `<div class="note warn sm">Put off ${c.putOff === 1 ? 'once' : c.putOff + ' times'}. It stays on Today, red, until it's done.</div>` : ''}
    ${hist.length ? `<h3>Recent</h3><ul class="list">${hist.map(x => `<li><div class="grow small">${fmtDay(x.d)}</div><span class="muted small">${esc(lbl(x.k))}${x.n ? ` · after ${x.n} d` : ''}</span></li>`).join('')}</ul>` : ''}
    <div class="row wrap gap">${c.undo ? '<button class="mini ghost" id="chUndo">Undo last tap</button>' : ''}<button class="mini" id="chEdit">✎ Edit</button></div>`, null);
  $$('[data-ctap]', body).forEach(b => b.onclick = e => { e.preventDefault(); closeDlg(); tapChore(c, b.dataset.ctap.split('|')[1]); });
  const u = $('#chUndo', body); if (u) u.onclick = e => { e.preventDefault(); undoChore(c); closeDlg(); render(); toast('Undone'); };
  $('#chEdit', body).onclick = e => { e.preventDefault(); choreEdit(c); };
}
function choreEdit(c) {
  const isNew = !c.id, labels = c.labels || CHORE_SETS.clean;
  const body = dialog(`<h2>${isNew ? 'New chore' : 'Edit chore'}</h2>
    <label>Name</label><input name="name" value="${esc(c.name || '')}" placeholder="e.g. Clean the balcony">
    <div class="row"><div class="grow"><label>Area</label><select name="area">${CHORE_AREAS.map(a => `<option ${a === (c.area || 'Flat') ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
      <div class="grow"><label>${isNew ? 'Every … days' : 'Start gap, days'}</label><input name="gap" inputmode="numeric" value="${c.gap || 7}"></div></div>
    <label class="row tick"><input type="checkbox" name="fixed" ${c.fixed ? 'checked' : ''}> Fixed gap (bills, date night): don't learn, just Done / Skip</label>
    <label class="row tick"><input type="checkbox" name="must" ${c.must ? 'checked' : ''}> Can't be put off: no "Life happened", it stays until done</label>
    <div id="chLbl" ${c.fixed ? 'hidden' : ''}><label>Button words</label>
      <select name="preset"><option value="">Pick a set…</option>${Object.entries(CHORE_SETS).map(([k, l]) => `<option value="${k}">${l.join(' / ')}</option>`).join('')}</select>
      <div class="grid4">${['Couldn\'t wait', 'Done', 'A bit early', 'Far too early'].map((h, i) => `<div><label class="small">${h}</label><input name="l${i}" value="${esc(labels[i])}"></div>`).join('')}</div></div>
    ${isNew ? '' : `<div class="row wrap gap" style="margin-top:10px"><button class="mini ghost" id="chOff">${c.off ? 'Resume' : 'Pause'}</button><button class="del mini" id="chDel">Delete chore</button></div>`}`, f => {
    const name = f.name.value.trim(), gap = Math.max(1, Math.round(num(f.gap.value))); if (!name) { toast('Add a name'); return false; }
    const o = isNew ? { id: uid(), log: [], due: today(), last: addDays(today(), -gap) } : c;
    Object.assign(o, { name, area: f.area.value, gap, fixed: f.fixed.checked, must: f.must.checked, labels: f.fixed.checked ? null : [0, 1, 2, 3].map(i => f['l' + i].value.trim() || CHORE_SETS.clean[i]) });
    if (isNew) CH().list.push(o);
  });
  body.fixed.onchange = () => { $('#chLbl', body).hidden = body.fixed.checked; };
  body.preset.onchange = () => { const s = CHORE_SETS[body.preset.value]; if (s) s.forEach((l, i) => { body['l' + i].value = l; }); };
  const off = $('#chOff', body); if (off) off.onclick = e => { e.preventDefault(); c.off = !c.off; if (!c.off && c.due < today()) c.due = today(); save(); closeDlg(); render(); };
  const del = $('#chDel', body); if (del) del.onclick = e => { e.preventDefault(); if (!confirmInline(del)) return; S.tasks.list = CH().list.filter(x => x !== c); save(); closeDlg(); render(); toast('Chore deleted'); };
}
