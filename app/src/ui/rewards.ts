// Conceder recompensas y mostrarlas con su animación (cofre, ventana de premio, subida de nivel).

import { grant } from '../meta/economy';
import { rollChest, type Reward } from '../meta/chests';
import { noteChestOpened } from '../meta/economy';
import { profile } from '../meta/profile';
import { arenaForTrophies } from '../meta/arenas';
import { openModal, showChest, bumpCurrency } from './state';
import { audio } from '../services/audio';
import { flyCurrency } from './fx';

/** Concede y muestra una recompensa. Los cofres incluidos se abren con animación. */
export function claim(reward: Reward, title = '¡Recompensa!', onDone?: () => void) {
  if (reward.chest) {
    const arena = arenaForTrophies(profile().bestTrophies);
    const content = rollChest(reward.chest, arena);
    const merged: Reward = {
      coins: (content.coins ?? 0) + (reward.coins ?? 0),
      gems: (content.gems ?? 0) + (reward.gems ?? 0),
      cards: [...(content.cards ?? []), ...(reward.cards ?? [])],
      item: reward.item,
      xp: reward.xp,
      seasonXp: reward.seasonXp,
    };
    const res = grant(merged);
    noteChestOpened();
    showChest({ type: reward.chest, reward: merged, title, onDone: () => (afterGrant(res.levelUps), onDone?.()) });
    return;
  }
  const res = grant(reward);
  if (reward.coins) {
    if (flyCurrency('coins', Math.ceil(reward.coins / 60))) audio.coinBurst(8);
    else bumpCurrency('coins');
  }
  if (reward.gems) {
    if (flyCurrency('gems', Math.ceil(reward.gems / 5))) audio.coinBurst(6, true);
    else bumpCurrency('gems');
  }
  const visible = reward.coins || reward.gems || reward.cards?.length || reward.item;
  if (visible) {
    audio.coin();
    openModal({ kind: 'reward', title, reward });
  }
  afterGrant(res.levelUps);
  onDone?.();
}

/** Abre un cofre con un contenido ya generado (huecos de cofres). */
export function openChestReward(type: Parameters<typeof showChest>[0]['type'], reward: Reward, onDone?: () => void) {
  const res = grant(reward);
  noteChestOpened();
  showChest({ type, reward, onDone: () => (afterGrant(res.levelUps), onDone?.()) });
}

export function afterGrant(levelUps: { level: number; reward: Reward }[]) {
  for (const l of levelUps) openModal({ kind: 'levelup', level: l.level, reward: l.reward });
}
