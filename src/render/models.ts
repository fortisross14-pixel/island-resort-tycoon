import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BUILDINGS, type BuildingKind } from '../sim/buildings';

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

function suites(): THREE.Group {
  // 3×3 luxury block with a rooftop terrace and a private pool.
  const g = new THREE.Group();
  g.add(box(2.85, 0.08, 2.85, '#efe6d6'));
  g.add(box(2.2, 1.0, 1.5, '#fdfaf3', 0, 0.08, -0.55));
  g.add(box(2.35, 0.08, 1.65, '#c9a227', 0, 1.08, -0.55));
  g.add(box(1.2, 0.35, 0.9, '#fdfaf3', -0.4, 1.16, -0.75));
  g.add(box(1.3, 0.06, 1.0, '#c9a227', -0.4, 1.51, -0.75));
  for (const sx of [-0.7, 0, 0.7]) {
    g.add(windowPane(sx, 0.6, 0.201, 0.45, 0.45));
    g.add(box(0.5, 0.04, 0.2, PALETTE.white, sx, 0.4, 0.3));
  }
  const water = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.7), new THREE.MeshLambertMaterial({ color: '#4fc6e8' }));
  water.position.set(0.2, 0.1, 0.85);
  g.add(water);
  g.add(palmPot(-1.15, 0.85));
  return g;
}

function fineDining(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.85, 0.08, 2.85, '#e9e2d4'));
  g.add(box(2.3, 1.0, 1.6, '#2c2c34', 0, 0.08, -0.5));
  g.add(box(2.45, 0.08, 1.75, '#c9a227', 0, 1.08, -0.5));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.6), mat('#f6d98b'));
  glass.position.set(0, 0.5, 0.301);
  g.add(glass);
  for (const x of [-0.8, 0, 0.8]) {
    g.add(box(0.34, 0.24, 0.34, PALETTE.white, x, 0.08, 0.95));
    g.add(box(0.04, 0.12, 0.04, '#c9a227', x, 0.32, 0.95));
  }
  return g;
}

function movieTheater(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.85, 0.08, 2.85, '#d9d2c4'));
  g.add(box(2.4, 1.3, 2.0, '#7d3c98', 0, 0.08, -0.3));
  g.add(box(1.8, 0.45, 0.08, '#f2b441', 0, 0.95, 0.72));
  for (let i = 0; i < 6; i++) g.add(box(0.12, 0.12, 0.05, i % 2 ? '#ffffff' : '#ff6b6b', -0.75 + i * 0.3, 1.18, 0.77));
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.55), mat('#2a1a33'));
  door.position.set(0, 0.36, 0.701);
  g.add(door);
  return g;
}

function conferenceHall(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(3.85, 0.08, 2.85, '#dfe6ea'));
  g.add(box(3.3, 1.1, 2.0, '#eef3f7', 0, 0.08, -0.3));
  g.add(box(3.45, 0.1, 2.15, '#34495e', 0, 1.18, -0.3));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), mat(PALETTE.window));
  glass.position.set(0, 0.6, 0.701);
  g.add(glass);
  for (const x of [-1.2, -0.4, 0.4, 1.2]) g.add(box(0.06, 0.6, 0.06, '#bdc3c7', x, 0.08, 1.15));
  g.add(box(2.5, 0.04, 0.04, '#bdc3c7', 0, 0.68, 1.15));
  return g;
}

function waterVillas(): THREE.Group {
  // Two thatched villas on a deck.
  const g = new THREE.Group();
  g.add(box(1.9, 0.08, 1.9, PALETTE.wood));
  for (const sx of [-0.45, 0.45]) {
    g.add(box(0.75, 0.55, 0.9, '#f5ead6', sx, 0.08, -0.2));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.5, 4), mat('#d9b46a'));
    roof.rotation.y = Math.PI / 4;
    roof.position.set(sx, 0.88, -0.2);
    roof.castShadow = true;
    g.add(roof);
    const pool = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.3), new THREE.MeshLambertMaterial({ color: '#4fc6e8' }));
    pool.position.set(sx, 0.1, 0.55);
    g.add(pool);
  }
  return g;
}

