// Escena de apertura de cofres: el cofre cae y rebota, cada toque lo «carga» (la tapa se entreabre y se escapa
// la luz por la rendija), al abrirse salta la cerradura, sale una onda expansiva y una columna de luz, y las
// monedas y gemas saltan de dentro. Cada carta que sale hace destellar el cofre con el color de su rareza.

import * as THREE from 'three';
import { engine, type View } from './renderer';
import { glowTexture, makeCanvas, toTexture, woodTexture } from './textures';
import { CHESTS, type ChestType } from '../meta/chests';

let woodTex: THREE.Texture | null = null;

const W = 0.56;
const H = 0.3;
const D = 0.38;

/** Gema de la cerradura de los cofres buenos. */
const LOCK_GEM: Partial<Record<ChestType, string>> = { gold: '#4fc3ff', epic: '#e07bff', legendary: '#ff5a2e', club: '#4dffa6', season: '#ff6aa8' };
/** Tamaño de cada cofre: los mejores, más grandes. */
const CHEST_SCALE: Record<ChestType, number> = { free: 0.9, wood: 0.92, silver: 1, gold: 1.06, epic: 1.1, legendary: 1.16, club: 1.04, season: 1.06 };
const RARITY_HEX: Record<string, number> = { common: 0xcfe0ff, rare: 0x7cc0ff, epic: 0xd79bff, legendary: 0xffd25a };
const GOLD = new THREE.Color(0xffd98a);

export interface ChestModel {
  group: THREE.Group;
  lid: THREE.Group;
  lock: THREE.Group;
  /** cara de arriba del cuerpo: el interior, que brilla al abrir */
  inner: THREE.MeshBasicMaterial;
  /** luz que se escapa por la rendija de la tapa */
  seam: THREE.Mesh;
  light: THREE.PointLight;
  setType(t: ChestType): void;
}

export function buildChest(type: ChestType): ChestModel {
  if (!woodTex) {
    const w = woodTexture({ base: '#ffffff', dark: '#8a8a8a', planks: 4, seed: 5, size: 512 });
    woodTex = toTexture(w.map);
  }
  const g = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, color: CHESTS[type].color, roughness: 0.6, metalness: 0.05 });
  const trimMat = new THREE.MeshStandardMaterial({ color: CHESTS[type].trim, roughness: 0.36, metalness: 1 });
  const inner = new THREE.MeshBasicMaterial({ color: 0x1a0e06, toneMapped: false });
  // la cara superior de la caja (índice 2) es el interior del cofre
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [woodMat, woodMat, inner, woodMat, woodMat, woodMat]);
  body.position.y = H / 2;
  g.add(body);
  // bandas metálicas
  for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.05, H + 0.01, D + 0.012), trimMat);
    band.position.set(x, H / 2, 0);
    g.add(band);
  }
  const rim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.012, 0.035, D + 0.012), trimMat);
  rim.position.y = H - 0.015;
  g.add(rim);
  const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.03, D + 0.02), trimMat);
  base.position.y = 0.015;
  g.add(base);
  // esquineras
  const cornerGeo = new THREE.BoxGeometry(0.055, 0.07, 0.055);
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const m = new THREE.Mesh(cornerGeo, trimMat);
      m.position.set(x * (W / 2 - 0.02), 0.05, z * (D / 2 - 0.02));
      g.add(m);
    }
  }
  const light = new THREE.PointLight(0xffe7a0, 0, 0, 2);
  light.position.set(0, H + 0.32, 0.04);
  g.add(light);

  // tapa curva con bisagra trasera
  const lid = new THREE.Group();
  lid.position.set(0, H, -D / 2);
  const lidGeo = new THREE.CylinderGeometry(D / 2, D / 2, W, 24, 1, false, 0, Math.PI);
  lidGeo.rotateZ(Math.PI / 2); // eje a lo largo de X, media cúpula arriba
  lidGeo.translate(0, 0, D / 2); // bisagra en el borde trasero
  const lidMesh = new THREE.Mesh(lidGeo, woodMat);
  lidMesh.scale.y = 0.6;
  lid.add(lidMesh);
  for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) {
    const bg = new THREE.CylinderGeometry(D / 2 + 0.006, D / 2 + 0.006, 0.05, 24, 1, true, 0, Math.PI);
    bg.rotateZ(Math.PI / 2);
    bg.translate(x, 0, D / 2);
    const b = new THREE.Mesh(bg, trimMat);
    b.scale.y = 0.6;
    lid.add(b);
  }
  g.add(lid);

  // cerradura (aparte de la tapa: sale volando al abrir)
  const lock = new THREE.Group();
  lock.position.set(0, H, D / 2 + 0.008);
  lock.add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.025), trimMat));
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 12), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  hole.rotation.x = Math.PI / 2;
  hole.position.set(0, -0.02, 0.004);
  lock.add(hole);
  const gemMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.15, metalness: 0.2 });
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), gemMat);
  gem.scale.z = 0.6;
  gem.position.set(0, 0.024, 0.014);
  lock.add(gem);
  g.add(lock);

  const seam = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 0.12, 0.1),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffe9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  seam.position.set(0, H + 0.004, D / 2 + 0.014);
  g.add(seam);

  g.traverse((o) => ((o as THREE.Mesh).isMesh && o !== seam ? ((o.castShadow = true), (o.receiveShadow = true)) : null));
  const setType = (t: ChestType) => {
    woodMat.color.set(CHESTS[t].color);
    trimMat.color.set(CHESTS[t].trim);
    const gc = LOCK_GEM[t];
    gem.visible = !!gc;
    if (gc) {
      gemMat.color.set(gc);
      gemMat.emissive.set(gc);
    }
  };
  setType(type);
  return { group: g, lid, lock, inner, seam, light, setType };
}

