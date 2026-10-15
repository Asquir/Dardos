// Editor de personaje de cuerpo entero: cuerpo, cara, pelo, ropa y complementos, con vista 3D
// que se acerca a la zona que estás editando.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { AvatarConfig } from '@shared/protocol';
import { useStore } from '../../core/store';
import { profileStore, mutate } from '../../meta/profile';
import { avatarView, type AvatarFrame } from '../../engine/avatar';
import { useDragRotate, Price, AvatarImg } from '../components/common';
import { Back, Lock, Check } from '../icons';
import { go, toast } from '../state';
import { audio } from '../../services/audio';
import { haptics } from '../../services/haptics';
import {
  HAIRS,
  BEARDS,
  GLASSES,
  HATS,
  SHIRTS,
  SKIN_TONES,
  HAIR_COLORS,
  SHIRT_COLORS,
  EYE_COLORS,
  PANTS_COLORS,
  SHOE_COLORS,
  BODIES,
  FACES,
  EYE_STYLES,
  BROWS,
  MOUTHS,
  NOSES,
  MARKS,
  PANTS,
  SHOES,
  ACCESSORIES,
  normAvatar,
  type AvatarPart,
} from '../../meta/catalog';
import { buyCosmetic, ownsCosmetic } from '../../meta/economy';
import { net } from '../../services/net';
import { randomAvatar } from '../../game/launch';

type Key = keyof Required<AvatarConfig>;
interface Cat {
  id: Key;
  label: string;
  parts?: AvatarPart[];
  colors?: string[];
  frame: AvatarFrame;
}
interface Group {
  id: string;
  label: string;
  icon: string;
  cats: Cat[];
}

const GROUPS: Group[] = [
  {
    id: 'body',
    label: 'Cuerpo',
    icon: '🧍',
    cats: [
      { id: 'skin', label: 'Piel', colors: SKIN_TONES, frame: 'full' },
      { id: 'body', label: 'Complexión', parts: BODIES, frame: 'full' },
      { id: 'face', label: 'Cara', parts: FACES, frame: 'head' },
    ],
  },
  {
    id: 'face',
    label: 'Cara',
    icon: '😊',
    cats: [
      { id: 'eyeStyle', label: 'Ojos', parts: EYE_STYLES, frame: 'head' },
      { id: 'eyes', label: 'Color de ojos', colors: EYE_COLORS, frame: 'head' },
      { id: 'brows', label: 'Cejas', parts: BROWS, frame: 'head' },
      { id: 'mouth', label: 'Boca', parts: MOUTHS, frame: 'head' },
      { id: 'nose', label: 'Nariz', parts: NOSES, frame: 'head' },
      { id: 'marks', label: 'Detalles', parts: MARKS, frame: 'head' },
    ],
  },
  {
    id: 'hair',
    label: 'Pelo',
    icon: '💇',
    cats: [
      { id: 'hair', label: 'Peinado', parts: HAIRS, frame: 'head' },
      { id: 'hairColor', label: 'Color', colors: HAIR_COLORS, frame: 'head' },
      { id: 'beard', label: 'Barba', parts: BEARDS, frame: 'head' },
    ],
  },
  {
    id: 'outfit',
    label: 'Ropa',
    icon: '👕',
    cats: [
      { id: 'shirt', label: 'Parte de arriba', parts: SHIRTS, frame: 'torso' },
      { id: 'shirtColor', label: 'Color', colors: SHIRT_COLORS, frame: 'torso' },
      { id: 'number', label: 'Dorsal', frame: 'torso' },
      { id: 'pants', label: 'Pantalón', parts: PANTS, frame: 'legs' },
      { id: 'pantsColor', label: 'Color', colors: PANTS_COLORS, frame: 'legs' },
      { id: 'shoes', label: 'Calzado', parts: SHOES, frame: 'feet' },
      { id: 'shoesColor', label: 'Color', colors: SHOE_COLORS, frame: 'feet' },
    ],
  },
  {
    id: 'extras',
    label: 'Extras',
    icon: '🕶️',
    cats: [
      { id: 'glasses', label: 'Gafas', parts: GLASSES, frame: 'head' },
      { id: 'hat', label: 'Gorro', parts: HATS, frame: 'head' },
      { id: 'acc', label: 'Complemento', parts: ACCESSORIES, frame: 'torso' },
    ],
  },
];

