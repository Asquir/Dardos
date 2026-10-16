// Perfil del jugador: todo el progreso guardado en el dispositivo (y sincronizado con el servidor).

import type { AvatarConfig, DartLook } from '@shared/protocol';
import type { CareerState } from './career';
import { Store } from '../core/store';
import { loadJSON, saveJSON } from '../services/storage';
import type { ChestType } from './chests';
import type { LiveEventState } from './liveEvents';

export interface ChestSlot {
  type: ChestType;
  arena: number;
  /** marca de tiempo (ms) en la que estará listo; null = esperando a que se inicie */
  readyAt: number | null;
}

export interface Mission {
  id: string;
  kind: string;
  target: number;
  progress: number;
  reward: { coins?: number; gems?: number };
  seasonXp: number;
  claimed: boolean;
}

export interface ShopOffer {
  id: string;
  kind: 'card' | 'chest' | 'coins' | 'cosmetic' | 'free';
  itemId?: string;
  count?: number;
  chest?: ChestType;
  price: { coins?: number; gems?: number };
  bought: boolean;
}

export interface MatchSummary {
  at: number;
  mode: string;
  opponent: string;
  won: boolean;
  avg: number;
  online: boolean;
  /** modo de juego (x01, cricket…) */
  game?: string;
  /** media de los 9 primeros dardos (X01) */
  f9?: number;
}

/** Impacto en mm empaquetado en un número (para el mapa de calor). */
export function packHit(x: number, y: number): number {
  return Math.round(Math.max(-500, Math.min(500, x)) + 500) * 1024 + Math.round(Math.max(-500, Math.min(500, y)) + 500);
}

export function unpackHit(v: number): { x: number; y: number } {
  return { x: Math.floor(v / 1024) - 500, y: (v % 1024) - 500 };
}

export interface TournamentState {
  id: string;
  entry: number;
  arena: number;
  round: number; // 0 cuartos, 1 semis, 2 final, 3 terminado
  bracket: { name: string; sigma: number; seed: number }[];
  /** índices de los jugadores que siguen vivos al empezar cada ronda */
  rounds: number[][];
  alive: boolean;
  won: boolean;
}

export interface Settings {
  music: number;
  sfx: number;
  voice: boolean;
  vibration: boolean;
  quality: 'auto' | 'low' | 'medium' | 'high';
  control: 'flick' | 'tap';
  sensitivity: number;
  leftHanded: boolean;
  showCheckout: boolean;
  /** sorteo al bull antes de cada partida contra la máquina o local */
  bullOff: boolean;
  /** repeticiones a cámara lenta de los grandes momentos */
  replays: boolean;
  language: 'es' | 'en';
  serverUrl: string;
  personalizedAds: boolean | null;
  /** null = todavía no se ha preguntado */
  notifications: boolean | null;
}

export interface Profile {
  v: number;
  id: string;
  serverId?: string;
  token?: string;
  name: string;
  nameSet: boolean;
  country: string;
  avatar: AvatarConfig;
  coins: number;
  gems: number;
  xp: number;
  level: number;
  trophies: number;
  bestTrophies: number;
  selectedArena: number;
  items: Record<string, { level: number; cards: number }>;
  equipped: DartLook;
  boardSkin: string;
  ownedBoards: string[];
  emotes: string[];
  ownedEmotes: string[];
  ownedAvatar: string[];
  chests: (ChestSlot | null)[];
  winCycle: number;
  freeChestAt: number;
  adChests: { day: string; count: number };
  stats: {
    matches: number;
    wins: number;
    losses: number;
    darts: number;
    points: number;
    s180: number;
    tons: number;
    bulls: number;
    trebles: number;
    doubles: number;
    bestCheckout: number;
    bestAvg: number;
    bestLegDarts: number;
    onlineWins: number;
    tournamentsWon: number;
    chestsOpened: number;
    cardsCollected: number;
    upgrades: number;
    winStreak: number;
    bestStreak: number;
  };
  missions: { day: string; list: Mission[]; rerolls: number };
  achievements: Record<string, number>;
  daily: { lastDay: string; streak: number };
  wheel: { day: string; free: boolean; adSpins: number };
  season: { id: number; xp: number; premium: boolean; claimedFree: number[]; claimedPremium: number[] };
  shop: { day: string; offers: ShopOffer[] };
  purchases: { removeAds: boolean; starterPack: boolean; vipUntil: number; spent: number; history: string[] };
  settings: Settings;
  tutorial: { done: boolean; tips: string[]; rewarded?: boolean };
  friends: { id: string; name: string }[];
  blocked: string[];
  club: { id: string; name: string; tag: string; emblem: number } | null;
  ads: { counter: number; lastInterstitial: number; day: string; rewarded: number };
  createdAt: number;
  lastLogin: number;
  tournament: TournamentState | null;
  history: MatchSummary[];
  challenge: { day: string; best: number; claimed: number };
  liveEvent: LiveEventState | null;
  /** clave del último evento en vivo anunciado */
  seenEvent: string;
  /** cofres ganados (subida de nivel, torneo…) que se abrirán con su animación */
  pendingChests: { type: ChestType; title: string }[];
  /** récords personales por modo (puntos; en Killer, victorias; en el reloj, menos dardos) */
  records: Record<string, number>;
  /** últimos impactos propios para el mapa de calor: x e y en mm empaquetados en un número */
  hitLog: number[];
  /** dobles intentados y acertados al cerrar (para el % de cierre por doble) */
  doubles: Record<string, [number, number]>;
  /** premios de turno conseguidos (Hat Trick, Tres en la cama…) */
  awards: Record<string, number>;
  /** sets de dardo guardados (3 huecos) */
  loadouts: (DartLook | null)[];
  /** carrera profesional (gira de 8 torneos con ranking) */
  career: CareerState | null;
}

