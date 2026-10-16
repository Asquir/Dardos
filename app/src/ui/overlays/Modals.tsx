// Todas las ventanas modales de la app.

import { useEffect, useState } from 'preact/hooks';
import { useStore, fmtNum, fmtTime, useNow } from '../../core/store';
import { ui, closeModal, closeAllModals, openModal, toast, go, type ModalSpec } from '../state';
import { profileStore, mutate, profile, saveNow, defaultProfile, PROFILE_KEY, isVip } from '../../meta/profile';
import { Modal, RewardList, ChestImg, Countdown, RewardIcon, rewardLabel, Progress } from '../components/common';
import { Gem, AdIco, InfoIco, Clock, RefreshIco } from '../icons';
import { audio } from '../../services/audio';
import { haptics } from '../../services/haptics';
import { ads } from '../../services/ads';
import { engine } from '../../engine/renderer';
import { CHESTS, oddsText } from '../../meta/chests';
import { RARITY_INFO, EMOTES } from '../../meta/catalog';
import { DAILY_REWARDS, WHEEL, spinWheel, missionText, missionTemplate } from '../../meta/progression';
import {
  claimDaily,
  dailyAvailable,
  dailyIndex,
  claimMission,
  rerollMission,
  wheelState,
  useWheelSpin,
  slotState,
  skipCost,
  startUnlock,
  openSlot,
  speedUpSlot,
  freeChestsAvailable,
  claimFreeChest,
  maxParallelUnlocks,
  FREE_CHEST_PERIOD,
} from '../../meta/economy';
import { claim, openChestReward } from '../rewards';
import { confetti } from '../fx';
import { ARENAS } from '../../meta/arenas';
import { ItemModal, LoadoutsModal } from '../screens/Collection';
import { DuelModal } from '../screens/Duel';
import { currentMatch } from '../../game/match';
import { quitMatch } from '../screens/Game';
import { PrivateRoomModal } from '../screens/Matchmaking';
import { LocalSetupModal } from '../screens/Events';
import { ClubCreateModal } from '../screens/Social';
import { removeKey } from '../../services/storage';
import { net } from '../../services/net';
import { restorePurchases } from '../purchase';
import { cleanName } from '@shared/text';
import { haptics as hap } from '../../services/haptics';
import { notify } from '../../services/notify';
import { maybeAskNotifications, enableNotifications, syncNotifications } from '../alerts';

export function ModalHost() {
  const s = useStore(ui);
  return (
    <>
      {s.modals.map((m, i) => (
        <ModalView key={i + m.kind} m={m} />
      ))}
    </>
  );
}

function ModalView({ m }: { m: ModalSpec }) {
  switch (m.kind) {
    case 'daily':
      return <DailyModal />;
    case 'missions':
      return <MissionsModal />;
    case 'wheel':
      return <WheelModal />;
    case 'settings':
      return <SettingsModal />;
    case 'levelup':
      return <LevelUpModal level={m.level} reward={m.reward} />;
    case 'reward':
      return (
        <Modal title={m.title}>
          <RewardList reward={m.reward} />
          <button class="btn block" onClick={() => (audio.click(), closeModal())}>
            ¡Genial!
          </button>
        </Modal>
      );
    case 'chestSlot':
      return <ChestSlotModal idx={m.idx} />;
    case 'odds':
      return <OddsModal chest={m.chest} />;
    case 'item':
      return <ItemModal id={m.id} />;
    case 'loadouts':
      return <LoadoutsModal />;
    case 'duel':
      return <DuelModal />;
    case 'confirm':
      return (
        <Modal title={m.title}>
          <div style={{ textAlign: 'center', fontWeight: 700, marginBottom: '14px' }}>{m.text}</div>
          <div class="row">
            <button class="btn gray grow" onClick={() => (audio.click(), closeModal())}>
              Cancelar
            </button>
            <button class={'btn grow ' + (m.danger ? 'red' : '')} onClick={() => (audio.click(), closeModal(), m.onOk())}>
              {m.ok}
            </button>
          </div>
        </Modal>
      );
    case 'info':
      return (
        <Modal title={m.title}>
          <div style={{ fontWeight: 700, marginBottom: '14px' }}>{m.text}</div>
          <button class="btn block" onClick={() => (audio.click(), closeModal())}>
            Vale
          </button>
        </Modal>
      );
    case 'arenaUnlocked':
      return <ArenaUnlocked arena={m.arena} />;
    case 'pause':
      return <PauseModal />;
    case 'emotes':
      return <EmotesModal />;
    case 'privateRoom':
      return <PrivateRoomModal />;
    case 'localSetup':
      return <LocalSetupModal />;
    case 'nameEdit':
      return <NameModal />;
    case 'clubCreate':
      return <ClubCreateModal />;
    case 'freeChest':
      return <FreeChestModal />;
    case 'notifyAsk':
      return <NotifyAskModal />;
    default:
      return null;
  }
}

