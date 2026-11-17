import * as THREE from 'three';
import { LEVEL_HEIGHT, type World } from '../sim/world';
import { PALETTE, mat, mergeByMaterial, mergeLayer, palm } from './models';

/**
 * Island terrain (Pass 4): land columns at their height, water by type (shallows, reef,
 * lagoon), jungle trees, rocks and beach palms. Everything is instanced or merged, so a whole
 * island costs a handful of draw calls.
 */

/** Top of the ground at a tile. */
export function tileTop(world: World, x: number, y: number): number {
  return world.heightAt(x, y) * LEVEL_HEIGHT;
}

/**
 * Height a walker stands at, smoothed across stairs: within a quarter tile of an edge shared
 * with a path at another level, ease towards the midpoint so guests climb instead of popping.
 */
export function walkHeight(world: World, x: number, z: number): number {
  const tx = Math.floor(x);
  const tz = Math.floor(z);
  const h = world.heightAt(tx, tz);
  let y = h;
  const fx = x - tx;
  const fz = z - tz;
  const edge = (nx: number, nz: number, f: number) => {
    if (!world.isPath(nx, nz)) return;
    const d = world.heightAt(nx, nz) - h;
    if (d !== 0 && Math.abs(d) <= 1) y += (d / 2) * f;
  };
  if (fx > 0.75) edge(tx + 1, tz, (fx - 0.75) / 0.25);
  if (fx < 0.25) edge(tx - 1, tz, (0.25 - fx) / 0.25);
  if (fz > 0.75) edge(tx, tz + 1, (fz - 0.75) / 0.25);
  if (fz < 0.25) edge(tx, tz - 1, (0.25 - fz) / 0.25);
  return y * LEVEL_HEIGHT;
}

const COLORS: Record<string, string> = {
  s: PALETTE.sand,
  g: PALETTE.grass,
  j: '#6aa84f',
  k: '#a39e8f',
  '-': '#6fd6d6',
  '*': '#58c4bd',
  o: '#82e3d6',
};
const GRASS_DARK = new THREE.Color(PALETTE.grassDark);
const UNOWNED = new THREE.Color('#9fb8a8');
const BOTTOM = -0.55;
const WATER_Y = -0.38;

export function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * What the renderer shows at a tile. Prototype maps have no terrain: there, land you don't own
 * is still shallow sea, as before Pass 4.
 */
function visual(world: World, x: number, y: number): string {
  if (!world.layout.terrain) return world.isLand(x, y) ? 'g' : '-';
  return world.terrainAt(x, y);
}

