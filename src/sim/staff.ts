import type { Slot } from './activities';
import type { Rng } from './rng';

/**
 * Staff (Pass 5). Three kinds of people work at a resort:
 *  - Maintenance: repairs and cleaning. Each person looks after a number of buildings; too few
 *    and rooms wear faster and feel less clean.
 *  - Operations: the greeting team at the Welcome Center (mornings) and the guides who run
 *    activity sessions. Each has a morning, afternoon and evening shift and can only be in one
 *    place at a time: a session without a guide doesn't run.
 *  - Security: lifeguards for pools and beaches, posted for the whole day.
 * "Hire new" shows three candidates; skill (1–3) trades against wage.
 */

export type Role = 'maintenance' | 'operations' | 'security';
export const ROLES: Role[] = ['maintenance', 'operations', 'security'];
export const ROLE_NAMES: Record<Role, string> = { maintenance: 'Maintenance', operations: 'Operations', security: 'Security' };
export const ROLE_JOBS: Record<Role, string> = {
  maintenance: 'Repairs and cleaning across the resort',
  operations: 'Greeting guests and guiding activities, by shift',
  security: 'Lifeguards for pools and beaches',
};

export interface Worker {
  id: number;
  name: string;
  role: Role;
  /** 1–3: better staff do more (cover more buildings, run better sessions). */
  skill: number;
  /** Coins a month. */
  wage: number;
  hired: number;
  /** Operations: a task per shift ('greet' or 'hub:<id>'). */
  shifts?: Partial<Record<Slot, string>>;
  /** Security: where they keep watch ('post:<building id>'). */
  post?: string | null;
}

export type Candidate = Omit<Worker, 'id' | 'hired' | 'shifts' | 'post'>;

/** Base wage a month at skill 1; each extra skill point adds the step. */
const WAGE: Record<Role, { base: number; step: number }> = {
  maintenance: { base: 110, step: 55 },
  operations: { base: 90, step: 45 },
  security: { base: 80, step: 40 },
};

/** Buildings one maintenance person keeps up with, by skill. */
export const COVERS: Record<number, number> = { 1: 6, 2: 9, 3: 13 };

const NAMES = [
  'Marisol', 'Kai', 'Andre', 'Lucia', 'Dwayne', 'Keisha', 'Tomas', 'Nia', 'Rafael', 'Imani', 'Jonah', 'Esme',
  'Mateo', 'Leilani', 'Omar', 'Rosa', 'Felix', 'Ayana', 'Diego', 'Talia', 'Malik', 'Sofia', 'Winston', 'Zara',
];

export function candidates(role: Role, rng: Rng): Candidate[] {
  const out: Candidate[] = [];
  // One of each skill, in a random order, with a little spread in the wage.
  const skills = [1, 2, 3].sort(() => rng.next() - 0.5);
  for (const skill of skills) {
    const w = WAGE[role];
    const wage = Math.round((w.base + w.step * (skill - 1)) * rng.range(0.9, 1.15) / 5) * 5;
    out.push({ name: NAMES[Math.floor(rng.next() * NAMES.length)], role, skill, wage });
  }
  return out;
}

/** Every resort starts with the owner's handyman: maintenance, skill 1, no wage. */
export function caretaker(id = 1): Worker {
  return { id, name: 'Old Joe', role: 'maintenance', skill: 1, wage: 0, hired: 1 };
}

export function hubTask(hubId: number): string {
  return `hub:${hubId}`;
}

export function postTask(buildingId: number): string {
  return `post:${buildingId}`;
}

export const GREET = 'greet';
