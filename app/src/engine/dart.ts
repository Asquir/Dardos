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

export interface DartModel {
  group: THREE.Group;
  /** longitud total en metros */
  length: number;
  /** centro de cada pieza a lo largo del dardo (m, desde la punta) */
  parts: { point: number; barrel: number; shaft: number; flight: number };
  dispose(): void;
}

// ------------------------------------------------------------------ materiales de alta calidad

/** Textura de fibra de carbono (tejido 2x2). */
let carbonTex: THREE.Texture | null = null;
function carbonWeave(): THREE.Texture {
  if (carbonTex) return carbonTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#141418';
  ctx.fillRect(0, 0, 128, 128);
  const n = 8;
  const w = 128 / n;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const horiz = (x + y) % 2 === 0;
      const g = horiz ? ctx.createLinearGradient(x * w, 0, x * w + w, 0) : ctx.createLinearGradient(0, y * w, 0, y * w + w);
      g.addColorStop(0, '#1b1b21');
      g.addColorStop(0.5, '#4a4a55');
      g.addColorStop(1, '#16161b');
      ctx.fillStyle = g;
      ctx.fillRect(x * w + 0.5, y * w + 0.5, w - 1, w - 1);
    }
  carbonTex = new THREE.CanvasTexture(c);
  carbonTex.colorSpace = THREE.SRGBColorSpace;
  carbonTex.wrapS = carbonTex.wrapT = THREE.RepeatWrapping;
  carbonTex.repeat.set(4, 10);
  carbonTex.anisotropy = 8;
  return carbonTex;
}

const HOLO_FLIGHTS = new Set(['galaxy', 'neon', 'ice', 'gold', 'dragon', 'legend', 'season1', 'rainbow', 'pixel', 'ev_bull', 'ev_neon3', 'ev_thunder', 'ev_cricket', 'ev_crown', 'ev_inferno']);

/** Punta de acero torneada: afilada, con estrías de agarre junto al cuerpo. */
function pointProfile(): THREE.Vector2[] {
  const pts: [number, number][] = [
    [0.02, 0],
    [0.22, 0.8],
    [0.5, 3],
    [0.78, 8],
    [0.98, 15],
    [1.1, 20.5],
  ];
  // estrías
  for (let i = 0; i < 6; i++) {
    const y = 21 + i * 1.6;
    pts.push([1.1, y], [0.96, y + 0.5], [0.96, y + 1.0], [1.1, y + 1.5]);
  }
  pts.push([1.18, 31], [1.25, 32]);
  return pts.map(([r, y]) => new THREE.Vector2(r * MM, y * MM));
}

/** Caña con rosca, anillos decorativos y cabeza ensanchada donde encajan las aletas. */
function shaftProfile(SL: number): THREE.Vector2[] {
  const L = SL / MM;
  const pts: [number, number][] = [
    [0.05, 0],
    [1.85, 0],
    [1.95, 0.6],
    [2.25, 2.2],
    [2.0, 3.0],
    [2.0, 4.2],
    [2.25, 4.6],
    [2.25, 5.4],
    [2.05, 5.8],
    [2.1, L * 0.5],
    [2.25, L * 0.72],
    [2.5, L - 4.5],
    [2.75, L - 2.5],
    [2.95, L - 1.2],
    [2.7, L - 0.3],
    [0.05, L],
  ];
  return pts.map(([r, y]) => new THREE.Vector2(r * MM, y * MM));
}

