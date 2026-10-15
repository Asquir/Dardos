// Editor de personaje: piel, pelo, ojos, barba, gafas, gorros y ropa.

import { useEffect, useState } from 'preact/hooks';
import type { AvatarConfig } from '@shared/protocol';
import { useStore } from '../../core/store';
import { profileStore, mutate } from '../../meta/profile';
import { avatarView } from '../../engine/avatar';
import { useDragRotate, Price, AvatarImg } from '../components/common';
import { Back, Lock, Check } from '../icons';
import { go, toast } from '../state';
import { audio } from '../../services/audio';
import { HAIRS, BEARDS, GLASSES, HATS, SHIRTS, SKIN_TONES, HAIR_COLORS, SHIRT_COLORS, EYE_COLORS, type AvatarPart } from '../../meta/catalog';
import { buyCosmetic, ownsCosmetic } from '../../meta/economy';
import { net } from '../../services/net';

type Cat = 'skin' | 'hair' | 'hairColor' | 'eyes' | 'beard' | 'glasses' | 'hat' | 'shirt' | 'shirtColor' | 'number';
const CATS: { id: Cat; label: string; icon: string }[] = [
  { id: 'skin', label: 'Piel', icon: '🖐️' },
  { id: 'hair', label: 'Pelo', icon: '💇' },
  { id: 'hairColor', label: 'Color', icon: '🎨' },
  { id: 'eyes', label: 'Ojos', icon: '👁️' },
  { id: 'beard', label: 'Barba', icon: '🧔' },
  { id: 'glasses', label: 'Gafas', icon: '👓' },
  { id: 'hat', label: 'Gorro', icon: '🧢' },
  { id: 'shirt', label: 'Ropa', icon: '👕' },
  { id: 'shirtColor', label: 'Color ropa', icon: '🎽' },
  { id: 'number', label: 'Dorsal', icon: '#️⃣' },
];

const PARTS: Partial<Record<Cat, AvatarPart[]>> = { hair: HAIRS, beard: BEARDS, glasses: GLASSES, hat: HATS, shirt: SHIRTS };
const COLORS: Partial<Record<Cat, string[]>> = { skin: SKIN_TONES, hairColor: HAIR_COLORS, eyes: EYE_COLORS, shirtColor: SHIRT_COLORS };

export function AvatarEditor() {
  const p = useStore(profileStore);
  const [cat, setCat] = useState<Cat>('hair');
  const [draft, setDraft] = useState<AvatarConfig>({ ...p.avatar });
  const v = avatarView();
  const drag = useDragRotate(v);
  useEffect(() => {
    v.set(draft);
  }, [JSON.stringify(draft)]);

  const set = <K extends keyof AvatarConfig>(k: K, val: AvatarConfig[K]) => {
    audio.click();
    setDraft({ ...draft, [k]: val });
  };
  const owned = (c: Cat, part: AvatarPart) => !part.price || ownsCosmetic(p, `${c}:${part.id}`);
  const lockedParts = (Object.keys(PARTS) as Cat[]).filter((c) => {
    const part = PARTS[c]!.find((x) => x.id === (draft as unknown as Record<string, string>)[c]);
    return part && !owned(c, part);
  });
  const save = () => {
    if (lockedParts.length) {
      audio.error();
      return toast('Compra primero las piezas marcadas con candado', 'bad');
    }
    mutate((pp) => (pp.avatar = draft));
    net.syncProfile();
    audio.levelUp();
    toast('¡Personaje guardado!', 'good');
    go('profile');
  };

  return (
    <div class="screen full">
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
      <div style={{ height: '30vh', flex: 'none', touchAction: 'none' }} {...drag} />
      <div class="scroll" style={{ display: 'flex', gap: '6px', padding: '0 14px 8px', overflowX: 'auto', touchAction: 'pan-x', flex: 'none' }}>
        {CATS.map((c) => (
          <button key={c.id} class={'btn tiny ' + (cat === c.id ? 'blue' : 'dark')} style={{ flexShrink: 0 }} onClick={() => (audio.click(), setCat(c.id))}>
            {c.icon} {c.label}
          </button>
        ))}
      </div>
      <div class="scroll grow pad">
        {COLORS[cat] && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px', padding: '6px 0' }}>
            {COLORS[cat]!.map((col, i) => (
              <button
                key={i}
                onClick={() => set(cat as 'skin', i)}
                style={{ aspectRatio: '1', borderRadius: '50%', background: col, border: (draft as unknown as Record<string, number>)[cat] === i ? '4px solid #fff' : '3px solid rgba(255,255,255,.15)', boxShadow: '0 3px 0 rgba(0,0,0,.4)' }}
                aria-label={'Color ' + (i + 1)}
              />
            ))}
          </div>
        )}
        {PARTS[cat] && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', padding: '6px 0 20px' }}>
            {PARTS[cat]!.map((part) => {
              const own = owned(cat, part);
              const lvlLock = (part.level ?? 0) > p.level;
              const on = (draft as unknown as Record<string, string>)[cat] === part.id;
              return (
                <div key={part.id} class="card" style={{ padding: '10px 6px', textAlign: 'center', borderColor: on ? 'var(--gold)' : undefined, boxShadow: on ? '0 0 0 2px var(--gold)' : undefined }}>
                  <button style={{ width: '100%' }} onClick={() => set(cat as 'hair', part.id)}>
                    <AvatarImg cfg={{ ...draft, [cat]: part.id }} size={96} style={{ width: '64px', height: '64px', borderRadius: '14px', background: 'radial-gradient(circle at 50% 35%, #3d4b9a, #1b2152)' }} />
                    <div style={{ fontWeight: 900, fontSize: '12px', minHeight: '2.4em', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{part.name}</div>
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
                          if (buyCosmetic(`${cat}:${part.id}`, part.price!)) {
                            audio.coin();
                            toast(`¡${part.name} desbloqueado!`, 'good');
                            set(cat as 'hair', part.id);
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
        {cat === 'number' && (
          <div class="col" style={{ alignItems: 'center', padding: '10px' }}>
            <div class="display" style={{ fontSize: '48px' }}>{draft.number}</div>
            <input type="range" min={0} max={99} value={draft.number} onInput={(e) => setDraft({ ...draft, number: +(e.target as HTMLInputElement).value })} />
            <div class="muted" style={{ fontSize: '12px', fontWeight: 800 }}>Se ve en la «Camiseta Pro»</div>
          </div>
        )}
      </div>
    </div>
  );
}
