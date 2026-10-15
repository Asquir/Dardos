// Eventos: torneo, desafío diario, entrenamientos, partida local y sala privada.

import { useStore, dayKey, fmtNum, useNow, fmtTime } from '../../core/store';
import { profileStore, mutate, profile } from '../../meta/profile';
import { FEATURE_LEVEL, todaysChallenge } from '../../meta/progression';
import { go, openModal, toast } from '../state';
import { audio } from '../../services/audio';
import { challengeSetup, launch, trainingSetup, localSetup } from '../../game/launch';
import type { MatchResult } from '../../game/match';
import { claim } from '../rewards';
import { Modal } from '../components/common';
import { closeModal } from '../state';
import { useState } from 'preact/hooks';
import { tournamentEntry } from './Tournament';
import { Coin } from '../icons';
import { LiveEventCard } from './LiveEvent';

export function Events() {
  const p = useStore(profileStore);
  const now = useNow(1000);
  const ch = todaysChallenge();
  const doneToday = p.challenge.day === dayKey();
  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);
  const tLocked = p.level < FEATURE_LEVEL.tournament;
  const cLocked = p.level < FEATURE_LEVEL.challenge;
  return (
    <div class="screen dim">
      <div class="scroll grow content pad col" style={{ paddingTop: '6px', paddingBottom: '16px', gap: '12px' }}>
        {p.level >= FEATURE_LEVEL.liveEvent ? (
          <LiveEventCard />
        ) : (
          <button class="event-card locked" data-lock={`🔒 Nivel ${FEATURE_LEVEL.liveEvent}`} style={{ background: 'linear-gradient(135deg,#8a2be2,#ff3d6a)' }} onClick={() => toast(`Los eventos en vivo se desbloquean en el nivel ${FEATURE_LEVEL.liveEvent}`)}>
            <div class="big-ic">⚡</div>
            <div class="grow" style={{ textAlign: 'left' }}>
              <h3 class="outline">Eventos en vivo</h3>
              <p>Reglas especiales cada 3 días y objetos exclusivos.</p>
            </div>
          </button>
        )}
        <button
          class={'event-card' + (tLocked ? ' locked' : '')}
          data-lock={`🔒 Nivel ${FEATURE_LEVEL.tournament}`}
          style={{ background: 'linear-gradient(135deg,#ffb300,#ff3d6a 60%,#8a2be2)' }}
          onClick={() => (tLocked ? toast(`Torneos desde el nivel ${FEATURE_LEVEL.tournament}`) : (audio.click(), go('tournament')))}
        >
          <div class="big-ic">🏆</div>
          <div class="grow" style={{ textAlign: 'left' }}>
            <h3 class="outline">Torneo Eliminatorio</h3>
            <p>8 jugadores · 3 rondas · ¡El campeón se lleva un Cofre de Oro!</p>
            <p>
              Entrada <Coin style={{ width: '14px', verticalAlign: '-2px' }} /> {fmtNum(tournamentEntry())}
            </p>
          </div>
        </button>

        <button
          class={'event-card' + (cLocked ? ' locked' : '')}
          data-lock={`🔒 Nivel ${FEATURE_LEVEL.challenge}`}
          style={{ background: 'linear-gradient(135deg,#11a86a,#1f6dff)' }}
          onClick={() => {
            if (cLocked) return toast(`Desafíos desde el nivel ${FEATURE_LEVEL.challenge}`);
            audio.click();
            go('game');
            launch(challengeSetup());
          }}
        >
          <div class="big-ic">⭐</div>
          <div class="grow" style={{ textAlign: 'left' }}>
            <h3 class="outline">Desafío diario: {ch.name}</h3>
            <p>{ch.desc}</p>
            <p>
              {doneToday ? `Mejor hoy: ${p.challenge.best} · ${'★'.repeat(p.challenge.claimed)}${'☆'.repeat(3 - p.challenge.claimed)}` : '¡Consigue hasta 3 estrellas!'} · Nuevo en {fmtTime((tomorrow.getTime() - now) / 1000)}
            </p>
          </div>
        </button>

        <div class="section-title outline" style={{ margin: '6px 2px 0' }}>
          Entrenamiento <span class="line" />
        </div>
        <TrainingCard icon="🕐" title="Alrededor del reloj" desc="Acierta del 1 al 20 y el bull en el menor número de dardos." onClick={() => startTraining('atc', false)} color="#2c3a8f" />
        <TrainingCard icon="✅" title="Práctica de cierres" desc="Un número al azar: ciérralo con doble en 9 dardos." onClick={() => startTraining('checkout', false)} color="#2c3a8f" />
        <TrainingCard icon="🦗" title="Cricket contra la máquina" desc="Cierra 15-20 y el bull antes que tu rival." onClick={() => startTraining('cricket', true)} color="#2c3a8f" />
        <TrainingCard icon="🎯" title="501 contra la máquina" desc="Partida amistosa, sin copas ni entrada." onClick={() => startTraining('x01', true)} color="#2c3a8f" />
        <TrainingCard icon="🆓" title="Lanzamiento libre" desc="10 turnos para mejorar tu media." onClick={() => startTraining('free', false)} color="#2c3a8f" />

        <div class="section-title outline" style={{ margin: '6px 2px 0' }}>
          Con amigos <span class="line" />
        </div>
        <TrainingCard icon="👥" title="Partida local (pasar el móvil)" desc="De 2 a 4 jugadores en el mismo dispositivo." onClick={() => openModal({ kind: 'localSetup' })} color="#5a2bb0" />
        <TrainingCard icon="🔑" title="Sala privada online" desc="Crea una sala y comparte el código con un amigo." onClick={() => openModal({ kind: 'privateRoom' })} color="#5a2bb0" />
      </div>
    </div>
  );
}

