// Cofres: tipos, tiempos de apertura, contenido y probabilidades (mostradas al jugador).

import { ALL_ITEMS, type ItemDef, type Rarity } from './catalog';

export type ChestType = 'free' | 'wood' | 'silver' | 'gold' | 'epic' | 'legendary' | 'club' | 'season';

export interface ChestDef {
  type: ChestType;
  name: string;
  /** segundos para abrir */
  duration: number;
  cards: number;
  coins: [number, number];
  gems: [number, number, number]; // [min, max, probabilidad]
  /** probabilidades por carta (se normalizan) */
  odds: Record<Rarity, number>;
  /** mínimos garantizados */
  guaranteed: Partial<Record<Rarity, number>>;
  /** precio en gemas en la tienda */
  price?: number;
  color: string;
  trim: string;
}

const H = 3600;

export const CHESTS: Record<ChestType, ChestDef> = {
  free: { type: 'free', name: 'Cofre Gratis', duration: 0, cards: 3, coins: [20, 40], gems: [1, 2, 0.25], odds: { common: 85, rare: 14, epic: 1, legendary: 0 }, guaranteed: {}, color: '#7a4a24', trim: '#b7b7b7' },
  wood: { type: 'wood', name: 'Cofre de Madera', duration: 15 * 60, cards: 4, coins: [30, 60], gems: [1, 3, 0.15], odds: { common: 82, rare: 16.5, epic: 1.4, legendary: 0.1 }, guaranteed: {}, color: '#8a5528', trim: '#9aa3ad' },
  silver: { type: 'silver', name: 'Cofre de Plata', duration: 3 * H, cards: 12, coins: [90, 160], gems: [2, 5, 0.3], odds: { common: 75, rare: 22, epic: 2.7, legendary: 0.3 }, guaranteed: { rare: 1 }, price: 60, color: '#5d6b7a', trim: '#e3e8ef' },
  gold: { type: 'gold', name: 'Cofre de Oro', duration: 8 * H, cards: 30, coins: [300, 500], gems: [4, 10, 0.6], odds: { common: 68, rare: 27, epic: 4.4, legendary: 0.6 }, guaranteed: { rare: 4 }, price: 180, color: '#b8860b', trim: '#ffe27a' },
  epic: { type: 'epic', name: 'Cofre Épico', duration: 12 * H, cards: 22, coins: [500, 800], gems: [8, 15, 0.8], odds: { common: 50, rare: 38, epic: 11, legendary: 1 }, guaranteed: { epic: 2, rare: 5 }, price: 400, color: '#6a1fb8', trim: '#f0c4ff' },
  legendary: { type: 'legendary', name: 'Cofre Legendario', duration: 24 * H, cards: 40, coins: [1200, 2000], gems: [20, 40, 1], odds: { common: 45, rare: 38, epic: 13, legendary: 4 }, guaranteed: { legendary: 1, epic: 3 }, price: 1000, color: '#d17a00', trim: '#fff1a8' },
  club: { type: 'club', name: 'Cofre del Club', duration: 0, cards: 15, coins: [200, 400], gems: [5, 10, 1], odds: { common: 65, rare: 28, epic: 6, legendary: 1 }, guaranteed: { rare: 2 }, color: '#127a4a', trim: '#9cffcf' },
  season: { type: 'season', name: 'Cofre de Temporada', duration: 0, cards: 20, coins: [300, 600], gems: [5, 12, 1], odds: { common: 55, rare: 33, epic: 10, legendary: 2 }, guaranteed: { epic: 1 }, color: '#b0124a', trim: '#ffd0e0' },
};

/** Ciclo de cofres por victoria (como en los grandes juegos de cartas). */
export const WIN_CYCLE: ChestType[] = ['wood', 'wood', 'silver', 'wood', 'silver', 'wood', 'gold', 'wood', 'silver', 'wood', 'wood', 'silver', 'gold', 'wood', 'silver', 'wood', 'epic', 'wood', 'silver', 'gold'];