function helipad(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.85, 0.1, 2.85, '#5d6d7e'));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 24).rotateX(-Math.PI / 2), mat('#f2b441'));
  ring.position.y = 0.11;
  g.add(ring);
  g.add(box(0.15, 0.02, 0.9, PALETTE.white, -0.25, 0.1, 0));
  g.add(box(0.15, 0.02, 0.9, PALETTE.white, 0.25, 0.1, 0));
  g.add(box(0.5, 0.02, 0.15, PALETTE.white, 0, 0.1, 0));
  for (const [x, z] of [
    [-1.3, -1.3],
    [1.3, -1.3],
    [-1.3, 1.3],
    [1.3, 1.3],
  ])
    g.add(box(0.1, 0.12, 0.1, '#ff4d4d', x, 0.1, z));
  return g;
}

function marina(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(3.85, 0.06, 1.85, PALETTE.wood));
  for (const x of [-1.2, 0, 1.2]) {
    g.add(box(0.15, 0.06, 0.9, PALETTE.woodDark, x, 0.06, 0.4));
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.9), mat(PALETTE.white));
    hull.position.set(x + 0.35, 0.15, 0.45);
    hull.castShadow = true;
    g.add(hull);
    g.add(box(0.03, 0.7, 0.03, '#999999', x + 0.35, 0.25, 0.45));
  }
  g.add(box(1.0, 0.6, 0.6, '#2e86c1', -1.2, 0.06, -0.5));
  g.add(box(1.1, 0.06, 0.7, PALETTE.white, -1.2, 0.66, -0.5));
  return g;
}


// ---------- decor (Pass 4) ----------

function cyl(rt: number, rb: number, h: number, color: string, x = 0, y = 0, z = 0, seg = 6): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  return m;
}

function palmTreeDecor(): THREE.Group {
  const g = palm(1.15, 0.18);
  g.add(cyl(0.16, 0.2, 0.08, PALETTE.woodDark));
  return g;
}

function bench(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.7, 0.05, 0.22, PALETTE.wood, 0, 0.2, 0));
  g.add(box(0.7, 0.18, 0.04, PALETTE.wood, 0, 0.27, -0.1));
  for (const x of [-0.3, 0.3]) g.add(box(0.05, 0.2, 0.2, PALETTE.woodDark, x, 0, 0));
  return g;
}

function lampPost(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.035, 0.05, 0.9, '#3a4a52'));
  g.add(box(0.18, 0.16, 0.18, '#f6d98b', 0, 0.9, 0));
  g.add(box(0.22, 0.04, 0.22, '#3a4a52', 0, 1.06, 0));
  return g;
}

function beachChairs(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.22, 0.22]) {
    const seat = box(0.26, 0.05, 0.5, x < 0 ? '#ff7a59' : '#4fc6e8', x, 0.1, 0.05);
    g.add(seat);
    const back = box(0.26, 0.05, 0.25, x < 0 ? '#ff7a59' : '#4fc6e8', x, 0.18, -0.25);
    back.rotation.x = -0.7;
    g.add(back);
  }
  g.add(cyl(0.02, 0.02, 0.9, PALETTE.white, 0, 0, -0.1));
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.18, 8), mat('#fff4e2'));
  shade.position.set(0, 0.95, -0.1);
  shade.castShadow = true;
  g.add(shade);
  return g;
}

function flowerBed(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.7, 0.1, 0.7, '#8a5a3a'));
  const colours = ['#ff3f6c', '#ff8a3d', '#ffd23d', '#ff5fa2'];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = i === 0 ? 0 : 0.22;
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), mat(i % 2 ? PALETTE.palmLeaf : '#2f7d3a'));
    bush.position.set(Math.cos(a) * r, 0.16, Math.sin(a) * r);
    g.add(bush);
    const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), mat(colours[i % colours.length]));
    bloom.position.set(Math.cos(a) * r, 0.26, Math.sin(a) * r);
    g.add(bloom);
  }
  return g;
}

function tikiTorch(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.035, 0.045, 0.95, '#6b4a2a'));
  g.add(cyl(0.07, 0.05, 0.14, '#3d2a18', 0, 0.95, 0));
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), new THREE.MeshBasicMaterial({ color: '#ffb02e' }));
  flame.position.set(0, 1.18, 0);
  g.add(flame);
  return g;
}

