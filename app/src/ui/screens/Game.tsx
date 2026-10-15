// Pantalla de partida: HUD sobre la vista 3D, introducción VS y resultados.

import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore, fmtNum } from '../../core/store';
import { matchStore, currentMatch, closeMatch, type MatchUI } from '../../game/match';
import { gameView } from '../../engine/gameView';
import { threeDartAvg, CRICKET_NUMS } from '@shared/rules';
import { AvatarImg, ChestImg, Progress } from '../components/common';
import { ChatIco, PauseIco, Coin, Trophy, XpStar, AdIco, DartIco } from '../icons';
import { go, openModal, toast } from '../state';
import { audio } from '../../services/audio';
import { EMOTES } from '../../meta/catalog';
import { profile, profileStore, mutate } from '../../meta/profile';
import { CHESTS } from '../../meta/chests';
import { ads } from '../../services/ads';
import { shouldShowInterstitial, noteInterstitialShown } from '../../meta/economy';
import { arenaForTrophies, ARENAS } from '../../meta/arenas';
import { confetti, countUp } from '../fx';
import { xpForNext } from '../../meta/progression';
import { TutorialCoach, tutorialAfterMatch } from '../overlays/Tutorial';
import { tournamentAfterMatch } from './Tournament';
import { challengeAfterMatch } from './Events';
import { EventResultPanel } from './LiveEvent';

export function Game() {
  const m = useStore(matchStore);
  const inputRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const v = gameView();
    if (inputRef.current) v.attachInput(inputRef.current);
    return () => v.detachInput();
  }, []);
  if (!m) return <div class="hud" />;
  return (
    <div class="hud">
      <div class="hud-input" ref={inputRef} />
      {m.phase !== 'intro' && m.phase !== 'ended' && <Hud m={m} />}
      {m.phase === 'intro' && m.setup.players.length > 1 && <VsIntro m={m} />}
      {m.phase === 'intro' && m.setup.players.length === 1 && <SoloIntro m={m} />}
      {m.setup.type === 'tutorial' && m.phase !== 'ended' && <TutorialCoach m={m} />}
      {m.phase === 'ended' && m.result && <Results m={m} />}
    </div>
  );
}

function scoreText(m: MatchUI, i: number): string {
  const s = m.state;
  const p = s.players[i];
  switch (s.config.mode) {
    case 'x01':
      return String(p.remaining);
    case 'cricket':
      return String(p.points);
    case 'atc':
      return p.remaining > 20 ? 'BULL' : String(p.remaining);
    default:
      return String(p.scored);
  }
}

