// Avatar 3D estilizado y personalizable (piel, pelo, barba, gafas, gorro, camiseta y dorsal).

import * as THREE from 'three';
import type { AvatarConfig } from '@shared/protocol';
import { engine, type View } from './renderer';
import { makeCanvas, toTexture, glowTexture } from './textures';
import { EYE_COLORS, HAIR_COLORS, SHIRT_COLORS, SKIN_TONES } from '../meta/catalog';

const std = (color: THREE.ColorRepresentation, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

function shirtTexture(cfg: AvatarConfig): THREE.Texture {
  const [c, ctx] = makeCanvas(512, 256);
  const base = SHIRT_COLORS[cfg.shirtColor % SHIRT_COLORS.length];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 256);
  if (cfg.shirt === 'jersey') {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(0, 150, 512, 18);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 172, 512, 8);
    ctx.font = '96px "Lilita One", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 6;
    ctx.strokeText(String(cfg.number), 128, 120);
    ctx.fillText(String(cfg.number), 128, 120);
  } else if (cfg.shirt === 'hawaii') {
    for (let i = 0; i < 26; i++) {
      const x = (i * 97) % 512;
      const y = (i * 53) % 256;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        ctx.fillStyle = i % 2 ? '#fff3a0' : '#ff7ab0';
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(a) * 12, y + Math.sin(a) * 12, 10, 6, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffb300';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (cfg.shirt === 'polo') {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(116, 0, 24, 90);
    ctx.font = '40px "Lilita One", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('DL', 170, 80);
  } else if (cfg.shirt === 'suit') {
    ctx.fillStyle = '#1b1f2a';
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#f5f5f5';
    ctx.beginPath();
    ctx.moveTo(98, 0);
    ctx.lineTo(128, 150);
    ctx.lineTo(158, 0);
    ctx.fill();
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.moveTo(120, 20);
    ctx.lineTo(128, 140);
    ctx.lineTo(136, 20);
    ctx.fill();
  }
  // tejido
  const img = ctx.getImageData(0, 0, 512, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const f = 0.94 + Math.random() * 0.08;
    img.data[i] *= f;
    img.data[i + 1] *= f;
    img.data[i + 2] *= f;
  }
  ctx.putImageData(img, 0, 0);
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.offset.x = 0.25;
  return t;
}

