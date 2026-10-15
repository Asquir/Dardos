// Niveles, misiones diarias, logros, pase de temporada, recompensa diaria y ruleta.

import { rng } from '@shared/bot';
import { dayKey, hashStr } from '../core/store';
import type { Mission, Profile } from './profile';
import type { Reward } from './chests';
import { arenaForTrophies } from './arenas';

// ---------------------------------------------------------------- Niveles

export function xpForNext(level: number): number {
  return Math.round(80 * Math.pow(level, 1.35) + 40);
}

export function levelReward(level: number): Reward {
  const r: Reward = { coins: 100 * level, gems: level % 5 === 0 ? 50 : 10 };
  if (level % 3 === 0) r.chest = level % 9 === 0 ? 'gold' : 'silver';
  return r;
}

/** Funciones que se desbloquean al subir de nivel (para no abrumar al principio). */
export const FEATURE_LEVEL = {
  shop: 1,
  collection: 1,
  training: 1,
  online: 2,
  club: 3,
  tournament: 4,
  challenge: 2,
  season: 2,
  wheel: 1,
  liveEvent: 2,
} as const;
export type Feature = keyof typeof FEATURE_LEVEL;

export function featureUnlocked(p: Profile, f: Feature): boolean {
  return p.level >= FEATURE_LEVEL[f];
}

// ---------------------------------------------------------------- Misiones

export interface MissionTemplate {
  kind: string;
  text: (n: number) => string;
  targets: number[];
  coins: number; // por unidad del objetivo base
  icon: string;
}

export const MISSION_POOL: MissionTemplate[] = [
  { kind: 'win', text: (n) => `Gana ${n} partida${n > 1 ? 's' : ''}`, targets: [1, 2, 3], coins: 90, icon: '🏆' },
  { kind: 'play', text: (n) => `Juega ${n} partidas`, targets: [2, 3, 5], coins: 45, icon: '🎯' },
  { kind: 'darts', text: (n) => `Lanza ${n} dardos`, targets: [30, 60, 100], coins: 2, icon: '🎯' },
  { kind: 'treble', text: (n) => `Acierta ${n} triples`, targets: [3, 6, 10], coins: 20, icon: '✴️' },
  { kind: 'double', text: (n) => `Acierta ${n} dobles`, targets: [2, 4, 6], coins: 25, icon: '⭕' },
  { kind: 'bull', text: (n) => `Acierta ${n} veces en el bull`, targets: [1, 2, 4], coins: 45, icon: '🔴' },
  { kind: 'ton', text: (n) => `Haz ${n} turno${n > 1 ? 's' : ''} de 100 o más`, targets: [1, 2, 3], coins: 60, icon: '💯' },
  { kind: 'checkout', text: (n) => `Cierra ${n} partida${n > 1 ? 's' : ''} con un doble`, targets: [1, 2], coins: 90, icon: '✅' },
  { kind: 'chest', text: (n) => `Abre ${n} cofre${n > 1 ? 's' : ''}`, targets: [1, 2, 3], coins: 50, icon: '🎁' },
  { kind: 'upgrade', text: () => `Mejora un objeto`, targets: [1], coins: 100, icon: '⬆️' },
  { kind: 'training', text: (n) => `Completa ${n} entrenamiento${n > 1 ? 's' : ''}`, targets: [1, 2], coins: 70, icon: '🧠' },
  { kind: 'online', text: (n) => `Juega ${n} partida${n > 1 ? 's' : ''} online`, targets: [1, 2], coins: 120, icon: '🌐' },
  { kind: 'score60', text: (n) => `Haz ${n} turnos de 60 o más`, targets: [3, 5, 8], coins: 25, icon: '🔥' },
];

export function missionTemplate(kind: string) {
  return MISSION_POOL.find((m) => m.kind === kind)!;
}

export function generateMissions(p: Profile, day = dayKey()): Mission[] {
  const r = rng(hashStr(p.id + day));
  const pool = MISSION_POOL.filter((m) => m.kind !== 'online' || p.level >= 2);
  const picked: MissionTemplate[] = [];
  while (picked.length < 3) {
    const m = pool[Math.floor(r() * pool.length)];
    if (!picked.includes(m)) picked.push(m);
  }
  return picked.map((m, i) => {
    const ti = Math.floor(r() * m.targets.length);
    const target = m.targets[ti];
    const coins = Math.round((m.coins * target) / 10) * 10 * (1 + Math.floor(p.level / 10) * 0.5);
    return {
      id: `${day}_${i}`,
      kind: m.kind,
      target,
      progress: 0,
      reward: r() < 0.25 ? { coins, gems: 5 + ti * 5 } : { coins },
      seasonXp: 60 + ti * 30,
      claimed: false,
    };
  });
}

