// Reglas de juego: X01 (301/501), Cricket, Alrededor del Reloj, Killer, Shanghái, Halve-It,
// Bob's 27, Béisbol y Práctica libre.
// Funciones puras: el servidor las usa como árbitro en las partidas online.

import type { Hit } from './board';

export type ModeId = 'x01' | 'cricket' | 'atc' | 'free' | 'killer' | 'shanghai' | 'halveit' | 'bobs27' | 'baseball' | 'c121' | 'duel9';

/** Modos por rondas: cada ronda tiene su objetivo y al final gana quien más puntos tenga. */
export const ROUND_MODES: ModeId[] = ['shanghai', 'halveit', 'bobs27', 'baseball', 'duel9'];

/** Objetivos de Halve-It por ronda: número, cualquier doble (D), cualquier triple (T) o el bull (B). */
export const HALVEIT_TARGETS = ['15', '16', 'D', '17', '18', 'T', '19', '20', 'B'] as const;

/** 121 Checkout: intentos por partida y dardos por intento. */
export const C121_ATTEMPTS = 10;
export const C121_DARTS = 9;

/** Vidas iniciales en Killer. */
export const KILLER_LIVES = 3;
/** Marcas en tu número para convertirte en Killer (simple 1, doble 2, triple 3). */
export const KILLER_MARKS = 3;

export interface MatchConfig {
  mode: ModeId;
  /** puntos iniciales en X01 */
  start?: number;
  /** cerrar con doble (X01) */
  doubleOut?: boolean;
  /** legs necesarios para ganar el partido */
  legsToWin?: number;
  /** límite de turnos (0 = sin límite). En cricket/práctica termina la partida. */
  maxTurns?: number;
  /** semilla para lo que se sortea al empezar (números de Killer) */
  seed?: number;
  /** Cricket «Cut-Throat»: los puntos se los come el rival y gana quien menos tenga */
  cutthroat?: boolean;
}

export interface PlayerState {
  remaining: number; // X01: puntos restantes; ATC: objetivo actual (1..21, 21=bull, 22=terminado)
  legs: number;
  darts: number; // dardos lanzados en el partido
  scored: number; // puntos sumados (para la media)
  marks: number[]; // cricket: marcas por número [15..20, bull]
  points: number; // cricket: puntos
  turnStart: number;
  best: number; // mejor turno
  tons: number; // turnos de 100+
  max180: number;
  checkoutBest: number;
  bulls: number;
  trebles: number;
  doubles: number;
  /** Killer: vidas que le quedan */
  lives: number;
  /** Killer: su número (1-20) */
  num: number;
  /** Killer: marcas en su número; con KILLER_MARKS ya puede quitar vidas */
  killerMarks: number;
  /** 121 Checkout: número a cerrar, casa segura, dardos del intento e intentos hechos */
  target: number;
  safe: number;
  att: number;
  attempts: number;
}

export interface MatchState {
  config: Required<MatchConfig>;
  players: PlayerState[];
  current: number;
  turn: Hit[];
  turnNo: number; // turnos completos del jugador actual en este leg
  legStarter: number;
  winner: number | null;
  legWinner: number | null;
  history: { player: number; hits: Hit[]; total: number; bust: boolean }[];
}

export type ThrowEvent = 'dart' | 'bust' | 'turnEnd' | 'legWon' | 'matchWon';

export interface ThrowResult {
  state: MatchState;
  event: ThrowEvent;
  /** puntos del turno al terminarlo */
  turnTotal: number;
}

export const CRICKET_NUMS = [15, 16, 17, 18, 19, 20, 25];

function startPoints(mode: ModeId): number {
  return mode === 'bobs27' ? 27 : mode === 'halveit' ? 40 : 0;
}

function newPlayer(cfg: Required<MatchConfig>): PlayerState {
  const c121 = cfg.mode === 'c121';
  return {
    remaining: cfg.mode === 'x01' ? cfg.start : cfg.mode === 'atc' ? 1 : c121 ? 121 : 0,
    legs: 0,
    darts: 0,
    scored: 0,
    marks: [0, 0, 0, 0, 0, 0, 0],
    points: startPoints(cfg.mode),
    turnStart: cfg.mode === 'x01' ? cfg.start : c121 ? 121 : 0,
    best: 0,
    tons: 0,
    max180: 0,
    checkoutBest: 0,
    bulls: 0,
    trebles: 0,
    doubles: 0,
    lives: cfg.mode === 'killer' ? KILLER_LIVES : 0,
    num: 0,
    killerMarks: 0,
    target: 121,
    safe: 121,
    att: 0,
    attempts: 0,
  };
}

