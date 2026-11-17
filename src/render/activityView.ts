import * as THREE from 'three';
import { activityOf, type Landmark, type Route } from '../sim/activities';
import type { Sim } from '../sim/sim';
import type { Tile, World } from '../sim/world';
import { PALETTE, mat, tourBoat } from './models';
import type { Stage } from './stage';
import { hash, tileTop } from './terrain';

const WATER_Y = -0.33;

/**
 * Activities on the map (Pass 4 step 3): landmark models, the routes drawn for hikes and
 * boat tours, a route being drawn, and sessions out on their trip (a boat or kayaks on the
 * water, a little group on the trail, a class on the yoga deck).
 */
export class ActivityView {
  private landmarksGroup = new THREE.Group();
  private routesGroup = new THREE.Group();
  private draftGroup = new THREE.Group();
  private labelsGroup = new THREE.Group();
  private tripsGroup = new THREE.Group();
  private landmarkKey = '';
  private routeKey = '';
  private boats = new Map<string, THREE.Group>();
  private walkers: THREE.InstancedMesh;
  private time = 0;
  private trailMat = new THREE.MeshLambertMaterial({ color: '#c9a36a' });
  private waterMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false });
  private draftMats = {
    ok: new THREE.MeshBasicMaterial({ color: '#4fe07a', transparent: true, opacity: 0.6, depthWrite: false }),
    bad: new THREE.MeshBasicMaterial({ color: '#ff5a4f', transparent: true, opacity: 0.6, depthWrite: false }),
    start: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false }),
  };

  constructor(
    private stage: Stage,
    private world: World,
    private sim: Sim,
  ) {
    stage.scene.add(this.landmarksGroup, this.routesGroup, this.draftGroup, this.labelsGroup, this.tripsGroup);
    const body = new THREE.CapsuleGeometry(0.07, 0.2, 2, 6).translate(0, 0.18, 0);
    this.walkers = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial({ color: '#ffffff' }), 64);
    this.walkers.count = 0;
    this.walkers.frustumCulled = false;
    this.walkers.castShadow = true;
    this.tripsGroup.add(this.walkers);
    world.onChange(() => this.sync());
    this.sync();
  }

  private sync(): void {
    const w = this.world;
    const lk = `${w.layout.id ?? ''}:${w.size}`;
    if (lk !== this.landmarkKey) {
      this.landmarkKey = lk;
      clearGroup(this.landmarksGroup);
      for (const l of w.landmarks) this.landmarksGroup.add(landmarkModel(w, l));
    }
    const rk = JSON.stringify(w.routes);
    if (rk !== this.routeKey) {
      this.routeKey = rk;
      clearGroup(this.routesGroup);
      for (const r of w.routes) {
        const m = this.routeMesh(r);
        if (m) this.routesGroup.add(m);
      }
    }
    this.stage.requestRender();
  }

  /** A dotted line along a route: dirt for trails, white dashes on the water. */
  private routeMesh(r: Route): THREE.Mesh | null {
    const geos: THREE.BufferGeometry[] = [];
    const pts = r.tiles.map((t) => this.point(t, r.kind));
    for (let i = 0; i < pts.length - 1; i++) {
      for (let k = 0; k < 3; k++) {
        const p = pts[i].clone().lerp(pts[i + 1], (k + 0.5) / 3);
        const g = new THREE.CircleGeometry(r.kind === 'trail' ? 0.09 : 0.07, 6).rotateX(-Math.PI / 2);
        g.translate(p.x, p.y + 0.03, p.z);
        geos.push(g);
      }
    }
    if (!geos.length) return null;
    const merged = mergeAll(geos);
    const mesh = new THREE.Mesh(merged, r.kind === 'trail' ? this.trailMat : this.waterMat);
    mesh.renderOrder = 3;
    return mesh;
  }

  private point(t: Tile, kind: 'trail' | 'water'): THREE.Vector3 {
    return new THREE.Vector3(t.x + 0.5, kind === 'trail' ? tileTop(this.world, t.x, t.y) : WATER_Y, t.y + 0.5);
  }

  /** The route being drawn: its tiles, where it can start, and names over the landmarks. */
  setDraft(tiles: Tile[], starts: Tile[], ok: boolean, kind: 'trail' | 'water' | null): void {
    clearGroup(this.draftGroup);
    for (const c of [...this.labelsGroup.children]) if (c instanceof THREE.Sprite) c.material.map?.dispose();
    clearGroup(this.labelsGroup);
    if (!kind) return this.stage.requestRender();
    const quad = (t: Tile, m: THREE.Material) => {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2), m);
      const p = this.point(t, kind);
      q.position.set(p.x, p.y + 0.06, p.z);
      q.renderOrder = 4;
      this.draftGroup.add(q);
    };
    if (!tiles.length) for (const t of starts) quad(t, this.draftMats.start);
    for (const t of tiles) quad(t, ok ? this.draftMats.ok : this.draftMats.bad);
    // Landmarks of the right kind get a name tag while drawing.
    for (const l of this.world.landmarks) {
      const land = ['waterfall', 'ruins', 'viewpoint', 'cave'].includes(l.kind);
      if (land !== (kind === 'trail')) continue;
      const s = nameTag(l.name);
      s.position.set(l.x + 0.5, (land ? tileTop(this.world, l.x, l.y) : 0) + 1.3, l.y + 0.5);
      this.labelsGroup.add(s);
    }
    this.stage.requestRender();
  }

  /** Per frame: move boats and hikers. Returns true while anything is out. */
  update(dt: number): boolean {
    this.time += dt;
    const now = this.sim.minutes;
    const seen = new Set<string>();
    let walkers = 0;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    for (const trip of this.sim.trips) {
      if (!trip.people || now < trip.start || now >= trip.end) continue;
      const b = this.world.buildings.find((x) => x.id === trip.hubId);
      const def = b && activityOf(b.kind);
      if (!b || !def) continue;
      const p = (now - trip.start) / (trip.end - trip.start);
      const route = this.world.routeOf(b.id);
      const key = `${trip.hubId}:${trip.slot}`;
      if (def.kind === 'yoga') {
        // A class on the deck: people in a row.
        for (let i = 0; i < Math.min(trip.people, 8) && walkers < 64; i++) {
          const bob = Math.sin(this.time * 1.5 + i) * 0.03;
          m.makeTranslation(b.x + 0.4 + (i % 4) * 0.36, tileTop(this.world, b.x, b.y) + 0.12 + bob, b.y + 0.6 + Math.floor(i / 4) * 0.6);
          this.walkers.setMatrixAt(walkers, m);
          this.walkers.setColorAt(walkers++, c.set(['#e64a8a', '#3fa7a0', '#f2b441', '#7a5cff'][i % 4]));
        }
        continue;
      }
      if (!route || route.tiles.length < 2) continue;
      // Out to the far end and back.
      const u = p < 0.5 ? p * 2 : (1 - p) * 2;
      const f = u * (route.tiles.length - 1);
      const i0 = Math.floor(f);
      const i1 = Math.min(route.tiles.length - 1, i0 + 1);
      const a = this.point(route.tiles[i0], route.kind);
      const z = this.point(route.tiles[i1], route.kind);
      const pos = a.clone().lerp(z, f - i0);
      const dir = (p < 0.5 ? z.clone().sub(a) : a.clone().sub(z)).normalize();
      if (route.kind === 'water') {
        seen.add(key);
        let boat = this.boats.get(key);
        if (!boat) {
          boat = tourBoat(def.kind === 'kayak');
          this.boats.set(key, boat);
          this.tripsGroup.add(boat);
        }
        boat.position.set(pos.x, pos.y + Math.sin(this.time * 2.5) * 0.02, pos.z);
        if (dir.lengthSq() > 0) boat.rotation.y = Math.atan2(dir.x, dir.z);
      } else {
        // Hikers in single file behind the guide.
        for (let i = 0; i < Math.min(trip.people, 10) && walkers < 64; i++) {
          const back = Math.max(0, f - i * 0.35 * (p < 0.5 ? 1 : -1));
          const j0 = Math.min(route.tiles.length - 1, Math.floor(back));
          const j1 = Math.min(route.tiles.length - 1, j0 + 1);
          const q = this.point(route.tiles[j0], 'trail').lerp(this.point(route.tiles[j1], 'trail'), back - j0);
          m.makeTranslation(q.x + ((i % 2) - 0.5) * 0.15, q.y + Math.abs(Math.sin(this.time * 8 + i)) * 0.03, q.z);
          this.walkers.setMatrixAt(walkers, m);
          this.walkers.setColorAt(walkers++, c.set(i === 0 ? '#2e9e4f' : ['#ff7a59', '#4fc6e8', '#ffd166', '#c88cff'][i % 4]));
        }
      }
    }
    for (const [key, boat] of this.boats)
      if (!seen.has(key)) {
        this.tripsGroup.remove(boat);
        this.boats.delete(key);
      }
    this.walkers.count = walkers;
    this.walkers.instanceMatrix.needsUpdate = true;
    if (this.walkers.instanceColor) this.walkers.instanceColor.needsUpdate = true;
    return seen.size > 0 || walkers > 0;
  }
}

