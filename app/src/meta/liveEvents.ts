// Eventos en vivo: rotan cada 3 días con reglas de puntuación propias, entradas que se recargan,
// hitos con premios y un objeto exclusivo al completarlos.

import type { MatchConfig } from '@shared/rules';
import type { Reward } from './chests';
import { dayKey } from '../core/store';
import type { Profile } from './profile';

export const EVENT_DURATION = 3 * 86400_000;
/** Los eventos cambian a las 12:00 UTC. */
export const EVENT_EPOCH = Date.UTC(2026, 0, 2, 12);
export const MAX_TICKETS = 5;
export const TICKET_PERIOD = 40 * 60_000;
export const AD_TICKETS_PER_DAY = 3;
export const GEM_TICKET_PRICE = 15;

export interface EventScoring {
  win: number;
  lose: number;
  perBull?: number;
  perTreble?: number;
  perDouble?: number;
  perTon?: number;
  per180?: number;
  perCheckout?: number;
}

export interface LiveEventDef {
  id: string;
  name: string;
  tagline: string;
  desc: string;
  icon: string;
  colors: [string, string, string];
  config: MatchConfig;
  scoring: EventScoring;
  arena: number;
  exclusive: string; // objeto exclusivo del último hito
  exclusiveName: string;
}

export const LIVE_EVENTS: LiveEventDef[] = [
  {
    id: 'bull_fever',
    name: 'Fiebre del Bull',
    tagline: '¡Cada bull vale oro!',
    desc: '301 rápido. Cada acierto en el bull suma 15 puntos de evento y el 50 suma 30.',
    icon: '🔴',
    colors: ['#ff3d3d', '#b0002a', '#ffd23a'],
    config: { mode: 'x01', start: 301, doubleOut: false },
    scoring: { win: 60, lose: 20, perBull: 15 },
    arena: 1,
    exclusive: 'f_ev_bull',
    exclusiveName: 'Aleta «Ojo de Toro»',
  },
  {
    id: 'treble_night',
    name: 'Noche de Triples',
    tagline: 'Los triples brillan esta noche',
    desc: '501 en el Club Neón. Cada triple suma 8 puntos de evento.',
    icon: '✴️',
    colors: ['#8a2be2', '#2a0866', '#21e6ff'],
    config: { mode: 'x01', start: 501, doubleOut: true },
    scoring: { win: 60, lose: 20, perTreble: 8 },
    arena: 2,
    exclusive: 'f_ev_neon3',
    exclusiveName: 'Aleta «Triple Neón»',
  },
  {
    id: 'lightning_cup',
    name: 'Copa Relámpago',
    tagline: 'Partidas exprés de 101',
    desc: '101 sin doble obligatorio: rápidas e intensas. Ganar da muchos puntos.',
    icon: '⚡',
    colors: ['#1f6dff', '#0a1f66', '#ffe600'],
    config: { mode: 'x01', start: 101, doubleOut: false },
    scoring: { win: 90, lose: 25, perTon: 20 },
    arena: 4,
    exclusive: 'f_ev_thunder',
    exclusiveName: 'Aleta «Tormenta»',
  },
  {
    id: 'cricket_masters',
    name: 'Maestros del Cricket',
    tagline: 'Cierra los números antes que nadie',
    desc: 'Cricket contra la máquina. Cada triple suma 10 y ganar 70.',
    icon: '🦗',
    colors: ['#11a86a', '#05331f', '#d4ff3a'],
    config: { mode: 'cricket', maxTurns: 15 },
    scoring: { win: 70, lose: 20, perTreble: 10 },
    arena: 3,
    exclusive: 'f_ev_cricket',
    exclusiveName: 'Aleta «Rey del Cricket»',
  },
  {
    id: 'checkout_kings',
    name: 'Reyes del Cierre',
    tagline: 'Gana cerrando con dobles',
    desc: '501 con doble para cerrar. Cada doble suma 12 puntos; cerrar la partida suma 40 extra.',
    icon: '✅',
    colors: ['#ff9d00', '#5a2a00', '#fff3a0'],
    config: { mode: 'x01', start: 501, doubleOut: true },
    scoring: { win: 60, lose: 20, perDouble: 12, perCheckout: 40 },
    arena: 3,
    exclusive: 'f_ev_crown',
    exclusiveName: 'Aleta «Corona Dorada»',
  },
  {
    id: 'max_madness',
    name: 'Locura del 180',
    tagline: 'Busca el máximo',
    desc: '501 en la Gran Arena. Cada turno de 100+ suma 15 puntos y cada 180, ¡100!',
    icon: '💥',
    colors: ['#ff3d6a', '#3a0010', '#ff9d00'],
    config: { mode: 'x01', start: 501, doubleOut: true },
    scoring: { win: 60, lose: 20, perTon: 15, per180: 100 },
    arena: 4,
    exclusive: 'f_ev_inferno',
    exclusiveName: 'Aleta «Infierno 180»',
  },
];