function flightGeometry(shape: FlightShape): THREE.BufferGeometry {
  return cached('flightx_' + shape, () => {
    const pts = flightOutline(shape);
    const s = new THREE.Shape();
    s.moveTo(pts[0][0] * MM, pts[0][1] * MM);
    s.splineThru(pts.slice(1, -1).map(([x, y]) => new THREE.Vector2(x * MM, y * MM)));
    s.lineTo(pts[pts.length - 1][0] * MM, pts[pts.length - 1][1] * MM);
    s.closePath();
    // aleta con grosor real: los bordes captan la luz
    const depth = 0.32 * MM;
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 18, steps: 1 });
    g.translate(0, 0, -depth / 2);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
    }
    g.computeVertexNormals();
    return g;
  });
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
  const part = (name: 'point' | 'barrel' | 'shaft' | 'flight') => {
    const g = new THREE.Group();
    g.userData.part = name;
    axis.add(g);
    return g;
  };

  // ---------------- punta de acero
  const pointG = part('point');
  const steel = cachedMat(
    'steel',
    () => new THREE.MeshPhysicalMaterial({ color: 0xdfe2e8, metalness: 1, roughness: 0.2, anisotropy: 0.6, clearcoat: 0.2 }),
  );
  pointG.add(new THREE.Mesh(cached('pointx', () => new THREE.LatheGeometry(pointProfile(), 20)), steel));

  // ---------------- cuerpo
  const barrelG = part('barrel');
  const bGeo = cached('barrelx_' + bd.id, () => new THREE.LatheGeometry(barrelProfile(bd), 56));
  const bMat = cachedMat('barrelx_' + bd.id, () => {
    const metal = bd.metalness > 0.6;
    const m = new THREE.MeshPhysicalMaterial({
      color: bd.color,
      metalness: bd.metalness,
      roughness: bd.roughness,
      clearcoat: metal ? 0.4 : 0.8,
      clearcoatRoughness: 0.12,
      // tungsteno torneado: brillo cepillado en círculos
      anisotropy: metal ? 0.55 : 0,
      anisotropyRotation: Math.PI / 2,
      sheen: bd.rarity === 'legendary' ? 0.3 : 0,
      sheenColor: new THREE.Color(bd.accent ?? '#ffffff'),
    });
    if (bd.grip === 'knurl') {
      m.normalMap = knurl('knurl');
      m.normalScale.set(0.9, 0.9);
    }
    return m;
  });
  const barrel = new THREE.Mesh(bGeo, bMat);
  barrel.position.y = POINT_LEN - 1 * MM;
  barrelG.add(barrel);
  const L = bd.length * MM;

  // anillos luminosos de los cuerpos legendarios
  if (bd.accent) {
    const ringMat = cachedMat('accent_' + bd.accent, () => new THREE.MeshStandardMaterial({ color: bd.accent, emissive: new THREE.Color(bd.accent), emissiveIntensity: 2.4, metalness: 0.2, roughness: 0.4 }));
    for (const f of [0.22, 0.5, 0.78]) {
      const rg = cached('accentRing_' + bd.id + f, () => new THREE.TorusGeometry(bd.radius * MM * (bd.shape === 'torpedo' ? 1 - 0.38 * Math.pow(f, 1.6) : 0.95), 0.35 * MM, 8, 40));
      const ring = new THREE.Mesh(rg, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = POINT_LEN + L * f;
      barrelG.add(ring);
    }
  } else if (bd.rarity === 'epic' || bd.rarity === 'rare') {
    // banda anodizada de color en la nariz del cuerpo
    const band = cachedMat('band_' + bd.id, () => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(bd.color).offsetHSL(0, 0.2, 0.1), metalness: 0.9, roughness: 0.25, clearcoat: 1 }));
    const bg = cached('bandRing_' + bd.id, () => new THREE.TorusGeometry(bd.radius * MM * 0.82, 0.28 * MM, 8, 40));
    const ring = new THREE.Mesh(bg, band);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = POINT_LEN + L * 0.07;
    barrelG.add(ring);
  }
  // junta tórica de goma entre cuerpo y caña
  const rubber = cachedMat('rubber', () => new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.75 }));
  const oring = new THREE.Mesh(cached('oring', () => new THREE.TorusGeometry(2.05 * MM, 0.42 * MM, 8, 28)), rubber);
  oring.rotation.x = Math.PI / 2;
  oring.position.y = POINT_LEN + L - 1.2 * MM;
  barrelG.add(oring);

  // ---------------- caña
  const shaftG = part('shaft');
  const SL = sd.length * MM;
  const sGeo = cached('shaftx_' + sd.length, () => new THREE.LatheGeometry(shaftProfile(SL), 32));
  const sMat = cachedMat('shaftx_' + sd.id, () => {
    if (sd.id === 's_carbon')
      return new THREE.MeshPhysicalMaterial({ map: carbonWeave(), metalness: 0.3, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05 });
    if (sd.id === 's_titan')
      return new THREE.MeshPhysicalMaterial({ color: '#d9d2ff', metalness: 1, roughness: 0.18, iridescence: 1, iridescenceIOR: 2.1, iridescenceThicknessRange: [220, 820], clearcoat: 0.6 });
    const metal = sd.metalness > 0.5;
    const m = new THREE.MeshPhysicalMaterial({
      color: sd.color,
      metalness: sd.metalness,
      roughness: sd.roughness,
      clearcoat: metal ? 0.6 : 0.7,
      clearcoatRoughness: 0.08,
      anisotropy: metal ? 0.5 : 0,
      anisotropyRotation: Math.PI / 2,
    });
    if (sd.emissive) {
      m.emissive = new THREE.Color(sd.emissive);
      m.emissiveIntensity = 1.7;
    }
    return m;
  });
  const shaft = new THREE.Mesh(sGeo, sMat);
  shaft.position.y = POINT_LEN + L - 2 * MM;
  shaftG.add(shaft);
  // anillo metálico de la cabeza (sujeta las aletas)
  if (sd.metalness > 0.5 || sd.rarity !== 'common') {
    const ringM = cachedMat('shaftRing_' + sd.id, () => new THREE.MeshPhysicalMaterial({ color: sd.id === 's_gold' ? '#ffe08a' : '#e6e9ef', metalness: 1, roughness: 0.15 }));
    const tr = new THREE.Mesh(cached('shaftTopRing', () => new THREE.TorusGeometry(2.85 * MM, 0.32 * MM, 8, 32)), ringM);
    tr.rotation.x = Math.PI / 2;
    tr.position.y = POINT_LEN + L - 2 * MM + SL - 2.2 * MM;
    shaftG.add(tr);
  }

  // ---------------- aletas: 4 alas en cruz con grosor
  const flightG = part('flight');
  const wingG = flightGeometry(fd.shape);
  const holo = HOLO_FLIGHTS.has(fd.design);
  const fMat = cachedMat(
    'flightx_' + fd.design,
    () =>
      new THREE.MeshPhysicalMaterial({
        map: flightTexture(fd.design),
        roughness: 0.4,
        metalness: fd.design === 'gold' || fd.design === 'ev_crown' ? 0.6 : 0.05,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
        // aletas holográficas en las raras de verdad
        iridescence: holo ? 0.75 : 0,
        iridescenceIOR: 1.7,
        iridescenceThicknessRange: [180, 640],
        sheen: holo ? 0.4 : 0,
        sheenColor: new THREE.Color('#ffffff'),
      }),
  );
  const flightBase = POINT_LEN + L + SL - 14 * MM;
  for (let k = 0; k < 4; k++) {
    const w = new THREE.Mesh(wingG, fMat);
    const holder = new THREE.Group();
    holder.rotation.y = (k * Math.PI) / 2 + Math.PI / 4;
    holder.add(w);
    flightG.add(holder);
  }
  flightG.position.y = flightBase;
  // protector de aleta metálico en las épicas y legendarias
  if (fd.rarity === 'epic' || fd.rarity === 'legendary') {
    const pm = cachedMat('protector_' + fd.rarity, () => new THREE.MeshPhysicalMaterial({ color: fd.rarity === 'legendary' ? '#ffd56a' : '#d8dce4', metalness: 1, roughness: 0.18, clearcoat: 0.5 }));
    const cap = new THREE.Mesh(cached('protector', () => new THREE.CylinderGeometry(1.9 * MM, 2.3 * MM, 3.2 * MM, 20)), pm);
    cap.position.y = 37 * MM;
    flightG.add(cap);
  }

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
    parts: {
      point: POINT_LEN / 2,
      barrel: POINT_LEN + L / 2,
      shaft: POINT_LEN + L + SL * 0.4,
      flight: flightBase + 20 * MM,
    },
    dispose() {
      root.removeFromParent();
    },
  };
}
