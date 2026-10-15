// Escenarios 3D de cada arena: paredes, suelo, iluminación, neones y atrezo.

import * as THREE from 'three';
import { BOARD_HEIGHT, THROW_DISTANCE } from './board';
import {
  brickTexture,
  glowTexture,
  neonSignTexture,
  plasterTexture,
  posterTexture,
  toTexture,
  woodTexture,
  heightToNormal,
  makeCanvas,
  makeNoise,
} from './textures';
import { rng } from '@shared/bot';

export interface ArenaTheme {
  id: number;
  wall: 'brick' | 'wood' | 'plaster' | 'velvet' | 'stage' | 'cosmic';
  wallColors: string[];
  mortar?: string;
  floor: 'wood' | 'dark' | 'stage';
  key: string; // color de la luz principal
  keyIntensity: number;
  ambient: [string, string, number];
  neon: { text: string; color: string; y: number; x: number; scale: number }[];
  accents: { color: string; x: number; y: number; z: number; intensity: number }[];
  extras: ('posters' | 'lanterns' | 'strips' | 'chandeliers' | 'beams' | 'bokeh' | 'stars' | 'screens' | 'trim')[];
  fog?: [string, number];
}

export const ARENA_THEMES: ArenaTheme[] = [
  {
    id: 0,
    wall: 'brick',
    wallColors: ['#8a3b26', '#9c4a2f', '#7a3220', '#a65638', '#6e2c1c'],
    mortar: '#8f8577',
    floor: 'wood',
    key: '#ffd7a1',
    keyIntensity: 1,
    ambient: ['#ffcf9a', '#2a1a10', 0.35],
    neon: [
      { text: 'DARTS', color: '#ff2b4a', x: 0, y: 2.5, scale: 0.46 },
      { text: 'BAR', color: '#2bc8ff', x: -0.62, y: 2.12, scale: 0.28 },
    ],
    accents: [{ color: '#ff8a3a', x: 1.4, y: 2.2, z: 0.4, intensity: 2.5 }],
    extras: ['posters'],
  },
  {
    id: 1,
    wall: 'wood',
    wallColors: ['#4a3322', '#1f140b'],
    floor: 'wood',
    key: '#ffe2b8',
    keyIntensity: 0.95,
    ambient: ['#a8d8ff', '#1a1208', 0.3],
    neon: [{ text: 'TABERNA', color: '#36f0ff', x: 0, y: 2.5, scale: 0.46 }],
    accents: [
      { color: '#ffb35a', x: -1.1, y: 1.9, z: 0.3, intensity: 3 },
      { color: '#ffb35a', x: 1.1, y: 1.9, z: 0.3, intensity: 3 },
    ],
    extras: ['lanterns', 'posters'],
  },
  {
    id: 2,
    wall: 'plaster',
    wallColors: ['#17122b'],
    floor: 'dark',
    key: '#e6e0ff',
    keyIntensity: 0.85,
    ambient: ['#7a4dff', '#05030f', 0.4],
    neon: [{ text: 'NEON CLUB', color: '#ff2bd6', x: 0, y: 2.5, scale: 0.46 }],
    accents: [
      { color: '#ff2bd6', x: -1.3, y: 1.7, z: 0.4, intensity: 4 },
      { color: '#21e6ff', x: 1.3, y: 1.7, z: 0.4, intensity: 4 },
    ],
    extras: ['strips'],
  },
  {
    id: 3,
    wall: 'velvet',
    wallColors: ['#5a0d18'],
    floor: 'wood',
    key: '#fff0d0',
    keyIntensity: 0.78,
    ambient: ['#ffd27a', '#1a0505', 0.35],
    neon: [{ text: 'SALÓN DORADO', color: '#ffc93a', x: 0, y: 2.5, scale: 0.46 }],
    accents: [{ color: '#ffcf6a', x: 0, y: 2.6, z: 0.8, intensity: 3 }],
    extras: ['chandeliers', 'trim'],
  },
  {
    id: 4,
    wall: 'stage',
    wallColors: ['#0c0f1c'],
    floor: 'stage',
    key: '#ffffff',
    keyIntensity: 0.72,
    ambient: ['#4d7bff', '#020308', 0.35],
    neon: [{ text: 'GRAN ARENA', color: '#3d8bff', x: 0, y: 2.5, scale: 0.46 }],
    accents: [
      { color: '#3d8bff', x: -1.6, y: 2.4, z: 0.6, intensity: 5 },
      { color: '#ff3d6a', x: 1.6, y: 2.4, z: 0.6, intensity: 5 },
    ],
    extras: ['beams', 'bokeh', 'screens'],
  },
  {
    id: 5,
    wall: 'stage',
    wallColors: ['#0e0716'],
    floor: 'stage',
    key: '#fff6e0',
    keyIntensity: 0.72,
    ambient: ['#ffb84d', '#05020a', 0.35],
    neon: [{ text: 'MUNDIAL', color: '#ffb81f', x: 0, y: 2.5, scale: 0.46 }],
    accents: [
      { color: '#b84dff', x: -1.6, y: 2.4, z: 0.6, intensity: 5 },
      { color: '#ffb81f', x: 1.6, y: 2.4, z: 0.6, intensity: 5 },
    ],
    extras: ['beams', 'bokeh', 'screens', 'trim'],
  },
  {
    id: 6,
    wall: 'cosmic',
    wallColors: ['#070818'],
    floor: 'stage',
    key: '#f0f4ff',
    keyIntensity: 0.7,
    ambient: ['#8a6bff', '#020210', 0.45],
    neon: [{ text: 'LEYENDAS', color: '#b88aff', x: 0, y: 2.5, scale: 0.46 }],
    accents: [
      { color: '#7a5cff', x: -1.5, y: 2.2, z: 0.5, intensity: 5 },
      { color: '#ffd23a', x: 1.5, y: 2.2, z: 0.5, intensity: 4 },
    ],
    extras: ['stars', 'beams', 'bokeh'],
  },
];