export function missionText(m: Mission): string {
  return missionTemplate(m.kind)?.text(m.target) ?? m.kind;
}

// ---------------------------------------------------------------- Logros

export interface AchievementDef {
  id: string;
  name: string;
  desc: (n: number) => string;
  tiers: number[];
  gems: number[];
  icon: string;
  value: (p: Profile) => number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'wins', name: 'Ganador nato', desc: (n) => `Gana ${n} partidas`, tiers: [1, 10, 50, 200, 1000], gems: [5, 10, 25, 50, 100], icon: '🏆', value: (p) => p.stats.wins },
  { id: 's180', name: '¡Ciento ochenta!', desc: (n) => `Consigue ${n} veces 180`, tiers: [1, 5, 25, 100], gems: [20, 30, 60, 150], icon: '💥', value: (p) => p.stats.s180 },
  { id: 'bulls', name: 'Ojo de Toro', desc: (n) => `Acierta ${n} bulls`, tiers: [5, 50, 250, 1000], gems: [5, 15, 40, 100], icon: '🔴', value: (p) => p.stats.bulls },
  { id: 'trebles', name: 'Francotirador', desc: (n) => `Acierta ${n} triples`, tiers: [25, 250, 1000, 5000], gems: [5, 15, 40, 100], icon: '✴️', value: (p) => p.stats.trebles },
  { id: 'checkout', name: 'Gran Cierre', desc: (n) => `Cierra una partida desde ${n} o más`, tiers: [50, 100, 140, 170], gems: [10, 25, 60, 200], icon: '✅', value: (p) => p.stats.bestCheckout },
  { id: 'arena', name: 'Escalador', desc: (n) => `Alcanza la arena ${n + 1}`, tiers: [1, 2, 3, 4, 5, 6], gems: [10, 20, 30, 50, 80, 150], icon: '🏟️', value: (p) => arenaForTrophies(p.bestTrophies) },
  { id: 'collector', name: 'Coleccionista', desc: (n) => `Consigue ${n} objetos distintos`, tiers: [6, 15, 30, 50], gems: [10, 25, 50, 120], icon: '🗂️', value: (p) => Object.keys(p.items).length },
  { id: 'level', name: 'Veterano', desc: (n) => `Llega al nivel ${n}`, tiers: [5, 10, 20, 35, 50], gems: [10, 20, 40, 80, 150], icon: '⭐', value: (p) => p.level },
  { id: 'streak', name: 'Imparable', desc: (n) => `Gana ${n} partidas seguidas`, tiers: [3, 5, 10, 20], gems: [10, 20, 50, 120], icon: '🔥', value: (p) => p.stats.bestStreak },
  { id: 'online', name: 'Rey del Online', desc: (n) => `Gana ${n} partidas online`, tiers: [1, 10, 50, 200], gems: [10, 25, 60, 150], icon: '🌐', value: (p) => p.stats.onlineWins },
  { id: 'chests', name: 'Cazatesoros', desc: (n) => `Abre ${n} cofres`, tiers: [5, 25, 100, 500], gems: [5, 15, 40, 100], icon: '🎁', value: (p) => p.stats.chestsOpened },
  { id: 'tournament', name: 'Campeón', desc: (n) => `Gana ${n} torneos`, tiers: [1, 5, 20, 50], gems: [20, 40, 80, 200], icon: '🥇', value: (p) => p.stats.tournamentsWon },
  { id: 'upgrades', name: 'Mecánico', desc: (n) => `Mejora objetos ${n} veces`, tiers: [5, 25, 100, 300], gems: [5, 15, 40, 100], icon: '🔧', value: (p) => p.stats.upgrades },
  { id: 'avg', name: 'Media de profesional', desc: (n) => `Termina una partida con media de ${n}+`, tiers: [40, 60, 80, 100], gems: [10, 25, 60, 150], icon: '📈', value: (p) => p.stats.bestAvg },
];

/** Logros con recompensa pendiente de reclamar. */
export function claimableAchievements(p: Profile): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => {
    const claimed = p.achievements[a.id] ?? 0;
    return claimed < a.tiers.length && a.value(p) >= a.tiers[claimed];
  });
}

// ---------------------------------------------------------------- Pase de temporada

export const SEASON_EPOCH = Date.UTC(2026, 0, 1);
export const SEASON_DAYS = 30;
export const SEASON_TIERS = 35;
export const SEASON_XP_PER_TIER = 120;

export function currentSeason(now = Date.now()): { id: number; endsAt: number } {
  const len = SEASON_DAYS * 86400000;
  const id = Math.floor((now - SEASON_EPOCH) / len) + 1;
  return { id, endsAt: SEASON_EPOCH + id * len };
}

export interface SeasonTier {
  free: Reward;
  premium: Reward;
}

