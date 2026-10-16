// Apertura de cofre: el cofre cae, se carga con varios toques y revienta; las cartas salen del cofre boca abajo
// y se dan la vuelta (con suspense en las épicas y legendarias), suben sus contadores y la barra de mejora,
// y al final un resumen con todo lo conseguido.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useStore, fmtNum } from '../../core/store';
import { ui, closeChest, go } from '../state';
import { chestView } from '../../engine/chestView';
import { CHESTS, type ChestType } from '../../meta/chests';
import { getItem, RARITY_INFO, type Rarity } from '../../meta/catalog';
import { profile } from '../../meta/profile';
import { upgradeInfo } from '../../meta/economy';
import { ItemThumb, cosmeticName } from '../components/common';
import { Coin, Gem } from '../icons';
import { audio } from '../../services/audio';
import { haptics } from '../../services/haptics';
import { confetti, countUp } from '../fx';
import { noteTutorialChestOpened } from './Tutorial';

const ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
/** Toques para abrir cada cofre (los grandes se hacen esperar un poco más). */
const TAPS: Record<ChestType, number> = { free: 1, wood: 2, silver: 2, club: 2, gold: 3, season: 3, epic: 3, legendary: 3 };
const TAP_HINT = ['¡Toca para abrir!', '¡Otra vez!', '¡Ya casi!'];
const CARD_BG: Record<Rarity, [string, string]> = { common: ['#556b8a', '#2b3650'], rare: ['#2c63c9', '#16306e'], epic: ['#7a35c4', '#3b1566'], legendary: ['#d6861a', '#6e3a05'] };
const BANNER: Partial<Record<Rarity, string>> = { epic: '¡ÉPICA!', legendary: '¡LEGENDARIA!' };
/** Cuánto dura el suspense antes de voltear. */
const SUSPENSE: Partial<Record<Rarity, number>> = { epic: 0.8, legendary: 1.25 };

interface CardStep {
  kind: 'card';
  id: string;
  count: number;
  rarity: Rarity;
  isNew: boolean;
  /** cartas antes y después de este cofre, y las que pide la siguiente mejora */
  before: number;
  after: number;
  need: number;
  max: boolean;
  level: number;
}
type Step = { kind: 'coins'; value: number } | { kind: 'gems'; value: number } | CardStep | { kind: 'item'; id: string };

const rarityOf = (st: Step): Rarity => (st.kind === 'card' ? st.rarity : st.kind === 'item' ? 'legendary' : 'common');
const isBig = (st: Step) => st.kind === 'item' || (st.kind === 'card' && (st.rarity === 'epic' || st.rarity === 'legendary'));

function colorsOf(st: Step): { rc: string; rc1: string; rc2: string } {
  if (st.kind === 'coins') return { rc: '#ffc93a', rc1: '#b8860b', rc2: '#5a3a00' };
  if (st.kind === 'gems') return { rc: '#3fd6ff', rc1: '#2a6dff', rc2: '#1b1466' };
  if (st.kind === 'item') return { rc: '#ffb31a', rc1: '#d6861a', rc2: '#6e3a05' };
  return { rc: RARITY_INFO[st.rarity].color, rc1: CARD_BG[st.rarity][0], rc2: CARD_BG[st.rarity][1] };
}

/** Pasos de la apertura: monedas, gemas, cartas de peor a mejor (la mejor al final) y el objeto exclusivo. */
function buildSteps(reward: { coins?: number; gems?: number; cards?: { id: string; count: number }[]; item?: string }): Step[] {
  const out: Step[] = [];
  if (reward.coins) out.push({ kind: 'coins', value: reward.coins });
  if (reward.gems) out.push({ kind: 'gems', value: reward.gems });
  const totals = new Map<string, number>();
  for (const cd of reward.cards ?? []) totals.set(cd.id, (totals.get(cd.id) ?? 0) + cd.count);
  const p = profile();
  const cards: CardStep[] = [];
  for (const [id, count] of totals) {
    const def = getItem(id);
    if (!def) continue;
    const own = p.items[id];
    const u = upgradeInfo(p, id);
    // el contenido ya está concedido: la primera carta de un objeto nuevo lo desbloquea
    const isNew = !!own && own.level === 1 && own.cards === count - 1;
    const after = own?.cards ?? 0;
    cards.push({ kind: 'card', id, count, rarity: def.rarity, isNew, before: isNew ? 0 : Math.max(0, after - count), after, need: u.need, max: u.max, level: u.level });
  }
  cards.sort((a, b) => ORDER.indexOf(a.rarity) - ORDER.indexOf(b.rarity) || a.count - b.count);
  out.push(...cards);
  if (reward.item) out.push({ kind: 'item', id: reward.item });
  return out;
}

