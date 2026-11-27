/* Organiser: looks. 'ocean' (the original dark look) or Pixel: retro-computer windows, pastel by day
   and navy/neon by night. Pixel (auto) switches at sunrise / sunset in Vilnius (worked out on the phone,
   no internet needed). Pixel adds a status screen at the top of Today (energy, thirsty, hungry, happy,
   health, home) with a little black cat. Only the look changes: every button stays where it was.
   Loaded before app.js; only functions here. Styles: theme.css (all scoped to body.px). */
'use strict';

const LOOKS = [['ocean', 'Ocean'], ['pixel', 'Pixel (auto)'], ['pixel-day', 'Pixel day'], ['pixel-night', 'Pixel night']];
// sunrise / sunset (NOAA simplified), Vilnius. Returns local Date objects for the given day.
function sunTimes(day = new Date(), lat = 54.69, lon = 25.28) {
  const rad = Math.PI / 180, start = new Date(day.getFullYear(), 0, 0), n = Math.floor((day - start) / 864e5);
  const g = 2 * Math.PI / 365 * (n - 1);
  const eq = 229.18 * (.000075 + .001868 * Math.cos(g) - .032077 * Math.sin(g) - .014615 * Math.cos(2 * g) - .040849 * Math.sin(2 * g));
  const dec = .006918 - .399912 * Math.cos(g) + .070257 * Math.sin(g) - .006758 * Math.cos(2 * g) + .000907 * Math.sin(2 * g) - .002697 * Math.cos(3 * g) + .00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.min(1, Math.max(-1, Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(dec)) - Math.tan(lat * rad) * Math.tan(dec)))) / rad;
  const utcMin = m => { const d = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())); d.setUTCMinutes(Math.round(m)); return d; };
  return { rise: utcMin(720 - 4 * (lon + ha) - eq), set: utcMin(720 - 4 * (lon - ha) - eq) };
}
const isNight = (now = new Date()) => { const s = sunTimes(now); return now < s.rise || now >= s.set; };
function applyTheme() {
  const t = (S.settings || {}).theme || 'ocean', px = t !== 'ocean', night = t === 'pixel-night' || (t === 'pixel' && isNight());
  const b = document.body; b.classList.toggle('px', px); b.classList.toggle('px-night', px && night); b.classList.toggle('px-day', px && !night);
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = !px ? '#06121b' : night ? '#1a1540' : '#f3e6f7';
  // pixel font for headings only (cached by the browser after the first load; offline it falls back to monospace)
  if (px && !document.getElementById('pxFont')) { const l = document.createElement('link'); l.id = 'pxFont'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600&display=swap'; document.head.appendChild(l); }
}

// ---- the little black cat (16×14 pixels, drawn as squares) ----
const CAT_ART = [
  '..#........#....',
  '.###......###...',
  '.##############.',
  '################',
  '##EE######EE####',
  '##EE######EE####',
  '#######NN#######',
  '.##############.',
  '..############..',
  '.##############.',
  '################..#',
  '################.##',
  '##################.',
  '.######..#######..',
];
function catSvg(state) {
  const eye = state === 'sleepy' ? null : state === 'sad' ? '#7fb3ff' : '#c6f26b', px = [];
  CAT_ART.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    let c = ch === '#' ? '#16121f' : ch === 'N' ? '#ff8fc0' : eye || '#16121f';
    px.push(`<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${c}"/>`);
    if (ch === 'E' && !eye && y === 5) px.push(`<rect x="${x}" y="${y}" width="1.02" height=".35" fill="#8a84b8"/>`); // closed eyes
  }));
  return `<svg class="pxcat" viewBox="-0.5 -0.5 20 15" shape-rendering="crispEdges" aria-hidden="true">${px.join('')}</svg>`;
}

