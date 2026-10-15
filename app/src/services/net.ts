// Cliente WebSocket para partidas online, clubes, amigos y clasificación.

import { PROTOCOL_VERSION, type ClientMsg, type PublicProfile, type ServerMsg } from '@shared/protocol';
import { Store } from '../core/store';
import { mutate, profile, type Profile } from '../meta/profile';

export type NetStatus = 'disabled' | 'offline' | 'connecting' | 'online';

export const netStatus = new Store<NetStatus>('disabled');
export const onlineCount = new Store<number>(0);

type Handler = (m: ServerMsg) => void;

export function publicProfile(p: Profile = profile()): PublicProfile {
  return {
    id: p.serverId ?? p.id,
    name: p.name,
    level: p.level,
    trophies: p.trophies,
    avatar: p.avatar,
    dart: p.equipped,
    club: p.club,
    wins: p.stats.wins,
    avg: p.stats.matches ? Math.round(((p.stats.points / Math.max(1, p.stats.darts)) * 3) * 10) / 10 : 0,
    country: p.country,
  };
}

class Net {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private retry = 0;
  private url = '';
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private wanted = false;

  serverUrl(): string {
    return (profile().settings.serverUrl || (import.meta.env.VITE_SERVER_URL as string | undefined) || '').trim();
  }

  enabled(): boolean {
    return !!this.serverUrl();
  }

  connect() {
    this.url = this.serverUrl();
    if (!this.url) {
      netStatus.set('disabled');
      return;
    }
    this.wanted = true;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    netStatus.set('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      netStatus.set('offline');
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return ws.close();
      this.retry = 0;
      const p = profile();
      this.send({ t: 'hello', id: p.serverId, token: p.token, profile: publicProfile(p), version: PROTOCOL_VERSION });
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ t: 'ping' }), 20000);
    };
    ws.onmessage = (ev) => {
      // mensajes de un socket antiguo (p. ej. tras cambiar de servidor) se ignoran
      if (this.ws !== ws) return;
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (msg.t === 'welcome') {
        mutate((p) => {
          p.serverId = msg.id;
          p.token = msg.token;
        });
        onlineCount.set(msg.online);
        netStatus.set('online');
      }
      if (msg.t === 'pong') onlineCount.set(msg.online);
      this.handlers.get(msg.t)?.forEach((h) => h(msg));
      this.handlers.get('*')?.forEach((h) => h(msg));
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.ws = null;
      netStatus.set('offline');
      this.handlers.get('close')?.forEach((h) => h({ t: 'error', code: 'closed', msg: 'Conexión perdida' }));
      if (this.wanted) this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  private scheduleReconnect() {
    const delay = Math.min(30000, 1000 * Math.pow(2, this.retry++));
    setTimeout(() => this.wanted && this.connect(), delay);
  }

  disconnect() {
    this.wanted = false;
    this.ws?.close();
  }

  get online() {
    return netStatus.get() === 'online';
  }

  send(m: ClientMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  on<T extends ServerMsg['t'] | '*' | 'close'>(type: T, h: (m: Extract<ServerMsg, { t: T }>) => void): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(h as Handler);
    return () => set!.delete(h as Handler);
  }

  /** Envía y espera una respuesta de cierto tipo. */
  request<T extends ServerMsg['t']>(m: ClientMsg, reply: T, timeout = 8000): Promise<Extract<ServerMsg, { t: T }>> {
    return new Promise((resolve, reject) => {
      if (!this.online) return reject(new Error('offline'));
      const off = this.on(reply, (msg) => {
        clearTimeout(timer);
        off();
        offErr();
        resolve(msg);
      });
      const offErr = this.on('error', (msg) => {
        clearTimeout(timer);
        off();
        offErr();
        reject(new Error(msg.msg));
      });
      const timer = setTimeout(() => {
        off();
        offErr();
        reject(new Error('timeout'));
      }, timeout);
      this.send(m);
    });
  }

  syncProfile() {
    if (this.online) this.send({ t: 'profile', profile: publicProfile() });
  }
}

export const net = new Net();
