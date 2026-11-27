/* Organiser: easier training.
   - A muscle-group day (Full body, Upper, Lower, or one group) builds a short session itself:
     one exercise per muscle group (5-6), the one you did longest ago first, so it rotates.
     You see the list first and can swap (↻) or remove any exercise before starting.
   - Logging: each exercise starts as "same as last time" — one tap and it's done.
     Edit opens the per-set rows only if something was different.
   - Progression nudge: if you hit all the reps last time, it suggests a little more weight.
   - Add exercise: search box + muscle-group filter.
   Loaded before app.js; only functions here. */
'use strict';

// which muscle groups a day type uses (5-6 exercises)
const PLAN_GROUPS = {
  'Full body': ['Legs', 'Glutes', 'Push', 'Pull', 'Shoulders', 'Core'],
  'Upper body': ['Push', 'Pull', 'Shoulders', 'Arms', 'Pull', 'Core'],
  'Lower body': ['Legs', 'Glutes', 'Legs', 'Glutes', 'Core'],
};
// last date an exercise was done ('' = never), so the longest-rested one comes first
const lastDone = id => { const l = T().logs.filter(x => x.items.some(i => i.ex === id)).map(x => x.date).sort(); return l[l.length - 1] || ''; };
function buildSession(plan, avoid = []) {
  const t = T(), groups = PLAN_GROUPS[plan] || Array(5).fill(plan), picked = [];
  for (const g of groups) {
    const pool = t.ex.filter(e => e.group === g && !picked.includes(e.id) && !avoid.includes(e.id)).sort((a, b) => lastDone(a.id).localeCompare(lastDone(b.id)) || a.name.localeCompare(b.name));
    if (pool[0]) picked.push(pool[0].id);
  }
  return picked;
}
// the next exercise in the same group (for ↻)
function swapFor(id, inList) {
  const e = exById(id), pool = T().ex.filter(x => x.group === e.group && x.id !== id && !inList.includes(x.id)).sort((a, b) => lastDone(a.id).localeCompare(lastDone(b.id)));
  return pool[0] ? pool[0].id : null;
}
// preview: swap / remove before starting
function sessionPreview(plan, ids, start) {
  const row = (id, i) => { const e = exById(id); return `<li><div class="grow">${esc(e.name)}<div class="muted small">${e.group} · ${e.sets}×${esc(e.reps)} · last ${esc(lastTxt(e))}</div></div><button class="mini ghost" data-sw="${i}" title="Swap">↻</button><button class="mini ghost" data-rm="${i}" title="Remove">✕</button></li>`; };
  const body = dialog(`<h2>${esc(plan)}</h2><p class="muted small">${ids.length} exercises, the ones you did longest ago. ↻ swaps for another in the same group.</p><ul class="list" id="spl">${ids.map(row).join('')}</ul><p><button class="mini ghost" id="spAdd">+ Add one</button></p>`, () => { if (!ids.length) { toast('Keep at least one'); return false; } setTimeout(() => start(ids)); }, 'Start');
  const redraw = () => { $('#spl', body).innerHTML = ids.map(row).join(''); bind(); };
  const bind = () => {
    $$('[data-sw]', body).forEach(b => b.onclick = e => { e.preventDefault(); const i = +b.dataset.sw, n = swapFor(ids[i], ids); if (n) { ids[i] = n; redraw(); } else toast('No other exercise in that group'); });
    $$('[data-rm]', body).forEach(b => b.onclick = e => { e.preventDefault(); ids.splice(+b.dataset.rm, 1); redraw(); });
  };
  bind();
  $('#spAdd', body).onclick = e => { e.preventDefault(); exercisePicker(ids, id => { ids.push(id); sessionPreview(plan, ids, start); }); };
}
// search + group filter
function exercisePicker(exclude, onPick) {
  const t = T();
  const body = dialog(`<h2>Add exercise</h2><input name="xq" placeholder="Search exercises" autocomplete="off" enterkeyhint="search">
    <div class="chips">${['All', ...GROUPS.filter(g => g !== 'Cardio')].map(g => `<button class="chip sm ${g === 'All' ? 'on' : ''}" data-xg="${g}">${g}</button>`).join('')}</div><ul class="list" id="xres"></ul>`, null);
  let grp = 'All';
  const draw = () => { const q = fold(body.xq.value);
    const l = t.ex.filter(e => !exclude.includes(e.id) && (grp === 'All' || e.group === grp) && (!q || fold(e.name).includes(q)));
    $('#xres', body).innerHTML = l.map(e => `<li data-xp="${e.id}"><div class="grow">${esc(e.name)}<div class="muted small">${e.group} · last ${esc(lastTxt(e))}</div></div><span>＋</span></li>`).join('') || '<li class="muted small">Nothing found. Add it under Exercise cards.</li>';
    $$('[data-xp]', body).forEach(li => li.onclick = () => { closeDlg(); onPick(li.dataset.xp); }); };
  $$('[data-xg]', body).forEach(b => b.onclick = e => { e.preventDefault(); grp = b.dataset.xg; $$('[data-xg]', body).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  body.xq.oninput = draw; noEnterSubmit(body.xq); draw();
}
// progression: hit the top of the rep range on every set last time -> suggest a bit more
const topReps = r => { const n = String(r || '').match(/\d+/g); return n ? Math.max(...n.map(Number)) : 0; };
function nudge(e) {
  const last = T().logs.slice().reverse().find(l => l.items.some(i => i.ex === e.id)), it = last && last.items.find(i => i.ex === e.id);
  if (!it || !it.sets.length) return null;
  const w = parseFloat(it.sets[0].w), target = topReps(e.reps); if (!(w > 0) || !target) return null;
  if (!it.sets.every(s => parseFloat(s.w) >= w && (parseInt(s.r) || 0) >= target)) return null;
  const step = /db|dumbbell|kettlebell/i.test(e.name) ? 1 : ['Legs', 'Glutes'].includes(e.group) ? 5 : 2.5;
  return { from: w, to: w + step };
}
// one card per exercise in the live session: "same as last time" = one tap
function liveExCard(it, i) {
  const e = exById(it.ex) || { name: '?', sets: 3, reps: '' }, doneN = it.sets.filter(s => s.done).length, all = doneN === it.sets.length && it.sets.length;
  const sum = it.sets.length ? `${esc(it.sets[0].w || '?')}${/^[\d.]+$/.test(it.sets[0].w) ? ' kg' : ''} × ${esc(it.sets[0].r || e.reps)} × ${it.sets.length} sets` : 'no sets';
  const n = !all && nudge(e), fresh = !(e.last && e.last.w), cue = String(e.cues || '').split('|')[0].trim();
  if (!it.open) return `<div class="card exlive ${all ? 'exdone' : ''}"><div class="row"><div class="grow"><div class="h">${all ? '✓ ' : ''}${esc(e.name)}</div><div class="muted small">${sum}${cue ? ' · ' + esc(cue) : ''}</div></div>
      ${all ? `<button class="mini ghost" data-exundo="${i}">Undo</button>` : fresh ? `<button class="primary" data-exopen="${i}">Log it</button>` : `<button class="primary" data-exsame="${i}">✓ Same</button>`}</div>
    ${n ? `<div class="note info sm">↑ You hit all your reps last time. Try ${n.to} kg today. <button class="mini" data-exup="${i}|${n.to}">Use ${n.to} kg</button></div>` : ''}
    ${fresh && !all ? '<p class="muted small">First time: pick a weight you could lift for about 3 more reps, then log it.</p>' : ''}
    ${all ? '' : `<div class="row gap"><button class="mini ghost" data-exopen="${i}">Edit sets</button><span class="grow"></span><button class="mini ghost del" data-rmex="${i}">Skip</button></div>`}</div>`;
  return null; // open: the original per-set editor is shown
}
function bindLiveEasy(v) {
  const L = T().live, at = s => s.split('|');
  $$('[data-exsame]', v).forEach(b => b.onclick = () => { L.items[+b.dataset.exsame].sets.forEach(s => { s.done = true; }); save(); render(); });
  $$('[data-exundo]', v).forEach(b => b.onclick = () => { L.items[+b.dataset.exundo].sets.forEach(s => { s.done = false; }); save(); render(); });
  $$('[data-exopen]', v).forEach(b => b.onclick = () => { L.items[+b.dataset.exopen].open = true; save(); render(); });
  $$('[data-exclose]', v).forEach(b => b.onclick = () => { const it = L.items[+b.dataset.exclose]; it.open = false; if (!it.sets.some(x => x.done)) it.sets.forEach(x => { x.done = true; }); save(); render(); });
  $$('[data-exup]', v).forEach(b => b.onclick = () => { const [i, w] = at(b.dataset.exup); L.items[+i].sets.forEach(s => { s.w = w; }); save(); render(); toast(`${w} kg it is 💪`); });
}