export function ChestOpen() {
  const s = useStore(ui);
  const c = s.chest!;
  const steps = useMemo(() => buildSteps(c.reward), [c]);
  const best = useMemo<Rarity>(() => {
    let b: Rarity = 'common';
    for (const st of steps) if (ORDER.indexOf(rarityOf(st)) > ORDER.indexOf(b) && st.kind !== 'item') b = rarityOf(st);
    return b;
  }, [steps]);
  const taps = TAPS[c.type] ?? 2;
  const [phase, setPhase] = useState<'drop' | 'closed' | 'opening' | 'reveal' | 'summary'>('drop');
  const [tapsDone, setTapsDone] = useState(0);
  const [i, setI] = useState(-1);
  const [flipped, setFlipped] = useState(false);
  const [sus, setSus] = useState(false);
  const flipAt = useRef(0);
  const timers = useRef<number[]>([]);
  const view = chestView();

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  const clearTimers = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  };

  useEffect(() => {
    view.present(c.type, best);
    audio.whooshUi();
    later(() => {
      audio.chestLand();
      haptics.medium();
    }, 420);
    later(() => setPhase('closed'), 800);
    return clearTimers;
  }, [c]);

  const flip = (k: number) => {
    clearTimers();
    const st = steps[k];
    if (!st) return;
    setSus(false);
    setFlipped(true);
    flipAt.current = performance.now();
    if (st.kind === 'coins' || st.kind === 'gems') return;
    audio.cardFlip();
    const r = rarityOf(st);
    const info = RARITY_INFO[r];
    audio.card(r);
    view.reveal(st.kind === 'item' ? '#ffb31a' : info.glow, ORDER.indexOf(r) / 3);
    if (isBig(st)) {
      haptics.success();
      confetti(r === 'legendary' ? 170 : 80);
    } else if (r === 'rare') haptics.medium();
    else haptics.light();
  };

  const deal = (k: number) => {
    clearTimers();
    const st = steps[k];
    setI(k);
    if (!st) return;
    audio.cardWhoosh();
    if (st.kind === 'coins' || st.kind === 'gems') {
      // las monedas no se voltean: salen ya de cara y saltan del cofre
      setFlipped(true);
      setSus(false);
      flipAt.current = performance.now();
      const coins = st.kind === 'coins';
      view.spill(st.kind, coins ? Math.min(30, 8 + Math.round(st.value / 40)) : Math.min(16, 4 + st.value));
      if (coins) audio.coin();
      else audio.gem();
      audio.coinBurst(coins ? 9 : 6, !coins);
      haptics.light();
      return;
    }
    setFlipped(false);
    setSus(false);
    const r = rarityOf(st);
    const dur = SUSPENSE[r] ?? 0;
    if (!dur) {
      later(() => flip(k), 330);
      return;
    }
    // suspense: la carta sale boca abajo, tiembla y brilla del color de su rareza
    later(() => {
      setSus(true);
      view.suspense(st.kind === 'item' ? '#ffb31a' : RARITY_INFO[r].glow, dur + 0.2);
      audio.suspense(dur, r === 'legendary');
      for (let t = 0; t < dur * 1000; t += 210) later(() => haptics.light(), t);
      later(() => flip(k), dur * 1000);
    }, 360);
  };

  const toSummary = () => {
    clearTimers();
    setPhase('summary');
    audio.pop();
    // si quedaba sin ver algo gordo, que el cofre brille igualmente
    const rest = steps.slice(Math.max(0, i + 1));
    if (rest.some(isBig)) {
      view.reveal(RARITY_INFO[best].glow, 1);
      audio.card(best);
      confetti(90);
    }
  };

  const tap = () => {
    if (phase === 'drop' || phase === 'opening' || phase === 'summary') return;
    if (phase === 'closed') {
      const n = tapsDone + 1;
      if (n < taps) {
        setTapsDone(n);
        view.tapCharge(n / taps);
        audio.chestCharge(n / taps);
        haptics.medium();
        return;
      }
      setTapsDone(n);
      setPhase('opening');
      view.tapCharge(1);
      audio.chestCharge(1);
      haptics.heavy();
      later(() => {
        view.open();
        audio.chestOpen();
        if (best === 'legendary') audio.riser(0.5);
        haptics.heavy();
        setPhase('reveal');
        if (steps.length) later(() => deal(0), 260);
        else toSummary();
      }, 300);
      return;
    }
    // reveal
    if (i < 0) return;
    if (!flipped) return flip(i);
    if (performance.now() - flipAt.current < 260) return;
    if (i + 1 >= steps.length) return toSummary();
    deal(i + 1);
  };

  const done = () => {
    audio.click();
    noteTutorialChestOpened();
    closeChest();
  };
  const upgradable = steps.filter((st) => st.kind === 'card' && !st.max && st.after >= st.need).length;
  const goUpgrade = () => {
    done();
    go('collection');
  };

  const st = phase === 'reveal' && i >= 0 ? steps[i] : null;
  const tease = (best === 'epic' || best === 'legendary') && tapsDone >= 1 && phase !== 'reveal' && phase !== 'summary';
  const teaseColor = RARITY_INFO[best].glow;
  const left = steps.length - i - 1;
  return (
    <div class="chest-layer">
      <div class="tapzone" onClick={tap} />
      {(phase === 'drop' || phase === 'closed' || phase === 'opening') && <div class="chest-title outline">{c.title ?? CHESTS[c.type].name}</div>}
      {tease && (
        <div class="chest-tease" style={{ ['--tc' as string]: teaseColor }}>
          ✨ ¡Algo brilla dentro…!
        </div>
      )}
      {phase === 'closed' && (
        <>
          {taps > 1 && (
            <div class="chest-pips" style={{ ['--tc' as string]: tease ? teaseColor : '#ffd23a' }}>
              {Array.from({ length: taps }, (_, k) => (
                <i key={k} class={k < tapsDone ? 'on' : ''} />
              ))}
            </div>
          )}
          <div class="chest-hint outline" key={tapsDone}>
            {TAP_HINT[Math.min(tapsDone, TAP_HINT.length - 1)]}
          </div>
        </>
      )}
      {phase === 'reveal' && i >= 0 && left > 0 && (
        <div class="deck" key={'d' + i}>
          <i />
          <i />
          <i />
          <b>{left}</b>
        </div>
      )}
      {st && <DealCard key={i} st={st} flipped={flipped} sus={sus} />}
      {phase === 'reveal' && i >= 0 && flipped && <div class="chest-hint outline subtle">{left > 0 ? 'Toca para la siguiente' : 'Toca para ver el resumen'}</div>}
      {phase === 'reveal' && i >= 0 && left > 1 && (
        <button class="chest-skip" onClick={toSummary}>
          Abrir todo ⏩
        </button>
      )}
      {phase === 'summary' && <Summary steps={steps} title={c.title ?? CHESTS[c.type].name} upgradable={upgradable} onDone={done} onUpgrade={goUpgrade} />}
    </div>
  );
}

