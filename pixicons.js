/* Organiser: pixel icons. Small hand-made pixel art replaces the emoji (text only, never inside
   inputs) and draws the bottom bar. Letters: o = outline (follows day/night ink), the rest fixed colours.
   Loaded before app.js; only data + functions here. */
'use strict';
const PX_COL = { k: '#16121f', a: '#5fe0d0', y: '#ffd166', r: '#ff5c7a', p: '#ff9fcb', w: '#ffffff', b: '#5ba8ff', l: '#b9e6ff', g: '#5fcf7a', n: '#a46a3c', s: '#b3b3cc', d: '#3a3550', v: '#9b86f2', z: '#8b78f0' };
const PX_ICONS = {
"🍓": "....g.....|..ggggg...|.orggggro.|orryrryrro|orrrrrrrro|oryrryrro.|.orrrrrro.|.oryrryro.|..orrrro..|...oooo...",
"😶": "..oooooo..|.oyyyyyyo.|oyyyyyyyyo|oyyoyyoyyo|oyyoyyoyyo|oyyyyyyyyo|oyyyyyyyyo|oyyooooyyo|.oyyyyyyo.|..oooooo..",
"🏆": ".oooooooo.|oyoyyyyoyo|oyoyyyyoyo|oyoyyyyyyo|.ooyyyyoo.|..oyyyyo..|...oyyo...|....oo....|..oyyyyo..|..oooooo..",
"✨": "....y.....|....y.....|...yyy....|yyyyyyyy..|...yyy....|....y...y.|....y..yyy|.y......y.|yyy.......|.y........",
"🔥": "....o.....|...oro....|...oro.o..|..orrooro.|.orryrrro.|.oryyyrro.|.oryyyyro.|.orryyyro.|..orrrro..|...oooo...",
"🌙": "...ooo....|..oyyo....|.oyyo.....|.oyo......|oyyo......|oyyo......|oyyyo....o|.oyyyoooyo|..oyyyyyo.|...ooooo..",
"🖤": "..........|.oo...oo..|oddo.oddo.|oddddddddo|oddddddddo|.oddddddo.|..oddddo..|...oddo...|....oo....|..........",
"🤍": "..........|.oo...oo..|owwo.owwo.|owwwwwwwwo|owwwwwwwwo|.owwwwwwo.|..owwwwo..|...owwo...|....oo....|..........",
"🔪": "........ss|.......sws|......sws.|.....sws..|....sws...|...sws....|..ono.....|.ono......|ono.......|oo........",
"📷": "..........|...ooo....|.oooooooo.|.ossooosso|.osowwwoso|.osowbwoso|.osowwwoso|.ossooosso|.oooooooo.|..........",
"📦": "..........|.oooooooo.|onnnnnnnno|oooooooooo|onnnyynnno|onnnyynnno|onnnnnnnno|onnnnnnnno|oooooooooo|..........",
"🧊": "..........|..oooooo..|.ollllllo.|olwwllllo.|olwlllllo.|ollllllllo|ollllllllo|.olllllo..|..oooooo..|..........",
"🍲": "....ss....|..ss..ss..|..........|oooooooooo|orrrrrrrro|orrrrrrrro|.orrrrrro.|.orrrrrro.|..oooooo..|..........",
"😴": "......zzz.|..oooo..z.|.oyyyyozzz|oyyyyyyo..|oyoyyyoyo.|oyyyyyyyo.|oyyyooyyo.|.oyyyyyo..|..ooooo...|..........",
"🩸": "....o.....|....o.....|...oro....|...oro....|..orrro...|.orrrrro..|.orwrrro..|.orrrrro..|..orrro...|...ooo....",
"💧": "....o.....|....o.....|...obo....|...obo....|..obbbo...|.obbbbbo..|.obwbbbo..|.obbbbbo..|..obbbo...|...ooo....",
"💪": "..........|...oo.....|..oyyo....|..oyo.....|..oyo..oo.|.oyyooyyo.|oyyyyyyyyo|oyyyyyyyyo|.oyyyyyyo.|..oooooo..",
"🧀": "..........|......oo..|....ooyyo.|..ooyyyyyo|.oyyyyyyyo|oooooooooo|oyynyyyyyo|oyyyyynyyo|oyyyyyyyyo|oooooooooo",
"🍱": "..........|oooooooooo|owwwwogggo|owwwwogggo|owwwwogggo|oooooooooo|orrroyyyyo|orrroyyyyo|oooooooooo|..........",
"☀": "....y.....|.y..y..y..|..yyyyy...|.yyyyyyy..|yyyyyyyyyy|.yyyyyyy..|..yyyyy...|.y..y..y..|....y.....|..........",
"📅": "..o...o...|oooooooooo|orrrrrrrro|oooooooooo|owowowowoo|owwwwwwwwo|owowowowoo|owwwwwwwwo|oooooooooo|..........",
"💄": "....oo....|...orro...|...orro...|...orro...|..oooooo..|..oyyyyo..|..oyyyyo..|..osssso..|..osssso..|..oooooo..",
"🍩": "....g.....|..ggggg...|.orggggro.|orryrryrro|orrrrrrrro|oryrryrro.|.orrrrrro.|.oryrryro.|..orrrro..|...oooo...",
"🍽": "..........|..oooooo..|.owwwwwwo.|owwoooowwo|owowwwwowo|owowwwwowo|owwoooowwo|.owwwwwwo.|..oooooo..|..........",
"⚠": "....oo....|...oyyo...|...oyyo...|..oyooyo..|..oyooyo..|.oyyooyyo.|.oyyyyyyo.|oyyyooyyyo|oyyyyyyyyo|oooooooooo",
"🚨": ".y..r..y..|..y.r.y...|...ooo....|..orrro...|.orwrrro..|.orwrrro..|.orrrrro..|oooooooooo|osssssssso|oooooooooo",
"💊": "..oooooo..|.oaaaaaao.|oaaaaaaaao|oaaawwaaao|oawwwwwwao|oawwwwwwao|oaaawwaaao|oaaaaaaaao|.oaaaaaao.|..oooooo..",
"☕": "..s..s....|...s..s...|..s..s....|oooooooo..|owwwwwwooo|owwwwwwo.o|owwwwwwooo|.owwwwo...|..oooo....|oooooooo..",
"🍷": "oooooooo..|o......o..|orrrrrro..|orrrrrro..|.orrrro...|..oooo....|...oo.....|...oo.....|...oo.....|.oooooo...",
"🧚": "....oo....|...oyyo...|...oppo...|ll.oppo.ll|lllo..olll|.lloppoll.|...oppo...|..oppppo..|..oooooo..|..........",
"🔔": "....oo....|...oyyo...|..oyyyyo..|..oyyyyo..|.oyyyyyyo.|.oyyyyyyo.|oyyyyyyyyo|oooooooooo|....oo....|..........",
"📈": "oo........|o.......g.|o......gg.|o.....g...|o.g..g....|o.gggg....|og........|o.........|oooooooooo|..........",
"⏸": "..........|.ooo..ooo.|.obo..obo.|.obo..obo.|.obo..obo.|.obo..obo.|.obo..obo.|.obo..obo.|.ooo..ooo.|..........",
"🍙": "....oo....|...owwo...|..owwwwo..|..owwwwo..|.owwwwwwo.|.owwwwwwo.|owwddddwwo|owwddddwwo|oooddddooo|..........",
"⚡": ".....ooo..|....oyyo..|...oyyo...|..oyyo....|.oyyyyyo..|..ooyyo...|...oyo....|..oyo.....|.oo.......|..........",
"❄": "....l.....|..l.l.l...|...lll....|lllllllll.|...lll....|..l.l.l...|....l.....|..........|..........|..........",
"🗄": "oooooooooo|osssssssso|osssoossso|osssssssso|oooooooooo|osssssssso|osssoossso|osssssssso|oooooooooo|.o......o.",
"📖": "..........|ooooo.oooo|owwwwowwwo|owwwwowwwo|owwwwowwwo|owoowowoow|owwwwowwwo|owwwwowwwo|ooooooooo.|..........",
"⏱": "...ooo....|....o.....|..ooooo...|.owwwwwo..|owwwowwwo.|owwwowwwo.|owwwoowwo.|.owwwwwo..|..ooooo...|..........",
"🌅": "..........|....y.....|.y.yyy.y..|..yyyyy...|.yyyyyyy..|yyyyyyyyy.|oooooooooo|bbbbbbbbbb|.b.b.b.b.b|..........",
"🐍": "......ooo.|.....oggo.|.....ogro.|.....oggo.|..oooogo..|.ogggggo..|oggoooo...|oggggggo..|.ooooggo..|.....oo...",
"🌑": "..oooooo..|.oddddddo.|oddddddddo|oddddddddo|oddddddddo|oddddddddo|oddddddddo|oddddddddo|.oddddddo.|..oooooo..",
"🎯": "..oooooo..|.orrrrrro.|orwwwwwwro|orwrrrrwro|orwrwwrwro|orwrwwrwro|orwrrrrwro|orwwwwwwro|.orrrrrro.|..oooooo..",
"🥣": "..........|..n..n....|...n..n...|oooooooooo|owwwwwwwwo|.owwwwwwo.|.owwwwwwo.|..owwwwo..|...oooo...|..........",
"💇": "o.......o.|.o.....o..|..o...o...|...o.o....|....o.....|...o.o....|.ooo.ooo..|o.o...o.o.|o.o...o.o.|.o.....o..",
"🌤": ".y........|yyy.y.....|.yyyyy....|yyyyyyy...|.yyoooo...|.yowwwwoo.|.owwwwwwwo|owwwwwwwwo|oooooooooo|..........",
"📋": "...oooo...|.oooyyooo.|.owwwwwwo.|.owoooowo.|.owwwwwwo.|.owoooowo.|.owwwwwwo.|.owooowwo.|.owwwwwwo.|.oooooooo.",
"🚭": "..oooooo..|.or....ro.|or.r....ro|o..r.....o|osssssryyo|o.....r..o|o......r.o|or......ro|.or....ro.|..oooooo..",
"👟": "..........|..........|.ooo......|.owwo.....|.owwwoo...|.owwwwwoo.|owwbbbwwwo|oooooooooo|.s.s.s.s..|..........",
"🎉": "y.....p..b|..b......y|.....y....|o...p.....|oo.....b..|oyo.......|oyyo..p...|oyyyo.....|oyyyyo....|oooooo....",
"📏": "oooooooooo|oyoyoyoyoo|oyoyoyoyyo|oyyyyyyyyo|oooooooooo|..........|..........|..........|..........|..........",
"⏰": "oo....oo..|o.oooo.o..|.owwwwo...|owwowwwo..|owwowwwo..|owwooowo..|owwwwwwo..|.owwwwo...|..oooo....|.o....o...",
"🔍": "..oooo....|.owwwwo...|owwlwwwo..|owlwwwwo..|owwwwwwo..|.owwwwo...|..ooooso..|......sso.|.......sso|........so",
"🔎": "..oooo....|.owwwwo...|owwlwwwo..|owlwwwwo..|owwwwwwo..|.owwwwo...|..ooooso..|......sso.|.......sso|........so",
"🍴": "o.o.o.....|o.o.o.....|o.o.o.....|ooooo.....|.ooo......|..o.......|..o.......|..o.......|..o.......|..o.......",
"☁": "..........|...ooo....|..owwwo...|.owwwwwoo.|owwwwwwwwo|owwwwwwwwo|.oooooooo.|..........|..........|..........",
"🌲": "....o.....|...ogo....|..oggo....|..ogggo...|.oggggo...|.ogggggo..|oggggggo..|oooooooo..|...nn.....|...nn.....",
"🌕": "..oooooo..|.oyyyyyyo.|oyyyyysyyo|oyysyyyyyo|oyyyyyyyyo|oyyyysyyyo|oysyyyyyyo|oyyyyyyyyo|.oyyyyyyo.|..oooooo..",
"🌊": "..........|...ooo....|..obbbo...|.obbwwbo..|obbo.obo..|obbbo.....|obbbbooooo|bbbbbbbbbb|.b..b..b..|..........",
"🔮": "...oooo...|..ovvvvo..|.ovwvvvvo.|.ovvvvvvo.|.ovvvvvvo.|..ovvvvo..|...oooo...|..onnnno..|.onnnnnno.|.oooooooo.",
"🍀": "..gg.gg...|.gggggggg.|.gggggggg.|..gggggg..|.gggggggg.|.gggggggg.|..gg.gg...|.....n....|....n.....|..........",
"👍": "....oo....|...oyo....|...oyo....|..oyyoooo.|ooyyyyyyyo|oyoyyyyyo.|oyoyyyyyyo|oyoyyyyyo.|ooooooooo.|..........",
"🧙": "....o.....|...ovo....|..ovvvo...|..ovyvo...|.ovvvvvo..|oooooooooo|..oyyyyo..|..oyoyoo..|..owwwwo..|...owwo...",
"🎀": "..........|oo......oo|oppo..oppo|opppoopppo|oppprrpppo|opppoopppo|oppo..oppo|oo.o..o.oo|...o..o...|..........",
"💋": "..........|..........|.oo....oo.|orrooorrro|orrrrrrrro|oooooooooo|orrrrrrrro|.orrrrrro.|..oooooo..|..........",
"🧜": "...ooo....|..onnno...|..oyyyo...|..oyyyo...|...opo....|..oppppo..|...ollo...|...olllo..|..ollllo..|.oo...oo..",
"🗡": "........o.|.......oso|......oso.|.....oso..|....oso...|.o.oso....|..ooo.....|..ono.....|.ono......|oo........",
"📒": ".oooooooo.|oyyyyyyyyo|oywwwwwwyo|oyyyyyyyyo|oywwwwwwyo|oyyyyyyyyo|oywwwwwwyo|oyyyyyyyyo|.oooooooo.|..........",
"🌾": "....y.....|...yyy....|....y.....|...yyy....|....y.....|...yyy....|....g.....|....g.....|....g.....|..........",
"🎲": "..........|.oooooooo.|owwwwwwwwo|owowwwwowo|owwwwwwwwo|owwwowwwwo|owwwwwwwwo|owowwwwowo|owwwwwwwwo|.oooooooo.",
"😣": "..oooooo..|.oyyyyyyo.|oyoyyyyoyo|oyyoyyoyyo|oyoyyyyoyo|oyyyyyyyyo|oyyoooyyyo|oyoyyyoyyo|.oyyyyyyo.|..oooooo..",
"🚱": "..oooooo..|.or..b.ro.|or.r.b..ro|o..robo..o|o..obrbo.o|o..obbro.o|o...ooo.ro|or......ro|.or....ro.|..oooooo.."
};
const PX_TABS = {"today": "....oo......|...o..o.....|.oo.oo.oo...|o..o..o..o..|o...oo...o..|.oooooooo...|o...oo...o..|o..o..o..o..|.oo.oo.oo...|...o..o.....|....oo......|............", "food": ".......oo...|......o.....|.....o.o....|....o...o...|...o....o...|.oo....oo...|o..o..o..o..|o..o..o..o..|o..o..o..o..|.oo....oo...|............|............", "home": ".....oo.....|....o..o....|...o....o...|..o......o..|.oooooooooo.|..o......o..|..o.o..o.o..|..o..oo..o..|..o......o..|..o.oo...o..|..oooooooo..|............", "train": "............|............|oo......oo..|oo......oo..|oo......oo..|oooooooooo..|oo......oo..|oo......oo..|oo......oo..|............|............|............", "body": "..o..o..o...|..oo.o.oo...|..o.ooo.o...|..o.....o...|...o...o....|....ooo.....|.....o......|.oo..o......|..oo.o..oo..|....oo.oo...|.....oo.....|............", "goals": ".....o......|....o.o.....|....o.o.....|oooo...oooo.|.o.......o..|..o.....o...|..o.....o...|.o...o...o..|.o..o.o..o..|o..o...o..o.|ooo.....ooo.|............"};
PX_TABS.catface = '.d........d.|dpd......dpd|dppd....dppd|dddddddddddd|dddddddddddd|ddyyddddyydd|ddykddddykdd|dddddppddddd|lddddddddddd|.dddddddddd.|..dddddddd..|............';
PX_TABS.catcry1 = '..d........d..|.dpd......dpd.|.dppd....dppd.|.dddddddddddd.|.dwwwddddwwwd.|.ddbddddddbdd.|.ddbdddppdbdd.|.ddbddddddbdd.|.ddbdwwwwdbdd.|..dbdwddwdbd..|...b.dddd.b...|...b......b...|..............|..b........b..';
PX_TABS.catcry2 = '..d........d..|.dpd......dpd.|.dppd....dppd.|.dddddddddddd.|.dwwwddddwwwd.|.ddbddddddbdd.|.ddbdddppdbdd.|.ddbddddddbdd.|.ddbdwwwwdbdd.|..dbdwddwdbd..|...b.dddd.b...|..b........b..|...b......b...|..............';
const pxCache = {};
function pxSvg(art, cls = 'pxi') {
  const key = cls + art; if (pxCache[key]) return pxCache[key];
  const rows = art.split('|'), w = rows[0].length, paths = {};
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.') (paths[c] ||= []).push(`M${x} ${y}h1v1h-1z`); }));
  const svg = `<svg class="${cls}" viewBox="0 0 ${w} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true">${Object.entries(paths).map(([c, d]) => c === 'o' ? `<path class="pxo" d="${d.join('')}"/>` : `<path fill="${PX_COL[c] || '#888'}" d="${d.join('')}"/>`).join('')}</svg>`;
  return (pxCache[key] = svg);
}
const PX_RE = new RegExp('(' + Object.keys(PX_ICONS).map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\uFE0F?', 'gu');
// swap emoji in text for pixel icons (skips inputs, textareas, selects, svg and anything marked .nopx)
function pxEmoji(root) {
  if (!root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => {
    const p = n.parentElement; if (!p || p.closest('input,textarea,select,option,svg,script,style,.nopx,title')) return NodeFilter.FILTER_REJECT;
    PX_RE.lastIndex = 0; return PX_RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; } });
  const hits = []; while (w.nextNode()) hits.push(w.currentNode);
  for (const n of hits) {
    const span = document.createElement('span'); span.className = 'pxwrap';
    span.innerHTML = n.nodeValue.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]).replace(PX_RE, (m, e) => pxSvg(PX_ICONS[e]));
    n.replaceWith(...span.childNodes);
  }
}
function pxTabs() { document.querySelectorAll('.tabs button[data-tab]').forEach(b => { const a = PX_TABS[b.dataset.tab], s = b.querySelector('span'); if (a && s && !s.dataset.px) { s.innerHTML = pxSvg(a, 'pxtab').replace('class="pxo"', 'fill="currentColor"'); s.dataset.px = 1; } }); }