export function buildAvatar(cfg: AvatarConfig): THREE.Group {
  const root = new THREE.Group();
  const skin = std(SKIN_TONES[cfg.skin % SKIN_TONES.length], 0.82);
  const hairCol = HAIR_COLORS[cfg.hairColor % HAIR_COLORS.length];
  const hair = std(hairCol, 0.75);
  const shirtMat = new THREE.MeshStandardMaterial({ map: shirtTexture(cfg), roughness: 0.85 });

  // Torso
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.28, 8, 24), shirtMat);
  torso.scale.set(1.05, 1, 0.72);
  torso.position.y = -0.48;
  root.add(torso);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.3, 6, 12), shirtMat);
    arm.position.set(s * 0.33, -0.5, 0);
    arm.rotation.z = s * 0.18;
    root.add(arm);
  }
  if (cfg.shirt === 'hoodie') {
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.06, 10, 24), shirtMat);
    hood.rotation.x = Math.PI / 2 + 0.3;
    hood.position.set(0, -0.2, -0.05);
    root.add(hood);
  } else if (cfg.shirt === 'polo' || cfg.shirt === 'jersey') {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 24), cfg.shirt === 'polo' ? std('#ffffff', 0.8) : shirtMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = -0.21;
    root.add(collar);
  }
  // Cuello
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.14, 16), skin);
  neck.position.y = -0.17;
  root.add(neck);

  // Cabeza
  const head = new THREE.Group();
  head.position.y = 0.08;
  root.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 24), skin);
  skull.scale.set(1, 1.1, 1);
  head.add(skull);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), skin);
    ear.scale.set(0.6, 1, 0.8);
    ear.position.set(s * 0.198, 0, 0);
    head.add(ear);
  }
  // ojos
  const eyeWhite = std('#ffffff', 0.3);
  const iris = std(EYE_COLORS[cfg.eyes % EYE_COLORS.length], 0.3);
  const pupil = std('#0a0a0a', 0.2);
  const eyes = new THREE.Group();
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.038, 16, 12), eyeWhite);
    w.scale.set(1, 1.15, 0.55);
    const i = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), iris);
    i.position.z = 0.016;
    i.scale.z = 0.5;
    const pp = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), pupil);
    pp.position.z = 0.025;
    pp.scale.z = 0.4;
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shine.position.set(0.008, 0.01, 0.03);
    e.add(w, i, pp, shine);
    e.position.set(s * 0.072, 0.025, 0.178);
    eyes.add(e);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.013, 0.02), hair);
    brow.position.set(s * 0.074, 0.088, 0.185);
    brow.rotation.z = -s * 0.12;
    head.add(brow);
  }
  head.add(eyes);
  root.userData.eyes = eyes;
  // nariz y boca
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), skin);
  nose.scale.set(0.85, 1, 0.9);
  nose.position.set(0, -0.03, 0.2);
  head.add(nose);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.011, 8, 20, Math.PI), std('#7a1f2a', 0.5));
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, -0.085, 0.178);
  head.add(mouth);
  // mejillas
  for (const s of [-1, 1]) {
    const ch = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ color: 0xff7a7a, transparent: true, opacity: 0.18 }));
    ch.position.set(s * 0.12, -0.04, 0.17);
    ch.rotation.y = s * 0.55;
    head.add(ch);
  }

  // Pelo (con gorro, los peinados voluminosos se recogen)
  const hairStyle = cfg.hat !== 'none' && ['spiky', 'mohawk', 'curly', 'afro', 'bun'].includes(cfg.hair) ? 'short' : cfg.hair;
  const cap = (scale = 1.06, phi = Math.PI * 0.55) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.2 * scale, 32, 16, 0, Math.PI * 2, 0, phi), hair);
    m.scale.set(1, 1.1, 1);
    m.rotation.x = -0.25;
    m.position.y = 0.01;
    return m;
  };
  switch (hairStyle) {
    case 'short':
      head.add(cap());
      break;
    case 'buzz':
      head.add(cap(1.02, Math.PI * 0.5));
      break;
    case 'spiky': {
      head.add(cap());
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 8), hair);
        sp.position.set(Math.cos(a) * 0.11, 0.2, Math.sin(a) * 0.11 - 0.02);
        sp.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
        head.add(sp);
      }
      break;
    }
    case 'long': {
      head.add(cap(1.08, Math.PI * 0.6));
      const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.22, 6, 16), hair);
      back.scale.set(1.15, 1, 0.6);
      back.position.set(0, -0.12, -0.1);
      head.add(back);
      break;
    }
    case 'bun': {
      head.add(cap());
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), hair);
      b.position.set(0, 0.2, -0.1);
      head.add(b);
      break;
    }
    case 'mohawk':
      for (let i = 0; i < 7; i++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.14, 0.06), hair);
        const a = -0.6 + i * 0.25;
        sp.position.set(0, Math.cos(a) * 0.22, Math.sin(a) * 0.22 - 0.02);
        sp.rotation.x = a;
        head.add(sp);
      }
      break;
    case 'curly': {
      head.add(cap(1.04));
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2 * 3;
        const y = 0.06 + (i / 26) * 0.15;
        const rr = Math.sqrt(Math.max(0, 0.05 - (y - 0.04) * (y - 0.04))) + 0.03;
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), hair);
        ball.position.set(Math.cos(a) * rr * 0.95, y + 0.02, Math.sin(a) * rr * 0.95 - 0.03);
        head.add(ball);
      }
      break;
    }
    case 'ponytail': {
      head.add(cap());
      const pt = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.2, 6, 12), hair);
      pt.position.set(0, -0.02, -0.22);
      pt.rotation.x = 0.5;
      head.add(pt);
      break;
    }
    case 'afro': {
      const af = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), hair);
      af.position.set(0, 0.1, -0.04);
      af.scale.set(1, 0.9, 0.95);
      head.add(af);
      // dejamos ver la cara
      skull.renderOrder = 1;
      break;
    }
    default:
      break;
  }

  // Barba
  const beardMat = cfg.beard === 'stubble' ? new THREE.MeshStandardMaterial({ color: new THREE.Color(hairCol).multiplyScalar(0.55), transparent: true, opacity: 0.28, roughness: 1, depthWrite: false }) : hair;
  if (cfg.beard === 'stubble' || cfg.beard === 'full' || cfg.beard === 'viking') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.205, 24, 12, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.4), beardMat);
    b.scale.set(1, 1.1, 1.05);
    head.add(b);
    if (cfg.beard === 'viking') {
      for (const s of [-1, 1]) {
        const br = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.14, 4, 8), hair);
        br.position.set(s * 0.05, -0.27, 0.12);
        head.add(br);
      }
    }
  }
  if (cfg.beard === 'mustache' || cfg.beard === 'full' || cfg.beard === 'goatee' || cfg.beard === 'viking') {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.07, 4, 8), hair);
    m.rotation.z = Math.PI / 2;
    m.position.set(0, -0.06, 0.195);
    head.add(m);
  }
  if (cfg.beard === 'goatee') {
    const gt = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), hair);
    gt.scale.set(1, 1.3, 0.8);
    gt.position.set(0, -0.15, 0.16);
    head.add(gt);
  }

  // Gafas
  if (cfg.glasses !== 'none') {
    const frame = std(cfg.glasses === 'pro' ? '#ff3d6a' : '#111111', 0.3, 0.4);
    const g = new THREE.Group();
    if (cfg.glasses === 'pro') {
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.06, 32, 1, true, -1.1, 2.2), new THREE.MeshStandardMaterial({ color: 0x2be0ff, metalness: 0.8, roughness: 0.1, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      visor.position.y = 0.03;
      g.add(visor);
    } else {
      for (const s of [-1, 1]) {
        const ring =
          cfg.glasses === 'square'
            ? new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.009, 6, 4), frame)
            : new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, 8, 24), frame);
        if (cfg.glasses === 'square') ring.rotation.z = Math.PI / 4;
        ring.position.set(s * 0.072, 0.028, 0.2);
        g.add(ring);
        if (cfg.glasses === 'sun') {
          const lens = new THREE.Mesh(new THREE.CircleGeometry(0.04, 20), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.05 }));
          lens.position.set(s * 0.072, 0.028, 0.201);
          g.add(lens);
        }
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.008), frame);
      bridge.position.set(0, 0.035, 0.205);
      g.add(bridge);
    }
    head.add(g);
  }

  // Gorros
  switch (cfg.hat) {
    case 'cap': {
      const capMat = std(SHIRT_COLORS[(cfg.shirtColor + 3) % SHIRT_COLORS.length], 0.7);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.215, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), capMat);
      dome.position.y = 0.05;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.015, 24, 1, false, -Math.PI / 2, Math.PI), capMat);
      brim.position.set(0, 0.07, 0.17);
      brim.scale.z = 1.2;
      head.add(dome, brim);
      break;
    }
    case 'beanie': {
      const m = std('#c8102e', 0.95);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), m);
      dome.scale.y = 1.25;
      dome.position.y = 0.04;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.03, 8, 32), std('#ffffff', 0.95));
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.06;
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), std('#ffffff', 1));
      pom.position.y = 0.33;
      head.add(dome, band, pom);
      break;
    }
    case 'cowboy': {
      const m = std('#8a5a2b', 0.8);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.02, 32), m);
      brim.position.y = 0.15;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.18, 24), m);
      crown.position.y = 0.25;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.192, 0.192, 0.03, 24), std('#1a1a1a', 0.6));
      band.position.y = 0.18;
      head.add(brim, crown, band);
      break;
    }
    case 'crown': {
      const gold = std('#ffcc33', 0.2, 1);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 24, 1, true), gold);
      ring.position.y = 0.24;
      head.add(ring);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 8), gold);
        spike.position.set(Math.cos(a) * 0.16, 0.32, Math.sin(a) * 0.16);
        head.add(spike);
        const gem = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xff1744 : 0x2979ff, emissive: i % 2 ? 0x550000 : 0x001155, roughness: 0.1 }));
        gem.position.set(Math.cos(a) * 0.172, 0.24, Math.sin(a) * 0.172);
        head.add(gem);
      }
      break;
    }
    case 'headband': {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.025, 8, 32), std('#ff3d6a', 0.8));
      band.rotation.x = Math.PI / 2 - 0.15;
      band.position.y = 0.11;
      head.add(band);
      break;
    }
  }
  root.userData.head = head;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return root;
}

