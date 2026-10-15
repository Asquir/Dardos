// Colección: dardo 3D, estadísticas, piezas por categoría, mejoras, dianas y emotes.

import { useEffect, useState } from 'preact/hooks';
import { useStore, fmtNum } from '../../core/store';
import { profileStore, mutate } from '../../meta/profile';
import { BARRELS, SHAFTS, FLIGHTS, BOARD_SKINS, EMOTES, RARITY_INFO, getItem, statsAt, type ItemDef, type Slot } from '../../meta/catalog';
import { upgradeInfo, dartStats, equip, upgrade, buyCosmetic } from '../../meta/economy';
import { previewView } from '../../engine/previewView';
import { ItemThumb, Modal, Price, useDragRotate } from '../components/common';
import { Check, Coin, Lock } from '../icons';
import { closeModal, openModal, toast } from '../state';
import { audio } from '../../services/audio';
import { haptics } from '../../services/haptics';
import { confetti } from '../fx';
import { net } from '../../services/net';

type Tab = Slot | 'board' | 'emote';
const TABS: { id: Tab; label: string }[] = [
  { id: 'barrel', label: 'Cuerpos' },
  { id: 'shaft', label: 'Cañas' },
  { id: 'flight', label: 'Aletas' },
  { id: 'board', label: 'Dianas' },
  { id: 'emote', label: 'Emotes' },
];

