import { describe, expect, it } from 'vitest';
import { BUILDINGS, ELEVATOR_COST, MAX_FLOORS_EARLY, MAX_FLOORS_RESEARCHED, floorCost } from '../src/sim/buildings';
import { History } from '../src/sim/history';
import { Sim } from '../src/sim/sim';
import { World, floorsOf } from '../src/sim/world';

function setup(): { w: World; sim: Sim; id: number } {
  const w = new World(12, 200000);
  const d = w.dock;
  for (let y = d.y - 1; y >= 0; y--) w.placePath(d.x, y);
  const b = w.placeBuilding('basicRooms', d.x + 1, 2, 0).building!;
  const sim = new Sim(w);
  sim.progression = true;
  return { w, sim, id: b.id };
}

describe('stacked floors (Pass 1)', () => {
  it('each floor adds two rooms and costs 60% of the building', () => {
    const { w, sim, id } = setup();
    const b = w.buildings.find((x) => x.id === id)!;
    expect(sim.capacity(b)).toBe(2);
    const before = w.money;
    expect(w.addFloor(id, sim.maxFloors).ok).toBe(true);
    expect(w.money).toBe(before - floorCost('basicRooms'));
    expect(floorCost('basicRooms')).toBe(BUILDINGS.basicRooms.cost * 0.6);
    expect(sim.capacity(w.buildings.find((x) => x.id === id)!)).toBe(4);
  });

  it('stops at 3 floors until Tall Buildings is researched, then 6', () => {
    const { w, sim, id } = setup();
    expect(sim.maxFloors).toBe(MAX_FLOORS_EARLY);
    w.addFloor(id, sim.maxFloors);
    w.addFloor(id, sim.maxFloors);
    expect(w.addFloor(id, sim.maxFloors)).toEqual({ ok: false, reason: '3 floors is the limit for now' });
    sim.research.done.add('tallBuildings');
    expect(sim.maxFloors).toBe(MAX_FLOORS_RESEARCHED);
    expect(w.addFloor(id, sim.maxFloors).ok).toBe(true);
    expect(floorsOf(w.buildings.find((x) => x.id === id)!)).toBe(4);
  });

  it('only room buildings can be stacked', () => {
    const { w, sim } = setup();
    const snack = w.placeBuilding('snackBar', w.dock.x - 1, 2, 0).building!;
    expect(w.addFloor(snack.id, sim.maxFloors)).toEqual({ ok: false, reason: 'Only rooms can be stacked' });
  });

  it('above 3 floors, guests mind the stairs until an elevator goes in', () => {
    const { w, sim, id } = setup();
    sim.research.done.add('tallBuildings');
    for (let i = 0; i < 3; i++) w.addFloor(id, sim.maxFloors);
    const b = () => w.buildings.find((x) => x.id === id)!;
    expect(sim.needsElevator(b())).toBe(true);
    const guest = { tier: 1, wishes: [], budget: 60 } as never;
    const without = sim.match(guest, b());
    expect(without.notes).toContainEqual({ ok: false, text: 'So many stairs!' });
    const before = w.money;
    expect(w.addElevator(id).ok).toBe(true);
    expect(w.money).toBe(before - ELEVATOR_COST);
    expect(sim.needsElevator(b())).toBe(false);
    expect(sim.match(guest, b()).score).toBe(without.score + 15);
  });

  it('upkeep grows with floors, and demolishing refunds half of everything spent', () => {
    const { w, sim, id } = setup();
    w.addFloor(id, sim.maxFloors);
    sim.pauseAtNight = true;
    for (let i = 0; !sim.night && i < 200000; i++) sim.step();
    expect(sim.night!.stats.upkeep).toBe(BUILDINGS.basicRooms.upkeep * 2);
    const before = w.money;
    w.removeBuilding(id);
    expect(w.money).toBe(before + (BUILDINGS.basicRooms.cost + floorCost('basicRooms')) / 2);
  });

  it('floors are undone and saved like any other building change', () => {
    const { w, sim, id } = setup();
    const h = new History(w);
    h.run(() => w.addFloor(id, sim.maxFloors));
    const copy = World.fromSnapshot(JSON.parse(JSON.stringify(w.snapshot())));
    expect(floorsOf(copy.buildings.find((x) => x.id === id)!)).toBe(2);
    h.undo();
    expect(floorsOf(w.buildings.find((x) => x.id === id)!)).toBe(1);
  });
});
