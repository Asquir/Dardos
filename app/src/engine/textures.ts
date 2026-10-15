// Texturas procedurales generadas con <canvas>: diana de sisal, madera, ladrillo,
// pizarra, metal moleteado y diseños de aletas. Sin archivos de imagen externos.

import * as THREE from 'three';
import { BOARD, SEGMENTS } from '@shared/board';
import { rng } from '@shared/bot';

export function makeCanvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  return [c, ctx];
}

/** Ruido de valor 2D suave con fbm. */
export function makeNoise(seed: number) {
  const r = rng(seed);
  const N = 256;
  const tab = new Float32Array(N * N);
  for (let i = 0; i < tab.length; i++) tab[i] = r();
  const at = (x: number, y: number) => tab[((y & (N - 1)) * N + (x & (N - 1)))];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  const fbm = (x: number, y: number, oct = 4) => {
    let v = 0;
    let amp = 0.5;
    let f = 1;
    for (let i = 0; i < oct; i++) {
      v += noise(x * f, y * f) * amp;
      f *= 2;
      amp *= 0.5;
    }
    return v;
  };
  return { noise, fbm };
}

export function toTexture(c: HTMLCanvasElement, srgb = true, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.needsUpdate = true;
  return t;
}

/** Convierte un mapa de alturas (canal R) en un mapa de normales. */
export function heightToNormal(src: HTMLCanvasElement, strength = 2): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const sd = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const [c, ctx] = makeCanvas(w, h);
  const out = ctx.createImageData(w, h);
  const H = (x: number, y: number) => sd[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

// ---------------------------------------------------------------- Diana

export interface BoardTextures {
  map: THREE.Texture;
  bump: THREE.Texture;
  rough: THREE.Texture;
}

export type BoardStyle = 'classic' | 'neon' | 'gold' | 'ice' | 'inferno';

const BOARD_COLORS: Record<BoardStyle, { black: string; white: string; red: string; green: string; num: string; outer: string }> = {
  classic: { black: '#161514', white: '#ece0bf', red: '#c3162a', green: '#0b8a45', num: '#e8e8e8', outer: '#121212' },
  neon: { black: '#0d0b1d', white: '#2a2350', red: '#ff2d8a', green: '#16e0ff', num: '#bff6ff', outer: '#08061a' },
  gold: { black: '#151210', white: '#efe0b0', red: '#9d1022', green: '#14563a', num: '#ffd76a', outer: '#1a1408' },
  ice: { black: '#16232f', white: '#e4f3ff', red: '#2c7fd6', green: '#7bd3f7', num: '#e8fbff', outer: '#0d1820' },
  inferno: { black: '#140806', white: '#f0c48a', red: '#ff4b12', green: '#ffb100', num: '#ffd9a8', outer: '#120604' },
};

export function boardTexture(style: BoardStyle = 'classic', size = 2048): BoardTextures {
  const col = BOARD_COLORS[style];
  const [c, ctx] = makeCanvas(size);
  const cx = size / 2;
  const scale = (size / 2) / BOARD.radius; // px por mm
  const R = (mm: number) => mm * scale;
  ctx.fillStyle = col.outer;
  ctx.fillRect(0, 0, size, size);

  const sector = (r0: number, r1: number, a0: number, a1: number, color: string) => {
    ctx.beginPath();
    ctx.arc(cx, cx, R(r1), a0, a1, false);
    ctx.arc(cx, cx, R(r0), a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  for (let i = 0; i < 20; i++) {
    // ángulo canvas: 0 = derecha, sentido horario (y hacia abajo)
    const center = -(90 - i * 18) * (Math.PI / 180);
    const a0 = center - (9 * Math.PI) / 180;
    const a1 = center + (9 * Math.PI) / 180;
    const dark = i % 2 === 0;
    const single = dark ? col.black : col.white;
    const ring = dark ? col.red : col.green;
    sector(BOARD.outerBull, BOARD.trebleIn, a0, a1, single);
    sector(BOARD.trebleIn, BOARD.trebleOut, a0, a1, ring);
    sector(BOARD.trebleOut, BOARD.doubleIn, a0, a1, single);
    sector(BOARD.doubleIn, BOARD.doubleOut, a0, a1, ring);
  }
  ctx.beginPath();
  ctx.arc(cx, cx, R(BOARD.outerBull), 0, Math.PI * 2);
  ctx.fillStyle = col.green;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cx, R(BOARD.bull), 0, Math.PI * 2);
  ctx.fillStyle = col.red;
  ctx.fill();

  // Fibras de sisal: grano fino por píxel + manchas suaves.
  const { fbm } = makeNoise(42);
  const r = rng(99);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  const [bc, bctx] = makeCanvas(size);
  const bimg = bctx.createImageData(size, size);
  const bd = bimg.data;
  const playR = R(BOARD.doubleOut);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cx;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const inside = dist < playR;
      const grain = r();
      const blot = fbm(x * 0.012, y * 0.012, 3);
      // fibras orientadas radialmente (el sisal se ve "de punta")
      const fiber = inside ? 0.82 + grain * 0.3 + (blot - 0.5) * 0.18 : 0.9 + grain * 0.14;
      d[i] = Math.min(255, d[i] * fiber);
      d[i + 1] = Math.min(255, d[i + 1] * fiber);
      d[i + 2] = Math.min(255, d[i + 2] * fiber);
      const hgt = inside ? 140 + (grain - 0.5) * 150 + (blot - 0.5) * 60 : 120 + (grain - 0.5) * 40;
      bd[i] = bd[i + 1] = bd[i + 2] = Math.max(0, Math.min(255, hgt));
      bd[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  bctx.putImageData(bimg, 0, 0);

  // Agujeros de dardos usados alrededor de las zonas más jugadas (realismo).
  const holes: [string, number][] = [['T20', 140], ['T19', 60], ['DB', 70], ['D16', 30], ['D20', 40], ['T18', 25], ['S20', 120], ['S1', 30], ['S5', 30], ['D8', 15]];
  for (const [t, n] of holes) {
    for (let k = 0; k < n; k++) {
      const p = holeTarget(t);
      const hx = cx + R(p.x + (r() - 0.5) * (t[0] === 'S' ? 30 : 12));
      const hy = cx - R(p.y + (r() - 0.5) * (t[0] === 'S' ? 30 : 8));
      ctx.fillStyle = `rgba(0,0,0,${0.18 + r() * 0.22})`;
      ctx.beginPath();
      ctx.arc(hx, hy, 1.2 + r() * 1.6, 0, Math.PI * 2);
      ctx.fill();
      bctx.fillStyle = 'rgba(0,0,0,0.7)';
      bctx.beginPath();
      bctx.arc(hx, hy, 1.4 + r() * 1.4, 0, Math.PI * 2);
      bctx.fill();
    }
  }

  // Números del anillo exterior (siempre legibles, en vertical).
  const font = `${Math.round(R(27))}px "Lilita One", "Arial Black", Arial, sans-serif`;
  const drawNumbers = (g: CanvasRenderingContext2D, fill: (x: number, y: number, n: string) => void) => {
    g.save();
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < 20; i++) {
      const a = (90 - i * 18) * (Math.PI / 180);
      fill(cx + Math.cos(a) * R(BOARD.numberRing), cx - Math.sin(a) * R(BOARD.numberRing) + R(1), String(SEGMENTS[i]));
    }
    g.restore();
  };
  drawNumbers(ctx, (x, y, n) => {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(n, x + R(0.8), y + R(1.2));
    const g = ctx.createLinearGradient(0, y - R(12), 0, y + R(12));
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, col.num);
    g.addColorStop(1, '#8c8c8c');
    ctx.fillStyle = g;
    ctx.fillText(n, x, y);
  });
  drawNumbers(bctx, (x, y, n) => {
    bctx.fillStyle = '#ffffff';
    bctx.fillText(n, x, y);
  });

  // Rugosidad: sisal mate, anillo exterior satinado y números metálicos brillantes.
  const [rc, rctx] = makeCanvas(size);
  rctx.fillStyle = '#b4b4b4';
  rctx.fillRect(0, 0, size, size);
  rctx.fillStyle = '#f2f2f2';
  rctx.beginPath();
  rctx.arc(cx, cx, R(BOARD.doubleOut), 0, Math.PI * 2);
  rctx.fill();
  drawNumbers(rctx, (x, y, n) => {
    rctx.fillStyle = '#505050';
    rctx.fillText(n, x, y);
  });

  const map = toTexture(c);
  const bump = toTexture(bc, false);
  const rough = toTexture(rc, false);
  return { map, bump, rough };
}

function holeTarget(t: string) {
  // copia local para no crear dependencia circular
  const num = t === 'DB' ? 0 : parseInt(t.slice(1), 10);
  if (t === 'DB') return { x: 0, y: 0 };
  const i = SEGMENTS.indexOf(num as (typeof SEGMENTS)[number]);
  const a = (90 - i * 18) * (Math.PI / 180);
  const rr = t[0] === 'T' ? 103 : t[0] === 'D' ? 166 : 130;
  return { x: Math.cos(a) * rr, y: Math.sin(a) * rr };
}

// ---------------------------------------------------------------- Madera

export function woodTexture(opts: { base: string; dark: string; planks?: number; seed?: number; size?: number; vertical?: boolean } = { base: '#6b3f1f', dark: '#3a1f0c' }) {
  const size = opts.size ?? 1024;
  const [c, ctx] = makeCanvas(size);
  const [hc, hctx] = makeCanvas(size);
  const { fbm, noise } = makeNoise(opts.seed ?? 7);
  const base = new THREE.Color(opts.base);
  const dark = new THREE.Color(opts.dark);
  const planks = opts.planks ?? 6;
  const img = ctx.createImageData(size, size);
  const himg = hctx.createImageData(size, size);
  const r = rng(opts.seed ?? 7);
  const tints = Array.from({ length: planks }, () => 0.85 + r() * 0.3);
  const offs = Array.from({ length: planks }, () => r() * 1000);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = opts.vertical ? y : x;
      const v = opts.vertical ? x : y;
      const plank = Math.floor((v / size) * planks);
      const inPlank = ((v / size) * planks) % 1;
      const gap = inPlank < 0.012 || inPlank > 0.988;
      const o = offs[plank];
      const warp = fbm((u + o) * 0.004, v * 0.03, 4) * 6;
      const ring = Math.sin((v * 0.09 + warp * 3.5 + noise(u * 0.002 + o, v * 0.01) * 4) * 2.2);
      const fine = noise(u * 0.4 + o, v * 2.5) * 0.25;
      let t = 0.5 + ring * 0.32 + fine;
      t = Math.max(0, Math.min(1, t));
      const tint = tints[plank];
      let rr = (base.r + (dark.r - base.r) * t) * tint;
      let gg = (base.g + (dark.g - base.g) * t) * tint;
      let bb = (base.b + (dark.b - base.b) * t) * tint;
      if (gap) {
        rr *= 0.25;
        gg *= 0.25;
        bb *= 0.25;
      }
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, Math.pow(rr, 1 / 2.2) * 255);
      img.data[i + 1] = Math.min(255, Math.pow(gg, 1 / 2.2) * 255);
      img.data[i + 2] = Math.min(255, Math.pow(bb, 1 / 2.2) * 255);
      img.data[i + 3] = 255;
      const hv = gap ? 0 : 150 + ring * 25 + fine * 60;
      himg.data[i] = himg.data[i + 1] = himg.data[i + 2] = hv;
      himg.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  hctx.putImageData(himg, 0, 0);
  return { map: c, height: hc };
}