// ------------------------------------------------------------------ diario

function DailyModal() {
  const p = useStore(profileStore);
  const avail = dailyAvailable(p);
  const idx = dailyIndex(p);
  const take = () => {
    const r = claimDaily();
    if (!r) return;
    haptics.success();
    closeModal();
    claim(r, `¡Día ${idx + 1}!`);
  };
  return (
    <Modal title="Recompensa diaria">
      <div class="muted" style={{ textAlign: 'center', fontWeight: 800, fontSize: '13px', marginBottom: '10px' }}>
        ¡Entra cada día para conseguir premios cada vez mejores!
      </div>
      <div class="daily-grid">
        {DAILY_REWARDS.map((r, i) => {
          const done = avail ? i < idx : i <= idx;
          const today = avail && i === idx;
          return (
            <div key={i} class={'daily-cell' + (today ? ' today' : '') + (done ? ' done' : '') + (i === 6 ? ' big' : '')}>
              <div class="d">Día {i + 1}</div>
              <RewardIcon reward={r} />
              <div class="v">{done ? '✅' : rewardLabel(r)}</div>
            </div>
          );
        })}
      </div>
      <button class="btn block big" style={{ marginTop: '14px' }} disabled={!avail} onClick={take}>
        {avail ? '¡Reclamar!' : <Countdown to={new Date(new Date().setHours(24, 0, 0, 0)).getTime()} prefix="Vuelve en " />}
      </button>
    </Modal>
  );
}

// ------------------------------------------------------------------ misiones

function MissionsModal() {
  const p = useStore(profileStore);
  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);
  return (
    <Modal title="Misiones diarias">
      <div class="muted" style={{ textAlign: 'center', fontWeight: 800, fontSize: '12px', marginBottom: '8px' }}>
        Nuevas misiones en <Countdown to={tomorrow.getTime()} />
      </div>
      {p.missions.list.map((m) => {
        const done = m.progress >= m.target;
        return (
          <div class="list-item" key={m.id} style={m.claimed ? { opacity: 0.5 } : undefined}>
            <div class="ic">{missionTemplate(m.kind)?.icon}</div>
            <div class="grow" style={{ minWidth: 0 }}>
              <div class="tt">{missionText(m)}</div>
              <Progress value={m.progress} max={m.target} style={{ height: '14px', marginTop: '4px' }} />
              <div class="ds" style={{ marginTop: '3px' }}>
                Premio: {m.reward.coins ? `${fmtNum(m.reward.coins)} 🪙` : ''} {m.reward.gems ? `· ${m.reward.gems} 💎` : ''} · {m.seasonXp} pts de pase
              </div>
            </div>
            {m.claimed ? (
              <span style={{ fontSize: '22px' }}>✅</span>
            ) : done ? (
              <button
                class="btn small shine"
                onClick={() => {
                  const r = claimMission(m.id);
                  if (r) {
                    haptics.success();
                    claim(r, '¡Misión completada!');
                  }
                }}
              >
                ¡Cobrar!
              </button>
            ) : (
              <button
                class="btn tiny dark"
                title="Cambiar misión"
                onClick={() => {
                  const cost = p.missions.rerolls === 0 ? 0 : 10;
                  if (rerollMission(m.id, cost)) {
                    audio.pop();
                    toast(cost ? `Misión cambiada (-${cost} 💎)` : 'Misión cambiada (gratis)');
                  } else toast('No tienes gemas suficientes', 'bad');
                }}
              >
                <RefreshIco style={{ width: '14px', height: '14px' }} /> {p.missions.rerolls === 0 ? 'Gratis' : '10💎'}
              </button>
            )}
          </div>
        );
      })}
    </Modal>
  );
}

// ------------------------------------------------------------------ ruleta