export function seasonTiers(): SeasonTier[] {
  const tiers: SeasonTier[] = [];
  for (let i = 1; i <= SEASON_TIERS; i++) {
    let free: Reward;
    let premium: Reward;
    if (i % 5 === 0) free = { chest: i % 10 === 0 ? 'gold' : 'silver' };
    else if (i % 3 === 0) free = { gems: 10 };
    else free = { coins: 80 + i * 20 };
    if (i === 10) premium = { item: 'avatar:hat:cowboy' };
    else if (i === 20) premium = { item: 'emote:king' };
    else if (i === 30) premium = { item: 'f_season1' };
    else if (i === SEASON_TIERS) premium = { chest: 'legendary', item: 'board:inferno' };
    else if (i % 5 === 0) premium = { chest: 'epic' };
    else if (i % 2 === 0) premium = { gems: 25 };
    else premium = { coins: 250 + i * 40, chest: i % 3 === 0 ? 'gold' : undefined };
    tiers.push({ free, premium });
  }
  return tiers;
}

export function seasonTier(xp: number): number {
  return Math.min(SEASON_TIERS, Math.floor(xp / SEASON_XP_PER_TIER));
}

// ---------------------------------------------------------------- Recompensa diaria (7 días)

export const DAILY_REWARDS: Reward[] = [
  { coins: 100 },
  { gems: 5 },
  { chest: 'silver' },
  { coins: 400 },
  { gems: 15 },
  { chest: 'gold' },
  { gems: 40, chest: 'epic' },
];

// ---------------------------------------------------------------- Ruleta de la suerte

export interface WheelPrize {
  label: string;
  reward: Reward;
  weight: number;
  color: string;
}

export const WHEEL: WheelPrize[] = [
  { label: '50', reward: { coins: 50 }, weight: 26, color: '#ff4d6d' },
  { label: '5💎', reward: { gems: 5 }, weight: 10, color: '#3f9bff' },
  { label: '150', reward: { coins: 150 }, weight: 18, color: '#ffb31a' },
  { label: 'Cofre', reward: { chest: 'wood' }, weight: 16, color: '#8a5528' },
  { label: '400', reward: { coins: 400 }, weight: 10, color: '#11a86a' },
  { label: '20💎', reward: { gems: 20 }, weight: 5, color: '#b051ff' },
  { label: 'Plata', reward: { chest: 'silver' }, weight: 9, color: '#9aa3ad' },
  { label: '1000', reward: { coins: 1000 }, weight: 6, color: '#ff6a00' },
];

export function spinWheel(rnd = Math.random): number {
  const total = WHEEL.reduce((a, w) => a + w.weight, 0);
  let x = rnd() * total;
  for (let i = 0; i < WHEEL.length; i++) {
    x -= WHEEL[i].weight;
    if (x <= 0) return i;
  }
  return 0;
}

// ---------------------------------------------------------------- Desafío diario

export interface ChallengeDef {
  id: string;
  name: string;
  desc: string;
  darts: number;
  stars: [number, number, number];
  rewards: Reward[];
  score: (hits: { ring: string; num: number; points: number }[]) => number;
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'score9', name: 'Máxima en 9 dardos', desc: 'Suma todos los puntos que puedas con 9 dardos.', darts: 9, stars: [150, 250, 360], rewards: [{ coins: 150 }, { gems: 10 }, { gems: 25, chest: 'silver' }], score: (h) => h.reduce((a, x) => a + x.points, 0) },
  { id: 'bulls', name: 'Caza del Bull', desc: 'Acierta el bull en 12 dardos. El 50 cuenta doble.', darts: 12, stars: [2, 4, 7], rewards: [{ coins: 150 }, { gems: 10 }, { gems: 25, chest: 'silver' }], score: (h) => h.reduce((a, x) => a + (x.ring === 'DB' ? 2 : x.ring === 'SB' ? 1 : 0), 0) },
  { id: 't20', name: 'Tormenta de T20', desc: 'Acierta todos los triples del 20 que puedas en 12 dardos.', darts: 12, stars: [1, 3, 5], rewards: [{ coins: 150 }, { gems: 10 }, { gems: 25, chest: 'silver' }], score: (h) => h.filter((x) => x.ring === 'T' && x.num === 20).length },
  { id: 'doubles', name: 'Ronda de Dobles', desc: 'Acierta cualquier doble. 15 dardos.', darts: 15, stars: [2, 4, 7], rewards: [{ coins: 150 }, { gems: 10 }, { gems: 25, chest: 'silver' }], score: (h) => h.filter((x) => x.ring === 'D' || x.ring === 'DB').length },
];

export function todaysChallenge(day = dayKey()): ChallengeDef {
  return CHALLENGES[hashStr(day) % CHALLENGES.length];
}
