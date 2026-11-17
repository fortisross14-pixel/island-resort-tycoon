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

function standardRooms(): THREE.Group {
  // 2×2: two-storey look, teal roof, balconies.
  const g = new THREE.Group();
  g.add(box(1.8, 0.08, 1.8, PALETTE.sandDark));
  g.add(box(1.6, 1.15, 1.35, PALETTE.wallWarm, 0, 0.08, -0.08));
  g.add(hipRoof(1.95, 1.7, 0.5, PALETTE.roofTeal, 1.23));
  const front = 0.601;
  for (const sx of [-0.4, 0.4]) {
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.42), mat(PALETTE.woodDark));
    door.position.set(sx - 0.12, 0.29, front);
    g.add(door);
    g.add(windowPane(sx + 0.17, 0.42, front));
    g.add(windowPane(sx, 0.88, front, 0.34, 0.2));
    // Balcony slab and rail.
    g.add(box(0.5, 0.04, 0.18, PALETTE.white, sx, 0.68, front + 0.09));
    g.add(box(0.5, 0.1, 0.02, PALETTE.white, sx, 0.72, front + 0.17));
  }
  g.add(box(0.05, 1.15, 0.05, PALETTE.white, 0, 0.08, front - 0.02));
  for (const sx of [-0.55, 0.55]) g.add(palmPot(sx, 0.75));
  return g;
}

function palmPot(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.14, 0.12, 0.14, PALETTE.roof, 0, 0.08, 0));
  const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), mat(PALETTE.palmLeaf));
  bush.position.y = 0.3;
  bush.castShadow = true;
  g.add(bush);
  g.position.set(x, 0, z);
  return g;
}

function beachBar(): THREE.Group {
  // 2×1 thatched hut with a bar counter and stools.
  const g = new THREE.Group();
  g.add(box(1.8, 0.06, 0.85, PALETTE.wood));
  g.add(box(1.3, 0.45, 0.25, PALETTE.woodDark, 0, 0.06, -0.15));
  for (const sx of [-0.75, 0.75]) for (const sz of [-0.3, 0.3]) g.add(box(0.06, 0.85, 0.06, PALETTE.trunk, sx, 0.06, sz));
  const thatch = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.5, 4, 1), mat('#d9b46a'));
  thatch.rotation.y = Math.PI / 4;
  thatch.scale.set(1.15, 1, 0.55);
  thatch.position.y = 1.15;
  thatch.castShadow = true;
  g.add(thatch);
  for (const sx of [-0.45, 0, 0.45]) {
    g.add(box(0.12, 0.28, 0.12, PALETTE.roofSun, sx, 0.06, 0.25));
  }
  // Bottles.
  for (let i = 0; i < 4; i++) g.add(box(0.05, 0.12, 0.05, i % 2 ? '#7bc96f' : '#4fb0e8', -0.4 + i * 0.25, 0.51, -0.15));
  return g;
}

function giftShop(): THREE.Group {
  // 1×2 shop with a pink awning and a sign.
  const g = new THREE.Group();
  g.add(box(0.85, 0.75, 1.6, '#ffe7f0', 0, 0, 0));
  g.add(box(0.95, 0.08, 1.7, '#ff7aa8', 0, 0.75, 0));
  for (let i = 0; i < 5; i++) {
    const stripe = box(0.2, 0.04, 1.65, i % 2 ? PALETTE.white : '#ff7aa8', 0.38 + 0.02, 0.58, 0);
    stripe.scale.x = 0.6;
    stripe.position.x = 0.5;
    stripe.position.z = -0.66 + i * 0.33;
    stripe.scale.z = 0.19;
    g.add(stripe);
  }
  const shop = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), mat(PALETTE.window));
  shop.rotation.y = Math.PI / 2;
  shop.position.set(0.426, 0.3, 0.15);
  g.add(shop);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.42), mat(PALETTE.woodDark));
  door.position.set(0, 0.21, 0.801);
  g.add(door);
  g.add(box(0.5, 0.18, 0.04, PALETTE.roofSun, 0, 0.88, 0.82));
  return g;
}

