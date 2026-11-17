import * as THREE from 'three';

/**
 * Renderer, fixed-corner orthographic camera and render-on-demand loop
 * (GDD tech reuse: "Orthographic island scene, pan and pinch, rendering only when
 * something changes").
 */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly renderer: THREE.WebGLRenderer;
  /** World point the camera looks at. */
  readonly target = new THREE.Vector3();
  private readonly offset: THREE.Vector3;
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly raycaster = new THREE.Raycaster();
  private needsRender = true;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private sunCentre = new THREE.Vector3(5, 0, 5);
  private lightKey = -1;
  /** 0 by day, 1 at full night: windows glow and the HUD tint deepens. */
  night = 0;
  private frameHooks: Array<(dt: number) => boolean> = [];
  private lastFrame = 0;
  /** World units visible vertically at zoom 1. */
  private viewHeight = 15;
  /** Tiles across that the default zoom should fit (see setFit). */
  private fit = 10;
  private bounds = { minX: -4, maxX: 14, minZ: -4, maxZ: 14 };

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // Phones: 1.5× is sharp enough and a third fewer pixels than 2× (Pass 3 audit).
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, touch ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.background = new THREE.Color('#7fd3e0');

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    // Fixed corner view: looking from the south-east, slightly above 35°.
    this.offset = new THREE.Vector3(1, 1.15, 1).normalize().multiplyScalar(60);

    const hemi = new THREE.HemisphereLight('#fff6e0', '#4a8a9a', 1.6);
    this.scene.add(hemi);
    this.hemi = hemi;
    const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    sun.shadow.bias = -0.0005;
    sun.shadow.radius = 3;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
    sun.target.position.set(5, 0, 5);
    sun.position.set(5 - 8, 20, 5 + 12);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    const loop = (now: number) => {
      const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.25) : 0;
      this.lastFrame = now;
      for (const hook of this.frameHooks) if (hook(dt)) this.needsRender = true;
      if (this.needsRender) {
        this.needsRender = false;
        this.renderer.render(this.scene, this.camera);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Run every animation frame with the real seconds elapsed; return true to draw this frame. */
  onFrame(hook: (dt: number) => boolean): void {
    this.frameHooks.push(hook);
  }

  /** Cover a square of the map with sun shadows. */
  setShadowArea(cx: number, cz: number, half: number): void {
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -half;
    cam.right = cam.top = half;
    cam.updateProjectionMatrix();
    this.sunCentre.set(cx, 0, cz);
    this.sun.target.position.set(cx, 0, cz);
    this.placeSun(0);
    this.requestRender();
  }

  /**
   * Light for a time of day (game minutes): warm dawn, bright noon, golden evening, blue night.
   * Only recomputed every 5 game minutes.
   */
  setTimeOfDay(minutes: number): void {
    const key = Math.floor(minutes / 5);
    if (key === this.lightKey) return;
    this.lightKey = key;
    const h = minutes / 60;
    const a = lerpKeys(LIGHT_KEYS, h);
    this.sun.color.set(a.sun);
    this.sun.intensity = a.sunI;
    this.hemi.color.set(a.sky);
    this.hemi.groundColor.set(a.ground);
    this.hemi.intensity = a.hemiI;
    (this.scene.background as THREE.Color).set(a.bg);
    this.night = a.night;
    // The sun swings from east to west across the day.
    this.placeSun(THREE.MathUtils.clamp((h - 15) / 8, -1, 1));
    this.requestRender();
  }

  private placeSun(swing: number): void {
    const c = this.sunCentre;
    const ang = swing * 0.9;
    const dx = -8 * Math.cos(ang) - 12 * Math.sin(ang);
    const dz = 12 * Math.cos(ang) - 8 * Math.sin(ang);
    this.sun.position.set(c.x + dx, 20 - Math.abs(swing) * 6, c.z + dz);
  }

  /** Make the default zoom fit an island `tiles` across. */
  setFit(tiles: number): void {
    this.fit = tiles;
    this.resize();
  }

  setBounds(minX: number, maxX: number, minZ: number, maxZ: number): void {
    this.bounds = { minX, maxX, minZ, maxZ };
  }

  lookAt(x: number, z: number): void {
    this.target.set(
      THREE.MathUtils.clamp(x, this.bounds.minX, this.bounds.maxX),
      0,
      THREE.MathUtils.clamp(z, this.bounds.minZ, this.bounds.maxZ),
    );
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    this.requestRender();
  }

  requestRender(): void {
    this.needsRender = true;
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    // On narrow (portrait) screens show more height so the whole island fits across.
    this.viewHeight = aspect < 1 ? (this.fit * 1.65) / aspect : this.fit * 1.5;
    const half = this.viewHeight / 2;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  /** Point under a screen position on the horizontal plane at height `y` (the ground by default). */
  groundAt(clientX: number, clientY: number, y = 0): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    const plane = y === 0 ? this.ground : new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    return this.raycaster.ray.intersectPlane(plane, p) ? p : null;
  }

  /** Pan so the ground point under (x0,y0) ends up under (x1,y1). */
  panScreen(x0: number, y0: number, x1: number, y1: number): void {
    const a = this.groundAt(x0, y0);
    const b = this.groundAt(x1, y1);
    if (!a || !b) return;
    this.lookAt(this.target.x + (a.x - b.x), this.target.z + (a.z - b.z));
  }

  /** Zoom by a factor, keeping the ground point under (cx,cy) fixed. */
  zoomAt(factor: number, cx: number, cy: number): void {
    const before = this.groundAt(cx, cy);
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, 0.6, 3.5);
    this.camera.updateProjectionMatrix();
    const after = this.groundAt(cx, cy);
    if (before && after) this.lookAt(this.target.x + (before.x - after.x), this.target.z + (before.z - after.z));
    this.requestRender();
  }
}

