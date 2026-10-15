// Aplicar compras reales (gemas, packs, sin anuncios, VIP, pase) tras confirmarse en la tienda.

import { iap, productById } from '../services/iap';
import { mutate, profile } from '../meta/profile';
import { claim } from './rewards';
import { toast } from './state';
import { audio } from '../services/audio';
import { ads } from '../services/ads';
import { confetti } from './fx';
import type { Reward } from '../meta/chests';

export async function buyProduct(id: string): Promise<boolean> {
  const def = productById(id);
  if (!def) return false;
  if (!iap.available()) {
    toast('Las compras no están disponibles ahora mismo', 'bad');
    return false;
  }
  if (def.kind === 'starter' && profile().purchases.starterPack) return false;
  if (def.kind === 'noads' && profile().purchases.removeAds) return false;
  const ok = await iap.buy(id);
  if (!ok) return false;
  mutate((p) => {
    p.purchases.history = [...p.purchases.history, `${Date.now()}:${id}`].slice(-50);
    p.purchases.spent += parseFloat(def.price.replace(',', '.')) || 0;
  });
  audio.chestOpen();
  confetti(120);
  switch (def.kind) {
    case 'gems':
      claim({ gems: (def.gems ?? 0) + (def.bonus ?? 0) }, '¡Gracias por tu compra!');
      break;
    case 'starter':
    case 'bundle': {
      mutate((p) => {
        if (def.kind === 'starter') p.purchases.starterPack = true;
      });
      const r: Reward = { gems: def.gems, coins: def.coins, chest: def.chest, item: def.item };
      claim(r, def.title);
      break;
    }
    case 'noads':
      mutate((p) => (p.purchases.removeAds = true));
      void ads.hideBanner();
      toast('¡Anuncios eliminados para siempre! 🎉', 'good');
      break;
    case 'vip':
      mutate((p) => (p.purchases.vipUntil = Math.max(Date.now(), p.purchases.vipUntil) + 30 * 86400000));
      claim({ gems: def.gems }, '¡Bienvenido al Club VIP!');
      break;
    case 'pass':
      mutate((p) => (p.season.premium = true));
      toast('¡Pase de Temporada Premium activado!', 'good');
      break;
  }
  return true;
}

/** Restaurar compras no consumibles (botón obligatorio en iOS). */
export async function restorePurchases() {
  const ids = await iap.restore();
  let n = 0;
  mutate((p) => {
    if (ids.includes('remove_ads') && !p.purchases.removeAds) {
      p.purchases.removeAds = true;
      n++;
    }
    if (ids.includes('starter_pack') && !p.purchases.starterPack) {
      p.purchases.starterPack = true;
      n++;
    }
  });
  toast(n ? `Compras restauradas: ${n}` : 'No hay compras que restaurar', n ? 'good' : 'info');
}