// ---------------------------------------------------------------- Ladrillo

export function brickTexture(opts: { colors: string[]; mortar: string; seed?: number; size?: number; dirt?: number }) {
  const size = opts.size ?? 1024;
  const [c, ctx] = makeCanvas(size);
  const [hc, hctx] = makeCanvas(size);
  const r = rng(opts.seed ?? 3);
  const { fbm } = makeNoise(opts.seed ?? 3);
  const bw = size / 4;
  const bh = size / 12;
  const m = Math.max(3, size / 170);
  ctx.fillStyle = opts.mortar;
  ctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#202020';
  hctx.fillRect(0, 0, size, size);
  for (let row = 0; row < 12; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let col = -1; col < 5; col++) {
      const x = col * bw + off;
      const y = row * bh;
      const base = new THREE.Color(opts.colors[Math.floor(r() * opts.colors.length)]);
      base.offsetHSL((r() - 0.5) * 0.02, (r() - 0.5) * 0.1, (r() - 0.5) * 0.1);
      ctx.fillStyle = '#' + base.getHexString();
      ctx.fillRect(x + m / 2, y + m / 2, bw - m, bh - m);
      const g = hctx.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, '#b0b0b0');
      g.addColorStop(0.5, '#d8d8d8');
      g.addColorStop(1, '#a0a0a0');
      hctx.fillStyle = g;
      hctx.fillRect(x + m / 2, y + m / 2, bw - m, bh - m);
    }
  }
  // grano, manchas y desgaste
  const img = ctx.getImageData(0, 0, size, size);
  const himg = hctx.getImageData(0, 0, size, size);
  const dirt = opts.dirt ?? 0.35;
  for (let i = 0; i < img.data.length; i += 4) {
    const p = i / 4;
    const x = p % size;
    const y = (p / size) | 0;
    const n = fbm(x * 0.01, y * 0.01, 4);
    const grain = r();
    const f = 0.82 + grain * 0.22 - (n - 0.5) * dirt;
    img.data[i] *= f;
    img.data[i + 1] *= f;
    img.data[i + 2] *= f;
    himg.data[i] = himg.data[i + 1] = himg.data[i + 2] = himg.data[i] * (0.85 + grain * 0.2);
  }
  ctx.putImageData(img, 0, 0);
  hctx.putImageData(himg, 0, 0);
  return { map: c, height: hc };
}

