import * as THREE from 'three';
import type { Stage } from './stage';

interface Pop {
  sprite: THREE.Sprite;
  age: number;
  y0: number;
}

const LIFE = 1.2;
const MAX_POPS = 40;

/**
 * "+12" coin labels that float up from a building on every purchase (GDD: "Every
 * purchase pops a coin above the building it happened in").
 */
export class CoinPops {
  private pops: Pop[] = [];
  private textures = new Map<number, THREE.CanvasTexture>();

  constructor(private stage: Stage) {}

  spawn(x: number, z: number, amount: number): void {
    if (this.pops.length >= MAX_POPS) this.remove(this.pops[0]);
    const mat = new THREE.SpriteMaterial({ map: this.texture(amount), depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(mat);
    const img = mat.map!.image as HTMLCanvasElement;
    const h = 0.42;
    sprite.scale.set((h * img.width) / img.height, h, 1);
    sprite.center.set(0.5, 0);
    sprite.renderOrder = 12;
    const jitter = (Math.random() - 0.5) * 0.4;
    sprite.position.set(x + jitter, 1.2, z - jitter);
    this.stage.scene.add(sprite);
    this.pops.push({ sprite, age: 0, y0: 1.2 });
  }

  /** dt in sim-speed seconds, so pops keep pace with 2× and 4×. */
  update(dt: number): boolean {
    if (!this.pops.length) return false;
    for (const p of [...this.pops]) {
      p.age += dt;
      const t = p.age / LIFE;
      if (t >= 1) {
        this.remove(p);
        continue;
      }
      p.sprite.position.y = p.y0 + t * 0.9;
      p.sprite.material.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    }
    return true;
  }

  private remove(p: Pop): void {
    this.stage.scene.remove(p.sprite);
    p.sprite.material.dispose();
    this.pops.splice(this.pops.indexOf(p), 1);
  }

  /** One cached texture per amount; amounts repeat a lot. */
  private texture(amount: number): THREE.CanvasTexture {
    let t = this.textures.get(amount);
    if (t) return t;
    const s = 4;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    const font = `800 ${16 * s}px ui-rounded, system-ui, sans-serif`;
    ctx.font = font;
    const text = `+${amount}`;
    const tw = ctx.measureText(text).width;
    const r = 9 * s;
    c.width = Math.ceil(r * 2 + 4 * s + tw + 2 * s);
    c.height = 24 * s;
    const cy = c.height / 2;
    const grad = ctx.createRadialGradient(r * 0.7, cy - r * 0.3, 1, r, cy, r);
    grad.addColorStop(0, '#ffe38a');
    grad.addColorStop(0.6, '#f5b82e');
    grad.addColorStop(1, '#d69412');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(r + s, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4 * s;
    ctx.strokeStyle = 'rgba(35, 64, 74, 0.85)';
    ctx.lineJoin = 'round';
    const tx = r * 2 + 4 * s;
    ctx.strokeText(text, tx, cy + s);
    ctx.fillStyle = '#fff6d6';
    ctx.fillText(text, tx, cy + s);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(amount, t);
    return t;
  }
}