function WheelModal() {
  const p = useStore(profileStore);
  const st = wheelState(p);
  const [rot, setRot] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const seg = 360 / WHEEL.length;
  const spin = async (viaAd: boolean) => {
    if (spinning) return;
    if (viaAd) {
      const ok = await ads.rewarded();
      if (!ok) return toast('Mira el vídeo completo para girar', 'bad');
    }
    audio.unlock();
    const idx = spinWheel();
    useWheelSpin(viaAd);
    setSpinning(true);
    // el puntero está arriba: rotamos para que el centro del segmento idx quede a 0º
    const target = 360 * 6 + (360 - (idx * seg + seg / 2));
    const base = rot - (rot % 360);
    setRot(base + target);
    let ticks = 0;
    const tickId = setInterval(() => {
      audio.tick();
      if (++ticks > 26) clearInterval(tickId);
    }, 140);
    setTimeout(() => {
      setSpinning(false);
      haptics.success();
      const prize = WHEEL[idx];
      claim(prize.reward, `¡${prize.label}!`);
    }, 4400);
  };
  return (
    <Modal title="Ruleta de la suerte">
      <div class="wheel-wrap">
        <div class="wheel-pointer" />
        <svg class="wheel" viewBox="-110 -110 220 220" style={{ transform: `rotate(${rot}deg)` }}>
          <circle r="108" fill="#1b2152" stroke="#ffd23a" stroke-width="6" />
          {WHEEL.map((w, i) => {
            const a0 = ((i * seg - 90) * Math.PI) / 180;
            const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
            const am = (((i + 0.5) * seg - 90) * Math.PI) / 180;
            return (
              <g key={i}>
                <path d={`M0 0L${Math.cos(a0) * 100} ${Math.sin(a0) * 100}A100 100 0 0 1 ${Math.cos(a1) * 100} ${Math.sin(a1) * 100}z`} fill={w.color} stroke="#fff" stroke-width="2" />
                <text x={Math.cos(am) * 66} y={Math.sin(am) * 66} fill="#fff" font-family="Lilita One" font-size="15" text-anchor="middle" dominant-baseline="middle" transform={`rotate(${(i + 0.5) * seg + ((i + 0.5) * seg > 90 && (i + 0.5) * seg < 270 ? 180 : 0)} ${Math.cos(am) * 66} ${Math.sin(am) * 66})`} style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,.45)', strokeWidth: 3 }}>
                  {w.label}
                </text>
              </g>
            );
          })}
          {Array.from({ length: 16 }).map((_, i) => (
            <circle key={i} cx={Math.cos((i / 16) * Math.PI * 2) * 104} cy={Math.sin((i / 16) * Math.PI * 2) * 104} r="3" fill="#fff6c0" />
          ))}
          <circle r="16" fill="url(#gGold)" stroke="#a85a00" stroke-width="2" />
        </svg>
      </div>
      <div class="col">
        <button class="btn block big" disabled={!st.free || spinning} onClick={() => spin(false)}>
          {st.free ? '¡Girar gratis!' : 'Tirada gratis usada'}
        </button>
        <button class="btn block purple" disabled={st.adSpins <= 0 || spinning || st.free} onClick={() => spin(true)}>
          <AdIco class="ico" /> Girar otra vez ({st.adSpins} restantes)
        </button>
        <div class="muted" style={{ fontSize: '11px', fontWeight: 700, textAlign: 'center' }}>
          Probabilidades: {WHEEL.map((w) => `${w.label} ${Math.round((w.weight / WHEEL.reduce((a, x) => a + x.weight, 0)) * 100)}%`).join(' · ')}
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ cofres

function ChestSlotModal({ idx }: { idx: number }) {
  const p = useStore(profileStore);
  const now = useNow(500);
  const c = p.chests[idx];
  if (!c) return null;
  const def = CHESTS[c.type];
  const st = slotState(c, now);
  const cost = skipCost(c, now);
  const running = p.chests.filter((x) => slotState(x, now) === 'unlocking').length;
  const open = (pay: boolean) => {
    const res = openSlot(idx, pay);
    if (!res) {
      audio.error();
      return toast('No tienes gemas suficientes', 'bad');
    }
    closeModal();
    openChestReward(res.type, res.reward);
  };
  if (st === 'ready') {
    return (
      <Modal title={def.name}>
        <div class="col" style={{ alignItems: 'center' }}>
          <ChestImg type={c.type} style={{ width: '140px', animation: 'wiggle 1.8s infinite' }} />
          <button class="btn block big shine" onClick={() => open(false)}>
            ¡Abrir!
          </button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title={def.name}>
      <div class="col" style={{ alignItems: 'center' }}>
        <ChestImg type={c.type} style={{ width: '140px', animation: 'floaty 2.5s ease-in-out infinite' }} />
        <div class="pill">
          {ARENAS[c.arena].icon} Arena {c.arena + 1} · {def.cards}+ cartas
        </div>
        <button class="btn tiny dark" onClick={() => openModal({ kind: 'odds', chest: c.type })}>
          <InfoIco class="ico" /> Contenido y probabilidades
        </button>
        {st === 'unlocking' ? (
          <>
            <div class="display" style={{ fontSize: '30px' }}>
              <Clock style={{ width: '24px', verticalAlign: '-3px' }} /> {fmtTime((c.readyAt! - now) / 1000)}
            </div>
            <button
              class="btn block purple"
              onClick={async () => {
                const ok = await ads.rewarded();
                if (!ok) return toast('Mira el vídeo completo', 'bad');
                speedUpSlot(idx, 30 * 60);
                toast('¡-30 minutos!', 'good');
              }}
            >
              <AdIco class="ico" /> -30 min con un vídeo
            </button>
          </>
        ) : (
          <>
            <div class="muted" style={{ fontWeight: 800 }}>Tiempo de apertura: {fmtTime(def.duration * (isVip(p) ? 0.5 : 1))}</div>
            <button
              class="btn block"
              disabled={running >= maxParallelUnlocks(p)}
              onClick={() => {
                if (startUnlock(idx)) {
                  audio.click();
                  closeModal();
                  maybeAskNotifications();
                }
              }}
            >
              {running >= maxParallelUnlocks(p) ? 'Ya se está abriendo otro cofre' : 'Empezar a abrir'}
            </button>
          </>
        )}
        <button class="btn block gold" onClick={() => open(true)}>
          Abrir ya · <Gem class="ico" /> {cost}
        </button>
      </div>
    </Modal>
  );
}

function OddsModal({ chest }: { chest: keyof typeof CHESTS }) {
  const d = CHESTS[chest];
  return (
    <Modal title="Probabilidades">
      <div class="col">
        <div style={{ fontWeight: 800, textAlign: 'center' }}>{d.name}</div>
        <div class="muted" style={{ fontSize: '12px', fontWeight: 700, textAlign: 'center' }}>
          Monedas: {d.coins[0]}–{d.coins[1]} (x arena) · Gemas: {Math.round(d.gems[2] * 100)}% de probabilidad ({d.gems[0]}–{d.gems[1]})
        </div>
        {oddsText(chest).map((o) => (
          <div key={o.rarity} class="row" style={{ justifyContent: 'space-between', padding: '8px 12px', borderRadius: '12px', background: 'rgba(255,255,255,.06)' }}>
            <span class="rarity-tag" style={{ background: RARITY_INFO[o.rarity].color, color: '#10132e' }}>
              {RARITY_INFO[o.rarity].name}
            </span>
            <span class="display">{o.pct} por carta</span>
          </div>
        ))}
        {Object.entries(d.guaranteed).length > 0 && (
          <div class="muted" style={{ fontSize: '12px', fontWeight: 800, textAlign: 'center' }}>
            Garantizado: {Object.entries(d.guaranteed).map(([r, n]) => `${n} ${RARITY_INFO[r as keyof typeof RARITY_INFO].name.toLowerCase()}`).join(', ')}
          </div>
        )}
        <button class="btn block" onClick={closeModal}>
          Entendido
        </button>
      </div>
    </Modal>
  );
}

function FreeChestModal() {
  const p = useStore(profileStore);
  const now = useNow(1000);
  const n = freeChestsAvailable(p, now);
  return (
    <Modal title="Cofre gratis">
      <div class="col" style={{ alignItems: 'center' }}>
        <ChestImg type="free" style={{ width: '130px' }} />
        <div class="muted" style={{ fontWeight: 800, textAlign: 'center' }}>Cada 4 horas recibes un cofre gratis (se acumulan hasta 2).</div>
        <button
          class="btn block big"
          disabled={n <= 0}
          onClick={() => {
            const r = claimFreeChest();
            if (!r) return;
            closeModal();
            openChestReward('free', r);
          }}
        >
          {n > 0 ? `¡Abrir! (${n})` : <Countdown to={p.freeChestAt + (n ? FREE_CHEST_PERIOD : 0)} prefix="Siguiente en " />}
        </button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ nivel y arena

function LevelUpModal({ level, reward }: { level: number; reward: import('../../meta/chests').Reward }) {
  useEffect(() => {
    audio.levelUp();
    confetti(150);
    engine.doFlash(0.3);
  }, []);
  return (
    <Modal title="¡Subes de nivel!">
      <div class="col" style={{ alignItems: 'center' }}>
        <div style={{ position: 'relative', width: '130px', height: '130px' }}>
          <div class="rays-bg" style={{ width: '300px', height: '300px', top: '-85px', left: '-85px', margin: 0 }} />
          <svg viewBox="0 0 40 40" style={{ width: '130px', height: '130px', position: 'relative' }}>
            <path d="M20 2l5.4 11 12.1 1.8-8.8 8.5 2.1 12.1L20 29.7 9.2 35.4l2.1-12.1-8.8-8.5 12.1-1.8z" fill="url(#gBlue)" stroke="#123f9a" stroke-width="1.2" />
            <text x="20" y="25" text-anchor="middle" font-family="Lilita One" font-size="13" fill="#fff">
              {level}
            </text>
          </svg>
        </div>
        <RewardList reward={{ coins: reward.coins, gems: reward.gems }} />
        {reward.chest && <div class="muted" style={{ fontWeight: 800 }}>¡Y un {CHESTS[reward.chest].name}!</div>}
        <button class="btn block big" onClick={() => (audio.click(), closeModal())}>
          ¡Genial!
        </button>
      </div>
    </Modal>
  );
}

function ArenaUnlocked({ arena }: { arena: number }) {
  const a = ARENAS[arena];
  useEffect(() => {
    audio.win();
    confetti(200);
  }, []);
  return (
    <Modal title="¡Nueva arena!">
      <div class="col" style={{ alignItems: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: '72px', animation: 'popIn .6s' }}>{a.icon}</div>
        <div class="display" style={{ fontSize: '28px', color: a.color }}>
          {a.name}
        </div>
        <div style={{ fontWeight: 800 }}>{a.subtitle}</div>
        <div class="muted" style={{ fontWeight: 700, fontSize: '13px' }}>
          Rivales más duros, premios de {fmtNum(a.prize)} monedas y nuevas cartas en los cofres.
        </div>
        <button class="btn block big" onClick={closeModal}>
          ¡Vamos!
        </button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ partida

function PauseModal() {
  const m = currentMatch();
  const ranked = m && (m.setup.type === 'ranked' || m.setup.type === 'online' || m.setup.type === 'tournament');
  return (
    <Modal title="Pausa">
      <div class="col">
        <button class="btn block big" onClick={closeModal}>
          Continuar
        </button>
        <button class="btn block blue" onClick={() => openModal({ kind: 'settings' })}>
          Ajustes
        </button>
        <button
          class="btn block red"
          onClick={() => {
            if (ranked) {
              openModal({ kind: 'confirm', title: '¿Abandonar?', text: 'Si abandonas una partida clasificatoria, cuenta como derrota.', ok: 'Abandonar', danger: true, onOk: () => (closeAllModals(), quitMatch()) });
            } else {
              closeAllModals();
              quitMatch();
            }
          }}
        >
          Abandonar partida
        </button>
      </div>
    </Modal>
  );
}

function EmotesModal() {
  const p = useStore(profileStore);
  return (
    <Modal title="Emotes">
      <div class="emote-grid">
        {EMOTES.filter((e) => p.emotes.includes(e.id)).map((e) => (
          <button
            key={e.id}
            onClick={() => {
              currentMatch()?.sendEmote(e.id);
              closeModal();
            }}
          >
            <span class="e">{e.icon}</span> {e.text}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function NameModal() {
  const [name, setName] = useState(profile().name);
  return (
    <Modal title="Cambiar nombre">
      <div class="col">
        <input class="form-field" maxLength={16} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <button
          class="btn block"
          onClick={() => {
            const n = cleanName(name);
            if (n.length < 3) return toast('Mínimo 3 caracteres', 'bad');
            mutate((p) => {
              p.name = n;
              p.nameSet = true;
            });
            net.syncProfile();
            closeModal();
            toast('Nombre cambiado', 'good');
          }}
        >
          Guardar
        </button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ permiso de avisos

function NotifyAskModal() {
  const answer = (yes: boolean) => {
    audio.click();
    closeModal();
    if (yes) void enableNotifications().then((ok) => toast(ok ? '¡Te avisaremos cuando esté listo!' : 'Puedes activarlos en Ajustes cuando quieras', ok ? 'good' : 'info'));
    else {
      mutate((p) => void (p.settings.notifications = false));
      toast('Puedes activar los avisos en Ajustes', 'info');
    }
  };
  return (
    <Modal noClose>
      <div class="notify-ask">
        <div class="bell">
          <span>🔔</span>
          <i />
        </div>
        <h2 class="outline">¿Te avisamos?</h2>
        <p>Recibe un aviso cuando tu <b>cofre esté listo</b>, tengas un <b>cofre gratis</b> o empiece un <b>evento</b>.</p>
        <ul>
          <li>🎁 Cofres listos para abrir</li>
          <li>⚡ Eventos con premios exclusivos</li>
          <li>📅 Tu recompensa diaria</li>
        </ul>
        <button class="btn block shine" onClick={() => answer(true)}>
          ¡Sí, avísame!
        </button>
        <button class="btn block gray" onClick={() => answer(false)}>
          Ahora no
        </button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ ajustes

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button class={'toggle' + (on ? ' on' : '')} onClick={() => (audio.click(), onChange(!on))} aria-pressed={on} />;
}

function SettingsModal() {
  const p = useStore(profileStore);
  const s = p.settings;
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => {
    mutate((pp) => (pp.settings[k] = v));
    if (k === 'sfx' || k === 'music') audio.setVolumes(k === 'sfx' ? (v as number) : s.sfx, k === 'music' ? (v as number) : s.music);
    if (k === 'voice') audio.voice = v as boolean;
    if (k === 'vibration') hap.setEnabled(v as boolean);
    if (k === 'quality') {
      if (v === 'auto') {
        try {
          localStorage.removeItem('diana_auto_quality');
        } catch {
          /* sin almacenamiento */
        }
        engine.setAutoQuality('high');
      } else engine.setQuality(v as 'high');
    }
  };
  const [server, setServer] = useState(s.serverUrl);
  const row = (label: string, ctl: preact.ComponentChildren) => (
    <div class="row" style={{ justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--stroke)' }}>
      <span style={{ fontWeight: 800 }}>{label}</span>
      {ctl}
    </div>
  );
  return (
    <Modal title="Ajustes">
      {row('Efectos de sonido', <input type="range" min={0} max={1} step={0.05} value={s.sfx} style={{ width: '45%' }} onInput={(e) => set('sfx', +(e.target as HTMLInputElement).value)} />)}
      {row('Música', <input type="range" min={0} max={1} step={0.05} value={s.music} style={{ width: '45%' }} onInput={(e) => set('music', +(e.target as HTMLInputElement).value)} />)}
      {row('Voz del locutor', <Toggle on={s.voice} onChange={(v) => set('voice', v)} />)}
      {row('Vibración', <Toggle on={s.vibration} onChange={(v) => set('vibration', v)} />)}
      {row(
        'Notificaciones',
        <Toggle
          on={s.notifications === true}
          onChange={(v) => {
            if (!v) {
              set('notifications', false);
              syncNotifications(true);
              return;
            }
            if (!notify.supported) {
              set('notifications', true);
              toast('Los avisos llegan en la app del móvil', 'info');
              return;
            }
            void enableNotifications().then((ok) => !ok && toast('Activa los avisos en los ajustes del teléfono', 'bad'));
          }}
        />,
      )}
      {row('Zona objetivo y cierres', <Toggle on={s.showCheckout} onChange={(v) => set('showCheckout', v)} />)}
      {row('Sorteo al bull para empezar', <Toggle on={s.bullOff !== false} onChange={(v) => set('bullOff', v)} />)}
      {row('Repeticiones de los grandes momentos', <Toggle on={s.replays !== false} onChange={(v) => set('replays', v)} />)}
      <div style={{ padding: '9px 0', borderBottom: '1px solid var(--stroke)' }}>
        <div style={{ fontWeight: 800, marginBottom: '6px' }}>Tiempo por tirada</div>
        <div class="seg">
          {[0, 10, 15, 25].map((v) => (
            <button key={v} class={(s.shotClock ?? 15) === v ? 'on' : ''} onClick={() => set('shotClock', v)}>
              {v ? v + ' s' : 'Sin límite'}
            </button>
          ))}
        </div>
      </div>
      {row('Zurdo', <Toggle on={s.leftHanded} onChange={(v) => set('leftHanded', v)} />)}
      <div style={{ padding: '9px 0', borderBottom: '1px solid var(--stroke)' }}>
        <div style={{ fontWeight: 800, marginBottom: '6px' }}>Lanzamiento</div>
        <div class="seg">
          <button class={s.control === 'flick' ? 'on' : ''} onClick={() => set('control', 'flick')}>
            Deslizar (realista)
          </button>
          <button class={s.control === 'tap' ? 'on' : ''} onClick={() => set('control', 'tap')}>
            Soltar (fácil)
          </button>
        </div>
      </div>
      {row('Sensibilidad de la mira', <input type="range" min={0.5} max={1.6} step={0.05} value={s.sensitivity} style={{ width: '45%' }} onInput={(e) => set('sensitivity', +(e.target as HTMLInputElement).value)} />)}
      <div style={{ padding: '9px 0', borderBottom: '1px solid var(--stroke)' }}>
        <div style={{ fontWeight: 800, marginBottom: '6px' }}>Calidad gráfica</div>
        <div class="seg">
          {(['auto', 'low', 'medium', 'high'] as const).map((q) => (
            <button key={q} class={s.quality === q ? 'on' : ''} onClick={() => set('quality', q)}>
              {{ auto: 'Auto', low: 'Baja', medium: 'Media', high: 'Alta' }[q]}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: '9px 0', borderBottom: '1px solid var(--stroke)' }}>
        <div style={{ fontWeight: 800, marginBottom: '6px' }}>Servidor online</div>
        <div class="row">
          <input class="form-field" placeholder="wss://tu-servidor.com" value={server} onInput={(e) => setServer((e.target as HTMLInputElement).value)} style={{ height: '38px', fontSize: '13px' }} />
          <button
            class="btn small blue"
            onClick={() => {
              set('serverUrl', server.trim());
              net.disconnect();
              setTimeout(() => net.connect(), 100);
              toast(server.trim() ? 'Conectando...' : 'Online desactivado');
            }}
          >
            OK
          </button>
        </div>
      </div>
      <div class="col" style={{ marginTop: '12px' }}>
        <button class="btn small dark" onClick={() => ads.showPrivacyOptions()}>
          Privacidad y consentimiento de anuncios
        </button>
        <div class="row">
          <button class="btn small dark grow" onClick={() => window.open((import.meta.env.VITE_PRIVACY_URL as string) || 'https://github.com/Asquir/Dardos/blob/main/docs/PRIVACIDAD.md', '_blank')}>
            Política de privacidad
          </button>
          <button class="btn small dark grow" onClick={() => window.open((import.meta.env.VITE_TERMS_URL as string) || 'https://github.com/Asquir/Dardos/blob/main/docs/TERMINOS.md', '_blank')}>
            Términos
          </button>
        </div>
        <button class="btn small dark" onClick={() => restorePurchases()}>
          Restaurar compras
        </button>
        <button class="btn small dark" onClick={() => (closeAllModals(), mutate((pp) => (pp.tutorial = { done: false, tips: [] })), go('onboarding'))}>
          Repetir tutorial
        </button>
        <button
          class="btn small red"
          onClick={() =>
            openModal({
              kind: 'confirm',
              title: 'Borrar cuenta',
              danger: true,
              ok: 'Borrar todo',
              text: 'Se eliminarán tu progreso y tus datos de este dispositivo y del servidor. Las compras no se pueden recuperar. ¿Seguro?',
              onOk: async () => {
                net.send({ t: 'delete_account' });
                await removeKey(PROFILE_KEY);
                const fresh = defaultProfile();
                profileStore.set(fresh);
                await saveNow();
                closeAllModals();
                go('onboarding');
                toast('Cuenta borrada');
              },
            })
          }
        >
          Borrar cuenta y datos
        </button>
        <div class="muted" style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700 }}>
          Diana Legends v1.0 · ID {p.serverId ?? p.id.slice(0, 8)}
        </div>
      </div>
    </Modal>
  );
}
