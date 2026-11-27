/* Organiser: the look. Pixel: retro-computer windows, pastel by day
   and navy/neon by night. Pixel (auto) switches at sunrise / sunset in Vilnius (worked out on the phone,
   no internet needed). Pixel adds a status screen at the top of Today (energy, thirsty, hungry, happy,
   health, home) with a little black cat. Only the look changes: every button stays where it was.
   Loaded before app.js; only functions here. Styles: theme.css (all scoped to body.px). */
'use strict';

const LOOKS = [['pixel', 'Auto (sunset)'], ['pixel-day', 'Day'], ['pixel-night', 'Night']];
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
  const t0 = (S.settings || {}).theme, t = ['pixel', 'pixel-day', 'pixel-night'].includes(t0) ? t0 : 'pixel', px = true, night = t === 'pixel-night' || (t === 'pixel' && isNight());
  const b = document.body; b.classList.toggle('px', px); b.classList.toggle('px-night', px && night); b.classList.toggle('px-day', px && !night);
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = !px ? '#06121b' : night ? '#1a1540' : '#f3e6f7';
  // pixel font for headings only (cached by the browser after the first load; offline it falls back to monospace)
  if (px && !document.getElementById('pxFont')) { const l = document.createElement('link'); l.id = 'pxFont'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600&display=swap'; document.head.appendChild(l); }
}

