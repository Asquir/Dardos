// Vista principal: la diana en su arena. Gestiona cámara, apuntado táctil,
// vuelo de los dardos, impactos, efectos y el modo "menú" (fondo animado).

import * as THREE from 'three';
import { BOARD, SEGMENTS, type Hit } from '@shared/board';
import type { DartLook } from '@shared/protocol';
import { gaussian } from '@shared/bot';
import { engine, type View } from './renderer';
import { buildBoard, buildReticle, BOARD_HEIGHT, THROW_DISTANCE, type BoardModel, type Reticle } from './board';
import { ARENA_THEMES, buildEnvironment, type Environment } from './environment';
import { buildDart, type DartModel } from './dart';
import type { BoardStyle } from './textures';

const MM = 0.001;
/** los dardos se ven un poco más grandes que en la realidad para que luzcan en el móvil */
const DART_SCALE = 1.35;
/** el dardo en la mano se ve con una cámara muy cerrada: lo reducimos para que no tape la diana */
const HELD_SCALE = 0.62;
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export interface AimStats {
  acc: number;
  stab: number;
  ctrl: number;
}

export interface HumanAimOptions {
  look: DartLook;
  stats: AimStats;
  sensitivity: number;
  control: 'flick' | 'tap';
  leftHanded?: boolean;
  /** ayudas del tutorial: menos temblor */
  assist?: number;
}

export type ThrowQuality = 'perfect' | 'good' | 'weak' | 'strong';

export interface AimResult {
  x: number;
  y: number;
  quality: ThrowQuality;
}

interface Flying {
  model: DartModel;
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
  t: number;
  dur: number;
  roll: number;
  bounce: boolean;
  wall: boolean;
  resolve: () => void;
}
interface Stuck {
  model: DartModel;
  base: THREE.Quaternion;
  vib: number;
  axis: THREE.Vector3;
}
interface Falling {
  model: DartModel;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  t: number;
}
interface Leaving {
  model: DartModel;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  delay: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class GameView implements View {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.02, 40);
  bloom = { strength: 0.42, radius: 0.55, threshold: 0.86 };
  exposure = 1.05;

  board: BoardModel;
  reticle: Reticle;
  env: Environment | null = null;
  arena = -1;
  private envCache = new Map<number, Environment>();
  mode: 'menu' | 'game' = 'menu';

  private stuck: Stuck[] = [];
  private flying: Flying[] = [];
  private falling: Falling[] = [];
  private leaving: Leaving[] = [];
  private decor: DartModel[] = [];
  private highlights: { mesh: THREE.Mesh; t: number }[] = [];
  private dust: THREE.Points;
  private dustVel: Float32Array;
  private dustLife: Float32Array;

  // cámara
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private baseFov = 30;
  private zoom = 1;
  private zoomTarget = 1;
  private shake = 0;
  private intro = 0;
  private celebrateT = 0;
  private celebrateFocus = new THREE.Vector3();

  // apuntado
  private held: DartModel | null = null;
  private heldLook: string = '';
  private aimOpts: HumanAimOptions | null = null;
  private aimResolve: ((r: AimResult) => void) | null = null;
  aim = { x: 0, y: 103 };
  private dragging = false;
  private focus = 0;
  private samples: { x: number; y: number; t: number }[] = [];
  private lastMove = { x: 0, y: 0, t: 0 };
  private swayPh = [Math.random() * 10, Math.random() * 10, Math.random() * 10, Math.random() * 10];
  private heldPull = 0;
  private lastSpeed = 0;
  private lastReal = 0;
  onHint?: (h: 'flick' | 'aim' | null) => void;
  onAimChange?: (x: number, y: number) => void;
  inputEl: HTMLElement | null = null;

