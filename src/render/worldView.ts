import * as THREE from 'three';
import { BUILDINGS, footprint, type BuildingKind, type Rotation } from '../sim/buildings';
import type { Tile, World } from '../sim/world';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildingModel, mat, mergeByMaterial, mergeLayer, pathMesh, stackedModel } from './models';
import { buildPalms, buildPier, buildTerrain, tileTop } from './terrain';
import type { Stage } from './stage';

export type HighlightTone = 'ok' | 'warn' | 'bad' | 'info';

const TONES: Record<HighlightTone, string> = { ok: '#4fe07a', warn: '#ffc93c', bad: '#ff5a4f', info: '#ffffff' };
/** Bubble fills and text: dark ink on light fills, white only on the deep red (all 4.5:1 or better). */
const BUBBLES: Record<HighlightTone, { fill: string; ink: string }> = {
  ok: { fill: '#8ff0b0', ink: '#10323b' },
  warn: { fill: '#ffd666', ink: '#10323b' },
  bad: { fill: '#b3301d', ink: '#ffffff' },
  info: { fill: '#ffffff', ink: '#10323b' },
};
const POP_TIME = 0.42;
const DUST_TIME = 0.6;

/** One room's check-in preview: a plate around the footprint and a score bubble above the roof. */
export interface RoomMark {
  id: number;
  tiles: Tile[];
  tone: HighlightTone;
  label: string;
  /** Floors, so the bubble clears a tall building's roof. */
  floors?: number;
}

