// Torneo eliminatorio de 8 jugadores contra la máquina.

import { useStore, fmtNum } from '../../core/store';
import { profileStore, mutate, profile } from '../../meta/profile';
import { ARENAS, arenaForTrophies } from '../../meta/arenas';
import { arenaMult } from '../../meta/chests';
import { makeBot, rng } from '@shared/bot';
import { humanPlayer, botPlayer, launch } from '../../game/launch';
import type { MatchResult } from '../../game/match';
import { go, toast } from '../state';
import { audio } from '../../services/audio';
import { claim } from '../rewards';
import { Back, Coin } from '../icons';
import { confetti } from '../fx';

const ROUND_NAMES = ['Cuartos de final', 'Semifinal', 'Gran Final'];

export function tournamentEntry(): number {
  return Math.round((300 * arenaMult(arenaForTrophies(profile().bestTrophies))) / 50) * 50;
}

function newTournament() {
  const p = profile();
  const entry = tournamentEntry();
  if (p.coins < entry) {
    audio.error();
    return toast(`Necesitas ${fmtNum(entry)} monedas`, 'bad');
  }
  const arena = arenaForTrophies(p.bestTrophies);
  const a = ARENAS[arena];
  const seed = Date.now() & 0xffffff;
  const r = rng(seed);
  const bracket = [{ name: p.name, sigma: 0, seed: 0 }];
  for (let i = 1; i < 8; i++) {
    const s = seed + i * 97;
    const sigma = a.botSigma[0] + r() * (a.botSigma[1] - a.botSigma[0]);
    bracket.push({ name: makeBot(s, sigma, p.trophies).name, sigma, seed: s });
  }
  // el jugador va en una posición aleatoria del cuadro
  const pos = Math.floor(r() * 8);
  [bracket[0], bracket[pos]] = [bracket[pos], bracket[0]];
  mutate((pp) => {
    pp.coins -= entry;
    pp.tournament = { id: String(seed), entry, arena, round: 0, bracket, rounds: [[0, 1, 2, 3, 4, 5, 6, 7]], alive: true, won: false };
  });
  audio.coin();
}

function meIndex(t: NonNullable<ReturnType<typeof profile>['tournament']>) {
  return t.bracket.findIndex((b) => b.sigma === 0);
}

function playRound() {
  const t = profile().tournament;
  if (!t || !t.alive) return;
  const me = meIndex(t);
  const alive = t.rounds[t.round];
  const pos = alive.indexOf(me);
  const oppIdx = alive[pos % 2 === 0 ? pos + 1 : pos - 1];
  const opp = t.bracket[oppIdx];
  const harder = 1 - t.round * 0.07;
  const bot = botPlayer(t.arena, { sigma: opp.sigma * harder, seed: opp.seed, name: opp.name });
  go('game');
  launch({
    type: 'tournament',
    config: t.round === 2 ? { mode: 'x01', start: 501, doubleOut: true } : { mode: 'x01', start: 301, doubleOut: true },
    arena: Math.min(6, t.arena + t.round),
    players: [humanPlayer(), bot],
    starter: Math.random() < 0.5 ? 0 : 1,
    title: ROUND_NAMES[t.round],
  });
}

export function tournamentAfterMatch(r: MatchResult) {
  const t = profile().tournament;
  go('tournament');
  if (!t) return;
  const me = meIndex(t);
  const alive = t.rounds[t.round];
  const next: number[] = [];
  for (let i = 0; i < alive.length; i += 2) {
    const a = alive[i];
    const b = alive[i + 1];
    if (a === me || b === me) next.push(r.won ? me : a === me ? b : a);
    else {
      // partidos entre bots: gana más a menudo el de menor sigma
      const sa = t.bracket[a].sigma;
      const sb = t.bracket[b].sigma;
      next.push(Math.random() < sb / (sa + sb) ? a : b);
    }
  }
  const round = t.round + 1;
  const champion = r.won && round === 3;
  mutate((pp) => {
    if (!pp.tournament) return;
    pp.tournament.rounds.push(next);
    pp.tournament.round = round;
    pp.tournament.alive = r.won && round < 3;
    pp.tournament.won = champion;
    if (champion) pp.stats.tournamentsWon++;
  });
  if (champion) {
    confetti(200);
    audio.win();
    claim({ coins: t.entry * 6, chest: 'gold' }, '¡CAMPEÓN DEL TORNEO!');
  } else if (!r.won) {
    const prize = t.round === 2 ? Math.round(t.entry * 2.5) : t.round === 1 ? t.entry : 0;
    if (prize) claim({ coins: prize }, t.round === 2 ? '¡Subcampeón!' : 'Semifinalista');
    else toast('Eliminado en cuartos. ¡La próxima vez!');
  } else {
    audio.levelUp();
    toast(`¡Pasas a ${ROUND_NAMES[round]}!`, 'good');
  }
}

