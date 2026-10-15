// Raíz de la interfaz: barra superior, navegación, pantallas, modales y capas.

import { useEffect, useRef } from 'preact/hooks';
import { useStore } from '../core/store';
import { profileStore } from '../meta/profile';
import { xpForNext } from '../meta/progression';
import { ui, go, openModal, type ScreenName } from './state';
import { IconDefs, Coin, Gem, Gear, ShopIco, DartIco, TargetIco, SocialIco, EventsIco, Plus } from './icons';
import { AvatarImg } from './components/common';
import { fmtNum, dayKey } from '../core/store';
import { engine } from '../engine/renderer';
import { gameView } from '../engine/gameView';
import { previewView } from '../engine/previewView';
import { avatarView } from '../engine/avatar';
import { chestView } from '../engine/chestView';
import { matchStore } from '../game/match';
import { audio } from '../services/audio';
import { Home } from './screens/Home';
import { Collection } from './screens/Collection';
import { Shop } from './screens/Shop';
import { Social } from './screens/Social';
import { Events } from './screens/Events';
import { Profile } from './screens/Profile';
import { AvatarEditor } from './screens/AvatarEditor';
import { Season } from './screens/Season';
import { Game } from './screens/Game';
import { Matchmaking } from './screens/Matchmaking';
import { Tournament } from './screens/Tournament';
import { Onboarding } from './screens/Onboarding';
import { LiveEvent } from './screens/LiveEvent';
import { ModalHost } from './overlays/Modals';
import { ChestOpen } from './overlays/ChestOpen';
import { MockLayers } from './overlays/Mocks';
import { BannerHost } from './components/Banners';
import { upgradeInfo, dailyAvailable, freeChestsAvailable } from '../meta/economy';
import { ALL_ITEMS } from '../meta/catalog';
import { claimableAchievements, FEATURE_LEVEL } from '../meta/progression';
import { eventClaimable } from '../meta/events';

const NAV: { id: ScreenName; label: string; Icon: typeof ShopIco }[] = [
  { id: 'shop', label: 'Tienda', Icon: ShopIco },
  { id: 'collection', label: 'Dardos', Icon: DartIco },
  { id: 'home', label: 'Jugar', Icon: TargetIco },
  { id: 'social', label: 'Social', Icon: SocialIco },
  { id: 'events', label: 'Eventos', Icon: EventsIco },
];

const NO_CHROME: ScreenName[] = ['game', 'matchmaking', 'onboarding', 'avatar', 'profile', 'season'];
const NO_NAV: ScreenName[] = [...NO_CHROME, 'profile', 'season', 'tournament', 'liveEvent'];

export function App() {
  const s = useStore(ui);
  const m = useStore(matchStore);
  const p = useStore(profileStore);

  // Escena 3D de fondo según la pantalla
  useEffect(() => {
    if (s.chest) {
      engine.setView(chestView());
      return;
    }
    if (s.screen === 'game') return; // la partida gestiona su vista
    if (s.screen === 'collection') {
      const v = previewView();
      engine.setView(v);
      return;
    }
    if (s.screen === 'profile' || s.screen === 'avatar') {
      const v = avatarView();
      v.set(p.avatar);
      engine.setView(v);
      return;
    }
    const v = gameView();
    if (v.mode !== 'menu' || v.isAiming) v.setMenuMode(true);
    // dardos de exhibición en el fondo del inicio
    v.attract = s.screen === 'home' && !!p.tutorial.done;
    v.setArena(p.selectedArena);
    v.setBoardStyle(p.boardSkin as 'classic');
    v.setDecorLook(p.equipped);
    engine.setView(v);
    audio.startMusic();
  }, [s.screen, !!s.chest, p.selectedArena, p.boardSkin]);

  const chrome = !NO_CHROME.includes(s.screen) && !s.chest;
  const nav = !NO_NAV.includes(s.screen) && !s.chest;

  return (
    <>
      <IconDefs />
      {!s.chest && <Screen name={s.screen} />}
      {chrome && <TopBar />}
      {nav && <Nav current={s.screen} />}
      {m && s.screen === 'game' ? null : null}
      {s.chest && <ChestOpen />}
      <ModalHost />
      <BannerHost />
      <div class="toast-wrap">
        {s.toasts.map((t) => (
          <div key={t.id} class={'toast ' + t.kind}>
            {t.text}
          </div>
        ))}
      </div>
      <MockLayers />
    </>
  );
}

