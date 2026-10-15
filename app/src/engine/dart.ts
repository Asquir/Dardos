// Modelo 3D de un dardo construido a partir del catálogo (cuerpo torneado, caña, punta, aletas).
// Eje local: la punta está en el origen y el dardo se extiende hacia +Z (la cola).

import * as THREE from 'three';
import type { DartLook } from '@shared/protocol';
import { barrelDef, flightDef, shaftDef, type BarrelDef, type FlightShape } from '../meta/catalog';
import { flightTexture, knurlTexture } from './textures';

const MM = 0.001;
const POINT_LEN = 32 * MM;

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material>();

function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key) as T | undefined;
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
function cachedMat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key) as T | undefined;
  if (!m) {
    m = make();
    matCache.set(key, m);
  }
  return m;
}

let normalMaps: Record<string, THREE.Texture> | null = null;
function knurl(kind: 'rings' | 'knurl' | 'shark' | 'smooth') {
  if (!normalMaps) normalMaps = {};
  if (!normalMaps[kind]) {
    const t = knurlTexture(kind);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 6);
    normalMaps[kind] = t;
  }
  return normalMaps[kind];
}

/** Perfil del cuerpo (radio en función de la altura) para LatheGeometry. */
function barrelProfile(def: BarrelDef): THREE.Vector2[] {
  const L = def.length * MM;
  const R = def.radius * MM;
  const pts: THREE.Vector2[] = [];
  const N = 140;
  const gripStart = def.shape === 'torpedo' ? 0.08 : 0.18;
  const gripEnd = def.shape === 'scallop' ? 0.7 : 0.82;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let r: number;
    switch (def.shape) {
      case 'torpedo':
        r = R * (1 - 0.38 * Math.pow(t, 1.6));
        break;
      case 'bomb':
        r = R * (0.72 + 0.28 * Math.sin(Math.PI * Math.min(1, t * 1.1)));
        break;
      case 'scallop':
        r = R * (0.78 + 0.22 * Math.sin(Math.PI * t) - (t > 0.75 ? (t - 0.75) * 0.9 : 0));
        break;
      case 'slim':
        r = R * (0.92 - 0.06 * t);
        break;
      default:
        r = R;
    }
    // biselado de los extremos
    if (t < 0.05) r *= 0.6 + (t / 0.05) * 0.4;
    if (t > 0.95) r *= 0.62 + ((1 - t) / 0.05) * 0.38;
    // ranuras de agarre
    if (t > gripStart && t < gripEnd) {
      const u = (t - gripStart) / (gripEnd - gripStart);
      if (def.grip === 'rings') {
        const ph = (u * 9) % 1;
        if (ph > 0.55) r -= R * 0.12;
      } else if (def.grip === 'shark') {
        const ph = (u * 7) % 1;
        r -= R * 0.16 * ph; // diente de sierra "aleta de tiburón"
      } else if (def.grip === 'micro') {
        const ph = (u * 22) % 1;
        if (ph > 0.5) r -= R * 0.06;
      }
    }
    pts.push(new THREE.Vector2(Math.max(r, R * 0.3), t * L));
  }
  // cerrar extremos
  pts.unshift(new THREE.Vector2(0.0006, 0));
  pts.push(new THREE.Vector2(0.0012, L));
  return pts;
}

function flightOutline(shape: FlightShape): [number, number][] {
  // (hacia fuera, a lo largo del eje) en mm
  switch (shape) {
    case 'slim':
      return [[0, 0], [6, 7], [13, 18], [17, 30], [16, 36], [0, 37]];
    case 'kite':
      return [[0, 0], [12, 10], [26, 24], [20, 32], [8, 37], [0, 37]];
    case 'pear':
      return [[0, 0], [9, 4], [19, 13], [25, 25], [23, 34], [14, 38], [0, 38]];
    case 'fantail':
      return [[0, 0], [8, 8], [18, 20], [30, 36], [24, 39], [0, 39]];
    default:
      return [[0, 0], [10, 6], [22, 17], [28, 28], [28, 35], [24, 38], [0, 38]];
  }
}

function wingGeometry(shape: FlightShape): THREE.BufferGeometry {
  return cached('wing_' + shape, () => {
    const pts = flightOutline(shape);
    const s = new THREE.Shape();
    s.moveTo(pts[0][0] * MM, pts[0][1] * MM);
    s.splineThru(pts.slice(1, -1).map(([x, y]) => new THREE.Vector2(x * MM, y * MM)));
    s.lineTo(pts[pts.length - 1][0] * MM, pts[pts.length - 1][1] * MM);
    s.closePath();
    const g = new THREE.ShapeGeometry(s, 12);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
    }
    return g;
  });
}

export interface DartModel {
  group: THREE.Group;
  /** longitud total en metros */
  length: number;
  dispose(): void;
}