export function Tournament() {
  const p = useStore(profileStore);
  const t = p.tournament;
  const entry = tournamentEntry();
  const active = t && t.round < 3 && t.alive;
  return (
    <div class="screen dim">
      <div class="pad row" style={{ marginBottom: '8px' }}>
        <button class="icon-btn" onClick={() => go('events')} aria-label="Volver">
          <Back />
        </button>
        <div class="display grow outline" style={{ fontSize: '24px', textAlign: 'center' }}>
          Torneo Eliminatorio
        </div>
        <div style={{ width: '38px' }} />
      </div>
      <div class="scroll grow content pad col">
        {t ? <Bracket /> : (
          <div class="panel" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '64px' }}>🏆</div>
            <div class="display" style={{ fontSize: '22px' }}>8 jugadores, solo un campeón</div>
            <div class="muted" style={{ fontWeight: 800, fontSize: '13px', margin: '6px 0' }}>
              Cuartos y semifinal a 301, la final a 501. Si pierdes quedas eliminado.
            </div>
          </div>
        )}
        <div class="panel col">
          <div class="display" style={{ fontSize: '18px' }}>Premios</div>
          <div class="row" style={{ justifyContent: 'space-between', fontWeight: 800 }}>
            <span>🥇 Campeón</span>
            <span>
              <Coin style={{ width: '16px', verticalAlign: '-3px' }} /> {fmtNum((t?.entry ?? entry) * 6)} + Cofre de Oro
            </span>
          </div>
          <div class="row" style={{ justifyContent: 'space-between', fontWeight: 800 }}>
            <span>🥈 Finalista</span>
            <span>
              <Coin style={{ width: '16px', verticalAlign: '-3px' }} /> {fmtNum(Math.round((t?.entry ?? entry) * 2.5))}
            </span>
          </div>
          <div class="row" style={{ justifyContent: 'space-between', fontWeight: 800 }}>
            <span>🥉 Semifinalista</span>
            <span>
              <Coin style={{ width: '16px', verticalAlign: '-3px' }} /> {fmtNum(t?.entry ?? entry)}
            </span>
          </div>
        </div>
        {active ? (
          <button class="btn big block shine" onClick={() => (audio.click(), playRound())}>
            Jugar {ROUND_NAMES[t!.round]}
          </button>
        ) : (
          <button class="btn big block gold shine" onClick={() => (audio.click(), newTournament())}>
            {t ? 'Nuevo torneo' : 'Inscribirse'} · <Coin class="ico" /> {fmtNum(entry)}
          </button>
        )}
        {active && (
          <button class="btn small red" style={{ alignSelf: 'center' }} onClick={() => mutate((pp) => (pp.tournament = null))}>
            Abandonar torneo
          </button>
        )}
      </div>
    </div>
  );
}

function Bracket() {
  const p = useStore(profileStore);
  const t = p.tournament!;
  const me = meIndex(t);
  const cols = [0, 1, 2, 3].map((r) => t.rounds[r] ?? null);
  return (
    <div class="panel">
      <div class="bracket">
        {cols.map((alive, r) => (
          <div class="col" key={r}>
            <div class="muted" style={{ fontSize: '10px', fontWeight: 900, textAlign: 'center' }}>
              {r < 3 ? ROUND_NAMES[r].replace(' de final', '') : 'Campeón'}
            </div>
            {(alive ?? Array.from({ length: 8 >> r }, () => -1)).map((idx, k) => {
              const out = idx >= 0 && t.rounds[r + 1] && !t.rounds[r + 1].includes(idx);
              return (
                <div key={k} class={'slot-b' + (idx === me ? ' me' : '') + (out ? ' out' : '')}>
                  {idx >= 0 ? (r === 3 ? '👑 ' : '') + t.bracket[idx].name : '?'}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {t.round >= 3 || !t.alive ? (
        <div class="display" style={{ textAlign: 'center', fontSize: '20px', marginTop: '10px', color: t.won ? 'var(--gold)' : '#ff8fa3' }}>
          {t.won ? '¡Eres el campeón! 🏆' : 'Has sido eliminado'}
        </div>
      ) : null}
    </div>
  );
}