/** Moneda o gema que salta del cofre y rebota por el suelo. */
interface Loot {
  coin: boolean;
  idx: number;
  delay: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: THREE.Euler;
  w: THREE.Vector3;
  rest: boolean;
}

const MAX_P = 300;

export class ChestView implements View {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(36, 1, 0.05, 30);
  bloom = { strength: 0.4, radius: 0.55, threshold: 0.9 };
  exposure = 1;
  chest: ChestModel;
  private size = 1;
  private best = 'common';
  private rays: THREE.Group;
  private column: THREE.Mesh;
  private columnTex: THREE.Texture;
  private ring: THREE.Mesh;
  private floorGlow: THREE.Mesh;
  private floor: THREE.Mesh;
  // partículas (chispas, polvo, motas)
  private pts: THREE.Points;
  private pPos = new Float32Array(MAX_P * 3);
  private pCol = new Float32Array(MAX_P * 3);
  private pVel = new Float32Array(MAX_P * 3);
  private pBase = new Float32Array(MAX_P * 3);
  private pLife = new Float32Array(MAX_P);
  private pMax = new Float32Array(MAX_P);
  private pGrav = new Float32Array(MAX_P);
  private pNext = 0;
  private alive = 0;
  // monedas y gemas
  private coins: THREE.InstancedMesh;
  private gems: THREE.InstancedMesh;
  private loot: Loot[] = [];
  private nextCoin = 0;
  private nextGem = 0;
  // estado
  private state: 'drop' | 'idle' | 'open' = 'idle';
  private time = 0;
  private t0 = 0;
  private openT = 0;
  private landed = false;
  private charge = 0;
  private shakeT = 0;
  private shakeAmp = 1;
  private lidA = 0;
  private lidV = 0;
  private sq = 0;
  private sqV = 0;
  private lockFly = false;
  private lockV = new THREE.Vector3();
  private lockW = new THREE.Vector3();
  private glowK = 0;
  private flare = 0;
  private rayK = 0;
  private colK = 0;
  private ringT = -1;
  private ringPow = 1;
  private suspenseT = 0;
  private susK = 0;
  private camPush = 0;
  private camPushTarget = 0;
  private camKick = 0;
  private camShake = 0;
  private lastHop = 0;
  private moteT = 0;
  private rarityColor = new THREE.Color(0xffe27a);
  private seamColor = new THREE.Color(0xffd98a);
  private tc = new THREE.Color();
  private tm = new THREE.Matrix4();
  private tq = new THREE.Quaternion();
  private tv = new THREE.Vector3();
  private ts = new THREE.Vector3(1, 1, 1);
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor() {
    this.scene.environmentIntensity = 0.5;
    this.scene.background = null;
    const key = new THREE.SpotLight(0xffffff, 15, 0, 0.5, 0.6, 2);
    key.position.set(0.6, 1.8, 1.4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key, key.target, new THREE.HemisphereLight(0x8899ff, 0x221133, 0.6));
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(1.2, 48), new THREE.MeshStandardMaterial({ color: 0x1a1640, roughness: 0.6, metalness: 0.2 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    this.chest = buildChest('wood');
    this.scene.add(this.chest.group);

    const additive = (o: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0, ...o });

    // resplandor del suelo bajo el cofre
    this.floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), additive({ map: glowTexture(), color: 0xffd98a }));
    this.floorGlow.rotation.x = -Math.PI / 2;
    this.floorGlow.position.y = 0.004;
    this.scene.add(this.floorGlow);