interface LightKey {
  h: number;
  sun: string;
  sunI: number;
  sky: string;
  ground: string;
  hemiI: number;
  bg: string;
  night: number;
}

/** Keyframes by hour. Noon matches the original fixed lighting. */
const LIGHT_KEYS: LightKey[] = [
  { h: 7, sun: '#ffd0a8', sunI: 1.8, sky: '#ffe8d6', ground: '#4a7f96', hemiI: 1.45, bg: '#86cbdc', night: 0 },
  { h: 9, sun: '#ffeacc', sunI: 2.1, sky: '#fff3de', ground: '#4a8a9a', hemiI: 1.55, bg: '#7fd3e0', night: 0 },
  { h: 11, sun: '#fff1d6', sunI: 2.2, sky: '#fff6e0', ground: '#4a8a9a', hemiI: 1.6, bg: '#7fd3e0', night: 0 },
  { h: 16, sun: '#fff1d6', sunI: 2.2, sky: '#fff6e0', ground: '#4a8a9a', hemiI: 1.6, bg: '#7fd3e0', night: 0 },
  { h: 18.5, sun: '#ffc27a', sunI: 1.9, sky: '#ffe0b8', ground: '#5a7f96', hemiI: 1.4, bg: '#8cc9d6', night: 0.1 },
  { h: 20, sun: '#ff8a6a', sunI: 1.1, sky: '#d8b4d8', ground: '#3d5a80', hemiI: 1.1, bg: '#6a8fb8', night: 0.5 },
  { h: 21.5, sun: '#8fa8ff', sunI: 0.55, sky: '#8a9ad8', ground: '#253a66', hemiI: 0.85, bg: '#3a5684', night: 0.9 },
  { h: 24, sun: '#8fa8ff', sunI: 0.5, sky: '#8090d0', ground: '#22355e', hemiI: 0.8, bg: '#334c7a', night: 1 },
];

function lerpKeys(keys: LightKey[], h: number): LightKey {
  if (h <= keys[0].h) return keys[0];
  const last = keys[keys.length - 1];
  if (h >= last.h) return last;
  let i = 0;
  while (keys[i + 1].h < h) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const t = (h - a.h) / (b.h - a.h);
  const col = (x: string, y: string) => '#' + new THREE.Color(x).lerp(new THREE.Color(y), t).getHexString();
  const num = (x: number, y: number) => x + (y - x) * t;
  return {
    h,
    sun: col(a.sun, b.sun),
    sunI: num(a.sunI, b.sunI),
    sky: col(a.sky, b.sky),
    ground: col(a.ground, b.ground),
    hemiI: num(a.hemiI, b.hemiI),
    bg: col(a.bg, b.bg),
    night: num(a.night, b.night),
  };
}