/** Rondas de cada modo por rondas (0 = sin límite). */
export function defaultRounds(mode: ModeId): number {
  switch (mode) {
    case 'cricket':
      return 20;
    case 'shanghai':
      return 7;
    case 'halveit':
      return HALVEIT_TARGETS.length;
    case 'bobs27':
      return 21;
    case 'baseball':
      return 9;
    case 'killer':
      return 30;
    case 'duel9':
      return 3;
    default:
      return 0;
  }
}

/**
 * Objetivo de la ronda actual en los modos por rondas: "S7" (cualquier zona del 7), "D16"…
 * Halve-It usa también "DANY" (cualquier doble), "TANY" (cualquier triple) y "BULL".
 */
export function roundTarget(s: MatchState): string | null {
  const r = s.turnNo;
  switch (s.config.mode) {
    case 'shanghai':
    case 'baseball':
      return 'S' + Math.min(20, r + 1);
    case 'bobs27':
      return r >= 20 ? 'DB' : 'D' + (r + 1);
    case 'duel9':
      return 'S' + duelNumbers(s.config.seed)[Math.min(2, r)];
    case 'halveit': {
      const t = HALVEIT_TARGETS[Math.min(r, HALVEIT_TARGETS.length - 1)];
      return t === 'D' ? 'DANY' : t === 'T' ? 'TANY' : t === 'B' ? 'BULL' : 'S' + t;
    }
    default:
      return null;
  }
}

/** ¿Vale el dardo para el objetivo de la ronda? */
export function hitsRoundTarget(target: string, h: Hit): boolean {
  if (h.ring === 'MISS') return false;
  if (target === 'DANY') return h.ring === 'D' || h.ring === 'DB';
  if (target === 'TANY') return h.ring === 'T';
  if (target === 'BULL') return h.ring === 'SB' || h.ring === 'DB';
  if (target === 'DB') return h.ring === 'DB';
  const n = parseInt(target.slice(1), 10);
  if (target[0] === 'D') return h.ring === 'D' && h.num === n;
  return h.num === n && (h.ring === 'S' || h.ring === 'D' || h.ring === 'T');
}

/** Números distintos de Killer, sorteados con la semilla de la partida. */
function killerNumbers(n: number, seed: number): number[] {
  const pool = Array.from({ length: 20 }, (_, i) => i + 1);
  let a = (seed >>> 0) || 1;
  const rnd = () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/** Números que valen doble en cada turno del Duelo de 9 dardos (los mismos para todos con la misma semilla). */
export function duelNumbers(seed: number): number[] {
  return killerNumbers(3, (seed ^ 0x5bd1e995) >>> 0);
}

/** ¿Sigue vivo en la partida? (en Killer, mientras le queden vidas) */
export function isAlive(s: MatchState, i: number): boolean {
  return s.config.mode !== 'killer' || s.players[i].lives > 0;
}

export function normalizeConfig(c: MatchConfig): Required<MatchConfig> {
  return {
    mode: c.mode,
    start: c.start ?? 501,
    doubleOut: c.doubleOut ?? true,
    legsToWin: c.legsToWin ?? 1,
    maxTurns: c.maxTurns ?? defaultRounds(c.mode),
    seed: c.seed ?? 1,
    cutthroat: c.mode === 'cricket' && !!c.cutthroat,
  };
}

export function createMatch(cfg: MatchConfig, numPlayers: number, starter = 0): MatchState {
  const config = normalizeConfig(cfg);
  const players = Array.from({ length: numPlayers }, () => newPlayer(config));
  if (config.mode === 'killer') killerNumbers(numPlayers, config.seed).forEach((n, i) => (players[i].num = n));
  return {
    config,
    players,
    current: starter,
    turn: [],
    turnNo: 0,
    legStarter: starter,
    winner: null,
    legWinner: null,
    history: [],
  };
}

function clone(s: MatchState): MatchState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, marks: [...p.marks] })),
    turn: [...s.turn],
    history: s.history.slice(-40),
  };
}

