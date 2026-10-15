// Punto de entrada: carga el perfil, prepara el motor 3D y los servicios y monta la interfaz.

import { render } from 'preact';
import '@fontsource/lilita-one/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './styles/main.css';
import { loadProfile, profile, saveNow } from './meta/profile';
import { ensureDaily } from './meta/economy';
import { engine, type Quality } from './engine/renderer';
import { gameView } from './engine/gameView';
import { audio } from './services/audio';
import { haptics } from './services/haptics';
import { ads } from './services/ads';
import { iap } from './services/iap';
import { net } from './services/net';
import { initPlatform, hideSplash } from './services/platform';
import { ui, go, closeModal } from './ui/state';
import { App } from './ui/App';
import { currentMatch } from './game/match';
import { initOnlineHandlers } from './game/online';
import { startAlerts, syncNotifications } from './ui/alerts';

const splash = document.getElementById('splash');
const bar = document.getElementById('splash-bar');
const progress = (v: number) => {
  if (bar) bar.style.width = Math.round(v * 100) + '%';
};
const DEBUG = location.search.includes('debug');
const T0 = performance.now();
const mark = (n: string) => DEBUG && console.info(`[arranque] ${n}: ${Math.round(performance.now() - T0)} ms`);
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

function autoQuality(): Quality {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  if (cores <= 4 || mem <= 3) return 'medium';
  return 'high';
}

async function boot() {
  progress(0.1);
  await document.fonts.load('40px "Lilita One"').catch(() => undefined);
  mark('fuentes');
  const p = await loadProfile();
  mark('perfil');
  progress(0.25);
  const forced = new URLSearchParams(location.search).get('q') as Quality | null;
  const q = forced ?? (p.settings.quality === 'auto' ? autoQuality() : p.settings.quality);
  engine.init(document.getElementById('gl') as HTMLCanvasElement, q);
  engine.onQualityDrop = (nq) => console.info('Calidad ajustada automáticamente a', nq);
  mark('motor');
  await frame();
  // genera texturas y la escena principal (lo más pesado)
  const v = gameView();
  mark('diana');
  progress(0.55);
  await frame();
  v.setArena(p.selectedArena);
  v.setBoardStyle(p.boardSkin as 'classic');
  v.setMenuMode(true);
  engine.setView(v);
  engine.start();
  mark('arena');
  progress(0.8);
  ensureDaily();
  audio.setVolumes(p.settings.sfx, p.settings.music);
  audio.voice = p.settings.voice;
  haptics.setEnabled(p.settings.vibration);
  const unlock = () => {
    audio.unlock();
    audio.startMusic();
  };
  window.addEventListener('pointerdown', unlock, { once: false, passive: true });
  // pequeña vibración al pulsar botones
  document.addEventListener(
    'pointerdown',
    (e) => {
      if ((e.target as HTMLElement).closest?.('.btn, .nav button, .side-btn, .icon-btn, .av-groups button')) haptics.light();
    },
    { passive: true },
  );
  await initPlatform({
    onBack: () => {
      const s = ui.get();
      if (s.modals.length) {
        closeModal();
        return true;
      }
      if (s.chest) return true;
      if (s.screen === 'game') {
        ui.update((st) => (st.modals = [...st.modals, { kind: 'pause' }]));
        return true;
      }
      if (s.screen !== 'home' && s.screen !== 'onboarding') {
        go('home');
        return true;
      }
      return false;
    },
    onPause: () => {
      engine.paused = true;
      audio.suspend();
      void saveNow();
      syncNotifications(true);
    },
    onResume: () => {
      engine.paused = false;
      audio.resume();
      ensureDaily();
      if (net.enabled()) net.connect();
    },
  });
  if (!p.tutorial.done && !p.tutorial.tips.includes('match')) go('onboarding');
  render(<App />, document.getElementById('app')!);
  mark('interfaz');
  progress(1);
  await frame();
  splash?.classList.add('hide');
  setTimeout(() => splash?.remove(), 600);
  void hideSplash();
  // servicios externos sin bloquear el arranque
  void ads.init(p.settings.personalizedAds);
  void iap.init(p.id);
  initOnlineHandlers();
  startAlerts();
  if (net.enabled()) net.connect();
  setInterval(() => ensureDaily(), 60_000);
  (window as unknown as { __diana: unknown }).__diana = { profile, go, currentMatch, engine, gameView, ui };
}

boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('splash-msg');
  if (el) el.textContent = 'Error al iniciar: ' + (e as Error).message;
});