export interface Environment {
  group: THREE.Group;
  /** lámpara sobre la diana (se oculta en los menús) */
  lamp: THREE.Object3D;
  /** destello de flashes del público (estadios) */
  flash(power: number): void;
  update(t: number, dt: number): void;
  keyLight: THREE.SpotLight;
}

const wallCache = new Map<string, { map: THREE.Texture; normal: THREE.Texture }>();

function wallTextures(theme: ArenaTheme, quality: 'low' | 'medium' | 'high') {
  const size = quality === 'high' ? 1024 : 512;
  const key = theme.wall + theme.wallColors.join() + size;
  let w = wallCache.get(key);
  if (w) return w;
  let res: { map: HTMLCanvasElement; height: HTMLCanvasElement };
  let repeat: [number, number] = [4, 3];
  switch (theme.wall) {
    case 'brick':
      res = brickTexture({ colors: theme.wallColors, mortar: theme.mortar ?? '#888', seed: 3, size });
      repeat = [10, 6.5];
      break;
    case 'wood':
      res = woodTexture({ base: theme.wallColors[0], dark: theme.wallColors[1], planks: 8, seed: 12, vertical: true, size: 512 });
      repeat = [6, 2.5];
      break;
    case 'velvet':
      res = plasterTexture(theme.wallColors[0], 9, 512, 0.25);
      repeat = [6, 4];
      break;
    default:
      res = plasterTexture(theme.wallColors[0], 4, 512, 0.08);
      repeat = [4, 3];
  }
  const map = toTexture(res.map, true, repeat);
  const normal = toTexture(heightToNormal(res.height, theme.wall === 'brick' ? 4 : 1.5), false, repeat);
  w = { map, normal };
  wallCache.set(key, w);
  return w;
}

let floorTex: { map: THREE.Texture; normal: THREE.Texture } | null = null;

