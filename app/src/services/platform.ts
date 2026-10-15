// Integración con el sistema: barra de estado, splash, botón atrás de Android, pausa en segundo plano.

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Share } from '@capacitor/share';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform();

export async function initPlatform(handlers: { onBack: () => boolean; onPause: () => void; onResume: () => void }) {
  document.addEventListener('visibilitychange', () => (document.hidden ? handlers.onPause() : handlers.onResume()));
  if (!isNative) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    if (platform === 'android') await StatusBar.setOverlaysWebView({ overlay: true });
  } catch {
    /* sin barra de estado */
  }
  App.addListener('backButton', () => {
    if (!handlers.onBack()) void App.minimizeApp();
  });
  App.addListener('pause', handlers.onPause);
  App.addListener('resume', handlers.onResume);
}

export async function hideSplash() {
  if (isNative) await SplashScreen.hide().catch(() => undefined);
}

export async function shareText(title: string, text: string, url?: string) {
  try {
    if (isNative) await Share.share({ title, text, url, dialogTitle: title });
    else if (navigator.share) await navigator.share({ title, text, url });
    else await navigator.clipboard?.writeText(text + (url ? ' ' + url : ''));
    return true;
  } catch {
    return false;
  }
}
