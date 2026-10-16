// Operaciones de economía y progreso sobre el perfil (puras respecto a la UI).

import type { Hit } from '@shared/board';
import { dayKey, hashStr } from '../core/store';
import { rng } from '@shared/bot';
import { mutate, profile, isVip, type Profile, type ShopOffer, type ChestSlot } from './profile';
import { CHESTS, WIN_CYCLE, rollChest, gemsToSkip, type ChestType, type Reward } from './chests';
import { ALL_ITEMS, ITEM_MAP, cardsNeeded, coinsNeeded, MAX_LEVEL, statsAt, getItem, type Stats, BOARD_SKINS, EMOTES } from './catalog';
import { ARENAS, arenaForTrophies } from './arenas';
import {
  ACHIEVEMENTS,
  DAILY_REWARDS,
  generateMissions,
  levelReward,
  xpForNext,
  currentSeason,
  seasonTiers,
  seasonTier,
} from './progression';

export const FREE_CHEST_PERIOD = 4 * 3600 * 1000;
export const AD_CHESTS_PER_DAY = 3;
export const AD_SPINS_PER_DAY = 3;

// ---------------------------------------------------------------- Recompensas

export interface GrantResult {
  levelUps: { level: number; reward: Reward }[];
  chestsToOpen: { type: ChestType; arena: number }[];
  newItems: string[];
}

export function grant(reward: Reward, opts: { openChestsNow?: boolean } = {}): GrantResult {
  const res: GrantResult = { levelUps: [], chestsToOpen: [], newItems: [] };
  mutate((p) => {
    if (reward.coins) p.coins += reward.coins;
    if (reward.gems) p.gems += reward.gems;
    if (reward.cards) for (const c of reward.cards) if (addCards(p, c.id, c.count)) res.newItems.push(c.id);
    if (reward.item) {
      if (grantItem(p, reward.item)) res.newItems.push(reward.item);
    }
    if (reward.seasonXp) addSeasonXp(p, reward.seasonXp);
    if (reward.xp) res.levelUps.push(...addXp(p, reward.xp));
    if (reward.chest) res.chestsToOpen.push({ type: reward.chest, arena: arenaForTrophies(p.bestTrophies) });
  });
  void opts;
  return res;
}

function grantItem(p: Profile, id: string): boolean {
  if (id.startsWith('avatar:')) {
    const key = id.slice(7);
    if (!p.ownedAvatar.includes(key)) p.ownedAvatar.push(key);
    return true;
  }
  if (id.startsWith('emote:')) {
    const e = id.slice(6);
    if (!p.ownedEmotes.includes(e)) p.ownedEmotes.push(e);
    return true;
  }
  if (id.startsWith('board:')) {
    const b = id.slice(6);
    if (!p.ownedBoards.includes(b)) p.ownedBoards.push(b);
    return true;
  }
  return addCards(p, id, 1);
}

/** Añade cartas. La primera carta desbloquea el objeto. Devuelve true si es nuevo. */
export function addCards(p: Profile, id: string, n: number): boolean {
  if (!ITEM_MAP[id]) return false;
  p.stats.cardsCollected += n;
  const cur = p.items[id];
  if (!cur) {
    p.items[id] = { level: 1, cards: n - 1 };
    return true;
  }
  cur.cards += n;
  return false;
}

export function addXp(p: Profile, xp: number): { level: number; reward: Reward }[] {
  const ups: { level: number; reward: Reward }[] = [];
  p.xp += xp;
  while (p.xp >= xpForNext(p.level)) {
    p.xp -= xpForNext(p.level);
    p.level++;
    const r = levelReward(p.level);
    p.coins += r.coins ?? 0;
    p.gems += r.gems ?? 0;
    // el cofre se abre con su animación en cuanto no haya nada en pantalla (no se pierde al cerrar ventanas)
    if (r.chest) p.pendingChests.push({ type: r.chest, title: `Nivel ${p.level}` });
    ups.push({ level: p.level, reward: r });
  }
  return ups;
}

// ---------------------------------------------------------------- Mejoras

export function upgradeInfo(p: Profile, id: string) {
  const def = getItem(id);
  const own = p.items[id];
  if (!own) return { owned: false, level: 0, cards: 0, need: 1, coins: 0, max: false, can: false };
  const max = own.level >= MAX_LEVEL;
  const need = cardsNeeded(def.rarity, own.level);
  const coins = coinsNeeded(def.rarity, own.level);
  return { owned: true, level: own.level, cards: own.cards, need, coins, max, can: !max && own.cards >= need && p.coins >= coins, enoughCards: own.cards >= need };
}

