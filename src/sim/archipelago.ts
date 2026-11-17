/**
 * Archipelagos (Pass 4): a set of islands with a theme, played in order. Points from medals
 * (bronze 1, silver 2, gold 3, best medal per mission) open the islands. Later archipelagos
 * (Hawaii: volcanoes and land excursions; the Balearics: nightlife; Thailand …) bring their
 * own decor and activities.
 */
export interface ArchipelagoIsland {
  island: string;
  /** Points in this archipelago needed to open the island. */
  points: number;
}

export interface Archipelago {
  id: string;
  name: string;
  theme: string;
  islands: ArchipelagoIsland[];
}

export const ARCHIPELAGOS: Archipelago[] = [
  {
    id: 'caribbean',
    name: 'The Caribbean',
    theme: 'Beaches and food',
    islands: [
      { island: 'coconutKey', points: 0 },
      { island: 'twinPalms', points: 3 },
      { island: 'farSands', points: 3 },
      { island: 'oldHarbour', points: 10 },
    ],
  },
];

export function archipelagoOf(island: string): Archipelago | undefined {
  return ARCHIPELAGOS.find((a) => a.islands.some((i) => i.island === island));
}

export function pointsToOpen(island: string): number {
  return archipelagoOf(island)?.islands.find((i) => i.island === island)?.points ?? 0;
}