/** Keeps the Three.js scene in sync with the World and draws build previews. */
export class WorldView {
  private pathsGroup = new THREE.Group();
  private buildingsGroup = new THREE.Group();
  private ghostGroup = new THREE.Group();
  private highlightGroup = new THREE.Group();
  private marksGroup = new THREE.Group();
  private marks = new Map<number, THREE.Sprite>();
  private grid = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 }),
  );
  private terrainGroup = new THREE.Group();
  private palmsGroup = new THREE.Group();
  private pierGroup = new THREE.Group();
  private forSaleGroup = new THREE.Group();
  private landMode = false;
  private landKey = '';
  private palmKey = '';
  /** Island id and size the camera was fitted to (refit when a new game changes island). */
  private islandKey = '';
  /** Placed buildings, merged per material and keyed by what they look like. */
  private models = new Map<number, { key: string; obj: THREE.Group }>();
  private pathKey = '';
  private popping = new Map<THREE.Group, number>();
  private dust: Array<{ mesh: THREE.Mesh; t: number }> = [];
  private dustGeo = new THREE.RingGeometry(0.55, 0.8, 24).rotateX(-Math.PI / 2);
  private synced = false;
  /** Every settled building baked into one mesh per material (a handful of draw calls in all). */
  private staticGroup = new THREE.Group();
  /** Skip the placement pop and dust. */
  reduceMotion = false;
  private ghostMats: Record<'ok' | 'bad', THREE.MeshBasicMaterial> = {
    ok: new THREE.MeshBasicMaterial({ color: TONES.ok, transparent: true, opacity: 0.55, depthWrite: false }),
    bad: new THREE.MeshBasicMaterial({ color: TONES.bad, transparent: true, opacity: 0.55, depthWrite: false }),
  };
  private tileMats: Record<HighlightTone, THREE.MeshBasicMaterial> = {
    ok: new THREE.MeshBasicMaterial({ color: TONES.ok, transparent: true, opacity: 0.45, depthWrite: false }),
    bad: new THREE.MeshBasicMaterial({ color: TONES.bad, transparent: true, opacity: 0.45, depthWrite: false }),
    warn: new THREE.MeshBasicMaterial({ color: TONES.warn, transparent: true, opacity: 0.5, depthWrite: false }),
    info: new THREE.MeshBasicMaterial({ color: TONES.info, transparent: true, opacity: 0.3, depthWrite: false }),
  };
  private tileGeo = new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2);

  constructor(
    private stage: Stage,
    private world: World,
  ) {
    const s = stage.scene;
    this.buildEnvironment();
    s.add(this.terrainGroup, this.palmsGroup, this.pierGroup, this.forSaleGroup);
    s.add(this.pathsGroup, this.staticGroup, this.buildingsGroup, this.highlightGroup, this.marksGroup, this.ghostGroup);
    this.grid.visible = false;
    s.add(this.grid);
    world.onChange(() => this.sync());
    this.sync();
    this.frameStart();
  }

  /** Camera limits and sun shadows for the island's size (again after a new game). */
  private fitIsland(): void {
    const w = this.world;
    const key = `${w.layout.id ?? 'square'}:${w.size}`;
    if (key === this.islandKey) return;
    this.islandKey = key;
    this.stage.setBounds(-2, w.size + 2, -2, w.size + 3);
    this.stage.setShadowArea(w.size / 2, w.size / 2, w.size / 2 + 3);
  }

  /** Centre the camera on the land you own. */
  frameStart(): void {
    const owned = this.world.plots.filter((p) => p.owned);
    const x0 = Math.min(...owned.map((p) => p.x));
    const y0 = Math.min(...owned.map((p) => p.y));
    const x1 = Math.max(...owned.map((p) => p.x + p.w));
    const y1 = Math.max(...owned.map((p) => p.y + p.h));
    // Islands: show some of the land around yours too, so you can see where to grow.
    const margin = this.world.layout.terrain ? 4 : 0;
    this.stage.setFit(Math.max(x1 - x0, y1 - y0) + margin);
    // Aim a little towards the camera so the island sits above the build tray.
    const lift = window.innerWidth < window.innerHeight ? 2.6 : 1;
    this.stage.lookAt((x0 + x1) / 2 + lift, (y0 + y1) / 2 + lift);
  }

  setGridVisible(v: boolean): void {
    if (this.grid.visible === v) return;
    this.grid.visible = v;
    this.stage.requestRender();
  }

  /** Show the plots for sale with their price (the Land tool). */
  setLandMode(on: boolean): void {
    this.landMode = on;
    this.syncForSale();
  }

  /** Per frame: placement effects. Returns true while animating. */
  update(dt: number): boolean {
    return this.updateEffects(dt);
  }

  /** Placement feedback: an ease-out-back scale pop and a ring of dust. */
  private updateEffects(dt: number): boolean {
    if (!this.popping.size && !this.dust.length) return false;
    for (const [obj, t0] of this.popping) {
      const t = Math.min(1, t0 + dt / POP_TIME);
      const c1 = 1.70158;
      const c3 = c1 + 1;
      const e = 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
      const sxz = 0.6 + 0.4 * e;
      obj.scale.set(sxz, 0.3 + 0.7 * e, sxz);
      if (t >= 1) {
        obj.scale.set(1, 1, 1);
        this.popping.delete(obj);
        this.buildingsGroup.remove(obj);
        if (!this.popping.size) this.rebuildStatic();
      } else this.popping.set(obj, t);
    }
    for (const d of [...this.dust]) {
      d.t += dt / DUST_TIME;
      const k = Math.min(1, d.t);
      d.mesh.scale.setScalar(d.mesh.userData.size * (0.6 + 0.8 * (1 - (1 - k) ** 2)));
      (d.mesh.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
      if (k >= 1) {
        this.stage.scene.remove(d.mesh);
        (d.mesh.material as THREE.Material).dispose();
        this.dust.splice(this.dust.indexOf(d), 1);
      }
    }
    return true;
  }

  private placeEffect(obj: THREE.Group, w: number, h: number): void {
    if (this.reduceMotion) return;
    obj.scale.set(0.6, 0.3, 0.6);
    this.popping.set(obj, 0);
    this.buildingsGroup.add(obj);
    const ring = new THREE.Mesh(this.dustGeo, new THREE.MeshBasicMaterial({ color: '#fff3d6', transparent: true, opacity: 0.7, depthWrite: false }));
    ring.userData.size = Math.max(w, h) * 0.75;
    ring.position.set(obj.position.x, obj.position.y + 0.05, obj.position.z);
    ring.renderOrder = 5;
    this.stage.scene.add(ring);
    this.dust.push({ mesh: ring, t: 0 });
  }

  // ---------- scenery ----------

  private buildEnvironment(): void {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), mat('#3cb3c8'));
    sea.position.set(this.world.size / 2, -0.42, this.world.size / 2);
    sea.receiveShadow = true;
    this.stage.scene.add(sea);
  }

  /** Rebuild the island when its terrain or the land you own changes. */
  private syncTerrain(): void {
    const w = this.world;
    let key = `${w.layout.id ?? ''}:${w.size}:${w.plots.map((p) => (p.owned ? 1 : 0)).join('')}:`;
    if (w.layout.terrain) for (let y = 0; y < w.size; y++) for (let x = 0; x < w.size; x++) key += w.terrainAt(x, y);
    if (key === this.landKey) return;
    this.landKey = key;
    this.fitIsland();
    disposeTree(this.terrainGroup);
    clear(this.terrainGroup);
    this.terrainGroup.add(buildTerrain(w));
    disposeTree(this.pierGroup);
    clear(this.pierGroup);
    this.pierGroup.add(buildPier(w));

    // Grid lines over owned land, at each tile's height.
    const pts: number[] = [];
    for (let y = 0; y < w.size; y++)
      for (let x = 0; x < w.size; x++) {
        if (!w.isLand(x, y)) continue;
        const t = tileTop(w, x, y) + 0.01;
        pts.push(x, t, y, x + 1, t, y, x, t, y, x, t, y + 1, x + 1, t, y, x + 1, t, y + 1, x, t, y + 1, x + 1, t, y + 1);
      }
    this.grid.geometry.dispose();
    this.grid.geometry = new THREE.BufferGeometry();
    this.grid.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.syncForSale();
  }

  /** Beach palms keep clear of paths and buildings. */
  private syncPalms(): void {
    const w = this.world;
    let key = this.landKey;
    for (const t of w.pathTiles()) key += `${t.x},${t.y};`;
    for (const b of w.buildings) key += `b${b.id}`;
    if (key === this.palmKey) return;
    this.palmKey = key;
    disposeTree(this.palmsGroup);
    clear(this.palmsGroup);
    const palms = buildPalms(w);
    if (palms) this.palmsGroup.add(palms);
  }

  /** Price tags on the plots you could buy next (only while the Land tool is on). */
  private syncForSale(): void {
    for (const c of [...this.forSaleGroup.children]) if (c instanceof THREE.Sprite) c.material.map?.dispose();
    disposeTree(this.forSaleGroup);
    clear(this.forSaleGroup);
    if (this.landMode) {
      const w = this.world;
      for (const p of w.plots) {
        if (p.owned || !p.buyable) continue;
        const r = w.canBuyPlot(p.id);
        const adjacent = r.ok || r.reason === 'Not enough coins';
        if (!adjacent) continue;
        const tone: HighlightTone = r.ok ? 'ok' : 'bad';
        const tiles = w.layout.terrain ? w.plotTiles(p.id) : rectTiles(p);
        const geos = tiles.map((t) => new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2).translate(t.x + 0.5, tileTop(w, t.x, t.y) + 0.04, t.y + 0.5));
        const merged = geos.length ? mergeGeometries(geos, false) : null;
        for (const g of geos) g.dispose();
        if (merged) {
          const plane = new THREE.Mesh(merged, this.tileMats[tone]);
          plane.renderOrder = 2;
          this.forSaleGroup.add(plane);
        }
        // The tag sits over the plot's middle tile.
        const cx = tiles.reduce((a, t) => a + t.x, 0) / Math.max(1, tiles.length);
        const cy = tiles.reduce((a, t) => a + t.y, 0) / Math.max(1, tiles.length);
        const mid = tiles.reduce((best, t) => (Math.hypot(t.x - cx, t.y - cy) < Math.hypot(best.x - cx, best.y - cy) ? t : best), tiles[0] ?? { x: p.x, y: p.y });
        const label = labelSprite(w.priceOf(p.id).toLocaleString('en-US'), tone);
        label.position.set(mid.x + 0.5, tileTop(w, mid.x, mid.y) + 0.3, mid.y + 0.5);
        this.forSaleGroup.add(label);
      }
    }
    this.stage.requestRender();
  }

  // ---------- dynamic world ----------

  private sync(): void {
    this.syncTerrain();
    if (this.landMode) this.syncForSale();
    const w = this.world;
    // Paths: one mesh for the whole network, rebuilt only when the tiles change.
    const tiles = w.pathTiles();
    const pathKey = `${this.landKey.length}|` + tiles.map((t) => `${t.x},${t.y}`).join(';');
    if (pathKey !== this.pathKey) {
      this.pathKey = pathKey;
      clear(this.pathsGroup);
      const links: Array<{ x: number; y: number; top: number; dir: 'e' | 's'; to: number }> = [];
      for (const t of tiles) {
        const top = tileTop(w, t.x, t.y);
        if (w.linked(t.x, t.y, t.x + 1, t.y)) links.push({ x: t.x, y: t.y, top, dir: 'e', to: tileTop(w, t.x + 1, t.y) });
        if (w.linked(t.x, t.y, t.x, t.y + 1)) links.push({ x: t.x, y: t.y, top, dir: 's', to: tileTop(w, t.x, t.y + 1) });
        if (t.x === w.dock.x && t.y === w.dock.y) links.push({ x: t.x, y: t.y, top, dir: 's', to: top });
      }
      const mesh = pathMesh(
        tiles.map((t) => ({ x: t.x, y: t.y, top: tileTop(w, t.x, t.y) })),
        links,
      );
      if (mesh) this.pathsGroup.add(mesh);
    }
    this.syncPalms();
    // Buildings: keep unchanged models, rebuild changed ones, pop the new ones.
    const seen = new Set<number>();
    let changed = false;
    const fresh: Array<{ obj: THREE.Group; w: number; h: number }> = [];
    for (const b of w.buildings) {
      seen.add(b.id);
      const key = `${b.kind}|${b.x}|${b.y}|${b.rot}|${b.floors ?? 1}|${b.elevator ? 1 : 0}`;
      const have = this.models.get(b.id);
      if (have && have.key === key) continue;
      if (have) this.dropModel(b.id);
      const obj = placeModel(mergeByMaterial(stackedModel(b.kind, b.floors ?? 1, !!b.elevator)), b.kind, b.x, b.y, b.rot, tileTop(w, b.x, b.y));
      this.models.set(b.id, { key, obj });
      changed = true;
      const fp = footprint(b.kind, b.rot);
      if (!have) fresh.push({ obj, w: fp.w, h: fp.h });
    }
    for (const id of [...this.models.keys()])
      if (!seen.has(id)) {
        this.dropModel(id);
        changed = true;
      }
    // Pop only what the player just placed (not a load or a new island).
    if (this.synced && fresh.length <= 2) for (const f of fresh) this.placeEffect(f.obj, f.w, f.h);
    this.synced = true;
    if (changed) this.rebuildStatic();
    this.stage.requestRender();
  }

  /** Re-bake the static layer from every building that isn't mid-animation. */
  private rebuildStatic(): void {
    clear(this.staticGroup);
    const objs = [...this.models.values()].map((m) => m.obj).filter((o) => !this.popping.has(o));
    const layer = mergeLayer(objs);
    if (layer) this.staticGroup.add(layer);
    this.stage.requestRender();
  }

  private dropModel(id: number): void {
    const m = this.models.get(id);
    if (!m) return;
    this.buildingsGroup.remove(m.obj);
    this.popping.delete(m.obj);
    disposeTree(m.obj);
    this.models.delete(id);
  }

  /** Translucent preview of a building at a spot, tinted by whether it can go there. */
  showGhost(kind: BuildingKind, x: number, y: number, rot: Rotation, ok: boolean): void {
    clear(this.ghostGroup);
    const model = buildingModel(kind);
    model.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.material = this.ghostMats[ok ? 'ok' : 'bad'];
        o.castShadow = false;
      }
    });
    this.ghostGroup.add(placeModel(model, kind, x, y, rot, tileTop(this.world, x, y)));
    this.highlight(this.world.footprintTiles(kind, x, y, rot), ok ? 'ok' : 'bad');
    // Decor: show how far its appeal reaches.
    const d = BUILDINGS[kind].decor;
    if (d && ok) {
      const ring: Tile[] = [];
      for (let dy = -d.radius; dy <= d.radius; dy++)
        for (let dx = -d.radius; dx <= d.radius; dx++)
          if ((dx || dy) && Math.hypot(dx, dy) <= d.radius + 0.5 && this.world.isGround(x + dx, y + dy)) ring.push({ x: x + dx, y: y + dy });
      this.addTiles(ring, 'info');
    }
  }

  hideGhost(): void {
    if (!this.ghostGroup.children.length && !this.highlightGroup.children.length) return;
    clear(this.ghostGroup);
    clear(this.highlightGroup);
    this.stage.requestRender();
  }

  /** Show check-in previews for rooms (replaces any previous set). */
  showRoomMarks(marks: RoomMark[]): void {
    this.clearRoomMarks();
    for (const mk of marks) {
      const xs = mk.tiles.map((t) => t.x);
      const ys = mk.tiles.map((t) => t.y);
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      const w = Math.max(...xs) - x0 + 1;
      const h = Math.max(...ys) - y0 + 1;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.3, h + 0.3).rotateX(-Math.PI / 2), this.tileMats[mk.tone]);
      const top = tileTop(this.world, x0, y0);
      plate.position.set(x0 + w / 2, top + 0.04, y0 + h / 2);
      plate.renderOrder = 2;
      this.marksGroup.add(plate);
      const sprite = labelSprite(mk.label, mk.tone);
      sprite.position.set(x0 + w / 2, top + 2.0 + ((mk.floors ?? 1) - 1) * 0.62, y0 + h / 2);
      this.marksGroup.add(sprite);
      this.marks.set(mk.id, sprite);
    }
    this.stage.requestRender();
  }

  /** Enlarge one room's bubble (the room under the finger while dragging). */
  focusRoomMark(id: number | null): void {
    for (const [k, sp] of this.marks) {
      const f = k === id ? 1.35 : 1;
      sp.scale.set(sp.userData.w * f, sp.userData.h * f, 1);
    }
    this.stage.requestRender();
  }

  clearRoomMarks(): void {
    if (!this.marksGroup.children.length) return;
    for (const c of [...this.marksGroup.children]) {
      if (c instanceof THREE.Sprite) {
        c.material.map?.dispose();
        c.material.dispose();
      }
    }
    clear(this.marksGroup);
    this.marks.clear();
    this.stage.requestRender();
  }

  highlight(tiles: Tile[], tone: HighlightTone): void {
    clear(this.highlightGroup);
    this.addTiles(tiles, tone);
  }

  private addTiles(tiles: Tile[], tone: HighlightTone): void {
    for (const t of tiles) {
      if (!this.world.inBounds(t.x, t.y)) continue;
      const m = new THREE.Mesh(this.tileGeo, this.tileMats[tone]);
      m.position.set(t.x + 0.5, tileTop(this.world, t.x, t.y) + 0.05, t.y + 0.5);
      m.renderOrder = 2;
      this.highlightGroup.add(m);
    }
    this.stage.requestRender();
  }
}