/** Construye el dardo con la apariencia indicada. */
export function buildDart(look: DartLook, opts: { shadows?: boolean } = {}): DartModel {
  const bd = barrelDef(look.barrel);
  const sd = shaftDef(look.shaft);
  const fd = flightDef(look.flight);
  const root = new THREE.Group();
  const axis = new THREE.Group(); // construido a lo largo de +Y y girado a +Z
  axis.rotation.x = Math.PI / 2;
  root.add(axis);

  // Punta de acero
  const pointGeo = cached('point', () => {
    const g = new THREE.CylinderGeometry(1.15 * MM, 0.25 * MM, POINT_LEN, 12, 1);
    g.translate(0, POINT_LEN / 2, 0);
    return g;
  });
  const steel = cachedMat('steel', () => new THREE.MeshStandardMaterial({ color: 0xd8dade, metalness: 1, roughness: 0.22 }));
  const point = new THREE.Mesh(pointGeo, steel);
  axis.add(point);

  // Cuerpo
  const bGeo = cached('barrel_' + bd.id, () => new THREE.LatheGeometry(barrelProfile(bd), 28));
  const bMat = cachedMat('barrel_' + bd.id, () => {
    const m = new THREE.MeshStandardMaterial({ color: bd.color, metalness: bd.metalness, roughness: bd.roughness });
    if (bd.grip === 'knurl') {
      m.normalMap = knurl('knurl');
      m.normalScale.set(0.8, 0.8);
    }
    return m;
  });
  const barrel = new THREE.Mesh(bGeo, bMat);
  barrel.position.y = POINT_LEN - 1 * MM;
  axis.add(barrel);
  const L = bd.length * MM;

  // Anillos luminosos de los cuerpos legendarios
  if (bd.accent) {
    const ringMat = cachedMat('accent_' + bd.accent, () => new THREE.MeshStandardMaterial({ color: bd.accent, emissive: new THREE.Color(bd.accent), emissiveIntensity: 2.2, metalness: 0.2, roughness: 0.4 }));
    for (const f of [0.22, 0.5, 0.78]) {
      const rg = cached('accentRing_' + bd.id + f, () => new THREE.TorusGeometry(bd.radius * MM * (bd.shape === 'torpedo' ? 1 - 0.38 * Math.pow(f, 1.6) : 0.95), 0.35 * MM, 6, 28));
      const ring = new THREE.Mesh(rg, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = POINT_LEN + L * f;
      axis.add(ring);
    }
  }

  // Caña
  const SL = sd.length * MM;
  const sGeo = cached('shaft_' + sd.length, () => {
    const pts = [
      new THREE.Vector2(0.0001, 0),
      new THREE.Vector2(1.9 * MM, 0),
      new THREE.Vector2(2.2 * MM, 2 * MM),
      new THREE.Vector2(2.0 * MM, 4 * MM),
      new THREE.Vector2(2.3 * MM, SL * 0.55),
      new THREE.Vector2(2.6 * MM, SL - 3 * MM),
      new THREE.Vector2(2.9 * MM, SL - 1 * MM),
      new THREE.Vector2(2.4 * MM, SL),
      new THREE.Vector2(0.0001, SL),
    ];
    return new THREE.LatheGeometry(pts, 16);
  });
  const sMat = cachedMat('shaft_' + sd.id, () => {
    const m = new THREE.MeshStandardMaterial({ color: sd.color, metalness: sd.metalness, roughness: sd.roughness });
    if (sd.emissive) {
      m.emissive = new THREE.Color(sd.emissive);
      m.emissiveIntensity = 1.6;
    }
    if (sd.id === 's_carbon') {
      m.normalMap = knurl('knurl');
      m.normalScale.set(0.3, 0.3);
    }
    return m;
  });
  const shaft = new THREE.Mesh(sGeo, sMat);
  shaft.position.y = POINT_LEN + L - 2 * MM;
  axis.add(shaft);

  // Aletas: 4 alas en cruz
  const wingG = wingGeometry(fd.shape);
  const fMat = cachedMat('flight_' + fd.design, () => new THREE.MeshStandardMaterial({ map: flightTexture(fd.design), side: THREE.DoubleSide, roughness: 0.42, metalness: fd.design === 'gold' ? 0.6 : 0.05 }));
  const flightBase = POINT_LEN + L + SL - 14 * MM;
  const flight = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const w = new THREE.Mesh(wingG, fMat);
    const holder = new THREE.Group();
    holder.rotation.y = (k * Math.PI) / 2 + Math.PI / 4;
    holder.add(w);
    flight.add(holder);
  }
  flight.position.y = flightBase;
  axis.add(flight);

  const total = flightBase + 38 * MM;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = opts.shadows ?? true;
    }
  });
  root.userData.look = look;
  return {
    group: root,
    length: total,
    dispose() {
      root.removeFromParent();
    },
  };
}
