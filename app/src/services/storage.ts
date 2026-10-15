// Persistencia local: Capacitor Preferences en el móvil (no se borra con la caché del WebView)
// y localStorage en el navegador.

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const native = Capacitor.isNativePlatform();

export async function loadJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = native ? (await Preferences.get({ key })).value : localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function saveJSON(key: string, value: unknown): Promise<void> {
  try {
    const raw = JSON.stringify(value);
    if (native) await Preferences.set({ key, value: raw });
    else localStorage.setItem(key, raw);
  } catch {
    /* almacenamiento lleno o bloqueado: seguimos en memoria */
  }
}

export async function removeKey(key: string): Promise<void> {
  try {
    if (native) await Preferences.remove({ key });
    else localStorage.removeItem(key);
  } catch {
    /* nada */
  }
}