function Screen({ name }: { name: ScreenName }) {
  switch (name) {
    case 'home':
      return <Home />;
    case 'collection':
      return <Collection />;
    case 'shop':
      return <Shop />;
    case 'social':
      return <Social />;
    case 'events':
      return <Events />;
    case 'profile':
      return <Profile />;
    case 'avatar':
      return <AvatarEditor />;
    case 'season':
      return <Season />;
    case 'game':
      return <Game />;
    case 'matchmaking':
      return <Matchmaking />;
    case 'tournament':
      return <Tournament />;
    case 'onboarding':
      return <Onboarding />;
    case 'liveEvent':
      return <LiveEvent />;
  }
}

function TopBar() {
  const p = useStore(profileStore);
  const s = useStore(ui);
  const need = xpForNext(p.level);
  const coinRef = useRef<HTMLDivElement>(null);
  const gemRef = useRef<HTMLDivElement>(null);
  const flash = (el: HTMLDivElement | null) => {
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  };
  useEffect(() => flash(coinRef.current), [s.bump.coins, Math.floor(p.coins)]);
  useEffect(() => flash(gemRef.current), [s.bump.gems, p.gems]);
  return (
    <div class="topbar">
      <button class="player-chip" onClick={() => (audio.click(), go('profile'))}>
        <div class="av">
          <AvatarImg cfg={p.avatar} size={96} />
          <span class="lvl-badge">{p.level}</span>
        </div>
        <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
          <div style={{ fontWeight: 900, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
          <div class="xpbar">
            <i style={{ width: Math.min(100, (p.xp / need) * 100) + '%' }} />
          </div>
        </div>
      </button>
      <div class="currency" ref={coinRef}>
        <Coin class="ico" />
        <span class="val">{fmtNum(p.coins)}</span>
        <button class="plus" onClick={() => (audio.click(), go('shop', { section: 'coins' }))} aria-label="Conseguir monedas">
          <Plus style={{ width: '14px', height: '14px' }} />
        </button>
      </div>
      <div class="currency" ref={gemRef}>
        <Gem class="ico" />
        <span class="val">{fmtNum(p.gems)}</span>
        <button class="plus" onClick={() => (audio.click(), go('shop', { section: 'gems' }))} aria-label="Conseguir gemas">
          <Plus style={{ width: '14px', height: '14px' }} />
        </button>
      </div>
      <button class="icon-btn" onClick={() => openModal({ kind: 'settings' })} aria-label="Ajustes">
        <Gear />
      </button>
    </div>
  );
}

function Nav({ current }: { current: ScreenName }) {
  const p = useStore(profileStore);
  const upgrades = ALL_ITEMS.filter((i) => upgradeInfo(p, i.id).can).length;
  const shopBadge = p.shop.offers.some((o) => o.kind === 'free' && !o.bought) ? 1 : 0;
  const homeBadge = (dailyAvailable(p) ? 1 : 0) + p.missions.list.filter((m) => !m.claimed && m.progress >= m.target).length + (freeChestsAvailable(p) > 0 ? 1 : 0);
  const eventsBadge = p.level >= 2 ? (p.challenge.day !== dayKey() ? 1 : 0) + (p.level >= FEATURE_LEVEL.liveEvent ? eventClaimable() : 0) : 0;
  const socialBadge = claimableAchievements(p).length ? 0 : 0;
  const badges: Record<string, number> = { shop: shopBadge, collection: upgrades, home: current === 'home' ? 0 : homeBadge, events: eventsBadge, social: socialBadge };
  return (
    <nav class="nav">
      {NAV.map((n) => (
        <button key={n.id} class={current === n.id ? 'on' : ''} onClick={() => (audio.click(), go(n.id))}>
          <n.Icon />
          {n.label}
          {badges[n.id] > 0 && <span class="badge">{badges[n.id]}</span>}
        </button>
      ))}
    </nav>
  );
}
