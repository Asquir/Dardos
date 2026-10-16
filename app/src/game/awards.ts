// Premios de turno al estilo de las máquinas de bar: Ton 80, Hat Trick, Tres en la cama, Caballo blanco,
// Big Fish, nueve dardos… Detección pura (sin interfaz) para poder probarla.

import type { Hit } from '@shared/board';
import type { ModeId } from '@shared/rules';

export type AwardId =
  | 'ton80'
  | 'highton'
  | 'lowton'
  | 'hattrick'
  | 'bed'
  | 'whitehorse'
  | 'shanghai'
  | 'bigfish'
  | 'ninedarter'
  | 'bullfinish'
  | 'madhouse'
  | 'robinhood';

export interface AwardDef {
  id: AwardId;
  name: string;
  icon: string;
  desc: string;
  /** importancia: decide cuál se muestra en grande si hay varios */
  tier: 1 | 2 | 3 | 4;
  /** monedas (en veces la base de la arena) en partidas con apuesta */
  coins: number;
  /** color del emblema */
  color: string;
}

export const AWARDS: Record<AwardId, AwardDef> = {
  ninedarter: { id: 'ninedarter', name: '¡NUEVE DARDOS!', icon: '💎', desc: 'Un leg de 501 en el mínimo: 9 dardos', tier: 4, coins: 20, color: '#7dd3ff' },
  ton80: { id: 'ton80', name: 'TON 80', icon: '🔥', desc: 'El máximo: 180 en un turno', tier: 3, coins: 3, color: '#ffb21a' },
  bigfish: { id: 'bigfish', name: 'BIG FISH', icon: '🐟', desc: 'El cierre más alto posible: 170', tier: 3, coins: 4, color: '#3dd6ff' },
  hattrick: { id: 'hattrick', name: 'HAT TRICK', icon: '🎩', desc: 'Tres bulls en un turno', tier: 3, coins: 2, color: '#ff5a6a' },
  robinhood: { id: 'robinhood', name: 'ROBIN HOOD', icon: '🏹', desc: 'Un dardo clavado en otro dardo', tier: 3, coins: 3, color: '#5df08e' },
  whitehorse: { id: 'whitehorse', name: 'CABALLO BLANCO', icon: '🐎', desc: 'Tres triples de números distintos', tier: 2, coins: 2, color: '#ffffff' },
  bed: { id: 'bed', name: 'TRES EN LA CAMA', icon: '🛏️', desc: 'Los tres dardos en la misma casilla', tier: 2, coins: 1, color: '#c08aff' },
  shanghai: { id: 'shanghai', name: 'SHANGHÁI', icon: '🀄', desc: 'Simple, doble y triple del mismo número', tier: 2, coins: 2, color: '#ff8a3a' },
  bullfinish: { id: 'bullfinish', name: 'CIERRE EN EL BULL', icon: '🎯', desc: 'Cerrar un leg en el bull', tier: 2, coins: 1, color: '#ff3d4d' },
  madhouse: { id: 'madhouse', name: 'LA CASA DE LOCOS', icon: '🏚️', desc: 'Cerrar en el doble 1 (el más temido)', tier: 2, coins: 1, color: '#9fb3c8' },
  highton: { id: 'highton', name: 'HIGH TON', icon: '⭐', desc: 'Turno de 151 a 179', tier: 1, coins: 1, color: '#ffd23a' },
  lowton: { id: 'lowton', name: 'LOW TON', icon: '✨', desc: 'Turno de 100 a 150', tier: 1, coins: 0, color: '#8fd0ff' },
};

export interface TurnInfo {
  mode: ModeId;
  hits: Hit[];
  total: number;
  bust: boolean;
  /** el turno cerró el leg */
  checkout: boolean;
  /** puntos que quedaban al empezar el turno (X01) */
  startLeft: number;
  /** dardos del leg (para el nueve dardos) */
  legDarts: number;
  /** puntos iniciales del X01 */
  start: number;
}

/** Premios conseguidos en un turno, del más importante al menos. */
export function detectAwards(t: TurnInfo): AwardId[] {
  const out: AwardId[] = [];
  const h = t.hits.filter((x) => x.ring !== 'MISS');
  const scoring = t.mode === 'x01' || t.mode === 'free';
  if (t.bust) return out;
  if (t.checkout && t.mode === 'x01' && t.start === 501 && t.legDarts === 9) out.push('ninedarter');
  if (scoring && t.total === 180 && t.hits.length === 3) out.push('ton80');
  if (t.checkout && t.mode === 'x01' && t.startLeft === 170) out.push('bigfish');
  if (t.hits.length === 3 && t.hits.every((x) => x.ring === 'SB' || x.ring === 'DB')) out.push('hattrick');
  if (h.length === 3) {
    const trebles = h.filter((x) => x.ring === 'T');
    if (trebles.length === 3 && new Set(trebles.map((x) => x.num)).size === 3) out.push('whitehorse');
    // tres en la cama: misma casilla (mismo número y misma zona); no cuenta el 180, que ya tiene el suyo
    if (h.every((x) => x.num === h[0].num && x.ring === h[0].ring) && !(h[0].ring === 'T' && h[0].num === 20) && h[0].ring !== 'SB' && h[0].ring !== 'DB') out.push('bed');
    const byNum = new Map<number, Set<string>>();
    for (const x of h) {
      if (x.num < 1 || x.num > 20) continue;
      if (!byNum.has(x.num)) byNum.set(x.num, new Set());
      byNum.get(x.num)!.add(x.ring);
    }
    if ([...byNum.values()].some((r) => r.has('S') && r.has('D') && r.has('T'))) out.push('shanghai');
  }
  const last = t.hits[t.hits.length - 1];
  if (t.checkout && t.mode === 'x01' && last) {
    if (last.ring === 'DB') out.push('bullfinish');
    if (last.ring === 'D' && last.num === 1) out.push('madhouse');
  }
  if (scoring && !out.includes('ton80')) {
    if (t.total >= 151 && t.total <= 179) out.push('highton');
    else if (t.total >= 100 && t.total <= 150) out.push('lowton');
  }
  return out.sort((a, b) => AWARDS[b].tier - AWARDS[a].tier);
}
