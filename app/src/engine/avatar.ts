// Avatar 3D de cuerpo entero, estilizado y personalizable. La cara se dibuja en alta resolución
// (ojos, cejas, boca, marcas) sobre la cabeza; el resto son piezas 3D: peinados, barba, ropa,
// pantalones, calzado y accesorios. Tiene un esqueleto sencillo para animaciones, gestos y poses.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { AvatarConfig, DartLook } from '@shared/protocol';
import { engine, type View } from './renderer';
import { makeCanvas, toTexture, glowTexture } from './textures';
import { buildDart } from './dart';
import { EYE_COLORS, HAIR_COLORS, SHIRT_COLORS, SKIN_TONES, PANTS_COLORS, SHOE_COLORS, normAvatar } from '../meta/catalog';

type Cfg = Required<AvatarConfig>;
type Expr = 'open' | 'blink' | 'happy';
export type AvatarPose = 'idle' | 'cheer' | 'sad' | 'wave';
export type Gesture = 'wave' | 'cheer' | 'throw' | 'think';
export type AvatarFrame = 'head' | 'torso' | 'legs' | 'feet' | 'full';

const OUT = '#2b1712';

// Safari < 16 no tiene roundRect en canvas
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x: number, y: number, w: number, h: number, r?: number | DOMPointInit | (number | DOMPointInit)[]) {
    const rr = Math.min(typeof r === 'number' ? r : 0, w / 2, h / 2);
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
  };
}
const std = (color: THREE.ColorRepresentation, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const pick = <T,>(a: T[], i: number) => a[((i % a.length) + a.length) % a.length];

function mix(a: string, b: string, k: number): string {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

// ------------------------------------------------------------------ texturas compartidas

let strandTex: THREE.Texture | null = null;
/** Mechones de pelo (escala de grises que tiñe el color del pelo). */
function hairStrands(): THREE.Texture {
  if (strandTex) return strandTex;
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, 256, 256);
  const r = seeded(7);
  for (let i = 0; i < 520; i++) {
    const x = r() * 256;
    const v = 150 + Math.floor(r() * 105);
    ctx.strokeStyle = `rgba(${v},${v},${v},${0.35 + r() * 0.4})`;
    ctx.lineWidth = 0.6 + r() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + (r() - 0.5) * 12, 90, x + (r() - 0.5) * 12, 170, x + (r() - 0.5) * 8, 256);
    ctx.stroke();
  }
  strandTex = toTexture(c);
  strandTex.wrapS = strandTex.wrapT = THREE.RepeatWrapping;
  strandTex.repeat.set(3, 1);
  strandTex.userData.shared = true;
  return strandTex;
}

function fabricNoise(ctx: CanvasRenderingContext2D, w: number, h: number, amount = 0.08, seed = 3) {
  const img = ctx.getImageData(0, 0, w, h);
  const r = seeded(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const f = 1 - amount / 2 + r() * amount;
    img.data[i] *= f;
    img.data[i + 1] *= f;
    img.data[i + 2] *= f;
  }
  ctx.putImageData(img, 0, 0);
}

// ------------------------------------------------------------------ cara (textura)

const FACE = { lon: 90, top: 72, bot: -88 };