export class AvatarView implements View {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  bloom = { strength: 0.3, radius: 0.5, threshold: 0.9 };
  exposure = 1;
  private avatar: THREE.Group | null = null;
  private spin = 0.25;
  private vel = 0;
  private dragging = false;
  private blink = 0;
  yOffset = 1.5;

  constructor() {
    this.scene.environmentIntensity = 0.35;
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(1, 1.5, 2);
    const rim = new THREE.DirectionalLight(0x99aaff, 1.2);
    rim.position.set(-1.5, 1, -1);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x334466, 0.5));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x4466ff, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(1.6, 1.6, 1);
    halo.position.set(0, -0.1, -0.6);
    this.scene.add(halo);
    this.camera.position.set(0, 0.02, 7.1);
  }

  set(cfg: AvatarConfig) {
    if (this.avatar) {
      this.scene.remove(this.avatar);
      disposeObject(this.avatar);
    }
    this.avatar = buildAvatar(cfg);
    this.scene.add(this.avatar);
  }

  onPointer(kind: 'down' | 'move' | 'up', dx = 0) {
    if (kind === 'down') this.dragging = true;
    if (kind === 'up') this.dragging = false;
    if (kind === 'move' && this.dragging) {
      this.spin += dx * 0.01;
      this.vel = dx * 0.01;
    }
  }

  resize(w: number, h: number) {
    this.camera.fov = w / h < 0.8 ? 36 : 26;
    this.camera.updateProjectionMatrix();
  }

  update(t: number, dt: number) {
    if (!this.avatar) return;
    if (!this.dragging) {
      this.vel *= Math.exp(-dt * 3);
      this.spin += this.vel;
      this.spin += (Math.sin(t * 0.5) * 0.35 - this.spin) * dt * 0.5;
    }
    this.avatar.rotation.y = this.spin;
    this.avatar.position.y = this.yOffset + Math.sin(t * 1.6) * 0.008;
    const head = this.avatar.userData.head as THREE.Group;
    head.rotation.z = Math.sin(t * 0.9) * 0.04;
    head.rotation.x = Math.sin(t * 0.7) * 0.03;
    this.blink -= dt;
    const eyes = this.avatar.userData.eyes as THREE.Group;
    if (this.blink < 0) this.blink = 2.5 + Math.random() * 3;
    eyes.scale.y = this.blink < 0.12 ? 0.1 : 1;
  }
}

