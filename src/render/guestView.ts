import * as THREE from 'three';
import { MAX_GUESTS, isMoving, isVisible, type Guest, type Sim } from '../sim/sim';
import { mat } from './models';
import type { Stage } from './stage';

const SHIRTS: Record<Guest['type'], string[]> = {
  backpacker: ['#ff9f43', '#f7d046', '#7bc96f', '#4fb0e8'],
  couple: ['#ff7aa8', '#ffffff', '#b38cf0', '#ff6b6b'],
};
const SKIN = ['#f4cfa8', '#d9a47a', '#a8724c', '#7a4f33'];

/**
 * Guests as two instanced meshes (body + head), so ~200 walkers cost two draw calls.
 * Positions are interpolated between sim ticks for smooth motion at any speed.
 */
export class GuestView {
  private bodies: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 1);
  private p = new THREE.Vector3();
  private c = new THREE.Color();
  private time = 0;

  constructor(
    stage: Stage,
    private sim: Sim,
  ) {
    // Chunky and a little oversized so guests read clearly at phone zoom.
    const bodyGeo = new THREE.CylinderGeometry(0.09, 0.13, 0.38, 6);
    bodyGeo.translate(0, 0.19, 0);
    const headGeo = new THREE.IcosahedronGeometry(0.1, 0);
    headGeo.translate(0, 0.48, 0);
    this.bodies = new THREE.InstancedMesh(bodyGeo, mat('#ffffff'), MAX_GUESTS);
    this.heads = new THREE.InstancedMesh(headGeo, mat('#ffffff'), MAX_GUESTS);
    for (const im of [this.bodies, this.heads]) {
      im.count = 0;
      im.castShadow = true;
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      stage.scene.add(im);
    }
  }

  /** alpha = fraction of the way from the previous tick to the current one. */
  update(alpha: number, dtReal: number): void {
    this.time += dtReal;
    let i = 0;
    for (const g of this.sim.guests) {
      if (!isVisible(g) || i >= MAX_GUESTS) continue;
      // A small per-guest offset so groups don't stand inside each other.
      const ox = (((g.look * 37) % 100) / 100 - 0.5) * 0.36;
      const oz = (((g.look * 61) % 100) / 100 - 0.5) * 0.36;
      const x = g.px + (g.x - g.px) * alpha + ox;
      const z = g.pz + (g.z - g.pz) * alpha + oz;
      const bob = isMoving(g) ? Math.abs(Math.sin(this.time * 9 + g.look)) * 0.05 : 0;
      this.p.set(x, 0.02 + bob, z);
      this.m.compose(this.p, this.q, this.s);
      this.bodies.setMatrixAt(i, this.m);
      this.heads.setMatrixAt(i, this.m);
      const shirts = SHIRTS[g.type];
      this.bodies.setColorAt(i, this.c.set(shirts[g.look % shirts.length]));
      this.heads.setColorAt(i, this.c.set(SKIN[g.look % SKIN.length]));
      i++;
    }
    for (const im of [this.bodies, this.heads]) {
      im.count = i;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  /** Guest nearest a ground point, within reach (for tap-to-inspect). */
  pick(x: number, z: number, reach = 0.35): Guest | null {
    let best: Guest | null = null;
    let bestD = reach;
    for (const g of this.sim.guests) {
      if (!isVisible(g)) continue;
      const d = Math.hypot(g.x - x, g.z - z);
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    return best;
  }
}

/** The ferry: sails in from the open sea to the pier and back out. */
export class FerryView {
  private boat = new THREE.Group();
  private time = 0;

  constructor(
    stage: Stage,
    private sim: Sim,
  ) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 2.0), mat('#ffffff'));
    hull.castShadow = true;
    // Pointed bow: a box turned 45° so a corner sticks out ahead of the hull.
    const bow = new THREE.Mesh(new THREE.BoxGeometry(0.636, 0.3, 0.636), mat('#ffffff'));
    bow.rotation.y = Math.PI / 4;
    bow.scale.set(1, 1, 1);
    bow.position.set(0, 0, -1.0);
    bow.castShadow = true;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.06, 2.02), mat('#3fa7a0'));
    stripe.position.y = 0.06;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.8), mat('#3fa7a0'));
    cabin.position.set(0, 0.32, 0.15);
    cabin.castShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.95), mat('#fff4e2'));
    roof.position.set(0, 0.52, 0.15);
    this.boat.add(hull, bow, stripe, cabin, roof);
    stage.scene.add(this.boat);
    this.update(0);
  }

  update(dtReal: number): void {
    this.time += dtReal;
    const f = this.sim.ferry;
    const pos = this.sim.ferryPosition(f.t);
    this.boat.visible = f.phase !== 'away';
    // Gentle bob, a bit stronger while under way.
    const sway = f.phase === 'docked' ? 0.012 : 0.03;
    this.boat.position.set(pos.x, -0.28 + Math.sin(this.time * 2.2) * sway, pos.z);
    this.boat.rotation.z = Math.sin(this.time * 1.7) * sway;
    // Bow points towards the island when arriving, out to sea when leaving.
    this.boat.rotation.y = f.phase === 'leaving' ? Math.PI : 0;
  }
}
