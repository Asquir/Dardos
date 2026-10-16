// Vitrina 3D del taller de dardos: estudio con fondo, suelo reflectante, luces que barren el metal,
// partículas según la rareza, zoom a la pieza que se edita y celebración al mejorarla.
// También genera las miniaturas de las piezas.

import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import type { DartLook } from '@shared/protocol';
import { engine, type View } from './renderer';
import { buildDart, type DartModel } from './dart';
import { glowTexture, makeCanvas, toTexture } from './textures';
import { getItem, type Rarity, RARITY_INFO } from '../meta/catalog';

export type DartPart = 'all' | 'barrel' | 'shaft' | 'flight';

const RARITY_FX: Record<Rarity, { rays: number; sparks: number; rim: number }> = {
  common: { rays: 0, sparks: 0.2, rim: 0.9 },
  rare: { rays: 0.025, sparks: 0.4, rim: 1.1 },
  epic: { rays: 0.04, sparks: 0.55, rim: 1.3 },
  legendary: { rays: 0.055, sparks: 0.7, rim: 1.5 },
};

function studioBackdrop(): THREE.Texture {
  const [c, ctx] = makeCanvas(512, 512);
  const g = ctx.createRadialGradient(256, 200, 10, 256, 260, 380);
  g.addColorStop(0, '#22306e');
  g.addColorStop(0.45, '#141a48');
  g.addColorStop(1, '#04050f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  // rejilla hexagonal muy suave
  ctx.strokeStyle = 'rgba(140,170,255,0.06)';
  ctx.lineWidth = 1;
  const r = 18;
  for (let y = 0; y < 560; y += r * 1.5)
    for (let x = 0; x < 560; x += r * Math.sqrt(3)) {
      const ox = ((y / (r * 1.5)) % 2) * ((r * Math.sqrt(3)) / 2);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        ctx.lineTo(x + ox + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.stroke();
    }
  return toTexture(c);
}

function raysTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(512);
  ctx.translate(256, 256);
  for (let i = 0; i < 18; i++) {
    ctx.rotate((Math.PI * 2) / 18);
    // sin centro: los 18 rayos sumados allí hacían un foco blanco detrás del dardo
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(256, -18 - (i % 3) * 8);
    ctx.lineTo(256, 18 + (i % 3) * 8);
    ctx.closePath();
    ctx.fill();
  }
  return toTexture(c);
}

function fadeTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(256);
  const g = ctx.createRadialGradient(128, 128, 30, 128, 128, 128);
  g.addColorStop(0, 'rgba(8,10,28,0)');
  g.addColorStop(0.6, 'rgba(8,10,28,0.55)');
  g.addColorStop(1, 'rgba(8,10,28,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return toTexture(c);
}

// vectores de trabajo (sin crear objetos en cada fotograma)
const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();

export class PreviewView implements View {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.01, 30);
  bloom = { strength: 0.26, radius: 0.4, threshold: 0.96 };
  exposure = 0.86;
  grade = { vignette: 0.42, aberration: 0.12, saturation: 1.08, contrast: 1.06, grain: 0.012 };
  private dart: DartModel | null = null;
  private pivot = new THREE.Group();
  private roller = new THREE.Group();
  private yaw = 0;
  private yawVel = 0;
  private roll = 0;
  private dragging = false;
  private rays: THREE.Mesh;
  private sparks: THREE.Points;
  private sparkSeed: Float32Array;
  private rim: THREE.DirectionalLight;
  private key: THREE.DirectionalLight;
  private backdrop: THREE.Mesh;
  private scanner: THREE.Mesh;
  /** anillos de energía de la mejora (se crean una vez y se reutilizan) */
  private rings: THREE.Mesh[] = [];
  private burstT = -1;
  /** vuelta de lucimiento sobre su propio eje al mejorar (no mueve el encuadre) */
  private spinT = -1;
  private rarity: Rarity = 'common';
  private W = 390;
  private H = 844;
  private region = { top: 0.08, height: 0.32 };
  private camTarget = new THREE.Vector3();
  private camDist = 0.6;
  private reflector: Reflector | null = null;
  focusPart: DartPart = 'all';

  constructor() {
    this.scene.environmentIntensity = 0.42;
    this.roller.rotation.order = 'ZYX';
    this.key = new THREE.DirectionalLight(0xfff3e4, 1.15);
    this.key.position.set(0.6, 1.2, 1.1);
    this.rim = new THREE.DirectionalLight(0x88aaff, 1.6);
    this.rim.position.set(-1.2, 0.6, -1.1);
    const fill = new THREE.DirectionalLight(0xc8d8ff, 0.45);
    fill.position.set(-1, -0.4, 1);
    this.scene.add(this.key, this.rim, fill, new THREE.HemisphereLight(0xdde6ff, 0x1a1530, 0.35));

    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: studioBackdrop(), depthWrite: false }));
    this.backdrop.position.set(0, 0.25, -1.4);
    this.scene.add(this.backdrop);

    this.rays = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 1.4),
      new THREE.MeshBasicMaterial({ map: raysTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.rays.position.set(0, 0.02, -0.5);
    this.scene.add(this.rays);

    // suelo: espejo (calidad alta) con un degradado que lo funde con el fondo
    const floorY = -0.075;
    if (engine.quality === 'high') {
      this.reflector = new Reflector(new THREE.PlaneGeometry(3, 3), { textureWidth: 512, textureHeight: 512, color: 0x5a6280, clipBias: 0.002 });
      this.reflector.rotation.x = -Math.PI / 2;
      this.reflector.position.y = floorY;
      this.scene.add(this.reflector);
    } else {
      // suelo sin iluminar: un plano tan grande mirando hacia arriba recibía toda la luz del entorno
      // (sobre todo el techo) y llenaba el fondo de neblina blanca en calidad media y baja
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: 0x0a0d22 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = floorY;
      this.scene.add(floor);
    }
    const fade = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: fadeTexture(), transparent: true, depthWrite: false }));
    fade.rotation.x = -Math.PI / 2;
    fade.position.y = floorY + 0.0005;
    this.scene.add(fade);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x4a70ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = floorY + 0.001;
    glow.scale.set(1.6, 0.7, 1);
    this.scene.add(glow);

    // chispas que suben según la rareza
    const N = 90;
    const pos = new Float32Array(N * 3);
    this.sparkSeed = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.sparkSeed[i * 3] = (Math.random() - 0.5) * 0.36;
      this.sparkSeed[i * 3 + 1] = Math.random();
      this.sparkSeed[i * 3 + 2] = (Math.random() - 0.5) * 0.18;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ map: glowTexture(), size: 0.006, color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);

    // anillo "escáner" que recorre la pieza seleccionada
    this.scanner = new THREE.Mesh(
      new THREE.TorusGeometry(0.0062, 0.00035, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );

    this.pivot.add(this.roller);
    this.scene.add(this.pivot);
    this.camera.position.set(0, 0, 0.6);
  }

  /** Monta el dardo (o una prueba con otra pieza). */
  setLook(look: DartLook, rarity: Rarity = 'common') {
    this.dart?.dispose();
    this.dart = buildDart(look, { shadows: false });
    const L = this.dart.length;
    this.dart.group.position.set(0, 0, -L / 2);
    this.roller.clear();
    this.roller.add(this.dart.group);
    this.dart.group.add(this.scanner);
    this.rarity = rarity;
    const c = new THREE.Color(RARITY_INFO[rarity].color);
    this.rim.color.copy(c).lerp(new THREE.Color('#ffffff'), 0.25);
    this.rim.intensity = RARITY_FX[rarity].rim;
    (this.rays.material as THREE.MeshBasicMaterial).color.copy(c);
    (this.sparks.material as THREE.PointsMaterial).color.copy(new THREE.Color(RARITY_INFO[rarity].glow));
    (this.backdrop.material as THREE.MeshBasicMaterial).color.copy(new THREE.Color('#ffffff').lerp(c, rarity === 'common' ? 0 : 0.28));
  }

  setRegion(top: number, height: number) {
    const H = window.innerHeight || this.H;
    this.region = { top: top / H, height: height / H };
  }

  /** Destello y anillos de energía al mejorar una pieza. */
  celebrate() {
    if (!this.dart) return;
    if (!this.rings.length) {
      const geo = new THREE.TorusGeometry(0.01, 0.0006, 6, 64);
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        m.userData.delay = i * 0.12;
        this.rings.push(m);
      }
    }
    for (const r of this.rings) {
      (r.material as THREE.MeshBasicMaterial).color.set(RARITY_INFO[this.rarity].glow);
      (r.material as THREE.MeshBasicMaterial).opacity = 0;
      r.position.z = this.partZ();
      r.scale.setScalar(1);
      this.dart.group.add(r);
    }
    this.burstT = 0;
    // antes se sumaba un giro brusco (en radianes por fotograma) que hacía bailar el dardo y la cámara:
    // ahora da una vuelta suave sobre su propio eje, así la pieza enfocada no se sale del encuadre
    this.spinT = 0;
    engine.doFlash(0.15);
  }

  onPointer(kind: 'down' | 'move' | 'up', dx = 0) {
    if (kind === 'down') this.dragging = true;
    if (kind === 'up') this.dragging = false;
    if (kind === 'move' && this.dragging) {
      this.yaw += dx * 0.01;
      // velocidad en rad/s (los eventos llegan a ~60 por segundo) para la inercia al soltar
      this.yawVel = THREE.MathUtils.clamp(dx * 0.6, -10, 10);
    }
  }

  resize(w: number, h: number) {
    this.W = w;
    this.H = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Posición (a lo largo del dardo, en su eje local) del centro de la pieza enfocada. */
  private partZ(): number {
    if (!this.dart) return 0;
    const p = this.dart.parts;
    return this.focusPart === 'barrel' ? p.barrel : this.focusPart === 'shaft' ? p.shaft : this.focusPart === 'flight' ? p.flight : this.dart.length / 2;
  }

  update(t: number, dt: number) {
    const k = 1 - Math.exp(-dt * 4);
    // giro: el dardo rueda sobre su eje y se balancea; arrastrar lo gira
    if (!this.dragging) {
      this.yawVel *= Math.exp(-dt * 2.5);
      this.yaw += this.yawVel * dt;
      // vuelve al balanceo por el camino más corto (sin deshacer las vueltas que haya dado)
      this.yaw += wrapAngle(Math.sin(t * 0.35) * 0.32 - this.yaw) * Math.min(1, dt * 0.6);
    }
    this.yaw = wrapAngle(this.yaw);
    this.roll = (this.roll + dt * (this.focusPart === 'all' ? 0.55 : 0.35)) % (Math.PI * 2);
    let spin = 0;
    if (this.spinT >= 0) {
      this.spinT += dt;
      const k = Math.min(1, this.spinT / 1.1);
      spin = (1 - Math.pow(1 - k, 3)) * Math.PI * 2;
      this.pivot.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.05);
      if (k >= 1) {
        this.spinT = -1;
        spin = 0;
        this.pivot.scale.setScalar(1);
      }
    }
    this.pivot.rotation.set(0, this.yaw, 0);
    this.roller.rotation.set(0, Math.PI / 2, 0.36);
    if (this.dart) this.dart.group.rotation.z = this.roll + spin;
    this.pivot.position.y = Math.sin(t * 1.1) * 0.003;

    // encuadre: todo el dardo o la pieza elegida, centrado en la zona visible
    let fw = 0.2;
    const target = TMP_A.set(0, 0, 0);
    if (this.dart) {
      this.dart.group.updateWorldMatrix(true, false);
      target.copy(this.dart.group.localToWorld(TMP_B.set(0, 0, this.partZ())));
      fw = this.focusPart === 'all' ? this.dart.length * 1.12 : this.focusPart === 'flight' ? 0.085 : 0.07;
    }
    // las aletas giran y ocupan casi tanto alto como ancho
    const fh = fw * (this.focusPart === 'flight' ? 0.95 : 0.5);
    this.camTarget.lerp(target, k);
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const regionH = Math.max(0.15, this.region.height);
    const byW = fw / (2 * tan * this.camera.aspect * 0.92);
    const byH = fh / (2 * tan * regionH * 0.9);
    this.camDist += (Math.max(byW, byH) - this.camDist) * k;
    const d = this.camDist;
    this.camera.position.set(this.camTarget.x, this.camTarget.y + d * 0.16, this.camTarget.z + d);
    this.camera.lookAt(this.camTarget);
    const centerPx = (this.region.top + regionH / 2) * this.H;
    this.camera.setViewOffset(this.W, this.H, 0, this.H / 2 - centerPx, this.W, this.H);

    // luz que barre el metal
    this.scene.environmentRotation.y = t * 0.3;
    this.key.position.set(Math.cos(t * 0.4) * 1.1, 1.2, 0.9 + Math.sin(t * 0.4) * 0.4);

    // efectos de rareza
    const fx = RARITY_FX[this.rarity];
    const rm = this.rays.material as THREE.MeshBasicMaterial;
    rm.opacity += (fx.rays * (0.85 + Math.sin(t * 1.7) * 0.15) - rm.opacity) * k;
    this.rays.rotation.z = t * 0.12;
    this.rays.position.copy(this.camTarget).add(TMP_B.set(0, 0, -0.35));
    const sm = this.sparks.material as THREE.PointsMaterial;
    sm.opacity = 0.6 * fx.sparks;
    const sp = this.sparks.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) {
      const life = (this.sparkSeed[i * 3 + 1] + t * 0.12) % 1;
      sp.setXYZ(
        i,
        this.camTarget.x + this.sparkSeed[i * 3] * (this.focusPart === 'all' ? 1 : 0.4),
        this.camTarget.y - 0.07 + life * 0.16,
        this.camTarget.z + this.sparkSeed[i * 3 + 2] * (this.focusPart === 'all' ? 1 : 0.4) + Math.sin(t + i) * 0.004,
      );
    }
    sp.needsUpdate = true;

    // escáner de la pieza
    const scm = this.scanner.material as THREE.MeshBasicMaterial;
    // solo en el cuerpo y la caña: en las aletas se veía como una barra de luz
    const scanning = this.focusPart === 'barrel' || this.focusPart === 'shaft';
    scm.opacity += ((scanning ? 0.6 : 0) - scm.opacity) * k;
    this.scanner.visible = scm.opacity > 0.02;
    if (this.dart && scanning) {
      const half = this.focusPart === 'barrel' ? 0.024 : 0.018;
      this.scanner.position.z = this.partZ() + Math.sin(t * 2.2) * half;
      this.scanner.scale.setScalar(this.focusPart === 'barrel' ? 1 : 0.0045 / 0.0062);
    }

    // anillos de la mejora
    if (this.burstT >= 0) {
      this.burstT += dt;
      let alive = false;
      for (const r of this.rings) {
        const kk = Math.max(0, this.burstT - (r.userData.delay as number)) / 0.8;
        if (kk < 1) alive = true;
        // crece el radio pero no el grosor a lo largo del dardo: visto de lado es una línea fina, no una barra
        const sc = 1 + kk * 5;
        r.scale.set(sc, sc, 1);
        (r.material as THREE.MeshBasicMaterial).opacity = this.burstT < (r.userData.delay as number) ? 0 : Math.max(0, 1 - kk) * 0.75;
      }
      if (!alive) {
        for (const r of this.rings) r.removeFromParent();
        this.burstT = -1;
      }
    }
  }
}