function placeModel(model: THREE.Group, kind: BuildingKind, x: number, y: number, rot: Rotation, base = 0): THREE.Group {
  const { w, h } = footprint(kind, rot);
  model.position.set(x + w / 2, base, y + h / 2);
  model.rotation.y = -rot * (Math.PI / 2);
  return model;
}

/** Remove children (geometries are small and recreated; shared materials are kept). */
function clear(g: THREE.Group): void {
  for (const c of [...g.children]) {
    g.remove(c);
    c.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry !== undefined) o.geometry.dispose();
    });
  }
}

/** A rounded speech-bubble label drawn on a canvas, always facing the camera. */
function labelSprite(text: string, tone: HighlightTone): THREE.Sprite {
  const { fill: color, ink } = BUBBLES[tone];
  const scale = 4;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const font = `800 ${15 * scale}px ui-rounded, system-ui, sans-serif`;
  ctx.font = font;
  const tw = ctx.measureText(text).width;
  const pad = 9 * scale;
  c.width = Math.ceil(tw + pad * 2);
  c.height = 30 * scale + 8 * scale;
  ctx.font = font;
  const bh = 30 * scale;
  ctx.fillStyle = 'rgba(20, 50, 58, 0.25)';
  roundRect2d(ctx, 0, 3 * scale, c.width, bh, bh / 2);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect2d(ctx, 0, 0, c.width, bh, bh / 2);
  ctx.fill();
  // Little pointer under the bubble.
  ctx.beginPath();
  ctx.moveTo(c.width / 2 - 6 * scale, bh - 1);
  ctx.lineTo(c.width / 2 + 6 * scale, bh - 1);
  ctx.lineTo(c.width / 2, bh + 7 * scale);
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, bh / 2 + scale);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sp = new THREE.Sprite(m);
  const h = 0.62;
  const w = (h * c.width) / c.height;
  sp.scale.set(w, h, 1);
  sp.userData = { w, h };
  sp.center.set(0.5, 0);
  sp.renderOrder = 10;
  return sp;
}

function roundRect2d(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}



function disposeTree(o: THREE.Object3D): void {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) c.geometry.dispose();
  });
}


function rectTiles(p: { x: number; y: number; w: number; h: number }): Tile[] {
  const out: Tile[] = [];
  for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) out.push({ x, y });
  return out;
}