function pool(): THREE.Group {
  // 4×3 deck with a pool, loungers and parasols.
  const g = new THREE.Group();
  g.add(box(3.9, 0.08, 2.9, '#f3e6cc'));
  const water = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 1.6), new THREE.MeshLambertMaterial({ color: '#4fc6e8' }));
  water.position.set(-0.3, 0.07, -0.25);
  g.add(water);
  g.add(box(2.7, 0.1, 0.06, PALETTE.white, -0.3, 0.02, 0.58));
  g.add(box(2.7, 0.1, 0.06, PALETTE.white, -0.3, 0.02, -1.08));
  g.add(box(0.06, 0.1, 1.7, PALETTE.white, 1.03, 0.02, -0.25));
  g.add(box(0.06, 0.1, 1.7, PALETTE.white, -1.63, 0.02, -0.25));
  for (let i = 0; i < 4; i++) g.add(box(0.22, 0.07, 0.45, PALETTE.white, -1.3 + i * 0.6, 0.08, 1.05));
  for (const [x, z, c] of [
    [1.5, -0.6, '#ff7aa8'],
    [1.5, 0.7, PALETTE.roofSun],
  ] as const) {
    g.add(box(0.04, 0.7, 0.04, PALETTE.trunk, x, 0.08, z));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.16, 8), mat(c));
    shade.position.set(x, 0.86, z);
    shade.castShadow = true;
    g.add(shade);
  }
  return g;
}

function frontDesk(): THREE.Group {
  // 2×2 lobby with a big awning and a sign.
  const g = new THREE.Group();
  g.add(box(1.85, 0.08, 1.85, PALETTE.sandDark));
  g.add(box(1.6, 0.9, 1.2, PALETTE.wall, 0, 0.08, -0.2));
  g.add(box(1.8, 0.08, 1.7, PALETTE.roofSun, 0, 0.98, 0.05));
  for (const sx of [-0.8, 0.8]) g.add(box(0.07, 0.9, 0.07, PALETTE.woodDark, sx, 0.08, 0.8));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.55), mat(PALETTE.window));
  glass.position.set(0, 0.42, 0.401);
  g.add(glass);
  g.add(box(0.9, 0.22, 0.06, PALETTE.roofTeal, 0, 1.06, 0.78));
  g.add(box(0.7, 0.3, 0.25, PALETTE.wood, 0, 0.08, 0.15));
  return g;
}

function researchOffice(): THREE.Group {
  // 2×2 office with a satellite dish.
  const g = new THREE.Group();
  g.add(box(1.8, 0.08, 1.8, PALETTE.sandDark));
  g.add(box(1.5, 0.8, 1.3, '#eef3f7', 0, 0.08, -0.1));
  g.add(box(1.6, 0.08, 1.4, '#6b7fd6', 0, 0.88, -0.1));
  for (const sx of [-0.4, 0.4]) g.add(windowPane(sx, 0.5, 0.551, 0.4, 0.3));
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.42), mat(PALETTE.woodDark));
  door.position.set(0, 0.29, 0.551);
  g.add(door);
  g.add(box(0.05, 0.3, 0.05, '#cccccc', 0.4, 0.96, -0.3));
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2.5), mat(PALETTE.white));
  dish.rotation.x = -0.9;
  dish.position.set(0.4, 1.3, -0.3);
  dish.castShadow = true;
  g.add(dish);
  return g;
}

function gardenBungalows(): THREE.Group {
  // 3×2 garden with two wooden bungalows and hedges.
  const g = new THREE.Group();
  g.add(box(2.85, 0.06, 1.85, '#8cc860'));
  for (const sx of [-0.75, 0.75]) {
    g.add(box(1.0, 0.65, 0.9, PALETTE.wood, sx, 0.06, -0.2));
    const roof = hipRoof(1.25, 1.15, 0.55, '#7a5a3a', 0.71);
    roof.position.x = sx;
    roof.position.z = -0.2;
    g.add(roof);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.4), mat(PALETTE.woodDark));
    door.position.set(sx, 0.26, 0.251);
    g.add(door);
    g.add(box(0.7, 0.05, 0.3, '#c99a6a', sx, 0.06, 0.45));
  }
  for (let i = 0; i < 6; i++) g.add(box(0.36, 0.22, 0.2, PALETTE.palmLeaf, -1.2 + i * 0.48, 0.06, 0.8));
  for (const [x, z] of [
    [-1.3, -0.75],
    [1.3, -0.75],
  ])
    g.add(palmPot(x, z));
  return g;
}