function surfboardRack(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.7, 0.06, 0.12, PALETTE.woodDark, 0, 0.55, -0.12));
  const colours = ['#ff7a59', '#ffd23d', '#4fc6e8'];
  colours.forEach((c, i) => {
    const board = box(0.14, 0.95, 0.04, c, -0.22 + i * 0.22, 0, 0);
    board.rotation.x = -0.18;
    g.add(board);
  });
  return g;
}

function tikiTotem(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.36, 0.5, 0.36, '#7a4f2a'));
  g.add(box(0.32, 0.45, 0.32, '#8e5d33', 0, 0.5, 0));
  g.add(box(0.36, 0.4, 0.36, '#6b4422', 0, 0.95, 0));
  // Faces: eyes and mouths on the front.
  for (const y of [0.25, 0.72, 1.15]) {
    for (const x of [-0.08, 0.08]) g.add(box(0.06, 0.06, 0.02, '#f2deaa', x, y, 0.19));
    g.add(box(0.16, 0.05, 0.02, '#c0392b', 0, y - 0.13, 0.19));
  }
  g.add(box(0.6, 0.06, 0.16, '#2e9e4f', 0, 1.35, 0));
  return g;
}

function hammocks(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.38, 0.38]) g.add(cyl(0.04, 0.05, 0.75, PALETTE.trunk, x, 0, 0));
  const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.66, 8, 1, true, Math.PI, Math.PI), mat('#e64a8a'));
  cloth.rotation.z = Math.PI / 2;
  cloth.position.set(0, 0.48, 0);
  g.add(cloth);
  g.add(box(0.66, 0.02, 0.06, '#ffd23d', 0, 0.4, 0));
  return g;
}

function bunting(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.4, 0.4]) g.add(cyl(0.025, 0.03, 1.0, PALETTE.white, x, 0, 0));
  const colours = ['#ff3f6c', '#ffd23d', '#2ec4b6', '#7a5cff', '#ff8a3d'];
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5;
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 3), mat(colours[i]));
    flag.rotation.x = Math.PI;
    flag.position.set(-0.4 + t * 0.8, 0.9 - Math.sin(t * Math.PI) * 0.12, 0);
    g.add(flag);
  }
  return g;
}

function welcomeArch(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.42, 0.42]) g.add(box(0.12, 1.2, 0.12, '#2ec4b6', x, 0, 0));
  g.add(box(1.04, 0.22, 0.14, '#ff7a59', 0, 1.2, 0));
  g.add(box(0.8, 0.1, 0.16, '#ffd23d', 0, 1.24, 0));
  for (const x of [-0.42, 0.42]) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), mat(PALETTE.palmLeaf));
    leaf.position.set(x, 1.44, 0);
    g.add(leaf);
  }
  return g;
}

const BUILDERS: Record<BuildingKind, () => THREE.Group> = {
  palmTree: palmTreeDecor,
  bench,
  lampPost,
  beachChairs,
  flowerBed,
  tikiTorch,
  surfboardRack,
  tikiTotem,
  hammocks,
  bunting,
  welcomeArch,
  suites,
  fineDining,
  movieTheater,
  conferenceHall,
  waterVillas,
  helipad,
  marina,
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

/** Height of one stacked floor. */
const FLOOR_H = 0.62;

/**
 * A room building with extra floors: plain storeys with windows underneath the
 * original model (which keeps its roof on top), plus a glass elevator shaft.
 */
export function stackedModel(kind: BuildingKind, floors: number, elevator: boolean): THREE.Group {
  const top = buildingModel(kind);
  if (floors <= 1 && !elevator) return top;
  const g = new THREE.Group();
  const { w, h } = BUILDINGS[kind];
  const extra = floors - 1;
  const fw = w * 0.8;
  const fd = h * 0.68;
  const wall = kind === 'basicRooms' ? PALETTE.wall : kind === 'standardRooms' ? PALETTE.wallWarm : PALETTE.wood;
  for (let f = 0; f < extra; f++) {
    const y = 0.08 + f * FLOOR_H;
    g.add(box(fw, FLOOR_H, fd, wall, 0, y, -0.05));
    g.add(box(fw + 0.06, 0.05, fd + 0.06, PALETTE.white, 0, y + FLOOR_H - 0.05, -0.05));
    const n = Math.max(2, Math.round(fw / 0.45));
    for (let i = 0; i < n; i++) g.add(windowPane(-fw / 2 + (i + 0.5) * (fw / n), y + FLOOR_H / 2, fd / 2 - 0.05 + 0.001, 0.2, 0.22));
  }
  top.position.y = extra * FLOOR_H;
  g.add(top);
  if (elevator) {
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, floors * FLOOR_H + 0.4, 0.28),
      new THREE.MeshLambertMaterial({ color: '#9fd8ee', transparent: true, opacity: 0.75 }),
    );
    shaft.position.set(fw / 2 + 0.12, (floors * FLOOR_H + 0.4) / 2, fd / 2 - 0.2);
    shaft.castShadow = true;
    g.add(shaft);
  }
  return g;
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
 * Bake a model into one mesh per material (Pass 3: a building was 20–40 draw calls).
 * Transforms are applied to the vertices, so the result can be placed and scaled as one piece.
 * The source geometries are disposed.
 */