export function upgrade(id: string): boolean {
  const p = profile();
  const u = upgradeInfo(p, id);
  if (!u.can) return false;
  mutate((pp) => {
    const own = pp.items[id];
    own.cards -= u.need;
    own.level++;
    pp.coins -= u.coins;
    pp.stats.upgrades++;
  });
  track({ type: 'upgrade' });
  return true;
}

/** Estadísticas totales del dardo equipado (0-100). */
export function dartStats(p: Profile = profile(), look = p.equipped): Stats {
  const total: Stats = { acc: 0, stab: 0, ctrl: 0 };
  for (const id of [look.barrel, look.shaft, look.flight]) {
    const def = ITEM_MAP[id];
    if (!def) continue;
    const s = statsAt(def, p.items[id]?.level ?? 1);
    total.acc += s.acc;
    total.stab += s.stab;
    total.ctrl += s.ctrl;
  }
  return total;
}

export function equip(id: string) {
  const def = getItem(id);
  mutate((p) => {
    if (!p.items[id]) return;
    p.equipped = { ...p.equipped, [def.slot]: id };
  });
}

/** Guarda el dardo actual en un hueco de sets. */
export function saveLoadout(i: number) {
  mutate((p) => {
    p.loadouts = p.loadouts.map((l, k) => (k === i ? { ...p.equipped } : l));
  });
}

/** Equipa un set guardado (solo las piezas que sigan en la colección). */
export function useLoadout(i: number): boolean {
  const l = profile().loadouts[i];
  if (!l) return false;
  mutate((p) => {
    const next = { ...p.equipped };
    for (const slot of ['barrel', 'shaft', 'flight'] as const) if (p.items[l[slot]]) next[slot] = l[slot];
    p.equipped = next;
  });
  return true;
}

// ---------------------------------------------------------------- Cofres

export function slotState(s: ChestSlot | null, now = Date.now()): 'empty' | 'locked' | 'unlocking' | 'ready' {
  if (!s) return 'empty';
  if (s.readyAt === null) return 'locked';
  return now >= s.readyAt ? 'ready' : 'unlocking';
}

export function maxParallelUnlocks(p: Profile) {
  return isVip(p) ? 2 : 1;
}

/** Elige el cofre por victoria y lo coloca en un hueco libre. */
export function awardWinChest(arena: number): ChestType | null {
  const p = profile();
  const free = p.chests.findIndex((c) => c === null);
  if (free < 0) return null;
  let type = WIN_CYCLE[p.winCycle % WIN_CYCLE.length];
  const bonus = ARENAS[arena]?.chestBonus ?? {};
  const roll = Math.random();
  let acc = 0;
  for (const [t, prob] of Object.entries(bonus) as [ChestType, number][]) {
    acc += prob;
    if (roll < acc) {
      type = t;
      break;
    }
  }
  // primera victoria: cofre que se abre en segundos (gancho del tutorial)
  const first = p.stats.wins <= 1 && p.stats.chestsOpened === 0;
  mutate((pp) => {
    pp.winCycle++;
    pp.chests[free] = { type, arena, readyAt: first ? Date.now() + 5000 : null };
  });
  return type;
}

export function startUnlock(idx: number): boolean {
  const p = profile();
  const s = p.chests[idx];
  if (!s || s.readyAt !== null) return false;
  const running = p.chests.filter((c) => slotState(c) === 'unlocking').length;
  if (running >= maxParallelUnlocks(p)) return false;
  const dur = CHESTS[s.type].duration * 1000 * (isVip(p) ? 0.5 : 1);
  mutate((pp) => {
    pp.chests[idx]!.readyAt = Date.now() + dur;
  });
  return true;
}

export function skipCost(s: ChestSlot, now = Date.now()): number {
  if (s.readyAt === null) return gemsToSkip(CHESTS[s.type].duration);
  return gemsToSkip((s.readyAt - now) / 1000);
}

/** Abre el cofre del hueco idx (si está listo o pagando gemas). Devuelve el contenido. */
export function openSlot(idx: number, payGems = false): { reward: Reward; type: ChestType; arena: number } | null {
  const p = profile();
  const s = p.chests[idx];
  if (!s) return null;
  const st = slotState(s);
  if (st !== 'ready') {
    if (!payGems) return null;
    const cost = skipCost(s);
    if (p.gems < cost) return null;
    mutate((pp) => (pp.gems -= cost));
  }
  const reward = rollChest(s.type, s.arena);
  mutate((pp) => {
    pp.chests[idx] = null;
  });
  return { reward, type: s.type, arena: s.arena };
}

