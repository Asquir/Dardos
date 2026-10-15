// Componentes reutilizables de la interfaz.

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { AvatarConfig } from '@shared/protocol';
import { Close, Coin, Gem, XpStar, Trophy, Lock } from '../icons';
import { fmtNum, fmtTime, useNow } from '../../core/store';
import { closeModal } from '../state';
import { avatarShot, type AvatarFrame, type AvatarPose } from '../../engine/avatar';
import { itemThumbnail } from '../../engine/previewView';
import { chestIcon } from '../../engine/chestView';
import { flightDesignDataURL } from '../../engine/textures';
import { getItem, ITEM_MAP, RARITY_INFO } from '../../meta/catalog';
import { CHESTS, type ChestType, type Reward } from '../../meta/chests';
import { audio } from '../../services/audio';

export function Modal({ title, children, onClose, wide, noClose }: { title?: ComponentChildren; children: ComponentChildren; onClose?: () => void; wide?: boolean; noClose?: boolean }) {
  const close = () => {
    audio.click();
    (onClose ?? closeModal)();
  };
  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && !noClose && close()}>
      <div class="modal" style={wide ? { maxWidth: '520px' } : undefined}>
        {title !== undefined && (
          <div class="modal-head outline">
            {title}
            {!noClose && (
              <button class="x" onClick={close} aria-label="Cerrar">
                <Close />
              </button>
            )}
          </div>
        )}
        <div class="modal-body scroll">{children}</div>
      </div>
    </div>
  );
}

export function Progress({ value, max, label, color = '', style }: { value: number; max: number; label?: ComponentChildren; color?: string; style?: JSX.CSSProperties }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div class={'progress ' + color} style={style}>
      <i style={{ width: pct + '%' }} />
      <span>{label ?? `${fmtNum(value)} / ${fmtNum(max)}`}</span>
    </div>
  );
}

const avCache = new Map<string, string>();
export function AvatarImg({ cfg, size = 128, h, frame = 'head', pose = 'idle', class: cls, style }: { cfg: AvatarConfig; size?: number; h?: number; frame?: AvatarFrame; pose?: AvatarPose; class?: string; style?: JSX.CSSProperties }) {
  const hh = h ?? size;
  const key = JSON.stringify(cfg) + size + 'x' + hh + frame + pose;
  const src = useMemo(() => {
    let s = avCache.get(key);
    if (s) {
      // LRU: lo usado recientemente pasa al final
      avCache.delete(key);
      avCache.set(key, s);
    } else {
      s = avatarShot(cfg, frame, size, hh, pose);
      avCache.set(key, s);
      if (avCache.size > 160) avCache.delete(avCache.keys().next().value!);
    }
    return s;
  }, [key]);
  return <img src={src} class={cls} style={style} alt="" draggable={false} />;
}

export function ItemThumb({ id, class: cls, style }: { id: string; class?: string; style?: JSX.CSSProperties }) {
  const src = useMemo(() => (ITEM_MAP[id] ? itemThumbnail(id) : ''), [id]);
  return <img src={src} class={cls} style={style} alt="" draggable={false} />;
}

export function FlightSwatch({ design, size = 48 }: { design: string; size?: number }) {
  const src = useMemo(() => flightDesignDataURL(design, size * 2), [design]);
  return <img src={src} width={size} height={size} alt="" />;
}

export function ChestImg({ type, class: cls, style }: { type: ChestType; class?: string; style?: JSX.CSSProperties }) {
  const src = useMemo(() => chestIcon(type), [type]);
  return <img src={src} class={cls} style={style} alt={CHESTS[type].name} draggable={false} />;
}

export function Price({ price }: { price: { coins?: number; gems?: number } }) {
  if (price.gems) return (
    <>
      <Gem class="ico" /> {fmtNum(price.gems)}
    </>
  );
  if (price.coins) return (
    <>
      <Coin class="ico" /> {fmtNum(price.coins)}
    </>
  );
  return <>GRATIS</>;
}

export function Countdown({ to, prefix = '' }: { to: number; prefix?: string }) {
  const now = useNow(1000);
  return (
    <>
      {prefix}
      {fmtTime((to - now) / 1000)}
    </>
  );
}

