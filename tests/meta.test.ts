import { describe, expect, it } from 'vitest';
import { currentLiveEvent, LIVE_EVENTS, EVENT_DURATION, EVENT_EPOCH, eventMilestones, freshEventState, regenTickets, nextTicketIn, scoreEventMatch, MAX_TICKETS, TICKET_PERIOD } from '../app/src/meta/liveEvents';
import { planNotifications } from '../app/src/services/notify';
import { defaultProfile } from '../app/src/meta/profile';

describe('eventos en vivo', () => {
  it('rotan cada 3 días y recorren todos los eventos', () => {
    const seen = new Set<string>();
    for (let i = 0; i < LIVE_EVENTS.length; i++) {
      const ev = currentLiveEvent(EVENT_EPOCH + i * EVENT_DURATION + 1000);
      expect(ev.endsAt - ev.startsAt).toBe(EVENT_DURATION);
      seen.add(ev.def.id);
      expect(ev.next.id).toBe(currentLiveEvent(ev.endsAt + 1).def.id);
    }
    expect(seen.size).toBe(LIVE_EVENTS.length);
    // también antes de la fecha de inicio
    expect(LIVE_EVENTS).toContain(currentLiveEvent(EVENT_EPOCH - 5 * EVENT_DURATION).def);
  });

  it('el último hito da el objeto exclusivo', () => {
    for (const d of LIVE_EVENTS) {
      const ms = eventMilestones(d);
      expect(ms[ms.length - 1].reward.item).toBe(d.exclusive);
      for (let i = 1; i < ms.length; i++) expect(ms[i].pts).toBeGreaterThan(ms[i - 1].pts);
    }
  });

  it('las entradas se recargan con el tiempo sin pasar del máximo', () => {
    const t0 = 1_000_000;
    const s = freshEventState('k', t0);
    s.tickets = 1;
    s.ticketAt = t0;
    regenTickets(s, t0 + TICKET_PERIOD * 2 + 5);
    expect(s.tickets).toBe(3);
    expect(nextTicketIn(s, t0 + TICKET_PERIOD * 2 + 5)).toBe(TICKET_PERIOD - 5);
    regenTickets(s, t0 + TICKET_PERIOD * 50);
    expect(s.tickets).toBe(MAX_TICKETS);
    expect(nextTicketIn(s)).toBe(0);
  });

  it('puntúa las partidas según las reglas del evento', () => {
    const max = LIVE_EVENTS.find((e) => e.id === 'max_madness')!;
    const r = scoreEventMatch(max, true, { bulls: 0, dbulls: 0, trebles: 5, doubles: 1, tons: 3, s180: 1, checkout: true });
    expect(r.total).toBe(60 + 3 * 15 + 100);
    const bull = LIVE_EVENTS.find((e) => e.id === 'bull_fever')!;
    expect(scoreEventMatch(bull, false, { bulls: 4, dbulls: 1, trebles: 0, doubles: 0, tons: 0, s180: 0, checkout: false }).total).toBe(20 + 5 * 15);
  });
});

describe('notificaciones', () => {
  it('programa el cofre listo, el cofre gratis y los recordatorios', () => {
    const now = Date.now();
    const p = defaultProfile();
    p.chests[0] = { type: 'gold', arena: 1, readyAt: now + 3600_000 };
    p.chests[1] = { type: 'silver', arena: 1, readyAt: null };
    p.freeChestAt = now + 2 * 3600_000;
    const plan = planNotifications(p, now, { at: now + 86400_000, name: 'Copa' });
    const ids = plan.map((n) => n.id);
    expect(ids).toContain(100);
    expect(ids).not.toContain(101);
    expect(ids).toContain(120);
    expect(ids).toContain(140);
    expect(plan.find((n) => n.id === 100)!.at).toBe(now + 3600_000);
    expect(plan.every((n) => n.at > now)).toBe(true);
  });
});
