// Almacén observable mínimo con hook de Preact.

import { useEffect, useState } from 'preact/hooks';

export class Store<T> {
  private listeners = new Set<(v: T) => void>();
  version = 0;
  constructor(private value: T) {}
  get(): T {
    return this.value;
  }
  set(v: T) {
    this.value = v;
    this.emit();
  }
  /** Muta el valor en el sitio y notifica. */
  update(fn: (v: T) => void) {
    fn(this.value);
    this.emit();
  }
  emit() {
    this.version++;
    for (const l of this.listeners) l(this.value);
  }
  subscribe(fn: (v: T) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

/** Re-renderiza el componente cuando cambia el store. */
export function useStore<T>(store: Store<T>): T {
  const [, force] = useState(0);
  const seen = store.version;
  useEffect(() => {
    // si cambió entre el render y la suscripción, re-renderizamos
    if (store.version !== seen) force((n) => n + 1);
    return store.subscribe(() => force((n) => n + 1));
  }, [store]);
  return store.get();
}

/** Hook de reloj (para temporizadores de cofres, ofertas...). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function fmtTime(sec: number): string {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

export function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace('.0', '') + 'M';
  if (n >= 10_000) return (n / 1000).toFixed(n >= 100_000 ? 0 : 1).replace('.0', '') + 'K';
  return n.toLocaleString('es-ES');
}

export function dayKey(t = Date.now()): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