function resetLeg(s: MatchState) {
  const starter = (s.legStarter + 1) % s.players.length;
  s.legStarter = starter;
  s.current = starter;
  s.turnNo = 0;
  for (const p of s.players) {
    const fresh = newPlayer(s.config);
    p.remaining = fresh.remaining;
    p.turnStart = fresh.turnStart;
    p.marks = fresh.marks;
    p.points = fresh.points;
    p.lives = fresh.lives;
    p.killerMarks = 0;
    p.target = fresh.target;
    p.safe = fresh.safe;
    p.att = 0;
    p.attempts = 0;
  }
}

function endTurn(s: MatchState, bust: boolean): number {
  const p = s.players[s.current];
  const total = bust ? 0 : s.turn.reduce((a, h) => a + h.points, 0);
  s.history.push({ player: s.current, hits: s.turn, total, bust });
  if (s.config.mode === 'x01' && !bust) {
    p.best = Math.max(p.best, total);
    if (total >= 100) p.tons++;
    if (total === 180) p.max180++;
  }
  s.turn = [];
  advance(s);
  return total;
}

/** Pasa al siguiente jugador (en Killer se salta a los eliminados). */
function advance(s: MatchState) {
  for (let k = 0; k < s.players.length; k++) {
    s.current = (s.current + 1) % s.players.length;
    if (s.current === s.legStarter) s.turnNo++;
    if (isAlive(s, s.current)) break;
  }
  s.players[s.current].turnStart = s.players[s.current].remaining;
}

function countStats(p: PlayerState, h: Hit) {
  p.darts++;
  if (h.ring === 'DB') p.bulls++;
  if (h.ring === 'T') p.trebles++;
  if (h.ring === 'D' || h.ring === 'DB') p.doubles++;
}

function winLeg(s: MatchState, who: number): ThrowEvent {
  s.players[who].legs++;
  s.legWinner = who;
  s.history.push({ player: who, hits: s.turn, total: s.turn.reduce((a, h) => a + h.points, 0), bust: false });
  s.turn = [];
  if (s.players[who].legs >= s.config.legsToWin) {
    s.winner = who;
    return 'matchWon';
  }
  resetLeg(s);
  return 'legWon';
}

