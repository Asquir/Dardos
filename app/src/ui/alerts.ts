// Vigila el progreso para lanzar avisos dentro del juego (banners) y mantener al día las
// notificaciones del sistema: cofre listo, cofre gratis, misiones, eventos e hitos.

import { profile, profileStore, mutate, type ChestSlot } from '../meta/profile';
import { slotState, freeChestsAvailable } from '../meta/economy';
import { CHESTS } from '../meta/chests';
import { currentLiveEvent, eventMilestones, eventState } from '../meta/liveEvents';
import { FEATURE_LEVEL } from '../meta/progression';
import { notify, planNotifications, NOTIFY_IDS } from '../services/notify';
import { banner, go, openModal, ui } from './state';

const seen = new Set<string>();
let started = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let lastPlan = '';

const chestKey = (i: number, c: ChestSlot) => `chest:${i}:${c.readyAt}`;

function markCurrent() {
  const p = profile();
  const now = Date.now();
  p.chests.forEach((c, i) => {
    if (c && slotState(c, now) === 'ready') seen.add(chestKey(i, c));
  });
  if (freeChestsAvailable(p, now) > 0) seen.add('free:' + p.freeChestAt);
  for (const m of p.missions.list) if (m.progress >= m.target) seen.add(`mission:${p.missions.day}:${m.id}`);
  const ev = currentLiveEvent(now);
  const s = eventState(p);
  eventMilestones(ev.def).forEach((m, i) => {
    if (s.points >= m.pts) seen.add(`ms:${ev.key}:${i}`);
  });
}

function check() {
  const p = profile();
  if (!p.tutorial.done) {
    markCurrent();
    return;
  }
  const now = Date.now();
  p.chests.forEach((c, i) => {
    if (!c || slotState(c, now) !== 'ready') return;
    const k = chestKey(i, c);
    if (seen.has(k)) return;
    seen.add(k);
    banner({ icon: '🎁', title: '¡Cofre listo!', text: `Tu ${CHESTS[c.type].name} ya se puede abrir`, tone: 'gold', onTap: () => go('home') });
  });
  if (freeChestsAvailable(p, now) > 0 && !seen.has('free:' + p.freeChestAt)) {
    seen.add('free:' + p.freeChestAt);
    banner({ icon: '🎀', title: 'Cofre gratis disponible', text: 'Tócalo para reclamarlo', tone: 'green', onTap: () => (go('home'), openModal({ kind: 'freeChest' })) });
  }
  for (const m of p.missions.list) {
    const k = `mission:${p.missions.day}:${m.id}`;
    if (m.claimed || m.progress < m.target || seen.has(k)) continue;
    seen.add(k);
    banner({ icon: '📜', title: '¡Misión completada!', text: 'Reclama tu recompensa en Misiones', tone: 'blue', onTap: () => (go('home'), openModal({ kind: 'missions' })) });
  }
  if (p.level >= FEATURE_LEVEL.liveEvent) {
    const ev = currentLiveEvent(now);
    if (p.seenEvent !== ev.key) {
      mutate((q) => void (q.seenEvent = ev.key));
      banner({ icon: ev.def.icon, title: '¡Nuevo evento en vivo!', text: `${ev.def.name}: ${ev.def.tagline}`, tone: 'purple', onTap: () => go('liveEvent') });
    }
    const s = eventState(p);
    eventMilestones(ev.def).forEach((m, i) => {
      const k = `ms:${ev.key}:${i}`;
      if (s.points < m.pts || seen.has(k)) return;
      seen.add(k);
      if (!s.claimed.includes(i)) banner({ icon: '🏅', title: 'Hito del evento alcanzado', text: `${m.pts} puntos en «${ev.def.name}». ¡Reclama tu premio!`, tone: 'purple', onTap: () => go('liveEvent') });
    });
  }
}

/** Recalcula y programa las notificaciones del sistema (con un pequeño retardo para agrupar cambios). */
export function syncNotifications(immediate = false) {
  if (syncTimer) clearTimeout(syncTimer);
  const run = () => {
    syncTimer = null;
    const p = profile();
    if (p.settings.notifications !== true) {
      if (lastPlan !== 'off') void notify.cancelAll();
      lastPlan = 'off';
      return;
    }
    const ev = currentLiveEvent();
    const plan = planNotifications(p, Date.now(), { at: ev.nextAt, name: ev.next.name });
    // redondea los tiempos para no reprogramar en cada cambio irrelevante
    const sig = JSON.stringify(plan.map((n) => [n.id, Math.round(n.at / (n.id === NOTIFY_IDS.comeback ? 3_600_000 : 60_000)), n.body]));
    if (sig === lastPlan && !immediate) return;
    lastPlan = sig;
    void notify.sync(plan);
  };
  if (immediate) run();
  else syncTimer = setTimeout(run, 2500);
}

function onNotificationTap(id: number) {
  const s = ui.get();
  if (s.screen === 'game' || s.screen === 'onboarding') return;
  if (id === NOTIFY_IDS.free) (go('home'), openModal({ kind: 'freeChest' }));
  else if (id === NOTIFY_IDS.daily) (go('home'), openModal({ kind: 'daily' }));
  else if (id === NOTIFY_IDS.event || id === NOTIFY_IDS.tickets) go('liveEvent');
  else go('home');
}

/** Pide permiso con una explicación propia antes del diálogo del sistema (solo una vez). */
export function maybeAskNotifications() {
  const p = profile();
  if (!notify.supported || p.settings.notifications !== null || !p.tutorial.done) return;
  setTimeout(() => openModal({ kind: 'notifyAsk' }), 700);
}

export async function enableNotifications(): Promise<boolean> {
  const ok = await notify.request();
  mutate((p) => void (p.settings.notifications = ok));
  syncNotifications(true);
  return ok;
}

export function startAlerts() {
  if (started) return;
  started = true;
  markCurrent();
  const p = profile();
  const ready = p.chests.filter((c) => c && slotState(c) === 'ready').length;
  if (ready && p.tutorial.done) {
    setTimeout(() => banner({ icon: '🎁', title: ready > 1 ? `¡${ready} cofres listos!` : '¡Cofre listo!', text: 'Ábrelo y descubre tus cartas', onTap: () => go('home') }), 2200);
  }
  setInterval(check, 1000);
  profileStore.subscribe(() => syncNotifications());
  syncNotifications();
  notify.onTap(onNotificationTap);
}
