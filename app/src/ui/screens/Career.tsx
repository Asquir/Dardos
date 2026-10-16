// Carrera profesional: calendario de la gira, cuadro de la parada actual y ranking mundial.

import { useStore, fmtNum } from '../../core/store';
import { profileStore, mutate, profile } from '../../meta/profile';
import { CAREER_POINTS, CAREER_ROUNDS, TOUR, careerRank, careerRanking, closeSeason, currentOpponent, newCareer, prizeBase, proSigma, skipStop, startStop, type CareerState } from '../../meta/career';
import { expectedAverage } from '@shared/bot';
import { humanPlayer, botPlayer, launch } from '../../game/launch';
import type { MatchResult } from '../../game/match';
import { modeLabel } from '../../meta/modes';
import { go, toast } from '../state';
import { audio } from '../../services/audio';
import { showPost } from '../rewards';
import { Back, Coin } from '../icons';
import { confetti } from '../fx';

const MEDAL = ['QF', 'SF', '🥈', '🏆'];

function ensureCareer(): CareerState {
  let c = profile().career;
  if (!c) {
    c = newCareer();
    mutate((p) => (p.career = c));
  }
  return profile().career!;
}

function playMatch() {
  const c = profile().career;
  if (!c) return;
  if (!c.bracket) {
    const { qualified } = startStop();
    if (!qualified) {
      audio.error();
      return toast('Solo los 8 primeros del ranking juegan las Finales', 'bad');
    }
  }
  const cc = profile().career!;
  const opp = currentOpponent(cc);
  if (!opp) return;
  const stop = TOUR[cc.stop];
  const sigma = proSigma(opp.rating, stop.arena) * (1 - cc.round * 0.04);
  const bot = botPlayer(stop.arena, { sigma, seed: opp.seed, name: opp.name });
  go('game');
  launch({
    type: 'career',
    config: { ...stop.config, legsToWin: stop.legs[cc.round] },
    arena: stop.arena,
    players: [humanPlayer(), bot],
    starter: 0,
    title: `${stop.name} · ${CAREER_ROUNDS[cc.round]}`,
  });
}

export function careerAfterMatch(r: MatchResult) {
  go('career');
  showPost(r.post);
  if (r.post?.good) audio.levelUp();
  if (r.post?.champion) setTimeout(() => confetti(160), 300);
}

