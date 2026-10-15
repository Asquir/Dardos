// Colección: dardo 3D, estadísticas, piezas por categoría, mejoras, dianas y emotes.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useStore, fmtNum } from '../../core/store';
import { profileStore, mutate } from '../../meta/profile';
import { BARRELS, SHAFTS, FLIGHTS, BOARD_SKINS, EMOTES, RARITY_INFO, getItem, statsAt, type ItemDef, type Slot } from '../../meta/catalog';
import { upgradeInfo, dartStats, equip, upgrade, buyCosmetic } from '../../meta/economy';
import { previewView } from '../../engine/previewView';
import { ItemThumb, Price, useDragRotate } from '../components/common';
import { Check, Coin, Lock } from '../icons';
import { closeModal, openModal, toast, ui } from '../state';
import { audio } from '../../services/audio';
import { haptics } from '../../services/haptics';
import { confetti } from '../fx';
import { net } from '../../services/net';

type Tab = Slot | 'board' | 'emote';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'barrel', label: 'Cuerpos', icon: '🔩' },
  { id: 'shaft', label: 'Cañas', icon: '📏' },
  { id: 'flight', label: 'Aletas', icon: '🪶' },
  { id: 'board', label: 'Dianas', icon: '🎯' },
  { id: 'emote', label: 'Emotes', icon: '😎' },
];
const RARITY_ORDER = { legendary: 0, epic: 1, rare: 2, common: 3 } as const;
const SLOT_LABEL: Record<Slot, string> = { barrel: 'Cuerpo', shaft: 'Caña', flight: 'Aletas' };
const TAB_TITLE: Record<Slot, string> = { barrel: 'Tus cuerpos', shaft: 'Tus cañas', flight: 'Tus aletas' };

/** Poder total del dardo (suma de las tres estadísticas). */
export function dartPower(st: { acc: number; stab: number; ctrl: number }) {
  return Math.round(st.acc + st.stab + st.ctrl);
}

/** Rareza más alta del dardo equipado (para los efectos de la vitrina). */
function bestRarity(ids: string[]) {
  return ids.map((i) => getItem(i).rarity).sort((a, b) => RARITY_ORDER[a] - RARITY_ORDER[b])[0];
}

export function Collection() {
  const p = useStore(profileStore);
  const [tab, setTab] = useState<Tab>('barrel');
  const v = previewView();
  const drag = useDragRotate(v);
  const stage = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const r = stage.current?.getBoundingClientRect();
      if (r) v.setRegion(r.top, r.height);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  useEffect(() => {
    v.setLook(p.equipped, bestRarity([p.equipped.barrel, p.equipped.shaft, p.equipped.flight]));
  }, [p.equipped.barrel, p.equipped.shaft, p.equipped.flight]);
  // al entrar se ve el dardo entero; al tocar una pestaña o una pieza, la cámara se acerca a ella
  const [focus, setFocus] = useState<'all' | Slot>('all');
  useEffect(() => {
    v.focusPart = tab === 'board' || tab === 'emote' ? 'all' : focus;
  }, [tab, focus]);
  const pickTab = (t: Tab) => {
    audio.click();
    setTab(t);
    if (t === 'barrel' || t === 'shaft' || t === 'flight') setFocus(t);
  };
  const st = dartStats(p);
  const base: ItemDef[] = tab === 'barrel' ? BARRELS : tab === 'shaft' ? SHAFTS : tab === 'flight' ? FLIGHTS : [];
  // primero lo equipado, luego lo que se puede mejorar, lo tuyo por rareza y al final lo bloqueado
  const list = [...base].sort((a, b) => {
    const ua = upgradeInfo(p, a.id);
    const ub = upgradeInfo(p, b.id);
    const score = (it: ItemDef, u: ReturnType<typeof upgradeInfo>) => (p.equipped[it.slot] === it.id ? 0 : u.can ? 1 : u.owned ? 2 : 3);
    return score(a, ua) - score(b, ub) || RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.arena - b.arena;
  });
  const owned = base.filter((i) => p.items[i.id]).length;
  const upgradable = (slot: Slot) => (slot === 'barrel' ? BARRELS : slot === 'shaft' ? SHAFTS : FLIGHTS).filter((i) => upgradeInfo(p, i.id).can).length;

  const slotTab: Slot | null = tab === 'barrel' || tab === 'shaft' || tab === 'flight' ? tab : null;
  const shown = slotTab;
  const shownDef = shown ? getItem(p.equipped[shown]) : null;
  const zoomed = focus !== 'all' && !!slotTab;

  return (
    <div class="screen workshop">
      <div class="ws-stage" ref={stage} {...drag} onDblClick={() => setFocus('all')}>
        <div class="ws-power" title="Poder del dardo">
          <span>⚡</span>
          <b>
            <ScoreNum value={dartPower(st)} />
          </b>
          <small>PODER</small>
        </div>
        {slotTab && (
          <button class="ws-zoom" onClick={() => (audio.click(), setFocus(zoomed ? 'all' : slotTab))} aria-label={zoomed ? 'Ver el dardo entero' : 'Acercar la pieza'}>
            {zoomed ? '⤢' : '🔍'}
          </button>
        )}
        {shownDef && (
          <div class={'ws-caption ' + shownDef.rarity} key={shownDef.id}>
            <small>{SLOT_LABEL[shown!]}</small>
            <b>{shownDef.name}</b>
            <em>Nv.{p.items[shownDef.id]?.level ?? 1}</em>
          </div>
        )}
      </div>
      <div class="ws-stats">
        <MiniStat icon="🎯" label="Precisión" v={st.acc} color="linear-gradient(90deg,#ff7a8f,#e0123a)" />
        <MiniStat icon="🧘" label="Estabilidad" v={st.stab} color="linear-gradient(90deg,#8fd0ff,#2a7dff)" />
        <MiniStat icon="✋" label="Control" v={st.ctrl} color="linear-gradient(90deg,#9dffbf,#16a34a)" />
      </div>
      <div class="ws-tabs">
        {TABS.map((t) => {
          const n = t.id === 'barrel' || t.id === 'shaft' || t.id === 'flight' ? upgradable(t.id) : 0;
          return (
            <button key={t.id} class={tab === t.id ? 'on' : ''} onClick={() => pickTab(t.id)}>
              <span class="ti">{t.icon}</span>
              <span class="tl">{t.label}</span>
              {n > 0 && <span class="badge">{n}</span>}
            </button>
          );
        })}
      </div>
      <div class="scroll grow">
        {list.length > 0 && (
          <>
            <div class="ws-count">
              <span>{TAB_TITLE[tab as Slot]}</span>
              <span>
                <b>{owned}</b>/{base.length} descubiertos
              </span>
            </div>
            <div class="item-grid ws-grid">
              {list.map((it, i) => (
                <ItemCard key={it.id} it={it} i={i} />
              ))}
            </div>
          </>
        )}
        {tab === 'board' && <Boards />}
        {tab === 'emote' && <Emotes />}
      </div>
    </div>
  );
}