/** Hitos (puntos acumulados) y su premio. El último es el objeto exclusivo. */
export function eventMilestones(def: LiveEventDef): { pts: number; reward: Reward }[] {
  return [
    { pts: 60, reward: { coins: 300 } },
    { pts: 150, reward: { gems: 10 } },
    { pts: 280, reward: { chest: 'silver' } },
    { pts: 450, reward: { coins: 1000 } },
    { pts: 650, reward: { gems: 25 } },
    { pts: 900, reward: { chest: 'gold' } },
    { pts: 1200, reward: { coins: 2500 } },
    { pts: 1550, reward: { gems: 50 } },
    { pts: 1950, reward: { chest: 'epic' } },
    { pts: 2400, reward: { item: def.exclusive, gems: 80 } },
  ];
}

export function currentLiveEvent(now = Date.now()) {
  const n = Math.floor((now - EVENT_EPOCH) / EVENT_DURATION);
  const def = LIVE_EVENTS[((n % LIVE_EVENTS.length) + LIVE_EVENTS.length) % LIVE_EVENTS.length];
  const startsAt = EVENT_EPOCH + n * EVENT_DURATION;
  const next = LIVE_EVENTS[(((n + 1) % LIVE_EVENTS.length) + LIVE_EVENTS.length) % LIVE_EVENTS.length];
  return { def, key: `${def.id}_${n}`, startsAt, endsAt: startsAt + EVENT_DURATION, next, nextAt: startsAt + EVENT_DURATION };
}

export interface LiveEventState {
  key: string;
  points: number;
  claimed: number[];
  tickets: number;
  ticketAt: number;
  adTickets: { day: string; count: number };
  played: number;
}

export function freshEventState(key: string, now = Date.now()): LiveEventState {
  return { key, points: 0, claimed: [], tickets: MAX_TICKETS, ticketAt: now, adTickets: { day: '', count: 0 }, played: 0 };
}

/** Regenera entradas con el paso del tiempo (muta el estado). */
export function regenTickets(s: LiveEventState, now = Date.now()) {
  if (s.tickets >= MAX_TICKETS) {
    s.ticketAt = now;
    return;
  }
  const gained = Math.floor((now - s.ticketAt) / TICKET_PERIOD);
  if (gained > 0) {
    s.tickets = Math.min(MAX_TICKETS, s.tickets + gained);
    s.ticketAt = s.tickets >= MAX_TICKETS ? now : s.ticketAt + gained * TICKET_PERIOD;
  }
}

export function nextTicketIn(s: LiveEventState, now = Date.now()): number {
  if (s.tickets >= MAX_TICKETS) return 0;
  return Math.max(0, s.ticketAt + TICKET_PERIOD - now);
}

export function adTicketsLeft(s: LiveEventState): number {
  return s.adTickets.day === dayKey() ? Math.max(0, AD_TICKETS_PER_DAY - s.adTickets.count) : AD_TICKETS_PER_DAY;
}

/** Puntos de evento de una partida. */
export function scoreEventMatch(
  def: LiveEventDef,
  won: boolean,
  stats: { bulls: number; dbulls: number; trebles: number; doubles: number; tons: number; s180: number; checkout: boolean },
): { total: number; lines: { label: string; pts: number }[] } {
  const sc = def.scoring;
  const lines: { label: string; pts: number }[] = [];
  lines.push({ label: won ? 'Victoria' : 'Participación', pts: won ? sc.win : sc.lose });
  if (sc.perBull && stats.bulls) lines.push({ label: `Bulls (${stats.bulls})`, pts: (stats.bulls + stats.dbulls) * sc.perBull });
  if (sc.perTreble && stats.trebles) lines.push({ label: `Triples (${stats.trebles})`, pts: stats.trebles * sc.perTreble });
  if (sc.perDouble && stats.doubles) lines.push({ label: `Dobles (${stats.doubles})`, pts: stats.doubles * sc.perDouble });
  if (sc.perTon && stats.tons) lines.push({ label: `Turnos 100+ (${stats.tons})`, pts: stats.tons * sc.perTon });
  if (sc.per180 && stats.s180) lines.push({ label: `180s (${stats.s180})`, pts: stats.s180 * sc.per180 });
  if (sc.perCheckout && stats.checkout) lines.push({ label: 'Cierre con doble', pts: sc.perCheckout });
  return { total: lines.reduce((a, l) => a + l.pts, 0), lines };
}

export function eventState(p: Profile): LiveEventState {
  const ev = currentLiveEvent();
  const s = p.liveEvent;
  return s && s.key === ev.key ? s : freshEventState(ev.key);
}
