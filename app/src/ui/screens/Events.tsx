// Eventos: torneo, desafío diario, entrenamientos, partida local y sala privada.

import { useStore, dayKey, fmtNum, useNow, fmtTime } from '../../core/store';
import { profileStore } from '../../meta/profile';
import { FEATURE_LEVEL, todaysChallenge } from '../../meta/progression';
import { go, openModal, toast } from '../state';
import { audio } from '../../services/audio';
import { challengeSetup, launch, trainingSetup, localSetup } from '../../game/launch';
import type { MatchResult } from '../../game/match';
import { showPost } from '../rewards';
import { Modal } from '../components/common';
import { closeModal } from '../state';
import { useState } from 'preact/hooks';
import { tournamentEntry } from './Tournament';
import { Coin } from '../icons';
import { LiveEventCard } from './LiveEvent';
import { MODES } from '../../meta/modes';
import type { MatchConfig } from '@shared/rules';
import { careerRank } from '../../meta/career';

export function Events() {
  const p = useStore(profileStore);
  const now = useNow(1000);
  const ch = todaysChallenge();
  const doneToday = p.challenge.day === dayKey();
  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);
  const tLocked = p.level < FEATURE_LEVEL.tournament;
  const careerLocked = p.level < FEATURE_LEVEL.career;
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
          class={'event-card' + (careerLocked ? ' locked' : '')}
          data-lock={`🔒 Nivel ${FEATURE_LEVEL.career}`}
          style={{ background: 'linear-gradient(135deg,#0f6b5a,#1f3dff 70%,#7a2bd6)' }}
          onClick={() => (careerLocked ? toast(`La carrera se desbloquea en el nivel ${FEATURE_LEVEL.career}`) : (audio.click(), go('career')))}
        >
          <div class="big-ic">🌍</div>
          <div class="grow" style={{ textAlign: 'left' }}>
            <h3 class="outline">
              Carrera profesional <span class="new-tag">NUEVO</span>
            </h3>
            <p>Gira de 8 torneos gratis, ranking mundial y Finales para los 8 mejores.</p>
            <p>{p.career ? `Temporada ${p.career.season} · puesto #${careerRank(p.career)} · ${p.career.titles} títulos` : '¡Empieza tu carrera desde abajo!'}</p>
          </div>
        </button>

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
          Juegos de bar <span class="new-tag">NUEVO</span> <span class="line" />
        </div>
        <TrainingCard icon={MODES.killer.icon} title="Killer contra 2 rivales" desc={MODES.killer.short} onClick={() => startTraining('killer', true)} color="#8a1f3a" best={bestText(p, 'killer')} />
        <TrainingCard icon="🗡️" title="Cricket Cut-Throat (3 jugadores)" desc="Tus puntos se los come el rival: gana quien menos tenga." onClick={() => startTraining('cutthroat', true)} color="#8a1f3a" />
        <TrainingCard icon={MODES.shanghai.icon} title="Shanghái" desc={MODES.shanghai.short} onClick={() => startTraining('shanghai', true)} color="#8a1f3a" best={bestText(p, 'shanghai')} />
        <TrainingCard icon={MODES.halveit.icon} title="Halve-It" desc={MODES.halveit.short} onClick={() => startTraining('halveit', true)} color="#8a1f3a" best={bestText(p, 'halveit')} />
        <TrainingCard icon={MODES.baseball.icon} title="Béisbol" desc={MODES.baseball.short} onClick={() => startTraining('baseball', true)} color="#8a1f3a" best={bestText(p, 'baseball')} />
        <TrainingCard icon={MODES.bobs27.icon} title="Bob's 27 (dobles)" desc={MODES.bobs27.short} onClick={() => startTraining('bobs27', false)} color="#8a1f3a" best={bestText(p, 'bobs27')} />
        <TrainingCard icon={MODES.c121.icon} title="121 Checkout" desc={MODES.c121.short} onClick={() => startTraining('c121', false)} color="#8a1f3a" best={bestText(p, 'c121')} />

        <div class="section-title outline" style={{ margin: '6px 2px 0' }}>
          Con amigos <span class="line" />
        </div>
        <TrainingCard icon="👥" title="Partida local (pasar el móvil)" desc="De 2 a 4 jugadores en el mismo dispositivo." onClick={() => openModal({ kind: 'localSetup' })} color="#5a2bb0" />
        <TrainingCard icon="⚔️" title="Reta a un amigo (sin conexión)" desc="Juega 9 dardos y pásale el código: él juega el mismo reto." onClick={() => openModal({ kind: 'duel' })} color="#5a2bb0" best={bestText(p, 'duel9')} />
        <TrainingCard icon="🔑" title="Sala privada online" desc="Crea una sala y comparte el código con un amigo." onClick={() => openModal({ kind: 'privateRoom' })} color="#5a2bb0" />
      </div>
    </div>
  );
}

/** Récord personal de un modo (si ya se ha jugado). */
function bestText(p: ReturnType<typeof profileStore.get>, mode: string): string | undefined {
  const b = p.records?.[mode];
  if (!b) return undefined;
  return mode === 'killer' ? `🏆 ${b} victorias` : mode === 'c121' ? `🏅 Récord: hasta ${b}` : `🏅 Récord: ${b}`;
}

function TrainingCard({ icon, title, desc, onClick, color, best }: { icon: string; title: string; desc: string; onClick: () => void; color: string; best?: string }) {
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
        {best && <p class="tc-best">{best}</p>}
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
  go('events');
  showPost(r.post);
}

type LocalMode = '301' | '501' | 'cricket' | 'cutthroat' | 'atc' | 'killer' | 'shanghai' | 'halveit' | 'baseball';
const LOCAL_MODES: LocalMode[] = ['301', '501', 'cricket', 'cutthroat', 'atc', 'killer', 'shanghai', 'halveit', 'baseball'];

export function LocalSetupModal() {
  const [names, setNames] = useState(['Jugador 1', 'Jugador 2']);
  const [mode, setMode] = useState<LocalMode>('301');
  const start = () => {
    const cfg: MatchConfig = mode === '301' || mode === '501' ? { mode: 'x01', start: +mode, doubleOut: mode === '501' } : mode === 'cutthroat' ? { mode: 'cricket', cutthroat: true } : { mode };
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
        <div class="seg wrap">
          {LOCAL_MODES.map((m) => (
            <button key={m} class={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {m === '301' || m === '501' ? m : m === 'cutthroat' ? '🗡️ Cut-Throat' : MODES[m].icon + ' ' + (m === 'atc' ? 'Reloj' : MODES[m].name)}
            </button>
          ))}
        </div>
        {mode !== '301' && mode !== '501' && <div class="muted" style={{ fontSize: '12px', fontWeight: 800 }}>{mode === 'cutthroat' ? 'Cricket al revés: tus puntos van al rival.' : MODES[mode].short}</div>}
        <button class="btn block" onClick={start}>
          ¡Empezar!
        </button>
      </div>
    </Modal>
  );
}