function restaurantModel(roofColor: string, sign: string): () => THREE.Group {
  return () => {
    // 3×3 restaurant with a terrace of tables.
    const g = new THREE.Group();
    g.add(box(2.85, 0.08, 2.85, '#efe2c8'));
    g.add(box(2.4, 1.0, 1.5, PALETTE.wall, 0, 0.08, -0.55));
    g.add(hipRoof(2.8, 1.9, 0.6, roofColor, 1.08));
    for (const sx of [-0.8, 0, 0.8]) g.add(windowPane(sx, 0.55, 0.201, 0.45, 0.35));
    g.add(box(1.0, 0.26, 0.06, sign, 0, 1.0, 0.23));
    for (const [x, z] of [
      [-0.85, 0.75],
      [0, 0.95],
      [0.85, 0.75],
    ]) {
      g.add(box(0.36, 0.22, 0.36, PALETTE.white, x, 0.08, z));
      g.add(box(0.03, 0.55, 0.03, PALETTE.trunk, x, 0.08, z));
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.12, 6), mat(sign));
      shade.position.set(x, 0.68, z);
      shade.castShadow = true;
      g.add(shade);
    }
    return g;
  };
}

function gym(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.8, 0.08, 1.8, PALETTE.sandDark));
  g.add(box(1.6, 0.85, 1.4, '#e9eef0', 0, 0.08, -0.1));
  g.add(box(1.7, 0.1, 1.5, '#4a5560', 0, 0.93, -0.1));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), mat(PALETTE.window));
  glass.position.set(0, 0.45, 0.601);
  g.add(glass);
  // Dumbbell sign.
  g.add(box(0.5, 0.06, 0.06, '#ff6b6b', 0, 1.12, 0.62));
  for (const sx of [-0.27, 0.27]) g.add(box(0.1, 0.2, 0.1, '#ff6b6b', sx, 1.05, 0.62));
  return g;
}

function spa(): THREE.Group {
  // 3×3 spa with a bamboo screen and a plunge pool.
  const g = new THREE.Group();
  g.add(box(2.85, 0.08, 2.85, '#efe6d6'));
  g.add(box(1.9, 0.8, 1.4, PALETTE.white, -0.3, 0.08, -0.6));
  g.add(hipRoof(2.3, 1.8, 0.45, '#5fb3a5', 0.88));
  g.children[g.children.length - 1].position.set(-0.3, 0.88 + 0.225, -0.6);
  const water = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.8), new THREE.MeshLambertMaterial({ color: '#7fd8e8' }));
  water.position.set(0.7, 0.1, 0.7);
  g.add(water);
  for (let i = 0; i < 7; i++) g.add(box(0.06, 0.6, 0.06, '#b8a35a', -1.3 + i * 0.12, 0.08, 1.2));
  for (const x of [-0.6, -0.2]) g.add(box(0.22, 0.07, 0.45, PALETTE.white, x, 0.08, 0.7));
  return g;
}

function boutique(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.8, 0.08, 1.8, PALETTE.sandDark));
  g.add(box(1.5, 0.9, 1.3, '#f6effa', 0, 0.08, -0.15));
  g.add(box(1.7, 0.1, 0.5, '#9b6bd6', 0, 0.75, 0.62));
  g.add(box(1.6, 0.08, 1.4, '#7f55b8', 0, 0.98, -0.15));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), mat(PALETTE.window));
  glass.position.set(0, 0.42, 0.501);
  g.add(glass);
  g.add(box(0.12, 0.5, 0.12, '#ffd166', -0.5, 0.08, 0.75));
  return g;
}

