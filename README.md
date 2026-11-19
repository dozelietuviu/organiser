# Organiser

ESTERA's goal-focused personal app. It runs from the phone's home screen, works offline and costs nothing to run.
All personal data stays on the phone (localStorage), with a backup under Settings.

**Phase 1 (food):** Today screen, food log (5 meal slots, macros + fibre + water), fullness taps that teach the app a comfortable portion size, warnings for portion size, long gaps and low protein, meal cards with stars and Jonas portions, recipes, week plan with pantry-based suggestions, pantry with amounts and freezer alerts, and a shopping list by shop with an estimated total.

Phases 2 (Train, Body: weight, cycle, vitamins, habits) and 3 (Goals, wins, calendar, Samsung Health import) come next.

- `data/foods.json`: the starter food list plus Lidl prices, kept up to date by Claude from monthly receipts. The app merges it in on start.
- No build step: plain HTML, CSS and JavaScript, hosted on GitHub Pages.
