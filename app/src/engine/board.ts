// Diana 3D: cara de sisal con relieve, araña metálica, cuerpo y armario de madera con puertas.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BOARD } from '@shared/board';
import { boardTexture, chalkboardTexture, toTexture, woodTexture, type BoardStyle, makeCanvas } from './textures';

const MM = 0.001;
export const BOARD_HEIGHT = 1.73; // altura oficial del centro de la diana (m)
export const THROW_DISTANCE = 2.37; // distancia oficial a la línea de tiro (m)

const texCache = new Map<BoardStyle, ReturnType<typeof boardTexture>>();

export interface BoardModel {
  group: THREE.Group;
  face: THREE.Mesh;
  setStyle(style: BoardStyle): void;
}

export function buildBoard(style: BoardStyle = 'classic', withCabinet = true, texSize = 2048): BoardModel {
  const group = new THREE.Group();
  group.position.set(0, BOARD_HEIGHT, 0);

  const getTex = (s: BoardStyle) => {
    let t = texCache.get(s);
    if (!t) {
      t = boardTexture(s, texSize);
      texCache.set(s, t);
    }
    return t;
  };
  const tex = getTex(style);
  const faceMat = new THREE.MeshStandardMaterial({
    map: tex.map,
    bumpMap: tex.bump,
    bumpScale: 0.06,
    roughnessMap: tex.rough,
    roughness: 1,
    metalness: 0,
  });
  const faceGeo = new THREE.CircleGeometry(BOARD.radius * MM, 160);
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.receiveShadow = true;
  group.add(face);

  // Cuerpo (lateral negro)
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(BOARD.radius * MM, BOARD.radius * MM, 0.04, 96, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x0f0f0f, roughness: 0.85 }),
  );
  body.rotation.x = Math.PI / 2;
  body.position.z = -0.02;
  body.receiveShadow = true;
  body.castShadow = true;
  group.add(body);

  // Araña: anillos y radios metálicos fusionados en una sola malla
  const wires: THREE.BufferGeometry[] = [];
  const tube = 0.65 * MM;
  for (const r of [BOARD.bull, BOARD.outerBull, BOARD.trebleIn, BOARD.trebleOut, BOARD.doubleIn, BOARD.doubleOut]) {
    const g = new THREE.TorusGeometry(r * MM, tube, 6, r < 20 ? 48 : 180);
    wires.push(g);
  }
  for (let k = 0; k < 20; k++) {
    const a = ((90 - 9 - k * 18) * Math.PI) / 180;
    const len = (BOARD.doubleOut - BOARD.outerBull) * MM;
    const g = new THREE.CylinderGeometry(tube * 0.85, tube * 0.85, len, 5, 1);
    g.rotateZ(-Math.PI / 2);
    g.translate((BOARD.outerBull * MM + len / 2), 0, 0);
    g.rotateZ(a);
    wires.push(g);
  }
  const spiderGeo = mergeGeometries(wires.map((g) => g.toNonIndexed()));
  const spider = new THREE.Mesh(
    spiderGeo,
    new THREE.MeshStandardMaterial({ color: 0xe6e8ec, metalness: 1, roughness: 0.22 }),
  );
  spider.position.z = tube * 0.6;
  spider.castShadow = true;
  group.add(spider);

  if (withCabinet) group.add(buildCabinet());

  return {
    group,
    face,
    setStyle(s) {
      const t = getTex(s);
      faceMat.map = t.map;
      faceMat.bumpMap = t.bump;
      faceMat.roughnessMap = t.rough;
      faceMat.needsUpdate = true;
    },
  };
}

let cabinetWood: { map: THREE.Texture; bump: THREE.Texture } | null = null;