/** Lista visual de lo que contiene una recompensa. */
export function RewardList({ reward, small }: { reward: Reward; small?: boolean }) {
  const items: JSX.Element[] = [];
  let d = 0;
  const delay = () => ({ animationDelay: `${(d++) * 0.08}s` });
  if (reward.coins) items.push(
    <div class="reward" style={delay()} key="c">
      <Coin class="ico" />
      <div class="v">{fmtNum(reward.coins)}</div>
      <div class="k">Monedas</div>
    </div>,
  );
  if (reward.gems) items.push(
    <div class="reward" style={delay()} key="g">
      <Gem class="ico" />
      <div class="v">{fmtNum(reward.gems)}</div>
      <div class="k">Gemas</div>
    </div>,
  );
  if (reward.xp) items.push(
    <div class="reward" style={delay()} key="x">
      <XpStar class="ico" />
      <div class="v">+{reward.xp}</div>
      <div class="k">Experiencia</div>
    </div>,
  );
  if (reward.chest) items.push(
    <div class="reward" style={delay()} key="ch">
      <ChestImg type={reward.chest} class="ico" />
      <div class="k">{CHESTS[reward.chest].name}</div>
    </div>,
  );
  for (const c of reward.cards ?? []) {
    const def = getItem(c.id);
    items.push(
      <div class="reward" style={{ ...delay(), borderColor: RARITY_INFO[def.rarity].color }} key={c.id}>
        <ItemThumb id={c.id} class="ico" />
        <div class="v">x{c.count}</div>
        <div class="k">{def.name}</div>
      </div>,
    );
  }
  if (reward.item) items.push(
    <div class="reward" style={delay()} key="it">
      {ITEM_MAP[reward.item] ? <ItemThumb id={reward.item} class="ico" /> : <span style={{ fontSize: '34px' }}>🎁</span>}
      <div class="k">{cosmeticName(reward.item)}</div>
    </div>,
  );
  return <div class="reward-row" style={small ? { gap: '6px' } : undefined}>{items}</div>;
}

export function cosmeticName(key: string): string {
  if (ITEM_MAP[key]) return ITEM_MAP[key].name;
  if (key.startsWith('avatar:hat:cowboy')) return 'Sombrero vaquero';
  if (key.startsWith('emote:')) return 'Emote exclusivo';
  if (key.startsWith('board:')) return 'Diana exclusiva';
  return 'Objeto exclusivo';
}

/** Icono pequeño para una recompensa (pase, diario). */
export function RewardIcon({ reward }: { reward: Reward }) {
  if (reward.chest) return <ChestImg type={reward.chest} class="ico" />;
  if (reward.item && ITEM_MAP[reward.item]) return <ItemThumb id={reward.item} class="ico" />;
  if (reward.item) return <span class="ico" style={{ fontSize: '28px', textAlign: 'center' }}>{reward.item.startsWith('emote') ? '😎' : reward.item.startsWith('board') ? '🎯' : '🤠'}</span>;
  if (reward.gems) return <Gem class="ico" />;
  return <Coin class="ico" />;
}

export function rewardLabel(r: Reward): string {
  const parts: string[] = [];
  if (r.coins) parts.push(fmtNum(r.coins));
  if (r.gems) parts.push(r.gems + ' 💎');
  if (r.chest) parts.push(CHESTS[r.chest].name.replace('Cofre ', ''));
  if (r.item) parts.push(cosmeticName(r.item));
  return parts.join(' + ');
}

export function TrophyCount({ n }: { n: number }) {
  return (
    <span class="pill">
      <Trophy class="ico" /> {fmtNum(n)}
    </span>
  );
}

export function Locked({ text }: { text: string }) {
  return (
    <span class="pill">
      <Lock class="ico" /> {text}
    </span>
  );
}

/** Arrastre horizontal para rotar modelos 3D. */
export function useDragRotate(target: { onPointer(kind: 'down' | 'move' | 'up', dx?: number): void }) {
  const last = useRef(0);
  return {
    onPointerDown: (e: PointerEvent) => {
      last.current = e.clientX;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      target.onPointer('down');
    },
    onPointerMove: (e: PointerEvent) => {
      target.onPointer('move', e.clientX - last.current);
      last.current = e.clientX;
    },
    onPointerUp: () => target.onPointer('up'),
    onPointerCancel: () => target.onPointer('up'),
  };
}

export function useInterval(fn: () => void, ms: number) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}
