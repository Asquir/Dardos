// Apertura de cofre: cae el cofre 3D, se abre al tocar y las cartas salen una a una.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { useStore, fmtNum } from '../../core/store';
import { ui, closeChest } from '../state';
import { chestView } from '../../engine/chestView';
import { CHESTS } from '../../meta/chests';
import { getItem, RARITY_INFO, type Rarity } from '../../meta/catalog';
import { profile } from '../../meta/profile';
import { upgradeInfo } from '../../meta/economy';
import { ItemThumb, RewardList, cosmeticName } from '../components/common';
import { Coin, Gem } from '../icons';
import { audio } from '../../services/audio';
import { haptics } from '../../services/haptics';
import { confetti } from '../fx';
import { noteTutorialChestOpened } from './Tutorial';

type Step = { kind: 'coins' | 'gems'; value: number } | { kind: 'card'; id: string; count: number } | { kind: 'item'; id: string };

export function ChestOpen() {
  const s = useStore(ui);
  const c = s.chest!;
  const steps = useMemo<Step[]>(() => {
    const out: Step[] = [];
    if (c.reward.coins) out.push({ kind: 'coins', value: c.reward.coins });
    if (c.reward.gems) out.push({ kind: 'gems', value: c.reward.gems });
    for (const cd of c.reward.cards ?? []) out.push({ kind: 'card', id: cd.id, count: cd.count });
    if (c.reward.item) out.push({ kind: 'item', id: c.reward.item });
    return out;
  }, [c]);
  const best = useMemo<Rarity>(() => {
    const order: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
    let b: Rarity = 'common';
    for (const st of steps) if (st.kind === 'card' && order.indexOf(getItem(st.id).rarity) > order.indexOf(b)) b = getItem(st.id).rarity;
    return b;
  }, [steps]);
  const [phase, setPhase] = useState<'drop' | 'closed' | 'reveal' | 'summary'>('drop');
  const [i, setI] = useState(-1);
  const view = chestView();

  useEffect(() => {
    view.present(c.type, best);
    audio.whooshUi();
    const t = setTimeout(() => {
      setPhase('closed');
      audio.chestShake();
      haptics.medium();
    }, 750);
    return () => clearTimeout(t);
  }, [c]);

  const showStep = (k: number) => {
    const st = steps[k];
    if (!st) return;
    if (st.kind === 'coins') audio.coin();
    else if (st.kind === 'gems') audio.gem();
    else if (st.kind === 'card') {
      const r = getItem(st.id).rarity;
      audio.card(r);
      view.pulse(RARITY_INFO[r].glow);
      if (r === 'legendary' || r === 'epic') {
        haptics.heavy();
        confetti(r === 'legendary' ? 160 : 70);
      } else haptics.light();
    } else audio.card('legendary');
  };

  const tap = () => {
    if (phase === 'drop') return;
    if (phase === 'closed') {
      view.tapShake();
      audio.chestShake();
      haptics.medium();
      setTimeout(() => {
        view.open();
        audio.chestOpen();
        haptics.heavy();
        setPhase('reveal');
        setI(0);
        showStep(0);
      }, 380);
      setPhase('reveal');
      return;
    }
    if (phase === 'reveal') {
      const next = i + 1;
      if (next >= steps.length) {
        setPhase('summary');
        audio.pop();
        return;
      }
      setI(next);
      showStep(next);
    }
  };

  const done = () => {
    audio.click();
    noteTutorialChestOpened();
    closeChest();
  };

  const st = phase === 'reveal' && i >= 0 ? steps[i] : null;
  return (
    <div class="chest-layer">
      <div class="tapzone" onClick={tap} />
      <div class="chest-title outline">{c.title ?? CHESTS[c.type].name}</div>
      {phase === 'closed' && <div class="chest-hint outline">¡Toca para abrir!</div>}
      {phase === 'reveal' && i >= 0 && <div class="chest-left">{steps.length - i - 1}</div>}
      {st && <StepCard key={i} st={st} />}
      {phase === 'reveal' && i >= 0 && <div class="chest-hint outline" style={{ opacity: 0.8 }}>Toca para continuar</div>}
      {phase === 'summary' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(6,8,24,.82)', padding: '20px', animation: 'fadeIn .3s' }}>
          <div class="display outline" style={{ fontSize: '30px', marginBottom: '6px' }}>
            ¡Has conseguido!
          </div>
          <div class="scroll" style={{ maxHeight: '60vh', width: '100%' }}>
            <RewardList reward={c.reward} />
          </div>
          <button class="btn big shine" style={{ marginTop: '16px', minWidth: '220px' }} onClick={done}>
            Continuar
          </button>
        </div>
      )}
    </div>
  );
}

function StepCard({ st }: { st: Step }) {
  if (st.kind === 'coins' || st.kind === 'gems') {
    return (
      <div class="reveal-card" style={{ ['--rc' as string]: st.kind === 'coins' ? '#ffc93a' : '#3fd6ff', ['--rc1' as string]: st.kind === 'coins' ? '#b8860b' : '#2a6dff', ['--rc2' as string]: st.kind === 'coins' ? '#5a3a00' : '#1b1466' }}>
        {st.kind === 'coins' ? <Coin style={{ width: '120px', height: '120px' }} /> : <Gem style={{ width: '120px', height: '120px' }} />}
        <div class="cnt outline">{fmtNum(st.value)}</div>
        <div class="nm outline">{st.kind === 'coins' ? 'Monedas' : 'Gemas'}</div>
      </div>
    );
  }
  if (st.kind === 'item') {
    return (
      <div class="reveal-card" style={{ ['--rc' as string]: '#ffb31a', ['--rc1' as string]: '#d6861a', ['--rc2' as string]: '#6e3a05' }}>
        <div style={{ fontSize: '90px' }}>🎁</div>
        <div class="nm outline">{cosmeticName(st.id)}</div>
        <div class="rarity-tag" style={{ background: '#ffb31a', color: '#10132e' }}>
          ¡EXCLUSIVO!
        </div>
      </div>
    );
  }
  const cs = st as Extract<Step, { kind: 'card' }>;
  const def = getItem(cs.id);
  const r = RARITY_INFO[def.rarity];
  const p = profile();
  const own = p.items[cs.id];
  const isNew = own && own.level === 1 && own.cards === cs.count - 1;
  const u = upgradeInfo(p, cs.id);
  const colors: Record<Rarity, [string, string]> = { common: ['#556b8a', '#2b3650'], rare: ['#2c63c9', '#16306e'], epic: ['#7a35c4', '#3b1566'], legendary: ['#d6861a', '#6e3a05'] };
  return (
    <div class="reveal-card" style={{ ['--rc' as string]: r.color, ['--rc1' as string]: colors[def.rarity][0], ['--rc2' as string]: colors[def.rarity][1] }}>
      {isNew && <span class="chip-new">¡NUEVO!</span>}
      <ItemThumb id={cs.id} />
      <div class="cnt outline">x{cs.count}</div>
      <div class="nm outline">{def.name}</div>
      <div class="rarity-tag" style={{ background: r.color, color: '#10132e', marginTop: '4px' }}>
        {r.name}
      </div>
      {!u.max && (
        <div class="progress" style={{ marginTop: '8px' }}>
          <i style={{ width: Math.min(100, (u.cards / u.need) * 100) + '%' }} />
          <span>
            {u.cards}/{u.need} {u.enoughCards ? '· ¡Mejorable!' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
