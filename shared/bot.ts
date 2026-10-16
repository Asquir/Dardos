// Inteligencia artificial de los rivales controlados por la máquina.

import { resolveHit, targetPoint, type Hit, type Target } from './board';
import { suggestTarget } from './checkout';
import { CRICKET_NUMS, KILLER_MARKS, roundTarget, isAlive, type MatchState } from './rules';

export interface BotSkill {
  /** desviación típica del lanzamiento en mm (menor = mejor) */
  sigma: number;
  /** penalización extra en dobles bajo presión (multiplicador de sigma) */
  pressure: number;
}

/** Generador pseudoaleatorio reproducible (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(r: () => number): number {
  let u = 0;
  while (u === 0) u = r();
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Elige el objetivo del próximo dardo según el modo de juego. */
export function chooseTarget(s: MatchState, me: number): Target {
  const p = s.players[me];
  const dartsLeft = 3 - s.turn.length;
  switch (s.config.mode) {
    case 'x01':
      return suggestTarget(p.remaining, dartsLeft, s.config.doubleOut);
    case 'c121':
      return suggestTarget(p.remaining, dartsLeft, true);
    case 'atc':
      return p.remaining > 20 ? 'DB' : 'S' + p.remaining;
    case 'cricket': {
      const opp = s.players.filter((_, i) => i !== me);
      // 1) si vamos perdiendo en puntos, puntuar en un número cerrado por nosotros y abierto en el rival
      // (en Cut-Throat "perder" es tener más puntos que alguno: hay que cargarle puntos)
      const behind = s.config.cutthroat ? opp.some((o) => o.points < p.points) : opp.some((o) => o.points > p.points);
      for (let i = 5; i >= 0; i--) {
        if (p.marks[i] >= 3 && opp.some((o) => o.marks[i] < 3) && behind) return 'T' + CRICKET_NUMS[i];
      }
      // 2) cerrar el número más alto pendiente
      for (let i = 5; i >= 0; i--) if (p.marks[i] < 3) return 'T' + CRICKET_NUMS[i];
      if (p.marks[6] < 3) return 'DB';
      for (let i = 5; i >= 0; i--) if (opp.some((o) => o.marks[i] < 3)) return 'T' + CRICKET_NUMS[i];
      return 'DB';
    }
    case 'shanghai': {
      // a por el triple; si ya cayó, completa el Shanghái (doble y luego simple)
      const n = s.turnNo + 1;
      const got = new Set(s.turn.filter((h) => h.num === n).map((h) => h.ring));
      if (got.has('T') && !got.has('D')) return 'D' + n;
      if (got.has('T') && got.has('D')) return 'S' + n;
      return 'T' + n;
    }
    case 'baseball':
      return 'T' + Math.min(20, s.turnNo + 1);
    case 'duel9': {
      // el triple del número doble vale 6×n: compensa a partir del 10
      const n = parseInt(roundTarget(s)!.slice(1), 10);
      return 'T' + (n >= 10 ? n : 20);
    }
    case 'bobs27': {
      const t = roundTarget(s)!;
      return t;
    }
    case 'halveit': {
      const t = roundTarget(s)!;
      if (t === 'DANY') return p.points > 60 ? 'D20' : 'D16';
      if (t === 'TANY') return 'T20';
      if (t === 'BULL') return 'SB';
      // primero asegurar (simple grande) y, si ya se acertó, ir a por el triple
      const n = t.slice(1);
      const safe = s.turn.some((h) => h.num === +n);
      return (safe ? 'T' : 'S') + n;
    }
    case 'killer': {
      if (p.killerMarks < KILLER_MARKS) return (KILLER_MARKS - p.killerMarks >= 2 ? 'T' : 'S') + p.num;
      // ya es Killer: al rival vivo con menos vidas (y si empatan, al que más cerca esté de ser Killer)
      const rivals = s.players
        .map((o, i) => ({ o, i }))
        .filter(({ i }) => i !== me && isAlive(s, i))
        .sort((a, b) => a.o.lives - b.o.lives || b.o.killerMarks - a.o.killerMarks);
      const v = rivals[0]?.o;
      if (!v) return 'T20';
      return (v.lives >= 2 ? 'T' : 'S') + v.num;
    }
    default:
      return 'T20';
  }
}

