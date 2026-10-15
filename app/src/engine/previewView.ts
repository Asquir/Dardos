// Vista de estudio para el editor de dardos y las miniaturas de objetos.

import * as THREE from 'three';
import type { DartLook } from '@shared/protocol';
import { engine, type View } from './renderer';
import { buildDart, type DartModel } from './dart';
import { glowTexture } from './textures';
import { getItem, type Rarity, RARITY_INFO } from '../meta/catalog';

export class PreviewView implements View {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
  bloom = { strength: 0.35, radius: 0.5, threshold: 0.92 };
  exposure = 0.95;
  private dart: DartModel | null = null;
  private pivot = new THREE.Group();
  private spin = 0;
  private dragVel = 0;
  private dragging = false;
  private halo: THREE.Sprite;
  private target = 0;
  focusPart: 'all' | 'barrel' | 'shaft' | 'flight' = 'all';
  yOffset = 0.13; // desplaza el dardo hacia arriba (la interfaz ocupa la parte baja)

  constructor() {
    this.scene.background = null;
    this.scene.environmentIntensity = 0.45;
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(1, 2, 2);
    const rim = new THREE.DirectionalLight(0x88aaff, 1.1);
    rim.position.set(-2, 1, -2);
    const warm = new THREE.PointLight(0xffb070, 0.6, 0, 2);
    warm.position.set(0.3, -0.3, 0.5);
    this.scene.add(key, rim, warm, new THREE.AmbientLight(0xffffff, 0.25));
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x3a5cff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.halo.scale.set(0.5, 0.5, 1);
    this.halo.position.z = -0.2;
    this.scene.add(this.halo, this.pivot);
    this.camera.position.set(0, 0, 0.62);
  }

  setLook(look: DartLook, rarity: Rarity = 'common') {
    this.dart?.dispose();
    this.dart = buildDart(look, { shadows: false });
    const L = this.dart.length;
    // dardo en diagonal, centrado
    this.dart.group.position.set(0, 0, -L / 2);
    const holder = new THREE.Group();
    holder.add(this.dart.group);
    holder.rotation.set(0, Math.PI / 2, 0);
    const tilt = new THREE.Group();
    tilt.rotation.z = 0.5;
    tilt.add(holder);
    this.pivot.clear();
    this.pivot.add(tilt);
    this.halo.material.color.set(RARITY_INFO[rarity].color);
  }

  onPointer(kind: 'down' | 'move' | 'up', dx = 0) {
    if (kind === 'down') this.dragging = true;
    if (kind === 'up') this.dragging = false;
    if (kind === 'move' && this.dragging) {
      this.spin += dx * 0.012;
      this.dragVel = dx * 0.012;
    }
  }

  resize(w: number, h: number) {
    const aspect = w / h;
    this.camera.fov = aspect < 0.8 ? 34 : 24;
    this.camera.position.z = aspect < 0.8 ? 0.9 : 0.6;
    this.camera.updateProjectionMatrix();
  }

  update(t: number, dt: number) {
    if (!this.dragging) {
      this.dragVel *= Math.exp(-dt * 3);
      this.spin += dt * 0.5 + this.dragVel;
    }
    this.target = this.focusPart === 'barrel' ? 0.035 : this.focusPart === 'flight' ? -0.05 : this.focusPart === 'shaft' ? -0.02 : 0;
    this.pivot.rotation.y = this.spin;
    this.pivot.position.y = this.yOffset * (this.camera.position.z / 0.9) + Math.sin(t * 1.2) * 0.004;
    this.pivot.position.x += (this.target - this.pivot.position.x) * Math.min(1, dt * 5);
    this.halo.position.y = this.pivot.position.y;
    this.halo.material.opacity = 0.18 + Math.sin(t * 2) * 0.04;
  }
}

let shared: PreviewView | null = null;
export function previewView() {
  if (!shared) shared = new PreviewView();
  return shared;
}

// -------------------------------------------------------------- miniaturas

let thumbScene: THREE.Scene | null = null;
let thumbCam: THREE.PerspectiveCamera | null = null;

/** Miniatura PNG de un objeto (pieza sola) o de un dardo completo. */
export function itemThumbnail(itemId: string, base: DartLook = { barrel: 'b_brass', shaft: 's_nylon_w', flight: 'f_red' }): string {
  if (!thumbScene) {
    thumbScene = new THREE.Scene();
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(1, 2, 2);
    const rim = new THREE.DirectionalLight(0x99bbff, 1.0);
    rim.position.set(-2, 1, -1);
    thumbScene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.35));
    thumbCam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
  }
  const item = getItem(itemId);
  const look: DartLook = { ...base, [item.slot]: itemId } as DartLook;
  const model = buildDart(look, { shadows: false });
  const holder = new THREE.Group();
  holder.add(model.group);
  // piezas: mostramos sólo la parte relevante, grande
  const axis = model.group.children[0] as THREE.Group;
  const parts = axis.children;
  // orden: punta, cuerpo, [anillos], caña, aleta
  for (const p of parts) p.visible = item.slot === 'barrel' ? p !== parts[parts.length - 1] && p !== parts[parts.length - 2] : true;
  if (item.slot === 'shaft') parts.forEach((p, i) => (p.visible = i === parts.length - 2));
  if (item.slot === 'flight') parts.forEach((p, i) => (p.visible = i === parts.length - 1));
  const box = new THREE.Box3();
  model.group.updateMatrixWorld(true);
  model.group.traverseVisible((o) => {
    if ((o as THREE.Mesh).isMesh) box.expandByObject(o);
  });
  const center = box.getCenter(new THREE.Vector3());
  model.group.position.sub(center);
  holder.rotation.order = 'ZYX';
  if (item.slot === 'flight') {
    holder.rotation.set(0.5, 0.75, 0);
  } else {
    holder.rotation.set(0.3, Math.PI / 2, 0.78);
  }
  const size = box.getSize(new THREE.Vector3()).length();
  thumbCam!.position.set(0, 0, size * (item.slot === 'flight' ? 2.1 : 1.15));
  thumbCam!.lookAt(0, 0, 0);
  thumbScene.add(holder);
  const url = engine.thumbnail('item_' + itemId, thumbScene, thumbCam!, 120, 120);
  thumbScene.remove(holder);
  return url;
}
