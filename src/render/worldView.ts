import * as THREE from 'three';
import { footprint, type BuildingKind, type Rotation } from '../sim/buildings';
import type { Tile, World } from '../sim/world';
import { PALETTE, buildingModel, mat, palm, pathTile } from './models';
import type { Stage } from './stage';

export type HighlightTone = 'ok' | 'warn' | 'bad' | 'info';

const TONES: Record<HighlightTone, string> = { ok: '#4fe07a', warn: '#ffc93c', bad: '#ff5a4f', info: '#ffffff' };

/** One room's check-in preview: a plate around the footprint and a score bubble above the roof. */
export interface RoomMark {
  id: number;
  tiles: Tile[];
  tone: HighlightTone;
  label: string;
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
  private plotGroups = new Map<number, THREE.Group>();
  private beachGroup = new THREE.Group();
  private palmsGroup = new THREE.Group();
  private forSaleGroup = new THREE.Group();
  private landMode = false;
  private landKey = '';
  /** Plots rising out of the sea after purchase: id → seconds since bought. */
  private rising = new Map<number, number>();
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
    s.add(this.terrainGroup, this.beachGroup, this.palmsGroup, this.forSaleGroup);
    s.add(this.pathsGroup, this.buildingsGroup, this.highlightGroup, this.marksGroup, this.ghostGroup);
    this.grid.visible = false;
    s.add(this.grid);
    world.onChange(() => this.sync());
    this.syncTerrain(false);
    this.sync();
    stage.setBounds(-2, world.size + 2, -2, world.size + 3);
    stage.setShadowArea(world.size / 2, world.size / 2, world.size / 2 + 3);
    this.frameStart();
  }

  /** Centre the camera on the land you own. */
  frameStart(): void {
    const owned = this.world.plots.filter((p) => p.owned);
    const x0 = Math.min(...owned.map((p) => p.x));
    const y0 = Math.min(...owned.map((p) => p.y));
    const x1 = Math.max(...owned.map((p) => p.x + p.w));
    const y1 = Math.max(...owned.map((p) => p.y + p.h));
    this.stage.setFit(Math.max(x1 - x0, y1 - y0));
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

  /** Per frame: plots rising from the sea. Returns true while animating. */
  update(dt: number): boolean {
    if (!this.rising.size) return false;
    for (const [id, t0] of this.rising) {
      const t = Math.min(1, t0 + dt / 0.9);
      const g = this.plotGroups.get(id);
      if (g) g.position.y = -0.9 * (1 - t) ** 3;
      if (t >= 1) this.rising.delete(id);
      else this.rising.set(id, t);
    }
    return true;
  }

  // ---------- scenery ----------

  private buildEnvironment(): void {
    const s = this.stage.scene;
    const n = this.world.size;
    const c = n / 2;

    const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), mat('#3cb3c8'));
    sea.position.set(c, -0.42, c);
    sea.receiveShadow = true;
    s.add(sea);

    // Shallow lagoon over the whole map: the plots for sale sit in it.
    const shallowShape = roundedRect(-2.6, -2.6, n + 5.2, n + 5.2, 4);
    const shallow = new THREE.Mesh(
      new THREE.ShapeGeometry(shallowShape, 8).rotateX(Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: '#6fd6d6', side: THREE.DoubleSide }),
    );
    shallow.position.y = -0.4;
    shallow.receiveShadow = true;
    s.add(shallow);

    // Dock: a pier from the landing tile out over the harbour (the ferry is FerryView).
    const d = this.world.dock;
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
    pier.position.set(d.x + 0.5, -0.02, d.y + 1);
    s.add(pier);
  }

  /** Rebuild land, beach, palms and grid when the owned plots change. */
  private syncTerrain(animate: boolean): void {
    const w = this.world;
    const key = w.plots.map((p) => (p.owned ? 1 : 0)).join('');
    if (key === this.landKey) return;
    this.landKey = key;

    for (const p of w.plots) {
      if (!p.owned || this.plotGroups.has(p.id)) continue;
      const g = plotLand(p.x, p.y, p.w, p.h);
      this.plotGroups.set(p.id, g);
      this.terrainGroup.add(g);
      if (animate) {
        g.position.y = -0.9;
        this.rising.set(p.id, 0);
      }
    }
    for (const [id, g] of this.plotGroups)
      if (!w.plots.find((p) => p.id === id)?.owned) {
        this.terrainGroup.remove(g);
        disposeTree(g);
        this.plotGroups.delete(id);
      }

    // A one-tile beach around the land, and palms on some of it.
    disposeTree(this.beachGroup);
    clear(this.beachGroup);
    clear(this.palmsGroup);
    const ring: Tile[] = [];
    const d = w.dock;
    for (let y = -1; y <= w.size; y++)
      for (let x = -1; x <= w.size; x++) {
        if (w.isLand(x, y)) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (w.isLand(x + dx, y + dy)) near = true;
        if (near) ring.push({ x, y });
      }
    const sand = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.36, 1), mat(PALETTE.sand), ring.length);
    const m = new THREE.Matrix4();
    ring.forEach((t, i) => {
      m.makeTranslation(t.x + 0.5, -0.06 - 0.18, t.y + 0.5);
      sand.setMatrixAt(i, m);
      const h = hash(t.x, t.y);
      const onPier = t.x === d.x && t.y > d.y;
      if (h % 7 === 0 && !onPier) {
        const lean = ((h % 13) / 13 - 0.5) * 0.6;
        const p = palm(1.0 + Math.abs(lean), lean);
        p.position.set(t.x + 0.5, -0.06, t.y + 0.5);
        p.rotation.y = h;
        this.palmsGroup.add(p);
      }
    });
    sand.receiveShadow = true;
    this.beachGroup.add(sand);

    // Grid lines over owned land only.
    const pts: number[] = [];
    for (let y = 0; y < w.size; y++)
      for (let x = 0; x < w.size; x++) {
        if (!w.isLand(x, y)) continue;
        pts.push(x, 0.01, y, x + 1, 0.01, y, x, 0.01, y, x, 0.01, y + 1);
        if (!w.isLand(x + 1, y)) pts.push(x + 1, 0.01, y, x + 1, 0.01, y + 1);
        if (!w.isLand(x, y + 1)) pts.push(x, 0.01, y + 1, x + 1, 0.01, y + 1);
      }
    this.grid.geometry.dispose();
    this.grid.geometry = new THREE.BufferGeometry();
    this.grid.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.syncForSale();
  }

  /** Price tags on the plots you could buy next (only while the Land tool is on). */
  private syncForSale(): void {
    for (const c of [...this.forSaleGroup.children]) if (c instanceof THREE.Sprite) c.material.map?.dispose();
    disposeTree(this.forSaleGroup);
    clear(this.forSaleGroup);
    if (this.landMode) {
      const w = this.world;
      const price = w.plotPrice.toLocaleString('en-US');
      for (const p of w.plots) {
        if (p.owned || !p.buyable) continue;
        const r = w.canBuyPlot(p.id);
        const adjacent = r.ok || r.reason === 'Not enough coins';
        if (!adjacent) continue;
        const tone: HighlightTone = r.ok ? 'ok' : 'bad';
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(p.w - 0.2, p.h - 0.2).rotateX(-Math.PI / 2), this.tileMats[tone]);
        plane.position.set(p.x + p.w / 2, -0.36, p.y + p.h / 2);
        plane.renderOrder = 2;
        this.forSaleGroup.add(plane);
        const label = labelSprite(price, TONES[tone]);
        label.position.set(p.x + p.w / 2, 0.2, p.y + p.h / 2);
        this.forSaleGroup.add(label);
      }
    }
    this.stage.requestRender();
  }

  // ---------- dynamic world ----------

  private sync(): void {
    this.syncTerrain(true);
    if (this.landMode) this.syncForSale();
    clear(this.pathsGroup);
    clear(this.buildingsGroup);
    const w = this.world;
    for (const t of w.pathTiles()) {
      const p = pathTile({
        n: w.isPath(t.x, t.y - 1),
        s: w.isPath(t.x, t.y + 1) || (t.x === w.dock.x && t.y === w.dock.y),
        e: w.isPath(t.x + 1, t.y),
        w: w.isPath(t.x - 1, t.y),
      });
      p.position.set(t.x + 0.5, 0, t.y + 0.5);
      this.pathsGroup.add(p);
    }
    for (const b of w.buildings) this.buildingsGroup.add(placeModel(buildingModel(b.kind), b.kind, b.x, b.y, b.rot));
    this.stage.requestRender();
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
    this.ghostGroup.add(placeModel(model, kind, x, y, rot));
    this.highlight(this.world.footprintTiles(kind, x, y, rot), ok ? 'ok' : 'bad');
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
      plate.position.set(x0 + w / 2, 0.04, y0 + h / 2);
      plate.renderOrder = 2;
      this.marksGroup.add(plate);
      const sprite = labelSprite(mk.label, TONES[mk.tone]);
      sprite.position.set(x0 + w / 2, 2.0, y0 + h / 2);
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
    for (const t of tiles) {
      if (!this.world.inBounds(t.x, t.y)) continue;
      const m = new THREE.Mesh(this.tileGeo, this.tileMats[tone]);
      m.position.set(t.x + 0.5, 0.05, t.y + 0.5);
      m.renderOrder = 2;
      this.highlightGroup.add(m);
    }
    this.stage.requestRender();
  }
}

function placeModel(model: THREE.Group, kind: BuildingKind, x: number, y: number, rot: Rotation): THREE.Group {
  const { w, h } = footprint(kind, rot);
  model.position.set(x + w / 2, 0, y + h / 2);
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
function labelSprite(text: string, color: string): THREE.Sprite {
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
  ctx.fillStyle = color === TONES.warn || color === TONES.info ? '#23404a' : '#ffffff';
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

/** Grass for one plot: a tile per instance, in a soft checker so tiles are readable. */
function plotLand(x0: number, y0: number, w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(1, 0.3, 1);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), w * h);
  const m = new THREE.Matrix4();
  const a = new THREE.Color(PALETTE.grass);
  const b = new THREE.Color(PALETTE.grassDark);
  let i = 0;
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      m.makeTranslation(x + 0.5, -0.15, y + 0.5);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, (x + y) % 2 ? a : b);
      i++;
    }
  mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function disposeTree(o: THREE.Object3D): void {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) c.geometry.dispose();
  });
}

function roundedRect(x: number, y: number, w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
