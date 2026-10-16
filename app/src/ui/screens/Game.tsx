// Pantalla de partida: HUD sobre la vista 3D, introducción VS y resultados.

import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore, fmtNum } from '../../core/store';
import { matchStore, currentMatch, closeMatch, type MatchUI } from '../../game/match';
import { gameView } from '../../engine/gameView';
import { threeDartAvg, CRICKET_NUMS, KILLER_MARKS, ROUND_MODES } from '@shared/rules';
import { MODES, modeLabel, modeRules, roundGoal, roundWord, C121_ATTEMPTS, C121_DARTS } from '../../meta/modes';
import { AWARDS } from '../../game/awards';
import { AvatarImg, ChestImg, Progress } from '../components/common';
import { ChatIco, PauseIco, Coin, Trophy, XpStar, AdIco, DartIco } from '../icons';
import { go, openModal, toast, ui } from '../state';
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
import { DuelResultPanel } from './Duel';
import { careerAfterMatch } from './Career';
import { shareText } from '../../services/platform';
import { afterGrant } from '../rewards';
import { rankedSetup, eventSetup, launch } from '../../game/launch';
import type { MatchSetup, MatchPlayer } from '../../game/match';
import { expectedAverage } from '@shared/bot';
import { dartStats } from '../../meta/economy';
import { dartPower } from './Collection';

export function Game() {
  const m = useStore(matchStore);
  const u = useStore(ui);
  const inputRef = useRef<HTMLDivElement>(null);
  // el reloj de la tirada se para mientras haya una ventana abierta (pausa, ajustes, emotes…)
  useEffect(() => {
    currentMatch()?.holdClock(u.modals.length > 0);
  }, [u.modals.length, !!m]);
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
      {m.phase === 'intro' && m.setup.players.length === 2 && <VsIntro m={m} />}
      {m.phase === 'intro' && m.setup.players.length > 2 && <MultiIntro m={m} />}
      {m.phase === 'intro' && m.setup.players.length === 1 && <SoloIntro m={m} />}
      {m.setup.type === 'tutorial' && m.phase !== 'ended' && <TutorialCoach m={m} />}
      {m.phase === 'ended' && m.result && <Results m={m} />}
    </div>
  );
}

/** Reloj de la tirada: se lee el valor vivo del reloj (sin redibujar toda la pantalla cada décima). */
function ShotClock({ clock }: { clock: { total: number; left: number } }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);
  return <ClockRing left={clock.left} total={clock.total} />;
}

/** Anillo que se vacía: verde, luego amarillo y rojo latiendo en los últimos 5 segundos. */
function ClockRing({ left, total }: { left: number; total: number }) {
  const k = Math.max(0, Math.min(1, left / total));
  const secs = Math.ceil(left);
  const low = secs <= 5;
  const color = low ? '#ff3b55' : k < 0.5 ? '#ffc93a' : '#5df08e';
  const R = 19;
  const C = 2 * Math.PI * R;
  return (
    <div class={'shot-clock' + (low ? ' low' : '')} key={low ? secs : 'n'} title="Tiempo para lanzar">
      <svg viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={R} class="bg" />
        <circle cx="24" cy="24" r={R} class="fg" style={{ stroke: color, strokeDasharray: C, strokeDashoffset: C * (1 - k) }} />
      </svg>
      <b style={{ color: low ? color : '#fff' }}>{secs}</b>
    </div>
  );
}

/** Número que se anima al cambiar (cuenta hacia abajo/arriba). */
function ScoreNum({ value }: { value: string }) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const a = Number(prev.current);
    const b = Number(value);
    prev.current = value;
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return setShown(value);
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 480);
      setShown(String(Math.round(a + (b - a) * (1 - Math.pow(1 - k, 3)))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <span key={value} class="score-num">
      {shown}
    </span>
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
    case 'killer':
      return p.lives > 0 ? '❤'.repeat(p.lives) : '💀';
    case 'c121':
      return String(p.remaining);
    case 'shanghai':
    case 'halveit':
    case 'bobs27':
    case 'baseball':
      return String(p.points);
    default:
      return String(p.scored);
  }
}

