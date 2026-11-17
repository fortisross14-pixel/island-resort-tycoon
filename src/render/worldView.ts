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
  private grid: THREE.LineSegments;
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
    s.add(this.pathsGroup, this.buildingsGroup, this.highlightGroup, this.marksGroup, this.ghostGroup);
    this.grid = this.makeGrid();
    this.grid.visible = false;
    s.add(this.grid);
    world.onChange(() => this.sync());
    this.sync();
    stage.setBounds(-2, world.size + 2, -2, world.size + 3);
    // Aim a little towards the camera so the island sits above the build tray.
    const lift = window.innerWidth < window.innerHeight ? 2.2 : 0.8;
    stage.lookAt(world.size / 2 + lift, world.size / 2 + lift);
  }

  setGridVisible(v: boolean): void {
    if (this.grid.visible === v) return;
    this.grid.visible = v;
    this.stage.requestRender();
  }

  // ---------- static scenery ----------

  private buildEnvironment(): void {
    const s = this.stage.scene;
    const n = this.world.size;
    const c = n / 2;

    const sea = new THREE.Mesh(new THREE.PlaneGeometry(300, 300).rotateX(-Math.PI / 2), mat('#3cb3c8'));
    sea.position.set(c, -0.42, c);
    sea.receiveShadow = true;
    s.add(sea);

    const shallowShape = roundedRect(-2.6, -2.6, n + 5.2, n + 5.2, 3.2);
    const shallow = new THREE.Mesh(
      new THREE.ShapeGeometry(shallowShape, 8).rotateX(Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: '#6fd6d6', side: THREE.DoubleSide }),
    );
    shallow.position.y = -0.4;
    shallow.receiveShadow = true;
    s.add(shallow);

    // Beach rim (not buildable) under the grass slab.
    const beachShape = roundedRect(-0.9, -0.9, n + 1.8, n + 1.8, 1.2);
    const beachGeo = new THREE.ExtrudeGeometry(beachShape, { depth: 0.36, bevelEnabled: false, curveSegments: 6 });
    beachGeo.rotateX(Math.PI / 2);
    const beach = new THREE.Mesh(beachGeo, mat(PALETTE.sand));
    beach.position.y = -0.06;
    beach.receiveShadow = true;
    s.add(beach);

    // Grass plateau with a subtle checker so tiles are readable.
    const tex = checkerTexture(n, PALETTE.grass, PALETTE.grassDark);
    const top = new THREE.MeshLambertMaterial({ map: tex });
    const side = mat('#7fb556');
    const slab = new THREE.Mesh(new THREE.BoxGeometry(n, 0.3, n), [side, side, top, side, side, side]);
    slab.position.set(c, -0.15, c);
    slab.receiveShadow = true;
    s.add(slab);

    // Dock: a pier from the landing tile out past the beach (the ferry is FerryView).
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


    // Palms on the beach rim, outside the buildable grid.
    const spots: Array<[number, number, number]> = [
      [-0.45, -0.4, 0.3],
      [2.5, -0.55, -0.2],
      [n + 0.5, 1.5, -0.25],
      [n + 0.45, 6.5, 0.2],
      [-0.5, 4.2, 0.25],
      [-0.4, n - 1.2, -0.2],
      [1.8, n + 0.5, 0.15],
      [n - 1.5, n + 0.5, -0.3],
      [n + 0.4, n + 0.3, 0.2],
    ];
    for (const [x, z, lean] of spots) {
      const p = palm(1.0 + Math.abs(lean), lean);
      p.position.set(x, 0, z);
      p.rotation.y = x * 1.7 + z;
      s.add(p);
    }
  }

  private makeGrid(): THREE.LineSegments {
    const n = this.world.size;
    const pts: number[] = [];
    for (let i = 0; i <= n; i++) {
      pts.push(i, 0.01, 0, i, 0.01, n);
      pts.push(0, 0.01, i, n, 0.01, i);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 }));
  }

  // ---------- dynamic world ----------

  private sync(): void {
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

function checkerTexture(n: number, a: string, b: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? a : b;
      ctx.fillRect(x, y, 1, 1);
    }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
