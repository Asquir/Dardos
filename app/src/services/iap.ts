// Compras dentro de la app (App Store / Google Play) mediante RevenueCat.
// En el navegador se simulan con un diálogo de confirmación (modo prueba, sin cobro).

import { Capacitor } from '@capacitor/core';
import { Purchases, PRODUCT_CATEGORY, type PurchasesStoreProduct } from '@revenuecat/purchases-capacitor';
import { Store } from '../core/store';

export type ProductKind = 'gems' | 'starter' | 'noads' | 'vip' | 'pass' | 'bundle';

export interface ProductDef {
  id: string; // identificador en App Store Connect / Google Play Console
  kind: ProductKind;
  title: string;
  gems?: number;
  bonus?: number;
  coins?: number;
  chest?: 'epic' | 'legendary' | 'gold';
  item?: string;
  /** precio de referencia (la tienda real muestra el precio local) */
  price: string;
  consumable: boolean;
  badge?: string;
  icon: string;
}

export const PRODUCTS: ProductDef[] = [
  { id: 'gems_80', kind: 'gems', title: 'Puñado de gemas', gems: 80, price: '0,99 €', consumable: true, icon: 'gems1' },
  { id: 'gems_500', kind: 'gems', title: 'Bolsa de gemas', gems: 500, bonus: 50, price: '4,99 €', consumable: true, icon: 'gems2', badge: 'Popular' },
  { id: 'gems_1200', kind: 'gems', title: 'Cofre de gemas', gems: 1200, bonus: 200, price: '9,99 €', consumable: true, icon: 'gems3' },
  { id: 'gems_2600', kind: 'gems', title: 'Barril de gemas', gems: 2600, bonus: 500, price: '19,99 €', consumable: true, icon: 'gems4', badge: 'Mejor valor' },
  { id: 'gems_7000', kind: 'gems', title: 'Montaña de gemas', gems: 7000, bonus: 1500, price: '49,99 €', consumable: true, icon: 'gems5' },
  { id: 'starter_pack', kind: 'starter', title: 'Pack de Inicio', gems: 500, coins: 5000, chest: 'epic', item: 'f_gold', price: '2,99 €', consumable: false, icon: 'starter', badge: '-80%' },
  { id: 'remove_ads', kind: 'noads', title: 'Sin anuncios', price: '3,99 €', consumable: false, icon: 'noads' },
  { id: 'vip_month', kind: 'vip', title: 'Club VIP (30 días)', gems: 300, price: '4,99 €', consumable: true, icon: 'vip' },
  { id: 'season_pass', kind: 'pass', title: 'Pase de Temporada', price: '4,99 €', consumable: true, icon: 'pass' },
  { id: 'pro_bundle', kind: 'bundle', title: 'Pack Leyenda', gems: 1500, coins: 30000, chest: 'legendary', item: 'b_king', price: '14,99 €', consumable: true, icon: 'bundle', badge: 'Exclusivo' },
];

export const productById = (id: string) => PRODUCTS.find((p) => p.id === id);

/** Confirmación simulada (web). */
export const mockPurchase = new Store<{ product: ProductDef; done: (ok: boolean) => void } | null>(null);

class IAP {
  private native = Capacitor.isNativePlatform();
  private storeProducts = new Map<string, PurchasesStoreProduct>();
  configured = false;

  async init(userId: string) {
    if (!this.native) return;
    const key = Capacitor.getPlatform() === 'ios' ? import.meta.env.VITE_REVENUECAT_IOS_KEY : import.meta.env.VITE_REVENUECAT_ANDROID_KEY;
    if (!key) {
      console.warn('RevenueCat: falta la clave API (VITE_REVENUECAT_*). Las compras están desactivadas.');
      return;
    }
    try {
      await Purchases.configure({ apiKey: key, appUserID: userId });
      this.configured = true;
      const { products } = await Purchases.getProducts({ productIdentifiers: PRODUCTS.map((p) => p.id), type: PRODUCT_CATEGORY.NON_SUBSCRIPTION });
      for (const p of products) this.storeProducts.set(p.identifier, p);
    } catch (e) {
      console.warn('RevenueCat no disponible', e);
    }
  }

  /** Precio local real si la tienda lo devolvió. */
  priceOf(id: string): string {
    return this.storeProducts.get(id)?.priceString ?? productById(id)?.price ?? '';
  }

  available(): boolean {
    return !this.native || this.configured;
  }

  /** Inicia la compra. Devuelve true si se completó. */
  async buy(id: string): Promise<boolean> {
    const def = productById(id);
    if (!def) return false;
    if (!this.native) {
      return new Promise<boolean>((res) => mockPurchase.set({ product: def, done: (ok) => (mockPurchase.set(null), res(ok)) }));
    }
    const sp = this.storeProducts.get(id);
    if (!sp) return false;
    try {
      await Purchases.purchaseStoreProduct({ product: sp });
      return true;
    } catch (e) {
      const err = e as { userCancelled?: boolean };
      if (!err.userCancelled) console.warn('Compra fallida', e);
      return false;
    }
  }

  /** Restaura compras no consumibles (obligatorio en iOS). */
  async restore(): Promise<string[]> {
    if (!this.native || !this.configured) return [];
    try {
      const { customerInfo } = await Purchases.restorePurchases();
      return customerInfo.nonSubscriptionTransactions.map((t) => t.productIdentifier);
    } catch {
      return [];
    }
  }
}

export const iap = new IAP();
