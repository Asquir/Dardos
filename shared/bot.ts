// Inteligencia artificial de los rivales controlados por la máquina.

import { resolveHit, targetPoint, type Hit, type Target } from './board';
import { suggestTarget } from './checkout';
import { CRICKET_NUMS, type MatchState } from './rules';

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
    case 'atc':
      return p.remaining > 20 ? 'DB' : 'S' + p.remaining;
    case 'cricket': {
      const opp = s.players.filter((_, i) => i !== me);
      // 1) si vamos perdiendo en puntos, puntuar en un número cerrado por nosotros y abierto en el rival
      const behind = opp.some((o) => o.points > p.points);
      for (let i = 5; i >= 0; i--) {
        if (p.marks[i] >= 3 && opp.some((o) => o.marks[i] < 3) && behind) return 'T' + CRICKET_NUMS[i];
      }
      // 2) cerrar el número más alto pendiente
      for (let i = 5; i >= 0; i--) if (p.marks[i] < 3) return 'T' + CRICKET_NUMS[i];
      if (p.marks[6] < 3) return 'DB';
      for (let i = 5; i >= 0; i--) if (opp.some((o) => o.marks[i] < 3)) return 'T' + CRICKET_NUMS[i];
      return 'DB';
    }
    default:
      return 'T20';
  }
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
