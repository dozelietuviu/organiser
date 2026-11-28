/* Organiser: keeps the pantry in step with the meal cards.
   - Every ingredient used on a card has a pantry line. New ones start as "out" (you don't have it yet).
   - Plain names ("Chicken thighs", "Olive oil", "Mint"): no brands, sizes or shop wording.
   - Counted the way you buy it: bottles, loaves, tubs, cans, bags, bunches. Meat and fish stay in grams.
   Loaded before app.js; only functions here. Called on start and whenever the Pantry opens. */
'use strict';

// "Bonne Maman Confiture extra fraises 370g" -> "Confiture extra fraises"; "Chicken fillet XXL, raw (Vištienos filė)" -> "Chicken fillet"
function plainName(f) {
  let n = String(f.name || '').replace(/\([^)]*\)/g, ' ');
  for (const b of String(f.brand || '').split(/[,&]/)) if (b.trim().length > 2) n = n.replace(new RegExp(b.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
  n = n.replace(/\d+[.,]?\d*\s*(g|kg|ml|l|cl|%|x|pcs?|vnt)\b/gi, ' ').replace(/\b(raw|fresh|xxl|xl|bio|organic|premium|classic|original|lidl|iki|maxima|pilos|rimi|\d+)\b/gi, ' ');
  n = n.split(',')[0].replace(/[^\p{L}\s&'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : f.name;
}
// [pattern on the name, unit, grams per unit (0 = use the food's pack size), fallback grams]
const BUY_UNITS = [
  [/\b(beans|chickpea|coconut milk|canned|tinned|chopped tomato|sweetcorn|corn|tuna)\b/, 'can', 0, 400], [/\bpassata\b/, 'bottle', 0, 500],
  [/\b(honey|jam|peanut butter|pesto|mustard|gochujang|miso|tahini)/, 'jar', 0, 300],
  [/\b(chicken|beef|pork|mince|turkey|lamb|veal|steak|salmon|cod|fish|tuna steak|shrimp|prawn|bacon|ham|sausage)/, 'g', 1],
  [/\bmilk\b/, 'L', 1000], [/\b(oil|vinegar|soy|sauce|syrup|juice|kefir|ketchup|mayo|dressing)/, 'bottle', 0, 500],
  [/\b(bread|loaf|rye)\b/, 'loaf', 0, 500], [/\b(wrap|tortilla|pita)/, 'pack', 0, 370],
  [/\b(yog|yogh|skyr|cottage|curd|varšk|sour cream|cream cheese|hummus|tzatziki|quark|ricotta)/, 'tub', 0, 400],
  [/\bbutter\b/, 'block', 0, 200], [/\b(cheese|parmesan|mozzarella|feta|halloumi|cheddar)/, 'pack', 0, 200],
  [/\b(mint|basil|coriander|cilantro|parsley|dill|chives?|fresh thyme|fresh rosemary|spring onion)/, 'bunch', 30],
  [/\b(paprika|cumin|oregano|cinnamon|turmeric|curry|spice|seasoning|salt|chilli flakes|black pepper|garlic powder|nutmeg|thyme|rosemary)/, 'jar', 0, 50],
  [/\bfrozen\b/, 'bag', 0, 450],
  [/\b(rice|pasta|spaghetti|noodle|flour|oat|buckwheat|lentil|quinoa|sugar|couscous|bulgur|barley)/, 'bag', 0, 1000],
  [/\b(nut|seed|almond|walnut|cashew|chia|raisin|cranberr)/, 'bag', 0, 200],
  [/\begg/, 'egg', 60], [/\bgarlic\b/, 'bulb', 50], [/\bonion/, 'onion', 150], [/\b(lemon|lime)/, 'pc', 100], [/\bbanana/, 'banana', 120],
  [/\bapple/, 'pc', 180], [/\bcarrot/, 'carrot', 80], [/\bcucumber/, 'cucumber', 300], [/\b(bell )?pepper\b/, 'pepper', 150], [/\bavocado/, 'avocado', 170],
  [/\bginger\b/, 'root', 100], [/\b(potato|sweet potato)/, 'kg', 1000],
  [/\b(spinach|lettuce|salad|rocket|arugula|kale)/, 'bag', 0, 150], [/\b(berr|raspberr|blueberr|strawberr)/, 'box', 0, 250], [/\bmushroom/, 'box', 0, 250],
];
function guessBuyUnit(f) {
  if (f.su || (f.unit && f.unitG)) return; // already counted in a unit
  const n = String(f.sname || f.name || '').toLowerCase();
  for (const [re, su, g, fb] of BUY_UNITS) if (re.test(n)) { f.su = su; f.suG = g || f.packG || fb; return; }
  if (f.packG) { f.su = 'pack'; f.suG = f.packG; }
}
const guessPlace = f => { const n = String(f.sname || f.name || '').toLowerCase();
  return /frozen/.test(n) ? 'Freezer' : /\b(chicken|beef|pork|mince|fish|salmon|milk|yog|cheese|cottage|cream|egg|butter|ham|kefir|skyr|tofu|herb|mint|basil|coriander|parsley|dill)/.test(n) ? 'Fridge' : 'Cupboard'; };
// every card ingredient gets a pantry line; new ones start as out of stock
function cardsIntoPantry() {
  let added = 0;
  for (const c of S.cards || []) for (const i of c.items || []) {
    const f = foodById(i.foodId); if (!f || f.kind === 'item' || f.hidden) continue;
    if (!f.sname) f.sname = plainName(f);
    guessBuyUnit(f);
    if (!S.pantry[f.id] && !f.stockAs && !joinGroup(f)) { S.pantry[f.id] = { place: f.place || guessPlace(f), qty: 0, have: false }; added++; }
  }
  if (added) save();
  return added;
}

// ---- generic pantry ----
// One pantry line per kind of food: "Milk" covers milk 2.5% and 3.2%, "Cottage cheese" covers plain and grains,
// "Greek yoghurt" covers 2% and 10%. The recipes keep their exact food (for the nutrition); the stock is shared.
// f.stockAs = the id of the food that holds the shared pantry line. Prepped and cooked foods stay separate.
// Something specific you want kept apart: add it under Shop › Other / one-off.
function genericName(f) {
  let n = String(f.sname || plainName(f)).replace(/\([^)]*\)/g, ' ').replace(/\d+[.,]?\d*\s*%/g, ' ')
    .replace(/\b(light|lite|grains|low[- ]fat|full[- ]fat|semi[- ]skimmed|skimmed|lean|drained|in oil|in water|in brine|natural|plain|extra)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : sn(f);
}
const genKey = f => genericName(f).toLowerCase().replace(/s\b/g, '');
const canGroup = f => !!f && f.kind !== 'item' && f.kind !== 'recipe' && !f.prep && !f.buyAs;
const pid = id => { const f = foodById(id); return f && f.stockAs && foodById(f.stockAs) ? f.stockAs : id; };
// join a food to an existing pantry line of the same kind (returns true if it did)
function joinGroup(f) {
  if (!canGroup(f) || f.stockAs || f.ownLine) return false; const k = genKey(f);
  const host = Object.keys(S.pantry).map(foodById).find(h => h && h.id !== f.id && !h.stockAs && canGroup(h) && genKey(h) === k);
  if (!host) return false;
  f.stockAs = host.id; host.gname = genericName(host);
  const mine = S.pantry[f.id]; if (mine) { const hp = S.pantry[host.id];
    if (mine.have !== false && mine.qty) { hp.qty = r1((hp.have === false ? 0 : hp.qty || 0) + mine.qty); hp.have = true; } delete S.pantry[f.id]; }
  return true;
}
function pantryGenericV1() {
  if (S.pantryGeneric) return; S.pantryGeneric = 1;
  // the line with stock (or the most used one) becomes the host
  const used = id => (S.cards || []).filter(c => c.items.some(i => i.foodId === id)).length;
  const ids = Object.keys(S.pantry).filter(id => canGroup(foodById(id)))
    .sort((a, b) => (pantryQty(b) > 0) - (pantryQty(a) > 0) || used(b) - used(a));
  for (const id of ids) { const f = foodById(id); if (f && S.pantry[id]) joinGroup(f); }
  // cooked versions get ", cooked" so they don't look like a second "Buckwheat"
  for (const f of S.foods) if (f.buyAs && !/cooked/i.test(sn(f))) f.gname = `${genericName(f)}, cooked`;
  save();
}
