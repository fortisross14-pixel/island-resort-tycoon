# Balance (Pass 2)

Balance is checked with a headless playtest harness (`src/sim/harness.ts`). It plays the real
simulation day by day with one of two players:

- **starter**: builds the GDD's day-1 resort (a spine, 4 Basic Rooms, a Buffet, a Snack Bar) and never touches it again;
- **bot**: a simple scripted manager that adds rooms when tomorrow's ferry won't fit, adds a mix of venues, researches the cheapest topic, adds floors, accepts the investor and buys land when space runs out.

`npm run playtest` prints a day-by-day table plus payback per building and the most common review complaints and praise
(`DAYS=30 SEEDS=1,2,3 STRATEGY=bot BRIEF=1 npm run playtest`). `tests/balance.test.ts` turns the targets below into tests.

## Targets and results

| GDD target | Result after Pass 2 |
|---|---|
| Day 1: enough coins for 4 rooms, a snack bar, a buffet and paths, "with a little left over" | 13,000 start; ~1,700 left |
| First profitable day: day 2 | Day 1 is slightly positive, day 2 clearly |
| First land plot affordable around day 5–6 | Day 4–5 for the starter resort |
| Mid-game: 45% rooms / 55% spending; late: 35% / 65% | ~50% spending by day 15; 62–65% by day 30 |
| A well-placed building pays back in 4–8 days, a badly placed one in 15+ | Rooms 8–10 days; Buffet, restaurants and Snack Bars 3–5; shore and fun venues 20+ when far from rooms |
| Medals: casual players finish, invested players master it | Bot: bronze ~day 5, silver days 15–20, gold around day 30 (1–2 of 3 seeds); a resort that never grows only gets bronze |
| Research shouldn't run out early | Tier 1 in the first week, tier 2 through days 8–22 |

## What changed

- **Money:** start 13,000 (was 15,000). Basic Rooms 1,500, Standard 2,800, Garden Bungalows 4,500. Room rates 70 / 130 / 220 / 360 by tier; guest budgets and daily spending about 1.5× higher. Snack 14, Buffet 26, Gift Shop 12, Boutique 40.
- **Land:** plots from 5,000 (was 3,000).
- **Ferry:** size now follows the star rating more than the day: `(3 + 0.4 × day) × (0.4 + 0.3 × stars)`, capped at 18.
- **Prices:** at or below a guest's price tolerance they nearly always buy (Fair is fair for every type); above it the chance falls quickly. Before, a backpacker balked at Fair one time in six, which made "too pricey" the top complaint.
- **Taste:** guests mostly skip venues two quality classes above their tier, and only feel a venue is "a bit basic" when it is two classes below them (couples are fine at the Buffet).
- **Fun:** strolls are a weaker fallback, so fun venues get custom.
- **Reviews:** only half of the parties who give up write one.
- **Research:** topic costs about 3× higher (tier 1: 12–20; tier 2: 40–65; Nightclub 100).
- **Medals (Driftwood Beginnings):** bronze 30 guests + ★2.8; silver 120 guests + ★3.5 + 6 topics; gold 350 guests + ★4.2 + 40,000 profit over 7 days + 3 plots.

## Known soft spots

- Fun venues (Beach Bar, Gift Shop, Gym, Kids' Club) earn little unless they're close to the rooms; the Pool is free by design.
- The bot isn't clever about room matching, so its top complaints ("room wasn't what we hoped for", "overpriced") overstate what a human player will see.

## Pass 4: the four ratings

The overall star is now a weighted mix of Lodging, Amenities, Activities and Decoration, so a
resort with no decor and no activities rates lower than before. Two balance targets moved on
purpose: a growing resort (the harness bot, which now adds a little Hawaiian decor and repairs
anything below 65%) ends 30 months above ★3.15 instead of ★3.3, and silver in Driftwood
Beginnings arrives within the full 30 months rather than 25. A new test checks that the four
ratings pull apart: amenities lead, activities and decoration trail. Missions get rebalanced
around the four ratings in Pass 4 step 5.