export const PROFILE_KEY = 'diana_profile_v1';

function rid(): string {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function defaultProfile(): Profile {
  const now = Date.now();
  return {
    v: 1,
    id: rid(),
    name: 'Jugador' + Math.floor(1000 + Math.random() * 9000),
    nameSet: false,
    country: 'ES',
    avatar: { skin: 1, hair: 'short', hairColor: 1, eyes: 0, beard: 'none', glasses: 'none', hat: 'none', shirt: 'polo', shirtColor: 0, number: 7 },
    coins: 300,
    gems: 50,
    xp: 0,
    level: 1,
    trophies: 0,
    bestTrophies: 0,
    selectedArena: 0,
    items: {
      b_brass: { level: 1, cards: 0 },
      s_nylon_w: { level: 1, cards: 0 },
      f_red: { level: 1, cards: 0 },
    },
    equipped: { barrel: 'b_brass', shaft: 's_nylon_w', flight: 'f_red' },
    boardSkin: 'classic',
    ownedBoards: ['classic'],
    emotes: ['gg', 'nice', 'oops', 'go'],
    ownedEmotes: ['gg', 'nice', 'oops', 'go'],
    ownedAvatar: [],
    chests: [null, null, null, null],
    winCycle: 0,
    freeChestAt: now,
    adChests: { day: '', count: 0 },
    stats: {
      matches: 0, wins: 0, losses: 0, darts: 0, points: 0, s180: 0, tons: 0, bulls: 0, trebles: 0, doubles: 0,
      bestCheckout: 0, bestAvg: 0, bestLegDarts: 0, onlineWins: 0, tournamentsWon: 0, chestsOpened: 0,
      cardsCollected: 0, upgrades: 0, winStreak: 0, bestStreak: 0,
    },
    missions: { day: '', list: [], rerolls: 0 },
    achievements: {},
    daily: { lastDay: '', streak: 0 },
    wheel: { day: '', free: true, adSpins: 0 },
    season: { id: 0, xp: 0, premium: false, claimedFree: [], claimedPremium: [] },
    shop: { day: '', offers: [] },
    purchases: { removeAds: false, starterPack: false, vipUntil: 0, spent: 0, history: [] },
    settings: {
      music: 0.5,
      sfx: 0.9,
      voice: true,
      vibration: true,
      quality: 'auto',
      control: 'flick',
      sensitivity: 1,
      leftHanded: false,
      showCheckout: true,
      bullOff: true,
      replays: true,
      language: 'es',
      serverUrl: (import.meta.env.VITE_SERVER_URL as string | undefined) ?? '',
      personalizedAds: null,
      notifications: null,
    },
    tutorial: { done: false, tips: [] },
    friends: [],
    blocked: [],
    club: null,
    ads: { counter: 0, lastInterstitial: 0, day: '', rewarded: 0 },
    createdAt: now,
    lastLogin: now,
    tournament: null,
    history: [],
    challenge: { day: '', best: 0, claimed: 0 },
    liveEvent: null,
    seenEvent: '',
    pendingChests: [],
    records: {},
    hitLog: [],
    doubles: {},
    awards: {},
    loadouts: [null, null, null],
    career: null,
  };
}

/** Rellena campos nuevos en perfiles guardados con versiones anteriores. */
function migrate(p: Partial<Profile>): Profile {
  const d = defaultProfile();
  const merged = { ...d, ...p } as Profile;
  merged.stats = { ...d.stats, ...(p.stats ?? {}) };
  merged.settings = { ...d.settings, ...(p.settings ?? {}) };
  merged.purchases = { ...d.purchases, ...(p.purchases ?? {}) };
  merged.avatar = { ...d.avatar, ...(p.avatar ?? {}) };
  merged.tutorial = { ...d.tutorial, ...(p.tutorial ?? {}) };
  // quien ya había hecho el tutorial antes de existir la marca no vuelve a cobrar el regalo
  if (merged.tutorial.tips.includes('match')) merged.tutorial.rewarded = true;
  if (!Array.isArray(merged.pendingChests)) merged.pendingChests = [];
  if (!merged.records || typeof merged.records !== 'object') merged.records = {};
  if (!Array.isArray(merged.hitLog)) merged.hitLog = [];
  if (!merged.doubles || typeof merged.doubles !== 'object') merged.doubles = {};
  if (!merged.awards || typeof merged.awards !== 'object') merged.awards = {};
  if (!Array.isArray(merged.loadouts) || merged.loadouts.length !== 3) merged.loadouts = [null, null, null];
  if (!merged.chests || merged.chests.length !== 4) merged.chests = [null, null, null, null];
  return merged;
}

export const profileStore = new Store<Profile>(defaultProfile());

let saveTimer: ReturnType<typeof setTimeout> | null = null;
export function saveSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
export function saveNow() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  return saveJSON(PROFILE_KEY, profileStore.get());
}

export async function loadProfile(): Promise<Profile> {
  const raw = await loadJSON<Partial<Profile>>(PROFILE_KEY);
  const p = raw ? migrate(raw) : defaultProfile();
  p.lastLogin = Date.now();
  profileStore.set(p);
  profileStore.subscribe(() => saveSoon());
  return p;
}

/** Atajo para modificar el perfil y guardarlo. */
export function mutate(fn: (p: Profile) => void) {
  profileStore.update(fn);
}

export function profile(): Profile {
  return profileStore.get();
}

export function isVip(p: Profile = profile()): boolean {
  return p.purchases.vipUntil > Date.now();
}