export interface CardDrop {
  id: string;
  count: number;
}

export interface Reward {
  coins?: number;
  gems?: number;
  xp?: number;
  cards?: CardDrop[];
  chest?: ChestType;
  item?: string; // objeto completo (cosmético o exclusivo)
  seasonXp?: number;
}

/** Multiplicador de recompensas según arena. */
export function arenaMult(arena: number) {
  return 1 + arena * 0.55;
}

function pickRarity(odds: Record<Rarity, number>, rnd: () => number): Rarity {
  const total = odds.common + odds.rare + odds.epic + odds.legendary;
  let x = rnd() * total;
  for (const r of ['legendary', 'epic', 'rare', 'common'] as Rarity[]) {
    x -= odds[r];
    if (x <= 0) return r;
  }
  return 'common';
}

function pool(rarity: Rarity, arena: number): ItemDef[] {
  let p = ALL_ITEMS.filter((i) => i.rarity === rarity && i.arena <= arena && !i.exclusive);
  if (!p.length) p = ALL_ITEMS.filter((i) => i.rarity === rarity && !i.exclusive);
  return p;
}

/** Genera el contenido de un cofre. */
export function rollChest(type: ChestType, arena: number, rnd: () => number = Math.random): Reward {
  const d = CHESTS[type];
  const mult = arenaMult(arena);
  const coins = Math.round((d.coins[0] + rnd() * (d.coins[1] - d.coins[0])) * mult);
  const gems = rnd() < d.gems[2] ? Math.round(d.gems[0] + rnd() * (d.gems[1] - d.gems[0])) : 0;
  const totalCards = Math.round(d.cards * (1 + arena * 0.25));
  const rarities: Rarity[] = [];
  for (const [r, n] of Object.entries(d.guaranteed) as [Rarity, number][]) for (let i = 0; i < n; i++) rarities.push(r);
  while (rarities.length < totalCards) rarities.push(pickRarity(d.odds, rnd));
  // agrupamos en hasta 4 tipos de carta distintos (más emocionante al abrir)
  const byRarity = new Map<Rarity, number>();
  for (const r of rarities) byRarity.set(r, (byRarity.get(r) ?? 0) + 1);
  const cards: CardDrop[] = [];
  for (const [r, n] of byRarity) {
    const p = pool(r, arena);
    const stacks = Math.min(r === 'common' ? 2 : 1, n);
    let left = n;
    for (let s = 0; s < stacks; s++) {
      const item = p[Math.floor(rnd() * p.length)];
      const count = s === stacks - 1 ? left : Math.ceil(left / 2);
      left -= count;
      const existing = cards.find((c) => c.id === item.id);
      if (existing) existing.count += count;
      else cards.push({ id: item.id, count });
    }
  }
  const order: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
  cards.sort((a, b) => order.indexOf(itemRarity(a.id)) - order.indexOf(itemRarity(b.id)));
  return { coins, gems, cards };
}

function itemRarity(id: string): Rarity {
  return ALL_ITEMS.find((i) => i.id === id)?.rarity ?? 'common';
}

/** Gemas para abrir al instante (según tiempo restante). */
export function gemsToSkip(secondsLeft: number): number {
  if (secondsLeft <= 0) return 0;
  return Math.max(1, Math.ceil(secondsLeft / 360));
}

/** Probabilidades legibles (exigidas por las tiendas para cajas de botín). */
export function oddsText(type: ChestType): { rarity: Rarity; pct: string }[] {
  const d = CHESTS[type];
  const total = d.odds.common + d.odds.rare + d.odds.epic + d.odds.legendary;
  return (['common', 'rare', 'epic', 'legendary'] as Rarity[]).map((r) => ({ rarity: r, pct: ((d.odds[r] / total) * 100).toFixed(1) + '%' }));
}
