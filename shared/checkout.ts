// Tabla de cierres (checkouts) para X01 y ayudas de estrategia.

import { targetValue, type Target } from './board';

const NUMS = Array.from({ length: 20 }, (_, i) => 20 - i);
const ALL: Target[] = [
  ...NUMS.map((n) => 'T' + n),
  ...NUMS.map((n) => 'S' + n),
  ...NUMS.map((n) => 'D' + n),
  'SB',
  'DB',
];
const DOUBLES: Target[] = [...NUMS.map((n) => 'D' + n), 'DB'];

// Dobles preferidos por los profesionales (más fácil dividir hacia abajo).
const DOUBLE_PREF: Record<string, number> = {
  D20: 10, D16: 10, D8: 8, D18: 8, D12: 8, D10: 8, D4: 6, D14: 6, D6: 5, D2: 5, D1: 3,
  D19: 5, D17: 5, D15: 5, D13: 5, D11: 5, D9: 5, D7: 5, D5: 5, D3: 4, DB: 4,
};

function dartCost(t: Target): number {
  // menor es mejor: preferimos trebles altos y sencillos grandes como preparación
  if (t === 'DB') return 6;
  if (t === 'SB') return 5;
  const n = parseInt(t.slice(1), 10);
  if (t[0] === 'T') return n >= 17 ? 1 : n >= 13 ? 2 : 3;
  if (t[0] === 'S') return n >= 10 ? 1.5 : 2;
  return 4; // doble como dardo de preparación
}

const cache = new Map<string, Target[] | null>();

/** Mejor ruta para cerrar `rem` con como mucho `darts` dardos (terminando en doble). */
export function checkoutRoute(rem: number, darts = 3, doubleOut = true): Target[] | null {
  const key = `${rem}|${darts}|${doubleOut}`;
  if (cache.has(key)) return cache.get(key)!;
  let best: Target[] | null = null;
  let bestScore = Infinity;
  const finals = doubleOut ? DOUBLES : ALL;
  const consider = (route: Target[]) => {
    const last = route[route.length - 1];
    let score = route.length * 100;
    for (let i = 0; i < route.length - 1; i++) score += dartCost(route[i]) * 3;
    score -= DOUBLE_PREF[last] ?? (doubleOut ? 0 : last[0] === 'T' ? 0 : 3);
    if (score < bestScore) {
      bestScore = score;
      best = route;
    }
  };
  for (const f of finals) {
    const fv = targetValue(f);
    if (fv === rem) consider([f]);
    if (darts >= 2) {
      for (const a of ALL) {
        if (targetValue(a) + fv === rem) consider([a, f]);
        if (darts >= 3) {
          const need = rem - fv - targetValue(a);
          if (need <= 0) continue;
          for (const b of ALL) if (targetValue(b) === need) consider([a, b, f]);
        }
      }
    }
  }
  cache.set(key, best);
  return best;
}

export function isFinishable(rem: number, darts = 3, doubleOut = true): boolean {
  return checkoutRoute(rem, darts, doubleOut) !== null;
}

/** Objetivo recomendado para el siguiente dardo (lo usa la IA y la pista del HUD). */
export function suggestTarget(rem: number, dartsLeft: number, doubleOut = true): Target {
  const route = checkoutRoute(rem, dartsLeft, doubleOut);
  if (route) return route[0];
  if (rem > 180) return 'T20';
  // Sin cierre posible ahora: preparamos una buena salida sin pasarnos.
  let best: Target = 'T20';
  let bestScore = -Infinity;
  for (const t of ALL) {
    if (t[0] === 'D' && doubleOut) continue;
    const left = rem - targetValue(t);
    if (left < (doubleOut ? 2 : 0)) continue;
    let score = 0;
    const next = checkoutRoute(left, dartsLeft - 1 > 0 ? dartsLeft - 1 : 3, doubleOut);
    if (next) score += 50 - next.length * 10 + (DOUBLE_PREF[next[next.length - 1]] ?? 0);
    if (left <= 40 && left % 2 === 0) score += 15;
    score += targetValue(t) * 0.15; // sumar puntos siempre ayuda
    score -= dartCost(t) * 2;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

export function routeLabel(route: Target[] | null): string {
  if (!route) return '';
  return route.map((t) => (t === 'DB' ? 'BULL' : t === 'SB' ? '25' : t[0] === 'S' ? t.slice(1) : t)).join(' · ');
}