/** Estadística compacta: icono, nombre, valor y una barra fina. */
function MiniStat({ icon, label, v, color }: { icon: string; label: string; v: number; color: string }) {
  return (
    <div class="mini-stat">
      <div class="wst-top">
        <span class="wst-ic">{icon}</span>
        <span class="wst-lb">{label}</span>
        <b>{Math.round(v)}</b>
      </div>
      <div class="wst-bar">
        <i style={{ width: Math.min(100, v) + '%', background: color }} />
      </div>
    </div>
  );
}

/** Número que se anima al cambiar. */
function ScoreNum({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const a = prev.current;
    prev.current = value;
    if (a === value) return setShown(value);
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700);
      setShown(Math.round(a + (value - a) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span class="score-num" key={value}>{shown}</span>;
}

function StatRow({ label, v, color, next, delta }: { label: string; v: number; color: string; next?: number; delta?: number }) {
  return (
    <>
      <div class="stat-name">{label}</div>
      <div class="stat-bar">
        {next !== undefined && next > v && <i class="next" style={{ width: Math.min(100, next) + '%' }} />}
        <i style={{ width: Math.min(100, v) + '%', background: color }} />
        <b class="stat-shine" />
      </div>
      <div class="stat-val">
        {Math.round(v)}
        {delta !== undefined && Math.round(delta) !== 0 && <span class={'delta ' + (delta > 0 ? 'up' : 'down')}>{(delta > 0 ? '+' : '') + Math.round(delta)}</span>}
      </div>
    </>
  );
}

function ItemCard({ it, i }: { it: ItemDef; i: number }) {
  const p = useStore(profileStore);
  const u = upgradeInfo(p, it.id);
  const equipped = p.equipped[it.slot] === it.id;
  const pct = u.owned ? (u.max ? 100 : Math.min(100, (u.cards / u.need) * 100)) : 0;
  return (
    <button
      class={`item ${it.rarity}${u.owned ? '' : ' locked'}${equipped ? ' equipped' : ''}${u.can ? ' can' : ''}`}
      style={{ animationDelay: Math.min(i, 12) * 0.035 + 's' }}
      onClick={() => (audio.click(), openModal({ kind: 'item', id: it.id }))}
    >
      <span class="pedestal" />
      {u.owned && <span class="lv">Nv.{u.level}</span>}
      {equipped && (
        <span class="eq">
          <Check />
        </span>
      )}
      <ItemThumb id={it.id} />
      {!u.owned && <span class="qmark">?</span>}
      <div class="nm">{u.owned ? it.name : '???'}</div>
      {u.owned ? (
        <div class={'cardbar' + (u.enoughCards ? ' full' : '')}>
          <i style={{ width: pct + '%' }} />
          <span>{u.max ? 'MÁX' : `${u.cards}/${u.need}`}</span>
        </div>
      ) : (
        <div class="cardbar">
          <span>
            <Lock style={{ width: '10px', height: '10px', verticalAlign: '-1px' }} /> Arena {it.arena + 1}
          </span>
        </div>
      )}
      {u.can && <span class="up">⬆</span>}
    </button>
  );
}

/** Ficha de una pieza (panel inferior): se monta en el dardo 3D para probarla, compara y se mejora. */
export function ItemModal({ id }: { id: string }) {
  const p = useStore(profileStore);
  const s = useStore(ui);
  const def = getItem(id);
  const u = upgradeInfo(p, id);
  const cur = statsAt(def, Math.max(1, u.level));
  const nxt = statsAt(def, u.level + 1);
  const equipped = p.equipped[def.slot] === id;
  const r = RARITY_INFO[def.rarity];
  const inWorkshop = s.screen === 'collection';
  const [fx, setFx] = useState<{ from: number; to: number; key: number } | null>(null);
  // estadísticas del dardo completo con esta pieza montada, frente a las actuales
  const mine = dartStats(p);
  const tried = dartStats(p, { ...p.equipped, [def.slot]: id });

  // probador: la pieza aparece montada en la vitrina mientras la ficha está abierta
  useEffect(() => {
    if (!inWorkshop) return;
    const v = previewView();
    const prevFocus = v.focusPart;
    v.focusPart = def.slot;
    v.setLook({ ...p.equipped, [def.slot]: id }, def.rarity);
    return () => {
      v.focusPart = prevFocus;
      const pp = profileStore.get();
      v.setLook(pp.equipped, bestRarity([pp.equipped.barrel, pp.equipped.shaft, pp.equipped.flight]));
    };
  }, [id]);

  const doUpgrade = () => {
    if (!upgrade(id)) {
      audio.error();
      if (!u.enoughCards) toast('Te faltan cartas: consíguelas en cofres y en la tienda', 'bad');
      else toast('Te faltan monedas', 'bad');
      return;
    }
    audio.levelUp();
    audio.sparkle(1.4);
    haptics.success();
    confetti(110);
    previewView().celebrate();
    setFx({ from: u.level, to: u.level + 1, key: Date.now() });
    setTimeout(() => setFx(null), 2200);
    net.syncProfile();
  };
  const close = () => (audio.click(), closeModal());
  return (
    <div class="sheet-back" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class={'sheet item-sheet ' + def.rarity}>
        <div class="sheet-grip" onClick={close} />
        <button class="x sheet-x" onClick={close} aria-label="Cerrar">
          ✕
        </button>
        <div class="is-head">
          <div class={'is-thumb item ' + def.rarity + (u.owned ? '' : ' locked')}>
            <span class="pedestal" />
            <ItemThumb id={id} />
          </div>
          <div class="grow" style={{ minWidth: 0 }}>
            <span class="rarity-tag" style={{ background: r.color, color: '#10132e' }}>
              {r.name} · {SLOT_LABEL[def.slot]}
            </span>
            <div class="display is-name">{u.owned ? def.name : 'Pieza sin descubrir'}</div>
            {u.owned ? (
              <div class="is-level">
                <span key={u.level} class="lvnum">
                  Nivel {u.level}
                </span>
                {u.max ? <b class="maxed">MÁXIMO</b> : <span class="muted"> / {10}</span>}
              </div>
            ) : (
              <div class="muted" style={{ fontWeight: 800, fontSize: '12px' }}>
                {def.exclusive ? (id.startsWith('f_ev_') ? 'Exclusiva de los eventos en vivo: completa todos los hitos.' : 'Exclusiva del Pase de Temporada y ofertas especiales.') : `Puede salir en cofres a partir de la arena ${def.arena + 1}.`}
              </div>
            )}
          </div>
        </div>

        <div class="panel stats-panel" style={{ margin: '10px 0 0' }}>
          <StatRow label="🎯 Precisión" v={cur.acc * 2.5} next={u.owned && !u.max ? nxt.acc * 2.5 : undefined} color="linear-gradient(90deg,#ff7a8f,#e0123a)" />
          <StatRow label="🧘 Estabilidad" v={cur.stab * 2.5} next={u.owned && !u.max ? nxt.stab * 2.5 : undefined} color="linear-gradient(90deg,#8fd0ff,#2a7dff)" />
          <StatRow label="✋ Control" v={cur.ctrl * 2.5} next={u.owned && !u.max ? nxt.ctrl * 2.5 : undefined} color="linear-gradient(90deg,#9dffbf,#16a34a)" />
        </div>
        {!equipped && (
          <div class="is-compare">
            <span>Con esta pieza tu dardo:</span>
            <b class={dartPower(tried) >= dartPower(mine) ? 'up' : 'down'}>
              ⚡ {dartPower(mine)} → {dartPower(tried)}
            </b>
          </div>
        )}
        {u.owned && !u.max && (
          <div class="is-cards">
            <div class={'cardbar' + (u.enoughCards ? ' full' : '')}>
              <i style={{ width: Math.min(100, (u.cards / u.need) * 100) + '%' }} />
              <span>
                Cartas {u.cards}/{u.need}
              </span>
            </div>
          </div>
        )}
        {u.owned && (
          <div class="row" style={{ width: '100%', marginTop: '10px' }}>
            <button class={'btn grow ' + (equipped ? 'gray' : 'blue')} disabled={equipped} onClick={() => (audio.click(), audio.whooshUi(), equip(id), net.syncProfile(), toast('¡Equipado!', 'good'), closeModal())}>
              {equipped ? '✓ Equipado' : 'Equipar'}
            </button>
            {!u.max && (
              <button class={'btn grow' + (u.can ? ' shine' : '')} disabled={!u.enoughCards} onClick={doUpgrade}>
                Mejorar <Coin class="ico" /> {fmtNum(u.coins)}
              </button>
            )}
          </div>
        )}
        {fx && (
          <div key={fx.key} class={'upgrade-fx ' + def.rarity}>
            <div class="ufx-rays" />
            <div class="ufx-title outline">¡MEJORA!</div>
            <div class="ufx-levels">
              <span class="from">{fx.from}</span>
              <span class="arrow">➜</span>
              <span class="to">{fx.to}</span>
            </div>
            <div class="ufx-sub">+8% a todas las estadísticas</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Boards() {
  const p = useStore(profileStore);
  return (
    <div class="pad" style={{ paddingTop: '10px' }}>
      {BOARD_SKINS.map((b) => {
        const owned = p.ownedBoards.includes(b.id);
        const on = p.boardSkin === b.id;
        const locked = (b.level ?? 0) > p.level;
        return (
          <div class="list-item" key={b.id}>
            <div class="ic">🎯</div>
            <div class="grow">
              <div class="tt">{b.name}</div>
              <div class="ds">{locked ? `Nivel ${b.level}` : owned ? (on ? 'En uso' : 'En tu colección') : 'Estilo de diana para todas tus partidas'}</div>
            </div>
            {owned ? (
              <button class={'btn small ' + (on ? 'gray' : 'blue')} disabled={on} onClick={() => (audio.click(), mutate((pp) => (pp.boardSkin = b.id)), toast('Diana cambiada', 'good'))}>
                {on ? 'Usando' : 'Usar'}
              </button>
            ) : (
              <button class="btn small gold" disabled={locked} onClick={() => (buyCosmetic('board:' + b.id, b.price ?? {}) ? (audio.coin(), toast('¡Diana desbloqueada!', 'good')) : (audio.error(), toast('No tienes gemas suficientes', 'bad')))}>
                <Price price={b.price ?? {}} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Emotes() {
  const p = useStore(profileStore);
  const toggle = (id: string) => {
    mutate((pp) => {
      if (pp.emotes.includes(id)) {
        if (pp.emotes.length > 1) pp.emotes = pp.emotes.filter((e) => e !== id);
      } else pp.emotes = [...pp.emotes, id].slice(-6);
    });
  };
  return (
    <div class="pad" style={{ paddingTop: '10px' }}>
      <div class="muted" style={{ fontSize: '12px', fontWeight: 800, marginBottom: '8px' }}>
        Elige hasta 6 emotes para usar en las partidas.
      </div>
      {EMOTES.map((e) => {
        const owned = p.ownedEmotes.includes(e.id);
        const on = p.emotes.includes(e.id);
        return (
          <div class="list-item" key={e.id}>
            <div class="ic">{e.icon}</div>
            <div class="grow tt">{e.text}</div>
            {owned ? (
              <button class={'btn small ' + (on ? '' : 'gray')} onClick={() => (audio.click(), toggle(e.id))}>
                {on ? 'Equipado' : 'Equipar'}
              </button>
            ) : (
              <button class="btn small gold" onClick={() => (buyCosmetic('emote:' + e.id, e.price ?? {}) ? (audio.coin(), toast('¡Emote desbloqueado!', 'good')) : (audio.error(), toast('No te alcanza', 'bad')))}>
                <Price price={e.price ?? {}} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