function buildCabinet(): THREE.Group {
  const g = new THREE.Group();
  if (!cabinetWood) {
    const w = woodTexture({ base: '#7a4520', dark: '#2e1606', planks: 3, seed: 21, vertical: true });
    cabinetWood = { map: toTexture(w.map), bump: toTexture(w.height, false) };
  }
  const wood = new THREE.MeshStandardMaterial({ map: cabinetWood.map, bumpMap: cabinetWood.bump, bumpScale: 0.3, roughness: 0.55, metalness: 0 });
  const W = 0.62;
  const H = 0.66;
  const D = 0.1;
  const T = 0.022;
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), wood);
  back.position.z = -0.04 - T / 2;
  back.receiveShadow = true;
  g.add(back);
  // fondo de corcho/fieltro negro detrás de la diana
  const felt = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 2 * T, H - 2 * T),
    new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 }),
  );
  felt.position.z = -0.039;
  felt.receiveShadow = true;
  g.add(felt);
  const side = (w: number, h: number, x: number, y: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, D), wood);
    m.position.set(x, y, -0.04 + D / 2 - T);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  side(W, T, 0, H / 2 - T / 2);
  side(W, T, 0, -H / 2 + T / 2);
  side(T, H, -W / 2 + T / 2, 0);
  side(T, H, W / 2 - T / 2, 0);

  // Puertas abiertas con pizarras
  const chalkL = toTexture(chalkboardTexture(['LOCAL', '501', '441', '321', '180!', '96'], 3));
  const chalkR = toTexture(chalkboardTexture(['VISITA', '501', '400', '340', '220', '140'], 8));
  const door = (sign: number, chalk: THREE.Texture) => {
    // sign = -1 puerta izquierda, +1 derecha. Cerrada cubriría media diana; aquí abierta ~110°.
    const pivot = new THREE.Group();
    pivot.position.set((sign * W) / 2, 0, -0.04 + D - T + T / 2);
    const dw = W / 2;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(dw, H, T), wood);
    panel.position.x = (-sign * dw) / 2;
    panel.castShadow = true;
    panel.receiveShadow = true;
    pivot.add(panel);
    const slate = new THREE.Mesh(
      new THREE.PlaneGeometry(dw - 0.05, H - 0.06),
      new THREE.MeshStandardMaterial({ map: chalk, roughness: 0.95 }),
    );
    slate.rotation.y = Math.PI; // cara interior (mira hacia -Z con la puerta cerrada)
    slate.position.set((-sign * dw) / 2, 0, -T / 2 - 0.0008);
    slate.receiveShadow = true;
    pivot.add(slate);
    pivot.rotation.y = sign * 1.92;
    g.add(pivot);
  };
  door(1, chalkR);
  door(-1, chalkL);
  return g;
}

// ---------------------------------------------------------------- Retícula de apuntado

export interface Reticle {
  mesh: THREE.Group;
  set(xmm: number, ymm: number, radiusMm: number, focus: number): void;
  visible(v: boolean): void;
}

export function buildReticle(): Reticle {
  const [c, ctx] = makeCanvas(256);
  const g = ctx.createRadialGradient(128, 128, 90, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.08)');
  g.addColorStop(0.86, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.arc(128, 128, 110, 0, Math.PI * 2);
  ctx.fill();
  const ringTex = toTexture(c);
  const ringMat = new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, color: 0x7dffb0, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMat);
  const [dc, dctx] = makeCanvas(64);
  const dg = dctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  dg.addColorStop(0, 'rgba(255,255,255,1)');
  dg.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  dg.addColorStop(1, 'rgba(255,255,255,0)');
  dctx.fillStyle = dg;
  dctx.fillRect(0, 0, 64, 64);
  const dotMat = new THREE.MeshBasicMaterial({ map: toTexture(dc), transparent: true, depthWrite: false, color: 0xffffff, toneMapped: false });
  const dot = new THREE.Mesh(new THREE.PlaneGeometry(0.008, 0.008), dotMat);
  const grp = new THREE.Group();
  grp.add(ring, dot);
  grp.position.z = 0.004;
  grp.renderOrder = 10;
  grp.visible = false;
  const col = new THREE.Color();
  const good = new THREE.Color(0x52ff9a);
  const bad = new THREE.Color(0xffd23a);
  return {
    mesh: grp,
    set(x, y, r, focus) {
      grp.position.x = x * MM;
      grp.position.y = y * MM;
      const s = Math.max(6, r) * 2 * MM * 1.15;
      ring.scale.set(s, s, 1);
      col.copy(bad).lerp(good, focus);
      ringMat.color.copy(col);
      ringMat.opacity = 0.65 + focus * 0.35;
    },
    visible(v) {
      grp.visible = v;
    },
  };
}