// ---- status screen (Pixel looks only, top of Today) ----
function statusBars(d = today()) {
  const s = S.settings, dd = S.day[d] || {}, tot = sumM(mealsOn(d)), h = new Date().getHours();
  const sleep = typeof sleepHours === 'function' ? sleepHours(addDays(d, -1)) : null;
  const sym = (B().sym || {})[d] || {}, mood = moodOf(sym), fc = (moodForecast(d) || [])[0];
  const happy = { glow: 1, vibes: .85, muggle: .6, low: .3, stab: .15 }[mood] ?? (fc ? (fc.k === 'glow' ? .9 : .3) : .6);
  const vs = (B().vitSlots || []).flatMap(x => (x.items || []).filter(it => vitDue(it, d))), vt = (B().vit || {})[d] || {}, vd = vs.filter(it => vt[it.id]).length;
  const habOk = Object.keys(HAB_DEF).filter(k => !habCfg(k).paused);
  const habGood = habOk.filter(k => k === 'smoke' ? !((B().smoked || {})[d]) : !(habCfg(k).limit != null && habCount(k, d) > habCfg(k).limit)).length;
  const health = vs.length ? (Math.min(1, vd / vs.length) + (habOk.length ? habGood / habOk.length : 1)) / 2 : habOk.length ? habGood / habOk.length : 1;
  const due = typeof dueNow === 'function' ? dueNow().length : 0;
  return [
    ['energy', 'Energy', sleep == null ? null : Math.min(1, sleep / 8), 'body', sleep == null ? 'tap Good night / I\'m up' : `${fmtH(sleep)} sleep`],
    ['thirsty', 'Thirsty', Math.min(1, (dd.water || 0) / (s.water || 8)), 'today', `${dd.water || 0}/${s.water} glasses`],
    ['hungry', 'Fed', Math.min(1, tot.kcal / kcalFor(d)), 'log', `${r0(tot.kcal)}/${kcalFor(d)} kcal · P ${r0(tot.p)}`],
    ['happy', 'Happy', happy, 'body', mood ? MOODS.find(m => m[0] === mood)?.[1] || mood : fc ? (fc.k === 'glow' ? 'glow forecast' : 'storm forecast') : 'no mood logged'],
    ['health', 'Health', health, 'body', `${vd}/${vs.length || 0} vitamins · ${habGood}/${habOk.length} habits`],
    ['home', 'Home', Math.max(0, 1 - due / 6), 'tasks', due ? `${due} chore${due > 1 ? 's' : ''} due` : 'all done'],
  ];
}
function catState(bars, d) {
  const v = k => (bars.find(b => b[0] === k) || [])[2], h = new Date().getHours();
  if (isNight() && h >= 21 || (v('energy') != null && v('energy') < .7 && h < 11)) return ['sleepy', 'zzz…'];
  if (v('thirsty') < .4 && h >= 13) return ['ok', 'water? 💧'];
  if (v('hungry') < .25 && h >= 13) return ['ok', 'snack? 🍙'];
  if (v('happy') <= .3) return ['sad', 'here for you'];
  if (v('home') < .5) return ['ok', 'chores…'];
  return ['ok', ['♥', 'purr', 'nice', 'mrrp'][new Date().getDate() % 4]];
}
function pixelStatus(d) {
  if (!document.body.classList.contains('px') || d !== today()) return '';
  const bars = statusBars(d), [st, say] = catState(bars, d), seg = v => Array.from({ length: 10 }, (_, i) => `<i class="${v != null && i < Math.round(v * 10) ? 'on' : ''}"></i>`).join('');
  return `<div class="card pxstatus"><div class="pxcatbox">${catSvg(st)}<span class="pxsay">${esc(say)}</span></div>
    <div class="pxbars">${bars.map(([k, l, v, go_, note]) => `<button class="pxbar ${v != null && v < .34 ? 'lowb' : ''}" data-pxgo="${go_}" title="${esc(note)}"><b>${l}</b><span class="seg">${seg(v)}</span></button>`).join('')}</div>
    <p class="muted small pxnote" id="pxNote">Tap a bar for details.</p></div>`;
}
function bindPixelStatus(v) {
  const bars = statusBars(), note = $('#pxNote', v);
  $$('[data-pxgo]', v).forEach((b, i) => b.onclick = () => {
    if (note && note.dataset.k !== String(i)) { note.dataset.k = i; note.textContent = `${bars[i][1]}: ${bars[i][4]} · tap again to open`; return; }
    const g = b.dataset.pxgo; if (g === 'today') { const w = $('.drops', v); if (w) w.scrollIntoView({ behavior: 'smooth', block: 'center' }); } else go(g);
  });
}
