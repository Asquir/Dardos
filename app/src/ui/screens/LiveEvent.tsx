// Evento en vivo: cabecera animada, cuenta atrás, entradas, reglas, hitos con premios y objeto exclusivo.

import { useEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { useStore, useNow, fmtTime, fmtNum } from '../../core/store';
import { profileStore } from '../../meta/profile';
import {
  currentLiveEvent,
  eventMilestones,
  eventState,
  nextTicketIn,
  adTicketsLeft,
  regenTickets,
  MAX_TICKETS,
  GEM_TICKET_PRICE,
  AD_TICKETS_PER_DAY,
  type LiveEventDef,
} from '../../meta/liveEvents';
import { liveEventNow, buyEventTicket, adEventTicket, claimEventMilestone } from '../../meta/events';
import { getItem, RARITY_INFO } from '../../meta/catalog';
import { ARENAS } from '../../meta/arenas';
import { go, toast, closeModal, openModal } from '../state';
import { audio } from '../../services/audio';
import { ads } from '../../services/ads';
import { eventSetup, launch } from '../../game/launch';
import { claim } from '../rewards';
import { confetti } from '../fx';
import { Back, Gem, AdIco } from '../icons';
import { ItemThumb, RewardIcon } from '../components/common';
import { CHESTS, type Reward } from '../../meta/chests';
import type { MatchResult } from '../../game/match';

export function modeText(def: LiveEventDef): string {
  const c = def.config;
  if (c.mode === 'cricket') return 'Cricket';
  if (c.mode === 'x01') return `${c.start}${c.doubleOut ? ' · doble para cerrar' : ' · cierre libre'}`;
  return c.mode;
}

export function scoringChips(def: LiveEventDef): [string, string][] {
  const s = def.scoring;
  const out: [string, string][] = [
    ['🏆 Victoria', `+${s.win}`],
    ['🤝 Derrota', `+${s.lose}`],
  ];
  if (s.perBull) out.push(['🔴 Bull', `+${s.perBull}`]);
  if (s.perTreble) out.push(['✴️ Triple', `+${s.perTreble}`]);
  if (s.perDouble) out.push(['🎯 Doble', `+${s.perDouble}`]);
  if (s.perTon) out.push(['💯 Turno 100+', `+${s.perTon}`]);
  if (s.per180) out.push(['💥 180', `+${s.per180}`]);
  if (s.perCheckout) out.push(['✅ Cierre', `+${s.perCheckout}`]);
  return out;
}

function evStyle(def: LiveEventDef): JSX.CSSProperties {
  return { '--c1': def.colors[0], '--c2': def.colors[1], '--c3': def.colors[2] } as unknown as JSX.CSSProperties;
}

export function LiveEvent() {
  const p = useStore(profileStore);
  const now = useNow(1000);
  const ev = currentLiveEvent(now);
  const raw = eventState(p);
  const s = { ...raw };
  regenTickets(s, now);
  const ms = eventMilestones(ev.def);
  const nextIdx = ms.findIndex((m) => s.points < m.pts);
  const prevPts = nextIdx > 0 ? ms[nextIdx - 1].pts : 0;
  const nextPts = nextIdx >= 0 ? ms[nextIdx].pts : ms[ms.length - 1].pts;
  const pct = nextIdx < 0 ? 100 : ((s.points - prevPts) / (nextPts - prevPts)) * 100;
  const ex = getItem(ev.def.exclusive);

  useEffect(() => {
    liveEventNow();
  }, []);

  const play = () => {
    const setup = eventSetup();
    if (!setup) {
      audio.error();
      openModal({ kind: 'info', title: 'Sin entradas', text: <NoTickets /> });
      return;
    }
    audio.click();
    go('game');
    launch(setup);
  };

  const claimMs = (i: number) => {
    const r = claimEventMilestone(i);
    if (!r) return;
    confetti(90);
    audio.levelUp();
    const isEx = !!r.reward.item;
    claim(r.reward, isEx ? '¡Objeto exclusivo!' : `Hito ${i + 1} conseguido`);
  };

  return (
    <div class="screen live-ev" style={evStyle(ev.def)}>
      <button class="icon-btn lev-back" onClick={() => (audio.click(), go('events'))} aria-label="Volver">
        <Back />
      </button>
      <div class="scroll grow content pad col" style={{ gap: '12px', paddingBottom: '20px' }}>
        <div class="lev-head">
          <div class="lev-rays" />
          <div class="lev-sparks">
            {Array.from({ length: 14 }, (_, i) => (
              <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i * 0.37) % 3}s`, animationDuration: `${2.4 + (i % 4) * 0.6}s` }} />
            ))}
          </div>
          <div class="lev-live">
            <span class="dot" /> EN VIVO
          </div>
          <div class="lev-emblem">
            <span>{ev.def.icon}</span>
          </div>
          <h1 class="outline">{ev.def.name}</h1>
          <div class="lev-tagline">{ev.def.tagline}</div>
          <div class="lev-timer">⏱ Termina en {fmtTime((ev.endsAt - now) / 1000)}</div>
        </div>

        <div class="lev-card lev-score">
          <div class="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div class="k">TUS PUNTOS</div>
              <div class="v display">{fmtNum(s.points)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div class="k">{nextIdx < 0 ? '¡COMPLETADO!' : `SIGUIENTE HITO`}</div>
              <div class="v2">{nextIdx < 0 ? '🏅 Todos los hitos' : `${fmtNum(nextPts)} pts`}</div>
            </div>
          </div>
          <div class="lev-bar">
            <i style={{ width: Math.max(3, Math.min(100, pct)) + '%' }} />
          </div>
          <div class="muted" style={{ fontSize: '12px', fontWeight: 800 }}>
            {s.played} {s.played === 1 ? 'partida jugada' : 'partidas jugadas'} · {modeText(ev.def)} · {ARENAS[ev.def.arena].name}
          </div>
        </div>

        <div class="lev-card lev-play">
          <div class="tickets">
            {Array.from({ length: MAX_TICKETS }, (_, i) => (
              <span key={i} class={'tk' + (i < s.tickets ? ' on' : '')}>
                🎟️
              </span>
            ))}
          </div>
          <div class="muted" style={{ fontSize: '12px', fontWeight: 800, textAlign: 'center' }}>
            {s.tickets >= MAX_TICKETS ? 'Entradas al máximo' : `+1 entrada en ${fmtTime(nextTicketIn(s, now) / 1000)}`}
          </div>
          <button class="btn big block shine lev-go" onClick={play}>
            ¡JUGAR EVENTO!
            <span class="sub">Usa 1 🎟️ · quedan {s.tickets}</span>
          </button>
          {s.tickets < MAX_TICKETS && <TicketRefill compact />}
        </div>

        <div class="lev-card">
          <div class="lev-h">Reglas</div>
          <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px' }}>{ev.def.desc}</div>
          <div class="chips">
            {scoringChips(ev.def).map(([k, v]) => (
              <span key={k} class="chip">
                {k} <b>{v}</b>
              </span>
            ))}
          </div>
        </div>

        <div class="lev-card lev-ex">
          <div class="ex-glow" />
          <ItemThumb id={ev.def.exclusive} class="ex-img" />
          <div class="grow">
            <div class="lev-h" style={{ color: RARITY_INFO[ex.rarity].color }}>
              PREMIO EXCLUSIVO · {RARITY_INFO[ex.rarity].name.toUpperCase()}
            </div>
            <div class="display" style={{ fontSize: '20px' }}>{ex.name}</div>
            <div class="muted" style={{ fontSize: '12px', fontWeight: 700 }}>Solo se consigue en este evento. Llega a {fmtNum(ms[ms.length - 1].pts)} puntos.</div>
          </div>
        </div>

        <div class="lev-h" style={{ margin: '4px 4px -4px' }}>
          Hitos del evento
        </div>
        <div class="lev-track">
          {ms.map((m, i) => {
            const got = s.claimed.includes(i);
            const reached = s.points >= m.pts;
            const cls = got ? 'done' : reached ? 'claim' : i === nextIdx ? 'next' : 'locked';
            const last = i === ms.length - 1;
            return (
              <div key={i} class={'ms ' + cls + (last ? ' last' : '')}>
                <div class="node">{got ? '✓' : i + 1}</div>
                <div class="ms-body">
                  <div class="ms-ic">
                    <RewardIcon reward={m.reward} />
                  </div>
                  <div class="grow">
                    <div class="ms-pts">{fmtNum(m.pts)} pts</div>
                    <div class="ms-rw">{last ? `${ex.name} + ${m.reward.gems} gemas` : msLabel(m.reward)}</div>
                  </div>
                  {cls === 'claim' && (
                    <button class="btn small gold shine" onClick={() => claimMs(i)}>
                      ¡Reclamar!
                    </button>
                  )}
                  {cls === 'next' && <span class="ms-left">Faltan {fmtNum(m.pts - s.points)}</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div class="lev-card lev-next" style={evStyle(ev.next)}>
          <div class="next-ic">{ev.next.icon}</div>
          <div class="grow">
            <div class="lev-h">Próximo evento</div>
            <div class="display" style={{ fontSize: '18px' }}>{ev.next.name}</div>
            <div class="muted" style={{ fontSize: '12px', fontWeight: 800 }}>Empieza en {fmtTime((ev.nextAt - now) / 1000)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function msLabel(r: Reward): string {
  if (r.chest) return CHESTS[r.chest].name;
  if (r.gems) return `${r.gems} gemas`;
  if (r.coins) return `${fmtNum(r.coins)} monedas`;
  return '';
}

function TicketRefill({ compact }: { compact?: boolean }) {
  const p = useStore(profileStore);
  const s = eventState(p);
  const adLeft = adTicketsLeft(s);
  const watch = async () => {
    audio.click();
    const ok = await ads.rewarded();
    if (!ok) return toast('Mira el vídeo completo para conseguir la entrada', 'bad');
    if (adEventTicket()) {
      audio.coin();
      toast('+1 entrada 🎟️', 'good');
      if (!compact) closeModal();
    }
  };
  const buy = () => {
    if (buyEventTicket()) {
      audio.gem();
      toast('+1 entrada 🎟️', 'good');
      if (!compact) closeModal();
    } else {
      audio.error();
      toast('No tienes gemas suficientes', 'bad');
    }
  };
  return (
    <div class="row" style={{ width: '100%' }}>
      <button class="btn small purple grow" disabled={adLeft <= 0} onClick={watch}>
        <AdIco class="ico" /> +1 ({adLeft}/{AD_TICKETS_PER_DAY})
      </button>
      <button class="btn small blue grow" onClick={buy}>
        +1 · <Gem class="ico" /> {GEM_TICKET_PRICE}
      </button>
    </div>
  );
}

function NoTickets() {
  const p = useStore(profileStore);
  const now = useNow(1000);
  const s = { ...eventState(p) };
  regenTickets(s, now);
  return (
    <div class="col" style={{ textAlign: 'center', alignItems: 'center' }}>
      <div style={{ fontSize: '54px' }}>🎟️</div>
      <div style={{ fontWeight: 800 }}>Te has quedado sin entradas.</div>
      <div class="muted" style={{ fontSize: '13px' }}>Se recarga 1 cada 40 minutos · siguiente en {fmtTime(nextTicketIn(s, now) / 1000)}</div>
      <TicketRefill />
    </div>
  );
}

/** Bloque de puntos del evento en la pantalla de resultados. */
export function EventResultPanel({ r }: { r: MatchResult }) {
  const p = useStore(profileStore);
  const ev = currentLiveEvent();
  const s = eventState(p);
  const ms = eventMilestones(ev.def);
  const nextIdx = ms.findIndex((m) => s.points < m.pts);
  const prev = nextIdx > 0 ? ms[nextIdx - 1].pts : 0;
  const next = nextIdx >= 0 ? ms[nextIdx].pts : ms[ms.length - 1].pts;
  const pct = nextIdx < 0 ? 100 : ((s.points - prev) / (next - prev)) * 100;
  const totalRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = totalRef.current;
    if (!el) return;
    const to = r.eventPoints ?? 0;
    let raf = 0;
    const t0 = performance.now() + 500;
    const step = (t: number) => {
      const k = Math.max(0, Math.min(1, (t - t0) / 900));
      el.textContent = '+' + Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
      else if (to > 0) audio.coin();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [r]);
  return (
    <div class="ev-result" style={evStyle(ev.def)}>
      <div class="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div class="lev-h" style={{ margin: 0 }}>
          {ev.def.icon} {ev.def.name}
        </div>
        <div class="ev-total display">
          <span ref={totalRef}>+0</span> pts
        </div>
      </div>
      <div class="ev-lines">
        {(r.eventLines ?? []).map((l, i) => (
          <div key={l.label} class="ev-line" style={{ animationDelay: `${0.25 + i * 0.12}s` }}>
            <span>{l.label}</span>
            <b>+{l.pts}</b>
          </div>
        ))}
      </div>
      <div class="lev-bar small">
        <i style={{ width: Math.max(3, Math.min(100, pct)) + '%' }} />
      </div>
      <div class="muted" style={{ fontSize: '11px', fontWeight: 800 }}>
        Total {fmtNum(s.points)} · {nextIdx < 0 ? '¡Todos los hitos!' : `siguiente hito a ${fmtNum(next)}`}
      </div>
    </div>
  );
}

/** Tarjeta grande del evento para la pestaña de Eventos. */
export function LiveEventCard() {
  const p = useStore(profileStore);
  const now = useNow(1000);
  const ev = currentLiveEvent(now);
  const s = eventState(p);
  const ms = eventMilestones(ev.def);
  const claimable = ms.filter((m, i) => s.points >= m.pts && !s.claimed.includes(i)).length;
  const done = s.claimed.length;
  return (
    <button class="lev-banner" style={evStyle(ev.def)} onClick={() => (audio.click(), go('liveEvent'))}>
      <div class="lev-rays" />
      <div class="lb-ic">{ev.def.icon}</div>
      <div class="grow" style={{ textAlign: 'left', position: 'relative' }}>
        <div class="row" style={{ gap: '6px', marginBottom: '4px' }}>
          <span class="lev-live small">
            <span class="dot" /> EN VIVO
          </span>
          <span class="lb-time">⏱ {fmtTime((ev.endsAt - now) / 1000)}</span>
        </div>
        <h3 class="outline">{ev.def.name}</h3>
        <p>{ev.def.tagline}</p>
        <div class="lb-prog">
          <i style={{ width: (done / ms.length) * 100 + '%' }} />
          <span>
            {done}/{ms.length} hitos
          </span>
        </div>
      </div>
      <ItemThumb id={ev.def.exclusive} class="lb-ex" />
      {claimable > 0 && <span class="badge">{claimable}</span>}
    </button>
  );
}