/** The whole island: land, water, trees and rocks. Rebuild it when terrain or ownership changes. */
export function buildTerrain(world: World): THREE.Group {
  const g = new THREE.Group();
  const n = world.size;
  const land: Array<{ x: number; y: number; t: string }> = [];
  const water: Array<{ x: number; y: number; t: string }> = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const t = visual(world, x, y);
      if ('sgjk'.includes(t)) land.push({ x, y, t });
      else if (t !== '~') water.push({ x, y, t });
    }

  // Land: one box column per tile, top at its level.
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  const cols = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff' }), Math.max(1, land.length));
  land.forEach((t, i) => {
    const top = tileTop(world, t.x, t.y);
    const h = top - BOTTOM;
    m.makeScale(1, h, 1).setPosition(t.x + 0.5, BOTTOM + h / 2, t.y + 0.5);
    cols.setMatrixAt(i, m);
    c.set(COLORS[t.t]);
    if (t.t === 'g' && (t.x + t.y) % 2) c.copy(GRASS_DARK);
    if (t.t === 's' && (t.x + t.y) % 2) c.offsetHSL(0, 0, -0.025);
    // Land you don't own yet is a little muted.
    if (world.layout.terrain && !world.isLand(t.x, t.y)) c.lerp(UNOWNED, 0.28);
    cols.setColorAt(i, c);
  });
  cols.count = land.length;
  cols.receiveShadow = true;
  g.add(cols);

  // Water tiles over the sea plane: shallows, reef and lagoon.
  if (water.length) {
    const quads = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#ffffff' }), water.length);
    water.forEach((t, i) => {
      m.makeTranslation(t.x + 0.5, t.t === 'o' ? WATER_Y + 0.02 : WATER_Y, t.y + 0.5);
      quads.setMatrixAt(i, m);
      quads.setColorAt(i, c.set(COLORS[t.t] ?? COLORS['-']));
    });
    quads.receiveShadow = true;
    g.add(quads);
  }

  // Coral on the reef: little coloured lumps under the surface.
  const reef = water.filter((t) => t.t === '*');
  if (reef.length) {
    const coral = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), reef.length * 3);
    const tints = ['#ff8a7a', '#ffb067', '#c88cff', '#ffd166'];
    let k = 0;
    for (const t of reef)
      for (let j = 0; j < 3; j++) {
        const h = hash(t.x * 3 + j, t.y * 7 + j);
        const s = 0.6 + (h % 7) / 10;
        m.makeScale(s, s * 0.6, s).setPosition(t.x + 0.2 + ((h >> 3) % 60) / 100, WATER_Y + 0.02, t.y + 0.2 + ((h >> 9) % 60) / 100);
        coral.setMatrixAt(k, m);
        coral.setColorAt(k++, c.set(tints[h % tints.length]));
      }
    g.add(coral);
  }

  // Jungle: one or two broadleaf trees per tile (trunk + two-tone canopy).
  const jungle = land.filter((t) => t.t === 'j');
  if (jungle.length) {
    const count = jungle.length * 2;
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.08, 1, 5).translate(0, 0.5, 0), mat(PALETTE.trunk), count);
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.32, 0), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), count);
    const greens = ['#2f7d3a', '#3f9a52', '#2a6b33', '#4d9e3f'];
    let k = 0;
    for (const t of jungle) {
      const top = tileTop(world, t.x, t.y);
      for (let j = 0; j < 2; j++) {
        const h = hash(t.x * 5 + j * 11, t.y * 3 + j);
        if (j === 1 && h % 3 === 0) continue;
        const px = t.x + 0.25 + ((h >> 4) % 50) / 100;
        const pz = t.y + 0.25 + ((h >> 10) % 50) / 100;
        const th = 0.5 + ((h >> 6) % 40) / 100;
        m.makeScale(1, th, 1).setPosition(px, top, pz);
        trunks.setMatrixAt(k, m);
        const s = 0.8 + ((h >> 12) % 40) / 100;
        m.makeScale(s, s * 0.85, s).setPosition(px, top + th + 0.12, pz);
        crowns.setMatrixAt(k, m);
        crowns.setColorAt(k, c.set(greens[h % greens.length]));
        k++;
      }
    }
    trunks.count = crowns.count = k;
    trunks.castShadow = crowns.castShadow = true;
    g.add(trunks, crowns);
  }

  // Rocks: grey boulders.
  const rocks = land.filter((t) => t.t === 'k');
  if (rocks.length) {
    const boulders = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.3, 0), mat('#8d897c'), rocks.length * 2);
    let k = 0;
    for (const t of rocks)
      for (let j = 0; j < 2; j++) {
        const h = hash(t.x + j * 17, t.y * 5 - j);
        const s = 0.6 + (h % 50) / 100;
        m.makeRotationY(h % 6)
          .scale(new THREE.Vector3(s, s * 0.7, s))
          .setPosition(t.x + 0.3 + ((h >> 5) % 40) / 100, tileTop(world, t.x, t.y) + 0.08, t.y + 0.3 + ((h >> 11) % 40) / 100);
        boulders.setMatrixAt(k++, m);
      }
    boulders.count = k;
    boulders.castShadow = true;
    g.add(boulders);
  }
  return g;
}

/**
 * Palms along the beach, skipping tiles with paths or buildings. Merged into one layer; rebuild
 * when the map changes.
 */
export function buildPalms(world: World): THREE.Group | null {
  if (!world.layout.terrain) return null;
  const palms: THREE.Object3D[] = [];
  const d = world.dock;
  for (let y = 0; y < world.size; y++)
    for (let x = 0; x < world.size; x++) {
      if (world.terrainAt(x, y) !== 's' || world.isPath(x, y) || world.buildingAt(x, y)) continue;
      if (x === d.x && y >= d.y - 1) continue;
      const shore = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => world.isWater(x + dx, y + dy));
      const h = hash(x, y);
      if (h % (shore ? 4 : 9) !== 0) continue;
      const lean = ((h % 13) / 13 - 0.5) * 0.6;
      const p = mergeByMaterial(palm(1.0 + Math.abs(lean), lean));
      p.position.set(x + 0.3 + ((h >> 5) % 40) / 100, tileTop(world, x, y), y + 0.3 + ((h >> 9) % 40) / 100);
      p.rotation.y = h % 7;
      palms.push(p);
    }
  return mergeLayer(palms);
}

/** The pier from the dock tile out over the water (the ferry is FerryView). */
export function buildPier(world: World): THREE.Group {
  const d = world.dock;
  const pier = new THREE.Group();
  const planks = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 3.2), mat(PALETTE.wood));
  planks.position.set(0, 0, 1.6);
  planks.castShadow = planks.receiveShadow = true;
  pier.add(planks);
  for (const px of [-0.36, 0.36])
    for (const pz of [0.9, 2.0, 3.1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 5), mat(PALETTE.woodDark));
      post.position.set(px, -0.2, pz);
      pier.add(post);
    }
  pier.position.set(d.x + 0.5, tileTop(world, d.x, d.y) - 0.02, d.y + 1);
  return pier;
}
