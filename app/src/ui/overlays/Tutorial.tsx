// Tutorial interactivo: una entrenadora guía el primer lanzamiento, la primera partida y el primer cofre.

import { useEffect, useState } from 'preact/hooks';
import type { AvatarConfig } from '@shared/protocol';
import type { MatchUI, MatchResult } from '../../game/match';
import { gameView } from '../../engine/gameView';
import { AvatarImg } from '../components/common';
import { mutate, profile, profileStore } from '../../meta/profile';
import { go } from '../state';
import { useStore } from '../../core/store';
import { slotState } from '../../meta/economy';
import { audio } from '../../services/audio';

export const COACH: AvatarConfig = { skin: 2, hair: 'ponytail', hairColor: 6, eyes: 1, beard: 'none', glasses: 'none', hat: 'headband', shirt: 'jersey', shirtColor: 4, number: 1 };

function Coach({ children, top, tap }: { children: preact.ComponentChildren; top?: boolean; tap?: boolean }) {
  return (
    <div class={'coach' + (top ? ' top' : '')}>
      <div class="face">
        <AvatarImg cfg={COACH} size={150} />
      </div>
      <div class="bubble">
        {children}
        {tap && <div class="tap">Toca la pantalla para continuar</div>}
      </div>
    </div>
  );
}

function Finger({ kind, x, y }: { kind: 'drag' | 'flick'; x: string; y: string }) {
  return (
    <svg class={'finger ' + kind} style={{ left: x, top: y }} viewBox="0 0 64 64">
      <circle cx="26" cy="12" r="10" fill="rgba(255,255,255,.35)" />
      <path d="M22 12c0-3 5-3 5 0v18l3-1c2-1 4 0 4 2l1-1c2-1 4 0 4 2 2-1 4 0 4 2v10c0 8-5 14-13 14h-2c-6 0-9-3-12-8l-6-10c-1-2 1-4 3-3l5 4z" fill="#ffe0c7" stroke="#6b4428" stroke-width="2" stroke-linejoin="round" />
    </svg>
  );
}

/** Capa del tutorial durante la partida de práctica. */
export function TutorialCoach({ m }: { m: MatchUI }) {
  const [moved, setMoved] = useState(0);
  const darts = m.state.players[0].darts;
  const mine = m.state.current === 0;
  useEffect(() => {
    const v = gameView();
    const start = { ...v.aim };
    v.onAimChange = (x, y) => setMoved(Math.hypot(x - start.x, y - start.y));
    return () => {
      v.onAimChange = undefined;
    };
  }, [darts]);

  if (m.phase === 'between' || m.phase === 'intro') return null;
  if (!mine) {
    return (
      <Coach top>
        Ahora lanza tu rival, <b>Paco</b>. ¡Fíjate en cómo resta sus puntos!
      </Coach>
    );
  }
  const remaining = m.state.players[0].remaining;
  if (darts === 0 && m.phase === 'aim') {
    if (moved < 25)
      return (
        <>
          <Coach>
            ¡Hola! Soy <b>Lola</b>, tu entrenadora. <b>Arrastra el dedo</b> por la pantalla para mover la mira y apunta al <b>20</b>, arriba del todo.
          </Coach>
          <Finger kind="drag" x="calc(50% - 32px)" y="62%" />
        </>
      );
    return (
      <>
        <Coach>
          ¡Eso es! Mantén el dedo quieto un instante (el círculo se hace <b>verde</b>) y luego <b>desliza rápido hacia arriba</b> para lanzar. 🎯
        </Coach>
        <Finger kind="flick" x="calc(50% - 32px)" y="64%" />
      </>
    );
  }
  if (darts === 1 && m.phase === 'aim') return <Coach>¡Gran lanzamiento! En cada turno tienes <b>3 dardos</b>. Prueba con el triple 20: la franja estrecha vale <b>x3</b>.</Coach>;
  if (darts === 3 && m.phase === 'aim') return <Coach>Tus puntos se <b>restan</b> de 101. ¡El primero que llegue <b>exactamente a 0</b> gana!</Coach>;
  if (remaining <= 60 && m.phase === 'aim') return <Coach>¡Te quedan <b>{remaining}</b>! Si te pasas de 0, el turno no cuenta. Sigue la pista verde de arriba. 😉</Coach>;
  return null;
}

/** Tras la partida del tutorial: regalo de cofre y guía al inicio. */
export function tutorialAfterMatch(r: MatchResult) {
  void r;
  go('home');
}

/** Guía del inicio tras el tutorial (abrir el primer cofre). */
export function HomeTutorial() {
  const p = useStore(profileStore);
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  if (p.tutorial.done || !p.tutorial.tips.includes('match')) return null;
  const idx = p.chests.findIndex((c) => c?.type === 'silver');
  if (p.tutorial.tips.includes('chest') || idx < 0) {
    if (!p.tutorial.tips.includes('chest')) {
      finishTutorial();
      return null;
    }
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 70 }} onClick={finishTutorial}>
        <Coach tap>
          ¡Genial! Las <b>cartas</b> sirven para mejorar tus dardos en la pestaña <b>Dardos</b>. Gana partidas para subir de <b>arena</b> y conseguir cofres mejores. ¡A por todas! 🏆
        </Coach>
      </div>
    );
  }
  const ready = slotState(p.chests[idx]) === 'ready';
  const left = 14 + idx * ((innerWidth - 28) / 4) + (innerWidth - 28) / 8 - 22;
  return (
    <>
      <Coach top>{ready ? <>¡Tu primer <b>cofre</b> está listo! Tócalo para abrirlo.</> : <>¡Bien jugado! Te regalo un <b>Cofre de Plata</b>. Se abrirá en unos segundos...</>}</Coach>
      {ready && (
        <svg class="pointer-arrow" style={{ left: left + 'px', bottom: 'calc(var(--safe-bottom) + var(--nav-h) + 98px)' }} viewBox="0 0 40 40">
          <path d="M20 38L4 18h10V2h12v16h10z" fill="#ffd23a" stroke="#7a4a00" stroke-width="2" stroke-linejoin="round" />
        </svg>
      )}
    </>
  );
}

export function noteTutorialChestOpened() {
  const p = profile();
  if (!p.tutorial.done && p.tutorial.tips.includes('match') && !p.tutorial.tips.includes('chest')) {
    mutate((pp) => pp.tutorial.tips.push('chest'));
  }
}

export function finishTutorial() {
  audio.click();
  mutate((p) => {
    p.tutorial.done = true;
  });
}
