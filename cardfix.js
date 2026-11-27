/* Organiser: one-time clean-up of older meal cards (Nov 2026).
   Older cards kept the whole recipe in the note ("about it · step step step"). This splits it into a
   short note + a numbered Method, fixes small things (capitals), and adds Make-ahead prep jobs to the
   cards that need prep on Sunday. Runs once per card version; edits you made later are never touched.
   Loaded before app.js; only functions here. */
'use strict';

// imperative verbs that start a new recipe step in the old run-on notes
const STEP_VERBS = 'Roast|Brown|Top|Drizzle|Season|Boil|Sauté|Saute|Simmer|Dice|Stir|Coat|Pan-fry|Cut|Put|Mix|Cover|Divide|Cook|Remove|Chop|Add|Finely|Whisk|Chill|Seed|Weigh|Scatter|Drain|Melt|Rub|Marinate|Toss|Thread|Assemble|Trim|Nestle|Serve|Shred|Bake|Spoon|Fold|Warm|Grill|Slice|Peel|Pour|Heat|Preheat|Place|Layer|Bring|Return|Garnish|Combine|Blend|Line|Roll|Brush|Air-fry|Steam|Mash|Microwave|Let|Transfer|Sprinkle|Squeeze|Finish|Shape|Lay|Arrange|Fill|Wrap|Grate|Flake|Halve|Squash|Open|Close|Run|Set|Leave|Plate|Switch|Keep|Spread|Pack|Store|Stuff|Crack|Beat|Knead|Rest|Flip|Turn|Reduce|Season|Taste|Adjust|Mix|Soak|Rinse|Pat|Score|Glaze|Baste|Deglaze|Puree|Purée|Mince|Zest|Juice|Toast|Fry|Sear|Bring';
const stepSplit = t => t.split(new RegExp(`(?<=[a-z0-9)%.,])\\s+(?=(?:${STEP_VERBS})(?=[\\s,]))`)).map(s => s.trim().replace(/[.\s]+$/, '')).filter(Boolean);
// make-ahead jobs for cards that need prep (matched by card name; Sunday = 6)
const CARD_AHEAD = [
  [/savoury buckwheat breakfast/i, 'Korean soy marinated eggs + cook buckwheat (bulk)'],
  [/sweet buckwheat berry/i, 'Cook buckwheat for the week'],
  [/chicken tzatziki snack box/i, 'Cook & slice chicken, pack 3 tzatziki boxes'],
  [/egg & ham protein box/i, 'Boil 6-8 eggs (9 min), peel'],
  [/greek yoghurt honey raspberry jar/i, 'Make 3-4 yoghurt jars'],
  [/tuna onigiri/i, 'Make 4-6 onigiri'],
  [/chipotle chicken loaded sweet potatoes/i, 'Quick-pickle red onions'],
  [/beef bone borscht/i, 'Make the beef bone broth (2-3 h)'],
];
function fixCardsV1() {
  if (S.cardFix >= 1) return; let n = 0;
  for (const c of S.cards || []) {
    // "about · steps" in the note -> note + numbered method
    if (!c.method && /\s·\s/.test(c.note || '')) {
      const i = c.note.indexOf(' · '), about = c.note.slice(0, i).trim(), steps = stepSplit(c.note.slice(i + 3));
      if (steps.length) { c.note = about; c.method = steps.map((s, k) => `${k + 1}. ${s}.`).join('\n'); n++; }
    }
    if (c.name && c.name[0] !== c.name[0].toUpperCase()) { c.name = c.name[0].toUpperCase() + c.name.slice(1); n++; }
    const a = CARD_AHEAD.find(([re]) => re.test(c.name || ''));
    if (a && !c.ahead) { c.ahead = a[1]; c.aheadDay = 6; n++; }
    if (c.prep === 0) delete c.prep;
  }
  S.cardFix = 1; if (n) save();
}