function diveShop(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.8, 0.06, 1.8, PALETTE.wood));
  g.add(box(1.1, 0.7, 1.0, '#3b8fd6', -0.25, 0.06, -0.3));
  g.add(box(1.25, 0.08, 1.15, PALETTE.white, -0.25, 0.76, -0.3));
  g.add(box(0.04, 0.9, 0.04, PALETTE.trunk, 0.6, 0.06, -0.5));
  g.add(box(0.3, 0.2, 0.02, '#ff4d4d', 0.76, 0.76, -0.5));
  g.add(box(0.26, 0.04, 0.04, PALETTE.white, 0.76, 0.84, -0.48));
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 1.0), mat('#ffd166'));
  hull.position.set(0.45, 0.15, 0.4);
  hull.castShadow = true;
  g.add(hull);
  for (let i = 0; i < 3; i++) g.add(box(0.1, 0.3, 0.1, '#222f3a', -0.6 + i * 0.2, 0.06, 0.4));
  return g;
}

function kidsClub(): THREE.Group {
  // 3×2 playful club with a slide and a sandpit.
  const g = new THREE.Group();
  g.add(box(2.85, 0.06, 1.85, '#f6e7c1'));
  g.add(box(1.4, 0.7, 1.1, '#ffd166', -0.6, 0.06, -0.3));
  g.add(hipRoof(1.6, 1.3, 0.45, '#4fb0e8', 0.76));
  g.children[g.children.length - 1].position.set(-0.6, 0.76 + 0.225, -0.3);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.4), mat('#ff6b6b'));
  door.position.set(-0.6, 0.26, 0.251);
  g.add(door);
  // Slide.
  g.add(box(0.1, 0.7, 0.1, '#ff6b6b', 0.75, 0.06, -0.4));
  g.add(box(0.35, 0.06, 0.35, '#ff6b6b', 0.75, 0.76, -0.4));
  const slide = box(0.28, 0.05, 1.0, '#7bc96f', 0.75, 0.4, 0.05);
  slide.rotation.x = 0.6;
  g.add(slide);
  g.add(box(0.7, 0.05, 0.5, '#f2deaa', 0.6, 0.06, 0.65));
  for (const [x, c] of [
    [-1.1, '#ff6b6b'],
    [-0.3, '#4fb0e8'],
  ] as const) {
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), mat(c));
    ball.position.set(x, 0.16, 0.65);
    g.add(ball);
  }
  return g;
}

function nightclub(): THREE.Group {
  // 3×3 dark club with neon trim and a queue rope.
  const g = new THREE.Group();
  g.add(box(2.85, 0.08, 2.85, '#3a3f4b'));
  g.add(box(2.4, 1.1, 2.0, '#2a2d38', 0, 0.08, -0.3));
  g.add(box(2.5, 0.08, 2.1, '#ff3fa4', 0, 1.18, -0.3));
  g.add(box(2.42, 0.06, 0.04, '#00d1c1', 0, 0.9, 0.72));
  g.add(box(1.2, 0.3, 0.06, '#9b5cff', 0, 1.0, 0.74));
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.6), mat('#111111'));
  door.position.set(0, 0.38, 0.701);
  g.add(door);
  for (const x of [-0.6, 0.6]) g.add(box(0.06, 0.35, 0.06, '#f2b441', x, 0.08, 1.05));
  g.add(box(1.2, 0.03, 0.03, '#c0392b', 0, 0.36, 1.05));
  return g;
}

const BUILDERS: Record<BuildingKind, () => THREE.Group> = {
  kidsClub,
  nightclub,
  researchOffice,
  gardenBungalows,
  italianRestaurant: restaurantModel('#c0392b', '#2e9e4f'),
  seafoodRestaurant: restaurantModel('#2e86c1', '#f5f5f5'),
  asianRestaurant: restaurantModel('#8e2e2e', '#f2b441'),
  gym,
  spa,
  boutique,
  diveShop,
  basicRooms,
  standardRooms,
  snackBar,
  buffet,
  beachBar,
  giftShop,
  pool,
  frontDesk,
};

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
