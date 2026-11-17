import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/sim/buildings';
import { roomRateOf } from '../src/sim/needs';
import { rating, reviewText, starsFor, type Review } from '../src/sim/reviews';
import { DAY_END, DAY_START, SECONDS_PER_GAME_HOUR, Sim, TICK, arrivalsForDay, type NightReport } from '../src/sim/sim';
import { World } from '../src/sim/world';

function starterResort(): World {
  const w = new World();
  const d = w.dock;
  for (let y = d.y - 1; y >= 0; y--) w.placePath(d.x, y);
  w.placeBuilding('basicRooms', d.x - 2, 0, 0);
  w.placeBuilding('basicRooms', d.x - 2, 2, 0);
  w.placeBuilding('basicRooms', d.x + 1, 0, 0);
  w.placeBuilding('basicRooms', d.x + 1, 2, 0);
  w.placeBuilding('buffet', d.x + 1, 5, 0);
  w.placeBuilding('snackBar', d.x - 1, 7, 0);
  return w;
}

function gameSim(w: World): Sim {
  const s = new Sim(w);
  s.autoCheckIn = true;
  s.pauseAtNight = true;
  return s;
}

/** Step until the night report appears. */
function untilNight(sim: Sim): NightReport {
  for (let i = 0; !sim.night && i < 100000; i++) sim.step();
  expect(sim.night).not.toBeNull();
  return sim.night!;
}

describe('the night', () => {
  it('pauses on the night report at 23:00 until the next day is started', () => {
    const w = starterResort();
    const sim = gameSim(w);
    const report = untilNight(sim);
    expect(report.day).toBe(1);
    const m = sim.minutes;
    for (let i = 0; i < 200; i++) sim.step();
    expect(sim.minutes).toBe(m);
    expect(m).toBeGreaterThanOrEqual(DAY_END);
    sim.startDay();
    expect(w.day).toBe(2);
    expect(sim.minutes).toBe(DAY_START);
    expect(sim.night).toBeNull();
  });

  it('the report’s profit is exactly how much the coins moved that day', () => {
    const w = starterResort();
    const sim = gameSim(w);
    const start = w.money;
    const r = untilNight(sim);
    expect(w.money - start).toBe(r.profit);
    const s = r.stats;
    expect(r.profit).toBe(s.roomIncome + s.spending - s.supplies - s.upkeep);
    const upkeep = w.buildings.reduce((sum, b) => sum + BUILDINGS[b.kind].upkeep, 0);
    expect(s.upkeep).toBe(upkeep);
    expect(s.roomIncome).toBeGreaterThan(0);
    expect(r.income.reduce((sum, l) => sum + l.amount, 0)).toBe(s.roomIncome + s.spending);
  });

  it('each housed party pays the room rate, capped at its budget', () => {
    const w = starterResort();
    const sim = gameSim(w);
    // Run to 22:00 and note who is housed, then close the day.
    for (let i = 0; sim.minutes < 22 * 60 && i < 100000; i++) sim.step();
    const room = w.buildings.find((b) => b.kind === 'basicRooms')!;
    const rate = sim.roomRate(room);
    expect(rate).toBe(roomRateOf(1, 2));
    const housed = sim.guests.filter((g) => g.roomId !== null && !g.leaving);
    const expected = housed.reduce((s, g) => s + Math.min(rate, g.budget), 0);
    const nights = housed.map((g) => g.nightsLeft);
    const r = untilNight(sim);
    expect(r.stats.roomIncome).toBe(expected);
    housed.forEach((g, i) => expect(g.nightsLeft).toBe(nights[i] - 1));
  });

  it('parties write reviews when they check out, and the rating follows', () => {
    const w = starterResort();
    const sim = gameSim(w);
    let reviews = 0;
    for (let day = 0; day < 5; day++) {
      const r = untilNight(sim);
      reviews += r.reviews.length;
      for (const rv of r.reviews) {
        expect(rv.stars).toBeGreaterThanOrEqual(1);
        expect(rv.stars).toBeLessThanOrEqual(5);
        expect(rv.text.length).toBeGreaterThan(5);
      }
      expect(r.ratingAfter).toBeCloseTo(sim.rating, 5);
      sim.startDay();
    }
    expect(reviews).toBeGreaterThan(0);
    expect(sim.reviews).toHaveLength(reviews);
  });

  it('a party that gives up leaves a 1-star review about waiting', () => {
    const w = new World();
    for (let y = w.dock.y - 1; y >= w.dock.y - 2; y--) w.placePath(w.dock.x, y);
    const sim = new Sim(w);
    sim.pauseAtNight = true;
    const r = untilNight(sim);
    expect(r.reviews.length).toBe(r.stats.turnedAway);
    expect(r.reviews.every((rv) => rv.stars === 1)).toBe(true);
    expect(r.reviews[0].text).toMatch(/never got a room/);
    expect(r.worst).toMatch(/gave up/);
    expect(r.ratingAfter).toBeLessThan(r.ratingBefore);
  });

  it('a room rate above the budget hurts the match', () => {
    const w = starterResort();
    const sim = gameSim(w);
    sim.autoCheckIn = false;
    const backpacker = () => sim.queue.find((x) => x.type === 'backpacker');
    for (let i = 0; !backpacker() && i < 100000; i++) sim.step();
    const g = backpacker()!;
    expect(roomRateOf(1, 4)).toBeGreaterThan(g.budget); // backpackers can't afford Luxury
    const room = w.buildings.find((b) => b.kind === 'basicRooms')!;
    sim.setRoomRate(1, 0);
    const cheap = sim.match(g, room);
    sim.setRoomRate(1, 4);
    const steep = sim.match(g, room);
    expect(steep.score).toBeLessThan(cheap.score);
    expect(steep.notes).toContainEqual({ ok: false, text: 'Too pricey for us' });
  });

  it('keeps reviews, room rates and a pending night through a snapshot', () => {
    const w = starterResort();
    const sim = gameSim(w);
    sim.setRoomRate(1, 3);
    untilNight(sim);
    const copy = new Sim(World.fromSnapshot(w.snapshot()));
    copy.restore(JSON.parse(JSON.stringify(sim.snapshot())));
    expect(copy.roomRates[1]).toBe(3);
    expect(copy.night?.day).toBe(1);
    expect(copy.reviews).toEqual(sim.reviews);
  });
});