// ---- the virtual pet (an original little blob in an egg-shaped handheld, 1-bit LCD) ----
// Its mood comes from how well you looked after yourself today (the status bars) and your goals.
// Thriving -> fine -> hungry / thirsty -> sad -> sick -> dead (it respawns tomorrow). Chores due = poops.
const PET = {
  happy: ['#..............#', '.#...######...#.', '...##......##...', '..#..........#..', '.#............#.', '.#..#.#..#.#..#.', '.#............#.', '.#...#....#...#.', '.#....####....#.', '..#..........#..', '...##......##...', '.....######.....', '....#.#..#.#....', '................'],
  ok: ['................', '.....######.....', '...##......##...', '..#..........#..', '.#............#.', '.#...#....#...#.', '.#............#.', '.#.....##.....#.', '.#............#.', '..#..........#..', '...##......##...', '.....######.....', '....#.#..#.#....', '................'],
  hungry: ['................', '.....######.....', '...##......##...', '..#..........#..', '.#............#.', '.#...#....#...#.', '.#............#.', '.#.....##.....#.', '.#....#..#....#.', '..#....##....#..', '...##......##...', '.....######.....', '....#.#..#.#....', '................'],
  sad: ['................', '.....######.....', '...##......##...', '..#..........#..', '.#............#.', '.#...#....#...#.', '.#...#........#.', '.#............#.', '.#.....##.....#.', '..#...#..#...#..', '...##......##...', '.....######.....', '....#.#..#.#....', '................'],
  sick: ['................', '.....######.....', '...##......##...', '..#..........#..', '.#..#.#..#.#..#.', '.#...#....#...#.', '.#..#.#..#.#..#.', '.#............#.', '.#...#.#.#.#..#.', '..#..........#..', '...##......##...', '.....######.....', '....#.#..#.#....', '................'],
  sleepy: ['...........###..', '.....######..#..', '...##......###..', '..#..........#..', '.#............#.', '.#............#.', '.#..##....##..#.', '.#............#.', '.#.....##.....#.', '..#..........#..', '...##......##...', '.....######.....', '....#.#..#.#....', '................'],
  dead: ['.....######.....', '....#......#....', '.....######.....', '................', '.....######.....', '...##......##...', '..#..........#..', '..#.#.#..#.#.#..', '..#..#....#..#..', '..#.#.#..#.#.#..', '..#..........#..', '..#....##....#..', '..#..........#..', '..#.##.##.##.#..'],
};
const POOP = ['..#...', '.#.#..', '.####.', '######'];
function petLcd(mood, poops) {
  const px = [], put = (art, ox, oy) => art.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') px.push(`M${ox + x} ${oy + y}h1v1h-1z`); }));
  put(PET[mood] || PET.ok, 2, 1);
  for (let i = 0; i < Math.min(poops, 2); i++) put(POOP, 19, 11 - i * 5);
  return `<svg class="petlcd" viewBox="0 0 26 16" shape-rendering="crispEdges" aria-hidden="true"><path fill="#2e3a2a" d="${px.join('')}"/></svg>`;
}
const petEgg = (mood, poops) => `<div class="petegg"><div class="petscreen">${petLcd(mood, poops)}</div><div class="petbtns"><i></i><i></i><i></i></div></div>`;
const PET_SAY = {
  happy: ['you looked after us today ♥', 'thriving. look at us.', 'best owner ever', 'we are SO back'],
  ok: ['doing alright', 'mrrp?', 'steady', 'more water and we\'re golden'],
  hungry: ['feed meeee', 'my bowl is EMPTY', 'is that a protein shake? for me?'],
  thirsty: ['water. now. please.', 'i am a raisin', 'hydrate or diedrate'],
  sad: ['it\'s ok. tomorrow.', 'sending a tiny hug', 'here for you'],
  sick: ['i feel… pixelated.', 'call the pet vet', 'need water, food, sleep. anything.', 'cough. cough. dramatic cough.'],
  sleepy: ['zzz…', 'five more minutes', 'lights out?'],
  dead: ['💀 you let me die. i respawn tomorrow.', 'R.I.P. me. eat, drink, sleep, then revive me.', 'ghost mode. this is on you.', 'i\'m haunting you until you drink water'],
  goal: ['your goals are crying. so am i.', 'recommit or i stay dramatic', 'deadline is coming. i can smell it.'],
};
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
// how well today went: average of the bars that have data, minus goals in trouble
function petMood(bars) {
  const v = k => (bars.find(b => b[0] === k) || [])[2], h = new Date().getHours();
  const vals = bars.map(b => b[2]).filter(x => x != null), score = (vals.length ? vals.reduce((a, x) => a + x, 0) / vals.length : .6) - Math.min(.2, goalsInTrouble() * .08);
  const poops = v('home') != null && v('home') < .5 ? (v('home') < .2 ? 2 : 1) : 0, pick = k => PET_SAY[k][(new Date().getDate() + h) % PET_SAY[k].length];
  if ((h >= 18 && score < .3) || (h >= 21 && score < .38)) return ['dead', pick('dead'), poops];
  if (h >= 13 && score < .42) return ['sick', pick('sick'), poops];
  if (goalsInTrouble() && h >= 10) return ['sad', pick('goal'), poops];
  if ((isNight() && h >= 22) || h < 6 || (v('energy') != null && v('energy') < .7 && h < 10)) return ['sleepy', pick('sleepy'), poops];
  if (v('thirsty') != null && v('thirsty') < .35 && h >= 12) return ['hungry', pick('thirsty'), poops];
  if (v('hungry') != null && v('hungry') < .25 && h >= 13) return ['hungry', pick('hungry'), poops];
  if (v('happy') != null && v('happy') <= .3) return ['sad', pick('sad'), poops];
  if (score >= .75) return ['happy', pick('happy'), poops];
  return ['ok', pick('ok'), poops];
}
function pixelStatus(d) {
  if (!document.body.classList.contains('px') || d !== today()) return '';
  const bars = statusBars(d), [mood, say, poops] = petMood(bars), seg = v => Array.from({ length: 10 }, (_, i) => `<i class="${v != null && i < Math.round(v * 10) ? 'on' : ''}"></i>`).join('');
  return `<div class="card pxstatus mood-${mood}"><div class="pxcatbox">${petEgg(mood, poops)}<span class="pxsay nopx">${esc(say)}</span></div>
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
