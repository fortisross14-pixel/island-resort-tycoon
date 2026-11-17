import * as THREE from 'three';
import type { BuildingKind } from '../sim/buildings';

/**
 * Low-poly, flat-shaded models built from primitives (GDD art direction: warm tropical
 * palette, soft shadows). Each model is built for rotation 0, centred on the origin,
 * sitting on y = 0, with its front facing +z.
 */

const matCache = new Map<string, THREE.MeshLambertMaterial>();
export function mat(color: string): THREE.MeshLambertMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    matCache.set(color, m);
  }
  return m;
}

export const PALETTE = {
  sand: '#f2deaa',
  sandDark: '#e0c58a',
  grass: '#9fd36f',
  grassDark: '#86c25a',
  path: '#f6e7c1',
  pathEdge: '#dcc79a',
  wood: '#a8754a',
  woodDark: '#7d5534',
  wall: '#fff4e2',
  wallWarm: '#ffe2bd',
  roof: '#e0704f',
  roofTeal: '#3fa7a0',
  roofSun: '#f2b441',
  window: '#3b6e8f',
  palmLeaf: '#3f9a52',
  trunk: '#9b6b43',
  white: '#ffffff',
};

function box(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Four-sided hip roof over a w×d rectangle. */
function hipRoof(w: number, d: number, h: number, color: string, y: number): THREE.Mesh {
  const geo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  geo.rotateY(Math.PI / 4);
  const m = new THREE.Mesh(geo, mat(color));
  m.scale.set(w, h, d);
  m.position.y = y + h / 2;
  m.castShadow = true;
  return m;
}

function windowPane(x: number, y: number, z: number, w = 0.22, h = 0.22): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(PALETTE.window));
  m.position.set(x, y, z);
  return m;
}

function basicRooms(): THREE.Group {
  // 2×2 tiles, two rooms side by side, one floor.
  const g = new THREE.Group();
  g.add(box(1.7, 0.08, 1.7, PALETTE.sandDark));
  g.add(box(1.6, 0.85, 1.4, PALETTE.wall, 0, 0.08, -0.05));
  g.add(hipRoof(1.95, 1.75, 0.6, PALETTE.roof, 0.93));
  const front = 0.651;
  for (const sx of [-0.4, 0.4]) {
    // Door, window, and a little porch light per room.
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.42), mat(PALETTE.woodDark));
    door.position.set(sx - 0.12, 0.29, front);
    g.add(door);
    g.add(windowPane(sx + 0.17, 0.52, front));
  }
  // Divider between the two rooms.
  g.add(box(0.05, 0.85, 0.05, PALETTE.wallWarm, 0, 0.08, front - 0.02));
  // Two sun loungers out front.
  for (const sx of [-0.45, 0.45]) g.add(box(0.18, 0.06, 0.32, PALETTE.white, sx, 0.08, 0.78));
  return g;
}

function snackBar(): THREE.Group {
  // 1×1 kiosk with a striped awning and a parasol.
  const g = new THREE.Group();
  g.add(box(0.62, 0.5, 0.5, PALETTE.wallWarm, 0, 0, -0.1));
  g.add(box(0.66, 0.06, 0.12, PALETTE.wood, 0, 0.42, 0.18)); // counter
  for (let i = 0; i < 4; i++) {
    const stripe = box(0.17, 0.04, 0.38, i % 2 ? PALETTE.white : PALETTE.roofSun, -0.255 + i * 0.17, 0.62, 0.0);
    stripe.rotation.x = -0.25;
    g.add(stripe);
  }
  g.add(box(0.66, 0.06, 0.55, PALETTE.roofSun, 0, 0.5, -0.1));
  // Parasol.
  g.add(box(0.03, 0.42, 0.03, PALETTE.trunk, 0.3, 0, 0.34));
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.1, 6), mat(PALETTE.roofTeal));
  shade.position.set(0.3, 0.46, 0.34);
  shade.castShadow = true;
  g.add(shade);
  return g;
}

function buffet(): THREE.Group {
  // 3×2 open-sided dining hall with a long roof and tables in front.
  const g = new THREE.Group();
  g.add(box(2.85, 0.08, 1.85, PALETTE.sandDark));
  g.add(box(2.7, 0.75, 0.9, PALETTE.wall, 0, 0.08, -0.4));
  // Serving counter visible under the roof.
  g.add(box(2.2, 0.3, 0.25, PALETTE.wood, 0, 0.08, 0.15));
  for (const sx of [-1.3, 1.3]) for (const sz of [0.05, 0.55]) g.add(box(0.08, 0.75, 0.08, PALETTE.woodDark, sx, 0.08, sz));
  const roof = box(2.95, 0.1, 1.95, PALETTE.roofTeal, 0, 0.83, -0.05);
  g.add(roof);
  g.add(hipRoof(2.6, 1.4, 0.35, PALETTE.roofTeal, 0.93));
  for (let i = 0; i < 3; i++) g.add(windowPane(-0.9 + i * 0.9, 0.5, 0.051, 0.4, 0.25));
  // Tables with tiny stools.
  for (const tx of [-0.9, 0, 0.9]) {
    g.add(box(0.3, 0.2, 0.3, PALETTE.white, tx, 0.08, 0.72));
  }
  return g;
}

const BUILDERS: Record<BuildingKind, () => THREE.Group> = { basicRooms, snackBar, buffet };

export function buildingModel(kind: BuildingKind): THREE.Group {
  return BUILDERS[kind]();
}

export function palm(height = 1.2, lean = 0.2): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, height, 5), mat(PALETTE.trunk));
  trunk.position.y = height / 2;
  trunk.rotation.z = lean;
  trunk.castShadow = true;
  g.add(trunk);
  const top = new THREE.Vector3(-Math.sin(lean) * height, Math.cos(lean) * height, 0);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.7, 3), mat(PALETTE.palmLeaf));
    leaf.geometry.translate(0, 0.35, 0);
    leaf.position.copy(top);
    leaf.rotation.set(0, (i / 6) * Math.PI * 2, 1.9);
    leaf.rotation.order = 'YXZ';
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

/**
 * One path tile with auto-joined edges: a centre pad plus a strip towards each
 * neighbouring path, so corners and junctions read as one continuous walkway.
 * Pieces abut exactly (never overlap) so coplanar tops cannot z-fight.
 */
export function pathTile(links: { n: boolean; s: boolean; e: boolean; w: boolean }): THREE.Group {
  const g = new THREE.Group();
  // Flat top quads only: box sides at shared edges rasterise as hairline seams.
  const y = 0.02;
  const quad = (x: number, z: number, w: number, d: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat(PALETTE.path));
    m.position.set(x, y, z);
    m.receiveShadow = true;
    g.add(m);
  };
  quad(0, 0, 0.7, 0.7);
  if (links.n) quad(0, -0.425, 0.7, 0.15);
  if (links.s) quad(0, 0.425, 0.7, 0.15);
  if (links.e) quad(0.425, 0, 0.15, 0.7);
  if (links.w) quad(-0.425, 0, 0.15, 0.7);
  return g;
}