/** Reduce el tiempo de un cofre que se está abriendo (anuncio con recompensa). */
export function speedUpSlot(idx: number, seconds: number) {
  mutate((p) => {
    const s = p.chests[idx];
    if (s && s.readyAt) s.readyAt -= seconds * 1000;
  });
}

export function freeChestsAvailable(p: Profile = profile(), now = Date.now()): number {
  if (now < p.freeChestAt) return 0;
  return Math.min(2, 1 + Math.floor((now - p.freeChestAt) / FREE_CHEST_PERIOD));
}

export function claimFreeChest(): Reward | null {
  const p = profile();
  const n = freeChestsAvailable(p);
  if (n <= 0) return null;
  mutate((pp) => {
    pp.freeChestAt = n >= 2 ? Date.now() : pp.freeChestAt + FREE_CHEST_PERIOD;
  });
  return rollChest('free', arenaForTrophies(p.bestTrophies));
}

export function adChestsLeft(p: Profile = profile()): number {
  return p.adChests.day === dayKey() ? Math.max(0, AD_CHESTS_PER_DAY - p.adChests.count) : AD_CHESTS_PER_DAY;
}

export function claimAdChest(): { type: ChestType; reward: Reward } {
  mutate((p) => {
    if (p.adChests.day !== dayKey()) p.adChests = { day: dayKey(), count: 0 };
    p.adChests.count++;
  });
  const type: ChestType = Math.random() < 0.25 ? 'silver' : 'wood';
  return { type, reward: rollChest(type, arenaForTrophies(profile().bestTrophies)) };
}

/** Apunta el cofre abierto en estadísticas y misiones. */
export function noteChestOpened() {
  mutate((p) => p.stats.chestsOpened++);
  track({ type: 'chest' });
}

// ---------------------------------------------------------------- Recompensa diaria y ruleta

export function dailyAvailable(p: Profile = profile()): boolean {
  return p.daily.lastDay !== dayKey();
}

export function dailyIndex(p: Profile = profile()): number {
  // "ayer" por calendario (restar 24 h falla en los cambios de hora)
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  const yesterday = dayKey(d.getTime());
  if (p.daily.lastDay === yesterday) return (p.daily.streak + 1) % 7;
  if (p.daily.lastDay === dayKey()) return p.daily.streak;
  return 0;
}

export function claimDaily(): Reward | null {
  const p = profile();
  if (!dailyAvailable(p)) return null;
  const idx = dailyIndex(p);
  mutate((pp) => {
    pp.daily = { lastDay: dayKey(), streak: idx };
  });
  return DAILY_REWARDS[idx];
}

export function wheelState(p: Profile = profile()) {
  if (p.wheel.day !== dayKey()) return { free: true, adSpins: AD_SPINS_PER_DAY };
  return { free: p.wheel.free, adSpins: Math.max(0, AD_SPINS_PER_DAY - p.wheel.adSpins) };
}

export function useWheelSpin(viaAd: boolean) {
  mutate((p) => {
    if (p.wheel.day !== dayKey()) p.wheel = { day: dayKey(), free: true, adSpins: 0 };
    if (viaAd) p.wheel.adSpins++;
    else p.wheel.free = false;
  });
}

// ---------------------------------------------------------------- Misiones y seguimiento

export type GameEvent =
  | { type: 'dart'; hit: Hit }
  | { type: 'turn'; total: number }
  | { type: 'match'; won: boolean; online: boolean; checkoutDouble: boolean; ranked: boolean }
  | { type: 'chest' }
  | { type: 'upgrade' }
  | { type: 'training' };

export function ensureDaily() {
  const p = profile();
  const today = dayKey();
  if (p.missions.day !== today) {
    mutate((pp) => {
      pp.missions = { day: today, list: generateMissions(pp, today), rerolls: 0 };
    });
  }
  const s = currentSeason();
  if (p.season.id !== s.id) {
    mutate((pp) => {
      pp.season = { id: s.id, xp: 0, premium: false, claimedFree: [], claimedPremium: [] };
    });
  }
  if (p.shop.day !== today) refreshShop();
}