/** Ángulo en (-π, π]. */
function wrapAngle(a: number) {
  return a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
}

let shared: PreviewView | null = null;
export function previewView() {
  if (!shared) shared = new PreviewView();
  return shared;
}

// -------------------------------------------------------------- miniaturas

let thumbScene: THREE.Scene | null = null;
let thumbCam: THREE.PerspectiveCamera | null = null;
let thumbRim: THREE.DirectionalLight | null = null;

/** Miniatura PNG de un objeto (pieza sola, grande y con luz de su rareza). */
export function itemThumbnail(itemId: string, base: DartLook = { barrel: 'b_brass', shaft: 's_nylon_w', flight: 'f_red' }): string {
  if (!thumbScene) {
    thumbScene = new THREE.Scene();
    const key = new THREE.DirectionalLight(0xfff4e8, 1.9);
    key.position.set(1, 2, 2);
    thumbRim = new THREE.DirectionalLight(0x99bbff, 1.8);
    thumbRim.position.set(-2, 1, -1);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-1, -1, 2);
    thumbScene.add(key, thumbRim, fill, new THREE.AmbientLight(0xffffff, 0.3));
    thumbCam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
  }
  const item = getItem(itemId);
  thumbRim!.color.set(RARITY_INFO[item.rarity].glow);
  const look: DartLook = { ...base, [item.slot]: itemId } as DartLook;
  const model = buildDart(look, { shadows: false });
  const holder = new THREE.Group();
  holder.add(model.group);
  // sólo la pieza (el cuerpo lleva su punta)
  const axis = model.group.children[0] as THREE.Group;
  for (const p of axis.children) {
    const name = p.userData.part as string;
    p.visible = item.slot === 'barrel' ? name === 'barrel' || name === 'point' : name === item.slot;
  }
  const box = new THREE.Box3();
  model.group.updateMatrixWorld(true);
  model.group.traverseVisible((o) => {
    if ((o as THREE.Mesh).isMesh) box.expandByObject(o);
  });
  const center = box.getCenter(new THREE.Vector3());
  model.group.position.sub(center);
  holder.rotation.order = 'ZYX';
  if (item.slot === 'flight') holder.rotation.set(0.5, 0.75, 0);
  else holder.rotation.set(0.3, Math.PI / 2, 0.78);
  const size = box.getSize(new THREE.Vector3()).length();
  thumbCam!.position.set(0, 0, size * (item.slot === 'flight' ? 2.0 : 1.08));
  thumbCam!.lookAt(0, 0, 0);
  thumbScene.add(holder);
  const url = engine.thumbnail('itemx_' + itemId, thumbScene, thumbCam!, 160, 160);
  thumbScene.remove(holder);
  return url;
}