export function Career() {
  const p = useStore(profileStore);
  const c = p.career ?? ensureCareer();
  const done = c.stop >= TOUR.length;
  const stop = TOUR[Math.min(c.stop, TOUR.length - 1)];
  const rank = careerRank(c);
  const opp = currentOpponent(c);
  const oppRank = opp ? careerRanking(c).findIndex((x) => x.idx === c.pros.indexOf(opp)) + 1 : 0;
  const notQualified = !done && c.round === 3 && !c.alive && c.results[c.stop] === -1;
  return (
    <div class="screen dim">
      <div class="pad row" style={{ marginBottom: '6px' }}>
        <button class="icon-btn" onClick={() => go('events')} aria-label="Volver">
          <Back />
        </button>
        <div class="display grow outline" style={{ fontSize: '22px', textAlign: 'center' }}>
          Carrera · Temporada {c.season}
        </div>
        <div style={{ width: '38px' }} />
      </div>
      <div class="scroll grow content pad col" style={{ gap: '10px', paddingBottom: '18px' }}>
        <div class="cr-kpis">
          <div>
            <span>Ranking</span>
            <b>#{rank}</b>
          </div>
          <div>
            <span>Puntos</span>
            <b>{c.pts}</b>
          </div>
          <div>
            <span>Títulos</span>
            <b>{c.titles}</b>
          </div>
          <div>
            <span>Ganancias</span>
            <b>
              <Coin class="ico" /> {fmtNum(c.earnings)}
            </b>
          </div>
        </div>

        <div class="cr-cal">
          {TOUR.map((t, i) => {
            const res = c.results[i];
            return (
              <div key={i} class={'cr-stop' + (i === c.stop ? ' on' : '') + (i < c.stop ? ' done' : '') + (t.finals ? ' finals' : '')}>
                <span class="ic">{t.icon}</span>
                <span class="nm">{t.name.replace(/^(Open|Masters|Grand Prix|Abierto|Matchplay|Grand Slam|Clásico de Cricket) de /, '')}</span>
                <span class="rs">{i < c.stop ? (res === undefined || res < 0 ? '—' : MEDAL[res]) : i === c.stop ? '▶' : ''}</span>
              </div>
            );
          })}
        </div>

        {done ? (
          <SeasonEnd c={c} />
        ) : (
          <div class="panel cr-event">
            <div class="cr-ev-head">
              <span class="ic">{stop.icon}</span>
              <div class="grow">
                <div class="display" style={{ fontSize: '19px' }}>
                  {stop.name}
                </div>
                <div class="muted" style={{ fontSize: '12px', fontWeight: 800 }}>
                  {modeLabel(stop.config)} · legs {stop.legs.join('/')} · {stop.finals ? 'solo los 8 mejores' : 'entrada gratis'}
                </div>
              </div>
            </div>
            {c.bracket ? <CareerBracket c={c} /> : (
              <div class="cr-prizes">
                {CAREER_ROUNDS.concat('Campeón').map((n, i) => (
                  <div key={n}>
                    <span>{i === 3 ? '🏆 Campeón' : n}</span>
                    <b>
                      +{CAREER_POINTS[i]} pts · <Coin class="ico" /> {fmtNum(Math.round((prizeBase() * [1, 2.5, 5, 10][i]) / 10) * 10)}
                    </b>
                  </div>
                ))}
              </div>
            )}
            {opp && c.alive && (
              <div class="cr-opp">
                Rival: <b>{opp.name}</b> · #{oppRank} del ranking · media ~{Math.round(expectedAverage(proSigma(opp.rating, stop.arena)))}
              </div>
            )}
            {notQualified ? (
              <>
                <div class="cr-note">No te has clasificado para las Finales (puesto #{rank}). ¡La próxima temporada!</div>
                <button class="btn big block" onClick={() => (audio.click(), skipStop())}>
                  Ver el final de temporada
                </button>
              </>
            ) : (
              <button class="btn big block shine" onClick={() => (audio.click(), playMatch())}>
                {c.bracket ? `Jugar ${CAREER_ROUNDS[c.round].toLowerCase()}` : stop.finals && rank > 8 ? 'Ver quién se clasifica' : 'Jugar el torneo'}
              </button>
            )}
          </div>
        )}

        <Ranking c={c} />
      </div>
    </div>
  );
}

function CareerBracket({ c }: { c: CareerState }) {
  const name = (pos: number) => {
    const who = c.bracket![pos];
    return who === -1 ? profile().name : c.pros[who].name;
  };
  const me = c.bracket!.indexOf(-1);
  const cols = [0, 1, 2, 3].map((r) => c.rounds[r] ?? null);
  return (
    <div class="bracket" style={{ marginTop: '8px' }}>
      {cols.map((alive, r) => (
        <div class="col" key={r}>
          <div class="muted" style={{ fontSize: '10px', fontWeight: 900, textAlign: 'center' }}>
            {r < 3 ? CAREER_ROUNDS[r].replace(' de final', '') : 'Campeón'}
          </div>
          {(alive ?? Array.from({ length: 8 >> r }, () => -1)).map((pos, k) => {
            const out = pos >= 0 && c.rounds[r + 1] && !c.rounds[r + 1].includes(pos);
            return (
              <div key={k} class={'slot-b' + (pos === me ? ' me' : '') + (out ? ' out' : '')}>
                {pos >= 0 ? (r === 3 ? '👑 ' : '') + name(pos) : '?'}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Ranking({ c }: { c: CareerState }) {
  const list = careerRanking(c);
  const myPos = list.findIndex((x) => x.idx === -1);
  const shown = list.slice(0, 10);
  return (
    <div class="panel">
      <div class="display" style={{ fontSize: '18px', marginBottom: '6px' }}>
        🌍 Ranking mundial
      </div>
      {shown.map((x, i) => (
        <div key={x.idx} class={'cr-rank' + (x.idx === -1 ? ' me' : '')}>
          <span class="pos">{i + 1}</span>
          <span class="nm">{x.name}</span>
          <b>{x.pts}</b>
        </div>
      ))}
      {myPos >= 10 && (
        <>
          <div class="cr-dots">⋯</div>
          <div class="cr-rank me">
            <span class="pos">{myPos + 1}</span>
            <span class="nm">{list[myPos].name}</span>
            <b>{list[myPos].pts}</b>
          </div>
        </>
      )}
      <div class="muted" style={{ fontSize: '11px', fontWeight: 800, marginTop: '6px' }}>
        Puntos: cuartos {CAREER_POINTS[0]} · semis {CAREER_POINTS[1]} · final {CAREER_POINTS[2]} · campeón {CAREER_POINTS[3]}. Los 8 primeros juegan las Finales.
      </div>
    </div>
  );
}

function SeasonEnd({ c }: { c: CareerState }) {
  const rank = careerRank(c);
  const collect = () => {
    const res = closeSeason();
    if (!res) return;
    audio.levelUp();
    confetti(rank <= 3 ? 160 : 80);
    showPost({ title: `Temporada ${c.season}: puesto #${res.rank}`, reward: res.reward, champion: res.rank === 1 });
  };
  return (
    <div class="panel cr-event" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '54px' }}>{rank === 1 ? '👑' : rank <= 3 ? '🥇' : rank <= 8 ? '🎖️' : '🎯'}</div>
      <div class="display" style={{ fontSize: '22px' }}>¡Temporada {c.season} terminada!</div>
      <div class="muted" style={{ fontWeight: 800, margin: '4px 0 8px' }}>
        Puesto final #{rank} de {c.pros.length + 1} · {c.titles} títulos en tu carrera
      </div>
      <button class="btn big block gold shine" onClick={() => (audio.click(), collect())}>
        Cobrar premios y empezar la temporada {c.season + 1}
      </button>
    </div>
  );
}