export function track(ev: GameEvent) {
  mutate((p) => {
    const bump = (kind: string, n = 1) => {
      for (const m of p.missions.list) if (m.kind === kind && !m.claimed) m.progress = Math.min(m.target, m.progress + n);
    };
    switch (ev.type) {
      case 'dart':
        p.stats.darts++;
        p.stats.points += ev.hit.points;
        bump('darts');
        if (ev.hit.ring === 'T') {
          p.stats.trebles++;
          bump('treble');
        }
        if (ev.hit.ring === 'D' || ev.hit.ring === 'DB') {
          p.stats.doubles++;
          bump('double');
        }
        if (ev.hit.ring === 'DB' || ev.hit.ring === 'SB') {
          p.stats.bulls++;
          bump('bull');
        }
        break;
      case 'turn':
        if (ev.total >= 100) {
          p.stats.tons++;
          bump('ton');
        }
        if (ev.total >= 60) bump('score60');
        if (ev.total === 180) p.stats.s180++;
        break;
      case 'match':
        bump('play');
        if (ev.online) bump('online');
        if (ev.won) {
          bump('win');
          if (ev.checkoutDouble) bump('checkout');
        }
        break;
      case 'chest':
        bump('chest');
        break;
      case 'upgrade':
        bump('upgrade');
        break;
      case 'training':
        bump('training');
        break;
    }
  });
}

export function claimMission(id: string): Reward | null {
  const p = profile();
  const m = p.missions.list.find((x) => x.id === id);
  if (!m || m.claimed || m.progress < m.target) return null;
  mutate((pp) => {
    const mm = pp.missions.list.find((x) => x.id === id)!;
    mm.claimed = true;
  });
  return { ...m.reward, seasonXp: m.seasonXp };
}

export function rerollMission(id: string, cost: number): boolean {
  const p = profile();
  if (p.gems < cost) return false;
  mutate((pp) => {
    const idx = pp.missions.list.findIndex((x) => x.id === id);
    if (idx < 0) return;
    pp.gems -= cost;
    pp.missions.rerolls++;
    const fresh = generateMissions(pp, dayKey() + '_r' + pp.missions.rerolls)[idx];
    pp.missions.list[idx] = { ...fresh, id: id + 'r' + pp.missions.rerolls };
  });
  return true;
}

export function claimAchievement(id: string): number {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return 0;
  const p = profile();
  const claimed = p.achievements[id] ?? 0;
  if (claimed >= a.tiers.length || a.value(p) < a.tiers[claimed]) return 0;
  const gems = a.gems[claimed];
  mutate((pp) => {
    pp.achievements[id] = claimed + 1;
    pp.gems += gems;
  });
  return gems;
}

// ---------------------------------------------------------------- Pase de temporada

export function addSeasonXp(p: Profile, xp: number) {
  p.season.xp += Math.round(xp * (isVip(p) ? 1.25 : 1));
}

export function claimSeasonTier(tier: number, track: 'free' | 'premium'): Reward | null {
  const p = profile();
  const reached = seasonTier(p.season.xp);
  if (tier > reached) return null;
  if (track === 'premium' && !p.season.premium) return null;
  const list = track === 'free' ? p.season.claimedFree : p.season.claimedPremium;
  if (list.includes(tier)) return null;
  mutate((pp) => {
    (track === 'free' ? pp.season.claimedFree : pp.season.claimedPremium).push(tier);
  });
  const t = seasonTiers()[tier - 1];
  return track === 'free' ? t.free : t.premium;
}

export function seasonClaimable(p: Profile = profile()): number {
  const reached = seasonTier(p.season.xp);
  let n = 0;
  for (let i = 1; i <= reached; i++) {
    if (!p.season.claimedFree.includes(i)) n++;
    if (p.season.premium && !p.season.claimedPremium.includes(i)) n++;
  }
  return n;
}

// ---------------------------------------------------------------- Tienda diaria