describe('reviews and rating', () => {
  it('turns satisfaction into 1–5 stars', () => {
    expect(starsFor(0)).toBe(1);
    expect(starsFor(50)).toBe(3);
    expect(starsFor(100)).toBe(5);
  });

  it('writes one line from the best and worst memories, pointing at the building', () => {
    const r = reviewText(4, [
      { buildingId: 3, weight: 7, text: 'the Buffet was great value' },
      { buildingId: 9, weight: -9, text: 'the walk to the Snack Bar was endless' },
    ]);
    expect(r.text).toBe('The Buffet was great value, but the walk to the Snack Bar was endless.');
    expect(r.buildingId).toBe(3);
    const bad = reviewText(2, [
      { buildingId: 3, weight: 7, text: 'the Buffet was great value' },
      { buildingId: 9, weight: -9, text: 'the walk to the Snack Bar was endless' },
    ]);
    expect(bad.buildingId).toBe(9);
  });

  it('rates from recent reviews, starting near 2.5', () => {
    expect(rating([])).toBe(2.5);
    const fives: Review[] = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      day: 1,
      guestType: 'couple',
      stars: 5,
      text: '',
      buildingId: null,
    }));
    expect(rating(fives)).toBeGreaterThan(4.7);
  });

  it('a better rating brings a bigger ferry', () => {
    expect(arrivalsForDay(5, 4.5)).toBeGreaterThan(arrivalsForDay(5, 2.5));
    expect(arrivalsForDay(5, 1)).toBeLessThan(arrivalsForDay(5, 2.5));
  });
});

// Keep the per-hour constant referenced so a change to the day length shows up here.
void SECONDS_PER_GAME_HOUR;
void TICK;
