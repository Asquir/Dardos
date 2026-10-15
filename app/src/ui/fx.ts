// Confeti en un canvas 2D por encima de la interfaz.

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
  w: number;
  h: number;
  c: string;
  life: number;
}
let parts: P[] = [];
let running = false;

const COLORS = ['#ffd23a', '#ff4d6d', '#3f9bff', '#36d66b', '#b051ff', '#ffffff', '#ff9d00'];

function ensure() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.zIndex = '150';
  canvas.style.pointerEvents = 'none';
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
}

export function confetti(amount = 120, origin?: { x: number; y: number }) {
  ensure();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas!.width = innerWidth * dpr;
  canvas!.height = innerHeight * dpr;
  canvas!.style.width = innerWidth + 'px';
  canvas!.style.height = innerHeight + 'px';
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ox = origin?.x ?? innerWidth / 2;
  const oy = origin?.y ?? innerHeight * 0.35;
  for (let i = 0; i < amount; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 4 + Math.random() * 9;
    parts.push({
      x: origin ? ox : Math.random() * innerWidth,
      y: origin ? oy : -20 - Math.random() * 100,
      vx: origin ? Math.cos(a) * s : (Math.random() - 0.5) * 3,
      vy: origin ? Math.sin(a) * s - 4 : 2 + Math.random() * 4,
      r: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.4,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 4,
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: 2.5 + Math.random() * 1.5,
    });
  }
  if (!running) {
    running = true;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx!.clearRect(0, 0, innerWidth, innerHeight);
      parts = parts.filter((p) => (p.life -= dt) > 0 && p.y < innerHeight + 40);
      for (const p of parts) {
        p.vy += 14 * dt;
        p.vx *= 0.99;
        p.x += p.vx * dt * 60 * 0.5;
        p.y += p.vy * dt * 60 * 0.5;
        p.r += p.vr;
        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.r);
        ctx!.scale(1, Math.cos(p.r * 2));
        ctx!.globalAlpha = Math.min(1, p.life);
        ctx!.fillStyle = p.c;
        ctx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx!.restore();
      }
      if (parts.length) requestAnimationFrame(tick);
      else {
        running = false;
        ctx!.clearRect(0, 0, innerWidth, innerHeight);
      }
    };
    requestAnimationFrame(tick);
  }
}

/** Animación de número que sube (para premios). */
export function countUp(el: HTMLElement | null, to: number, ms = 900, from = 0) {
  if (!el) return;
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * e).toLocaleString('es-ES');
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