// ---------------------------------------------------------------- Yeso / pintura / suelo de estadio

export function plasterTexture(color: string, seed = 5, size = 512, amount = 0.12) {
  const [c, ctx] = makeCanvas(size);
  const [hc, hctx] = makeCanvas(size);
  const { fbm } = makeNoise(seed);
  const base = new THREE.Color(color);
  const img = ctx.createImageData(size, size);
  const himg = hctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x * 0.02, y * 0.02, 5);
      const f = 1 + (n - 0.5) * amount * 2;
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, Math.pow(base.r * f, 1 / 2.2) * 255);
      img.data[i + 1] = Math.min(255, Math.pow(base.g * f, 1 / 2.2) * 255);
      img.data[i + 2] = Math.min(255, Math.pow(base.b * f, 1 / 2.2) * 255);
      img.data[i + 3] = 255;
      himg.data[i] = himg.data[i + 1] = himg.data[i + 2] = n * 255;
      himg.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  hctx.putImageData(himg, 0, 0);
  return { map: c, height: hc };
}

/** Pizarra con tiza para las puertas del armario de la diana. */
export function chalkboardTexture(lines: string[], seed = 1) {
  const [c, ctx] = makeCanvas(512, 1024);
  const { fbm } = makeNoise(seed);
  const img = ctx.createImageData(512, 1024);
  for (let y = 0; y < 1024; y++) {
    for (let x = 0; x < 512; x++) {
      const n = fbm(x * 0.01, y * 0.01, 4);
      const i = (y * 512 + x) * 4;
      img.data[i] = 28 + n * 18;
      img.data[i + 1] = 38 + n * 18;
      img.data[i + 2] = 34 + n * 16;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // restos de tiza borrada
  const r = rng(seed + 9);
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.04})`;
    ctx.beginPath();
    ctx.ellipse(r() * 512, r() * 1024, 40 + r() * 80, 10 + r() * 30, r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.font = '64px "Lilita One", "Comic Sans MS", cursive';
  ctx.textAlign = 'center';
  lines.forEach((l, i) => {
    ctx.fillStyle = 'rgba(240,240,230,0.85)';
    ctx.fillText(l, 256 + (r() - 0.5) * 10, 120 + i * 95);
  });
  ctx.strokeStyle = 'rgba(240,240,230,0.7)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(256, 160);
  ctx.lineTo(256, 980);
  ctx.stroke();
  return c;
}

// ---------------------------------------------------------------- Metal

export function knurlTexture(kind: 'rings' | 'knurl' | 'shark' | 'smooth', size = 256) {
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  if (kind === 'knurl') {
    ctx.strokeStyle = '#303030';
    ctx.lineWidth = 3;
    for (let i = -size; i < size * 2; i += 12) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + size, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + size, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
    }
  } else if (kind === 'rings') {
    for (let y = 0; y < size; y += 16) {
      const g = ctx.createLinearGradient(0, y, 0, y + 16);
      g.addColorStop(0, '#b0b0b0');
      g.addColorStop(0.5, '#404040');
      g.addColorStop(1, '#b0b0b0');
      ctx.fillStyle = g;
      ctx.fillRect(0, y, size, 16);
    }
  } else if (kind === 'shark') {
    for (let y = 0; y < size; y += 20) {
      const g = ctx.createLinearGradient(0, y, 0, y + 20);
      g.addColorStop(0, '#d0d0d0');
      g.addColorStop(0.8, '#606060');
      g.addColorStop(1, '#202020');
      ctx.fillStyle = g;
      ctx.fillRect(0, y, size, 20);
    }
  }
  return toTexture(heightToNormal(c, 3), false);
}

// ---------------------------------------------------------------- Aletas

export type FlightDesign = {
  id: string;
  draw: (ctx: CanvasRenderingContext2D, s: number) => void;
};

const flag = (colors: string[], vertical = false) => (ctx: CanvasRenderingContext2D, s: number) => {
  const n = colors.length;
  colors.forEach((col, i) => {
    ctx.fillStyle = col;
    if (vertical) ctx.fillRect((i * s) / n, 0, s / n + 1, s);
    else ctx.fillRect(0, (i * s) / n, s, s / n + 1);
  });
};

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

export const FLIGHT_DESIGNS: Record<string, FlightDesign['draw']> = {
  solid_red: (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#ff4d4d');
    g.addColorStop(1, '#a00010');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  },
  solid_blue: (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#4db4ff');
    g.addColorStop(1, '#0a2a8a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  },
  solid_black: (ctx, s) => {
    ctx.fillStyle = '#151515';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = s * 0.04;
    ctx.strokeRect(s * 0.05, s * 0.05, s * 0.9, s * 0.9);
  },
  stripes: (ctx, s) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#ff7a00';
      ctx.fillRect(0, (i * s) / 8, s, s / 8 + 1);
    }
  },
  checker: (ctx, s) => {
    const n = 6;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#111111' : '#f2f2f2';
        ctx.fillRect((x * s) / n, (y * s) / n, s / n + 1, s / n + 1);
      }
  },
  flames: (ctx, s) => {
    ctx.fillStyle = '#1a0500';
    ctx.fillRect(0, 0, s, s);
    const cols = ['#ff2a00', '#ff7b00', '#ffd000', '#fff2a0'];
    cols.forEach((col, k) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, s);
      for (let i = 0; i <= 10; i++) {
        const x = (i / 10) * s;
        const tip = s * (0.15 + k * 0.17) + Math.sin(i * 1.7 + k) * s * 0.08;
        ctx.quadraticCurveTo(x - s * 0.04, tip + s * 0.2, x, i % 2 ? tip + s * 0.18 : tip);
      }
      ctx.lineTo(s, s);
      ctx.closePath();
      ctx.fill();
    });
  },
  galaxy: (ctx, s) => {
    const g = ctx.createRadialGradient(s * 0.4, s * 0.4, 0, s / 2, s / 2, s * 0.8);
    g.addColorStop(0, '#a86bff');
    g.addColorStop(0.4, '#3b1a8f');
    g.addColorStop(1, '#05021a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    const r = rng(5);
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = `rgba(255,255,255,${r()})`;
      ctx.fillRect(r() * s, r() * s, r() * 2.5, r() * 2.5);
    }
    star(ctx, s * 0.7, s * 0.3, s * 0.06, '#ffffff');
  },
  tiger: (ctx, s) => {
    ctx.fillStyle = '#ff9a1a';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#141414';
    const r = rng(8);
    for (let i = 0; i < 9; i++) {
      const y = (i / 9) * s + r() * 10;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(s * 0.4, y + 14 + r() * 20, s * (0.5 + r() * 0.4), y + 4);
      ctx.quadraticCurveTo(s * 0.3, y + 6, 0, y + 12 + r() * 8);
      ctx.fill();
    }
  },
  lightning: (ctx, s) => {
    ctx.fillStyle = '#0a0f3a';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    ctx.moveTo(s * 0.55, s * 0.05);
    ctx.lineTo(s * 0.25, s * 0.55);
    ctx.lineTo(s * 0.48, s * 0.55);
    ctx.lineTo(s * 0.35, s * 0.95);
    ctx.lineTo(s * 0.78, s * 0.4);
    ctx.lineTo(s * 0.55, s * 0.4);
    ctx.lineTo(s * 0.7, s * 0.05);
    ctx.closePath();
    ctx.fill();
  },
  target: (ctx, s) => {
    for (let i = 6; i > 0; i--) {
      ctx.fillStyle = i % 2 ? '#e8102e' : '#ffffff';
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, (i / 6) * s * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  camo: (ctx, s) => {
    ctx.fillStyle = '#4a5a2a';
    ctx.fillRect(0, 0, s, s);
    const cols = ['#2f3a1a', '#7a7a48', '#1c2210', '#5e6e34'];
    const r = rng(12);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath();
      ctx.ellipse(r() * s, r() * s, 10 + r() * 30, 6 + r() * 18, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  neon: (ctx, s) => {
    ctx.fillStyle = '#05000f';
    ctx.fillRect(0, 0, s, s);
    ['#ff00d4', '#00f0ff', '#7dff00'].forEach((col, i) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = s * 0.05;
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, s * (0.25 + i * 0.25));
      ctx.lineTo(s, s * (0.05 + i * 0.25));
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
  },
  gold: (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#fff1a8');
    g.addColorStop(0.35, '#e0a800');
    g.addColorStop(0.6, '#fff0a0');
    g.addColorStop(1, '#8a5a00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    star(ctx, s / 2, s / 2, s * 0.22, 'rgba(120,70,0,0.55)');
  },
  rainbow: (ctx, s) => flag(['#ff0018', '#ffa52c', '#ffff41', '#008018', '#0000f9', '#86007d'])(ctx, s),
  ice: (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#e9fbff');
    g.addColorStop(1, '#5fb7ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    const r = rng(4);
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      const x = r() * s;
      const y = r() * s;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 60);
      ctx.stroke();
    }
  },
  skull: (ctx, s) => {
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#efefef';
    ctx.beginPath();
    ctx.arc(s / 2, s * 0.42, s * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(s * 0.36, s * 0.55, s * 0.28, s * 0.18);
    ctx.fillStyle = '#121212';
    ctx.beginPath();
    ctx.arc(s * 0.41, s * 0.42, s * 0.07, 0, Math.PI * 2);
    ctx.arc(s * 0.59, s * 0.42, s * 0.07, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 3; i++) ctx.fillRect(s * (0.4 + i * 0.08), s * 0.62, s * 0.03, s * 0.12);
  },
  heart: (ctx, s) => {
    ctx.fillStyle = '#ffd1e6';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#ff2d74';
    ctx.beginPath();
    ctx.moveTo(s / 2, s * 0.8);
    ctx.bezierCurveTo(s * 0.05, s * 0.5, s * 0.25, s * 0.1, s / 2, s * 0.32);
    ctx.bezierCurveTo(s * 0.75, s * 0.1, s * 0.95, s * 0.5, s / 2, s * 0.8);
    ctx.fill();
  },
  carbon: (ctx, s) => {
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(0, 0, s, s);
    const n = 16;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const g = ctx.createLinearGradient((x * s) / n, 0, ((x + 1) * s) / n, 0);
        const up = (x + y) % 2 === 0;
        g.addColorStop(0, up ? '#3a3a3a' : '#141414');
        g.addColorStop(1, up ? '#141414' : '#3a3a3a');
        ctx.fillStyle = g;
        ctx.fillRect((x * s) / n, (y * s) / n, s / n, s / n);
      }
  },
  spain: flag(['#aa151b', '#f1bf00', '#f1bf00', '#aa151b']),
  mexico: flag(['#006847', '#ffffff', '#ce1126'], true),
  argentina: (ctx, s) => {
    flag(['#74acdf', '#ffffff', '#74acdf'])(ctx, s);
    ctx.fillStyle = '#f6b40e';
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  },
  colombia: flag(['#fcd116', '#fcd116', '#003893', '#ce1126']),
  uk: (ctx, s) => {
    ctx.fillStyle = '#012169';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = s * 0.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(s, s);
    ctx.moveTo(s, 0);
    ctx.lineTo(0, s);
    ctx.stroke();
    ctx.strokeStyle = '#c8102e';
    ctx.lineWidth = s * 0.07;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(s * 0.38, 0, s * 0.24, s);
    ctx.fillRect(0, s * 0.38, s, s * 0.24);
    ctx.fillStyle = '#c8102e';
    ctx.fillRect(s * 0.43, 0, s * 0.14, s);
    ctx.fillRect(0, s * 0.43, s, s * 0.14);
  },
  usa: (ctx, s) => {
    for (let i = 0; i < 13; i++) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#b22234';
      ctx.fillRect(0, (i * s) / 13, s, s / 13 + 1);
    }
    ctx.fillStyle = '#3c3b6e';
    ctx.fillRect(0, 0, s * 0.5, s * 0.54);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) star(ctx, s * 0.05 + x * s * 0.08, s * 0.06 + y * s * 0.1, s * 0.025, '#fff');
  },
  dragon: (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#1b0033');
    g.addColorStop(1, '#5a0016');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#ffcc33';
    ctx.lineWidth = s * 0.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const x = s * 0.1 + t * s * 0.8;
      const y = s * 0.5 + Math.sin(t * Math.PI * 3) * s * 0.25 * (1 - t * 0.5);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#ffcc33';
    for (let i = 0; i < 8; i++) {
      const t = i / 8;
      const x = s * 0.1 + t * s * 0.8;
      const y = s * 0.5 + Math.sin(t * Math.PI * 3) * s * 0.25 * (1 - t * 0.5);
      ctx.beginPath();
      ctx.moveTo(x, y - s * 0.03);
      ctx.lineTo(x + s * 0.04, y - s * 0.12);
      ctx.lineTo(x + s * 0.06, y - s * 0.02);
      ctx.fill();
    }
    ctx.fillStyle = '#ff3300';
    ctx.beginPath();
    ctx.arc(s * 0.9, s * 0.5 + Math.sin(Math.PI * 3) * s * 0.12, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
  },
  season1: (ctx, s) => {
    FLIGHT_DESIGNS.flames(ctx, s);
    ctx.fillStyle = 'rgba(255,215,90,0.9)';
    ctx.font = `bold ${s * 0.3}px "Lilita One", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('S1', s / 2, s * 0.45);
  },
  ev_bull: (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.7);
    g.addColorStop(0, '#ffe066');
    g.addColorStop(0.5, '#e0122a');
    g.addColorStop(1, '#3a0008');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    for (let i = 4; i > 0; i--) {
      ctx.strokeStyle = i % 2 ? 'rgba(255,230,120,0.9)' : 'rgba(255,255,255,0.6)';
      ctx.lineWidth = s * 0.03;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, (i / 4) * s * 0.42, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#0b8a45';
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff1a2e';
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.045, 0, Math.PI * 2);
    ctx.fill();
  },
  ev_neon3: (ctx, s) => {
    ctx.fillStyle = '#0a0018';
    ctx.fillRect(0, 0, s, s);
    ctx.shadowColor = '#d18bff';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.round(s * 0.5)}px "Lilita One", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('T', s * 0.5, s * 0.55);
    ctx.shadowBlur = 0;
    [0.25, 0.5, 0.75].forEach((x, i) => star(ctx, s * x, s * 0.18, s * 0.07, ['#21e6ff', '#ff2bd6', '#ffe600'][i]));
    ctx.strokeStyle = '#21e6ff';
    ctx.lineWidth = s * 0.03;
    ctx.strokeRect(s * 0.08, s * 0.08, s * 0.84, s * 0.84);
  },
  ev_thunder: (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#0a1f66');
    g.addColorStop(1, '#1f6dff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#fff6a0';
    ctx.shadowColor = '#ffe600';
    ctx.shadowBlur = 14;
    ctx.lineWidth = s * 0.045;
    ctx.lineJoin = 'round';
    for (const off of [0.3, 0.62]) {
      ctx.beginPath();
      ctx.moveTo(s * off, 0);
      ctx.lineTo(s * (off - 0.12), s * 0.4);
      ctx.lineTo(s * (off + 0.04), s * 0.45);
      ctx.lineTo(s * (off - 0.1), s);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  },
  ev_cricket: (ctx, s) => {
    ctx.fillStyle = '#05331f';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#d4ff3a';
    ctx.font = `${Math.round(s * 0.14)}px "Lilita One", sans-serif`;
    ctx.textAlign = 'center';
    ['20', '19', '18', '17', '16', '15'].forEach((n, i) => ctx.fillText(n, s * (0.22 + (i % 3) * 0.28), s * (0.32 + Math.floor(i / 3) * 0.3)));
    ctx.strokeStyle = 'rgba(212,255,58,0.85)';
    ctx.lineWidth = s * 0.03;
    for (let i = 0; i < 6; i++) {
      const x = s * (0.22 + (i % 3) * 0.28);
      const y = s * (0.27 + Math.floor(i / 3) * 0.3);
      ctx.beginPath();
      ctx.arc(x, y, s * 0.11, 0, Math.PI * 2);
      ctx.stroke();
    }
    star(ctx, s / 2, s * 0.86, s * 0.08, '#ffe600');
  },
  ev_crown: (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#5a2a00');
    g.addColorStop(0.5, '#c47d00');
    g.addColorStop(1, '#2a1200');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#fff1a8';
    ctx.beginPath();
    ctx.moveTo(s * 0.18, s * 0.7);
    ctx.lineTo(s * 0.12, s * 0.3);
    ctx.lineTo(s * 0.35, s * 0.5);
    ctx.lineTo(s * 0.5, s * 0.2);
    ctx.lineTo(s * 0.65, s * 0.5);
    ctx.lineTo(s * 0.88, s * 0.3);
    ctx.lineTo(s * 0.82, s * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e0122a';
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.55, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
  },
  ev_inferno: (ctx, s) => {
    FLIGHT_DESIGNS.flames(ctx, s);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#3a0010';
    ctx.lineWidth = s * 0.03;
    ctx.font = `${Math.round(s * 0.32)}px "Lilita One", sans-serif`;
    ctx.textAlign = 'center';
    ctx.strokeText('180', s / 2, s * 0.62);
    ctx.fillText('180', s / 2, s * 0.62);
  },
  pixel: (ctx, s) => {
    const n = 8;
    const cols = ['#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8'];
    const r = rng(77);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      ctx.fillStyle = cols[Math.floor(r() * cols.length)];
      ctx.fillRect((x * s) / n, (y * s) / n, s / n + 1, s / n + 1);
    }
  },
  sakura: (ctx, s) => {
    ctx.fillStyle = '#fff0f5';
    ctx.fillRect(0, 0, s, s);
    const r = rng(31);
    for (let i = 0; i < 14; i++) {
      const x = r() * s;
      const y = r() * s;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        ctx.fillStyle = '#ff9ec4';
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(a) * 8, y + Math.sin(a) * 8, 7, 4, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  wave: (ctx, s) => {
    ctx.fillStyle = '#e6f7ff';
    ctx.fillRect(0, 0, s, s);
    ['#0077b6', '#00b4d8', '#90e0ef'].forEach((col, k) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, s);
      for (let x = 0; x <= s; x += 4) ctx.lineTo(x, s * (0.45 + k * 0.15) + Math.sin(x * 0.05 + k) * s * 0.06);
      ctx.lineTo(s, s);
      ctx.fill();
    });
  },
  legend: (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.7);
    g.addColorStop(0, '#fff6c8');
    g.addColorStop(0.3, '#ffb300');
    g.addColorStop(0.7, '#b0005a');
    g.addColorStop(1, '#2a0040');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 12; i++) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(s / 2, s / 2);
      const a = (i / 12) * Math.PI * 2;
      ctx.lineTo(s / 2 + Math.cos(a) * s, s / 2 + Math.sin(a) * s);
      ctx.stroke();
    }
    star(ctx, s / 2, s / 2, s * 0.2, '#ffffff');
  },
};

