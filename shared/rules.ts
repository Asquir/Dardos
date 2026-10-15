// Reglas de juego: X01 (301/501), Cricket, Alrededor del Reloj y Práctica libre.
// Funciones puras: el servidor las usa como árbitro en las partidas online.

import type { Hit } from './board';

export type ModeId = 'x01' | 'cricket' | 'atc' | 'free';

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

function newPlayer(cfg: Required<MatchConfig>): PlayerState {
  return {
    remaining: cfg.mode === 'x01' ? cfg.start : cfg.mode === 'atc' ? 1 : 0,
    legs: 0,
    darts: 0,
    scored: 0,
    marks: [0, 0, 0, 0, 0, 0, 0],
    points: 0,
    turnStart: cfg.mode === 'x01' ? cfg.start : 0,
    best: 0,
    tons: 0,
    max180: 0,
    checkoutBest: 0,
    bulls: 0,
    trebles: 0,
    doubles: 0,
  };
}

export function normalizeConfig(c: MatchConfig): Required<MatchConfig> {
  return {
    mode: c.mode,
    start: c.start ?? 501,
    doubleOut: c.doubleOut ?? true,
    legsToWin: c.legsToWin ?? 1,
    maxTurns: c.maxTurns ?? (c.mode === 'cricket' ? 20 : 0),
  };
}

export function createMatch(cfg: MatchConfig, numPlayers: number, starter = 0): MatchState {
  const config = normalizeConfig(cfg);
  return {
    config,
    players: Array.from({ length: numPlayers }, () => newPlayer(config)),
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
    p.points = 0;
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
  s.current = (s.current + 1) % s.players.length;
  if (s.current === s.legStarter) s.turnNo++;
  s.players[s.current].turnStart = s.players[s.current].remaining;
  return total;
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
            p.points += pts;
            p.scored += pts;
          }
          p.marks[idx] = Math.min(p.marks[idx] + m, 9); // marcas extra (visual)
        }
      }
      const closedAll = p.marks.every((m) => m >= 3);
      const leads = s.players.every((o, i) => i === s.current || p.points >= o.points);
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
  }

  if (s.turn.length >= 3) {
    const total = endTurn(s, false);
    if (s.config.maxTurns > 0 && s.turnNo >= s.config.maxTurns && s.current === s.legStarter) {
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
        if (a.points > b.points || (a.points === b.points && ma > mb)) best = i;
        break;
      }
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