const ALL_CATS = GROUPS.flatMap((g) => g.cats);

/** Valor de la pieza tal como se guarda en la configuración. */
const valueOf = (cat: Key, partId: string) => (cat === 'body' ? Number(partId) : partId);

export function AvatarEditor() {
  const p = useStore(profileStore);
  const [group, setGroup] = useState(GROUPS[0].id);
  const [catId, setCatId] = useState<Key>('skin');
  const [draft, setDraft] = useState<Required<AvatarConfig>>(normAvatar(p.avatar));
  const v = avatarView();
  const drag = useDragRotate(v);
  const stage = useRef<HTMLDivElement>(null);
  const g = GROUPS.find((x) => x.id === group)!;
  const cat = g.cats.find((c) => c.id === catId) ?? g.cats[0];

  useEffect(() => {
    v.set(draft);
  }, [JSON.stringify(draft)]);

  useLayoutEffect(() => {
    const measure = () => {
      const r = stage.current?.getBoundingClientRect();
      if (r) v.setRegion(r.top, r.height);
    };
    measure();
    window.addEventListener('resize', measure);
    v.autoGestures = false;
    v.setDart(null);
    return () => {
      window.removeEventListener('resize', measure);
      v.autoGestures = true;
      v.focus('full');
      v.face(false);
    };
  }, []);

  useEffect(() => {
    v.focus(cat.frame);
    v.face(cat.id === 'number');
  }, [cat.id]);

  const set = (k: Key, val: string | number) => {
    audio.click();
    haptics.light();
    setDraft({ ...draft, [k]: val } as Required<AvatarConfig>);
  };
  const owned = (c: Key, part: AvatarPart) => !part.price || ownsCosmetic(p, `${c}:${part.id}`);
  const lockedParts = ALL_CATS.filter((c) => {
    if (!c.parts) return false;
    const cur = String(draft[c.id]);
    const part = c.parts.find((x) => x.id === cur);
    return part && !owned(c.id, part);
  });

  const save = () => {
    if (lockedParts.length) {
      audio.error();
      return toast(`Compra primero: ${lockedParts.map((c) => c.label.toLowerCase()).join(', ')}`, 'bad');
    }
    mutate((pp) => (pp.avatar = draft));
    net.syncProfile();
    audio.levelUp();
    v.play('cheer');
    toast('¡Personaje guardado!', 'good');
    setTimeout(() => go('profile'), 900);
  };

  const random = () => {
    audio.whooshUi();
    const r = normAvatar(randomAvatar(Math.floor(Math.random() * 1e9)));
    // solo piezas que ya tienes
    for (const c of ALL_CATS) {
      if (!c.parts) continue;
      const part = c.parts.find((x) => x.id === String(r[c.id]));
      if (part && !owned(c.id, part)) (r as unknown as Record<string, unknown>)[c.id] = valueOf(c.id, c.parts.find((x) => owned(c.id, x))!.id);
    }
    r.number = draft.number;
    setDraft(r);
    v.play('wave');
  };

  const pickGroup = (id: string) => {
    audio.click();
    setGroup(id);
    setCatId(GROUPS.find((x) => x.id === id)!.cats[0].id);
  };

  return (
    <div class="screen full av-editor">
      <div class="pad row">
        <button class="icon-btn" onClick={() => go('profile')} aria-label="Volver">
          <Back />
        </button>
        <div class="display grow outline" style={{ textAlign: 'center', fontSize: '22px' }}>
          Tu personaje
        </div>
        <button class="btn small" onClick={save}>
          <Check class="ico" /> Guardar
        </button>
      </div>
      <div class="av-stage" ref={stage} {...drag}>
        <div class="av-tools left">
          <button class="icon-btn" onClick={random} aria-label="Aleatorio">
            🎲
          </button>
          <button class="icon-btn" onClick={() => (audio.click(), setDraft(normAvatar(p.avatar)))} aria-label="Deshacer cambios">
            ↺
          </button>
        </div>
        <div class="av-tools right">
          <button class="icon-btn" onClick={() => v.play((['wave', 'throw', 'think', 'cheer'] as const)[Math.floor(Math.random() * 4)])} aria-label="Gesto">
            👋
          </button>
          <button class="icon-btn" onClick={() => (audio.click(), v.focus(cat.frame === 'full' ? 'head' : 'full'))} aria-label="Acercar">
            🔍
          </button>
        </div>
        {lockedParts.length > 0 && <div class="av-locked">🔒 Llevas piezas sin comprar</div>}
      </div>
      <div class="av-groups">
        {GROUPS.map((x) => (
          <button key={x.id} class={x.id === group ? 'on' : ''} onClick={() => pickGroup(x.id)}>
            <span>{x.icon}</span>
            {x.label}
          </button>
        ))}
      </div>
      <div class="scroll av-cats" style={{ touchAction: 'pan-x' }}>
        {g.cats.map((c) => (
          <button key={c.id} class={'chip-btn' + (cat.id === c.id ? ' on' : '')} onClick={() => (audio.click(), setCatId(c.id))}>
            {c.label}
          </button>
        ))}
      </div>
      <div class="scroll grow pad av-items">
        {cat.colors && (
          <div class="av-colors">
            {cat.colors.map((col, i) => (
              <button key={i} class={'swatch' + (draft[cat.id] === i ? ' on' : '')} onClick={() => set(cat.id, i)} style={{ background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,.45), transparent 45%), ${col}` }} aria-label={'Color ' + (i + 1)} />
            ))}
          </div>
        )}
        {cat.parts && (
          <div class="av-grid">
            {cat.parts.map((part) => {
              const own = owned(cat.id, part);
              const lvlLock = (part.level ?? 0) > p.level;
              const on = String(draft[cat.id]) === part.id;
              const preview = { ...draft, [cat.id]: valueOf(cat.id, part.id) } as AvatarConfig;
              const frame = cat.frame === 'full' ? 'full' : cat.frame;
              return (
                <div key={part.id} class={'av-part' + (on ? ' on' : '') + (!own ? ' locked' : '')}>
                  <button onClick={() => set(cat.id, valueOf(cat.id, part.id))}>
                    <AvatarImg cfg={preview} size={frame === 'full' ? 80 : 96} h={frame === 'full' ? 120 : 96} frame={frame} class="thumb" />
                    <div class="nm">{part.name}</div>
                  </button>
                  {!own &&
                    (lvlLock ? (
                      <span class="pill" style={{ fontSize: '11px' }}>
                        <Lock class="ico" /> Nv. {part.level}
                      </span>
                    ) : (
                      <button
                        class="btn tiny gold"
                        onClick={() => {
                          if (buyCosmetic(`${cat.id}:${part.id}`, part.price!)) {
                            audio.coin();
                            toast(`¡${part.name} desbloqueado!`, 'good');
                            set(cat.id, valueOf(cat.id, part.id));
                          } else {
                            audio.error();
                            toast('No te alcanza', 'bad');
                          }
                        }}
                      >
                        <Price price={part.price!} />
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
        )}
        {cat.id === 'number' && (
          <div class="col" style={{ alignItems: 'center', padding: '10px' }}>
            <div class="display" style={{ fontSize: '56px' }}>{draft.number}</div>
            <input type="range" min={0} max={99} value={draft.number} style={{ width: '80%' }} onInput={(e) => setDraft({ ...draft, number: +(e.target as HTMLInputElement).value })} />
            <div class="muted" style={{ fontSize: '12px', fontWeight: 800 }}>Se ve en la espalda de la «Camiseta Pro» y la de «Campeón»</div>
          </div>
        )}
      </div>
    </div>
  );
}