/** Aplica un dardo al estado. Devuelve un estado nuevo (no muta el original). */
export function applyThrow(prev: MatchState, hit: Hit): ThrowResult {
  if (prev.winner !== null) return { state: prev, event: 'matchWon', turnTotal: 0 };
  const s = clone(prev);
  s.legWinner = null;
  const p = s.players[s.current];
  s.turn.push(hit);
  countStats(p, hit);
  const turnSum = () => s.turn.reduce((a, h) => a + h.points, 0);

  switch (s.config.mode) {
    case 'x01': {
      const after = p.remaining - hit.points;
      const isDouble = hit.ring === 'D' || hit.ring === 'DB';
      const bust = after < 0 || (s.config.doubleOut && (after === 1 || (after === 0 && !isDouble)));
      if (bust) {
        p.scored -= p.turnStart - p.remaining; // anula lo sumado este turno
        p.remaining = p.turnStart;
        const total = endTurn(s, true);
        return { state: s, event: 'bust', turnTotal: total };
      }
      p.remaining = after;
      p.scored += hit.points;
      if (after === 0) {
        const t = turnSum();
        p.best = Math.max(p.best, t);
        if (t >= 100) p.tons++;
        if (t === 180) p.max180++;
        p.checkoutBest = Math.max(p.checkoutBest, p.turnStart);
        const ev = winLeg(s, s.current);
        return { state: s, event: ev, turnTotal: t };
      }
      break;
    }
    case 'cricket': {
      const idx = CRICKET_NUMS.indexOf(hit.num);
      if (idx >= 0 && hit.mult > 0) {
        let m = hit.mult;
        const need = Math.max(0, 3 - p.marks[idx]);
        const used = Math.min(m, need);
        p.marks[idx] += used;
        m -= used;
        if (m > 0) {
          const othersOpen = s.players.some((o, i) => i !== s.current && o.marks[idx] < 3);
          if (othersOpen) {
            const pts = m * (hit.num === 25 ? 25 : hit.num);
            if (s.config.cutthroat) {
              // Cut-Throat: los puntos van a los rivales que aún no han cerrado ese número
              s.players.forEach((o, i) => {
                if (i !== s.current && o.marks[idx] < 3) o.points += pts;
              });
            } else p.points += pts;
            p.scored += pts;
          }
          p.marks[idx] = Math.min(p.marks[idx] + m, 9); // marcas extra (visual)
        }
      }
      const closedAll = p.marks.every((m) => m >= 3);
      const leads = s.players.every((o, i) => i === s.current || (s.config.cutthroat ? p.points <= o.points : p.points >= o.points));
      if (closedAll && leads) return { state: s, event: winLeg(s, s.current), turnTotal: turnSum() };
      break;
    }
    case 'atc': {
      const target = p.remaining;
      const ok = target <= 20 ? hit.num === target && hit.ring !== 'SB' && hit.ring !== 'DB' : hit.ring === 'SB' || hit.ring === 'DB';
      if (ok) {
        p.remaining++;
        p.scored++;
      }
      if (p.remaining > 21) return { state: s, event: winLeg(s, s.current), turnTotal: turnSum() };
      break;
    }
    case 'free':
      p.scored += hit.points;
      break;
    case 'shanghai':
    case 'baseball': {
      const target = roundTarget(s)!;
      if (hitsRoundTarget(target, hit)) {
        // Shanghái: puntos del número por su multiplicador; Béisbol: carreras = multiplicador
        const pts = s.config.mode === 'shanghai' ? hit.points : hit.mult;
        p.points += pts;
        p.scored += pts;
      }
      // ¡Shanghái!: simple, doble y triple del número de la ronda en el mismo turno = victoria
      if (s.config.mode === 'shanghai' && s.turn.length === 3) {
        const n = parseInt(target.slice(1), 10);
        const rings = new Set(s.turn.filter((h) => h.num === n).map((h) => h.ring));
        if (rings.has('S') && rings.has('D') && rings.has('T')) return { state: s, event: winLeg(s, s.current), turnTotal: turnSum() };
      }
      break;
    }
    case 'halveit': {
      const target = roundTarget(s)!;
      if (hitsRoundTarget(target, hit)) {
        p.points += hit.points;
        p.scored += hit.points;
      }
      break;
    }
    case 'duel9': {
      // todo suma; el número del turno vale doble
      const pts = hit.points * (hitsRoundTarget(roundTarget(s)!, hit) ? 2 : 1);
      p.points += pts;
      p.scored += pts;
      break;
    }
    case 'bobs27': {
      const target = roundTarget(s)!;
      if (hitsRoundTarget(target, hit)) {
        p.points += hit.points;
        p.scored += hit.points;
      }
      break;
    }
    case 'c121': {
      // como un X01 con doble para cerrar, pero con 9 dardos por intento
      p.att++;
      const after = p.remaining - hit.points;
      const isDouble = hit.ring === 'D' || hit.ring === 'DB';
      const bust = after < 0 || after === 1 || (after === 0 && !isDouble);
      if (bust) {
        p.att = Math.min(C121_DARTS, p.att + (3 - s.turn.length)); // los dardos del turno se pierden
        p.remaining = p.turnStart;
      } else {
        p.remaining = after;
        p.scored += hit.points;
      }
      const cleared = !bust && after === 0;
      const failed = !cleared && p.att >= C121_DARTS;
      if (cleared || failed) {
        const t = turnSum();
        if (cleared) {
          // ¡cerrado!: el número pasa a ser la casa segura y se sube uno
          p.points = Math.max(p.points, p.target);
          p.checkoutBest = Math.max(p.checkoutBest, p.target);
          p.safe = p.target;
          p.target++;
        } else p.target = p.safe; // fallado: de vuelta a la casa segura
        p.attempts++;
        p.att = 0;
        p.remaining = p.target;
        const total = endTurn(s, bust);
        p.turnStart = p.remaining;
        if (p.attempts >= C121_ATTEMPTS) return { state: s, event: winLeg(s, s.legWinner ?? 0), turnTotal: cleared ? t : total };
        return { state: s, event: bust ? 'bust' : 'turnEnd', turnTotal: cleared ? t : total };
      }
      if (bust) {
        const total = endTurn(s, true);
        return { state: s, event: 'bust', turnTotal: total };
      }
      break;
    }
    case 'killer': {
      if (hit.mult > 0 && hit.num >= 1 && hit.num <= 20) {
        if (hit.num === p.num) {
          // tu número: sumas marcas hasta ser Killer
          p.killerMarks = Math.min(KILLER_MARKS, p.killerMarks + hit.mult);
        } else if (p.killerMarks >= KILLER_MARKS) {
          const victim = s.players.findIndex((o, i) => i !== s.current && o.num === hit.num && o.lives > 0);
          if (victim >= 0) {
            const v = s.players[victim];
            v.lives = Math.max(0, v.lives - hit.mult);
            p.scored += hit.mult;
          }
        }
      }
      const alive = s.players.map((_, i) => i).filter((i) => isAlive(s, i));
      if (alive.length <= 1) return { state: s, event: winLeg(s, alive[0] ?? s.current), turnTotal: turnSum() };
      break;
    }
  }

  if (s.turn.length >= 3) {
    // reglas de fin de ronda
    if (s.config.mode === 'halveit' || s.config.mode === 'bobs27') {
      const target = roundTarget(s)!;
      const any = s.turn.some((h) => hitsRoundTarget(target, h));
      if (!any) {
        if (s.config.mode === 'halveit') p.points = Math.floor(p.points / 2);
        else {
          // Bob's 27: sin acertar el doble se resta su valor
          const n = target === 'DB' ? 25 : parseInt(target.slice(1), 10);
          p.points -= n * 2;
        }
      }
      // Bob's 27 en solitario: a cero o menos se acaba la partida
      if (s.config.mode === 'bobs27' && p.points <= 0 && s.players.length === 1) {
        const total = endTurn(s, false);
        return { state: s, event: winLeg(s, 0), turnTotal: total };
      }
    }
    const total = endTurn(s, false);
    if (s.config.maxTurns > 0 && s.turnNo >= s.config.maxTurns && (s.current === s.legStarter || !isAlive(s, s.legStarter))) {
      // límite de turnos alcanzado: gana quien vaya mejor
      const w = leaderIndex(s);
      return { state: s, event: winLeg(s, w), turnTotal: total };
    }
    return { state: s, event: 'turnEnd', turnTotal: total };
  }
  return { state: s, event: 'dart', turnTotal: turnSum() };
}