export function buildEnvironment(theme: ArenaTheme, quality: 'low' | 'medium' | 'high'): Environment {
  const g = new THREE.Group();
  const r = rng(theme.id * 31 + 5);
  const updaters: ((t: number, dt: number) => void)[] = [];

  // Pared del fondo
  const wt = wallTextures(theme, quality);
  const wallMat = new THREE.MeshStandardMaterial({
    map: theme.wall === 'stage' || theme.wall === 'cosmic' ? null : wt.map,
    emissive: theme.wall === 'cosmic' ? new THREE.Color('#03030a') : new THREE.Color(0),
    normalMap: theme.wall === 'stage' || theme.wall === 'cosmic' ? null : wt.normal,
    color: theme.wall === 'cosmic' ? '#020208' : theme.wall === 'stage' ? theme.wallColors[0] : 0xffffff,
    roughness: theme.wall === 'velvet' ? 1 : 0.88,
    metalness: 0,
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), wallMat);
  wall.position.set(0, 2.5, -0.066);
  wall.receiveShadow = true;
  g.add(wall);

  // Suelo
  if (!floorTex) {
    const f = woodTexture({ base: '#6a4122', dark: '#2a160a', planks: 10, seed: 44, size: quality === 'high' ? 1024 : 512 });
    floorTex = { map: toTexture(f.map, true, [3, 3]), normal: toTexture(heightToNormal(f.height, 2), false, [3, 3]) };
  }
  const floorMat =
    theme.floor === 'wood'
      ? new THREE.MeshStandardMaterial({ map: floorTex.map, normalMap: floorTex.normal, roughness: 0.6 })
      : new THREE.MeshStandardMaterial({ color: theme.floor === 'stage' ? 0x0a0a12 : 0x141018, roughness: 0.35, metalness: 0.3 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 7), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 3.4);
  floor.receiveShadow = true;
  g.add(floor);

  // Línea de tiro (oche)
  const oche = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.012, 0.04), new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 1, roughness: 0.3 }));
  oche.position.set(0, 0.006, THROW_DISTANCE);
  g.add(oche);
  if (theme.floor === 'stage') {
    // alfombra de juego
    const mat = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 3.0),
      new THREE.MeshStandardMaterial({ color: theme.id === 5 ? 0x3b1a5a : 0x13284a, roughness: 0.95 }),
    );
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(0, 0.002, 1.4);
    mat.receiveShadow = true;
    g.add(mat);
  }

  // Luces
  const hemi = new THREE.HemisphereLight(theme.ambient[0], theme.ambient[1], theme.ambient[2] * 1.1);
  g.add(hemi);
  const key = new THREE.SpotLight(theme.key, 6.2 * theme.keyIntensity, 0, 0.42, 0.85, 2);
  key.position.set(0.05, BOARD_HEIGHT + 0.95, 1.05);
  key.target.position.set(0, BOARD_HEIGHT - 0.05, 0);
  key.castShadow = quality !== 'low';
  key.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.01;
  key.shadow.radius = 4;
  key.shadow.camera.near = 0.3;
  key.shadow.camera.far = 4;
  g.add(key, key.target);
  // relleno frontal suave
  const fill = new THREE.PointLight(theme.key, 0.55, 0, 2);
  fill.position.set(0, 1.5, 2.4);
  g.add(fill);

  // Lámpara de la diana (pantalla metálica sobre el armario)
  const lamp = new THREE.Group();
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.11, 0.09, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x1b3a2a, metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }),
  );
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff1d0, toneMapped: false }));
  bulb.position.y = -0.03;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.4 }));
  arm.rotation.x = Math.PI / 2;
  arm.position.z = -0.2;
  lamp.add(shade, bulb, arm);
  lamp.position.set(0, BOARD_HEIGHT + 0.4, 0.36);
  if (theme.floor !== 'stage') g.add(lamp);

  for (const a of theme.accents) {
    const p = new THREE.PointLight(a.color, a.intensity * 0.22, 0, 2);
    p.position.set(a.x, a.y, a.z);
    g.add(p);
  }

  // Neones
  for (const n of theme.neon) {
    const tex = neonSignTexture(n.text, n.color);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6 * n.scale, 0.4 * n.scale),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }),
    );
    m.position.set(n.x, n.y, -0.05);
    g.add(m);
    const glow = new THREE.PointLight(n.color, 0.14, 0, 2);
    glow.position.set(n.x, n.y, 0.35);
    g.add(glow);
    // zumbido suave del neón (sin apagones: en el móvil parecía que se iba la luz)
    const base = m.material as THREE.MeshBasicMaterial;
    const ph = r() * 6;
    updaters.push((t) => {
      base.opacity = 0.93 + Math.sin(t * 1.3 + ph) * 0.05;
    });
  }

  const addPoster = (x: number, y: number, title: string, sub: string, colors: [string, string], seed: number, rot = 0) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.02), new THREE.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.5 }));
    frame.position.set(x, y, -0.055);
    frame.rotation.z = rot;
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.56), new THREE.MeshStandardMaterial({ map: posterTexture(title, sub, colors, seed), roughness: 0.6 }));
    pic.position.z = 0.0105;
    frame.add(pic);
    frame.castShadow = true;
    frame.receiveShadow = true;
    g.add(frame);
  };

  for (const e of theme.extras) {
    switch (e) {
      case 'posters':
        addPoster(-1.05, 1.55, '180!', 'CAMPEONATO', ['#c3162a', '#2a0810'], 1, 0.03);
        addPoster(1.08, 1.6, 'BULL', 'NOCHE DE DARDOS', ['#0b8a45', '#06221a'], 2, -0.02);
        break;
      case 'lanterns':
        for (const x of [-1.1, 1.1]) {
          const lan = new THREE.Group();
          const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 12), new THREE.MeshBasicMaterial({ color: 0xffc46a, toneMapped: false, transparent: true, opacity: 0.9 }));
          const cap = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.7, roughness: 0.4 }));
          cap.position.y = 0.11;
          const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12), cap.material);
          base.position.y = -0.09;
          lan.add(glass, cap, base);
          lan.position.set(x, 1.9, 0.05);
          g.add(lan);
          updaters.push((t) => {
            (glass.material as THREE.MeshBasicMaterial).opacity = 0.86 + Math.sin(t * 1.6 + x) * 0.04 + Math.sin(t * 2.9) * 0.02;
          });
        }
        break;
      case 'strips': {
        const mk = (color: string, w: number, h: number, x: number, y: number) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.012), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
          m.position.set(x, y, -0.05);
          g.add(m);
        };
        mk('#ff2bd6', 0.02, 1.2, -0.62, BOARD_HEIGHT);
        mk('#21e6ff', 0.02, 1.2, 0.62, BOARD_HEIGHT);
        mk('#ff2bd6', 1.26, 0.02, 0, BOARD_HEIGHT + 0.6);
        mk('#21e6ff', 1.26, 0.02, 0, BOARD_HEIGHT - 0.6);
        for (let i = 0; i < 6; i++) mk(i % 2 ? '#21e6ff' : '#ff2bd6', 0.012, 0.5 + r() * 0.8, -2.4 + i * 0.25 + (i > 2 ? 3.4 : 0), 1.6 + r() * 0.5);
        break;
      }
      case 'chandeliers':
        for (const x of [-1.2, 1.2]) {
          const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
          s.scale.set(0.5, 0.5, 1);
          s.position.set(x, 2.35, 0.2);
          g.add(s);
          const p = new THREE.PointLight(0xffd27a, 0.35, 0, 2);
          p.position.set(x, 2.3, 0.3);
          g.add(p);
          for (let k = 0; k < 6; k++) {
            const c = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1c0, toneMapped: false }));
            c.position.set(x + Math.cos((k / 6) * Math.PI * 2) * 0.12, 2.3, 0.2 + Math.sin((k / 6) * Math.PI * 2) * 0.12);
            g.add(c);
          }
        }
        break;
      case 'trim': {
        const gold = new THREE.MeshStandardMaterial({ color: 0xd4a537, metalness: 1, roughness: 0.25 });
        for (const y of [0.95, 2.6]) {
          const t = new THREE.Mesh(new THREE.BoxGeometry(8, 0.03, 0.02), gold);
          t.position.set(0, y, -0.05);
          g.add(t);
        }
        break;
      }
      case 'beams': {
        const beamMat = (c: string) =>
          new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
        const colors = theme.accents.map((a) => a.color);
        const xs = [-2.3, -1.6, -0.95, 0.95, 1.6, 2.3];
        xs.forEach((x, i) => {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 3.4, 24, 1, true), beamMat(colors[i % colors.length]));
          cone.geometry.translate(0, -1.7, 0);
          const pivot = new THREE.Group();
          pivot.position.set(x, 3.8, -0.25);
          pivot.add(cone);
          g.add(pivot);
          const ph = r() * 6;
          const out = Math.sign(x);
          updaters.push((t) => {
            pivot.rotation.z = out * (0.25 + Math.sin(t * 0.4 + ph) * 0.2);
          });
        });
        break;
      }
      case 'bokeh': {
        const tex = glowTexture();
        const palette = [...theme.accents.map((a) => a.color), '#ffffff'];
        for (let i = 0; i < 40; i++) {
          const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: palette[i % palette.length], transparent: true, opacity: 0.25 + r() * 0.3, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
          const side = r() < 0.5 ? -1 : 1;
          s.position.set(side * (0.75 + r() * 2.5), 0.6 + r() * 2.6, -0.04);
          const sz = 0.05 + r() * 0.12;
          s.scale.set(sz, sz, 1);
          g.add(s);
          const ph = r() * 6;
          const base = s.material.opacity;
          updaters.push((t) => {
            s.material.opacity = base * (0.6 + 0.4 * Math.sin(t * (0.5 + ph * 0.2) + ph));
          });
        }
        break;
      }
      case 'stars': {
        const n = 600;
        const pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          pos[i * 3] = (r() - 0.5) * 7;
          pos[i * 3 + 1] = r() * 4.5 + 0.2;
          pos[i * 3 + 2] = -0.06;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.012, color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false }));
        g.add(pts);
        // nebulosa
        const [c, ctx] = makeCanvas(512);
        for (let k = 0; k < 18; k++) {
          const gr = ctx.createRadialGradient(r() * 512, r() * 512, 0, 256, 256, 260);
          const col = k % 2 ? 'rgba(140,90,255,0.022)' : 'rgba(60,120,255,0.018)';
          gr.addColorStop(0, col);
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gr;
          ctx.fillRect(0, 0, 512, 512);
        }
        const neb = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.5), new THREE.MeshBasicMaterial({ map: toTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        neb.position.set(0, 2.4, -0.063);
        g.add(neb);
        updaters.push((t) => {
          (pts.material as THREE.PointsMaterial).opacity = 0.7 + Math.sin(t * 2) * 0.15;
        });
        break;
      }
      case 'screens': {
        for (const x of [-1.35, 1.35]) {
          const [c, ctx] = makeCanvas(512, 288);
          const gr = ctx.createLinearGradient(0, 0, 512, 288);
          gr.addColorStop(0, theme.accents[0].color);
          gr.addColorStop(1, '#05050a');
          ctx.fillStyle = gr;
          ctx.fillRect(0, 0, 512, 288);
          ctx.fillStyle = '#ffffff';
          ctx.font = '120px "Lilita One", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(x < 0 ? '180' : 'LIVE', 256, 150);
          const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshBasicMaterial({ map: toTexture(c), toneMapped: false }));
          scr.position.set(x, 2.05, -0.05);
          const frame = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.56, 0.03), new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.5, roughness: 0.4 }));
          frame.position.set(x, 2.05, -0.068);
          g.add(frame, scr);
        }
        break;
      }
    }
  }

  // Anillo de luz LED alrededor de la diana (como en los torneos profesionales)
  if (theme.floor === 'stage') {
    const ringCol = theme.accents[0]?.color ?? '#ffffff';
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.262, 0.0065, 12, 96), new THREE.MeshBasicMaterial({ color: '#b8c8ff', toneMapped: false }));
    ring.position.set(0, BOARD_HEIGHT, -0.004);
    g.add(ring);
    const housing = new THREE.Mesh(new THREE.TorusGeometry(0.262, 0.013, 10, 96), new THREE.MeshStandardMaterial({ color: 0x1a1d24, metalness: 0.8, roughness: 0.3 }));
    housing.position.set(0, BOARD_HEIGHT, -0.014);
    housing.scale.z = 0.6;
    g.add(housing);
    const [hc, hctx] = makeCanvas(256);
    const hg = hctx.createRadialGradient(128, 128, 88, 128, 128, 128);
    hg.addColorStop(0, 'rgba(255,255,255,0)');
    hg.addColorStop(0.62, 'rgba(255,255,255,0.9)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    hctx.fillStyle = hg;
    hctx.fillRect(0, 0, 256, 256);
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9),
      new THREE.MeshBasicMaterial({ map: toTexture(hc), color: ringCol, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    halo.position.set(0, BOARD_HEIGHT, -0.035);
    g.add(halo);
    updaters.push((t) => {
      (halo.material as THREE.MeshBasicMaterial).opacity = 0.17 + Math.sin(t * 1.4) * 0.03;
    });
  }

  // Haz de luz volumétrico con motas de polvo (lámpara en los bares, foco cenital en los estadios)
  const stage = theme.floor === 'stage';
  const beamHost = stage ? g : lamp;
  const from = stage ? new THREE.Vector3(0.02, BOARD_HEIGHT + 2.3, 1.3) : new THREE.Vector3(0, -0.02, 0);
  const to = stage ? new THREE.Vector3(0, BOARD_HEIGHT - 0.12, 0.02) : new THREE.Vector3(0, -0.42, -0.34);
  const len = from.distanceTo(to) * 1.08;
  const beamGeo = new THREE.CylinderGeometry(stage ? 0.07 : 0.05, stage ? 0.55 : 0.36, len, 48, 1, true);
  beamGeo.translate(0, -len / 2, 0);
  const beam = new THREE.Mesh(
    beamGeo,
    new THREE.MeshBasicMaterial({ map: beamTexture(), color: theme.key, transparent: true, opacity: stage ? 0.1 : 0.085, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  beam.position.copy(from);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
  beam.renderOrder = 3;
  beamHost.add(beam);
  {
    const N = quality === 'low' ? 40 : 110;
    const pos = new Float32Array(N * 3);
    const seeds = new Float32Array(N);
    const dir = to.clone().sub(from);
    for (let i = 0; i < N; i++) {
      const k = 0.15 + r() * 0.85;
      const rad = (stage ? 0.5 : 0.32) * k * Math.sqrt(r());
      const a = r() * Math.PI * 2;
      pos[i * 3] = from.x + dir.x * k + Math.cos(a) * rad;
      pos[i * 3 + 1] = from.y + dir.y * k + Math.sin(a) * rad * 0.5;
      pos[i * 3 + 2] = from.z + dir.z * k + Math.sin(a) * rad;
      seeds[i] = r() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const base = pos.slice();
    const motes = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ map: glowTexture(), size: stage ? 0.012 : 0.006, color: theme.key, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    motes.frustumCulled = false;
    motes.renderOrder = 4;
    beamHost.add(motes);
    updaters.push((t) => {
      if (!beamHost.visible) return;
      const pa = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < N; i++) {
        const sd = seeds[i];
        pa.setXYZ(
          i,
          base[i * 3] + Math.sin(t * 0.21 + sd) * 0.03,
          base[i * 3 + 1] + Math.sin(t * 0.13 + sd * 1.7) * 0.025 - ((t * 0.006 + sd) % 0.05),
          base[i * 3 + 2] + Math.cos(t * 0.17 + sd) * 0.03,
        );
      }
      pa.needsUpdate = true;
      (motes.material as THREE.PointsMaterial).opacity = 0.45 + Math.sin(t * 1.3) * 0.12;
      (beam.material as THREE.MeshBasicMaterial).opacity = (stage ? 0.1 : 0.085) * (0.92 + Math.sin(t * 0.7) * 0.08);
    });
  }

  // Humo/ambiente suave en lo alto del local
  if (quality !== 'low') {
    const smoke = smokeTexture();
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 1.4),
        new THREE.MeshBasicMaterial({ map: smoke, color: i === 1 ? theme.ambient[0] : theme.key, transparent: true, opacity: stage ? 0.07 : 0.05, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      );
      const x0 = (i - 1) * 1.4;
      const y0 = BOARD_HEIGHT + 0.55 + i * 0.18;
      m.position.set(x0, y0, 0.25 + i * 0.25);
      g.add(m);
      const ph = r() * 10;
      updaters.push((t) => {
        m.position.x = x0 + Math.sin(t * 0.05 + ph) * 0.4;
        m.position.y = y0 + Math.sin(t * 0.07 + ph) * 0.06;
        m.rotation.z = Math.sin(t * 0.03 + ph) * 0.08;
      });
    }
  }

  // Flashes del público
  const flashes: THREE.Sprite[] = [];
  if (theme.extras.includes('bokeh')) {
    for (let i = 0; i < 18; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      s.position.set((r() < 0.5 ? -1 : 1) * (0.7 + r() * 2.3), 0.5 + r() * 2, 0.1);
      s.scale.set(0.12, 0.12, 1);
      g.add(s);
      flashes.push(s);
    }
  }
  let flashPower = 0;

  if (theme.fog) g.userData.fog = theme.fog;

  return {
    group: g,
    lamp,
    keyLight: key,
    flash(power) {
      flashPower = Math.max(flashPower, power);
    },
    update(t, dt) {
      for (const u of updaters) u(t, dt);
      if (flashes.length) {
        for (const f of flashes) {
          const m = f.material;
          if (flashPower > 0 && r() < flashPower * dt * 6) m.opacity = 1;
          m.opacity = Math.max(0, m.opacity - dt * 6);
        }
        flashPower = Math.max(0, flashPower - dt * 0.5);
      }
    },
  };
}

let beamTex: THREE.Texture | null = null;
/** Textura del haz: brillante arriba, se desvanece abajo, con vetas de polvo. */
function beamTexture(): THREE.Texture {
  if (beamTex) return beamTex;
  const [c, ctx] = makeCanvas(256, 256);
  const n = makeNoise(77);
  const img = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    const v = y / 255;
    const fall = Math.pow(1 - v, 1.4) * (0.35 + 0.65 * Math.min(1, v * 6));
    for (let x = 0; x < 256; x++) {
      const streak = 0.65 + 0.35 * n.fbm(x / 9, y / 70, 3);
      const edge = Math.sin((x / 255) * Math.PI);
      const a = fall * streak * (0.55 + 0.45 * edge);
      const i = (y * 256 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  beamTex = toTexture(c);
  return beamTex;
}

let smokeTex: THREE.Texture | null = null;
function smokeTexture(): THREE.Texture {
  if (smokeTex) return smokeTex;
  const [c, ctx] = makeCanvas(256, 128);
  const n = makeNoise(91);
  const img = ctx.createImageData(256, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 256; x++) {
      const u = x / 255;
      const v = y / 127;
      const mask = Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
      const d = Math.max(0, n.fbm(x / 40, y / 30, 5) - 0.35) * 1.8;
      const i = (y * 256 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(Math.min(1, d * mask * mask) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  smokeTex = toTexture(c);
  return smokeTex;
}
