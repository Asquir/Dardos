// Pantalla principal: arena, botón de jugar, cofres y accesos a recompensas.

import { useStore, useNow, fmtTime, fmtNum } from '../../core/store';
import { profileStore, mutate } from '../../meta/profile';
import { ARENAS, arenaForTrophies, nextArena } from '../../meta/arenas';
import { CHESTS } from '../../meta/chests';
import { slotState, skipCost, openSlot, freeChestsAvailable, dailyAvailable, wheelState, seasonClaimable, FREE_CHEST_PERIOD } from '../../meta/economy';
import { seasonTier, SEASON_TIERS, FEATURE_LEVEL } from '../../meta/progression';
import { Coin, Trophy, Back, Fwd, CalendarIco, ScrollIco, WheelIco, PassIco, GiftIco, GlobeIco, Gem, Clock } from '../icons';
import { ChestImg, Progress } from '../components/common';
import { go, openModal, toast, closeModal } from '../state';
import { audio } from '../../services/audio';
import { rankedSetup, launch } from '../../game/launch';
import { openChestReward } from '../rewards';
import { HomeTutorial } from '../overlays/Tutorial';
import { net, netStatus } from '../../services/net';

export function Home() {
  const p = useStore(profileStore);
  const now = useNow(1000);
  const unlocked = arenaForTrophies(p.bestTrophies);
  const arena = ARENAS[Math.min(p.selectedArena, unlocked)];
  const next = nextArena(p.trophies);
  const prevT = ARENAS[arenaForTrophies(p.trophies)].trophies;
  useStore(netStatus);

  const setArena = (d: number) => {
    const n = Math.max(0, Math.min(unlocked, p.selectedArena + d));
    if (n !== p.selectedArena) {
      audio.whooshUi();
      mutate((pp) => (pp.selectedArena = n));
    }
  };

  const play = () => {
    audio.click();
    const setup = rankedSetup(arena.id);
    if (!setup) {
      audio.error();
      toast(`Necesitas ${fmtNum(arena.entry)} monedas para jugar aquí`, 'bad');
      openModal({ kind: 'info', title: 'Sin monedas', text: <NoCoins arenaId={arena.id} /> });
      return;
    }
    go('game');
    launch(setup);
  };

  const playOnline = () => {
    audio.click();
    if (p.level < FEATURE_LEVEL.online) {
      toast(`El modo online se desbloquea en el nivel ${FEATURE_LEVEL.online}`, 'info');
      return;
    }
    if (!net.enabled()) {
      openModal({
        kind: 'info',
        title: 'Online',
        text: (
          <div class="col" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px' }}>🌐</div>
            <div>El servidor online no está configurado en esta versión.</div>
            <div class="muted" style={{ fontSize: '12px' }}>Mientras tanto, juega en las arenas contra rivales de la máquina o con un amigo en el mismo móvil desde Eventos.</div>
          </div>
        ),
      });
      return;
    }
    if (p.coins < arena.entry) {
      toast(`Necesitas ${fmtNum(arena.entry)} monedas`, 'bad');
      return;
    }
    go('matchmaking', { arena: arena.id });
  };

  const freeN = freeChestsAvailable(p, now);
  const wheel = wheelState(p);
  const starterAvailable = !p.purchases.starterPack && now - p.createdAt < 72 * 3600 * 1000 && p.tutorial.done;
  const missionsReady = p.missions.list.filter((m) => !m.claimed && m.progress >= m.target).length;
  const seasonN = seasonClaimable(p);

  return (
    <div class="screen">
      <div class="home-arena">
        <div class="arena-name">
          <button class="arrow" disabled={p.selectedArena <= 0} onClick={() => setArena(-1)} aria-label="Arena anterior">
            <Back style={{ width: '18px' }} />
          </button>
          <div class="arena-title outline">
            <div class="sub">ARENA {arena.id + 1} · {arena.subtitle}</div>
            <h1 style={{ color: '#fff' }}>
              {arena.icon} {arena.name}
            </h1>
          </div>
          <button class="arrow" disabled={p.selectedArena >= unlocked} onClick={() => setArena(1)} aria-label="Arena siguiente">
            <Fwd style={{ width: '18px' }} />
          </button>
        </div>
        <div class="trophy-bar">
          <Trophy class="ico" />
          <Progress value={p.trophies - prevT} max={(next?.trophies ?? p.trophies + 1) - prevT} color="gold" style={{ flex: 1 }} label={next ? `${fmtNum(p.trophies)} / ${fmtNum(next.trophies)}` : `${fmtNum(p.trophies)} · ¡Máximo!`} />
        </div>
      </div>

      <div class="side-col left">
        <button class="side-btn" onClick={() => openModal({ kind: 'daily' })}>
          <div class={'ib' + (dailyAvailable(p) ? ' glow' : '')}>
            <CalendarIco />
            {dailyAvailable(p) && <span class="badge">!</span>}
          </div>
          Diario
        </button>
        <button class="side-btn" onClick={() => openModal({ kind: 'missions' })}>
          <div class={'ib' + (missionsReady ? ' glow' : '')}>
            <ScrollIco />
            {missionsReady > 0 && <span class="badge">{missionsReady}</span>}
          </div>
          Misiones
        </button>
        <button class="side-btn" onClick={() => openModal({ kind: 'wheel' })}>
          <div class={'ib' + (wheel.free ? ' glow' : '')}>
            <WheelIco />
            {wheel.free && <span class="badge">1</span>}
          </div>
          Ruleta
        </button>
      </div>

      <div class="side-col right">
        <button class="side-btn" onClick={() => (p.level >= FEATURE_LEVEL.season ? go('season') : toast(`El pase se desbloquea en el nivel ${FEATURE_LEVEL.season}`))}>
          <div class={'ib' + (seasonN ? ' glow' : '')}>
            <PassIco />
            {seasonN > 0 && <span class="badge">{seasonN}</span>}
          </div>
          <span class="timer">{seasonTier(p.season.xp)}/{SEASON_TIERS}</span>
        </button>
        <button class="side-btn" onClick={() => openModal({ kind: 'freeChest' })}>
          <div class={'ib' + (freeN ? ' glow' : '')}>
            <GiftIco />
            {freeN > 0 && <span class="badge">{freeN}</span>}
          </div>
          <span class="timer">{freeN ? '¡Gratis!' : fmtTime((p.freeChestAt + (freeN ? FREE_CHEST_PERIOD : 0) - now) / 1000)}</span>
        </button>
        {starterAvailable && (
          <button class="side-btn" onClick={() => go('shop', { section: 'offers' })}>
            <div class="ib glow" style={{ background: 'linear-gradient(180deg,#ff9d00,#ff3d6a)' }}>
              <Gem />
              <span class="badge">-80%</span>
            </div>
            <span class="timer">{fmtTime((p.createdAt + 72 * 3600 * 1000 - now) / 1000)}</span>
          </button>
        )}
      </div>

      <HomeTutorial />
      <div class="play-area">
        <div class="play-row">
          <button class="btn big shine" onClick={play}>
            ¡JUGAR!
            <span class="sub">
              Entrada <Coin class="ico" /> {fmtNum(arena.entry)} · Premio <Coin class="ico" /> {fmtNum(arena.prize)}
            </span>
          </button>
          <button class="btn big blue online" onClick={playOnline}>
            <GlobeIco class="ico" />
            ONLINE
          </button>
        </div>
        <div class="slots">
          {p.chests.map((_, i) => (
            <ChestSlotView key={i} idx={i} now={now} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ChestSlotView({ idx, now }: { idx: number; now: number }) {
  const p = useStore(profileStore);
  const c = p.chests[idx];
  const st = slotState(c, now);
  if (!c) return <div class="slot">Hueco libre</div>;
  return (
    <button
      class={'slot full ' + st}
      onClick={() => {
        audio.click();
        if (st === 'ready') {
          const res = openSlot(idx);
          if (res) openChestReward(res.type, res.reward);
        } else openModal({ kind: 'chestSlot', idx });
      }}
    >
      <span class="arena-tag">A{c.arena + 1}</span>
      <ChestImg type={c.type} />
      <span class="lbl">
        {st === 'ready' && <b style={{ color: 'var(--gold)' }}>¡ABRIR!</b>}
        {st === 'unlocking' && (
          <>
            <Clock style={{ width: '11px', height: '11px', verticalAlign: '-1px' }} /> {fmtTime((c.readyAt! - now) / 1000)}
          </>
        )}
        {st === 'locked' && (
          <>
            {fmtTime(CHESTS[c.type].duration)} · <Gem style={{ width: '11px', height: '11px', verticalAlign: '-1px' }} />
            {skipCost(c, now)}
          </>
        )}
      </span>
    </button>
  );
}

function NoCoins({ arenaId }: { arenaId: number }) {
  const lower = Math.max(0, arenaId - 1);
  return (
    <div class="col" style={{ textAlign: 'center', alignItems: 'center' }}>
      <Coin style={{ width: '64px', height: '64px' }} />
      <div style={{ fontWeight: 800 }}>No tienes monedas suficientes para la entrada de {ARENAS[arenaId].name}.</div>
      <div class="muted" style={{ fontSize: '13px' }}>Consigue monedas abriendo cofres, con la ruleta, las misiones o en la tienda.</div>
      <div class="row" style={{ width: '100%', marginTop: '8px' }}>
        {arenaId > 0 && (
          <button class="btn small gray grow" onClick={() => (mutate((p) => (p.selectedArena = lower)), closeModal(), toast(`Ahora juegas en ${ARENAS[lower].name}`, 'good'))}>
            Arena anterior
          </button>
        )}
        <button class="btn small gold grow" onClick={() => (closeModal(), go('shop', { section: 'coins' }))}>
          Tienda
        </button>
      </div>
    </div>
  );
}