function clearGroup(g: THREE.Group): void {
  for (const c of [...g.children]) {
    g.remove(c);
    c.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}

function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  for (const g of geos) count += (g.index ? g.index.count : g.attributes.position.count) * 3;
  const pos = new Float32Array(count);
  let o = 0;
  for (const g of geos) {
    const p = g.attributes.position;
    const idx = g.index;
    const n = idx ? idx.count : p.count;
    for (let i = 0; i < n; i++) {
      const v = idx ? idx.getX(i) : i;
      pos[o++] = p.getX(v);
      pos[o++] = p.getY(v);
      pos[o++] = p.getZ(v);
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}

function nameTag(text: string): THREE.Sprite {
  const s = 4;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const font = `800 ${13 * s}px ui-rounded, system-ui, sans-serif`;
  ctx.font = font;
  c.width = Math.ceil(ctx.measureText(text).width + 20 * s);
  c.height = 26 * s;
  ctx.fillStyle = 'rgba(16, 50, 59, 0.88)';
  ctx.beginPath();
  ctx.roundRect(0, 0, c.width, c.height, c.height / 2);
  ctx.fill();
  ctx.font = font;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  const h = 0.5;
  sp.scale.set((h * c.width) / c.height, h, 1);
  sp.center.set(0.5, 0);
  sp.renderOrder = 11;
  return sp;
}

/** Small models that mark each landmark on the map. */
function landmarkModel(world: World, l: Landmark): THREE.Group {
  const g = new THREE.Group();
  const land = ['waterfall', 'ruins', 'viewpoint', 'cave'].includes(l.kind);
  const y = land ? tileTop(world, l.x, l.y) : WATER_Y;
  g.position.set(l.x + 0.5, y, l.y + 0.5);
  const box = (w: number, h: number, d: number, color: string, x = 0, yy = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, yy + h / 2, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const h = hash(l.x, l.y);
  switch (l.kind) {
    case 'waterfall': {
      box(0.5, 0.9, 0.3, '#8d897c', 0, 0, -0.2);
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.85), new THREE.MeshBasicMaterial({ color: '#bfefff', transparent: true, opacity: 0.85 }));
      fall.position.set(0, 0.45, -0.04);
      g.add(fall);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(0.3, 10).rotateX(-Math.PI / 2), mat('#4fc6e8'));
      pool.position.set(0, 0.02, 0.15);
      g.add(pool);
      break;
    }
    case 'ruins':
      box(0.18, 0.55, 0.18, '#9a9282', -0.25, 0, -0.2);
      box(0.18, 0.4, 0.18, '#a39e8f', 0.22, 0, -0.15);
      box(0.6, 0.12, 0.18, '#8d897c', 0, 0.55, -0.2);
      box(0.25, 0.12, 0.2, '#a39e8f', 0.1, 0, 0.25);
      break;
    case 'viewpoint': {
      box(0.06, 0.9, 0.06, PALETTE.woodDark);
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 3), mat('#ff7a59'));
      flag.rotation.z = -Math.PI / 2;
      flag.position.set(0.15, 0.8, 0);
      g.add(flag);
      break;
    }
    case 'cave':
      box(0.7, 0.5, 0.4, '#7d7a6e');
      box(0.3, 0.3, 0.05, '#2a2a2a', 0, 0, 0.2);
      break;
    case 'turtles':
      for (let i = 0; i < 3; i++) {
        const t = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat('#3f8f5a'));
        t.scale.set(1, 0.5, 1.3);
        t.position.set(-0.3 + i * 0.3, 0.02, ((h >> i) % 3) * 0.15 - 0.15);
        g.add(t);
      }
      break;
    case 'dolphins':
      for (let i = 0; i < 2; i++) {
        const fin = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 3), mat('#6d7f8f'));
        fin.position.set(-0.2 + i * 0.4, 0.1, i * 0.2);
        g.add(fin);
      }
      break;
    case 'coral':
      for (let i = 0; i < 5; i++) {
        const k = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), mat(['#ff8a7a', '#c88cff', '#ffd166'][i % 3]));
        k.position.set(Math.cos(i * 1.3) * 0.3, 0.03, Math.sin(i * 1.3) * 0.3);
        g.add(k);
      }
      break;
    case 'mangroves':
      for (let i = 0; i < 3; i++) {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.4, 4), mat(PALETTE.trunk));
        trunk.position.set(-0.25 + i * 0.25, 0.2, (i % 2) * 0.2);
        g.add(trunk);
        const top = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), mat('#2f7d3a'));
        top.position.set(-0.25 + i * 0.25, 0.45, (i % 2) * 0.2);
        g.add(top);
      }
      break;
  }
  return g;
}
