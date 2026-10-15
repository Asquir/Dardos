// Escena de apertura de cofres: cofre 3D con tapa articulada, sacudidas, rayos de luz y destellos.

import * as THREE from 'three';
import { engine, type View } from './renderer';
import { glowTexture, makeCanvas, toTexture, woodTexture } from './textures';
import { CHESTS, type ChestType } from '../meta/chests';

let woodTex: THREE.Texture | null = null;

export interface ChestModel {
  group: THREE.Group;
  lid: THREE.Group;
  glow: THREE.Mesh;
  light: THREE.PointLight;
  setType(t: ChestType): void;
}

export function buildChest(type: ChestType): ChestModel {
  if (!woodTex) {
    const w = woodTexture({ base: '#ffffff', dark: '#8a8a8a', planks: 4, seed: 5, size: 512 });
    woodTex = toTexture(w.map);
  }
  const W = 0.56;
  const H = 0.3;
  const D = 0.38;
  const g = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, color: CHESTS[type].color, roughness: 0.6, metalness: 0.05 });
  const trimMat = new THREE.MeshStandardMaterial({ color: CHESTS[type].trim, roughness: 0.25, metalness: 1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), woodMat);
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
  // interior luminoso
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, toneMapped: false, transparent: true, opacity: 0 });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, D - 0.04), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = H - 0.005;
  g.add(glow);
  const light = new THREE.PointLight(0xffe7a0, 0, 0, 2);
  light.position.set(0, H + 0.1, 0);
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
  // cerradura
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.025), trimMat);
  lock.position.set(0, 0.0, D + 0.008);
  lid.add(lock);
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 12), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  hole.rotation.x = Math.PI / 2;
  hole.position.set(0, -0.01, D + 0.012);
  lid.add(hole);
  g.add(lid);
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : null));
  return {
    group: g,
    lid,
    glow,
    light,
    setType(t) {
      woodMat.color.set(CHESTS[t].color);
      trimMat.color.set(CHESTS[t].trim);
    },
  };
}

export class ChestView implements View {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(36, 1, 0.05, 30);
  bloom = { strength: 0.55, radius: 0.6, threshold: 0.8 };
  exposure = 1.05;
  chest: ChestModel;
  private rays: THREE.Group;
  private sparks: THREE.Points;
  private sparkVel: Float32Array;
  private state: 'drop' | 'idle' | 'open' = 'idle';
  private t0 = 0;
  private shakeT = 0;
  private openT = 0;
  private time = 0;
  private rarityColor = new THREE.Color(0xffe27a);
  private floor: THREE.Mesh;

