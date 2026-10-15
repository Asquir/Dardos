// Bienvenida en el primer arranque: nombre, aspecto rápido y comienzo del tutorial.

import { useState } from 'preact/hooks';
import { mutate, profile } from '../../meta/profile';
import { AvatarImg } from '../components/common';
import { randomAvatar, tutorialSetup, launch } from '../../game/launch';
import { go } from '../state';
import { audio } from '../../services/audio';
import { RefreshIco } from '../icons';
import { cleanName } from '@shared/text';

export function Onboarding() {
  const [name, setName] = useState(profile().name);
  const [seed, setSeed] = useState(Math.floor(Math.random() * 1000));
  const options = [0, 1, 2].map((i) => randomAvatar(seed * 3 + i));
  const [pick, setPick] = useState(0);
  const start = (skip = false) => {
    audio.unlock();
    audio.click();
    const n = cleanName(name) || profile().name;
    mutate((p) => {
      p.name = n;
      p.nameSet = true;
      p.avatar = options[pick];
      if (skip) {
        p.tutorial.done = true;
      }
    });
    if (skip) return go('home');
    go('game');
    launch(tutorialSetup());
  };
  return (
    <div class="screen full dim" style={{ justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
      <div class="logo" style={{ marginBottom: '14px' }}>
        <div class="a">DIANA</div>
        <div class="b">LEGENDS</div>
      </div>
      <div class="panel" style={{ width: '100%', maxWidth: '380px' }}>
        <div class="display" style={{ fontSize: '22px', textAlign: 'center' }}>¡Bienvenido, jugador!</div>
        <div class="muted" style={{ textAlign: 'center', fontWeight: 700, fontSize: '13px', margin: '4px 0 12px' }}>
          Elige tu nombre y tu aspecto. Podrás cambiarlo todo después.
        </div>
        <input class="form-field" maxLength={16} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="Tu nombre" />
        <div class="row" style={{ justifyContent: 'center', margin: '14px 0 6px', gap: '10px' }}>
          {options.map((o, i) => (
            <button
              key={seed + '_' + i}
              onClick={() => (audio.click(), setPick(i))}
              style={{ width: '88px', height: '88px', borderRadius: '20px', border: '3px solid ' + (pick === i ? 'var(--gold)' : 'rgba(255,255,255,.15)'), background: 'radial-gradient(circle at 50% 35%, #3d4b9a, #1b2152)', overflow: 'hidden', transform: pick === i ? 'scale(1.08)' : 'none', transition: 'transform .2s' }}
            >
              <AvatarImg cfg={o} size={176} style={{ width: '100%', height: '100%' }} />
            </button>
          ))}
          <button class="icon-btn" onClick={() => (audio.click(), setSeed(seed + 1))} aria-label="Otros aspectos">
            <RefreshIco />
          </button>
        </div>
        <button class="btn big block shine" style={{ marginTop: '12px' }} onClick={() => start(false)}>
          ¡A jugar!
        </button>
        <button class="btn small dark block" style={{ marginTop: '10px' }} onClick={() => start(true)}>
          Ya sé jugar, saltar tutorial
        </button>
      </div>
    </div>
  );
}