export function refreshShop() {
  mutate((p) => {
    const day = dayKey();
    const r = rng(hashStr(p.id + 'shop' + day));
    const arena = arenaForTrophies(p.bestTrophies);
    const offers: ShopOffer[] = [];
    offers.push({ id: day + '_free', kind: 'free', price: {}, count: r() < 0.5 ? 60 + arena * 40 : 0, bought: false });
    const pool = ALL_ITEMS.filter((i) => i.arena <= arena + 1 && !i.exclusive);
    const owned = pool.filter((i) => p.items[i.id]);
    const pick = (rar: string[]) => {
      let opts = pool.filter((i) => rar.includes(i.rarity));
      if (!opts.length) opts = ALL_ITEMS.filter((i) => rar.includes(i.rarity) && !i.exclusive);
      const ownedOpts = owned.filter((i) => rar.includes(i.rarity));
      const src = ownedOpts.length && r() < 0.7 ? ownedOpts : opts;
      return src[Math.floor(r() * src.length)];
    };
    const c1 = pick(['common']);
    offers.push({ id: day + '_c1', kind: 'card', itemId: c1.id, count: 10, price: { coins: 100 }, bought: false });
    const c2 = pick(['common', 'rare']);
    offers.push({ id: day + '_c2', kind: 'card', itemId: c2.id, count: c2.rarity === 'rare' ? 5 : 15, price: { coins: c2.rarity === 'rare' ? 500 : 150 }, bought: false });
    const c3 = pick(['rare']);
    offers.push({ id: day + '_c3', kind: 'card', itemId: c3.id, count: 6, price: { coins: 700 }, bought: false });
    const c4 = pick(['epic']);
    offers.push({ id: day + '_c4', kind: 'card', itemId: c4.id, count: 2, price: { gems: 60 }, bought: false });
    offers.push({ id: day + '_ch', kind: 'chest', chest: r() < 0.3 ? 'epic' : 'gold', price: { gems: r() < 0.3 ? 280 : 120 }, bought: false });
    p.shop = { day, offers };
  });
}

export function buyOffer(id: string): Reward | null {
  const p = profile();
  const o = p.shop.offers.find((x) => x.id === id);
  if (!o || o.bought) return null;
  if ((o.price.coins ?? 0) > p.coins || (o.price.gems ?? 0) > p.gems) return null;
  mutate((pp) => {
    const oo = pp.shop.offers.find((x) => x.id === id)!;
    oo.bought = true;
    pp.coins -= o.price.coins ?? 0;
    pp.gems -= o.price.gems ?? 0;
  });
  if (o.kind === 'free') return o.count ? { coins: o.count } : { gems: 5 };
  if (o.kind === 'card' && o.itemId) return { cards: [{ id: o.itemId, count: o.count ?? 1 }] };
  if (o.kind === 'chest' && o.chest) return { chest: o.chest };
  return null;
}

/** Compra con gemas (cofres de la tienda, monedas, cosméticos). */
export function spend(price: { coins?: number; gems?: number }): boolean {
  const p = profile();
  if ((price.coins ?? 0) > p.coins || (price.gems ?? 0) > p.gems) return false;
  mutate((pp) => {
    pp.coins -= price.coins ?? 0;
    pp.gems -= price.gems ?? 0;
  });
  return true;
}

export const COIN_PACKS = [
  { id: 'coins_s', coins: 1000, gems: 60 },
  { id: 'coins_m', coins: 5500, gems: 300 },
  { id: 'coins_l', coins: 24000, gems: 1200 },
];

export const SHOP_CHESTS: ChestType[] = ['silver', 'gold', 'epic', 'legendary'];

// ---------------------------------------------------------------- Anuncios

export function shouldShowInterstitial(p: Profile = profile()): boolean {
  if (p.purchases.removeAds || isVip(p)) return false;
  if (p.stats.matches < 3) return false; // nunca en las primeras partidas
  // como mucho uno cada 3 partidas con copas y 4 minutos (anuncios tras cada partida es la queja nº 1)
  return p.ads.counter >= 3 && Date.now() - p.ads.lastInterstitial > 240_000;
}

export function noteMatchForAds() {
  mutate((p) => (p.ads.counter += 1));
}

export function noteInterstitialShown() {
  mutate((p) => {
    p.ads.counter = 0;
    p.ads.lastInterstitial = Date.now();
  });
}

// ---------------------------------------------------------------- Cosméticos

export function ownsCosmetic(p: Profile, key: string): boolean {
  if (key.startsWith('board:')) return p.ownedBoards.includes(key.slice(6));
  if (key.startsWith('emote:')) return p.ownedEmotes.includes(key.slice(6));
  return p.ownedAvatar.includes(key);
}

export function buyCosmetic(key: string, price: { coins?: number; gems?: number }): boolean {
  if (!spend(price)) return false;
  mutate((p) => {
    grantItem(p, key.startsWith('board:') || key.startsWith('emote:') ? key : 'avatar:' + key);
  });
  return true;
}

export { BOARD_SKINS, EMOTES };