let sharedAv: AvatarView | null = null;
export function avatarView() {
  if (!sharedAv) sharedAv = new AvatarView();
  return sharedAv;
}

let thumbScene: THREE.Scene | null = null;
let thumbCam: THREE.PerspectiveCamera | null = null;
/** Retrato (cabeza y hombros) del avatar como imagen PNG. */
export function avatarPortrait(cfg: AvatarConfig, size = 128): string {
  const key = 'av_' + JSON.stringify(cfg) + size;
  if (!thumbScene) {
    thumbScene = new THREE.Scene();
    const key2 = new THREE.DirectionalLight(0xffffff, 2);
    key2.position.set(0.8, 1.2, 2);
    thumbScene.add(key2, new THREE.HemisphereLight(0xffffff, 0x445577, 0.9));
    thumbCam = new THREE.PerspectiveCamera(28, 1, 0.05, 10);
    thumbCam.position.set(0.25, 0.12, 1.5);
    thumbCam.lookAt(0, 0.0, 0);
  }
  const av = buildAvatar(cfg);
  av.rotation.y = 0.2;
  thumbScene.add(av);
  const url = engine.thumbnail(key, thumbScene, thumbCam!, size, size);
  thumbScene.remove(av);
  disposeObject(av);
  return url;
}

export function disposeObject(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      (mat as THREE.MeshStandardMaterial).map?.dispose();
      mat.dispose();
    }
  });
}
