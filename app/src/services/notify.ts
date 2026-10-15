// Notificaciones locales del sistema (sin servidor): cofre listo, cofre gratis, recompensa diaria,
// eventos en vivo y recordatorio de vuelta. Se recalculan cada vez que cambia el progreso.

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { CHESTS } from '../meta/chests';
import type { Profile } from '../meta/profile';
import { currentLiveEvent, MAX_TICKETS, TICKET_PERIOD } from '../meta/liveEvents';

const native = Capacitor.isNativePlatform();
const CHANNEL = 'diana_avisos';

const ID = {
  chest: (i: number) => 100 + i,
  free: 120,
  daily: 130,
  event: 140,
  tickets: 150,
  comeback: 160,
};

export interface PlannedNotification {
  id: number;
  at: number;
  title: string;
  body: string;
}

/** Calcula qué avisos tocan según el estado del jugador (pura: fácil de probar). */
export function planNotifications(p: Profile, now = Date.now(), nextEvent?: { at: number; name: string }): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  p.chests.forEach((c, i) => {
    if (c?.readyAt && c.readyAt > now + 30_000) {
      out.push({ id: ID.chest(i), at: c.readyAt, title: '¡Tu cofre está listo! 🎁', body: `Tu ${CHESTS[c.type].name} ya se puede abrir. ¡Descubre qué cartas te tocan!` });
    }
  });
  if (p.freeChestAt > now + 60_000) {
    out.push({ id: ID.free, at: p.freeChestAt, title: 'Cofre gratis disponible', body: 'Tienes un cofre gratis esperándote. ¡Entra a por él! 🎯' });
  }
  // recompensa diaria: mañana a las 10:00
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  out.push({ id: ID.daily, at: tomorrow.getTime(), title: 'Recompensa diaria 📅', body: `¡Día ${((p.daily.streak + 1) % 7) + 1} de tu racha! Reclama tu premio antes de que se pierda.` });
  if (nextEvent && nextEvent.at > now + 60_000) {
    out.push({ id: ID.event, at: nextEvent.at, title: '¡Nuevo evento! ⚡', body: `Empieza «${nextEvent.name}». Premios exclusivos por tiempo limitado.` });
  }
  // entradas del evento recargadas
  const ev = currentLiveEvent(now);
  const le = p.liveEvent;
  if (le && le.key === ev.key && le.tickets < MAX_TICKETS) {
    const full = le.ticketAt + (MAX_TICKETS - le.tickets) * TICKET_PERIOD;
    if (full < ev.endsAt && full > now + 60_000) {
      out.push({ id: ID.tickets, at: full, title: 'Entradas recargadas 🎟️', body: `Tienes ${MAX_TICKETS} entradas para «${ev.def.name}». ¡Sigue sumando puntos!` });
    }
  }
  // si no vuelve en 2 días
  out.push({ id: ID.comeback, at: now + 2 * 86400_000, title: '¡La diana te echa de menos!', body: 'Tus rivales están subiendo de arena. Vuelve y defiende tus copas 🏆' });
  return out.filter((n) => n.at > now);
}

class Notify {
  private channelReady = false;

  get supported() {
    return native;
  }

  async permission(): Promise<'granted' | 'denied' | 'prompt'> {
    if (!native) return 'denied';
    try {
      const st = await LocalNotifications.checkPermissions();
      return st.display === 'granted' ? 'granted' : st.display === 'denied' ? 'denied' : 'prompt';
    } catch {
      return 'denied';
    }
  }

  async request(): Promise<boolean> {
    if (!native) return false;
    try {
      const st = await LocalNotifications.requestPermissions();
      return st.display === 'granted';
    } catch {
      return false;
    }
  }

  private async ensureChannel() {
    if (this.channelReady || Capacitor.getPlatform() !== 'android') return;
    try {
      await LocalNotifications.createChannel({ id: CHANNEL, name: 'Avisos del juego', description: 'Cofres listos, recompensas y eventos', importance: 4, visibility: 1, lights: true, lightColor: '#FFC21A', vibration: true });
      this.channelReady = true;
    } catch {
      /* canal no disponible */
    }
  }

  /** Sustituye todos los avisos programados por los nuevos. */
  async sync(plan: PlannedNotification[]) {
    if (!native) return;
    if ((await this.permission()) !== 'granted') return;
    await this.ensureChannel();
    try {
      const pending = await LocalNotifications.getPending();
      const ours = pending.notifications.filter((n) => n.id >= 100 && n.id < 200).map((n) => ({ id: n.id }));
      if (ours.length) await LocalNotifications.cancel({ notifications: ours });
      if (!plan.length) return;
      await LocalNotifications.schedule({
        notifications: plan.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          schedule: { at: new Date(n.at), allowWhileIdle: true },
          channelId: CHANNEL,
          smallIcon: 'ic_stat_diana',
          iconColor: '#FFC21A',
          autoCancel: true,
        })),
      });
    } catch (e) {
      console.warn('No se pudieron programar los avisos', e);
    }
  }

  async cancelAll() {
    if (!native) return;
    try {
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    } catch {
      /* nada */
    }
  }

  onTap(fn: (id: number) => void) {
    if (!native) return;
    void LocalNotifications.addListener('localNotificationActionPerformed', (a) => fn(a.notification.id));
  }
}

export const notify = new Notify();
export const NOTIFY_IDS = ID;
