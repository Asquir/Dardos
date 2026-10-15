// Renderizador único de la app: un solo canvas WebGL detrás de la interfaz HTML.
// Cada pantalla registra una "vista" (escena + cámara) y el motor dibuja la activa.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type Quality = 'low' | 'medium' | 'high';

export interface View {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(t: number, dt: number): void;
  resize?(w: number, h: number): void;
  bloom?: { strength: number; radius: number; threshold: number };
  exposure?: number;
  /** gradación de color (se lee en cada fotograma, así que se puede animar) */
  grade?: Partial<Grade>;
  onActivate?(): void;
  onDeactivate?(): void;
}

export interface Grade {
  /** oscurecimiento de las esquinas */
  vignette: number;
  saturation: number;
  contrast: number;
  /** tinte de sombras y de luces (estilo cine) */
  shadows: [number, number, number];
  highlights: [number, number, number];
  grain: number;
  /** aberración cromática en los bordes */
  aberration: number;
}

const DEFAULT_GRADE: Grade = {
  vignette: 0.42,
  saturation: 1.06,
  contrast: 1.05,
  shadows: [-0.012, 0.0, 0.02],
  highlights: [0.018, 0.008, -0.012],
  grain: 0.02,
  aberration: 0.25,
};

// Se aplica después del mapeo de tonos (espacio de pantalla).
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    vignette: { value: 0.42 },
    flash: { value: 0 },
    saturation: { value: 1 },
    contrast: { value: 1 },
    shadowTint: { value: new THREE.Vector3() },
    highTint: { value: new THREE.Vector3() },
    grain: { value: 0 },
    aberration: { value: 0 },
    time: { value: 0 },
    res: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float vignette;
    uniform float flash;
    uniform float saturation;
    uniform float contrast;
    uniform vec3 shadowTint;
    uniform vec3 highTint;
    uniform float grain;
    uniform float aberration;
    uniform float time;
    uniform vec2 res;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec3 c;
      if (aberration > 0.0) {
        vec2 off = d * r2 * aberration * 0.06;
        c.r = texture2D(tDiffuse, vUv + off).r;
        c.g = texture2D(tDiffuse, vUv).g;
        c.b = texture2D(tDiffuse, vUv - off).b;
      } else {
        c = texture2D(tDiffuse, vUv).rgb;
      }
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5;
      c += shadowTint * (1.0 - smoothstep(0.0, 0.55, l)) + highTint * smoothstep(0.45, 1.0, l);
      float v = smoothstep(0.86, 0.18, length(d * vec2(1.0, 0.82)));
      c *= mix(1.0 - vignette, 1.0, v);
      c += flash * vec3(1.0, 0.95, 0.85);
      float n = fract(sin(dot(vUv * res + fract(time) * 97.0, vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * grain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

class Engine {
  canvas!: HTMLCanvasElement;
  renderer!: THREE.WebGLRenderer;
  composer: EffectComposer | null = null;
  renderPass: RenderPass | null = null;
  bloom: UnrealBloomPass | null = null;
  grade: ShaderPass | null = null;
  /** cámara lenta (1 = normal) */
  timeScale = 1;
  envMap: THREE.Texture | null = null;
  quality: Quality = 'high';
  view: View | null = null;
  private last = 0;
  private time = 0;
  private running = false;
  private flash = 0;
  private fpsSamples: number[] = [];
  private autoQuality = true;
  onQualityDrop?: (q: Quality) => void;
  width = 1;
  height = 1;
  paused = false;

  init(canvas: HTMLCanvasElement, quality: Quality) {
    this.canvas = canvas;
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality === 'low',
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x0b0f24, 1);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.setupComposer();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private setupComposer() {
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    if (this.quality === 'low') return;
    const pr = this.pixelRatio();
    const size = new THREE.Vector2(window.innerWidth * pr, window.innerHeight * pr);
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: this.quality === 'high' ? 4 : 2,
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.35, 0.55, 0.88);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  pixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    return Math.min(dpr, this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1);
  }

  setQuality(q: Quality, manual = true) {
    if (manual) this.autoQuality = false;
    if (q === this.quality) return;
    this.quality = q;
    this.renderer.shadowMap.enabled = q !== 'low';
    this.setupComposer();
    this.resize();
    // las luces necesitan recompilar materiales al cambiar sombras
    this.view?.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio());
      this.composer.setSize(w, h);
    }
    if (this.view) {
      this.view.camera.aspect = w / h;
      this.view.camera.updateProjectionMatrix();
      this.view.resize?.(w, h);
    }
  }

  setView(v: View) {
    if (this.view === v) return;
    this.view?.onDeactivate?.();
    this.view = v;
    v.scene.environment = this.envMap;
    if (this.renderPass) {
      this.renderPass.scene = v.scene;
      this.renderPass.camera = v.camera;
    }
    if (this.bloom && v.bloom) {
      this.bloom.strength = v.bloom.strength;
      this.bloom.radius = v.bloom.radius;
      this.bloom.threshold = v.bloom.threshold;
    }
    this.renderer.toneMappingExposure = v.exposure ?? 1;
    v.camera.aspect = this.width / this.height;
    v.camera.updateProjectionMatrix();
    v.resize?.(this.width, this.height);
    v.onActivate?.();
  }

  private applyGrade(seconds: number) {
    const u = this.grade!.uniforms;
    const g = { ...DEFAULT_GRADE, ...(this.view?.grade ?? {}) };
    const hq = this.quality === 'high';
    u.flash.value = this.flash;
    u.vignette.value = g.vignette;
    u.saturation.value = g.saturation;
    u.contrast.value = g.contrast;
    u.shadowTint.value.set(...g.shadows);
    u.highTint.value.set(...g.highlights);
    u.grain.value = hq ? g.grain : g.grain * 0.5;
    u.aberration.value = hq ? g.aberration : 0;
    u.time.value = seconds;
    u.res.value.set(this.width, this.height);
  }

  /** Destello blanco breve en pantalla completa (180, cofres...). */
  doFlash(amount = 0.6) {
    this.flash = Math.max(this.flash, amount);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (this.paused || !this.view) return;
      const sdt = dt * this.timeScale;
      this.time += sdt;
      this.view.update(this.time, sdt);
      this.flash = Math.max(0, this.flash - dt * 2.2);
      if (this.composer && this.renderPass) {
        if (this.grade) this.applyGrade(now / 1000);
        this.composer.render(dt);
      } else {
        this.renderer.render(this.view.scene, this.view.camera);
      }
      this.trackFps(dt);
    };
    requestAnimationFrame(loop);
  }

  private trackFps(dt: number) {
    if (!this.autoQuality) return;
    this.fpsSamples.push(dt);
    if (this.fpsSamples.length >= 180) {
      const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
      this.fpsSamples = [];
      if (avg > 1 / 38 && this.quality !== 'low') {
        const q: Quality = this.quality === 'high' ? 'medium' : 'low';
        this.setQuality(q, false);
        this.onQualityDrop?.(q);
      }
    }
  }

  // --------------------------------------------- Miniaturas (renderer auxiliar)
  private thumbRenderer: THREE.WebGLRenderer | null = null;
  private thumbEnv: THREE.Texture | null = null;
  private thumbCache = new Map<string, string>();

  thumbnail(key: string, scene: THREE.Scene, camera: THREE.Camera, w = 160, h = 160): string {
    const hit = this.thumbCache.get(key);
    if (hit) return hit;
    const t0 = performance.now();
    if (!this.thumbRenderer) {
      this.thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
      this.thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
      this.thumbRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.thumbRenderer.setClearColor(0x000000, 0);
      const pmrem = new THREE.PMREMGenerator(this.thumbRenderer);
      this.thumbEnv = pmrem.fromScene(new RoomEnvironment(), 0.04, 0.1, 100, { size: 64 }).texture;
      pmrem.dispose();
    }
    scene.environment = this.thumbEnv;
    scene.environmentIntensity = 0.5;
    this.thumbRenderer.setPixelRatio(1);
    this.thumbRenderer.setSize(w * 2, h * 2, false);
    this.thumbRenderer.render(scene, camera);
    const url = this.thumbRenderer.domElement.toDataURL('image/png');
    this.thumbCache.set(key, url);
    if (location.search.includes('debug')) console.info(`[arranque] miniatura ${key.slice(0, 20)}: ${Math.round(performance.now() - t0)} ms`);
    return url;
  }

  now() {
    return this.time;
  }
}

export const engine = new Engine();