/**
 * Media de 3 dardos que suele hacer un bot en 501 según su dispersión (medido con 150 partidas por punto).
 * Se enseña en la presentación: el rival de la máquina siempre se identifica como tal y con su nivel real.
 */
const SIGMA_AVG: [number, number][] = [
  [6, 97], [8, 85], [10, 74], [13, 57], [16, 47], [20, 37.5], [25, 31], [30, 25], [35, 21], [40, 18.4], [50, 14.6], [60, 12.4],
];

export function expectedAverage(sigma: number): number {
  if (sigma <= SIGMA_AVG[0][0]) return SIGMA_AVG[0][1];
  for (let i = 1; i < SIGMA_AVG.length; i++) {
    const [s1, a1] = SIGMA_AVG[i];
    const [s0, a0] = SIGMA_AVG[i - 1];
    if (sigma <= s1) return a0 + ((sigma - s0) / (s1 - s0)) * (a1 - a0);
  }
  return SIGMA_AVG[SIGMA_AVG.length - 1][1];
}

/** Calcula el punto de impacto de un bot. */
export function botThrow(s: MatchState, me: number, skill: BotSkill, r: () => number): { target: Target; hit: Hit } {
  const target = chooseTarget(s, me);
  const aim = targetPoint(target);
  let sigma = skill.sigma;
  if (target[0] === 'D' || target === 'DB') sigma *= skill.pressure;
  const x = aim.x + gaussian(r) * sigma;
  const y = aim.y + gaussian(r) * sigma;
  return { target, hit: resolveHit(x, y, r()) };
}

export interface BotProfile {
  id: string;
  name: string;
  skill: BotSkill;
  level: number;
  trophies: number;
  seed: number;
}

const FIRST = [
  'Paco', 'Lucía', 'Javi', 'Marta', 'Andrés', 'Sofía', 'Diego', 'Carla', 'Toni', 'Elena', 'Rafa', 'Nuria',
  'Mateo', 'Valeria', 'Iker', 'Alba', 'Hugo', 'Irene', 'Bruno', 'Noa', 'Leo', 'Paula', 'Óscar', 'Vera',
  'Mike', 'Emma', 'Liam', 'Mia', 'Kenji', 'Ana', 'Pedro', 'Rocío', 'Chema', 'Lola', 'Gonzalo', 'Inés',
];
const NICK = [
  'El Toro', 'La Flecha', 'Triple', 'Ojo de Halcón', 'Bullseye', 'El Vikingo', 'La Máquina', 'Sniper',
  'Rayo', 'El Mago', 'Doble Cero', 'La Pantera', 'Tungsteno', 'El Profe', 'Cobra', 'Huracán', 'Titán',
  'El Zurdo', 'La Reina', 'Pulso Firme', 'Diana', 'Fénix', 'Lobo', 'Martillo',
];

/** Crea un rival de máquina con un nivel acorde a la arena. */
export function makeBot(seed: number, sigma: number, trophies: number): BotProfile {
  const r = rng(seed);
  const first = FIRST[Math.floor(r() * FIRST.length)];
  const nick = NICK[Math.floor(r() * NICK.length)];
  const style = r();
  const name = style < 0.4 ? `${first} "${nick}"` : style < 0.7 ? `${first}${Math.floor(r() * 90 + 10)}` : nick;
  const level = Math.max(1, Math.round(trophies / 120 + 1 + r() * 4));
  return {
    id: 'bot_' + seed,
    name,
    skill: { sigma: sigma * (0.9 + r() * 0.2), pressure: 1.05 + r() * 0.25 },
    level,
    trophies: Math.max(0, Math.round(trophies + (r() - 0.5) * 120)),
    seed,
  };
}