const flightCache = new Map<string, THREE.Texture>();
export function flightTexture(design: string): THREE.Texture {
  let t = flightCache.get(design);
  if (t) return t;
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  (FLIGHT_DESIGNS[design] ?? FLIGHT_DESIGNS.solid_red)(ctx, S);
  // brillo plástico sutil
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, 'rgba(255,255,255,0.18)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // ribete del borde
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = S * 0.012;
  ctx.strokeRect(0, 0, S, S);
  t = toTexture(c);
  flightCache.set(design, t);
  return t;
}

/** Miniatura 2D de un diseño de aleta (para la interfaz). */
export function flightDesignDataURL(design: string, size = 96): string {
  const [c, ctx] = makeCanvas(size);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.05);
  ctx.lineTo(size * 0.95, size * 0.5);
  ctx.lineTo(size * 0.5, size * 0.95);
  ctx.lineTo(size * 0.05, size * 0.5);
  ctx.closePath();
  ctx.clip();
  (FLIGHT_DESIGNS[design] ?? FLIGHT_DESIGNS.solid_red)(ctx, size);
  ctx.restore();
  return c.toDataURL();
}

// ---------------------------------------------------------------- Neón / carteles

export function neonSignTexture(text: string, color: string, w = 1024, h = 256, font = '"Lilita One", sans-serif') {
  const [c, ctx] = makeCanvas(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.font = `${Math.round(h * 0.62)}px ${font}`;
  const fit = Math.min(1, (w * 0.86) / Math.max(1, ctx.measureText(text).width));
  ctx.font = `${Math.round(h * 0.62 * fit)}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = h * 0.12;
  ctx.strokeStyle = color;
  ctx.lineWidth = h * 0.05;
  ctx.strokeText(text, w / 2, h / 2);
  ctx.shadowBlur = h * 0.05;
  ctx.lineWidth = h * 0.018;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(text, w / 2, h / 2);
  return toTexture(c);
}

export function posterTexture(title: string, sub: string, colors: [string, string], seed = 1) {
  const [c, ctx] = makeCanvas(512, 720);
  const g = ctx.createLinearGradient(0, 0, 512, 720);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 720);
  const r = rng(seed);
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.08 + r() * 0.1})`;
    ctx.lineWidth = 30 + r() * 40;
    ctx.beginPath();
    ctx.arc(256, 330, 60 + i * 50, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = '86px "Lilita One", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 256, 150);
  ctx.font = '40px "Lilita One", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(sub, 256, 640);
  // envejecido
  const img = ctx.getImageData(0, 0, 512, 720);
  for (let i = 0; i < img.data.length; i += 4) {
    const f = 0.85 + r() * 0.2;
    img.data[i] *= f;
    img.data[i + 1] *= f;
    img.data[i + 2] *= f * 0.95;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

/** Textura radial suave para destellos y luces (sprites). */
let glowTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const [c, ctx] = makeCanvas(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = toTexture(c);
  return glowTex;
}
