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
    if (!S.pantry[f.id]) { S.pantry[f.id] = { place: f.place || guessPlace(f), qty: 0, have: false }; added++; }
  }
  if (added) save();
  return added;
}