export function Collection() {
  const p = useStore(profileStore);
  const [tab, setTab] = useState<Tab>('barrel');
  const v = previewView();
  const drag = useDragRotate(v);
  useEffect(() => {
    v.setLook(p.equipped, getItem(p.equipped.barrel).rarity);
  }, [p.equipped.barrel, p.equipped.shaft, p.equipped.flight]);
  useEffect(() => {
    v.focusPart = tab === 'barrel' || tab === 'shaft' || tab === 'flight' ? tab : 'all';
  }, [tab]);
  const st = dartStats(p);
  const list: ItemDef[] = tab === 'barrel' ? BARRELS : tab === 'shaft' ? SHAFTS : tab === 'flight' ? FLIGHTS : [];
  const owned = list.filter((i) => p.items[i.id]).length;

  return (
    <div class="screen">
      <div class="preview-area" {...drag} />
      <div class="panel stats-panel">
        <StatRow label="🎯 Precisión" v={st.acc} color="linear-gradient(90deg,#ff7a8f,#e0123a)" />
        <StatRow label="🧘 Estabilidad" v={st.stab} color="linear-gradient(90deg,#8fd0ff,#2a7dff)" />
        <StatRow label="✋ Control" v={st.ctrl} color="linear-gradient(90deg,#9dffbf,#16a34a)" />
      </div>
      <div class="pad" style={{ marginTop: '10px' }}>
        <div class="tabs">
          {TABS.map((t) => (
            <button key={t.id} class={tab === t.id ? 'on' : ''} onClick={() => (audio.click(), setTab(t.id))}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div class="scroll grow">
        {list.length > 0 && (
          <>
            <div class="muted pad" style={{ fontWeight: 800, fontSize: '12px', marginTop: '8px' }}>
              Descubiertos: {owned}/{list.length}
            </div>
            <div class="item-grid">
              {list.map((it) => (
                <ItemCard key={it.id} it={it} />
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

function StatRow({ label, v, color, next }: { label: string; v: number; color: string; next?: number }) {
  return (
    <>
      <div class="stat-name">{label}</div>
      <div class="stat-bar">
        {next !== undefined && next > v && <i class="next" style={{ width: Math.min(100, next) + '%' }} />}
        <i style={{ width: Math.min(100, v) + '%', background: color }} />
      </div>
      <div class="stat-val">{Math.round(v)}</div>
    </>
  );
}

function ItemCard({ it }: { it: ItemDef }) {
  const p = useStore(profileStore);
  const u = upgradeInfo(p, it.id);
  const equipped = p.equipped[it.slot] === it.id;
  const pct = u.owned ? (u.max ? 100 : Math.min(100, (u.cards / u.need) * 100)) : 0;
  return (
    <button class={`item ${it.rarity}${u.owned ? '' : ' locked'}${equipped ? ' equipped' : ''}`} onClick={() => (audio.click(), openModal({ kind: 'item', id: it.id }))}>
      {u.owned && <span class="lv">Nv.{u.level}</span>}
      {equipped && (
        <span class="eq">
          <Check />
        </span>
      )}
      <ItemThumb id={it.id} />
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

/** Ficha de un objeto: estadísticas, mejora y equipar. */
export function ItemModal({ id }: { id: string }) {
  const p = useStore(profileStore);
  const def = getItem(id);
  const u = upgradeInfo(p, id);
  const cur = statsAt(def, Math.max(1, u.level));
  const nxt = statsAt(def, u.level + 1);
  const equipped = p.equipped[def.slot] === id;
  const r = RARITY_INFO[def.rarity];
  const doUpgrade = () => {
    if (!upgrade(id)) {
      audio.error();
      if (!u.enoughCards) toast('Te faltan cartas: consíguelas en cofres y en la tienda', 'bad');
      else toast('Te faltan monedas', 'bad');
      return;
    }
    audio.levelUp();
    haptics.success();
    confetti(90);
    toast(`¡${def.name} sube a nivel ${u.level + 1}!`, 'good');
    net.syncProfile();
  };
  return (
    <Modal title={u.owned ? def.name : 'Objeto sin descubrir'}>
      <div class="col" style={{ alignItems: 'center' }}>
        <span class="rarity-tag" style={{ background: r.color, color: '#10132e' }}>
          {r.name}
        </span>
        <div class={'item ' + def.rarity + (u.owned ? '' : ' locked')} style={{ width: '150px', aspectRatio: '1', padding: '10px' }}>
          <ItemThumb id={id} />
        </div>
        {u.owned ? (
          <div class="display" style={{ fontSize: '18px' }}>
            Nivel {u.level}
            {u.max ? ' (máximo)' : ''}
          </div>
        ) : (
          <div class="muted" style={{ fontWeight: 800, textAlign: 'center' }}>
            {def.exclusive ? 'Exclusivo del Pase de Temporada y ofertas especiales.' : `Puede salir en cofres a partir de la arena ${def.arena + 1}.`}
          </div>
        )}
        <div class="panel stats-panel" style={{ width: '100%', margin: 0 }}>
          <StatRow label="🎯 Precisión" v={cur.acc * 2.5} next={u.owned && !u.max ? nxt.acc * 2.5 : undefined} color="linear-gradient(90deg,#ff7a8f,#e0123a)" />
          <StatRow label="🧘 Estabilidad" v={cur.stab * 2.5} next={u.owned && !u.max ? nxt.stab * 2.5 : undefined} color="linear-gradient(90deg,#8fd0ff,#2a7dff)" />
          <StatRow label="✋ Control" v={cur.ctrl * 2.5} next={u.owned && !u.max ? nxt.ctrl * 2.5 : undefined} color="linear-gradient(90deg,#9dffbf,#16a34a)" />
        </div>
        {u.owned && !u.max && (
          <div class="muted" style={{ fontSize: '12px', fontWeight: 800 }}>
            Cartas: {u.cards}/{u.need}
          </div>
        )}
        {u.owned && (
          <div class="row" style={{ width: '100%', marginTop: '6px' }}>
            <button class={'btn grow ' + (equipped ? 'gray' : 'blue')} disabled={equipped} onClick={() => (audio.click(), equip(id), net.syncProfile(), toast('¡Equipado!', 'good'), closeModal())}>
              {equipped ? 'Equipado' : 'Equipar'}
            </button>
            {!u.max && (
              <button class={'btn grow' + (u.can ? ' shine' : '')} disabled={!u.enoughCards} onClick={doUpgrade}>
                Mejorar <Coin class="ico" /> {fmtNum(u.coins)}
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
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