function Hud({ m }: { m: MatchUI }) {
  const s = m.state;
  const you = m.setup.online?.you ?? 0;
  const cur = s.current;
  const pls = m.setup.players;
  const turnHits = s.turn;
  const turnSum = turnHits.reduce((a, h) => a + h.points, 0);
  const [banner, setBanner] = useState<{ key: number; text: string } | null>(null);
  const lastCur = useRef(-1);
  useEffect(() => {
    if (pls.length < 2 || lastCur.current === cur) return;
    lastCur.current = cur;
    const mine = cur === you && pls[cur].kind !== 'bot';
    setBanner({ key: Date.now(), text: mine ? (pls.filter((x) => x.kind === 'human').length > 1 ? `Turno de ${pls[cur].name}` : '¡Tu turno!') : `Turno de ${pls[cur].name}` });
  }, [cur]);
  const showHint = m.phase === 'aim' && m.setup.type !== 'tutorial' && (m.hint === 'flick' || profile().stats.darts < 12);
  const legsToWin = s.config.legsToWin;
  const emote = m.emote;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!m.deadline) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [m.deadline]);
  const timeLeft = m.deadline ? Math.max(0, Math.ceil((m.deadline - now) / 1000)) : 0;

  return (
    <>
      <div class="hud-top">
        {pls.map((pl, i) => (
          <>
            {i === 1 && <div class="vs-mini">VS</div>}
            <div key={i} class={'pcard' + (i === cur ? ' on' : '') + (i === 1 ? ' right' : '')} style={pls.length > 2 ? { padding: '4px' } : undefined}>
              <div class="av">
                <AvatarImg cfg={pl.avatar} size={88} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div class="name">{pl.name}</div>
                <div class="score outline">{scoreText(m, i)}</div>
                <div class="meta">
                  {s.config.mode === 'atc' ? `${s.players[i].darts} dardos` : `Media ${threeDartAvg(s.players[i]).toFixed(1)}`}
                  {m.setup.dartLimit && i === 0 ? ` · ${m.setup.dartLimit - m.dartsUsed} restantes` : ''}
                </div>
                {legsToWin > 1 && (
                  <div class="legs">
                    {Array.from({ length: legsToWin }).map((_, k) => (
                      <i class={k < s.players[i].legs ? 'won' : ''} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ))}
      </div>

      <div class="turn-strip">
        {[0, 1, 2].map((k) => {
          const h = turnHits[k];
          return (
            <div key={k} class={'dart-pip' + (h ? ' used ' + h.ring : '')}>
              {h ? h.label.replace('FUERA', '✕').replace('REBOTE', '↯') : <DartIco />}
            </div>
          );
        })}
        <div class="dart-pip total">{turnSum}</div>
      </div>

      {s.config.mode === 'cricket' && <CricketBoard m={m} />}
      {m.checkout && s.config.mode === 'x01' && (pls[cur].kind === 'human' || cur === you) && <div class="checkout-pill">🎯 {m.checkout}</div>}
      {m.deadline > 0 && cur === you && <div class={'timer-ring' + (timeLeft <= 5 ? ' low' : '')}>⏱ {timeLeft}s</div>}
      {!m.opponentConnected && <div class="checkout-pill" style={{ top: 'calc(var(--safe-top) + 150px)', background: 'rgba(200,30,60,.9)' }}>Rival desconectado...</div>}

      {m.popups.map((pp) => (
        <div key={pp.id} class={'popup ' + pp.ring} style={{ left: pp.x + 'px', top: pp.y - 16 + 'px' }}>
          <div class="l">{pp.ring === 'MISS' ? '' : pp.label}</div>
          <div class="p">{pp.ring === 'MISS' ? pp.label : pp.points}</div>
        </div>
      ))}
      {m.message && (
        <div key={m.message.id} class={'bigmsg ' + m.message.kind}>
          <div class="t">{m.message.text}</div>
          {m.message.sub && <div class="s outline">{m.message.sub}</div>}
          {m.message.kind === 'gold' && <ConfettiOnce k={m.message.id} />}
        </div>
      )}
      {m.quality && m.phase !== 'aim' && (
        <div key={m.quality.id} class={'quality ' + m.quality.q}>
          {{ perfect: '¡Perfecto!', good: 'Buen lanzamiento', weak: 'Demasiado flojo', strong: 'Demasiado fuerte' }[m.quality.q]}
        </div>
      )}
      {banner && m.phase !== 'between' && (
        <div key={banner.key} class="turn-banner">
          <div class="outline">{banner.text}</div>
        </div>
      )}
      {showHint && (
        <div class="hint">
          <div class="box">👆 Arrastra para apuntar · <b>desliza rápido hacia arriba</b> para lanzar</div>
        </div>
      )}
      {emote && (
        <div key={emote.key} class={'emote-bubble ' + (emote.player === 0 ? 'left' : 'right')} style={{ top: 'calc(var(--safe-top) + 112px)' }}>
          <span class="e">{EMOTES.find((e) => e.id === emote.id)?.icon}</span>
          {EMOTES.find((e) => e.id === emote.id)?.text}
        </div>
      )}
      <div class="hud-btns">
        <button class="icon-btn" style={{ width: '48px', height: '48px' }} onClick={() => openModal({ kind: 'pause' })} aria-label="Pausa">
          <PauseIco />
        </button>
        {pls.length > 1 && pls.some((p) => p.kind !== 'human') && (
          <button class="icon-btn" style={{ width: '48px', height: '48px' }} onClick={() => openModal({ kind: 'emotes' })} aria-label="Emotes">
            <ChatIco />
          </button>
        )}
      </div>
    </>
  );
}

function ConfettiOnce({ k }: { k: number }) {
  useEffect(() => confetti(160), [k]);
  return null;
}

function CricketBoard({ m }: { m: MatchUI }) {
  const s = m.state;
  const mk = (n: number) => (n >= 3 ? 'Ⓧ' : n === 2 ? 'X' : n === 1 ? '/' : '');
  return (
    <div class="cricket-board">
      {CRICKET_NUMS.map((num, i) => (
        <>
          <div class={s.players[0].marks[i] >= 3 ? 'closed' : ''}>{mk(s.players[0].marks[i])}</div>
          <div class="n">{num === 25 ? 'B' : num}</div>
          <div class={s.players[1]?.marks[i] >= 3 ? 'closed' : ''}>{s.players[1] ? mk(s.players[1].marks[i]) : ''}</div>
        </>
      ))}
    </div>
  );
}

function VsIntro({ m }: { m: MatchUI }) {
  const [a, b] = m.setup.players;
  useEffect(() => {
    audio.whooshUi();
    setTimeout(() => audio.chestShake(), 350);
  }, []);
  return (
    <div class="vs-screen">
      <div class="vs-half top">
        <AvatarImg cfg={a.avatar} size={150} h={260} frame="full" pose="wave" class="vs-fig" />
        <div>
          <div class="nm outline">{a.name}</div>
          <div class="meta">
            Nivel {a.level} · 🏆 {fmtNum(a.trophies)}
          </div>
          {a.club && <div class="meta">[{a.club}]</div>}
        </div>
      </div>
      <div class="vs-half bottom">
        <AvatarImg cfg={b.avatar} size={150} h={260} frame="full" pose="idle" class="vs-fig" />
        <div>
          <div class="nm outline">{b.name}</div>
          <div class="meta">
            Nivel {b.level} · 🏆 {fmtNum(b.trophies)}
          </div>
          <div class="meta">{b.kind === 'bot' ? '🤖 Rival de la máquina' : b.kind === 'remote' ? '🌐 Jugador online' : '👥 Jugador local'}</div>
        </div>
      </div>
      <div class="vs-center">VS</div>
      {m.setup.prize ? (
        <div style={{ position: 'absolute', bottom: '12%', left: 0, right: 0, textAlign: 'center' }}>
          <span class="pill" style={{ fontSize: '16px' }}>
            Premio <Coin class="ico" /> {fmtNum(m.setup.prize)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function SoloIntro({ m }: { m: MatchUI }) {
  const ch = m.setup.challenge;
  return (
    <div class="vs-screen" style={{ alignItems: 'center' }}>
      <div class="panel" style={{ textAlign: 'center', maxWidth: '320px', animation: 'popIn .4s' }}>
        <div class="display" style={{ fontSize: '28px' }}>{m.setup.title}</div>
        <div class="muted" style={{ fontWeight: 800, marginTop: '6px' }}>
          {ch ? ch.desc : m.setup.config.mode === 'atc' ? 'Acierta del 1 al 20 en orden y termina en el bull.' : m.setup.config.mode === 'x01' ? `Cierra ${m.setup.config.start} con un doble en ${m.setup.dartLimit ?? '∞'} dardos.` : 'Lanza libremente y mejora tu media.'}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ resultados

function Results({ m }: { m: MatchUI }) {
  const r = m.result!;
  const setup = m.setup;
  const you = setup.online?.you ?? 0;
  const p = useStore(profileStore);
  const coinsRef = useRef<HTMLSpanElement>(null);
  const [doubled, setDoubled] = useState(false);
  const [refunded, setRefunded] = useState(false);
  const isRanked = setup.type === 'ranked' || setup.type === 'online';
  const solo = setup.players.length === 1;
  useEffect(() => {
    countUp(coinsRef.current, r.coins, 1200);
    if (r.won) setTimeout(() => confetti(140), 300);
  }, []);

  const watchDouble = async () => {
    const ok = await ads.rewarded();
    if (!ok) return toast('Mira el vídeo completo para conseguir la recompensa', 'bad');
    mutate((pp) => (pp.coins += r.coins));
    setDoubled(true);
    countUp(coinsRef.current, r.coins * 2, 900, r.coins);
    audio.coin();
  };
  const watchRefund = async () => {
    const ok = await ads.rewarded();
    if (!ok) return toast('Mira el vídeo completo para recuperar la entrada', 'bad');
    mutate((pp) => (pp.coins += setup.entry ?? 0));
    setRefunded(true);
    audio.coin();
    toast(`+${setup.entry} monedas recuperadas`, 'good');
  };

  const cont = async () => {
    audio.click();
    const prevArena = m.arenaBefore;
    closeMatch();
    if (setup.type === 'tutorial') return tutorialAfterMatch(r);
    if (setup.type === 'tournament') return tournamentAfterMatch(r);
    if (setup.type === 'challenge') return challengeAfterMatch(r);
    if (setup.type === 'event') {
      if (shouldShowInterstitial()) {
        noteInterstitialShown();
        await ads.interstitial();
      }
      return go('liveEvent');
    }
    if (shouldShowInterstitial()) {
      noteInterstitialShown();
      await ads.interstitial();
    }
    go(setup.type === 'training' || setup.type === 'local' || setup.type === 'private' ? 'events' : 'home');
    const nowArena = arenaForTrophies(profile().bestTrophies);
    if (isRanked && nowArena > prevArena) {
      mutate((pp) => (pp.selectedArena = nowArena));
      openModal({ kind: 'arenaUnlocked', arena: nowArena });
    }
  };

  const me = r.stats[you];
  const opp = r.stats[1 - you];
  const pls = setup.players;
  const title = solo
    ? setup.challenge
      ? `${'★'.repeat(r.stars ?? 0)}${'☆'.repeat(3 - (r.stars ?? 0))}`
      : r.reason === 'limit'
        ? '¡Tiempo!'
        : '¡Completado!'
    : r.won
      ? '¡VICTORIA!'
      : setup.type === 'tutorial'
        ? '¡Buen intento!'
      : setup.type === 'local'
        ? `¡Gana ${pls[r.winner].name}!`
        : 'DERROTA';

  return (
    <div class={'results' + (r.won || solo || setup.type === 'tutorial' ? '' : ' lose')}>
      {r.won && <div class="rays-bg" />}
      <div class={'result-title ' + (r.won || solo || setup.type === 'tutorial' ? 'win' : 'lose')}>{title}</div>
      {r.reason === 'forfeit' && <div class="muted" style={{ fontWeight: 800 }}>{r.won ? 'Tu rival abandonó' : 'Abandonaste la partida'}</div>}
      {r.reason === 'disconnect' && <div class="muted" style={{ fontWeight: 800 }}>{r.won ? 'Tu rival se desconectó' : 'Se perdió la conexión'}</div>}
      {setup.challenge && (
        <div class="display" style={{ fontSize: '22px', marginBottom: '6px' }}>
          Puntuación: {r.challengeScore}
        </div>
      )}

      {!solo && (
        <div class="versus">
          <div class={'side' + (r.winner === 0 ? ' winner' : '')}>
            <AvatarImg cfg={pls[0].avatar} size={130} h={210} frame="full" pose={r.winner === 0 ? 'cheer' : 'sad'} />
            <div class="nm">{pls[0].name}</div>
          </div>
          <div class="vs">VS</div>
          <div class={'side' + (r.winner === 1 ? ' winner' : '')}>
            <AvatarImg cfg={pls[1].avatar} size={130} h={210} frame="full" pose={r.winner === 1 ? 'cheer' : 'sad'} />
            <div class="nm">{pls[1].name}</div>
          </div>
        </div>
      )}

      {setup.type === 'event' && <EventResultPanel r={r} />}

      {setup.config.mode === 'x01' && me && (
        <table class="stat-table">
          <tbody>
          {(
            [
              ['Media (3 dardos)', me.avg, opp?.avg],
              ['Mejor turno', me.best, opp?.best],
              ['180s', me.s180, opp?.s180],
              ['Turnos 100+', me.tons, opp?.tons],
              ['Cierre', me.checkout || '-', opp?.checkout || '-'],
              ['Dardos', me.darts, opp?.darts],
            ] as [string, number | string, number | string | undefined][]
          ).map(([k, a, b]) => (
            <tr key={k}>
              <td class={!solo && typeof a === 'number' && typeof b === 'number' && a > b && k !== 'Dardos' ? 'best' : ''}>{a}</td>
              <td class="lbl">{k}</td>
              {!solo && <td class={typeof a === 'number' && typeof b === 'number' && b > a && k !== 'Dardos' ? 'best' : ''}>{b}</td>}
            </tr>
          ))}
          </tbody>
        </table>
      )}

      <div class="reward-row">
        {isRanked && (
          <>
            <div class="reward">
              <Coin class="ico" />
              <div class="v">
                <span ref={coinsRef}>0</span>
              </div>
              <div class="k">{doubled ? '¡x2!' : 'Monedas'}</div>
            </div>
            <div class="reward" style={{ animationDelay: '.1s' }}>
              <Trophy class="ico" />
              <div class="v" style={{ color: r.trophies >= 0 ? '#7dffb0' : '#ff8fa3' }}>
                {r.trophies >= 0 ? '+' : ''}
                {r.trophies}
              </div>
              <div class="k">Copas</div>
            </div>
          </>
        )}
        {setup.type === 'event' && r.coins > 0 && (
          <div class="reward">
            <Coin class="ico" />
            <div class="v">{fmtNum(r.coins)}</div>
            <div class="k">Monedas</div>
          </div>
        )}
        {r.xp > 0 && (
          <div class="reward" style={{ animationDelay: '.2s' }}>
            <XpStar class="ico" />
            <div class="v">+{r.xp}</div>
            <div class="k">XP</div>
          </div>
        )}
        {r.chest && (
          <div class="reward" style={{ animationDelay: '.3s', borderColor: 'var(--gold)' }}>
            <ChestImg type={r.chest} class="ico" />
            <div class="k">{CHESTS[r.chest].name}</div>
          </div>
        )}
      </div>
      {r.chestFull && <div class="muted" style={{ fontWeight: 800, fontSize: '12px', textAlign: 'center' }}>Tus huecos de cofres están llenos: ¡abre alguno para ganar más!</div>}
      <div style={{ width: '100%', maxWidth: '340px', marginTop: '8px' }}>
        <Progress value={p.xp} max={xpForNext(p.level)} color="blue" label={`Nivel ${p.level} · ${p.xp}/${xpForNext(p.level)} XP`} />
      </div>

      <div class="col" style={{ width: '100%', maxWidth: '340px', marginTop: '14px' }}>
        {isRanked && r.won && r.coins > 0 && !doubled && (
          <button class="btn purple block shine" onClick={watchDouble}>
            <AdIco class="ico" /> ¡Duplica las monedas!
          </button>
        )}
        {isRanked && !r.won && (setup.entry ?? 0) > 0 && !refunded && r.reason !== 'forfeit' && (
          <button class="btn purple block" onClick={watchRefund}>
            <AdIco class="ico" /> Recupera tu entrada ({fmtNum(setup.entry ?? 0)})
          </button>
        )}
        <button class="btn block big" onClick={cont}>
          Continuar
        </button>
        {setup.type === 'ranked' && (
          <div class="muted" style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700 }}>
            {ARENAS[setup.arena].name}
          </div>
        )}
      </div>
    </div>
  );
}

/** Abandona la partida actual (desde el menú de pausa). */
export function quitMatch() {
  const m = currentMatch();
  if (!m) return go('home');
  const st = m.setup.type;
  m.abort();
  if (!matchStore.get()?.result) {
    closeMatch();
    go(st === 'training' || st === 'local' || st === 'challenge' ? 'events' : st === 'event' ? 'liveEvent' : 'home');
  }
}
