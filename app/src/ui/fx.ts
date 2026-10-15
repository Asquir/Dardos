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

/** Monedas o gemas que salen volando hacia su contador de la barra superior. */
export function flyCurrency(kind: 'coins' | 'gems', amount = 8, from?: { x: number; y: number }, onArrive?: () => void): boolean {
  const boxes = document.querySelectorAll<HTMLElement>('.topbar .currency');
  const box = boxes[kind === 'coins' ? 0 : 1];
  if (!box || !box.offsetParent) return false;
  const icon = box.querySelector<SVGElement>('.ico');
  const tr = (icon ?? box).getBoundingClientRect();
  const tx = tr.x + tr.width / 2;
  const ty = tr.y + tr.height / 2;
  const fx = from ?? { x: innerWidth / 2, y: innerHeight * 0.48 };
  const n = Math.max(3, Math.min(14, amount));
  let arrived = false;
  for (let i = 0; i < n; i++) {
    const el = (icon ? icon.cloneNode(true) : document.createElement('div')) as HTMLElement;
    el.classList.add('fly-coin');
    document.body.appendChild(el);
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
    const r = 40 + Math.random() * 60;
    const sx = fx.x + Math.cos(a) * r;
    const sy = fx.y + Math.sin(a) * r * 0.7;
    const anim = el.animate(
      [
        { transform: `translate(${fx.x}px, ${fx.y}px) scale(0.3) rotate(0deg)`, opacity: 0 },
        { transform: `translate(${sx}px, ${sy}px) scale(1.2) rotate(${(Math.random() - 0.5) * 90}deg)`, opacity: 1, offset: 0.32 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.55) rotate(0deg)`, opacity: 1 },
      ],
      { duration: 820 + Math.random() * 160, delay: i * 45, easing: 'cubic-bezier(0.45, 0, 0.7, 1)', fill: 'forwards' },
    );
    anim.onfinish = () => {
      el.remove();
      if (!arrived) {
        arrived = true;
        onArrive?.();
      }
      box.classList.remove('bump');
      void box.offsetWidth;
      box.classList.add('bump');
    };
  }
  return true;
}