/** Línea pequeña bajo la puntuación de cada jugador. */
function metaText(m: MatchUI, i: number): string {
  const s = m.state;
  const p = s.players[i];
  switch (s.config.mode) {
    case 'atc':
      return `${p.darts} dardos`;
    case 'killer':
      return p.lives <= 0 ? 'Eliminado' : `Nº ${p.num} · ${p.killerMarks >= KILLER_MARKS ? '🔪' : `${p.killerMarks}/${KILLER_MARKS}`}`;
    case 'baseball':
      return `${p.points} carreras`;
    case 'c121':
      return `Dardo ${p.att}/${C121_DARTS} · 🏠 ${p.safe}`;
    case 'shanghai':
    case 'halveit':
    case 'bobs27':
      return `${p.darts} dardos`;
    default:
      return `Media ${threeDartAvg(p).toFixed(1)}`;
  }
}

function Hud({ m }: { m: MatchUI }) {
  const s = m.state;
  const you = m.setup.online?.you ?? 0;
  const cur = s.current;
  const pls = m.setup.players;
  const turnHits = s.turn;
  const turnSum = turnHits.reduce((a, h) => a + h.points, 0);
  const [banner, setBanner] = useState<{ key: number; text: string; sub?: string } | null>(null);
  const lastCur = useRef(-1);
  useEffect(() => {
    if (pls.length < 2 || lastCur.current === cur) return;
    lastCur.current = cur;
    const mine = (cur === you || pls[cur].kind === 'human') && pls[cur].kind !== 'bot' && pls[cur].kind !== 'remote';
    const who = mine ? (pls.filter((x) => x.kind === 'human').length > 1 ? `Turno de ${pls[cur].name}` : '¡Tu turno!') : `Turno de ${pls[cur].name}`;
    setBanner({ key: Date.now(), text: who, sub: mine && m.checkout ? `🎯 ¡Puedes cerrar! ${m.checkout}` : undefined });
  }, [cur]);
  // sacudida de la tarjeta al pasarse
  const [bustP, setBustP] = useState(-1);
  useEffect(() => {
    if (!m.lastTurn?.bust) return;
    setBustP(m.lastTurn.player);
    const t = setTimeout(() => setBustP(-1), 750);
    return () => clearTimeout(t);
  }, [m.lastTurn?.key]);
  const botTurn = (m.phase === 'wait' || m.phase === 'between') && pls[cur]?.kind === 'bot';
  const showCo = !!m.checkout && s.config.mode === 'x01' && (pls[cur].kind === 'human' || cur === you);
  const rounds = s.config.maxTurns;
  const roundChip = ROUND_MODES.includes(s.config.mode)
    ? `${roundWord(s.config.mode)} ${Math.min(rounds, s.turnNo + 1)}/${rounds} · ${roundGoal(s)}${s.config.mode === 'halveit' ? ' · ¡o a la mitad!' : ''}`
    : s.config.mode === 'c121'
      ? `Intento ${Math.min(C121_ATTEMPTS, s.players[cur].attempts + 1)}/${C121_ATTEMPTS} · CIERRA ${s.players[cur].target} · récord ${s.players[cur].points || '-'}`
    : s.config.mode === 'killer'
      ? s.players[cur].killerMarks >= KILLER_MARKS
        ? `🔪 ${pls[cur].name} es KILLER: ¡a por los números rivales!`
        : `Nº ${s.players[cur].num}: ${KILLER_MARKS - s.players[cur].killerMarks} marca(s) para ser KILLER`
      : '';
  const showHint = m.phase === 'aim' && m.setup.type !== 'tutorial' && (m.hint === 'flick' || profile().stats.darts < 12);
  const legsToWin = s.config.legsToWin;
  const emote = m.emote;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!m.deadline) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [m.deadline]);
  const timeLeft = m.deadline ? Math.max(0, Math.ceil((m.deadline - (now + (m.clockOffset ?? 0))) / 1000)) : 0;

  return (
    <>
      <div class="hud-top">
        {pls.map((pl, i) => (
          <>
            {i === 1 && <div class="vs-mini">VS</div>}
            <div key={i} class={'pcard' + (i === cur ? ' on' : '') + (i === 1 ? ' right' : '') + ((m.streak?.[i] ?? 0) >= 2 ? ' fire' : '') + (bustP === i ? ' bust' : '')} style={pls.length > 2 ? { padding: '4px' } : undefined}>
              {(m.streak?.[i] ?? 0) >= 2 && <span class="fire-badge">🔥{m.streak[i]}</span>}
              {(pl.kind === 'bot' || pl.ai) && <span class="ia-badge">IA</span>}
              <div class="av">
                <AvatarImg cfg={pl.avatar} size={88} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div class="name">{pl.name}</div>
                <div class="score outline">
                  {s.config.mode === 'killer' ? (
                    <span class={'hearts' + (s.players[i].lives <= 0 ? ' dead' : '')} key={s.players[i].lives}>
                      {s.players[i].lives > 0 ? '❤'.repeat(s.players[i].lives) : '💀'}
                    </span>
                  ) : (
                    <ScoreNum value={scoreText(m, i)} />
                  )}
                </div>
                <div class="meta">
                  {metaText(m, i)}
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
      {roundChip && (
        <div class="round-chip" key={roundChip}>
          {roundChip}
        </div>
      )}
      {(m.bonus || m.bonusCoins > 0 || m.combo >= 2) && (
        <div class={'bonus-row' + (showCo || roundChip ? ' low' : '')}>
          {m.bonus && (
            <div class="bonus-chip" key={m.bonus.target}>
              ★ BONUS <b>{bonusLabel(m.bonus.target)}</b> +{fmtNum(m.bonus.coins)} <Coin class="ico" />
            </div>
          )}
          {m.combo >= 2 && <div class="combo-chip">🔥 x{m.combo}</div>}
          {m.bonusCoins > 0 && (
            <div class="bonus-bank" key={m.bonusCoins}>
              <Coin class="ico" /> +{fmtNum(m.bonusCoins)}
            </div>
          )}
        </div>
      )}

      {s.config.mode === 'cricket' && <CricketBoard m={m} />}
      {showCo && <div class="checkout-pill">🎯 {m.checkout}</div>}
      {m.deadline > 0 && cur === you && <ClockRing left={timeLeft} total={28} />}
      {m.clock && m.phase === 'aim' && <ShotClock key={m.clock.key} clock={m.clock} />}
      {!m.opponentConnected && <div class="checkout-pill" style={{ top: 'calc(var(--safe-top) + 150px)', background: 'rgba(200,30,60,.9)' }}>Rival desconectado...</div>}
      {m.reconnecting && <div class="checkout-pill" style={{ top: 'calc(var(--safe-top) + 186px)', background: 'rgba(200,120,20,.92)' }}>📶 Reconectando… no cierres la app</div>}

      {m.popups.map((pp) => (
        <div key={pp.id} class={'popup ' + pp.ring} style={{ left: pp.x + 'px', top: pp.y - 16 + 'px' }}>
          <div class="l">{pp.ring === 'MISS' ? '' : pp.label}</div>
          <div class="p">{pp.ring === 'MISS' ? pp.label : pp.points}</div>
        </div>
      ))}
      {m.bonusFx && (
        <div key={m.bonusFx.id} class={'bonus-fx ' + m.bonusFx.kind} style={{ left: m.bonusFx.x + 'px', top: m.bonusFx.y - 70 + 'px' }}>
          <div class="t outline">{m.bonusFx.text}</div>
          {m.bonusFx.coins > 0 && (
            <div class="c">
              +{fmtNum(m.bonusFx.coins)} <Coin class="ico" />
            </div>
          )}
        </div>
      )}
      {botTurn && (
        <button class={'ff-btn' + (m.fast ? ' on' : '')} onClick={() => currentMatch()?.toggleFast()}>
          {m.fast ? '⏩ x2' : '⏩ Acelerar'}
        </button>
      )}
      {m.replay && (
        <div class="replay-fx" onClick={() => currentMatch()?.skipReplay()}>
          <div class="rp-bar top" />
          <div class="rp-bar bottom" />
          <div class="rp-tag">
            <i /> REPETICIÓN
          </div>
          <div class="rp-skip">Toca para saltar</div>
        </div>
      )}
      {m.award && <AwardFx m={m} />}
      {m.bullOff && (
        <div class="bulloff">
          <div class="bo-title">🎯 Sorteo al bull</div>
          {pls.map((pl, i) => (
            <div key={i} class={'bo-row' + (m.bullOff!.cur === i && m.bullOff!.winner === null ? ' on' : '') + (m.bullOff!.winner === i ? ' win' : '')}>
              <span class="nm">{pl.name}</span>
              <b>{m.bullOff!.dist[i] === null ? '…' : m.bullOff!.dist[i]! >= 999 ? 'rebote' : `${m.bullOff!.dist[i]} mm`}</b>
            </div>
          ))}
        </div>
      )}
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
        <div key={banner.key} class={'turn-banner' + (banner.sub ? ' finish' : '')}>
          <div class="outline">{banner.text}</div>
          {banner.sub && <div class="sub">{banner.sub}</div>}
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

/** Premio de turno: emblema animado con rayos, nombre y monedas. */
function AwardFx({ m }: { m: MatchUI }) {
  const a = m.award!;
  const def = AWARDS[a.id];
  const pl = m.setup.players[a.player];
  return (
    <div key={a.key} class={'award-fx t' + def.tier} style={{ ['--ac' as string]: def.color }}>
      <div class="aw-rays" />
      <div class="aw-emblem">
        <span>{def.icon}</span>
      </div>
      <div class="aw-name outline">{def.name}</div>
      <div class="aw-desc">
        {pl.name} · {def.desc}
      </div>
      {a.also.length > 0 && <div class="aw-also">+ {a.also.map((x) => AWARDS[x].name).join(' · ')}</div>}
      {a.coins > 0 && (
        <div class="aw-coins">
          +{fmtNum(a.coins)} <Coin class="ico" />
        </div>
      )}
      {a.id === 'ton80' && <ConfettiOnce k={a.key} />}
    </div>
  );
}

/** Texto para compartir el resultado (WhatsApp, Telegram…). */
async function shareResult(m: MatchUI) {
  audio.click();
  const r = m.result!;
  const you = m.setup.online?.you ?? 0;
  const pls = m.setup.players;
  const me = r.stats[you];
  const opp = pls[1 - you];
  const mode = modeLabel(m.setup.config);
  const awards = [...new Set(r.awards ?? [])].map((id) => AWARDS[id].icon + ' ' + AWARDS[id].name.replace(/[¡!]/g, '')).join(', ');
  const head = pls.length === 1 ? `He jugado ${mode}` : r.won ? `¡He ganado a ${opp?.name} en ${mode}!` : `He perdido contra ${opp?.name} en ${mode}`;
  const avg = m.setup.config.mode === 'x01' && me ? ` Media: ${me.avg}.` : '';
  const text = `🎯 ${head}${avg}${awards ? ' Premios: ' + awards + '.' : ''} ¿Te atreves en Diana Legends?`;
  const ok = await shareText('Diana Legends', text);
  toast(ok ? '¡Listo para compartir!' : 'No se pudo compartir', ok ? 'good' : 'bad');
}

/** Tras una partida online: añadir al rival a amigos para volver a jugar con él. */
function AddFriend({ pl }: { pl?: MatchPlayer }) {
  const p = useStore(profileStore);
  if (!pl?.id || pl.ai) return null;
  const already = p.friends.some((f) => f.id === pl.id);
  return (
    <button
      class={'btn small ' + (already ? 'gray' : 'blue')}
      disabled={already}
      style={{ marginTop: '6px' }}
      onClick={() => {
        audio.click();
        mutate((pp) => {
          if (!pp.friends.some((f) => f.id === pl.id)) pp.friends.push({ id: pl.id!, name: pl.name });
        });
        toast(`${pl.name} añadido a tus amigos: rétale desde Social`, 'good');
      }}
    >
      {already ? '✓ Ya es tu amigo' : `➕ Añadir a ${pl.name} a amigos`}
    </button>
  );
}

/** Nombre corto de la zona bonus: "T17", "D5", "17", "25", "BULL". */
function bonusLabel(t: string) {
  return t === 'DB' ? 'BULL' : t === 'SB' ? '25' : t[0] === 'S' ? t.slice(1) : t;
}

function ConfettiOnce({ k }: { k: number }) {
  useEffect(() => confetti(160), [k]);
  return null;
}

function CricketBoard({ m }: { m: MatchUI }) {
  const s = m.state;
  const mk = (n: number) => (n >= 3 ? 'Ⓧ' : n === 2 ? 'X' : n === 1 ? '/' : '');
  if (s.players.length > 2) {
    // 3 o 4 jugadores: número + una columna por jugador
    return (
      <div class="cricket-board" style={{ gridTemplateColumns: `30px repeat(${s.players.length}, 28px)` }}>
        <div />
        {s.players.map((_, k) => (
          <div key={'h' + k} class={'ph' + (k === s.current ? ' on' : '')}>
            J{k + 1}
          </div>
        ))}
        {CRICKET_NUMS.map((num, i) => (
          <>
            <div class="n">{num === 25 ? 'B' : num}</div>
            {s.players.map((pp, k) => (
              <div key={k} class={pp.marks[i] >= 3 ? 'closed' : ''}>
                {mk(pp.marks[i])}
              </div>
            ))}
          </>
        ))}
      </div>
    );
  }
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
    // presentación al estilo de la tele en las partidas que importan
    const t = m.setup.type;
    if (t === 'ranked' || t === 'career' || t === 'tournament' || t === 'online' || t === 'event') {
      setTimeout(() => audio.cheer(0.7), 300);
      setTimeout(() => audio.say(`${a.name}, contra ${b.name}`, true), 500);
    }
  }, []);
  return (
    <div class="vs-screen" onClick={() => currentMatch()?.skipIntro()}>
      <div class="vs-half top">
        <AvatarImg cfg={a.avatar} size={150} h={260} frame="full" pose="wave" class="vs-fig" />
        <div>
          <div class="nm outline">{a.name}</div>
          <div class="meta">
            Nivel {a.level} · 🏆 {fmtNum(a.trophies)}
          </div>
          {a.club && <div class="meta">[{a.club}]</div>}
          <div class="meta strong">{playerLevelText(a)}</div>
        </div>
      </div>
      <div class="vs-half bottom">
        <AvatarImg cfg={b.avatar} size={150} h={260} frame="full" pose="idle" class="vs-fig" />
        <div>
          <div class="nm outline">{b.name}</div>
          <div class="meta">
            Nivel {b.level} · 🏆 {fmtNum(b.trophies)}
          </div>
          <div class="meta">{b.kind === 'bot' || b.ai ? '🤖 Rival de la máquina' : b.kind === 'remote' ? '🌐 Jugador online' : '👥 Jugador local'}</div>
          <div class="meta strong">{playerLevelText(b)}</div>
        </div>
      </div>
      <div class="vs-center">VS</div>
      <ModeRules m={m} />
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
  const mode = m.setup.config.mode;
  const info = MODES[mode];
  return (
    <div class="vs-screen" style={{ alignItems: 'center' }} onClick={() => currentMatch()?.skipIntro()}>
      <div class="panel" style={{ textAlign: 'center', maxWidth: '330px', animation: 'popIn .4s' }}>
        <div class="display" style={{ fontSize: '28px' }}>
          {!ch && info && mode !== 'x01' ? info.icon + ' ' : ''}
          {m.setup.title}
        </div>
        <div class="muted" style={{ fontWeight: 800, marginTop: '6px' }}>
          {ch ? ch.desc : mode === 'x01' ? `Cierra ${m.setup.config.start} con un doble en ${m.setup.dartLimit ?? '∞'} dardos.` : info?.short}
        </div>
        {!ch && mode !== 'x01' && mode !== 'free' && (
          <ul class="rules-list">
            {info.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Lo que se sabe del nivel de cada jugador: la media real de los bots y el poder de tu dardo. */
function playerLevelText(pl: MatchPlayer): string {
  if (pl.kind === 'bot' && pl.bot) return `Media habitual ~${Math.round(expectedAverage(pl.bot.skill.sigma))}`;
  if (pl.kind === 'human') return `⚡ Poder del dardo ${dartPower(dartStats(profile(), pl.dart))}`;
  return '';
}

/** Presentación con 3 o 4 jugadores. */
function MultiIntro({ m }: { m: MatchUI }) {
  const s = m.state;
  useEffect(() => audio.whooshUi(), []);
  return (
    <div class="vs-screen multi" onClick={() => currentMatch()?.skipIntro()}>
      <div class="multi-grid">
        {m.setup.players.map((pl, i) => (
          <div key={i} class="multi-p" style={{ animationDelay: i * 0.12 + 's' }}>
            <AvatarImg cfg={pl.avatar} size={110} h={170} frame="full" pose={i === 0 ? 'wave' : 'idle'} />
            <div class="nm outline">{pl.name}</div>
            <div class="mp-meta">{pl.kind === 'bot' ? '🤖 ' : ''}{playerLevelText(pl)}</div>
            {s.config.mode === 'killer' && <div class="knum">Nº {s.players[i].num}</div>}
          </div>
        ))}
      </div>
      <ModeRules m={m} />
    </div>
  );
}

/** Reglas del modo en la presentación (no se muestran en X01, que todo el mundo conoce). */
function ModeRules({ m }: { m: MatchUI }) {
  const c = m.setup.config;
  if (c.mode === 'x01' || c.mode === 'free') return null;
  const info = MODES[c.mode];
  return (
    <div class="mode-rules">
      <div class="mr-title">
        {info.icon} {modeLabel(c)}
      </div>
      <ul class="rules-list">
        {modeRules(c).map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
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

  // ventanas de subida de nivel tras salir de los resultados
  const showLevelUps = () => setTimeout(() => afterGrant(r.levelUps), 350);

  const arenaUp = isRanked && arenaForTrophies(profile().bestTrophies) > m.arenaBefore;
  const canRematch = !setup.online && !arenaUp && (setup.type === 'ranked' || setup.type === 'training' || setup.type === 'local' || setup.type === 'event');
  const rematch = async () => {
    audio.click();
    let next: MatchSetup | null;
    if (setup.type === 'ranked') {
      next = rankedSetup(setup.arena);
      if (!next) return toast(`Necesitas ${fmtNum(ARENAS[setup.arena].entry)} monedas para la entrada`, 'bad');
    } else if (setup.type === 'event') {
      next = eventSetup();
      if (!next) return toast('Sin entradas: se recargan solas o consíguelas en el evento', 'bad');
    } else {
      // misma partida, empieza el otro
      next = { ...setup, starter: setup.players.length > 1 ? (setup.starter + 1) % setup.players.length : 0 };
    }
    if (shouldShowInterstitial()) {
      noteInterstitialShown();
      await ads.interstitial();
    }
    closeMatch();
    launch(next);
    showLevelUps();
  };

  const cont = async () => {
    audio.click();
    const prevArena = m.arenaBefore;
    closeMatch();
    if (r.levelUps.length) showLevelUps();
    if (setup.type === 'tutorial') return tutorialAfterMatch(r);
    if (setup.type === 'tournament') return tournamentAfterMatch(r);
    if (setup.type === 'career') return careerAfterMatch(r);
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
    go(setup.type === 'training' || setup.type === 'local' || setup.type === 'private' || setup.type === 'duel' ? 'events' : 'home');
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
      : setup.type === 'duel' && r.duel?.rival
        ? r.duel.score > r.duel.rival.score
          ? '¡RETO SUPERADO!'
          : r.duel.score === r.duel.rival.score
            ? '¡EMPATE!'
            : 'RETO PERDIDO'
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

      {pls.length > 2 && (
        <div class="ranking">
          {pls
            .map((pl, i) => ({ pl, i, st: m.state.players[i] }))
            .sort((a, b) => (a.i === r.winner ? -1 : b.i === r.winner ? 1 : m.state.config.mode === 'x01' ? a.st.remaining - b.st.remaining : b.st.points + b.st.scored - (a.st.points + a.st.scored)))
            .map(({ pl, i, st }, pos) => (
              <div key={i} class={'rank-row' + (i === r.winner ? ' winner' : '')} style={{ animationDelay: pos * 0.1 + 's' }}>
                <span class="pos">{pos === 0 ? '🏆' : pos + 1}</span>
                <AvatarImg cfg={pl.avatar} size={64} />
                <span class="nm">{pl.name}</span>
                <span class="sc">{m.state.config.mode === 'x01' ? `quedan ${st.remaining}` : m.state.config.mode === 'cricket' ? `${st.points} pts` : `${st.scored}`}</span>
              </div>
            ))}
        </div>
      )}
      {!solo && pls.length === 2 && (
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
      {setup.type === 'duel' && r.duel && <DuelResultPanel r={r} />}

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

      {setup.config.mode !== 'x01' && setup.config.mode !== 'free' && setup.config.mode !== 'cricket' && (
        <table class="stat-table mode-table">
          <tbody>
            {pls.map((pl, i) => {
              const st = m.state.players[i];
              const mode = setup.config.mode;
              const val = mode === 'killer' ? (st.lives > 0 ? '❤'.repeat(st.lives) : '💀') : mode === 'atc' ? `${st.darts} dardos` : mode === 'baseball' ? `${st.points} carreras` : mode === 'c121' ? `hasta ${st.points || '—'}` : `${st.points} pts`;
              return (
                <tr key={i}>
                  <td class={'nm' + (i === r.winner && !solo ? ' best' : '')}>{(i === r.winner && !solo ? '🏆 ' : '') + pl.name}</td>
                  <td>{val}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {r.newRecord && <div class="new-record">🏅 ¡NUEVO RÉCORD!</div>}
      {(r.awards?.length ?? 0) > 0 && (
        <div class="award-list">
          {[...new Set(r.awards)].map((id) => (
            <span key={id} class="aw-chip" style={{ ['--ac' as string]: AWARDS[id].color }}>
              {AWARDS[id].icon} {AWARDS[id].name.replace(/[¡!]/g, '')}
              {r.awards!.filter((x) => x === id).length > 1 ? ` ×${r.awards!.filter((x) => x === id).length}` : ''}
            </span>
          ))}
        </div>
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
        {(r.bonusCoins ?? 0) > 0 && (
          <div class="reward bonus" style={{ animationDelay: '.25s' }}>
            <span class="ico star">★</span>
            <div class="v">+{fmtNum(r.bonusCoins!)}</div>
            <div class="k">Bonus</div>
          </div>
        )}
        {r.chest && (
          <div class="reward" style={{ animationDelay: '.3s', borderColor: 'var(--gold)' }}>
            <ChestImg type={r.chest} class="ico" />
            <div class="k">{CHESTS[r.chest].name}</div>
          </div>
        )}
      </div>
      {(r.bestCombo ?? 0) >= 3 && <div class="combo-best">🔥 Mejor combo: x{r.bestCombo}</div>}
      {setup.online && <AddFriend pl={pls[1 - you]} />}
      {r.chestFull && <div class="muted" style={{ fontWeight: 800, fontSize: '12px', textAlign: 'center' }}>Tus huecos de cofres están llenos: ¡abre alguno para ganar más!</div>}
      <div style={{ width: '100%', maxWidth: '340px', marginTop: '8px' }}>
        <Progress value={p.xp} max={xpForNext(p.level)} color="blue" label={`Nivel ${p.level} · ${p.xp}/${xpForNext(p.level)} XP`} />
      </div>

      <div class="col" style={{ width: '100%', maxWidth: '340px', marginTop: '14px' }}>
        {setup.type !== 'tutorial' && setup.type !== 'duel' && (
          <button class="btn small gray" style={{ alignSelf: 'center' }} onClick={() => shareResult(m)}>
            📤 Compartir resultado
          </button>
        )}
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
        {canRematch ? (
          <div class="row" style={{ width: '100%' }}>
            <button class="btn big blue grow" onClick={rematch}>
              {setup.type === 'event' ? '🎟️ Otra' : setup.type === 'ranked' ? '⚔️ Revancha' : '🔁 Otra vez'}
              {setup.type === 'ranked' && (
                <span class="sub">
                  <Coin class="ico" /> {fmtNum(setup.entry ?? 0)}
                </span>
              )}
            </button>
            <button class="btn big grow" onClick={cont}>
              Continuar
            </button>
          </div>
        ) : (
          <button class="btn block big" onClick={cont}>
            Continuar
          </button>
        )}
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
