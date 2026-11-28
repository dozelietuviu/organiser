/* Organiser: holiday mode.
   S.holiday = { from, to, cat: 'hotel' | 'home' }   (to = last day away, '' = not sure yet)
   S.holidays = [{ from, to }] past holidays, so reports and learning skip those days.
   While away:
   - Household chores and prep jobs rest. On the way home every household chore's clock moves on by the
     days you were away (a flat nobody lives in doesn't get dirty). Plants and Admin (rent, bills) keep
     their real dates. Body care, beauty, sleep, water and vitamins carry on as normal.
   - Food logging is just "🍽 Ate" (no weighing): it counts how often you ate. Holiday days don't count
     in calories, energy, the weekly report or the maintenance estimate, and give no food warnings.
   - The cat is at the hotel (or a sitter feeds her at home): no feeding or litter.
   - Goals don't count holiday days as "did nothing".
   - The pet is on holiday too: flowers.
   Loaded before app.js; only functions here. */
'use strict';

const HOL_ATE = 'Ate (holiday)';
function onHoliday(d = today()) {
  const h = S.holiday; if (h && d >= h.from && (!h.to || d <= h.to)) return true;
  return (S.holidays || []).some(x => d >= x.from && d <= x.to);
}
// ends by itself the day after the last day away
function holidayCheck() { const h = S.holiday; if (h && h.to && today() > h.to) holidayEnd(addDays(h.to, 1)); }
function holidayEnd(back) {
  const h = S.holiday; if (!h) return;
  const to = addDays(back, -1), n = Math.max(0, daysBetween(h.from, back));
  if (to >= h.from) (S.holidays ||= []).push({ from: h.from, to });
  if (n) for (const c of CH().list) {
    if (c.off || isBody(c) || c.area === 'Plants' || c.area === 'Admin') continue;
    if (c.due) c.due = addDays(c.due, n); if (c.last) c.last = addDays(c.last, n);
  }
  for (const g of G().list) if (!g.done && !g.arch && (!g.resumed || g.resumed < back)) g.resumed = back;
  S.holiday = null; save();
}
function holidayDialog() {
  const h = S.holiday || { from: today(), to: '', cat: 'hotel' };
  const body = dialog(`<h2>✈️ Holiday</h2>
    <div class="row"><div class="grow"><label>Away from</label><input type="date" name="from" value="${h.from}"></div><div class="grow"><label>Last day away</label><input type="date" name="to" value="${h.to || ''}"></div></div>
    <p class="muted small">Not sure when you're back? Leave it empty and tap "I'm home" on Today.</p>
    <label>The cat</label><select name="cat"><option value="hotel" ${h.cat !== 'home' ? 'selected' : ''}>Goes to the cat hotel</option><option value="home" ${h.cat === 'home' ? 'selected' : ''}>Stays home, a sitter feeds her</option></select>
    <p class="muted small">While you're away: chores and prep rest, food is just "Ate", the cat card goes quiet, goals don't count those days. Water, vitamins, sleep and beauty carry on.</p>
    ${S.holiday ? '<p><button class="del mini" id="holOff">Cancel holiday</button></p>' : ''}`, f => {
    if (!f.from.value) return false; if (f.to.value && f.to.value < f.from.value) { toast('Last day is before the first'); return false; }
    S.holiday = { from: f.from.value, to: f.to.value, cat: f.cat.value }; save(); render();
    toast(f.from.value <= today() ? 'Holiday mode on ✿ Have a lovely time' : `Holiday from ${fmtDay(f.from.value)} ✿`);
  }, S.holiday ? 'Save' : 'Start');
  const off = $('#holOff', body); if (off) off.onclick = e => { e.preventDefault(); if (S.holiday.from > today()) S.holiday = null; else holidayEnd(today()); save(); closeDlg(); render(); };
}
// Today, while away: one card with the essentials
function holidayCard(d) {
  const h = S.holiday, t = today();
  if (h && h.from > t && daysBetween(t, h.from) <= 3) return `<div class="note info sm">✈️ Holiday from ${fmtDay(h.from)} ✿ <button class="mini" id="holEdit">Edit</button></div>`;
  if (!onHoliday(d)) return '';
  const ate = (S.log[d] || []).filter(e => e.name === HOL_ATE).length;
  const vt = (S.body && B().vit[d]) || {}, vits = S.body ? B().vitSlots.flatMap(sl => sl.items.filter(it => vitDue(it, d))) : [];
  return `<div class="card holiday"><div class="row"><h2 class="grow">✈️ On holiday ✿</h2>${h && d === t ? '<button class="mini" id="holHome">🏠 I\'m home</button>' : ''}</div>
    <p class="muted small">${h && h.to ? `Back ${fmtDay(addDays(h.to, 1))}` : 'Back whenever you are'} · chores, prep and food counting are resting.</p>
    <div class="row"><button class="primary" id="holAte">🍽 Ate</button><span class="grow muted small">${ate ? `${ate}× today` : 'Tap whenever you eat, no weighing'}</span>${ate ? '<button class="mini ghost" id="holAteUndo">Undo</button>' : ''}</div>
    ${vits.length ? `<div class="chips vitrow"><span class="muted small">💊</span>${vits.map(it => `<button class="chip sm ${vt[it.id] ? 'on' : ''}" data-vit="${it.id}">${vt[it.id] ? '✓ ' : ''}${esc(it.name)}</button>`).join('')}</div>` : ''}</div>`;
}
function bindHoliday(v) {
  const d = UI.day, q = s => $(s, v);
  if (q('#holEdit')) q('#holEdit').onclick = holidayDialog;
  if (q('#holHome')) q('#holHome').onclick = () => { holidayEnd(today()); render(); toast('Welcome home 🏠'); };
  if (q('#holAte')) q('#holAte').onclick = () => { (S.log[d] ||= []).push({ id: uid(), at: d === today() ? Date.now() : parseDay(d).getTime() + 12 * 36e5, slot: UNPL, name: HOL_ATE, g: 0, kcal: 0, p: 0, c: 0, f: 0, fib: 0, hol: 1 }); save(); render(); };
  if (q('#holAteUndo')) q('#holAteUndo').onclick = () => { const L = S.log[d] || [], i = L.map(e => e.name).lastIndexOf(HOL_ATE); if (i >= 0) L.splice(i, 1); save(); render(); };
  $$('.holiday [data-vit]', v).forEach(x => x.onclick = () => { const t = B().vit[d] ||= {}; t[x.dataset.vit] = !t[x.dataset.vit]; save(); render(); });
}
// the cat card while she's at the hotel / with the sitter
function catHotelCard(d) {
  const home = S.holiday && S.holiday.cat === 'home';
  return `<div class="card cat fed"><div class="row"><span class="cathead">${pxSvg(PX_TABS.catface, 'pxcathead')}</span><div class="grow"><div class="h">${home ? 'The sitter has her ✓' : 'Cat is at the hotel 🏨'}</div><div class="muted small">No feeding or litter while you're away</div></div></div></div>`;
}