/** Carta que sale del cofre: vuela hasta el centro, (tiembla) y se da la vuelta. */
function DealCard({ st, flipped, sus }: { st: Step; flipped: boolean; sus: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const r = rarityOf(st);
  const col = colorsOf(st);
  const instant = st.kind === 'coins' || st.kind === 'gems';
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const from = chestView().screenPoint(0.3);
    const dx = from.x - (box.left + box.width / 2);
    const dy = from.y - (box.top + box.height / 2);
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(0.18) rotate(-28deg)`, opacity: 0 },
        { transform: `translate(${dx * 0.3}px, ${dy * 0.3 - 30}px) scale(0.8) rotate(-6deg)`, opacity: 1, offset: 0.45 },
        { transform: 'translate(0, -12px) scale(1.06) rotate(3deg)', offset: 0.75 },
        { transform: 'none' },
      ],
      { duration: 420, easing: 'cubic-bezier(0.25, 0.8, 0.35, 1)' },
    );
  }, []);
  const cls = ['deal', 'r-' + r, flipped ? 'flipped' : '', sus ? 'sus' : '', instant ? 'instant' : '', st.kind === 'item' ? 'r-item' : ''].join(' ');
  return (
    <div ref={ref} class={cls} style={{ ['--rc' as string]: col.rc, ['--rc1' as string]: col.rc1, ['--rc2' as string]: col.rc2, ['--sd' as string]: (SUSPENSE[r] ?? 0.8) + 's' }}>
      <div class="deal-aura" />
      {flipped && !instant && r !== 'common' && <div class="deal-burst" />}
      <div class="deal-flip">
        {!instant && (
          <div class="deal-face deal-back">
            <div class="logo" />
            <span>?</span>
          </div>
        )}
        <div class="deal-face deal-front">
          <Front st={st} flipped={flipped} />
        </div>
      </div>
      {flipped && st.kind === 'card' && BANNER[st.rarity] && <div class="deal-banner outline">{BANNER[st.rarity]}</div>}
      {flipped && st.kind === 'item' && <div class="deal-banner outline">¡EXCLUSIVO!</div>}
    </div>
  );
}

function Front({ st, flipped }: { st: Step; flipped: boolean }) {
  const cnt = useRef<HTMLSpanElement>(null);
  const [fill, setFill] = useState(false);
  const [stamp, setStamp] = useState(false);
  useEffect(() => {
    if (!flipped) return;
    const ids: number[] = [];
    if (st.kind === 'coins' || st.kind === 'gems') {
      countUp(cnt.current, st.value, 750);
    } else if (st.kind === 'card') {
      const n = st.count;
      const k = Math.min(n, 12);
      // x1, x2, x3… con un tic cada vez más agudo
      for (let j = 1; j <= k; j++) {
        ids.push(
          window.setTimeout(() => {
            if (cnt.current) cnt.current.textContent = 'x' + Math.round((n * j) / k);
            if (k > 1) audio.countTick(j);
          }, 160 + j * 55),
        );
      }
      ids.push(window.setTimeout(() => setFill(true), 260));
      if (!st.max && st.after >= st.need) {
        ids.push(
          window.setTimeout(() => {
            setStamp(true);
            audio.stamp();
            haptics.light();
          }, 1000),
        );
      }
    }
    return () => ids.forEach(clearTimeout);
  }, [flipped]);

  if (st.kind === 'coins' || st.kind === 'gems') {
    const coins = st.kind === 'coins';
    return (
      <>
        {coins ? <Coin class="big-ico" /> : <Gem class="big-ico" />}
        <div class="cnt outline">
          +<span ref={cnt}>0</span>
        </div>
        <div class="nm outline">{coins ? 'Monedas' : 'Gemas'}</div>
      </>
    );
  }
  if (st.kind === 'item') {
    return (
      <>
        {getItem(st.id) ? <ItemThumb id={st.id} /> : <div style={{ fontSize: '90px', lineHeight: '132px' }}>🎁</div>}
        <div class="nm outline">{cosmeticName(st.id)}</div>
        <div class="rarity-tag" style={{ background: '#ffb31a', color: '#10132e', marginTop: '4px' }}>
          Objeto exclusivo
        </div>
      </>
    );
  }
  const def = getItem(st.id);
  const info = RARITY_INFO[st.rarity];
  const pct = (v: number) => Math.min(100, (v / Math.max(1, st.need)) * 100) + '%';
  return (
    <>
      {st.isNew && <span class="chip-new">¡NUEVO!</span>}
      <ItemThumb id={st.id} />
      <div class="cnt outline">
        <span ref={cnt}>x1</span>
      </div>
      <div class="nm outline">{def.name}</div>
      <div class="deal-tags">
        <span class="rarity-tag" style={{ background: info.color, color: '#10132e' }}>
          {info.name}
        </span>
        <span class="deal-lv">Nv. {st.level}</span>
      </div>
      {st.max ? (
        <div class="deal-max">NIVEL MÁXIMO</div>
      ) : (
        <div class={'progress' + (st.after >= st.need ? '' : ' blue')} style={{ marginTop: '8px' }}>
          <i style={{ width: fill ? pct(st.after) : pct(st.before) }} />
          <span>
            {fill ? st.after : st.before}/{st.need}
          </span>
        </div>
      )}
      {stamp && <div class="deal-stamp">¡MEJORABLE!</div>}
    </>
  );
}

function Summary({ steps, title, upgradable, onDone, onUpgrade }: { steps: Step[]; title: string; upgradable: number; onDone: () => void; onUpgrade: () => void }) {
  // lo mejor primero
  const tiles = useMemo(() => {
    const cur = steps.filter((st) => st.kind !== 'card');
    const cards = steps.filter((st): st is CardStep => st.kind === 'card').sort((a, b) => ORDER.indexOf(b.rarity) - ORDER.indexOf(a.rarity) || b.count - a.count);
    return [...cur, ...cards];
  }, [steps]);
  useEffect(() => {
    const ids = tiles.slice(0, 14).map((_, k) => window.setTimeout(() => audio.countTick(k), 120 + k * 50));
    return () => ids.forEach(clearTimeout);
  }, []);
  const total = steps.reduce((a, st) => a + (st.kind === 'card' ? st.count : 0), 0);
  return (
    <div class="chest-sum">
      <div class="display outline cs-title">¡Has conseguido!</div>
      <div class="cs-sub">
        {title}
        {total ? ` · ${total} cartas` : ''}
      </div>
      <div class="cs-grid">
        {tiles.map((st, k) => {
          const col = colorsOf(st);
          const delay = { animationDelay: `${0.1 + k * 0.05}s` };
          const style = { ...delay, ['--rc' as string]: col.rc, ['--rc1' as string]: col.rc1, ['--rc2' as string]: col.rc2 };
          if (st.kind === 'coins' || st.kind === 'gems') {
            return (
              <div class="cs-tile" style={style} key={st.kind}>
                {st.kind === 'coins' ? <Coin /> : <Gem />}
                <div class="v">{fmtNum(st.value)}</div>
                <div class="k">{st.kind === 'coins' ? 'Monedas' : 'Gemas'}</div>
              </div>
            );
          }
          if (st.kind === 'item') {
            return (
              <div class="cs-tile legendary" style={style} key="item">
                {getItem(st.id) ? <ItemThumb id={st.id} /> : <div style={{ fontSize: '38px', lineHeight: '54px' }}>🎁</div>}
                <div class="k">{cosmeticName(st.id)}</div>
              </div>
            );
          }
          const up = !st.max && st.after >= st.need;
          return (
            <div class={'cs-tile ' + st.rarity} style={style} key={st.id}>
              {st.isNew && <span class="chip-new">¡NUEVO!</span>}
              {up && (
                <span class="up" title="Se puede mejorar">
                  ⬆
                </span>
              )}
              <ItemThumb id={st.id} />
              <div class="v">x{st.count}</div>
              <div class="k">{getItem(st.id).name}</div>
            </div>
          );
        })}
      </div>
      <div class="cs-btns">
        {upgradable > 0 && (
          <button class="btn gold" onClick={onUpgrade}>
            ⬆ Mejorar ({upgradable})
          </button>
        )}
        <button class="btn big shine" style={{ minWidth: '180px' }} onClick={onDone}>
          Continuar
        </button>
      </div>
    </div>
  );
}
