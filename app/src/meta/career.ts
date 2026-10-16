// Carrera profesional: una gira de 8 torneos con ranking mundial, rivales fijos que se repiten,
// premios en metálico y unas Finales para los 8 mejores. Gratis: no cuesta entrada (los torneos de
// pago son una de las quejas más repetidas en los juegos de dardos).

import { makeBot, rng } from '@shared/bot';
import type { MatchConfig } from '@shared/rules';
import { ARENAS, arenaForTrophies } from './arenas';
import { arenaMult, type ChestType } from './chests';
import { mutate, profile } from './profile';
import type { Reward } from './chests';
import type { PostMatch } from './postmatch';

export interface TourStop {
  name: string;
  icon: string;
  arena: number;
  config: MatchConfig;
  /** legs para ganar en cuartos, semifinal y final */
  legs: [number, number, number];
  /** solo los 8 primeros del ranking */
  finals?: boolean;
}

export const TOUR: TourStop[] = [
  { name: 'Open de Valencia', icon: '🍊', arena: 0, config: { mode: 'x01', start: 301, doubleOut: true }, legs: [1, 1, 2] },
  { name: 'Masters de Bilbao', icon: '⚓', arena: 1, config: { mode: 'x01', start: 501, doubleOut: true }, legs: [1, 1, 2] },
  { name: 'Clásico de Cricket de Zaragoza', icon: '🦗', arena: 2, config: { mode: 'cricket' }, legs: [1, 1, 1] },
  { name: 'Grand Prix de Sevilla', icon: '💃', arena: 3, config: { mode: 'x01', start: 301, doubleOut: true }, legs: [1, 2, 2] },
  { name: 'Abierto de Barcelona', icon: '🏖️', arena: 3, config: { mode: 'x01', start: 501, doubleOut: true }, legs: [1, 1, 2] },
  { name: 'Matchplay de Madrid', icon: '🐻', arena: 4, config: { mode: 'x01', start: 501, doubleOut: true }, legs: [1, 2, 2] },
  { name: 'Grand Slam de Canarias', icon: '🌋', arena: 5, config: { mode: 'x01', start: 501, doubleOut: true }, legs: [1, 2, 3] },
  { name: 'Finales Diana Legends', icon: '👑', arena: 6, config: { mode: 'x01', start: 501, doubleOut: true }, legs: [2, 2, 3], finals: true },
];

export const CAREER_ROUNDS = ['Cuartos de final', 'Semifinal', 'Gran Final'];
/** puntos de ranking según hasta dónde se llega: cuartos, semis, final, campeón */
export const CAREER_POINTS = [15, 35, 60, 100];
const PRIZE_MULT = [1, 2.5, 5, 10];
const PROS = 31;

export interface CareerPro {
  name: string;
  /** 0 = el mejor del circuito, 1 = el más flojo */
  rating: number;
  seed: number;
  pts: number;
}

export interface CareerState {
  season: number;
  /** parada actual de la gira (TOUR.length = temporada terminada) */
  stop: number;
  pros: CareerPro[];
  pts: number;
  earnings: number;
  titles: number;
  /** resultado en cada parada: hasta qué ronda llegó (0 cuartos… 3 campeón; -1 no se clasificó) */
  results: number[];
  /** cuadro de la parada en curso: índices de pros (-1 = tú) */
  bracket: number[] | null;
  /** vivos al empezar cada ronda (posiciones del cuadro) */
  rounds: number[][];
  round: number;
  alive: boolean;
  /** premios de fin de temporada ya entregados */
  seasonPaid?: boolean;
}

/** Arena de referencia para la dificultad: la del jugador, para que la gira crezca con él. */
function playerArena(): number {
  return arenaForTrophies(profile().bestTrophies);
}

/** Dispersión (mm) de un profesional según su nivel y la arena del jugador. */
export function proSigma(rating: number, stopArena: number): number {
  const a = ARENAS[Math.min(ARENAS.length - 1, Math.max(playerArena(), stopArena))];
  const [best, worst] = a.botSigma;
  // los mejores del circuito afinan un poco más que la arena
  return best * 0.85 + rating * (worst * 1.05 - best * 0.85);
}