    // rayos de luz detrás del cofre
    this.rays = new THREE.Group();
    const [c, ctx] = makeCanvas(64, 256);
    const gr = ctx.createLinearGradient(0, 256, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(28, 256);
    ctx.lineTo(0, 0);
    ctx.lineTo(64, 0);
    ctx.lineTo(36, 256);
    ctx.fill();
    const rayTex = toTexture(c);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 1.6), additive({ map: rayTex, color: 0xffe9a0, side: THREE.DoubleSide }));
      m.geometry.translate(0, 0.8, 0);
      m.rotation.z = (i / 12) * Math.PI * 2;
      m.scale.y = 0.75 + (i % 3) * 0.2;
      this.rays.add(m);
    }
    this.rays.position.set(0, 0.35, -0.25);
    this.scene.add(this.rays);

    // columna de luz (cofres con épicas o legendarias)
    const [cc, cx] = makeCanvas(128, 256);
    for (let x = 0; x < 128; x += 4) {
      cx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
      cx.fillRect(x, 0, 4, 256);
    }
    cx.globalCompositeOperation = 'destination-in';
    const vg = cx.createLinearGradient(0, 256, 0, 0);
    vg.addColorStop(0, 'rgba(255,255,255,1)');
    vg.addColorStop(0.45, 'rgba(255,255,255,0.4)');
    vg.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = vg;
    cx.fillRect(0, 0, 128, 256);
    this.columnTex = toTexture(cc);
    this.columnTex.wrapS = THREE.RepeatWrapping;
    const colGeo = new THREE.CylinderGeometry(0.17, 0.25, 2.4, 28, 1, true);
    colGeo.translate(0, 1.2, 0);
    this.column = new THREE.Mesh(colGeo, additive({ map: this.columnTex, color: 0xffd25a, side: THREE.DoubleSide }));
    this.scene.add(this.column);

    // onda expansiva en el suelo
    const [rc, rx] = makeCanvas(256);
    const rg = rx.createRadialGradient(128, 128, 0, 128, 128, 128);
    rg.addColorStop(0, 'rgba(255,255,255,0)');
    rg.addColorStop(0.68, 'rgba(255,255,255,0)');
    rg.addColorStop(0.86, 'rgba(255,255,255,1)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    rx.fillStyle = rg;
    rx.fillRect(0, 0, 256, 256);
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additive({ map: toTexture(rc), color: 0xffe9a0 }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.008;
    this.scene.add(this.ring);

    // partículas
    for (let i = 0; i < MAX_P; i++) this.pPos[i * 3 + 1] = -50;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTexture(), size: 0.05, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.pts.frustumCulled = false;
    this.scene.add(this.pts);

    // monedas y gemas 3D
    this.coins = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.034, 0.034, 0.009, 18),
      new THREE.MeshStandardMaterial({ color: 0xffc933, metalness: 1, roughness: 0.28, emissive: 0x3a2400, emissiveIntensity: 1 }),
      44,
    );
    this.gems = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.03, 0),
      new THREE.MeshStandardMaterial({ color: 0x5fe3ff, emissive: 0x1b6dff, emissiveIntensity: 0.7, metalness: 0.1, roughness: 0.12 }),
      24,
    );
    for (const m of [this.coins, this.gems]) {
      m.frustumCulled = false;
      m.castShadow = true;
      for (let i = 0; i < m.count; i++) m.setMatrixAt(i, this.zero);
      this.scene.add(m);
    }

    this.camera.position.set(0, 0.95, 2.5);
    this.camera.lookAt(0, 0.42, 0);
  }

  resize(w: number, h: number) {
    const aspect = w / h;
    this.camera.fov = aspect < 0.8 ? 44 : 32;
    this.camera.updateProjectionMatrix();
  }

  /** Prepara un cofre nuevo que cae desde arriba. `rarity` es la mejor carta que trae (para los avisos de luz). */
  present(type: ChestType, rarity: string = 'legendary') {
    this.chest.setType(type);
    this.size = CHEST_SCALE[type] ?? 1;
    this.best = rarity;
    this.state = 'drop';
    this.t0 = this.time;
    this.openT = 0;
    this.landed = false;
    this.charge = 0;
    this.lidA = this.lidV = this.sq = this.sqV = 0;
    this.glowK = this.flare = this.rayK = this.colK = this.susK = this.suspenseT = 0;
    this.ringT = -1;
    this.camPushTarget = this.camKick = this.camShake = 0;
    this.lastHop = this.time + 0.6;
    this.chest.lid.rotation.x = 0;
    this.lockFly = false;
    this.chest.lock.position.set(0, H, D / 2 + 0.008);
    this.chest.lock.rotation.set(0, 0, 0);
    this.rarityColor.set(RARITY_HEX[rarity] ?? 0xffe27a);
    this.seamColor.copy(GOLD);
    for (const r of this.rays.children) ((r as THREE.Mesh).material as THREE.MeshBasicMaterial).color.copy(this.rarityColor);
    this.loot = [];
    for (const m of [this.coins, this.gems]) {
      for (let i = 0; i < m.count; i++) m.setMatrixAt(i, this.zero);
      m.instanceMatrix.needsUpdate = true;
    }
    this.pLife.fill(0);
    this.pCol.fill(0);
    this.alive = 1;
  }

  /** ¿La mejor carta merece aviso de luz (épica o legendaria)? */
  private get tease() {
    return this.best === 'epic' || this.best === 'legendary';
  }

  /** Toque sobre el cofre cerrado. `level` va de 0 a 1: cuánto le falta para reventar. */
  tapCharge(level: number) {
    this.charge = Math.max(this.charge, level);
    this.shakeT = 0.28 + level * 0.2;
    this.shakeAmp = 1 + level * 1.4;
    this.sqV += 3 + level * 2.5; // se aplasta
    this.lidV -= 2.6 + level * 3.5; // la tapa da un salto
    this.camShake = Math.max(this.camShake, 0.12 + level * 0.25);
    this.camPushTarget = 0.12 + level * 0.42;
    if (this.tease) this.seamColor.copy(GOLD).lerp(this.rarityColor, Math.min(1, level * level * 1.2));
    const top = H * this.size;
    this.emit(10 + Math.round(level * 26), 0, top, (D / 2) * this.size, W * this.size, 0.05, 0.4, 1.4 + level, 0.7, this.seamColor, 3.2, 0.7, 1.5);
  }

  /** ¡Revienta! La tapa salta, la cerradura sale volando, onda expansiva y lluvia de chispas. */
  open() {
    this.state = 'open';
    this.openT = 0;
    this.charge = 1;
    this.lidV = -11;
    this.sqV = -4.5; // se estira hacia arriba
    this.lockFly = true;
    this.lockV.set((Math.random() - 0.5) * 0.9, 2.1, 1.5);
    this.lockW.set(9 + Math.random() * 4, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8);
    this.ringT = 0;
    this.ringPow = 1;
    this.flare = 1;
    this.camKick = 1;
    this.camShake = 0.7;
    this.camPushTarget = 0;
    engine.doFlash(this.best === 'legendary' ? 0.3 : 0.22);
    const top = H * this.size;
    this.emit(90, 0, top, 0, W * this.size * 0.8, D * this.size * 0.6, 1.6, 3.6, 1, this.rarityColor, 3.2, 1.5, 1.25);
    this.emit(50, 0, top, 0, W * this.size * 0.8, D * this.size * 0.6, 1.2, 3, 1.2, GOLD, 3.2, 1.2, 1.1);
    // polvo alrededor de la base
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.emitOne(Math.cos(a) * 0.36 * this.size, 0.03, Math.sin(a) * 0.3 * this.size, Math.cos(a) * 1.1, 0.25 + Math.random() * 0.3, Math.sin(a) * 1.1, this.tc.setRGB(0.5, 0.42, 0.36), 0.6, 0.8);
    }
  }

  /** Suspense antes de una carta épica o legendaria: el cofre tiembla y la columna de luz crece. */
  suspense(color: string, dur: number) {
    this.rarityColor.set(color);
    this.suspenseT = dur;
    this.chest.light.color.set(color);
    for (const r of this.rays.children) ((r as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(color);
  }

  /** Destello al salir una carta. `power`: 0 común … 1 legendaria. */
  reveal(color: string, power = 0.3) {
    this.rarityColor.set(color);
    this.chest.light.color.set(color);
    for (const r of this.rays.children) ((r as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(color);
    this.flare = Math.max(this.flare, 0.35 + power * 0.65);
    this.suspenseT = 0;
    const top = H * this.size;
    this.emit(14 + Math.round(power * 70), 0, top, 0, W * this.size * 0.7, D * this.size * 0.5, 1 + power, 2.4 + power * 1.6, 0.6 + power * 0.6, this.rarityColor, 3, 1.1, 1.25);
    this.sqV += 1.5 + power * 2;
    if (power >= 0.7) {
      this.ringT = 0;
      this.ringPow = 0.8;
      this.camShake = Math.max(this.camShake, 0.4);
      this.colK = 1.2;
    }
  }

  /** Salen monedas o gemas del cofre. */
  spill(kind: 'coins' | 'gems', n = 14) {
    const coin = kind === 'coins';
    const mesh = coin ? this.coins : this.gems;
    n = Math.min(n, mesh.count);
    const top = H * this.size;
    for (let k = 0; k < n; k++) {
      const idx = coin ? this.nextCoin++ % mesh.count : this.nextGem++ % mesh.count;
      this.loot = this.loot.filter((l) => l.coin !== coin || l.idx !== idx);
      const a = (Math.random() - 0.5) * Math.PI * 1.3;
      const sp = 0.85 + Math.random() * 0.9;
      this.loot.push({
        coin,
        idx,
        delay: k * 0.03,
        p: new THREE.Vector3((Math.random() - 0.5) * 0.2, top, (Math.random() - 0.5) * 0.12),
        v: new THREE.Vector3(Math.sin(a) * sp, 1.9 + Math.random() * 1.3, Math.cos(a) * sp * 0.9 + 0.25),
        r: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3),
        w: new THREE.Vector3((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 22),
        rest: false,
      });
    }
    this.flare = Math.max(this.flare, 0.4);
  }

  /** Posición en pantalla (px CSS) de un punto del cofre, para que las cartas salgan de él. */
  screenPoint(y = 0.32): { x: number; y: number } {
    this.camera.updateMatrixWorld();
    const v = this.tv.set(0, y * this.size, 0).project(this.camera);
    return { x: ((v.x + 1) / 2) * engine.width, y: ((1 - v.y) / 2) * engine.height };
  }

  private emitOne(x: number, y: number, z: number, vx: number, vy: number, vz: number, col: THREE.Color, grav: number, life: number, bright = 1) {
    const i = this.pNext++ % MAX_P;
    this.pPos[i * 3] = x;
    this.pPos[i * 3 + 1] = y;
    this.pPos[i * 3 + 2] = z;
    this.pVel[i * 3] = vx;
    this.pVel[i * 3 + 1] = vy;
    this.pVel[i * 3 + 2] = vz;
    const b = bright * (0.6 + Math.random() * 0.4);
    this.pBase[i * 3] = col.r * b;
    this.pBase[i * 3 + 1] = col.g * b;
    this.pBase[i * 3 + 2] = col.b * b;
    this.pLife[i] = this.pMax[i] = life * (0.7 + Math.random() * 0.6);
    this.pGrav[i] = grav;
    this.alive = 1;
  }

  /** Ráfaga de partículas desde una zona (sx × sz) con velocidad vertical entre vy0 y vy1. */
  private emit(n: number, x: number, y: number, z: number, sx: number, sz: number, vy0: number, vy1: number, vh: number, col: THREE.Color, grav: number, life: number, bright = 1.4) {
    for (let k = 0; k < n; k++) {
      this.emitOne(x + (Math.random() - 0.5) * sx, y, z + (Math.random() - 0.5) * sz, (Math.random() - 0.5) * vh * 2, vy0 + Math.random() * (vy1 - vy0), (Math.random() - 0.5) * vh * 2 + vh * 0.35, col, grav, life, bright);
    }
  }

  update(_t: number, dt: number) {
    this.time += dt;
    const g = this.chest.group;
    const s = this.size;
    const open = this.state === 'open';
    if (open) this.openT += dt;

    // muelles (tapa y aplastamiento), con subpasos para que no se desboquen a pocos fps
    const lidTarget = open ? -1.95 : this.charge > 0 ? -(0.03 + this.charge * 0.15) : 0;
    const sub = Math.max(1, Math.ceil(dt / 0.012));
    const h = dt / sub;
    for (let k = 0; k < sub; k++) {
      const kl = open ? 60 : 240;
      const cl = open ? 6.5 : 15;
      this.lidV += (-kl * (this.lidA - lidTarget) - cl * this.lidV) * h;
      this.lidA += this.lidV * h;
      if (this.lidA > 0) {
        this.lidA = 0;
        this.lidV = -this.lidV * 0.3;
      }
      this.sqV += (-320 * this.sq - 12 * this.sqV) * h;
      this.sq += this.sqV * h;
    }
    this.chest.lid.rotation.x = this.lidA;

    if (this.state === 'drop') {
      const t = this.time - this.t0;
      if (t < 0.42) {
        const k = t / 0.42;
        g.position.y = 1.7 * (1 - k * k);
        g.rotation.y = (1 - k) * 1.2;
      } else {
        if (!this.landed) {
          this.landed = true;
          this.sq = 0.26;
          this.sqV = 0;
          this.lidV = -1.8;
          this.camShake = 0.3;
          this.ringT = 0;
          this.ringPow = 0.45;
          for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2;
            this.emitOne(Math.cos(a) * 0.34 * s, 0.03, Math.sin(a) * 0.26 * s, Math.cos(a) * 0.8, 0.2 + Math.random() * 0.25, Math.sin(a) * 0.8, this.tc.setRGB(0.45, 0.4, 0.36), 0.5, 0.7);
          }
        }
        g.position.y = 0;
        g.rotation.y *= Math.pow(0.02, dt);
        if (t > 0.85) this.state = 'idle';
      }
    } else if (this.state === 'idle') {
      g.position.y = Math.sin(this.time * 2) * 0.008;
      g.rotation.y += (Math.sin(this.time * 0.7) * 0.12 - g.rotation.y) * Math.min(1, dt * 3);
      // de vez en cuando da un saltito, como si algo empujara desde dentro
      if (this.time - this.lastHop > (this.charge > 0 ? 1.4 : 2.3)) {
        this.lastHop = this.time;
        this.sqV += 2;
        this.lidV -= 1.6 + this.charge * 1.5;
        this.shakeT = Math.max(this.shakeT, 0.15);
        this.emit(6, 0, H * s, (D / 2) * s, W * s, 0.04, 0.3, 0.9, 0.4, this.seamColor, 2.5, 0.6, 1.2);
      }
    } else {
      g.position.y = 0;
      g.rotation.y *= Math.pow(0.05, dt);
    }

    // temblor
    this.susK += ((this.suspenseT > 0 ? 1 : 0) - this.susK) * Math.min(1, dt * (this.suspenseT > 0 ? 2.5 : 5));
    this.suspenseT = Math.max(0, this.suspenseT - dt);
    if (this.shakeT > 0 || this.susK > 0.02) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const amp = this.shakeT * this.shakeAmp + this.susK * 0.16;
      g.rotation.z = Math.sin(this.time * 55) * amp * 0.22;
      g.position.x = Math.sin(this.time * 43) * amp * 0.03;
    } else {
      g.rotation.z *= 0.8;
      g.position.x *= 0.8;
    }
    g.scale.set(s * (1 + this.sq * 0.5), s * (1 - this.sq), s * (1 + this.sq * 0.5));

    // cerradura volando
    const lock = this.chest.lock;
    if (this.lockFly) {
      this.lockV.y -= 6.5 * dt;
      lock.position.addScaledVector(this.lockV, dt);
      lock.rotation.x += this.lockW.x * dt;
      lock.rotation.y += this.lockW.y * dt;
      lock.rotation.z += this.lockW.z * dt;
      if (lock.position.y < 0.02) {
        lock.position.y = 0.02;
        if (this.lockV.y < -0.6) {
          this.lockV.y *= -0.32;
          this.lockV.x *= 0.6;
          this.lockV.z *= 0.6;
          this.lockW.multiplyScalar(0.5);
        } else {
          this.lockV.set(0, 0, 0);
          this.lockW.set(0, 0, 0);
          lock.rotation.x += ((Math.round((lock.rotation.x + Math.PI / 2) / Math.PI) * Math.PI - Math.PI / 2) - lock.rotation.x) * Math.min(1, dt * 8);
          lock.rotation.z += (Math.round(lock.rotation.z / Math.PI) * Math.PI - lock.rotation.z) * Math.min(1, dt * 8);
        }
      }
      const r = Math.hypot(lock.position.x, lock.position.z);
      if (r > 1.05) lock.position.multiplyScalar(1.05 / r);
    }

    // luz del interior, rendija, rayos, columna, suelo
    const crack = Math.min(1, Math.max(0, -this.lidA) * 7);
    this.flare = Math.max(0, this.flare - dt * 1.8);
    const glowTarget = open ? 0.75 + this.susK * 0.4 : 0.25 + this.charge * 0.8;
    this.glowK += (glowTarget - this.glowK) * Math.min(1, dt * 4);
    const glowCol = open ? this.rarityColor : this.seamColor;
    this.chest.inner.color.copy(glowCol).multiplyScalar(open ? this.glowK + this.flare * 0.5 : crack * this.glowK * 1.2 + 0.04);
    const seamM = this.chest.seam.material as THREE.MeshBasicMaterial;
    seamM.color.copy(this.seamColor);
    seamM.opacity = open ? Math.max(0, seamM.opacity - dt * 4) : Math.min(1, crack * (0.5 + this.charge * 0.6));
    const L = this.chest.light;
    if (!open) L.color.copy(this.seamColor);
    const lightTarget = open ? 0.35 + this.flare * 0.7 + this.susK * 0.35 : crack * (0.3 + this.charge * 0.5);
    L.intensity += (lightTarget - L.intensity) * Math.min(1, dt * 10);

    const rayTarget = open ? Math.min(0.18, this.openT * 0.8) + this.susK * 0.14 + this.flare * 0.1 : this.charge * 0.06;
    this.rayK += (rayTarget - this.rayK) * Math.min(1, dt * 5);
    this.rays.rotation.z += dt * (0.35 + this.susK * 1.2);
    for (const r of this.rays.children) {
      const m = (r as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (!open) m.color.copy(this.seamColor);
      m.opacity = this.rayK;
    }

    const colTarget = open ? (this.tease ? 0.22 : 0) + this.susK * 0.6 : this.tease ? this.charge * this.charge * 0.2 : 0;
    this.colK += (colTarget - this.colK) * Math.min(1, dt * (this.colK > colTarget ? 1.5 : 4));
    const cm = this.column.material as THREE.MeshBasicMaterial;
    cm.opacity = Math.min(0.8, this.colK) * 0.5;
    cm.color.copy(open ? this.rarityColor : this.seamColor);
    this.column.visible = cm.opacity > 0.005;
    this.column.position.y = H * s * (1 - this.sq) - 0.02;
    this.column.scale.set(1 + this.susK * 0.25, 1, 1 + this.susK * 0.25);
    this.columnTex.offset.x += dt * 0.12;

    const fg = this.floorGlow.material as THREE.MeshBasicMaterial;
    fg.color.copy(open ? this.rarityColor : this.seamColor);
    fg.opacity = open ? 0.14 + this.flare * 0.22 + this.susK * 0.12 : crack * 0.18;

    const rm = this.ring.material as THREE.MeshBasicMaterial;
    if (this.ringT >= 0) {
      this.ringT += dt;
      const k = this.ringT / 0.6;
      const sc = 0.4 + k * 2.8 * this.ringPow;
      this.ring.scale.set(sc, sc, sc);
      rm.color.copy(open ? this.rarityColor : GOLD);
      rm.opacity = Math.pow(Math.max(0, 1 - k), 1.5) * 0.7 * this.ringPow;
      if (k >= 1) this.ringT = -1;
    } else rm.opacity = 0;
    this.ring.visible = rm.opacity > 0.005;

    // motas que flotan (con el cofre abierto salen del interior, del color de la carta)
    this.moteT -= dt;
    if (this.moteT <= 0 && this.state !== 'drop') {
      if (open) {
        this.moteT = 0.05;
        this.emitOne((Math.random() - 0.5) * W * s * 0.8, H * s, (Math.random() - 0.5) * D * s * 0.6, (Math.random() - 0.5) * 0.15, 0.35 + Math.random() * 0.5, (Math.random() - 0.5) * 0.15, this.rarityColor, -0.15, 1.6, 0.7 + this.susK * 0.6);
      } else {
        this.moteT = 0.14;
        this.emitOne((Math.random() - 0.5) * 1.6, 0.05, (Math.random() - 0.5) * 1, (Math.random() - 0.5) * 0.04, 0.08 + Math.random() * 0.12, 0, GOLD, -0.02, 3, 0.35);
      }
    }
    this.updateParticles(dt);
    this.updateLoot(dt);

    // cámara: se acerca al cargar, retrocede de golpe al abrir y tiembla
    this.camPush += (this.camPushTarget - this.camPush) * Math.min(1, dt * 5);
    this.camKick = Math.max(0, this.camKick - dt * 3.5);
    this.camShake = Math.max(0, this.camShake - dt * 2.4);
    const sh = this.camShake * this.camShake * 0.05;
    const cam = this.camera;
    cam.position.set((Math.random() - 0.5) * sh, 0.95 - this.camPush * 0.1 + (Math.random() - 0.5) * sh, 2.5 - this.camPush * 0.55 + this.camKick * this.camKick * 0.28);
    cam.lookAt(0, 0.42 - this.camPush * 0.05 + (s - 1) * 0.15, 0);
  }

  private updateParticles(dt: number) {
    if (!this.alive) return;
    let alive = 0;
    const P = this.pPos;
    const V = this.pVel;
    for (let i = 0; i < MAX_P; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      const j = i * 3;
      if (this.pLife[i] <= 0) {
        P[j + 1] = -50;
        this.pCol[j] = this.pCol[j + 1] = this.pCol[j + 2] = 0;
        continue;
      }
      alive++;
      V[j + 1] -= this.pGrav[i] * dt;
      const drag = 1 - Math.min(0.5, dt * 0.8);
      V[j] *= drag;
      V[j + 2] *= drag;
      P[j] += V[j] * dt;
      P[j + 1] += V[j + 1] * dt;
      P[j + 2] += V[j + 2] * dt;
      if (P[j + 1] < 0.01 && V[j + 1] < 0) {
        P[j + 1] = 0.01;
        V[j + 1] *= -0.3;
        V[j] *= 0.6;
        V[j + 2] *= 0.6;
      }
      const k = this.pLife[i] / this.pMax[i];
      const f = (k < 0.35 ? k / 0.35 : 1) * (0.78 + 0.22 * Math.sin(this.time * 28 + i));
      this.pCol[j] = this.pBase[j] * f;
      this.pCol[j + 1] = this.pBase[j + 1] * f;
      this.pCol[j + 2] = this.pBase[j + 2] * f;
    }
    const geo = this.pts.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    this.alive = alive;
  }

  private updateLoot(dt: number) {
    if (!this.loot.length) return;
    const top = H * this.size;
    const hw = (W / 2) * this.size;
    const hd = (D / 2) * this.size;
    const touched = { c: false, g: false };
    for (const l of this.loot) {
      const mesh = l.coin ? this.coins : this.gems;
      if (l.delay > 0) {
        l.delay -= dt;
        continue;
      }
      if (!l.rest) {
        l.v.y -= 9.8 * dt;
        l.p.addScaledVector(l.v, dt);
        l.r.x += l.w.x * dt;
        l.r.y += l.w.y * dt;
        l.r.z += l.w.z * dt;
        const onChest = Math.abs(l.p.x) < hw && Math.abs(l.p.z) < hd;
        const floorY = (onChest ? top : 0) + (l.coin ? 0.005 : 0.02);
        if (l.p.y < floorY && l.v.y < 0) {
          l.p.y = floorY;
          if (l.v.y < -0.7) {
            l.v.y *= -0.38;
            l.v.x *= 0.6;
            l.v.z *= 0.6;
            l.w.multiplyScalar(0.5);
          } else {
            l.v.set(0, 0, 0);
            l.rest = true;
          }
        }
        const r = Math.hypot(l.p.x, l.p.z);
        if (r > 1.1) {
          l.p.x *= 1.1 / r;
          l.p.z *= 1.1 / r;
        }
      } else if (l.coin) {
        // las monedas acaban planas en el suelo
        l.r.x += (Math.round(l.r.x / Math.PI) * Math.PI - l.r.x) * Math.min(1, dt * 10);
        l.r.z += (Math.round(l.r.z / Math.PI) * Math.PI - l.r.z) * Math.min(1, dt * 10);
      } else {
        l.r.y += dt * 1.5;
      }
      this.tq.setFromEuler(l.r);
      this.tm.compose(l.p, this.tq, this.ts);
      mesh.setMatrixAt(l.idx, this.tm);
      if (l.coin) touched.c = true;
      else touched.g = true;
    }
    if (touched.c) this.coins.instanceMatrix.needsUpdate = true;
    if (touched.g) this.gems.instanceMatrix.needsUpdate = true;
  }
}

let shared: ChestView | null = null;
export function chestView() {
  if (!shared) shared = new ChestView();
  return shared;
}

/** Icono 3D de cofre para la interfaz (renderizado una vez y cacheado). */
let iconScene: THREE.Scene | null = null;
let iconCam: THREE.PerspectiveCamera | null = null;
const iconModels = new Map<ChestType, ChestModel>();
export function chestIcon(type: ChestType): string {
  if (!iconScene) {
    iconScene = new THREE.Scene();
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1, 2, 2);
    iconScene.add(key, new THREE.HemisphereLight(0xaabbff, 0x332211, 1.1));
    iconCam = new THREE.PerspectiveCamera(30, 1, 0.05, 10);
    iconCam.position.set(0.75, 0.75, 1.15);
    iconCam.lookAt(0, 0.2, 0);
  }
  let m = iconModels.get(type);
  if (!m) {
    m = buildChest(type);
    m.group.rotation.y = -0.35;
    iconModels.set(type, m);
  }
  iconScene.add(m.group);
  const url = engine.thumbnail('chest_' + type, iconScene, iconCam!, 110, 110);
  iconScene.remove(m.group);
  return url;
}