  constructor() {
    this.scene.environmentIntensity = 0.5;
    this.scene.background = null;
    const key = new THREE.SpotLight(0xffffff, 18, 0, 0.5, 0.6, 2);
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

    // rayos de luz
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
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.35, 1.6),
        new THREE.MeshBasicMaterial({ map: rayTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe9a0, toneMapped: false, opacity: 0, side: THREE.DoubleSide }),
      );
      m.geometry.translate(0, 0.8, 0);
      m.rotation.z = (i / 12) * Math.PI * 2;
      this.rays.add(m);
    }
    this.rays.position.set(0, 0.35, -0.25);
    this.scene.add(this.rays);

    const n = 160;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.sparkVel = new Float32Array(n * 3);
    this.sparks = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTexture(), size: 0.05, color: 0xffe9a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 }));
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
    this.camera.position.set(0, 0.95, 2.5);
    this.camera.lookAt(0, 0.42, 0);
  }

  resize(w: number, h: number) {
    const aspect = w / h;
    this.camera.fov = aspect < 0.8 ? 44 : 32;
    this.camera.updateProjectionMatrix();
  }

  /** Prepara un cofre nuevo que cae desde arriba. */
  present(type: ChestType, rarity: string = 'legendary') {
    this.chest.setType(type);
    this.state = 'drop';
    this.t0 = this.time;
    this.openT = 0;
    this.chest.lid.rotation.x = 0;
    (this.chest.glow.material as THREE.MeshBasicMaterial).opacity = 0;
    this.chest.light.intensity = 0;
    const map: Record<string, number> = { common: 0xcfe0ff, rare: 0x7cc0ff, epic: 0xd79bff, legendary: 0xffd25a };
    this.rarityColor.set(map[rarity] ?? 0xffe27a);
    for (const r of this.rays.children) ((r as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0;
    (this.sparks.material as THREE.PointsMaterial).opacity = 0;
  }

  tapShake() {
    this.shakeT = 0.35;
  }

  open() {
    this.state = 'open';
    this.openT = 0;
    engine.doFlash(0.5);
    const pos = this.sparks.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, (Math.random() - 0.5) * 0.3, 0.32, (Math.random() - 0.5) * 0.2);
      this.sparkVel[i * 3] = (Math.random() - 0.5) * 1.6;
      this.sparkVel[i * 3 + 1] = 1 + Math.random() * 2.2;
      this.sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 1.2 + 0.3;
    }
    pos.needsUpdate = true;
    (this.sparks.material as THREE.PointsMaterial).opacity = 1;
    (this.sparks.material as THREE.PointsMaterial).color.copy(this.rarityColor);
  }

  /** Destello de una carta al salir (rareza). */
  pulse(color: string) {
    this.rarityColor.set(color);
    this.chest.light.color.set(color);
    for (const r of this.rays.children) ((r as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(color);
    this.chest.light.intensity = 3;
  }

  update(_t: number, dt: number) {
    this.time += dt;
    const g = this.chest.group;
    if (this.state === 'drop') {
      const k = Math.min(1, (this.time - this.t0) / 0.7);
      const bounce = k < 1 ? Math.abs(Math.cos(k * Math.PI * 1.5)) * (1 - k) * 0.6 : 0;
      g.position.y = (1 - k) * 1.4 * (1 - k) + bounce * 0.4;
      g.rotation.y = (1 - k) * 1.5;
      if (k >= 1) this.state = 'idle';
    } else if (this.state === 'idle') {
      g.position.y = Math.sin(this.time * 2) * 0.01;
      g.rotation.y = Math.sin(this.time * 0.7) * 0.15;
    } else {
      this.openT += dt;
      g.position.y = 0;
      g.rotation.y *= 0.9;
      const k = Math.min(1, this.openT / 0.45);
      this.chest.lid.rotation.x = -k * 1.9 + Math.sin(k * Math.PI) * -0.2;
      const gm = this.chest.glow.material as THREE.MeshBasicMaterial;
      gm.opacity = Math.min(1, this.openT * 3);
      gm.color.copy(this.rarityColor);
      this.chest.light.intensity += (2.2 - this.chest.light.intensity) * Math.min(1, dt * 3);
      this.rays.rotation.z += dt * 0.4;
      for (const r of this.rays.children) {
        const m = (r as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = Math.min(0.32, this.openT * 1.2);
      }
      const pos = this.sparks.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        this.sparkVel[i * 3 + 1] -= 3.2 * dt;
        pos.setXYZ(i, pos.getX(i) + this.sparkVel[i * 3] * dt, pos.getY(i) + this.sparkVel[i * 3 + 1] * dt, pos.getZ(i) + this.sparkVel[i * 3 + 2] * dt);
      }
      pos.needsUpdate = true;
      const sm = this.sparks.material as THREE.PointsMaterial;
      sm.opacity = Math.max(0, sm.opacity - dt * 0.5);
    }
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      g.rotation.z = Math.sin(this.time * 60) * this.shakeT * 0.25;
      g.position.x = Math.sin(this.time * 47) * this.shakeT * 0.03;
    } else {
      g.rotation.z *= 0.8;
      g.position.x *= 0.8;
    }
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
