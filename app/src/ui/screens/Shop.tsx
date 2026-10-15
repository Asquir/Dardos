// Tienda: ofertas, ofertas diarias, cofres, gemas (compras reales) y monedas.

import { useEffect, useRef } from 'preact/hooks';
import { useStore, fmtNum, useNow, fmtTime } from '../../core/store';
import { profileStore, isVip } from '../../meta/profile';
import { ui, openModal, toast } from '../state';
import { buyOffer, spend, COIN_PACKS, SHOP_CHESTS, adChestsLeft, claimAdChest } from '../../meta/economy';
import { CHESTS } from '../../meta/chests';
import { getItem, RARITY_INFO } from '../../meta/catalog';
import { PRODUCTS, iap } from '../../services/iap';
import { buyProduct, restorePurchases } from '../purchase';
import { claim } from '../rewards';
import { ChestImg, ItemThumb, Price } from '../components/common';
import { CoinPile, Gem, GemPile, InfoIco, AdIco, Crown, NoAdsIco, GiftIco } from '../icons';
import { audio } from '../../services/audio';
import { ads } from '../../services/ads';
import { openChestReward } from '../rewards';

export function Shop() {
  const p = useStore(profileStore);
  const s = useStore(ui);
  const now = useNow(1000);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sec = s.params.section as string | undefined;
    if (sec) document.getElementById('shop-' + sec)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [s.params.section]);
  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);
  const starter = PRODUCTS.find((x) => x.id === 'starter_pack')!;
  const showStarter = !p.purchases.starterPack && now - p.createdAt < 72 * 3600 * 1000;

  const buyChest = (t: (typeof SHOP_CHESTS)[number]) => {
    const price = CHESTS[t].price ?? 0;
    openModal({
      kind: 'confirm',
      title: CHESTS[t].name,
      ok: `Comprar por ${price} 💎`,
      text: (
        <div class="col" style={{ alignItems: 'center' }}>
          <ChestImg type={t} style={{ width: '120px' }} />
          <div style={{ fontWeight: 800 }}>{CHESTS[t].cards} cartas o más · Monedas y gemas</div>
          <button class="btn tiny dark" onClick={() => openModal({ kind: 'odds', chest: t })}>
            <InfoIco class="ico" /> Probabilidades
          </button>
        </div>
      ),
      onOk: () => {
        if (!spend({ gems: price })) {
          audio.error();
          toast('No tienes gemas suficientes', 'bad');
          return;
        }
        claim({ chest: t }, CHESTS[t].name);
      },
    });
  };

  return (
    <div class="screen dim">
      <div class="scroll grow content pad" ref={scroller}>
        <div id="shop-offers" />
        {showStarter && (
          <div class="offer-banner" style={{ marginTop: '6px' }}>
            <div class="art">
              <GemPile n={4} />
            </div>
            <div class="info">
              <h3 class="outline">¡Pack de Inicio!</h3>
              <ul>
                <li>500 gemas + 5.000 monedas</li>
                <li>Cofre Épico + Aleta legendaria "Ala de Oro"</li>
              </ul>
              <div class="row">
                <button class="btn small gold shine" onClick={() => buyProduct('starter_pack')}>
                  {iap.priceOf('starter_pack') || starter.price}
                </button>
                <span class="pill">⏳ {fmtTime((p.createdAt + 72 * 3600 * 1000 - now) / 1000)}</span>
              </div>
            </div>
          </div>
        )}

        <div class="section-title outline">
          Ofertas del día <span class="line" />
          <span class="pill">⏳ {fmtTime((tomorrow.getTime() - now) / 1000)}</span>
        </div>
        <div class="shop-grid">
          {p.shop.offers.map((o) => {
            const def = o.itemId ? getItem(o.itemId) : null;
            return (
              <div key={o.id} class={'shop-card' + (o.bought ? ' sold' : '')} style={def ? { borderColor: RARITY_INFO[def.rarity].color } : undefined}>
                <div class="art">
                  {o.kind === 'free' && <GiftIco />}
                  {o.kind === 'card' && o.itemId && <ItemThumb id={o.itemId} />}
                  {o.kind === 'chest' && o.chest && <ChestImg type={o.chest} />}
                </div>
                <div class="t">{o.kind === 'free' ? 'Regalo diario' : o.kind === 'chest' && o.chest ? CHESTS[o.chest].name : def?.name}</div>
                {o.kind === 'card' && <div class="amt">x{o.count}</div>}
                {o.kind === 'free' && <div class="amt">{o.count ? `${o.count} 🪙` : '5 💎'}</div>}
                {o.kind === 'chest' && <span class="bonus">-30%</span>}
                <button
                  class={'btn tiny ' + (o.kind === 'free' ? '' : o.price.gems ? 'purple' : 'gold')}
                  disabled={o.bought}
                  onClick={() => {
                    const r = buyOffer(o.id);
                    if (!r) {
                      audio.error();
                      return toast('No te alcanza', 'bad');
                    }
                    claim(r, o.kind === 'free' ? '¡Regalo!' : '¡Comprado!');
                  }}
                >
                  {o.bought ? 'Comprado' : <Price price={o.price} />}
                </button>
              </div>
            );
          })}
        </div>

        <div class="section-title outline">
          Cofres <span class="line" />
        </div>
        <div class="shop-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <div class="shop-card" style={{ background: 'linear-gradient(180deg,#5a2bb0,#2a1466)' }}>
            <div class="art">
              <AdIco />
            </div>
            <div class="t">Cofre por anuncio ({adChestsLeft(p)}/3 hoy)</div>
            <button
              class="btn tiny purple"
              disabled={adChestsLeft(p) <= 0}
              onClick={async () => {
                const ok = await ads.rewarded();
                if (!ok) return toast('Mira el vídeo completo para abrir el cofre', 'bad');
                const r = claimAdChest();
                openChestReward(r.type, r.reward);
              }}
            >
              <AdIco class="ico" /> Ver vídeo
            </button>
          </div>
          {SHOP_CHESTS.map((t) => (
            <div class="shop-card" key={t}>
              <div class="art" style={{ width: '90px', height: '90px' }}>
                <ChestImg type={t} />
              </div>
              <div class="t">{CHESTS[t].name}</div>
              <button class="btn tiny purple" onClick={() => buyChest(t)}>
                <Gem class="ico" /> {CHESTS[t].price}
              </button>
            </div>
          ))}
        </div>

        <div class="section-title outline" id="shop-gems">
          Gemas <span class="line" />
        </div>
        <div class="shop-grid">
          {PRODUCTS.filter((x) => x.kind === 'gems').map((g, i) => (
            <div class="shop-card" key={g.id}>
              {g.badge && <span class="bonus">{g.badge}</span>}
              <div class="art">
                <GemPile n={i + 1} />
              </div>
              <div class="amt">
                {fmtNum(g.gems ?? 0)}
                {g.bonus ? <span style={{ fontSize: '12px', color: '#7dffb0' }}> +{g.bonus}</span> : null}
              </div>
              <div class="t">{g.title}</div>
              <button class="btn tiny" onClick={() => buyProduct(g.id)}>
                {iap.priceOf(g.id)}
              </button>
            </div>
          ))}
        </div>

        <div class="section-title outline">
          Especiales <span class="line" />
        </div>
        <div class="col">
          {!p.purchases.removeAds && (
            <div class="offer-banner noads">
              <div class="art">
                <NoAdsIco />
              </div>
              <div class="info">
                <h3 class="outline">Sin anuncios</h3>
                <ul>
                  <li>Adiós a los anuncios entre partidas, para siempre</li>
                  <li>Los vídeos opcionales con premio siguen disponibles</li>
                </ul>
                <button class="btn small gold" onClick={() => buyProduct('remove_ads')}>
                  {iap.priceOf('remove_ads')}
                </button>
              </div>
            </div>
          )}
          <div class="offer-banner vip">
            <div class="art">
              <Crown />
            </div>
            <div class="info">
              <h3 class="outline">Club VIP · 30 días</h3>
              <ul>
                <li>300 gemas al instante + sin anuncios entre partidas</li>
                <li>Cofres se abren 2x más rápido y 2 a la vez</li>
                <li>+50% monedas al ganar · +25% XP del pase</li>
              </ul>
              <div class="row">
                <button class="btn small gold" onClick={() => buyProduct('vip_month')}>
                  {iap.priceOf('vip_month')}
                </button>
                {isVip(p) && <span class="pill">VIP: {fmtTime((p.purchases.vipUntil - now) / 1000)}</span>}
              </div>
            </div>
          </div>
          <div class="offer-banner legend">
            <div class="art">
              <ChestImg type="legendary" />
            </div>
            <div class="info">
              <h3 class="outline">Pack Leyenda</h3>
              <ul>
                <li>1.500 gemas + 30.000 monedas</li>
                <li>Cofre Legendario + cuerpo "Rey de la Diana"</li>
              </ul>
              <button class="btn small gold" onClick={() => buyProduct('pro_bundle')}>
                {iap.priceOf('pro_bundle')}
              </button>
            </div>
          </div>
        </div>

        <div class="section-title outline" id="shop-coins">
          Monedas <span class="line" />
        </div>
        <div class="shop-grid">
          {COIN_PACKS.map((c, i) => (
            <div class="shop-card" key={c.id}>
              <div class="art">
                <CoinPile n={i * 2 + 1} />
              </div>
              <div class="amt">{fmtNum(c.coins)}</div>
              <div class="t">monedas</div>
              <button
                class="btn tiny purple"
                onClick={() => {
                  if (!spend({ gems: c.gems })) {
                    audio.error();
                    return toast('No tienes gemas suficientes', 'bad');
                  }
                  claim({ coins: c.coins }, '¡Monedas!');
                }}
              >
                <Gem class="ico" /> {c.gems}
              </button>
            </div>
          ))}
        </div>
        <div class="col" style={{ margin: '18px 0 10px', alignItems: 'center' }}>
          <button class="btn tiny dark" onClick={() => restorePurchases()}>
            Restaurar compras
          </button>
          <div class="muted" style={{ fontSize: '11px', fontWeight: 700, textAlign: 'center' }}>
            Los precios se muestran en tu moneda local en la tienda de tu dispositivo. Las gemas y monedas son objetos virtuales sin valor monetario real.
          </div>
        </div>
        <div style={{ height: '10px' }} />
      </div>
    </div>
  );
}
