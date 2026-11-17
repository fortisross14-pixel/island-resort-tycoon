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
  private frameHooks: Array<(dt: number) => boolean> = [];
  private lastFrame = 0;
  /** World units visible vertically at zoom 1. */
  private viewHeight = 15;
  /** Tiles across that the default zoom should fit (see setFit). */
  private fit = 10;
  private bounds = { minX: -4, maxX: 14, minZ: -4, maxZ: 14 };

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.background = new THREE.Color('#7fd3e0');

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    // Fixed corner view: looking from the south-east, slightly above 35°.
    this.offset = new THREE.Vector3(1, 1.15, 1).normalize().multiplyScalar(60);

    const hemi = new THREE.HemisphereLight('#fff6e0', '#4a8a9a', 1.6);
    this.scene.add(hemi);
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
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx - 8, 20, cz + 12);
    this.requestRender();
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

  /** Ground-plane point under a screen position. */
  groundAt(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.ground, p) ? p : null;
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
