// Acciones sobre el evento en vivo del perfil: entradas, puntos y reclamación de hitos.

import { dayKey } from '../core/store';
import { mutate, profile } from './profile';
import { grant, spend, type GrantResult } from './economy';
import type { Reward } from './chests';
import {
  currentLiveEvent,
  eventMilestones,
  eventState,
  regenTickets,
  adTicketsLeft,
  GEM_TICKET_PRICE,
  MAX_TICKETS,
  type LiveEventState,
} from './liveEvents';

/** Estado del evento actual con las entradas regeneradas (y guardado si cambió de evento). */
export function liveEventNow(): LiveEventState {
  const p = profile();
  const s = eventState(p);
  const before = JSON.stringify(p.liveEvent);
  const copy: LiveEventState = { ...s, claimed: [...s.claimed], adTickets: { ...s.adTickets } };
  regenTickets(copy);
  if (JSON.stringify(copy) !== before) mutate((q) => void (q.liveEvent = copy));
  return copy;
}

function withEvent(fn: (s: LiveEventState) => void) {
  mutate((p) => {
    const s = eventState(p);
    const copy: LiveEventState = { ...s, claimed: [...s.claimed], adTickets: { ...s.adTickets } };
    regenTickets(copy);
    fn(copy);
    p.liveEvent = copy;
  });
}

/** Gasta una entrada. Devuelve false si no quedan. */
export function useEventTicket(): boolean {
  const s = liveEventNow();
  if (s.tickets <= 0) return false;
  withEvent((e) => {
    if (e.tickets >= MAX_TICKETS) e.ticketAt = Date.now();
    e.tickets--;
  });
  return true;
}

export function addEventPoints(pts: number) {
  withEvent((e) => {
    e.points += Math.max(0, Math.round(pts));
    e.played++;
  });
}

export function buyEventTicket(): boolean {
  if (liveEventNow().tickets >= MAX_TICKETS) return false;
  if (!spend({ gems: GEM_TICKET_PRICE })) return false;
  withEvent((e) => void (e.tickets = Math.min(MAX_TICKETS, e.tickets + 1)));
  return true;
}

export function adEventTicket(): boolean {
  const s = liveEventNow();
  if (adTicketsLeft(s) <= 0 || s.tickets >= MAX_TICKETS) return false;
  withEvent((e) => {
    const today = dayKey();
    e.adTickets = e.adTickets.day === today ? { day: today, count: e.adTickets.count + 1 } : { day: today, count: 1 };
    e.tickets = Math.min(MAX_TICKETS, e.tickets + 1);
  });
  return true;
}

/** Hitos alcanzados y aún sin reclamar. */
export function eventClaimable(): number {
  const ev = currentLiveEvent();
  const s = eventState(profile());
  return eventMilestones(ev.def).filter((m, i) => s.points >= m.pts && !s.claimed.includes(i)).length;
}

export function claimEventMilestone(i: number): { reward: Reward; result: GrantResult } | null {
  const ev = currentLiveEvent();
  const ms = eventMilestones(ev.def)[i];
  const s = eventState(profile());
  if (!ms || s.points < ms.pts || s.claimed.includes(i)) return null;
  withEvent((e) => void e.claimed.push(i));
  return { reward: ms.reward, result: grant(ms.reward) };
}