function TrainingCard({ icon, title, desc, onClick, color }: { icon: string; title: string; desc: string; onClick: () => void; color: string }) {
  return (
    <button class="event-card" style={{ background: `linear-gradient(135deg, ${color}, #141a46)`, padding: '10px 12px' }} onClick={() => (audio.click(), onClick())}>
      <div class="big-ic" style={{ fontSize: '34px', width: '48px' }}>
        {icon}
      </div>
      <div class="grow" style={{ textAlign: 'left' }}>
        <h3 class="outline" style={{ fontSize: '17px' }}>
          {title}
        </h3>
        <p>{desc}</p>
      </div>
    </button>
  );
}

function startTraining(kind: Parameters<typeof trainingSetup>[0], vsBot: boolean) {
  go('game');
  launch(trainingSetup(kind, vsBot));
}

/** Tras el desafío diario: estrellas nuevas = premio. */
export function challengeAfterMatch(r: MatchResult) {
  const ch = todaysChallenge();
  const p = profile();
  const today = dayKey();
  const prevStars = p.challenge.day === today ? p.challenge.claimed : 0;
  const stars = r.stars ?? 0;
  mutate((pp) => {
    if (pp.challenge.day !== today) pp.challenge = { day: today, best: 0, claimed: 0 };
    pp.challenge.best = Math.max(pp.challenge.best, r.challengeScore ?? 0);
    pp.challenge.claimed = Math.max(pp.challenge.claimed, stars);
  });
  go('events');
  if (stars > prevStars) {
    const reward = { coins: 0, gems: 0 } as { coins: number; gems: number; chest?: 'silver' };
    for (let s = prevStars; s < stars; s++) {
      const rw = ch.rewards[s];
      reward.coins += rw.coins ?? 0;
      reward.gems += rw.gems ?? 0;
      if (rw.chest) reward.chest = rw.chest as 'silver';
    }
    claim(reward, `¡${stars} estrella${stars > 1 ? 's' : ''}!`);
  } else toast(stars ? 'Ya tenías estas estrellas hoy. ¡Inténtalo para más!' : 'Sin estrellas esta vez. ¡Prueba otra vez!');
}

export function LocalSetupModal() {
  const [names, setNames] = useState(['Jugador 1', 'Jugador 2']);
  const [mode, setMode] = useState<'301' | '501' | 'cricket' | 'atc'>('301');
  const start = () => {
    const cfg = mode === 'cricket' ? { mode: 'cricket' as const } : mode === 'atc' ? { mode: 'atc' as const } : { mode: 'x01' as const, start: +mode, doubleOut: mode === '501' };
    closeModal();
    go('game');
    launch(localSetup(names.map((n, i) => n.trim() || `Jugador ${i + 1}`), cfg));
  };
  return (
    <Modal title="Partida local">
      <div class="col">
        {names.map((n, i) => (
          <input key={i} class="form-field" maxLength={14} value={n} onInput={(e) => setNames(names.map((x, k) => (k === i ? (e.target as HTMLInputElement).value : x)))} />
        ))}
        <div class="row">
          <button class="btn small gray grow" disabled={names.length <= 2} onClick={() => setNames(names.slice(0, -1))}>
            − Jugador
          </button>
          <button class="btn small gray grow" disabled={names.length >= 4} onClick={() => setNames([...names, `Jugador ${names.length + 1}`])}>
            + Jugador
          </button>
        </div>
        <div class="seg">
          {(['301', '501', 'cricket', 'atc'] as const).map((m) => (
            <button key={m} class={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {m === 'atc' ? 'Reloj' : m === 'cricket' ? 'Cricket' : m}
            </button>
          ))}
        </div>
        <button class="btn block" onClick={start}>
          ¡Empezar!
        </button>
      </div>
    </Modal>
  );
}
