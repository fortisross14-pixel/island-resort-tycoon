# Missions and archipelagos

How the campaign is put together (Pass 4). Mission data lives in `src/sim/scenario.ts`,
archipelagos in `src/sim/archipelago.ts`, islands in `src/sim/islands.ts`, unlocks and
experience in `src/sim/profile.ts`.

## Structure

- An **archipelago** has a theme and 8–10 missions spread over a few islands. The first is
  **the Caribbean** (beaches and food). Later ones each bring their own decor and activities,
  nothing drastic: **Hawaii** (volcanoes and land excursions), **the Balearics** (nightlife),
  **Thailand** …
- Every mission has **bronze, silver and gold**, each with a short list of concrete goals. A
  gold can add a **deadline** ("within 7 months"); after it passes, that medal can't be won.
- **Points** open islands: the best medal on each mission counts bronze 1, silver 2, gold 3.
- **Experience** (XP) comes from medals (first bronze 30, silver 50, gold 80; repeats 5, 8, 12)
  and buys **research** on the home screen, which applies to every resort.
- A mission can **need research first** (it stays locked until the topic is bought), provide a
  **kit** (buildings you can use there without researching them), or start with an existing
  **prebuilt** resort.
- The **sandbox** opens once both beginner missions have a medal.

## The Caribbean

| Island | Opens at | Mission | Level | Bronze | Silver | Gold |
|---|---|---|---|---|---|---|
| Coconut Key (tiny) | start | Open for Business | Beginner | 2 Basic Rooms, a Beach Bar (kit), host 15 guests | 12,000 revenue | 12,000 revenue within 7 months |
| Coconut Key | start | Island Kitchen | Beginner | 2,500 from food | 6,000 from food | 6,000 from food within 10 months |
| Twin Palms (lagoon) | 3 points | Lagoon Days | Intermediate | Trail Hut, Activities ★3.0 | Activities ★3.6, 150 guests | Activities ★4.2, ★3.8, Decoration ★3.4 |
| Twin Palms | 3 points | Family Cove (needs Kids' Club) | Intermediate | 10 families, a Kids' Club | 40 families, ★3.6, a Pool | 100 families, ★4.2, 35,000 profit over 7 months |
| Twin Palms | 3 points | Couples' Hideaway (needs Standard Rooms) | Intermediate | 25 couples, Lodging ★3.2 | 70 couples, Lodging ★3.7 | Lodging ★4.2, Decoration ★3.8, ★4.0 |
| Far Sands (long beach far from the dock) | 3 points | The Long Beach | Intermediate | 2 Beach Bars (kit), 80 guests | Decoration ★3.4, 30,000 revenue | Decoration ★4.0, 30,000 revenue within 20 months |
| Far Sands | 3 points | Sun & Sea (needs Excursions) | Intermediate | 1,500 from activities | 5,000 from activities, Activities ★3.6 | 12,000 from activities, Activities ★4.2, ★3.9 |
| Old Harbour (run-down resort) | 10 points | New Paint | Advanced | Lodging ★3.5 | Lodging ★3.9, ★3.7 | Lodging ★4.3 within 24 months, ★4.1 |
| Old Harbour | 10 points | Jewel of the Caribbean (needs Themed Restaurants) | Advanced | All four ratings ★3.0 | All four ★3.6 | All four ★4.1, ★4.3 |

Coconut Key's start plot fits one big kitchen (a Buffet) next to a Snack Bar; restaurants need
Themed Restaurants research, so Island Kitchen is about getting guests in first and then
feeding them well. A bronze and a silver on the two beginner missions (3 points) open Twin
Palms and Far Sands; Old Harbour needs 10 points, so a couple of intermediate medals as well.

## Difficulty, checked by the playtest bot

`tests/balance.test.ts` plays each mission with the harness bot: it adds rooms, food and fun as
demand grows, a little decor and repairs, and never runs activities. It stands in for an
average player who isn't trying hard:

- **Beginner:** silver within about 8–13 months, gold never (the deadlines need faster play).
- **Intermediate:** bronze on the missions that don't need activities, never gold; nothing on
  Lagoon Days or Sun & Sea, which need planned activities.
- **Advanced:** not even bronze.

A good player should gold the beginner missions on a first or second try, need research and
some replays for intermediate golds, and work for advanced bronzes.

## Adding an archipelago

1. Author its islands in `islands.ts` (text maps; the generator script lives with the islands
   notes) with landmarks.
2. Add an entry in `ARCHIPELAGOS` with point thresholds per island.
3. Add 8–10 missions in `SCENARIOS` with `island`, `level`, medals, deadlines, research needs and
   kits. Theme decor and activities come with later passes.
4. Run `npm test`: the mission tests check every mission can be opened and has all three medals;
   add balance expectations for the new archipelago.