export function mergeByMaterial(model: THREE.Object3D): THREE.Group {
  model.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[] }>();
  const m = new THREE.Matrix4();
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || Array.isArray(o.material)) return;
    let geo = (o.geometry as THREE.BufferGeometry).clone();
    if (geo.index) geo = geo.toNonIndexed();
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo.applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
    const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: o.material, cast: o.castShadow, receive: o.receiveShadow, geos: [] }));
    b.geos.push(geo);
    (o.geometry as THREE.BufferGeometry).dispose();
  });
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    out.add(mesh);
  }
  return out;
}

/**
 * Bake already-merged models (from mergeByMaterial) into one group with a mesh per material.
 * The models keep their own geometry, so one can be re-baked or animated on its own.
 */
export function mergeLayer(models: THREE.Object3D[]): THREE.Group | null {
  if (!models.length) return null;
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[] }>();
  for (const model of models) {
    model.updateMatrixWorld(true);
    for (const o of model.children) {
      if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) continue;
      const geo = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld);
      const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat: o.material, cast: o.castShadow, receive: o.receiveShadow, geos: [] }));
      b.geos.push(geo);
    }
  }
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    out.add(mesh);
  }
  return out;
}

/**
 * Every footpath as one mesh: a pad per tile plus a strip for each link between neighbours.
 * A link between two levels is a ramp (the stairs), so the walkway reads as one piece.
 * Pieces abut exactly so coplanar tops can't z-fight.
 */
export function pathMesh(
  pads: Array<{ x: number; y: number; top: number }>,
  links: Array<{ x: number; y: number; top: number; dir: 'e' | 's'; to: number }>,
): THREE.Mesh | null {
  if (!pads.length) return null;
  const pos: number[] = [];
  const lift = 0.02;
  // Corners in order a, b, c, d around the quad (counter-clockwise seen from above).
  const quad = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number) =>
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz);
  for (const p of pads) {
    const y = p.top + lift;
    const x0 = p.x + 0.15;
    const x1 = p.x + 0.85;
    const z0 = p.y + 0.15;
    const z1 = p.y + 0.85;
    quad(x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0);
  }
  for (const l of links) {
    const a = l.top + lift;
    const b = l.to + lift;
    if (l.dir === 'e') {
      // From this pad's east edge to the next pad's west edge.
      const x0 = l.x + 0.85;
      const x1 = l.x + 1.15;
      quad(x0, a, l.y + 0.15, x0, a, l.y + 0.85, x1, b, l.y + 0.85, x1, b, l.y + 0.15);
    } else {
      const z0 = l.y + 0.85;
      const z1 = l.y + 1.15;
      quad(l.x + 0.15, a, z0, l.x + 0.15, b, z1, l.x + 0.85, b, z1, l.x + 0.85, a, z0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat(PALETTE.path));
  mesh.receiveShadow = true;
  return mesh;
}

/** Light the windows from 0 (day) to 1 (night). Window materials are shared, so this is cheap. */
export function setWindowGlow(k: number): void {
  const glow = new THREE.Color('#ffc66b').multiplyScalar(0.9 * k);
  for (const c of [PALETTE.window, '#f6d98b']) mat(c).emissive.copy(glow);
}