export function newCareer(season = 1, prev?: CareerState): CareerState {
  const seed = prev ? prev.pros[0].seed + season * 1013 : 7_000 + Math.floor(Math.random() * 100_000);
  const r = rng(seed);
  // el ranking arranca con los puntos de la pretemporada (los mejores, arriba); tú empiezas desde abajo
  const pre = (rating: number) => Math.round((1 - rating) * 90 + r() * 10);
  const pros: CareerPro[] = prev
    ? prev.pros.map((p) => {
        const rating = Math.min(1, Math.max(0, p.rating + (r() - 0.5) * 0.1));
        return { ...p, rating, pts: pre(rating) };
      })
    : Array.from({ length: PROS }, (_, i) => {
        const s = seed + i * 131;
        const rating = (i + r() * 0.6) / PROS;
        return { name: makeBot(s, 20, 1000).name, rating, seed: s, pts: pre(rating) };
      });
  return { season, stop: 0, pros, pts: 0, earnings: prev?.earnings ?? 0, titles: prev?.titles ?? 0, results: [], bracket: null, rounds: [], round: 0, alive: false };
}

/** Ranking actual: tú (índice -1) y los profesionales, de más a menos puntos. */
export function careerRanking(c: CareerState): { idx: number; name: string; pts: number }[] {
  const me = { idx: -1, name: profile().name, pts: c.pts };
  // a igualdad de puntos, el jugador va detrás (tiene que ganarse el puesto)
  return [me, ...c.pros.map((p, i) => ({ idx: i, name: p.name, pts: p.pts }))].sort((a, b) => b.pts - a.pts || (a.idx === -1 ? 1 : b.idx === -1 ? -1 : a.idx - b.idx));
}

export function careerRank(c: CareerState): number {
  return careerRanking(c).findIndex((x) => x.idx === -1) + 1;
}

export function prizeBase(): number {
  return Math.round((60 * arenaMult(playerArena())) / 10) * 10;
}

/** Monta el cuadro de la parada actual. En las Finales solo entran los 8 primeros. */
export function startStop(): { qualified: boolean } {
  let qualified = true;
  mutate((p) => {
    const c = p.career;
    if (!c || c.stop >= TOUR.length) return;
    const stop = TOUR[c.stop];
    const r = rng(c.pros[0].seed + c.stop * 7 + c.season * 31);
    let field: number[];
    if (stop.finals) {
      field = careerRanking(c)
        .slice(0, 8)
        .map((x) => x.idx);
      qualified = field.includes(-1);
    } else {
      // tú + 7 rivales: los mejores suelen estar, y siempre hay alguna sorpresa
      const pool = c.pros.map((_, i) => i).sort((a, b) => c.pros[a].rating + r() * 0.7 - (c.pros[b].rating + r() * 0.7));
      field = [-1, ...pool.slice(0, 7)];
    }
    // posiciones al azar en el cuadro
    for (let i = field.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [field[i], field[j]] = [field[j], field[i]];
    }
    c.bracket = field;
    c.rounds = [[0, 1, 2, 3, 4, 5, 6, 7]];
    c.round = 0;
    c.alive = qualified;
    if (!qualified) finishStop(c, -1, r);
  });
  return { qualified };
}

/** Rival del jugador en la ronda actual. */
export function currentOpponent(c: CareerState): CareerPro | null {
  if (!c.bracket || !c.alive) return null;
  const alive = c.rounds[c.round];
  const mePos = c.bracket.indexOf(-1);
  const k = alive.indexOf(mePos);
  if (k < 0) return null;
  const oppPos = alive[k % 2 === 0 ? k + 1 : k - 1];
  return c.pros[c.bracket[oppPos]] ?? null;
}

/** P(A gana a B) entre profesionales: a menor rating (mejor), más opciones. */
function beats(a: CareerPro, b: CareerPro, r: () => number): boolean {
  const sa = 0.35 + a.rating;
  const sb = 0.35 + b.rating;
  return r() < sb / (sa + sb);
}

