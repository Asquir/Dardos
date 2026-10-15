// Geometría oficial de una diana de sisal (medidas en milímetros, origen en el centro,
// eje X a la derecha y eje Y hacia arriba). Compartido por el cliente y el servidor.

export const BOARD = {
  bull: 6.35, // radio del bullseye (50)
  outerBull: 15.9, // radio del anillo exterior del bull (25)
  trebleIn: 99,
  trebleOut: 107,
  doubleIn: 162,
  doubleOut: 170,
  numberRing: 198, // radio donde se dibujan los números
  radius: 225.5, // radio total de la diana
  wire: 0.6, // medio grosor del alambre (araña)
} as const;

/** Orden de los números en sentido horario empezando arriba (20). */
export const SEGMENTS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5] as const;

export type Ring = 'MISS' | 'S' | 'D' | 'T' | 'SB' | 'DB';

export interface Hit {
  x: number;
  y: number;
  ring: Ring;
  /** número del sector (25 para el bull, 0 si falla) */
  num: number;
  mult: 0 | 1 | 2 | 3;
  points: number;
  label: string;
  /** el dardo rebotó en un alambre y no puntúa */
  bounce?: boolean;
}

const DEG = Math.PI / 180;

/** Ángulo (radianes) del centro del sector con índice i en SEGMENTS. */
export function segmentAngle(i: number): number {
  return (90 - i * 18) * DEG;
}

export function segmentIndexOf(num: number): number {
  return SEGMENTS.indexOf(num as (typeof SEGMENTS)[number]);
}

export function sectorAt(x: number, y: number): number {
  const deg = Math.atan2(y, x) / DEG;
  let i = Math.round((90 - deg) / 18) % 20;
  if (i < 0) i += 20;
  return SEGMENTS[i];
}

export function labelFor(ring: Ring, num: number): string {
  switch (ring) {
    case 'MISS':
      return 'FUERA';
    case 'DB':
      return 'BULL';
    case 'SB':
      return '25';
    case 'S':
      return String(num);
    default:
      return ring + num;
  }
}

export function makeHit(x: number, y: number, ring: Ring, num: number): Hit {
  const mult = ring === 'MISS' ? 0 : ring === 'D' || ring === 'DB' ? 2 : ring === 'T' ? 3 : 1;
  const base = ring === 'SB' || ring === 'DB' ? 25 : num;
  return { x, y, ring, num: ring === 'MISS' ? 0 : base, mult: mult as Hit['mult'], points: base * mult, label: labelFor(ring, num) };
}

/** Puntuación del punto (x, y) en mm. */
export function scoreAt(x: number, y: number): Hit {
  const r = Math.hypot(x, y);
  if (r <= BOARD.bull) return makeHit(x, y, 'DB', 25);
  if (r <= BOARD.outerBull) return makeHit(x, y, 'SB', 25);
  if (r > BOARD.doubleOut) return makeHit(x, y, 'MISS', 0);
  const num = sectorAt(x, y);
  if (r >= BOARD.doubleIn) return makeHit(x, y, 'D', num);
  if (r >= BOARD.trebleIn && r <= BOARD.trebleOut) return makeHit(x, y, 'T', num);
  return makeHit(x, y, 'S', num);
}

/** Distancia mínima (mm) desde el punto al alambre más cercano de la araña. */
export function wireDistance(x: number, y: number): number {
  const r = Math.hypot(x, y);
  if (r > BOARD.doubleOut + 3) return Infinity;
  let best = Infinity;
  for (const ringR of [BOARD.bull, BOARD.outerBull, BOARD.trebleIn, BOARD.trebleOut, BOARD.doubleIn, BOARD.doubleOut]) {
    best = Math.min(best, Math.abs(r - ringR));
  }
  if (r >= BOARD.outerBull && r <= BOARD.doubleOut) {
    const a = Math.atan2(y, x);
    for (let k = 0; k < 20; k++) {
      const wa = (90 - 9 - k * 18) * DEG;
      const diff = Math.abs(Math.sin(a - wa)) * r;
      if (Math.cos(a - wa) > 0) best = Math.min(best, diff);
    }
  }
  return best;
}

export type Target = string; // "T20", "D16", "S5", "SB", "DB"

/** Punto central (mm) al que apuntar para un objetivo. */
export function targetPoint(t: Target): { x: number; y: number } {
  if (t === 'DB') return { x: 0, y: 0 };
  if (t === 'SB') return { x: 0, y: (BOARD.bull + BOARD.outerBull) / 2 + 0.5 };
  const kind = t[0];
  const num = parseInt(t.slice(1), 10);
  const a = segmentAngle(segmentIndexOf(num));
  let r: number;
  if (kind === 'T') r = (BOARD.trebleIn + BOARD.trebleOut) / 2;
  else if (kind === 'D') r = (BOARD.doubleIn + BOARD.doubleOut) / 2;
  else r = (BOARD.trebleOut + BOARD.doubleIn) / 2;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

export function targetValue(t: Target): number {
  if (t === 'DB') return 50;
  if (t === 'SB') return 25;
  const m = t[0] === 'T' ? 3 : t[0] === 'D' ? 2 : 1;
  return m * parseInt(t.slice(1), 10);
}

export function isDoubleTarget(t: Target): boolean {
  return t === 'DB' || t[0] === 'D';
}

/** Probabilidad de rebote cuando el dardo toca un alambre. */
export function bounceChance(x: number, y: number): number {
  const d = wireDistance(x, y);
  if (d > 0.9) return 0;
  return 0.35 * (1 - d / 0.9);
}

/** Resuelve un impacto aplicando la posibilidad de rebote (rnd en [0,1)). */
export function resolveHit(x: number, y: number, rnd: number): Hit {
  const h = scoreAt(x, y);
  if (h.ring !== 'MISS' && rnd < bounceChance(x, y)) {
    return { ...makeHit(x, y, 'MISS', 0), bounce: true, label: 'REBOTE' };
  }
  return h;
}
