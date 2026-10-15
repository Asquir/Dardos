// Estado de navegación de la interfaz: pantalla actual, modales, avisos y apertura de cofres.

import type { ComponentChildren } from 'preact';
import { Store } from '../core/store';
import type { ChestType, Reward } from '../meta/chests';
import { audio } from '../services/audio';

export type ScreenName =
  | 'home'
  | 'shop'
  | 'collection'
  | 'social'
  | 'events'
  | 'profile'
  | 'avatar'
  | 'season'
  | 'game'
  | 'matchmaking'
  | 'tournament'
  | 'onboarding'
  | 'liveEvent';

export type ModalSpec =
  | { kind: 'daily' }
  | { kind: 'missions' }
  | { kind: 'wheel' }
  | { kind: 'settings' }
  | { kind: 'levelup'; level: number; reward: Reward }
  | { kind: 'reward'; title: string; reward: Reward }
  | { kind: 'chestSlot'; idx: number }
  | { kind: 'odds'; chest: ChestType }
  | { kind: 'item'; id: string }
  | { kind: 'confirm'; title: string; text: ComponentChildren; ok: string; onOk: () => void; danger?: boolean }
  | { kind: 'info'; title: string; text: ComponentChildren }
  | { kind: 'arenaUnlocked'; arena: number }
  | { kind: 'pause' }
  | { kind: 'emotes' }
  | { kind: 'achievements' }
  | { kind: 'privateRoom' }
  | { kind: 'localSetup' }
  | { kind: 'training' }
  | { kind: 'nameEdit' }
  | { kind: 'clubCreate' }
  | { kind: 'freeChest' }
  | { kind: 'notifyAsk' };

export interface Toast {
  id: number;
  text: string;
  kind: 'good' | 'bad' | 'info';
}

export interface Banner {
  id: number;
  icon: string;
  title: string;
  text: string;
  tone: 'gold' | 'blue' | 'purple' | 'green' | 'red';
  /** al tocar el aviso */
  onTap?: () => void;
  /** puede mostrarse durante la partida */
  inGame?: boolean;
}

export interface ChestOpenState {
  type: ChestType;
  reward: Reward;
  title?: string;
  onDone?: () => void;
}

export interface UIState {
  screen: ScreenName;
  params: Record<string, unknown>;
  modals: ModalSpec[];
  toasts: Toast[];
  chest: ChestOpenState | null;
  bump: { coins: number; gems: number };
  banners: Banner[];
  /** número de transición de pantalla (para animarla) */
  nav: number;
}

export const ui = new Store<UIState>({
  screen: 'home',
  params: {},
  modals: [],
  toasts: [],
  chest: null,
  bump: { coins: 0, gems: 0 },
  banners: [],
  nav: 0,
});

const TAB_ORDER: ScreenName[] = ['shop', 'collection', 'home', 'social', 'events'];

export function go(screen: ScreenName, params: Record<string, unknown> = {}) {
  const prev = ui.get().screen;
  if (prev !== screen) {
    audio.whooshUi();
    const a = TAB_ORDER.indexOf(prev);
    const b = TAB_ORDER.indexOf(screen);
    document.documentElement.dataset.nav = a >= 0 && b >= 0 ? (b > a ? 'right' : 'left') : 'up';
  }
  ui.update((s) => {
    if (s.screen !== screen) s.nav++;
    s.screen = screen;
    s.params = params;
  });
}

export function openModal(m: ModalSpec) {
  audio.pop();
  ui.update((s) => {
    s.modals = [...s.modals, m];
  });
}

export function closeModal() {
  ui.update((s) => {
    s.modals = s.modals.slice(0, -1);
  });
}

export function closeAllModals() {
  ui.update((s) => {
    s.modals = [];
  });
}

let tid = 1;
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const id = tid++;
  ui.update((s) => {
    s.toasts = [...s.toasts.slice(-2), { id, text, kind }];
  });
  setTimeout(() => {
    ui.update((s) => {
      s.toasts = s.toasts.filter((t) => t.id !== id);
    });
  }, 2900);
}

export function bumpCurrency(kind: 'coins' | 'gems') {
  ui.update((s) => {
    s.bump = { ...s.bump, [kind]: s.bump[kind] + 1 };
  });
}

/** Lanza la animación de apertura de cofre (el contenido ya está concedido). */
export function showChest(c: ChestOpenState) {
  ui.update((s) => {
    s.chest = c;
  });
}

export function closeChest() {
  const c = ui.get().chest;
  ui.update((s) => {
    s.chest = null;
  });
  c?.onDone?.();
}

let bid = 1;
/** Aviso animado en la parte superior (estilo notificación). Se encolan y se muestran de uno en uno. */
export function banner(b: Omit<Banner, 'id' | 'tone'> & { tone?: Banner['tone'] }) {
  const id = bid++;
  ui.update((s) => {
    if (s.banners.some((x) => x.title === b.title && x.text === b.text)) return;
    s.banners = [...s.banners, { ...b, tone: b.tone ?? 'gold', id }].slice(-4);
  });
}

export function dismissBanner(id: number) {
  ui.update((s) => {
    s.banners = s.banners.filter((b) => b.id !== id);
  });
}