/** Simula el resto de la parada (o la parada entera si el jugador no juega) y reparte puntos. */
function finishStop(c: CareerState, myRound: number, r: () => number) {
  const bracket = c.bracket!;
  // rondas que faltan entre profesionales
  while (c.rounds.length < 4) {
    const alive = c.rounds[c.rounds.length - 1];
    const next: number[] = [];
    for (let i = 0; i < alive.length; i += 2) {
      const a = alive[i];
      const b = alive[i + 1];
      const ia = bracket[a];
      const ib = bracket[b];
      if (ia === -1) next.push(myRound > c.rounds.length - 1 ? a : b);
      else if (ib === -1) next.push(myRound > c.rounds.length - 1 ? b : a);
      else next.push(beats(c.pros[ia], c.pros[ib], r) ? a : b);
    }
    c.rounds.push(next);
  }
  // puntos: hasta dónde llegó cada uno del cuadro
  bracket.forEach((who, pos) => {
    let reached = 0;
    for (let k = 1; k < 4; k++) if (c.rounds[k].includes(pos)) reached = k;
    if (who === -1) return;
    c.pros[who].pts += CAREER_POINTS[reached];
  });
  // los que no estaban en el cuadro también suman algo en otros torneos de la semana
  c.pros.forEach((p, i) => {
    if (!bracket.includes(i) && r() < 0.5 - p.rating * 0.3) p.pts += CAREER_POINTS[0];
  });
  c.results[c.stop] = myRound;
  c.round = 3;
  c.alive = false;
}

/** Tras cada partida de la carrera: avanza el cuadro, reparte premios y pasa de parada. */
export function applyCareer(won: boolean): PostMatch {
  let post: PostMatch = {};
  mutate((p) => {
    const c = p.career;
    if (!c || !c.bracket || !c.alive || c.stop >= TOUR.length) return;
    const r = rng(c.pros[0].seed + c.stop * 13 + c.round * 7 + c.season);
    const stop = TOUR[c.stop];
    const base = prizeBase();
    if (won && c.round < 2) {
      // a la siguiente ronda: se simulan los otros cruces de esta
      const alive = c.rounds[c.round];
      const mePos = c.bracket.indexOf(-1);
      const next: number[] = [];
      for (let i = 0; i < alive.length; i += 2) {
        const a = alive[i];
        const b = alive[i + 1];
        if (a === mePos || b === mePos) next.push(mePos);
        else next.push(beats(c.pros[c.bracket[a]], c.pros[c.bracket[b]], r) ? a : b);
      }
      c.rounds.push(next);
      c.round++;
      post = { toast: `¡A ${CAREER_ROUNDS[c.round].toLowerCase()} del ${stop.name}!`, good: true };
      return;
    }
    // la parada termina para el jugador: campeón o eliminado en esta ronda
    const reached = won ? 3 : c.round;
    finishStop(c, reached, r);
    const prize = Math.round((base * PRIZE_MULT[reached]) / 10) * 10;
    c.pts += CAREER_POINTS[reached];
    c.earnings += prize;
    p.coins += prize;
    if (reached === 3) c.titles++;
    const reward: Reward = { coins: prize };
    const title = reached === 3 ? `¡CAMPEÓN DEL ${stop.name.toUpperCase()}!` : reached === 2 ? 'Subcampeón' : reached === 1 ? 'Semifinalista' : 'Eliminado en cuartos';
    post = { title, reward, champion: reached === 3 };
    c.stop++;
    c.bracket = null;
    c.rounds = [];
    c.round = 0;
  });
  return post;
}

/** Salta a la siguiente parada cuando el jugador no se clasificó para las Finales. */
export function skipStop() {
  mutate((p) => {
    const c = p.career;
    if (!c || c.alive || c.round !== 3) return;
    c.stop++;
    c.bracket = null;
    c.rounds = [];
    c.round = 0;
  });
}

/** Premios de fin de temporada según el puesto final en el ranking. */
export function seasonReward(rank: number): Reward {
  if (rank === 1) return { gems: 120, chest: 'legendary' as ChestType, coins: prizeBase() * 20 };
  if (rank <= 3) return { gems: 60, chest: 'epic' as ChestType, coins: prizeBase() * 10 };
  if (rank <= 8) return { gems: 25, chest: 'gold' as ChestType, coins: prizeBase() * 5 };
  if (rank <= 16) return { gems: 10, chest: 'silver' as ChestType };
  return { coins: prizeBase() * 2 };
}

/** Cobra los premios de la temporada y empieza la siguiente. */
export function closeSeason(): { rank: number; reward: Reward } | null {
  const c = profile().career;
  if (!c || c.stop < TOUR.length) return null;
  const rank = careerRank(c);
  const reward = seasonReward(rank);
  mutate((p) => {
    p.coins += reward.coins ?? 0;
    p.gems += reward.gems ?? 0;
    if (reward.chest) p.pendingChests.push({ type: reward.chest, title: `Temporada ${c.season}: puesto ${rank}` });
    p.career = newCareer(c.season + 1, c);
  });
  return { rank, reward };
}