function faceCanvas(cfg: Cfg, expr: Expr, size: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size);
  const sx = size / (FACE.lon * 2);
  const sy = size / (FACE.top - FACE.bot);
  // espacio de trabajo en grados: x = longitud (−90…90), y = −latitud (hacia abajo)
  ctx.setTransform(sx, 0, 0, sy, FACE.lon * sx, FACE.top * sy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const at = (lon: number, y: number, fn: () => void) => {
    ctx.save();
    ctx.translate(lon, y);
    ctx.scale(1 / Math.cos((y * Math.PI) / 180), 1);
    fn();
    ctx.restore();
  };
  const skin = pick(SKIN_TONES, cfg.skin);
  const hair = pick(HAIR_COLORS, cfg.hairColor);
  const iris = pick(EYE_COLORS, cfg.eyes);

  // sombra de barba
  if (cfg.beard === 'stubble' || cfg.beard === 'full' || cfg.beard === 'viking' || cfg.beard === 'goatee') {
    const r = seeded(11);
    ctx.fillStyle = hair;
    for (let i = 0; i < 2600; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r());
      const x = Math.cos(a) * d * 46;
      const y = 40 + Math.sin(a) * d * 26;
      if (y < 15 || (Math.abs(x) < 10 && Math.abs(y - 27) < 5.5)) continue;
      ctx.globalAlpha = 0.12 + r() * 0.18;
      ctx.fillRect(x, y, 0.45, 0.6);
    }
    ctx.globalAlpha = 1;
  }

  // sombra suave bajo la línea del pelo
  const hl = ctx.createLinearGradient(0, -38, 0, -28);
  hl.addColorStop(0, 'rgba(60,30,20,0.28)');
  hl.addColorStop(1, 'rgba(60,30,20,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(-60, -40, 120, 12);
  // sombra del cuello bajo la barbilla
  const ch = ctx.createLinearGradient(0, 58, 0, 80);
  ch.addColorStop(0, 'rgba(60,30,20,0)');
  ch.addColorStop(1, 'rgba(60,30,20,0.3)');
  ctx.fillStyle = ch;
  ctx.fillRect(-60, 58, 120, 30);
  // mejillas (siempre un poco de color)
  const blush = cfg.marks === 'blush' ? 0.42 : 0.14;
  for (const s of [-1, 1]) {
    at(s * 33, 9, () => {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 9);
      g.addColorStop(0, `rgba(255,95,105,${blush})`);
      g.addColorStop(1, 'rgba(255,95,105,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // marcas
  if (cfg.marks === 'freckles') {
    const r = seeded(5);
    ctx.fillStyle = 'rgba(125,62,32,0.55)';
    for (let i = 0; i < 46; i++) {
      const s = r() < 0.5 ? -1 : 1;
      const x = s * (7 + r() * 24);
      const y = 3 + r() * 10 + Math.abs(x) * 0.08;
      at(x, y, () => {
        ctx.beginPath();
        ctx.arc(0, 0, 0.35 + r() * 0.4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  } else if (cfg.marks === 'scar') {
    ctx.strokeStyle = 'rgba(165,62,62,0.62)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(29, -33);
    ctx.lineTo(16, -1);
    ctx.stroke();
    ctx.lineWidth = 0.55;
    for (let k = 0.15; k < 0.95; k += 0.2) {
      const x = 29 - 13 * k;
      const y = -33 + 32 * k;
      ctx.beginPath();
      ctx.moveTo(x - 2.4, y - 1);
      ctx.lineTo(x + 2.4, y + 1);
      ctx.stroke();
    }
  } else if (cfg.marks === 'paint') {
    for (const s of [-1, 1]) {
      at(s * 23, 6.5, () => {
        ctx.fillStyle = '#e8193c';
        ctx.beginPath();
        ctx.roundRect(-9, -1.2, 18, 2.6, 1.2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.roundRect(-7.5, 2.4, 15, 1.4, 0.7);
        ctx.fill();
      });
    }
  } else if (cfg.marks === 'flag') {
    at(35, 11, () => {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(-5.5, -3.6, 11, 7.2, 1.2);
      ctx.clip();
      ctx.fillStyle = '#c60b1e';
      ctx.fillRect(-6, -4, 12, 8);
      ctx.fillStyle = '#ffc400';
      ctx.fillRect(-6, -1.8, 12, 3.6);
      ctx.restore();
    });
  } else if (cfg.marks === 'target') {
    at(-34, 10, () => {
      for (const [rr, col] of [
        [4.2, '#111'],
        [3.4, '#f1e6c8'],
        [2.5, '#d6202f'],
        [1.6, '#f1e6c8'],
        [0.8, '#1a9a4a'],
      ] as const) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  // ojos
  for (const s of [-1, 1]) at(s * 21, -6, () => drawEye(ctx, s, cfg.eyeStyle, iris, expr, skin));

  // cejas
  const browCol = mix(hair, '#000000', 0.25);
  const lift = expr === 'happy' ? -1.6 : 0;
  if (cfg.brows !== 'none') {
    for (const s of [-1, 1]) at(s * 21, -23 + lift, () => drawBrow(ctx, s, cfg.brows, browCol));
    if (cfg.brows === 'uni') {
      ctx.strokeStyle = browCol;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-13, -21.5 + lift);
      ctx.quadraticCurveTo(0, -20 + lift, 13, -21.5 + lift);
      ctx.stroke();
    }
  }

  // boca
  at(0, 27, () => drawMouth(ctx, expr === 'happy' && ['smile', 'neutral', 'smirk'].includes(cfg.mouth) ? 'grin' : cfg.mouth));
  return c;
}

function drawEye(ctx: CanvasRenderingContext2D, s: number, style: string, iris: string, expr: Expr, skin: string) {
  const closed = expr === 'blink';
  const happy = (expr === 'happy' || style === 'joy') && !closed;
  ctx.strokeStyle = OUT;
  if (closed || happy) {
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (happy) {
      ctx.moveTo(-7, 2.2);
      ctx.quadraticCurveTo(0, -7.5, 7, 2.2);
    } else {
      ctx.moveTo(-7.5, -0.5);
      ctx.quadraticCurveTo(0, 5, 7.5, -0.5);
    }
    ctx.stroke();
    if (style === 'lashes') {
      ctx.lineWidth = 0.9;
      for (const k of [0, 1, 2]) {
        ctx.beginPath();
        ctx.moveTo(s * (5 + k * 1.2), happy ? -1.5 + k * 1.4 : 1 + k * 0.6);
        ctx.lineTo(s * (7.5 + k * 1.4), happy ? -3.8 + k * 1.4 : 2.2 + k * 1.6);
        ctx.stroke();
      }
    }
    return;
  }
  const dims: Record<string, [number, number, number]> = {
    round: [8, 9.2, 0],
    almond: [9.4, 6.6, 0.14],
    lashes: [8.2, 9.2, 0.05],
    sleepy: [8.6, 8, 0],
    sharp: [9.4, 7.4, 0.12],
    big: [10.2, 11.6, 0],
    star: [9, 10, 0],
  };
  const [w, h, tilt] = dims[style] ?? dims.round;
  ctx.save();
  ctx.rotate(-s * tilt);
  const almond = style === 'almond' || style === 'sharp';
  const shape = () => {
    ctx.beginPath();
    if (almond) {
      ctx.moveTo(-w, 0);
      ctx.bezierCurveTo(-w * 0.55, -h * 1.3, w * 0.55, -h * 1.3, w, 0);
      ctx.bezierCurveTo(w * 0.55, h * 1.15, -w * 0.55, h * 1.15, -w, 0);
      ctx.closePath();
    } else ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
  };
  // blanco del ojo con sombra superior
  shape();
  const gw = ctx.createLinearGradient(0, -h, 0, h);
  gw.addColorStop(0, '#d9d2cc');
  gw.addColorStop(0.45, '#ffffff');
  gw.addColorStop(1, '#f2eeea');
  ctx.fillStyle = gw;
  ctx.fill();
  ctx.save();
  shape();
  ctx.clip();
  const ir = Math.min(w, h) * (style === 'big' ? 0.8 : 0.74);
  const ix = -s * 0.4;
  const iy = 0.6;
  const gi = ctx.createRadialGradient(ix - ir * 0.2, iy + ir * 0.35, ir * 0.1, ix, iy, ir);
  gi.addColorStop(0, mix(iris, '#ffffff', 0.42));
  gi.addColorStop(0.55, iris);
  gi.addColorStop(1, mix(iris, '#000000', 0.55));
  ctx.fillStyle = gi;
  ctx.beginPath();
  ctx.arc(ix, iy, ir, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 0.45;
  ctx.strokeStyle = mix(iris, '#000000', 0.6);
  ctx.stroke();
  if (style === 'star') {
    ctx.fillStyle = '#fff3a0';
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 ? ir * 0.25 : ir * 0.62;
      ctx.lineTo(ix + Math.cos(a) * rr, iy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = '#0b0706';
    ctx.beginPath();
    ctx.arc(ix, iy, ir * 0.47, 0, Math.PI * 2);
    ctx.fill();
  }
  // sombra del párpado
  const gl = ctx.createLinearGradient(0, -h, 0, -h * 0.25);
  gl.addColorStop(0, 'rgba(70,35,25,0.45)');
  gl.addColorStop(1, 'rgba(70,35,25,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(-w - 1, -h - 1, w * 2 + 2, h);
  // párpados
  if (style === 'sleepy') {
    ctx.fillStyle = skin;
    ctx.fillRect(-w - 1, -h - 2, w * 2 + 2, h * 0.92);
  } else if (style === 'sharp') {
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(-s * w * 1.3, -h * 1.5);
    ctx.lineTo(s * w * 1.3, -h * 1.5);
    ctx.lineTo(s * w * 1.3, -h * 1.0);
    ctx.lineTo(-s * w * 1.3, -h * 0.28);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // contorno: línea de pestañas superior marcada y párpado inferior suave
  ctx.strokeStyle = OUT;
  if (style === 'sleepy') {
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.moveTo(-w * 0.98, -h * 0.05);
    ctx.quadraticCurveTo(0, -h * 0.2, w * 0.98, -h * 0.05);
    ctx.stroke();
  } else if (style === 'sharp') {
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-s * w * 0.98, -h * 0.3);
    ctx.lineTo(s * w * 0.75, -h * 0.98);
    ctx.quadraticCurveTo(s * w * 0.98, -h * 0.6, s * w, 0);
    ctx.stroke();
  } else if (almond) {
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.bezierCurveTo(-w * 0.55, -h * 1.3, w * 0.55, -h * 1.3, w, 0);
    ctx.stroke();
  } else {
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.ellipse(0, 0, w, h, 0, Math.PI * 1.03, Math.PI * 1.97);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 0.5;
  shape();
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (style === 'lashes' || style === 'big') {
    ctx.lineWidth = 0.85;
    for (const k of [0, 1, 2]) {
      const a = -0.35 - k * 0.38;
      ctx.beginPath();
      ctx.moveTo(s * Math.cos(a) * w * 0.95, Math.sin(a) * h * 0.95);
      ctx.lineTo(s * Math.cos(a) * (w + 2.6), Math.sin(a) * (h + 2.6));
      ctx.stroke();
    }
  }
  // brillos
  if (style !== 'sleepy') {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(ix - ir * 0.32, iy - ir * 0.4, ir * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ix + ir * 0.35, iy + ir * 0.32, ir * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBrow(ctx: CanvasRenderingContext2D, s: number, style: string, col: string) {
  const B: Record<string, { w: number; t: number; arch: number; inner: number; outer: number }> = {
    normal: { w: 7.4, t: 2.1, arch: 2.2, inner: 0.4, outer: 1.2 },
    thick: { w: 8, t: 3.3, arch: 1.6, inner: 0.6, outer: 1.2 },
    thin: { w: 7, t: 1.15, arch: 2.6, inner: 0.3, outer: 1.4 },
    arched: { w: 7.4, t: 1.8, arch: 4.6, inner: 0.8, outer: 1.8 },
    angry: { w: 7.6, t: 2.4, arch: 0.6, inner: 3.6, outer: -1.2 },
    uni: { w: 7.6, t: 2.4, arch: 1.2, inner: 1.2, outer: 1 },
  };
  const b = B[style] ?? B.normal;
  ctx.strokeStyle = col;
  ctx.lineWidth = b.t;
  ctx.beginPath();
  ctx.moveTo(-s * b.w, b.inner);
  ctx.quadraticCurveTo(s * 0.5, -b.arch, s * b.w, b.outer);
  ctx.stroke();
  // pelitos para que no parezca un trazo plano
  ctx.lineWidth = 0.35;
  ctx.globalAlpha = 0.5;
  for (let k = -0.8; k <= 0.8; k += 0.2) {
    const x = s * k * b.w;
    const y = (1 - k * k) * -b.arch * 0.5 + (k < 0 ? b.inner : b.outer) * Math.abs(k);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.6, y + b.t * 0.45);
    ctx.lineTo(x + s * 0.6, y - b.t * 0.45);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawMouth(ctx: CanvasRenderingContext2D, style: string) {
  const lip = '#5b1b1e';
  const inside = '#4a1014';
  const tongue = '#e8576b';
  ctx.strokeStyle = lip;
  const smile = (w = 6, d = 4.6) => {
    ctx.lineWidth = 1.45;
    ctx.beginPath();
    ctx.moveTo(-w, -0.4);
    ctx.quadraticCurveTo(0, d, w, -0.4);
    ctx.stroke();
    ctx.lineWidth = 0.7;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * (w - 0.6), -0.9);
      ctx.quadraticCurveTo(s * (w + 0.4), -0.4, s * (w + 0.6), 0.6);
      ctx.stroke();
    }
  };
  switch (style) {
    case 'neutral':
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.moveTo(-4.2, 0.6);
      ctx.quadraticCurveTo(0, 1.6, 4.2, 0.4);
      ctx.stroke();
      break;
    case 'smirk':
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-5, 1.2);
      ctx.quadraticCurveTo(1.5, 3.4, 6, -1.8);
      ctx.stroke();
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(7.4, -0.6, 1, -0.6, 1.6);
      ctx.stroke();
      break;
    case 'open': {
      ctx.fillStyle = inside;
      ctx.beginPath();
      ctx.ellipse(0, 2, 3.3, 4.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = tongue;
      ctx.beginPath();
      ctx.ellipse(0, 5.4, 2.6, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = 0.9;
      ctx.stroke();
      break;
    }
    case 'tongue':
      smile(5.6, 4);
      ctx.fillStyle = tongue;
      ctx.beginPath();
      ctx.moveTo(0.4, 2.4);
      ctx.quadraticCurveTo(0.6, 7.6, 3, 7.4);
      ctx.quadraticCurveTo(5.4, 7, 4.8, 1.6);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(150,30,50,0.6)';
      ctx.beginPath();
      ctx.moveTo(2.7, 3);
      ctx.lineTo(2.9, 6);
      ctx.stroke();
      break;
    case 'teeth': {
      ctx.beginPath();
      ctx.moveTo(-7, -1);
      ctx.quadraticCurveTo(0, 0.6, 7, -1);
      ctx.quadraticCurveTo(0, 8.4, -7, -1);
      ctx.closePath();
      ctx.fillStyle = '#fffaf2';
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = 'rgba(120,90,80,0.45)';
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(-7, 2.2);
      ctx.quadraticCurveTo(0, 3.6, 7, 2.2);
      ctx.stroke();
      for (let x = -5; x <= 5; x += 2) {
        ctx.beginPath();
        ctx.moveTo(x, -1);
        ctx.lineTo(x, 7);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = lip;
      ctx.lineWidth = 0.95;
      ctx.stroke();
      break;
    }
    case 'grin':
    case 'gold': {
      ctx.beginPath();
      ctx.moveTo(-6.6, -0.6);
      ctx.quadraticCurveTo(0, 1.2, 6.6, -0.6);
      ctx.quadraticCurveTo(0, 10.2, -6.6, -0.6);
      ctx.closePath();
      ctx.fillStyle = inside;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#fffaf2';
      ctx.fillRect(-7, -1.5, 14, 3.4);
      if (style === 'gold') {
        const g = ctx.createLinearGradient(1.4, 0, 3.6, 0);
        g.addColorStop(0, '#ffe680');
        g.addColorStop(1, '#c48a12');
        ctx.fillStyle = g;
        ctx.fillRect(1.4, -1.5, 2.2, 3.4);
      }
      ctx.fillStyle = tongue;
      ctx.beginPath();
      ctx.ellipse(0, 7.4, 4.6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = lip;
      ctx.lineWidth = 0.95;
      ctx.stroke();
      break;
    }
    default:
      smile();
  }
}

// ------------------------------------------------------------------ ropa (texturas)

function shirtTexture(cfg: Cfg, size: number): THREE.Texture {
  const W = size;
  const H = size;
  const [c, ctx] = makeCanvas(W, H);
  const base = pick(SHIRT_COLORS, cfg.shirtColor);
  const skin = pick(SKIN_TONES, cfg.skin);
  const k = W / 512;
  ctx.scale(k, k);
  const front = 256;
  const numberAt = (x: number, y: number, px: number, fill: string, stroke = 'rgba(0,0,0,0.35)') => {
    ctx.font = `${px}px "Lilita One", "Arial Black", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = px / 14;
    ctx.strokeStyle = stroke;
    for (const dx of x === 0 ? [0, 512] : [0]) {
      ctx.strokeText(String(cfg.number), x + dx, y);
      ctx.fillStyle = fill;
      ctx.fillText(String(cfg.number), x + dx, y);
    }
  };
  const emblem = (x: number, y: number, r: number) => {
    for (const [rr, col] of [
      [1, '#ffffff'],
      [0.72, '#e8193c'],
      [0.44, '#ffffff'],
      [0.18, '#11a86a'],
    ] as const) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, r * rr, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  // degradado suave de luz (más claro arriba)
  const sh = ctx.createLinearGradient(0, 0, 0, 512);
  sh.addColorStop(0, 'rgba(255,255,255,0.08)');
  sh.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, 512, 512);
  switch (cfg.shirt) {
    case 'polo':
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(front - 10, 0, 20, 120);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (const y of [40, 75, 105]) {
        ctx.beginPath();
        ctx.arc(front, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      emblem(front + 62, 150, 16);
      break;
    case 'tee':
      emblem(front + 58, 150, 20);
      ctx.font = '30px "Lilita One", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.textAlign = 'center';
      ctx.fillText('DIANA', front, 300);
      break;
    case 'jersey':
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(128 - 9, 0, 18, 512);
      ctx.fillRect(384 - 9, 0, 18, 512);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(128 + 9, 0, 6, 512);
      ctx.fillRect(384 - 15, 0, 6, 512);
      numberAt(front + 60, 160, 64, '#ffffff');
      numberAt(0, 250, 180, '#ffffff');
      break;
    case 'champion': {
      const gold = ctx.createLinearGradient(0, 0, 0, 40);
      gold.addColorStop(0, '#fff1a8');
      gold.addColorStop(1, '#c98a12');
      ctx.fillStyle = gold;
      ctx.fillRect(0, 0, 512, 34);
      ctx.fillRect(0, 300, 512, 14);
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? 16 : 38;
        ctx.lineTo(front + Math.cos(a) * rr, 175 + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 3;
      ctx.stroke();
      numberAt(0, 210, 170, '#ffd34d', 'rgba(60,30,0,0.6)');
      break;
    }
    case 'hoodie':
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.roundRect(front - 85, 330, 170, 110, 26);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 470, 512, 42);
      ctx.font = '42px "Lilita One", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.textAlign = 'center';
      ctx.fillText('180', front, 250);
      break;
    case 'hawaii':
      for (let i = 0; i < 34; i++) {
        const x = (i * 97) % 512;
        const y = (i * 151) % 512;
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          ctx.fillStyle = i % 2 ? '#fff3a0' : '#ff7ab0';
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(a) * 14, y + Math.sin(a) * 14, 12, 7, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#ffb300';
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(40,140,60,0.7)';
        ctx.beginPath();
        ctx.ellipse(x + 30, y + 22, 18, 6, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const y of [60, 140, 220, 300, 380]) {
        ctx.beginPath();
        ctx.arc(front, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'suit':
      ctx.fillStyle = '#1b1f2a';
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = '#f5f5f5';
      ctx.beginPath();
      ctx.moveTo(front - 46, 0);
      ctx.lineTo(front, 250);
      ctx.lineTo(front + 46, 0);
      ctx.fill();
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.moveTo(front - 9, 34);
      ctx.lineTo(front - 13, 210);
      ctx.lineTo(front, 236);
      ctx.lineTo(front + 13, 210);
      ctx.lineTo(front + 9, 34);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(front - 46, 0);
      ctx.lineTo(front - 4, 320);
      ctx.moveTo(front + 46, 0);
      ctx.lineTo(front + 4, 320);
      ctx.stroke();
      ctx.fillStyle = '#0d1016';
      for (const y of [330, 400]) {
        ctx.beginPath();
        ctx.arc(front, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(front + 70, 175, 34, 8);
      break;
    case 'jacket':
      ctx.fillStyle = '#1d1a1a';
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = base;
      ctx.fillRect(front - 30, 0, 60, 512);
      ctx.fillStyle = '#c9ccd2';
      ctx.fillRect(front - 33, 40, 4, 472);
      ctx.fillRect(front + 29, 40, 4, 472);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 2;
      for (const x of [front - 110, front + 110, 60, 452]) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 10, 512);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(front - 120, 300, 46, 5);
      break;
    case 'tank':
      ctx.fillStyle = skin;
      ctx.fillRect(0, 0, 512, 92);
      ctx.fillStyle = base;
      for (const x of [front - 72, front + 72, 0 + 70, 512 - 70]) ctx.fillRect(x - 22, 0, 44, 96);
      ctx.beginPath();
      ctx.ellipse(front, 92, 74, 50, 0, Math.PI, 0, true);
      ctx.fillStyle = skin;
      ctx.fill();
      emblem(front, 210, 26);
      break;
  }
  fabricNoise(ctx, W, H, cfg.shirt === 'jacket' ? 0.14 : 0.08, 3 + cfg.shirtColor);
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function pantsTexture(cfg: Cfg): THREE.Texture {
  const [c, ctx] = makeCanvas(256, 256);
  const base = pick(PANTS_COLORS, cfg.pantsColor);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  if (cfg.pants === 'jeans' || cfg.pants === 'shorts') {
    const r = seeded(9);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
      ctx.fillRect(r() * 256, r() * 256, 1, 3);
    }
    ctx.strokeStyle = 'rgba(230,160,60,0.55)';
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5;
    for (const x of [64, 192]) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  } else if (cfg.pants === 'track') {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const x of [64, 192]) {
      ctx.fillRect(x - 9, 0, 6, 256);
      ctx.fillRect(x + 3, 0, 6, 256);
    }
  } else if (cfg.pants === 'suit' || cfg.pants === 'chinos') {
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    for (const x of [0, 128]) {
      ctx.beginPath();
      ctx.moveTo(x + 1, 0);
      ctx.lineTo(x + 1, 256);
      ctx.stroke();
    }
  }
  fabricNoise(ctx, 256, 256, 0.1, 21);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ------------------------------------------------------------------ construcción

export interface Rig {
  hips: THREE.Group;
  spine: THREE.Group;
  head: THREE.Group;
  shL: THREE.Group;
  shR: THREE.Group;
  elL: THREE.Group;
  elR: THREE.Group;
  handL: THREE.Group;
  handR: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
}

const BODY = [
  { chest: 0.9, waist: 0.88, arm: 0.84, leg: 0.88 },
  { chest: 1, waist: 1, arm: 1, leg: 1 },
  { chest: 1.12, waist: 0.96, arm: 1.18, leg: 1.06 },
  { chest: 1.1, waist: 1.24, arm: 1.12, leg: 1.12 },
];

const FACE_SHAPE: Record<string, [number, number, number]> = {
  round: [1.02, 1.06, 1],
  oval: [0.95, 1.12, 0.98],
  square: [1.05, 1.04, 1.0],
  long: [0.92, 1.18, 0.96],
};

function torsoProfile(chest: number, waist: number, hemR: number): THREE.Vector2[] {
  const raw: [number, number][] = [
    [hemR * waist, 0.0],
    [0.214 * waist, 0.08],
    [0.205 * waist, 0.2],
    [0.225 * (waist + chest) * 0.5, 0.32],
    [0.255 * chest, 0.43],
    [0.27 * chest, 0.51],
    [0.24 * chest, 0.585],
    [0.15, 0.64],
    [0.075, 0.665],
  ];
  const curve = new THREE.SplineCurve(raw.map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getSpacedPoints(26);
  pts.push(new THREE.Vector2(0.001, 0.672));
  return pts;
}

export function buildAvatar(input: AvatarConfig, opts: { faceSize?: number; texSize?: number; expressions?: boolean } = {}): THREE.Group {
  const cfg = normAvatar(input);
  const faceSize = opts.faceSize ?? 512;
  const root = new THREE.Group();
  const B = BODY[Math.max(0, Math.min(3, cfg.body | 0))];
  const skinCol = pick(SKIN_TONES, cfg.skin);
  const skin = new THREE.MeshPhysicalMaterial({ color: skinCol, roughness: 0.62, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(mix(skinCol, '#c4483a', 0.6)) });
  const hairCol = pick(HAIR_COLORS, cfg.hairColor);
  const hair = new THREE.MeshStandardMaterial({ color: hairCol, map: hairStrands(), roughness: 0.48 });
  const shirtBase = cfg.shirt === 'suit' ? '#1b1f2a' : cfg.shirt === 'jacket' ? '#1d1a1a' : pick(SHIRT_COLORS, cfg.shirtColor);
  const shirtMat = new THREE.MeshStandardMaterial({ map: shirtTexture(cfg, opts.texSize ?? 512), roughness: cfg.shirt === 'jacket' ? 0.38 : 0.86 });
  const sleeveMat = cfg.shirt === 'hawaii' ? shirtMat : new THREE.MeshStandardMaterial({ color: shirtBase, roughness: cfg.shirt === 'jacket' ? 0.38 : 0.86 });
  const pantsMat = new THREE.MeshStandardMaterial({ map: pantsTexture(cfg), roughness: 0.9 });

  const rig = {} as Rig;
  const hips = new THREE.Group();
  hips.position.y = -0.82;
  root.add(hips);
  rig.hips = hips;

  // ---------------- tronco
  const spine = new THREE.Group();
  spine.position.y = 0.04;
  hips.add(spine);
  rig.spine = spine;
  const untucked = !['suit', 'polo', 'champion'].includes(cfg.shirt);
  const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoProfile(B.chest, B.waist, untucked ? 0.226 : 0.212), 40, Math.PI), shirtMat);
  torso.scale.z = 0.7;
  torso.position.y = -0.04;
  spine.add(torso);
  // cintura del pantalón
  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.212 * B.waist, 0.2 * B.waist, 0.17, 32, 1), pantsMat);
  pelvis.scale.z = 0.72;
  pelvis.position.y = 0.0;
  hips.add(pelvis);
  if (cfg.pants !== 'track' && cfg.pants !== 'shorts') {
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.216 * B.waist, 0.216 * B.waist, 0.03, 32, 1, true), std('#2a1c14', 0.5));
    belt.scale.z = 0.72;
    belt.position.y = 0.065;
    if (untucked) belt.visible = false;
    hips.add(belt);
    if (!untucked) {
      const buckle = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.035, 0.012, 2, 0.004), std('#d9c27a', 0.25, 1));
      buckle.position.set(0, 0.065, 0.158 * B.waist);
      hips.add(buckle);
    }
  }
  // cuello
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 16), skin);
  neck.position.y = 0.67;
  spine.add(neck);

  // cuellos de las prendas
  if (cfg.shirt === 'hoodie') {
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.06, 12, 28), sleeveMat);
    hood.rotation.x = Math.PI / 2 + 0.35;
    hood.scale.set(1, 1, 0.8);
    hood.position.set(0, 0.6, -0.04);
    spine.add(hood);
    for (const s of [-1, 1]) {
      const str = new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 0.1, 3, 6), std('#f4f4f4', 0.8));
      str.position.set(s * 0.04, 0.5, 0.185);
      spine.add(str);
    }
  } else if (cfg.shirt === 'polo' || cfg.shirt === 'hawaii') {
    for (const s of [-1, 1]) {
      const flap = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.012, 0.07, 2, 0.005), cfg.shirt === 'polo' ? std('#ffffff', 0.8) : sleeveMat);
      flap.position.set(s * 0.06, 0.62, 0.08);
      flap.rotation.set(-0.5, s * 0.5, s * 0.5);
      spine.add(flap);
    }
  } else if (cfg.shirt === 'jersey' || cfg.shirt === 'champion' || cfg.shirt === 'tee') {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.016, 8, 28), cfg.shirt === 'champion' ? std('#ffcf40', 0.3, 0.8) : cfg.shirt === 'jersey' ? std('#ffffff', 0.7) : sleeveMat);
    collar.rotation.x = Math.PI / 2 - 0.2;
    collar.scale.set(1, 0.85, 1);
    collar.position.set(0, 0.645, 0.015);
    spine.add(collar);
  } else if (cfg.shirt === 'suit') {
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), std(pick(SHIRT_COLORS, cfg.shirtColor), 0.6));
    knot.scale.set(1.1, 0.9, 0.6);
    knot.position.set(0, 0.62, 0.115);
    spine.add(knot);
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.01, 0.05, 2, 0.004), std('#ffffff', 0.7));
      c.position.set(s * 0.045, 0.64, 0.09);
      c.rotation.set(-0.6, s * 0.4, s * 0.6);
      spine.add(c);
    }
  } else if (cfg.shirt === 'jacket') {
    for (const s of [-1, 1]) {
      const lap = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.16, 0.012, 2, 0.005), sleeveMat);
      lap.position.set(s * 0.08, 0.56, 0.125);
      lap.rotation.set(-0.25, s * 0.35, s * 0.35);
      spine.add(lap);
    }
  }

  // ---------------- brazos
  const shoulderX = 0.27 * B.chest + 0.012;
  const ra = 0.066 * B.arm;
  const rf = 0.056 * B.arm;
  const longSleeve = ['hoodie', 'suit', 'jacket'].includes(cfg.shirt);
  const noSleeve = cfg.shirt === 'tank';
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(s * shoulderX, 0.5, 0);
    spine.add(sh);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(ra * 1.2, 16, 12), noSleeve ? skin : sleeveMat);
    sh.add(ball);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(ra, 0.17, 6, 14), skin);
    upper.position.y = -0.115;
    sh.add(upper);
    if (!noSleeve) {
      const len = longSleeve ? 0.2 : 0.13;
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(ra * 1.18, ra * (longSleeve ? 1.1 : 1.22), len, 16, 1, true), sleeveMat);
      sleeve.material.side = THREE.DoubleSide;
      sleeve.position.y = -len / 2 + 0.01;
      sh.add(sleeve);
      if (cfg.shirt === 'champion' || cfg.shirt === 'jersey') {
        const trim = new THREE.Mesh(new THREE.TorusGeometry(ra * 1.2, 0.008, 6, 20), cfg.shirt === 'champion' ? std('#ffcf40', 0.3, 0.8) : std('#ffffff', 0.7));
        trim.rotation.x = Math.PI / 2;
        trim.position.y = -len + 0.012;
        sh.add(trim);
      }
    }
    const el = new THREE.Group();
    el.position.y = -0.235;
    sh.add(el);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(rf, 0.14, 6, 14), longSleeve ? sleeveMat : skin);
    fore.position.y = -0.1;
    el.add(fore);
    if (longSleeve) {
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(rf * 1.12, rf * 1.12, 0.035, 14), cfg.shirt === 'suit' ? std('#ffffff', 0.7) : sleeveMat);
      cuff.position.y = -0.19;
      el.add(cuff);
    }
    const hand = new THREE.Group();
    hand.position.y = -0.215;
    el.add(hand);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), skin);
    palm.scale.set(0.9, 1.05, 0.72);
    palm.position.y = -0.035;
    hand.add(palm);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.03, 4, 8), skin);
    thumb.position.set(-s * 0.032, -0.025, 0.022);
    thumb.rotation.set(0.4, 0, -s * 0.6);
    hand.add(thumb);
    if (s < 0) {
      rig.shL = sh;
      rig.elL = el;
      rig.handL = hand;
    } else {
      rig.shR = sh;
      rig.elR = el;
      rig.handR = hand;
    }
  }

  // ---------------- piernas y calzado
  const lr = B.leg;
  const shoeCol = pick(SHOE_COLORS, cfg.shoesColor);
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.1 * B.waist, -0.02, 0);
    hips.add(hip);
    const shorts = cfg.pants === 'shorts';
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry((shorts ? 0.098 : 0.09) * lr, shorts ? 0.16 : 0.2, 6, 14), pantsMat);
    thigh.position.y = shorts ? -0.11 : -0.14;
    hip.add(thigh);
    if (cfg.pants === 'cargo') {
      const pocket = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.09, 0.08, 2, 0.01), pantsMat);
      pocket.position.set(s * 0.085 * lr, -0.17, 0);
      hip.add(pocket);
    }
    const knee = new THREE.Group();
    knee.position.y = -0.29;
    hip.add(knee);
    if (shorts) {
      const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.074 * lr, 12, 10), skin);
      knee.add(kneeBall);
    }
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.077 * lr, 0.19, 6, 14), shorts ? skin : pantsMat);
    shin.position.y = -0.13;
    knee.add(shin);
    if (shorts) {
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.068 * lr, 0.065 * lr, 0.07, 14), std('#f4f4f4', 0.9));
      sock.position.y = -0.24;
      knee.add(sock);
    } else if (cfg.pants === 'track') {
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.072 * lr, 0.07 * lr, 0.04, 14), std(mix(pick(PANTS_COLORS, cfg.pantsColor), '#000', 0.35), 0.9));
      cuff.position.y = -0.255;
      knee.add(cuff);
    }
    const ankle = new THREE.Group();
    ankle.position.y = -0.285;
    knee.add(ankle);
    ankle.add(buildShoe(cfg.shoes, shoeCol));
    if (s < 0) {
      rig.hipL = hip;
      rig.kneeL = knee;
    } else {
      rig.hipR = hip;
      rig.kneeR = knee;
    }
  }

  // ---------------- cabeza
  const head = new THREE.Group();
  head.position.y = 0.88;
  head.scale.setScalar(1.12);
  spine.add(head);
  rig.head = head;
  const hs = FACE_SHAPE[cfg.face] ?? FACE_SHAPE.round;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 40, 30), skin);
  skull.scale.set(hs[0], hs[1], hs[2]);
  head.add(skull);
  if (cfg.face === 'square') {
    const jaw = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.16, 0.3, 3, 0.07), skin);
    jaw.position.y = -0.1;
    head.add(jaw);
  }
  // cara pintada sobre un casquete ligeramente mayor
  const faceTex = toTexture(faceCanvas(cfg, 'open', faceSize));
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const facePatch = new THREE.Mesh(
    new THREE.SphereGeometry(0.2015, 64, 48, 0, Math.PI, ((90 - FACE.top) * Math.PI) / 180, ((FACE.top - FACE.bot) * Math.PI) / 180),
    faceMat,
  );
  facePatch.renderOrder = 2;
  skull.add(facePatch);
  root.userData.face = { mat: faceMat, tex: { open: faceTex } as Partial<Record<Expr, THREE.Texture>>, cfg, size: faceSize, current: 'open' as Expr };
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), skin);
    ear.scale.set(0.55, 1, 0.8);
    ear.position.set(s * 0.198 * hs[0], 0, -0.005);
    head.add(ear);
    if (cfg.acc === 'earring') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 16), std('#ffd34d', 0.2, 1));
      ring.position.set(s * 0.205 * hs[0], -0.045, 0);
      ring.rotation.y = Math.PI / 2;
      head.add(ring);
    }
  }
  // nariz
  const nose = (() => {
    switch (cfg.nose) {
      case 'round': {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 12), skin);
        m.scale.set(1, 0.9, 0.85);
        m.position.set(0, -0.035, 0.197 * hs[2]);
        return m;
      }
      case 'long': {
        const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.04, 6, 10), skin);
        m.rotation.x = 1.25;
        m.position.set(0, -0.03, 0.205 * hs[2]);
        return m;
      }
      case 'pointy': {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.027, 14, 12), skin);
        m.scale.set(0.85, 0.8, 1.35);
        m.rotation.x = -0.35;
        m.position.set(0, -0.026, 0.205 * hs[2]);
        return m;
      }
      default: {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.028, 14, 12), skin);
        m.scale.set(0.95, 0.85, 0.85);
        m.position.set(0, -0.032, 0.198 * hs[2]);
        return m;
      }
    }
  })();
  head.add(nose);

  // pelo (con gorro, los peinados voluminosos se recogen)
  const bigHair = ['spiky', 'mohawk', 'curly', 'afro', 'bun', 'quiff'];
  const hairStyle = cfg.hat !== 'none' && cfg.hat !== 'headband' && bigHair.includes(cfg.hair) ? 'short' : cfg.hair;
  buildHair(head, hairStyle, hair, hs);
  buildBeard(head, cfg.beard, hair, hs);
  buildGlasses(head, cfg.glasses);
  buildHat(head, cfg, hs);
  buildAccessory(rig, cfg, spine);

  root.userData.rig = rig;
  root.userData.head = head;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o !== facePatch) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return root;
}

function buildShoe(style: string, color: string): THREE.Group {
  const g = new THREE.Group();
  const glossy = style === 'classic';
  const upperCol = style === 'neon' ? '#16161c' : style === 'boots' ? mix(color, '#5a3a1e', 0.6) : color;
  const upper = new THREE.MeshStandardMaterial({ color: upperCol, roughness: glossy ? 0.22 : 0.6, metalness: glossy ? 0.1 : 0 });
  const soleCol = style === 'classic' || style === 'boots' ? '#2a1a10' : '#f5f5f2';
  const sole = new THREE.MeshStandardMaterial({ color: soleCol, roughness: 0.7 });
  const soleH = style === 'runner' ? 0.045 : style === 'boots' ? 0.042 : style === 'classic' ? 0.022 : 0.034;
  const s1 = new THREE.Mesh(new RoundedBoxGeometry(0.118, soleH, 0.24, 2, 0.012), sole);
  s1.position.set(0, -0.07 + soleH / 2 - 0.015, 0.045);
  g.add(s1);
  if (style === 'runner' || style === 'neon') {
    const mid = new THREE.Mesh(
      new RoundedBoxGeometry(0.122, 0.014, 0.244, 2, 0.006),
      style === 'neon' ? new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.4 }) : std(mix(color, '#ffffff', 0.35), 0.5),
    );
    mid.position.set(0, -0.06 + soleH - 0.02, 0.045);
    g.add(mid);
  }
  const toe = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), upper);
  toe.scale.set(0.058, glossy ? 0.04 : 0.05, 0.108);
  toe.position.set(0, -0.05, 0.07);
  g.add(toe);
  const heel = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), upper);
  heel.scale.set(0.056, 0.056, 0.068);
  heel.position.set(0, -0.035, -0.035);
  g.add(heel);
  if (style === 'hightops' || style === 'boots') {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.062, style === 'boots' ? 0.15 : 0.1, 16), upper);
    top.position.y = style === 'boots' ? 0.03 : 0.01;
    g.add(top);
    if (style === 'hightops') {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.02, 16), sole);
      band.position.y = 0.06;
      g.add(band);
    }
  } else {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.013, 8, 18), upper);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = -0.008;
    g.add(collar);
  }
  if (style !== 'classic' && style !== 'boots') {
    const laceMat = std(style === 'neon' ? color : '#ffffff', 0.7);
    for (let i = 0; i < 3; i++) {
      const lace = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.05, 3, 6), laceMat);
      lace.rotation.z = Math.PI / 2;
      lace.position.set(0, -0.01 - i * 0.008, 0.035 + i * 0.026);
      g.add(lace);
    }
    // franja lateral
    for (const s of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 4, 16, Math.PI * 0.8), std(style === 'neon' ? color : mix(color, '#ffffff', 0.75), 0.5));
      stripe.rotation.y = Math.PI / 2;
      stripe.position.set(s * 0.056, -0.06, 0.03);
      g.add(stripe);
    }
  } else if (style === 'classic') {
    const lace = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, 0.03, 3, 6), std('#111', 0.6));
    lace.rotation.z = Math.PI / 2;
    lace.position.set(0, -0.015, 0.06);
    g.add(lace);
  }
  return g;
}

function buildHair(head: THREE.Group, style: string, hair: THREE.Material, hs: [number, number, number]) {
  // casquete que deja libre la cara: la parte de arriba entera y, por los lados y detrás, más abajo
  const cap = (scale = 1.06, phi = Math.PI * 0.55, tilt = -0.08, front = 0.3) => {
    const g = new THREE.Group();
    const r = 0.2 * scale;
    const top = new THREE.Mesh(new THREE.SphereGeometry(r, 36, 12, 0, Math.PI * 2, 0, Math.PI * front), hair);
    const open = 1.12; // media apertura frontal (rad)
    const back = new THREE.Mesh(new THREE.SphereGeometry(r * 0.995, 36, 12, Math.PI / 2 + open, Math.PI * 2 - open * 2, Math.PI * (front - 0.02), phi - Math.PI * (front - 0.02)), hair);
    g.add(top, back);
    g.scale.set(hs[0], hs[1], hs[2]);
    g.rotation.x = tilt;
    g.position.y = 0.01;
    return g;
  };
  const add = (...o: THREE.Object3D[]) => head.add(...o);
  switch (style) {
    case 'short':
      add(cap());
      break;
    case 'buzz':
      add(cap(1.018, Math.PI * 0.5));
      break;
    case 'side': {
      add(cap(1.06, Math.PI * 0.56));
      const sweep = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), hair);
      sweep.scale.set(1.5, 0.55, 1.1);
      sweep.position.set(0.05, 0.19, 0.08);
      sweep.rotation.z = -0.35;
      add(sweep);
      break;
    }
    case 'spiky': {
      add(cap());
      for (let i = 0; i < 13; i++) {
        const a = (i / 13) * Math.PI * 2;
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 8), hair);
        sp.position.set(Math.cos(a) * 0.11, 0.2, Math.sin(a) * 0.11 - 0.02);
        sp.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
        add(sp);
      }
      break;
    }
    case 'long': {
      add(cap(1.08, Math.PI * 0.6));
      const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.26, 8, 18), hair);
      back.scale.set(1.18, 1, 0.6);
      back.position.set(0, -0.15, -0.1);
      add(back);
      for (const s of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, 6, 10), hair);
        side.position.set(s * 0.17, -0.1, 0.0);
        side.rotation.z = s * 0.1;
        add(side);
      }
      break;
    }
    case 'bob': {
      add(cap(1.09, Math.PI * 0.64, -0.06));
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.228, 32, 16, Math.PI / 2 + 1.05, Math.PI * 2 - 2.1, Math.PI * 0.3, Math.PI * 0.42), hair);
      shell.scale.set(hs[0], hs[1], hs[2]);
      add(shell);
      break;
    }
    case 'bun': {
      add(cap());
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), hair);
      b.position.set(0, 0.21, -0.1);
      add(b);
      break;
    }
    case 'mohawk':
      for (let i = 0; i < 8; i++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.15, 0.06), hair);
        const a = -0.7 + i * 0.24;
        sp.position.set(0, Math.cos(a) * 0.22, Math.sin(a) * 0.22 - 0.02);
        sp.rotation.x = a;
        add(sp);
      }
      add(cap(1.01, Math.PI * 0.5));
      break;
    case 'curly': {
      add(cap(1.04));
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2 * 3;
        const y = 0.05 + (i / 30) * 0.16;
        const rr = Math.sqrt(Math.max(0, 0.05 - (y - 0.04) * (y - 0.04))) + 0.03;
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.046, 10, 8), hair);
        ball.position.set(Math.cos(a) * rr * 0.95, y + 0.02, Math.sin(a) * rr * 0.95 - 0.03);
        add(ball);
      }
      break;
    }
    case 'ponytail': {
      add(cap());
      const pt = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.22, 6, 12), hair);
      pt.position.set(0, -0.04, -0.23);
      pt.rotation.x = 0.45;
      add(pt);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 6, 14), std('#ff3d6a', 0.6));
      tie.position.set(0, 0.06, -0.205);
      tie.rotation.x = 0.45 + Math.PI / 2;
      add(tie);
      break;
    }
    case 'braids': {
      add(cap(1.06, Math.PI * 0.58));
      for (const s of [-1, 1]) {
        for (let i = 0; i < 6; i++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.035 - i * 0.002, 10, 8), hair);
          b.position.set(s * (0.16 - i * 0.004), -0.06 - i * 0.055, -0.06 + i * 0.012);
          add(b);
        }
      }
      break;
    }
    case 'afro': {
      const af = new THREE.Mesh(new THREE.SphereGeometry(0.3, 28, 20), hair);
      af.position.set(0, 0.14, -0.1);
      af.scale.set(1, 0.9, 0.92);
      add(af);
      break;
    }
    case 'quiff': {
      add(cap(1.04, Math.PI * 0.52));
      const q = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.12, 8, 14), hair);
      q.rotation.set(1.1, 0, 0);
      q.position.set(0, 0.2, 0.08);
      q.scale.set(1.5, 1, 1);
      add(q);
      break;
    }
    default:
      break;
  }
}

function buildBeard(head: THREE.Group, beard: string, hair: THREE.Material, hs: [number, number, number]) {
  if (beard === 'full' || beard === 'viking') {
    // mentón y laterales, dejando libre la boca
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.207, 30, 12, 0, Math.PI * 2, Math.PI * 0.69, Math.PI * 0.27), hair);
    chin.scale.set(hs[0], hs[1] * 1.04, hs[2] * 1.05);
    head.add(chin);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.SphereGeometry(0.206, 14, 10, s < 0 ? Math.PI * 0.62 : Math.PI * 0.1, Math.PI * 0.28, Math.PI * 0.52, Math.PI * 0.2), hair);
      side.scale.set(hs[0], hs[1] * 1.04, hs[2] * 1.04);
      head.add(side);
    }
    if (beard === 'viking') {
      for (const s of [-1, 1]) {
        const br = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.15, 4, 8), hair);
        br.position.set(s * 0.05, -0.28, 0.12);
        head.add(br);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12), std('#d9c27a', 0.3, 1));
        ring.rotation.x = Math.PI / 2;
        ring.position.set(s * 0.05, -0.33, 0.12);
        head.add(ring);
      }
    }
  }
  if (beard === 'mustache' || beard === 'full' || beard === 'goatee' || beard === 'viking') {
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.045, 4, 8), hair);
      m.rotation.z = Math.PI / 2 - s * 0.32;
      m.position.set(s * 0.032, -0.07, 0.193 * hs[2]);
      head.add(m);
    }
  }
  if (beard === 'goatee') {
    const gt = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), hair);
    gt.scale.set(1, 1.3, 0.8);
    gt.position.set(0, -0.165, 0.155);
    head.add(gt);
  }
}

function buildGlasses(head: THREE.Group, glasses: string) {
  if (glasses === 'none') return;
  const g = new THREE.Group();
  if (glasses === 'pro') {
    const visor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.212, 0.212, 0.065, 36, 1, true, -1.1, 2.2),
      new THREE.MeshPhysicalMaterial({ color: 0x2be0ff, metalness: 0.6, roughness: 0.05, transparent: true, opacity: 0.82, side: THREE.DoubleSide, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.6 }),
    );
    visor.position.y = 0.03;
    g.add(visor);
  } else {
    const frame = std(glasses === 'aviator' ? '#d9c27a' : '#111111', 0.3, glasses === 'aviator' ? 1 : 0.4);
    for (const s of [-1, 1]) {
      let ring: THREE.Mesh;
      if (glasses === 'square') {
        ring = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.009, 6, 4), frame);
        ring.rotation.z = Math.PI / 4;
        ring.scale.set(1.1, 0.85, 1);
      } else if (glasses === 'aviator') {
        ring = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.004, 8, 28), frame);
        ring.scale.set(1.05, 0.9, 1);
      } else ring = new THREE.Mesh(new THREE.TorusGeometry(0.041, 0.006, 8, 28), frame);
      ring.position.set(s * 0.072, 0.026, 0.204);
      g.add(ring);
      if (glasses === 'sun' || glasses === 'aviator') {
        const lens = new THREE.Mesh(
          new THREE.CircleGeometry(0.042, 24),
          new THREE.MeshPhysicalMaterial({ color: glasses === 'aviator' ? 0x5a3a12 : 0x111111, metalness: 0.5, roughness: 0.04, transparent: true, opacity: 0.88, clearcoat: 1 }),
        );
        lens.scale.copy(ring.scale);
        lens.position.set(s * 0.072, 0.026, 0.205);
        g.add(lens);
      }
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.17), frame);
      arm.position.set(s * 0.198, 0.03, 0.1);
      g.add(arm);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.007, 0.007), frame);
    bridge.position.set(0, 0.036, 0.21);
    g.add(bridge);
  }
  head.add(g);
}

function buildHat(head: THREE.Group, cfg: Cfg, hs: [number, number, number]) {
  const add = (...o: THREE.Object3D[]) => head.add(...o);
  switch (cfg.hat) {
    case 'cap':
    case 'backcap': {
      const capMat = std(pick(SHIRT_COLORS, cfg.shirtColor + 3), 0.7);
      const g = new THREE.Group();
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.218, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), capMat);
      dome.scale.set(hs[0], hs[1] * 0.95, hs[2]);
      dome.position.y = 0.05;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.016, 28, 1, false, -Math.PI / 2, Math.PI), capMat);
      brim.position.set(0, 0.07, 0.175);
      brim.scale.z = 1.25;
      brim.rotation.x = 0.12;
      const button = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), capMat);
      button.position.y = 0.27;
      const logo = new THREE.Mesh(new THREE.CircleGeometry(0.04, 20), std('#ffffff', 0.6));
      logo.position.set(0, 0.16, 0.19);
      logo.rotation.x = -0.55;
      g.add(dome, brim, button, logo);
      if (cfg.hat === 'backcap') g.rotation.y = Math.PI;
      add(g);
      break;
    }
    case 'beanie': {
      const m = std(pick(SHIRT_COLORS, cfg.shirtColor + 5), 0.95);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.222, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), m);
      dome.scale.set(hs[0], 1.25, hs[2]);
      dome.position.y = 0.04;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.207, 0.032, 10, 36), std('#ffffff', 0.95));
      band.rotation.x = Math.PI / 2;
      band.scale.set(hs[0], hs[2], 1);
      band.position.y = 0.06;
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 12), std('#ffffff', 1));
      pom.position.y = 0.33;
      add(dome, band, pom);
      break;
    }
    case 'fedora': {
      const m = std('#3a3530', 0.7);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.018, 36), m);
      brim.position.y = 0.16;
      brim.scale.z = 0.9;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.17, 28), m);
      crown.position.y = 0.25;
      const dent = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.3), m);
      dent.position.y = 0.26;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.182, 0.182, 0.035, 28), std(pick(SHIRT_COLORS, cfg.shirtColor), 0.6));
      band.position.y = 0.19;
      add(brim, crown, dent, band);
      break;
    }
    case 'cowboy': {
      const m = std('#8a5a2b', 0.8);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.02, 36), m);
      brim.position.y = 0.15;
      brim.scale.z = 0.9;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.19, 28), m);
      crown.position.y = 0.25;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.192, 0.192, 0.03, 28), std('#1a1a1a', 0.6));
      band.position.y = 0.18;
      for (const s of [-1, 1]) {
        const curl = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16, Math.PI), m);
        curl.position.set(s * 0.33, 0.18, 0);
        curl.rotation.set(0, Math.PI / 2, s * 0.2);
        add(curl);
      }
      add(brim, crown, band);
      break;
    }
    case 'crown': {
      const gold = new THREE.MeshPhysicalMaterial({ color: '#ffcc33', roughness: 0.18, metalness: 1, clearcoat: 0.6 });
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 28, 1, true), gold);
      ring.position.y = 0.24;
      ring.material.side = THREE.DoubleSide;
      add(ring);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 8), gold);
        spike.position.set(Math.cos(a) * 0.16, 0.32, Math.sin(a) * 0.16);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), gold);
        ball.position.set(Math.cos(a) * 0.16, 0.37, Math.sin(a) * 0.16);
        const gem = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 10), new THREE.MeshPhysicalMaterial({ color: i % 2 ? 0xff1744 : 0x2979ff, emissive: i % 2 ? 0x550000 : 0x001155, roughness: 0.05, transmission: 0.3, clearcoat: 1 }));
        gem.position.set(Math.cos(a) * 0.172, 0.24, Math.sin(a) * 0.172);
        add(spike, ball, gem);
      }
      break;
    }
    case 'headband': {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.026, 8, 36), std(pick(SHIRT_COLORS, cfg.shirtColor + 1), 0.8));
      band.rotation.x = Math.PI / 2 - 0.15;
      band.scale.set(hs[0], hs[2], 1);
      band.position.y = 0.11;
      add(band);
      break;
    }
  }
}

function buildAccessory(rig: Rig, cfg: Cfg, spine: THREE.Group) {
  const gold = std('#ffd34d', 0.22, 1);
  switch (cfg.acc) {
    case 'watch': {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.012, 8, 20), std('#1a1a1a', 0.5));
      band.rotation.x = Math.PI / 2;
      band.position.y = -0.18;
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 20), std('#c9ccd2', 0.15, 1));
      face.rotation.x = Math.PI / 2;
      face.position.set(0, -0.18, 0.062);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.021, 20), new THREE.MeshStandardMaterial({ color: 0x0f2a5a, emissive: 0x1f6dff, emissiveIntensity: 0.4, roughness: 0.1 }));
      glass.position.set(0, -0.18, 0.069);
      rig.elL.add(band, face, glass);
      break;
    }
    case 'wristband':
      for (const el of [rig.elL, rig.elR]) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.05, 16), std(pick(SHIRT_COLORS, cfg.shirtColor + 2), 0.95));
        b.position.y = -0.17;
        el.add(b);
      }
      break;
    case 'chain': {
      const ch = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.008, 6, 36), gold);
      ch.rotation.x = Math.PI / 2 - 0.55;
      ch.position.set(0, 0.6, 0.06);
      const pend = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 4), gold);
      pend.rotation.x = Math.PI;
      pend.position.set(0, 0.5, 0.17);
      spine.add(ch, pend);
      break;
    }
    case 'medal': {
      for (const s of [-1, 1]) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.006), std(s < 0 ? '#1f6dff' : '#e8193c', 0.7));
        rib.position.set(s * 0.035, 0.53, 0.165);
        rib.rotation.set(-0.3, 0, s * 0.35);
        spine.add(rib);
      }
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 24), new THREE.MeshPhysicalMaterial({ color: '#ffcc33', metalness: 1, roughness: 0.2, clearcoat: 0.8 }));
      disc.rotation.x = Math.PI / 2 - 0.25;
      disc.position.set(0, 0.43, 0.2);
      spine.add(disc);
      break;
    }
    case 'scarf': {
      const m = std(pick(SHIRT_COLORS, cfg.shirtColor + 4), 0.95);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.045, 10, 28), m);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.66;
      const tail = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.24, 0.025, 2, 0.01), m);
      tail.position.set(0.07, 0.52, 0.16);
      tail.rotation.set(-0.25, 0, 0.12);
      spine.add(ring, tail);
      break;
    }
    case 'headphones': {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.014, 8, 28, Math.PI * 1.25), std('#1b1b1f', 0.4));
      band.rotation.set(Math.PI / 2, 0, Math.PI * 0.12 + Math.PI);
      band.position.y = 0.63;
      spine.add(band);
      for (const s of [-1, 1]) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 20), std('#1b1b1f', 0.4));
        cup.rotation.z = Math.PI / 2;
        cup.rotation.y = s * 0.6;
        cup.position.set(s * 0.12, 0.62, 0.07);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.007, 6, 18), new THREE.MeshStandardMaterial({ color: pick(SHIRT_COLORS, cfg.shirtColor), emissive: pick(SHIRT_COLORS, cfg.shirtColor), emissiveIntensity: 0.8 }));
        ring.rotation.y = Math.PI / 2 + s * 0.6;
        ring.position.set(s * 0.14, 0.62, 0.075);
        spine.add(cup, ring);
      }
      break;
    }
  }
}

// ------------------------------------------------------------------ expresiones y poses

function setExpression(av: THREE.Group, expr: Expr) {
  const f = av.userData.face as { mat: THREE.MeshStandardMaterial; tex: Partial<Record<Expr, THREE.Texture>>; cfg: Cfg; size: number; current: Expr } | undefined;
  if (!f || f.current === expr) return;
  if (!f.tex[expr]) f.tex[expr] = toTexture(faceCanvas(f.cfg, expr, f.size));
  f.mat.map = f.tex[expr]!;
  f.current = expr;
}

interface JointTargets {
  [k: string]: { x?: number; y?: number; z?: number; py?: number; px?: number };
}

/** Ángulos objetivo del esqueleto según el instante, el gesto y su progreso. */
function poseTargets(t: number, gesture: Gesture | AvatarPose | null, p: number, holding: boolean): JointTargets {
  const T: JointTargets = {
    hips: { px: Math.sin(t * 0.7) * 0.012, z: Math.sin(t * 0.7) * 0.02, py: -0.82 },
    spine: { x: 0.02, z: -Math.sin(t * 0.7) * 0.012 },
    head: { y: Math.sin(t * 0.37) * 0.22 + Math.sin(t * 1.1) * 0.06, x: Math.sin(t * 0.53) * 0.04, z: Math.sin(t * 0.8) * 0.03 },
    shL: { x: Math.sin(t * 0.9) * 0.05, z: -(0.13 + Math.sin(t * 1.3) * 0.02) },
    shR: { x: holding ? -0.18 : Math.sin(t * 0.9 + 2) * 0.05, z: 0.13 + Math.sin(t * 1.3 + 1) * 0.02 },
    elL: { x: -0.18, z: 0 },
    elR: { x: holding ? -0.95 : -0.22, z: 0 },
    hipL: { x: 0, z: -Math.sin(t * 0.7) * 0.02 },
    hipR: { x: 0, z: -Math.sin(t * 0.7) * 0.02 },
    kneeL: { x: 0 },
    kneeR: { x: 0 },
  };
  const env = Math.min(1, p / 0.18, (1 - p) / 0.22);
  const w = Math.max(0, env);
  const blend = (k: string, v: { x?: number; y?: number; z?: number; py?: number; px?: number }) => {
    const cur = T[k];
    for (const key of Object.keys(v) as (keyof typeof v)[]) cur[key] = (cur[key] ?? 0) * (1 - w) + (v[key] as number) * w;
  };
  switch (gesture) {
    case 'wave':
      blend('shR', { x: -0.25, z: 2.35 });
      blend('elR', { x: -0.15, z: Math.sin(t * 11) * 0.5 });
      blend('head', { z: -0.12, y: 0.05 });
      break;
    case 'cheer': {
      const pump = Math.abs(Math.sin(t * 7));
      blend('shL', { x: -0.25, z: -2.65 });
      blend('shR', { x: -0.25, z: 2.65 });
      blend('elL', { x: -0.35 - pump * 0.45 });
      blend('elR', { x: -0.35 - pump * 0.45 });
      blend('hips', { py: -0.82 + Math.abs(Math.sin(t * 7)) * 0.06 });
      blend('head', { x: -0.15, y: 0 });
      break;
    }
    case 'throw': {
      const cock = p < 0.55 ? -1.95 + Math.sin(t * 9) * 0.08 : p < 0.62 ? -1.95 + ((p - 0.55) / 0.07) * 1.8 : -0.15;
      blend('shR', { x: -1.45, z: 0.18 });
      blend('elR', { x: cock });
      blend('shL', { x: -0.35, z: -0.45 });
      blend('elL', { x: -0.6 });
      blend('spine', { x: 0.06, z: 0.03 });
      blend('head', { y: 0, x: 0.02 });
      break;
    }
    case 'think':
      blend('shR', { x: -0.62, z: 0.32 });
      blend('elR', { x: -2.3 });
      blend('shL', { x: -0.3, z: -0.1 });
      blend('elL', { x: -1.2 });
      blend('head', { x: 0.1, z: 0.12, y: -0.1 });
      break;
    case 'sad':
      blend('head', { x: 0.38, y: -0.05, z: 0.05 });
      blend('spine', { x: 0.14 });
      blend('shL', { z: -0.04, x: 0.05 });
      blend('shR', { z: 0.04, x: 0.05 });
      blend('elL', { x: -0.05 });
      blend('elR', { x: -0.05 });
      break;
  }
  return T;
}

function applyTargets(av: THREE.Group, T: JointTargets, k: number) {
  const rig = av.userData.rig as Rig;
  for (const name of Object.keys(T)) {
    const o = (rig as unknown as Record<string, THREE.Object3D>)[name];
    if (!o) continue;
    const v = T[name];
    if (v.x !== undefined) o.rotation.x += (v.x - o.rotation.x) * k;
    if (v.y !== undefined) o.rotation.y += (v.y - o.rotation.y) * k;
    if (v.z !== undefined) o.rotation.z += (v.z - o.rotation.z) * k;
    if (v.py !== undefined) o.position.y += (v.py - o.position.y) * k;
    if (v.px !== undefined) o.position.x += (v.px - o.position.x) * k;
  }
}

/** Pose estática (miniaturas). */
export function poseAvatar(av: THREE.Group, pose: AvatarPose) {
  const T = poseTargets(pose === 'cheer' ? 0.33 : 0, pose === 'idle' ? null : pose, 0.5, false);
  if (pose === 'idle') {
    T.head.y = 0.15;
    T.head.x = 0.02;
  }
  applyTargets(av, T, 1);
  if (pose === 'cheer' || pose === 'wave') setExpression(av, 'happy');
}

// ------------------------------------------------------------------ vista interactiva

const FOCUS: Record<AvatarFrame, { y: number; h: number }> = {
  full: { y: -0.6, h: 2.05 },
  head: { y: 0.08, h: 0.66 },
  torso: { y: -0.32, h: 1.08 },
  legs: { y: -1.05, h: 1.02 },
  feet: { y: -1.36, h: 0.55 },
};

function gradientTexture(stops: [number, string][], w = 4, h = 256, radial = false): THREE.Texture {
  const [c, ctx] = makeCanvas(radial ? 256 : w, h);
  const g = radial ? ctx.createRadialGradient(128, 128, 0, 128, 128, 128) : ctx.createLinearGradient(0, 0, 0, h);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, radial ? 256 : w, h);
  return toTexture(c);
}

export class AvatarView implements View {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.05, 40);
  bloom = { strength: 0.38, radius: 0.55, threshold: 0.82 };
  exposure = 0.98;
  grade = { vignette: 0.38, aberration: 0.08, saturation: 1.05, contrast: 1.04, grain: 0.012 };
  private avatar: THREE.Group | null = null;
  private dart: THREE.Group | null = null;
  private dartLook: DartLook | null = null;
  private spin = 0.25;
  private spinTarget: number | null = null;
  private vel = 0;
  private dragging = false;
  private blink = 2;
  private gesture: { g: Gesture; t0: number; dur: number } | null = null;
  private nextGesture = 5;
  private time = 0;
  private W = 390;
  private H = 844;
  private region = { top: 0.08, height: 0.36 };
  private focusName: AvatarFrame = 'full';
  private fy = FOCUS.full.y;
  private fh = FOCUS.full.h;
  private motes: THREE.Points;
  private ring: THREE.Mesh;
  /** si es falso no hace gestos solo (editor) */
  autoGestures = true;

  constructor() {
    this.scene.environmentIntensity = 0.22;
    const key = new THREE.DirectionalLight(0xfff1e0, 1.35);
    key.position.set(1.3, 2.6, 2.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -1.4;
    key.shadow.camera.right = 1.4;
    key.shadow.camera.top = 1.2;
    key.shadow.camera.bottom = -2.2;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 9;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 5;
    const fill = new THREE.DirectionalLight(0xbfd2ff, 0.7);
    fill.position.set(-2.2, 0.6, 1.8);
    const rim = new THREE.DirectionalLight(0x7f9bff, 2.2);
    rim.position.set(-1.2, 1.8, -2.4);
    const rim2 = new THREE.DirectionalLight(0xff9de0, 1.1);
    rim2.position.set(1.6, 0.4, -2);
    this.scene.add(key, key.target, fill, rim, rim2, new THREE.HemisphereLight(0xdfe6ff, 0x2a2240, 0.3));

    // fondo de estudio
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 12),
      new THREE.MeshBasicMaterial({ map: gradientTexture([[0, '#3a4bb0'], [0.45, '#1a1f55'], [1, '#07091c']], 4, 256, true), depthWrite: false }),
    );
    back.position.set(0, -0.3, -4);
    this.scene.add(back);
    // haz de luz desde arriba
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 1.05, 4.2, 40, 1, true),
      new THREE.MeshBasicMaterial({ map: gradientTexture([[0, 'rgba(255,255,255,0)'], [0.25, 'rgba(190,210,255,0.5)'], [1, 'rgba(190,210,255,0)']]), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    cone.position.set(0, 0.55, -0.15);
    this.scene.add(cone);
    // partículas de polvo en el haz
    const N = 70;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 1.4;
      pos[i * 3 + 1] = -1.4 + Math.random() * 3.6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(pg, new THREE.PointsMaterial({ map: glowTexture(), size: 0.035, color: 0xcfe0ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.motes);
    // podio
    const podium = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.12, 64), new THREE.MeshPhysicalMaterial({ color: 0x1a2050, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.15 }));
    podium.position.y = -1.56;
    podium.receiveShadow = true;
    this.scene.add(podium);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.635, 0.012, 8, 96), new THREE.MeshStandardMaterial({ color: 0x66ccff, emissive: 0x3fb8ff, emissiveIntensity: 2.2 }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = -1.498;
    this.scene.add(this.ring);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.6),
      new THREE.MeshBasicMaterial({ map: gradientTexture([[0, 'rgba(80,170,255,0.55)'], [0.5, 'rgba(80,120,255,0.12)'], [1, 'rgba(80,120,255,0)']], 4, 256, true), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -1.63;
    this.scene.add(glow);
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 32),
      new THREE.MeshBasicMaterial({ map: gradientTexture([[0, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']], 4, 256, true), transparent: true, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = -1.497;
    this.scene.add(blob);
  }

  set(cfg: AvatarConfig) {
    const prevRig = this.avatar?.userData.rig as Rig | undefined;
    const keep = prevRig
      ? (['hips', 'spine', 'head', 'shL', 'shR', 'elL', 'elR', 'hipL', 'hipR', 'kneeL', 'kneeR'] as const).map((k) => [k, prevRig[k].rotation.clone(), prevRig[k].position.clone()] as const)
      : null;
    if (this.avatar) {
      this.scene.remove(this.avatar);
      disposeObject(this.avatar);
    }
    this.avatar = buildAvatar(cfg, { faceSize: 1024, texSize: 512 });
    // conserva la postura para que el cambio de pieza no dé un salto
    if (keep) {
      const rig = this.avatar.userData.rig as Rig;
      for (const [k, r, p] of keep) {
        rig[k].rotation.copy(r);
        rig[k].position.copy(p);
      }
    }
    this.scene.add(this.avatar);
    this.dart = null;
    if (this.dartLook) this.setDart(this.dartLook);
  }

  /** Dardo en la mano derecha (o null para quitarlo). */
  setDart(look: DartLook | null) {
    this.dartLook = look;
    if (this.dart) {
      this.dart.parent?.remove(this.dart);
      this.dart = null;
    }
    if (!look || !this.avatar) return;
    const d = buildDart(look);
    const g = d.group;
    g.userData.keep = true;
    g.scale.setScalar(1.7);
    g.position.set(0.0, -0.05, 0.02);
    g.rotation.set(-0.35, 0, 0);
    (this.avatar.userData.rig as Rig).handR.add(g);
    this.dart = g;
  }

  /** Zona de la pantalla (en píxeles CSS) donde debe verse el personaje. */
  setRegion(top: number, height: number) {
    const H = window.innerHeight || this.H;
    this.region = { top: top / H, height: height / H };
  }

  focus(f: AvatarFrame) {
    this.focusName = f;
  }

  /** Gira para mostrar la espalda (dorsal) o vuelve al frente. */
  face(back: boolean) {
    this.spinTarget = back ? Math.PI : 0.25;
  }

  play(g: Gesture) {
    this.gesture = { g, t0: this.time, dur: g === 'throw' ? 2.2 : g === 'think' ? 2.6 : 2.3 };
    this.nextGesture = this.time + 8 + Math.random() * 5;
  }

  onPointer(kind: 'down' | 'move' | 'up', dx = 0) {
    if (kind === 'down') {
      this.dragging = true;
      this.spinTarget = null;
    }
    if (kind === 'up') this.dragging = false;
    if (kind === 'move' && this.dragging) {
      this.spin += dx * 0.012;
      this.vel = dx * 0.012;
    }
  }

  resize(w: number, h: number) {
    this.W = w;
    this.H = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(t: number, dt: number) {
    this.time = t;
    // encuadre: el personaje ocupa la región indicada de la pantalla
    const F = FOCUS[this.focusName];
    const k = 1 - Math.exp(-dt * 5);
    this.fy += (F.y - this.fy) * k;
    this.fh += (F.h - this.fh) * k;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const regionH = Math.max(0.15, this.region.height);
    let d = this.fh / (2 * tan * regionH * 0.94);
    // que quepa también a lo ancho
    d = Math.max(d, (this.fh * 0.3) / (tan * this.camera.aspect * 0.9));
    // la cámara mira al personaje desde un poco más arriba y la imagen se desplaza a la región
    this.camera.position.set(0, this.fy + d * 0.07, d);
    this.camera.lookAt(0, this.fy, 0);
    const centerPx = (this.region.top + regionH / 2) * this.H;
    this.camera.setViewOffset(this.W, this.H, 0, this.H / 2 - centerPx, this.W, this.H);

    (this.ring.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.8 + Math.sin(t * 2) * 0.5;
    this.motes.rotation.y = t * 0.05;
    const mp = this.motes.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < mp.count; i++) {
      let y = mp.getY(i) + dt * 0.05;
      if (y > 2.2) y = -1.4;
      mp.setY(i, y);
    }
    mp.needsUpdate = true;

    if (!this.avatar) return;
    if (this.spinTarget !== null) {
      this.spin += (this.spinTarget - this.spin) * (1 - Math.exp(-dt * 4));
    } else if (!this.dragging) {
      this.vel *= Math.exp(-dt * 3);
      this.spin += this.vel;
      this.spin += (Math.sin(t * 0.4) * 0.3 - this.spin) * dt * 0.4;
    }
    this.avatar.rotation.y = this.spin;

    // gestos
    if (this.autoGestures && !this.gesture && t > this.nextGesture) {
      const opts: Gesture[] = this.dart ? ['throw', 'wave', 'think', 'throw'] : ['wave', 'think', 'throw'];
      this.play(opts[Math.floor(Math.random() * opts.length)]);
    }
    let p = 0;
    if (this.gesture) {
      p = (t - this.gesture.t0) / this.gesture.dur;
      if (p >= 1) this.gesture = null;
    }
    const T = poseTargets(t, this.gesture?.g ?? null, Math.min(1, p), !!this.dart);
    applyTargets(this.avatar, T, 1 - Math.exp(-dt * 9));
    const rig = this.avatar.userData.rig as Rig;
    rig.spine.scale.y = 1 + Math.sin(t * 2.1) * 0.008;

    // parpadeo y expresión
    this.blink -= dt;
    if (this.blink < -0.13) this.blink = 2.2 + Math.random() * 3.2;
    const happy = this.gesture && (this.gesture.g === 'cheer' || this.gesture.g === 'wave');
    setExpression(this.avatar, this.blink < 0 ? 'blink' : happy ? 'happy' : 'open');
  }
}

let sharedAv: AvatarView | null = null;
export function avatarView() {
  if (!sharedAv) sharedAv = new AvatarView();
  return sharedAv;
}

// ------------------------------------------------------------------ miniaturas

let thumbScene: THREE.Scene | null = null;
let thumbCam: THREE.PerspectiveCamera | null = null;

/** Imagen PNG del avatar con el encuadre indicado (cabeza, cuerpo entero, piernas…). */
export function avatarShot(cfg: AvatarConfig, frame: AvatarFrame = 'head', w = 128, h = w, pose: AvatarPose = 'idle'): string {
  const key = `av_${frame}_${pose}_${w}x${h}_` + JSON.stringify(cfg);
  if (!thumbScene) {
    thumbScene = new THREE.Scene();
    const k = new THREE.DirectionalLight(0xfff4e8, 1.55);
    k.position.set(0.8, 1.4, 2);
    const rim = new THREE.DirectionalLight(0x9fb4ff, 1.6);
    rim.position.set(-1.2, 1, -1.5);
    thumbScene.add(k, rim, new THREE.HemisphereLight(0xffffff, 0x445577, 0.55));
    thumbCam = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
  }
  const cam = thumbCam!;
  cam.aspect = w / h;
  if (frame === 'head') {
    cam.fov = 28;
    cam.position.set(0.25, 0.12, 1.5);
    cam.lookAt(0, 0.0, 0);
  } else {
    const F = FOCUS[frame];
    cam.fov = 26;
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const d = Math.max(F.h / (2 * tan * (frame === 'full' ? 1.08 : 0.98)), (F.h * 0.3) / (tan * cam.aspect));
    cam.position.set(d * 0.12, F.y + 0.05, d);
    cam.lookAt(0, F.y, 0);
  }
  cam.updateProjectionMatrix();
  const av = buildAvatar(cfg, { faceSize: Math.max(w, h) >= 160 ? 512 : 256, texSize: 256 });
  poseAvatar(av, pose);
  av.rotation.y = frame === 'head' ? 0.2 : 0.28;
  thumbScene.add(av);
  const url = engine.thumbnail(key, thumbScene, cam, w, h);
  thumbScene.remove(av);
  disposeObject(av);
  return url;
}

/** Retrato (cabeza y hombros) del avatar como imagen PNG. */
export function avatarPortrait(cfg: AvatarConfig, size = 128): string {
  return avatarShot(cfg, 'head', size, size, 'idle');
}

export function disposeObject(o: THREE.Object3D) {
  const visit = (c: THREE.Object3D) => {
    if (c.userData.keep) return;
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const sm = mat as THREE.MeshStandardMaterial;
        if (sm.map && !sm.map.userData.shared) sm.map.dispose();
        mat.dispose();
      }
    }
    for (const ch of c.children) visit(ch);
  };
  visit(o);
  const f = o.userData.face as { tex: Partial<Record<Expr, THREE.Texture>> } | undefined;
  if (f) for (const t of Object.values(f.tex)) t?.dispose();
}