/** Jugador que va ganando según el modo. */
export function leaderIndex(s: MatchState): number {
  let best = 0;
  for (let i = 1; i < s.players.length; i++) {
    const a = s.players[i];
    const b = s.players[best];
    switch (s.config.mode) {
      case 'x01':
        if (a.remaining < b.remaining) best = i;
        break;
      case 'cricket': {
        const ma = a.marks.reduce((x, m) => x + Math.min(m, 3), 0);
        const mb = b.marks.reduce((x, m) => x + Math.min(m, 3), 0);
        const better = s.config.cutthroat ? a.points < b.points : a.points > b.points;
        if (better || (a.points === b.points && ma > mb)) best = i;
        break;
      }
      case 'killer':
        if (a.lives > b.lives || (a.lives === b.lives && a.killerMarks > b.killerMarks)) best = i;
        break;
      case 'shanghai':
      case 'halveit':
      case 'bobs27':
      case 'baseball':
      case 'c121':
      case 'duel9':
        if (a.points > b.points) best = i;
        break;
      default:
        if (a.scored > b.scored) best = i;
    }
  }
  return best;
}

/** Fuerza el final de un turno (p. ej. por tiempo agotado). Los dardos que falten cuentan como fallo. */
export function forfeitTurn(prev: MatchState, missHit: (n: number) => Hit): ThrowResult {
  let res: ThrowResult = { state: prev, event: 'dart', turnTotal: 0 };
  const left = 3 - prev.turn.length;
  for (let i = 0; i < left; i++) {
    res = applyThrow(res.state, missHit(i));
    if (res.event !== 'dart') break;
  }
  return res;
}

/** Media de 3 dardos. */
export function threeDartAvg(p: PlayerState): number {
  return p.darts ? (p.scored / p.darts) * 3 : 0;
}
