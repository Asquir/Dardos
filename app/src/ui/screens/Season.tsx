// Pase de temporada: 35 niveles con recompensas gratuitas y premium.

import { useStore, useNow, fmtTime } from '../../core/store';
import { profileStore } from '../../meta/profile';
import { currentSeason, seasonTiers, seasonTier, SEASON_XP_PER_TIER, SEASON_TIERS } from '../../meta/progression';
import { claimSeasonTier } from '../../meta/economy';
import { Back, Crown, Lock } from '../icons';
import { go, toast } from '../state';
import { audio } from '../../services/audio';
import { RewardIcon, rewardLabel, Progress } from '../components/common';
import { claim } from '../rewards';
import { buyProduct } from '../purchase';
import { iap } from '../../services/iap';
import type { Reward } from '../../meta/chests';

export function Season() {
  const p = useStore(profileStore);
  const now = useNow(1000);
  const season = currentSeason(now);
  const tiers = seasonTiers();
  const reached = seasonTier(p.season.xp);
  const inTier = p.season.xp - reached * SEASON_XP_PER_TIER;
  const take = (i: number, track: 'free' | 'premium') => {
    const r = claimSeasonTier(i, track);
    if (!r) {
      if (track === 'premium' && !p.season.premium) toast('Necesitas el Pase Premium', 'info');
      return;
    }
    audio.coin();
    claim(r, `Nivel ${i} del pase`);
  };
  return (
    <div class="screen full dim">
      <div class="pad row">
        <button class="icon-btn" onClick={() => go('home')} aria-label="Volver">
          <Back />
        </button>
        <div class="grow" style={{ textAlign: 'center' }}>
          <div class="display outline" style={{ fontSize: '24px' }}>
            Temporada {season.id}
          </div>
          <div class="muted" style={{ fontSize: '12px', fontWeight: 800 }}>
            Termina en {fmtTime((season.endsAt - now) / 1000)}
          </div>
        </div>
        <div style={{ width: '38px' }} />
      </div>
      <div class="pad content col" style={{ marginTop: '8px' }}>
        <Progress value={reached >= SEASON_TIERS ? SEASON_XP_PER_TIER : inTier} max={SEASON_XP_PER_TIER} color="purple" label={reached >= SEASON_TIERS ? '¡Pase completado!' : `Nivel ${reached} · ${inTier}/${SEASON_XP_PER_TIER} puntos`} />
        {!p.season.premium && (
          <div class="offer-banner" style={{ padding: '10px' }}>
            <Crown style={{ width: '56px', height: '56px', flex: 'none', position: 'relative', zIndex: 1 }} />
            <div class="info">
              <h3 class="outline" style={{ fontSize: '18px' }}>
                Pase Premium
              </h3>
              <div style={{ fontWeight: 800, fontSize: '12px' }}>Aleta legendaria exclusiva, cofres épicos, gemas y mucho más.</div>
            </div>
            <button class="btn small gold shine" style={{ position: 'relative', zIndex: 1 }} onClick={() => buyProduct('season_pass')}>
              {iap.priceOf('season_pass')}
            </button>
          </div>
        )}
        <div class="row muted" style={{ fontWeight: 900, fontSize: '12px', justifyContent: 'space-around' }}>
          <span>GRATIS</span>
          <span>PREMIUM 👑</span>
        </div>
      </div>
      <div class="scroll grow content pad" style={{ paddingTop: '6px', paddingBottom: '20px' }}>
        {tiers.map((t, k) => {
          const i = k + 1;
          const got = i <= reached;
          return (
            <div class="season-row" key={i}>
              <TierReward r={t.free} claimed={p.season.claimedFree.includes(i)} claimable={got && !p.season.claimedFree.includes(i)} onClick={() => take(i, 'free')} />
              <div class={'season-tier' + (got ? ' reached' : '')}>{i}</div>
              <TierReward r={t.premium} premium locked={!p.season.premium} claimed={p.season.claimedPremium.includes(i)} claimable={got && p.season.premium && !p.season.claimedPremium.includes(i)} onClick={() => take(i, 'premium')} />
            </div>
          );
        })}
        <div class="muted" style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, marginTop: '12px' }}>
          Gana puntos de pase jugando partidas y completando misiones diarias.
        </div>
      </div>
    </div>
  );
}

function TierReward({ r, premium, locked, claimed, claimable, onClick }: { r: Reward; premium?: boolean; locked?: boolean; claimed: boolean; claimable: boolean; onClick: () => void }) {
  return (
    <button class={'season-reward' + (premium ? ' premium' : '') + (claimed ? ' claimed' : '') + (claimable ? ' claimable' : '')} onClick={onClick}>
      <RewardIcon reward={r} />
      <span class="v">{rewardLabel(r)}</span>
      {locked && <Lock class="lock-ov" />}
      {claimed && <span class="lock-ov">✅</span>}
    </button>
  );
}