  constructor(style: BoardStyle = 'classic') {
    this.board = buildBoard(style, true);
    this.scene.add(this.board.group);
    this.reticle = buildReticle();
    this.board.group.add(this.reticle.mesh);
    this.scene.add(this.camera);

    // polvo de sisal al impactar
    const n = 60;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.0035, color: 0xd9c9a0, transparent: true, opacity: 0.9, depthWrite: false }));
    this.dustVel = new Float32Array(n * 3);
    this.dustLife = new Float32Array(n);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
    this.scene.fog = null;
    this.scene.environmentIntensity = 0.22;
  }

  setBoardStyle(style: BoardStyle) {
    this.board.setStyle(style);
  }

  setArena(id: number) {
    if (id === this.arena) return;
    if (this.env) this.scene.remove(this.env.group);
    let env = this.envCache.get(id);
    if (!env) {
      env = buildEnvironment(ARENA_THEMES[id] ?? ARENA_THEMES[0], engine.quality);
      this.envCache.set(id, env);
    }
    this.env = env;
    this.arena = id;
    env.lamp.visible = this.mode === 'game';
    this.scene.add(env.group);
    this.scene.background = new THREE.Color(ARENA_THEMES[id]?.wallColors[0] ?? '#000');
  }

  // ------------------------------------------------------------------ modos

  setMenuMode(showDecor = true) {
    this.mode = 'menu';
    if (this.env) this.env.lamp.visible = false;
    this.cancelAim();
    this.clearImmediate();
    for (const d of this.decor) d.dispose();
    this.decor = [];
    if (showDecor) {
      const looks: DartLook[] = [
        { barrel: 'b_t90', shaft: 's_alu_red', flight: 'f_flames' },
        { barrel: 'b_t90', shaft: 's_alu_red', flight: 'f_flames' },
        { barrel: 'b_t90', shaft: 's_alu_red', flight: 'f_flames' },
      ];
      const spots = [
        [-6, 102],
        [5, 104],
        [0, 2],
      ];
      looks.forEach((l, i) => {
        const m = buildDart(l);
        m.group.scale.setScalar(DART_SCALE);
        this.placeStuck(m, spots[i][0], spots[i][1], i * 1.3);
        this.decor.push(m);
      });
    }
    this.layoutCamera();
  }

  setDecorLook(look: DartLook) {
    if (this.mode !== 'menu') return;
    const spots = [
      [-6, 102],
      [5, 104],
      [0, 2],
    ];
    for (const d of this.decor) d.dispose();
    this.decor = spots.map((s, i) => {
      const m = buildDart(look);
      m.group.scale.setScalar(DART_SCALE);
      this.placeStuck(m, s[0], s[1], i * 1.3);
      return m;
    });
  }

  setGameMode(intro = true) {
    this.mode = 'game';
    if (this.env) this.env.lamp.visible = true;
    for (const d of this.decor) d.dispose();
    this.decor = [];
    this.clearImmediate();
    this.intro = intro ? 1 : 0;
    this.layoutCamera();
  }

  resize() {
    this.layoutCamera();
  }

  private layoutCamera() {
    const aspect = engine.width / Math.max(1, engine.height);
    if (this.mode === 'menu') {
      this.baseFov = aspect < 0.8 ? 44 : 34;
      this.camPos.set(0.22, BOARD_HEIGHT + 0.04, aspect < 0.8 ? 1.62 : 1.45);
      this.camLook.set(0.0, BOARD_HEIGHT - 0.085, 0);
    } else {
      const d = 2.25;
      const span = 0.5;
      const byWidth = 2 * Math.atan(Math.tan(Math.atan(span / 2 / d / 0.94)) / aspect);
      const byHeight = 2 * Math.atan(span / 2 / d / 0.66);
      this.baseFov = THREE.MathUtils.radToDeg(Math.max(byWidth, byHeight));
      this.camPos.set(0, BOARD_HEIGHT - 0.02, d);
      // la diana queda en la parte superior-central para dejar sitio al dardo en la mano
      const visH = 2 * d * Math.tan(THREE.MathUtils.degToRad(this.baseFov) / 2);
      this.camLook.set(0, BOARD_HEIGHT - visH * 0.075, 0);
    }
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ dardos

  private boardPoint(xmm: number, ymm: number, z = 0): THREE.Vector3 {
    return new THREE.Vector3(xmm * MM, BOARD_HEIGHT + ymm * MM, z);
  }

  private placeStuck(m: DartModel, xmm: number, ymm: number, seed: number) {
    const tip = this.boardPoint(xmm, ymm, -0.006);
    m.group.position.copy(tip);
    const dir = new THREE.Vector3(Math.sin(seed) * 0.12 + 0.04, -0.12 + Math.cos(seed * 2) * 0.05, 1).normalize();
    m.group.quaternion.setFromUnitVectors(Z_AXIS, dir);
    m.group.rotateZ(seed * 2);
    this.scene.add(m.group);
  }

  /** Posición inicial de un dardo lanzado por el rival (fuera de cámara, abajo). */
  private opponentStart(): THREE.Vector3 {
    return new THREE.Vector3(this.camPos.x - 0.06, this.camPos.y - 0.2, this.camPos.z - 0.7);
  }

  /**
   * Lanza un dardo hacia (x, y) mm. Si `fromHand`, sale del dardo sostenido por el jugador.
   * Devuelve una promesa que se resuelve al impactar.
   */
  throwDart(opts: { x: number; y: number; look: DartLook; bounce?: boolean; fromHand?: boolean; speed?: number }): Promise<void> {
    return new Promise((resolve) => {
      let model: DartModel;
      let p0: THREE.Vector3;
      if (opts.fromHand && this.held) {
        model = this.held;
        this.held = null;
        p0 = model.group.position.clone();
      } else {
        model = buildDart(opts.look);
        model.group.scale.setScalar(DART_SCALE);
        p0 = this.opponentStart();
        model.group.position.copy(p0);
        this.scene.add(model.group);
      }
      const r = Math.hypot(opts.x, opts.y);
      const wall = r > 330;
      const outside = r > BOARD.radius;
      const z = outside && !wall ? -0.04 : -0.006;
      const p2 = this.boardPoint(opts.x, opts.y, wall ? -0.06 : z);
      const p1 = p0.clone().lerp(p2, 0.5);
      p1.y += 0.12 + p0.distanceTo(p2) * 0.03;
      const dur = (0.3 + p0.distanceTo(p2) * 0.05) / (opts.speed ?? 1);
      this.flying.push({ model, p0, p1, p2, t: 0, dur, roll: Math.random() * 6, bounce: !!opts.bounce || wall, wall, resolve });
    });
  }

  /** Recoge los dardos clavados (al final del turno). */
  clearDarts(): Promise<void> {
    return new Promise((resolve) => {
      const list = this.stuck.splice(0);
      if (!list.length) return resolve();
      list.forEach((s, i) => {
        const to = tmpV.set(0.05 * (i - 1), -0.25, -0.3).applyMatrix4(this.camera.matrixWorld).clone();
        this.leaving.push({ model: s.model, from: s.model.group.position.clone(), to, t: 0, delay: i * 0.06 });
      });
      setTimeout(resolve, 520);
    });
  }

  private clearImmediate() {
    for (const s of this.stuck) s.model.dispose();
    for (const f of this.flying) {
      f.model.dispose();
      f.resolve();
    }
    for (const f of this.falling) f.model.dispose();
    for (const l of this.leaving) l.model.dispose();
    this.stuck = [];
    this.flying = [];
    this.falling = [];
    this.leaving = [];
    this.celebrateT = 0;
  }

  // ------------------------------------------------------------------ efectos

  highlight(hit: Hit) {
    if (hit.ring === 'MISS') return;
    let geo: THREE.BufferGeometry;
    const deg = Math.PI / 180;
    if (hit.ring === 'DB') geo = new THREE.CircleGeometry(BOARD.bull * MM, 32);
    else if (hit.ring === 'SB') geo = new THREE.RingGeometry(BOARD.bull * MM, BOARD.outerBull * MM, 40);
    else {
      const i = SEGMENTS.indexOf(hit.num as (typeof SEGMENTS)[number]);
      const c = 90 - i * 18;
      let r0: number = BOARD.trebleOut;
      let r1: number = BOARD.doubleIn;
      if (hit.ring === 'T') [r0, r1] = [BOARD.trebleIn, BOARD.trebleOut];
      else if (hit.ring === 'D') [r0, r1] = [BOARD.doubleIn, BOARD.doubleOut];
      else if (Math.hypot(hit.x, hit.y) < BOARD.trebleIn) [r0, r1] = [BOARD.outerBull, BOARD.trebleIn];
      geo = new THREE.RingGeometry(r0 * MM, r1 * MM, 6, 1, (c - 9) * deg, 18 * deg);
    }
    const color = hit.ring === 'T' || hit.ring === 'DB' ? 0xffd23a : hit.ring === 'D' ? 0x6dffb0 : 0xffffff;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    mesh.position.z = 0.0015;
    this.board.group.add(mesh);
    this.highlights.push({ mesh, t: 0 });
  }

  private puff(p: THREE.Vector3, n = 14) {
    const pos = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    let spawned = 0;
    for (let i = 0; i < this.dustLife.length && spawned < n; i++) {
      if (this.dustLife[i] > 0) continue;
      this.dustLife[i] = 0.4 + Math.random() * 0.4;
      pos.setXYZ(i, p.x, p.y, p.z + 0.004);
      this.dustVel[i * 3] = (Math.random() - 0.5) * 0.5;
      this.dustVel[i * 3 + 1] = (Math.random() - 0.2) * 0.5;
      this.dustVel[i * 3 + 2] = Math.random() * 0.4;
      spawned++;
    }
    pos.needsUpdate = true;
  }

  celebrate(power = 1) {
    if (!this.stuck.length) return;
    this.celebrateFocus.set(0, 0, 0);
    for (const s of this.stuck) this.celebrateFocus.add(s.model.group.position);
    this.celebrateFocus.divideScalar(this.stuck.length);
    this.celebrateT = 2.2 * power;
    this.env?.flash(power);
    engine.doFlash(0.25 * power);
    this.shake = 0.6 * power;
  }

  crowdFlash(power: number) {
    this.env?.flash(power);
  }

  /** Proyecta un punto de la diana (mm) a coordenadas de pantalla (px CSS). */
  toScreen(xmm: number, ymm: number): { x: number; y: number } {
    const v = this.boardPoint(xmm, ymm).project(this.camera);
    return { x: ((v.x + 1) / 2) * engine.width, y: ((1 - v.y) / 2) * engine.height };
  }

  // ------------------------------------------------------------------ apuntado del jugador

  attachInput(el: HTMLElement) {
    if (this.inputEl === el) return;
    this.inputEl = el;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
  }

  detachInput() {
    const el = this.inputEl;
    if (!el) return;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointercancel', this.onCancel);
    this.inputEl = null;
  }

  /** Activa el turno del jugador y espera a que lance. */
  humanAim(opts: HumanAimOptions): Promise<AimResult> {
    this.aimOpts = opts;
    const key = opts.look.barrel + opts.look.shaft + opts.look.flight;
    if (!this.held || this.heldLook !== key) {
      this.held?.dispose();
      this.held = buildDart(opts.look);
      this.held.group.scale.setScalar(HELD_SCALE);
      this.heldLook = key;
      this.scene.add(this.held.group);
    }
    this.held.group.visible = true;
    this.focus = 0;
    this.heldPull = 0;
    this.reticle.visible(true);
    return new Promise((res) => {
      this.aimResolve = res;
    });
  }

  cancelAim() {
    this.aimResolve = null;
    this.aimOpts = null;
    this.dragging = false;
    this.zoomTarget = 1;
    this.reticle.visible(false);
    if (this.held) {
      this.held.dispose();
      this.held = null;
      this.heldLook = '';
    }
  }

  get isAiming() {
    return !!this.aimResolve;
  }

  private mmPerPx(): number {
    const d = this.camPos.z;
    const visH = 2 * d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    return (visH / engine.height) * 1000;
  }

  private onDown = (e: PointerEvent) => {
    if (!this.aimResolve) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    this.dragging = true;
    this.samples = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
    this.lastMove = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    this.lastReal = performance.now();
    this.focus = Math.min(this.focus, 0.3);
    this.zoomTarget = 1.32;
    this.onHint?.(null);
  };

  private onMove = (e: PointerEvent) => {
    if (!this.dragging || !this.aimOpts) return;
    const now = e.timeStamp;
    this.lastReal = performance.now();
    const dx = e.clientX - this.lastMove.x;
    const dy = e.clientY - this.lastMove.y;
    // tras una pausa (dedo quieto) no llegan eventos: limitamos dt para medir bien el primer tramo del gesto
    const dt = Math.min(32, Math.max(1, now - this.lastMove.t));
    const speed = Math.hypot(dx, dy) / dt; // px/ms
    this.lastSpeed = speed;
    this.samples.push({ x: e.clientX, y: e.clientY, t: now });
    if (this.samples.length > 30) this.samples.shift();
    // movimientos rápidos hacia arriba = lanzamiento, no apuntado
    const flicking = speed > 0.9 && dy < 0 && -dy > Math.abs(dx) * 0.8;
    if (!flicking) {
      const k = this.mmPerPx() * this.aimOpts.sensitivity * 0.85;
      this.aim.x = clamp(this.aim.x + dx * k, -260, 260);
      this.aim.y = clamp(this.aim.y - dy * k, -260, 260);
      this.onAimChange?.(this.aim.x, this.aim.y);
      if (speed > 0.12) this.focus = Math.max(0, this.focus - dt * 0.004);
    } else {
      this.heldPull = Math.min(1, this.heldPull + 0.4);
    }
    this.lastMove = { x: e.clientX, y: e.clientY, t: now };
  };

  private onUp = (e: PointerEvent) => {
    if (!this.dragging || !this.aimOpts || !this.aimResolve) return;
    this.dragging = false;
    const now = e.timeStamp;
    this.samples.push({ x: e.clientX, y: e.clientY, t: now });
    // velocidad del gesto en los últimos ~90 ms
    let first = this.samples[this.samples.length - 1];
    for (let i = this.samples.length - 1; i >= 0; i--) {
      if (now - this.samples[i].t > 90) break;
      first = this.samples[i];
    }
    const last = this.samples[this.samples.length - 1];
    const dt = Math.max(16, last.t - first.t) / 1000;
    const vy = (first.y - last.y) / engine.height / dt; // alturas de pantalla por segundo (arriba +)
    const vx = (last.x - first.x) / engine.height / dt;
    const opts = this.aimOpts;
    const flick = vy > 0.85;
    if (!flick && opts.control !== 'tap') {
      // no fue un lanzamiento: el dardo vuelve a la mano
      this.zoomTarget = 1;
      this.heldPull = 0;
      this.onHint?.('flick');
      return;
    }
    this.release(flick ? vy : 2.6, flick ? vx : 0, !flick);
  };

  private onCancel = () => {
    this.dragging = false;
    this.zoomTarget = 1;
  };

  private swayAt(t: number): { x: number; y: number } {
    const o = this.aimOpts!;
    const assist = o.assist ?? 0;
    const amp = lerp(15, 3, clamp(o.stats.stab / 100, 0, 1)) * (1 - 0.6 * this.focus) * (1 - assist);
    const p = this.swayPh;
    const n = (a: number, b: number) => Math.sin(t * 1.3 + a) * 0.6 + Math.sin(t * 2.9 + b) * 0.3 + Math.sin(t * 6.1 + a + b) * 0.1;
    return { x: n(p[0], p[1]) * amp, y: n(p[2], p[3]) * amp };
  }

  private sigma(): number {
    const o = this.aimOpts!;
    const assist = o.assist ?? 0;
    return lerp(11, 2.6, clamp(o.stats.acc / 100, 0, 1)) * (1.25 - 0.45 * this.focus) * (1 - assist * 0.7);
  }

  private release(vy: number, vx: number, tapped: boolean) {
    const o = this.aimOpts!;
    const ctrl = clamp(o.stats.ctrl / 100, 0, 1);
    const sway = this.swayAt(engine.now());
    let sigma = this.sigma();
    if (tapped) sigma *= 1.25;
    // potencia
    const v0 = 2.6;
    const w = lerp(0.55, 1.15, ctrl) * (1 + (o.assist ?? 0));
    const err = tapped ? 0 : (vy - v0) / w;
    let yErr: number;
    let quality: ThrowQuality;
    if (Math.abs(err) <= 1) {
      yErr = err * 2.5;
      quality = Math.abs(err) < 0.4 ? 'perfect' : 'good';
    } else {
      yErr = Math.sign(err) * ((Math.abs(err) - 1) * 16 + 2.5);
      quality = err > 0 ? 'strong' : 'weak';
    }
    yErr = clamp(yErr, -60, 60);
    // dirección: un gesto torcido desvía el dardo en horizontal
    const ang = Math.atan2(vx, Math.max(0.01, vy));
    const dead = 0.14;
    const xErr = Math.abs(ang) > dead ? Math.sin(ang - Math.sign(ang) * dead) * 70 * (1 - ctrl * 0.5) : 0;
    const x = this.aim.x + sway.x + gaussian(Math.random) * sigma + xErr;
    const y = this.aim.y + sway.y + gaussian(Math.random) * sigma + yErr;
    const res = this.aimResolve!;
    this.aimResolve = null;
    this.reticle.visible(false);
    this.zoomTarget = 1;
    res({ x, y, quality });
  }

  /** Simula un lanzamiento del jugador sin gesto (botón de accesibilidad/tests). */
  autoRelease() {
    if (this.aimResolve) this.release(2.6, 0, false);
  }

  // ------------------------------------------------------------------ bucle

  update(t: number, dt: number) {
    this.env?.update(t, dt);

    // cámara
    this.zoom = lerp(this.zoom, this.zoomTarget, 1 - Math.exp(-dt * 6));
    const cam = this.camera;
    const pos = tmpV.copy(this.camPos);
    const look = tmpV2.copy(this.camLook);
    if (this.mode === 'menu') {
      pos.x += Math.sin(t * 0.17) * 0.22;
      pos.y += Math.sin(t * 0.23) * 0.04;
      look.x += Math.sin(t * 0.17) * 0.03;
    } else {
      // respiración sutil
      pos.y += Math.sin(t * 0.9) * 0.002;
      pos.x += Math.sin(t * 0.6) * 0.002;
      if (this.aimResolve && this.zoom > 1.01) {
        const k = (this.zoom - 1) / 0.32;
        look.x = lerp(look.x, this.aim.x * MM, 0.55 * k);
        look.y = lerp(look.y, BOARD_HEIGHT + this.aim.y * MM - 0.03, 0.5 * k);
      }
      if (this.intro > 0) {
        this.intro = Math.max(0, this.intro - dt / 1.8);
        const k = ease(this.intro);
        pos.lerp(new THREE.Vector3(1.4, 2.25, THROW_DISTANCE + 1.6), k);
        look.lerp(new THREE.Vector3(0, BOARD_HEIGHT - 0.15, 0), k);
      }
      if (this.celebrateT > 0) {
        this.celebrateT = Math.max(0, this.celebrateT - dt);
        const k = Math.sin(Math.min(1, this.celebrateT / 2.2) * Math.PI);
        pos.lerp(tmpV.clone().set(this.celebrateFocus.x, this.celebrateFocus.y - 0.02, 0.9), k * 0.6);
        look.lerp(this.celebrateFocus, k * 0.8);
      }
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      pos.x += (Math.random() - 0.5) * this.shake * 0.006;
      pos.y += (Math.random() - 0.5) * this.shake * 0.006;
    }
    cam.position.copy(pos);
    cam.lookAt(look);
    const fov = this.baseFov / this.zoom;
    if (Math.abs(cam.fov - fov) > 0.001) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();

    // dardo en la mano + retícula
    if (this.held && this.aimOpts) {
      const sway = this.swayAt(t);
      const sig = this.sigma();
      if (this.dragging) {
        const idle = performance.now() - this.lastReal > 60 || this.lastSpeed < 0.1;
        if (idle) this.focus = Math.min(1, this.focus + dt / 0.75);
      }
      const ax = this.aim.x + sway.x;
      const ay = this.aim.y + sway.y;
      this.reticle.set(ax, ay, sig * 2, this.focus);
      const side = this.aimOpts.leftHanded ? -1 : 1;
      this.heldPull = lerp(this.heldPull, 0, 1 - Math.exp(-dt * 10));
      const local = new THREE.Vector3(side * 0.018, -0.19 - this.heldPull * 0.02, -1.15 + this.heldPull * 0.08);
      // el dardo sigue ligeramente al dedo
      local.x += (this.aim.x * MM) * 0.25;
      local.y += ((this.aim.y - 100) * MM) * 0.12;
      const world = local.applyMatrix4(cam.matrixWorld);
      this.held.group.position.copy(world);
      const target = this.boardPoint(ax, ay + 40);
      const dir = world.clone().sub(target).normalize(); // cola hacia la cámara
      this.held.group.quaternion.setFromUnitVectors(Z_AXIS, dir);
      this.held.group.rotateZ(t * 0.2);
    }

    // vuelo
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt / f.dur;
      const k = Math.min(1, f.t);
      const a = (1 - k) * (1 - k);
      const b = 2 * (1 - k) * k;
      const c = k * k;
      const p = new THREE.Vector3().addScaledVector(f.p0, a).addScaledVector(f.p1, b).addScaledVector(f.p2, c);
      const tan = new THREE.Vector3()
        .addScaledVector(f.p1.clone().sub(f.p0), 2 * (1 - k))
        .addScaledVector(f.p2.clone().sub(f.p1), 2 * k)
        .normalize();
      f.model.group.position.copy(p);
      f.model.group.quaternion.setFromUnitVectors(Z_AXIS, tan.clone().negate());
      f.roll += dt * 9;
      f.model.group.rotateZ(f.roll);
      if (k >= 1) {
        this.flying.splice(i, 1);
        if (f.bounce) {
          const vel = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.3, f.wall ? 0.6 : 1.1);
          this.falling.push({ model: f.model, vel, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), t: 0 });
          this.shake = Math.max(this.shake, 0.2);
        } else {
          // ligera variación de ángulo al clavarse
          const dir = tan.clone().negate();
          dir.x += (Math.random() - 0.5) * 0.12;
          dir.y += (Math.random() - 0.5) * 0.1 - 0.04;
          dir.normalize();
          f.model.group.quaternion.setFromUnitVectors(Z_AXIS, dir);
          f.model.group.rotateZ(f.roll);
          this.stuck.push({
            model: f.model,
            base: f.model.group.quaternion.clone(),
            vib: 1,
            axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, 0).normalize(),
          });
          this.puff(f.p2);
          this.shake = Math.max(this.shake, 0.25);
        }
        f.resolve();
      }
    }

    // vibración de los dardos clavados
    for (const s of this.stuck) {
      if (s.vib <= 0) continue;
      s.vib = Math.max(0, s.vib - dt * 2.4);
      const ang = Math.sin((1 - s.vib) * 55) * s.vib * s.vib * 0.07;
      const q = new THREE.Quaternion().setFromAxisAngle(s.axis, ang);
      s.model.group.quaternion.copy(s.base).premultiply(q);
    }

    // rebotes que caen al suelo
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.t += dt;
      f.vel.y -= 9.8 * dt;
      f.model.group.position.addScaledVector(f.vel, dt);
      f.model.group.rotation.x += f.spin.x * dt;
      f.model.group.rotation.y += f.spin.y * dt;
      if (f.model.group.position.y < 0.02) {
        f.model.group.position.y = 0.02;
        f.vel.multiplyScalar(0.3);
        f.vel.y = Math.abs(f.vel.y) * 0.3;
        f.spin.multiplyScalar(0.5);
      }
      if (f.t > 1.6) {
        f.model.dispose();
        this.falling.splice(i, 1);
      }
    }

    // recogida de dardos
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const l = this.leaving[i];
      if (l.delay > 0) {
        l.delay -= dt;
        continue;
      }
      l.t += dt / 0.38;
      const k = ease(Math.min(1, l.t));
      l.model.group.position.lerpVectors(l.from, l.to, k);
      l.model.group.position.z += Math.sin(k * Math.PI) * 0.15;
      if (l.t >= 1) {
        l.model.dispose();
        this.leaving.splice(i, 1);
      }
    }

    // resaltado del segmento
    for (let i = this.highlights.length - 1; i >= 0; i--) {
      const h = this.highlights[i];
      h.t += dt;
      const m = h.mesh.material as THREE.MeshBasicMaterial;
      m.opacity = 0.85 * Math.max(0, 1 - h.t / 0.9) * (0.75 + 0.25 * Math.sin(h.t * 30));
      if (h.t > 0.9) {
        h.mesh.removeFromParent();
        h.mesh.geometry.dispose();
        m.dispose();
        this.highlights.splice(i, 1);
      }
    }

    // polvo
    const pos2 = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    let any = false;
    for (let i = 0; i < this.dustLife.length; i++) {
      if (this.dustLife[i] <= 0) continue;
      any = true;
      this.dustLife[i] -= dt;
      this.dustVel[i * 3 + 1] -= 1.5 * dt;
      pos2.setXYZ(i, pos2.getX(i) + this.dustVel[i * 3] * dt, pos2.getY(i) + this.dustVel[i * 3 + 1] * dt, pos2.getZ(i) + this.dustVel[i * 3 + 2] * dt);
      if (this.dustLife[i] <= 0) pos2.setXYZ(i, 0, -10, 0);
    }
    if (any) pos2.needsUpdate = true;
  }
}

let shared: GameView | null = null;
export function gameView(): GameView {
  if (!shared) shared = new GameView();
  return shared;
}
