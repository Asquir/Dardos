import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { targetPoint } from '../shared/board';
import type { ServerMsg } from '../shared/protocol';

const PORT = 18000 + Math.floor(Math.random() * 1000);
let proc: ChildProcess;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diana-'));

class Client {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  waiters: { t: string; res: (m: ServerMsg) => void; pred?: (m: ServerMsg) => boolean }[] = [];
  constructor() {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      const w = this.waiters.find((x) => x.t === m.t && (!x.pred || x.pred(m)));
      if (w) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.res(m);
      } else this.msgs.push(m);
    });
  }
  open() {
    return new Promise<void>((r) => this.ws.once('open', () => r()));
  }
  send(m: object) {
    this.ws.send(JSON.stringify(m));
  }
  next<T extends ServerMsg['t']>(t: T, pred?: (m: Extract<ServerMsg, { t: T }>) => boolean, timeout = 5000): Promise<Extract<ServerMsg, { t: T }>> {
    const i = this.msgs.findIndex((m) => m.t === t && (!pred || pred(m as never)));
    if (i >= 0) return Promise.resolve(this.msgs.splice(i, 1)[0] as never);
    return new Promise((res, rej) => {
      this.waiters.push({ t, res: res as never, pred: pred as never });
      setTimeout(() => rej(new Error('timeout esperando ' + t)), timeout);
    });
  }
  async hello(name: string, id?: string, token?: string) {
    this.send({ t: 'hello', id, token, version: '1', profile: { id: '', name, level: 5, trophies: 500, avatar: {}, dart: {} } });
    return this.next('welcome');
  }
}

beforeAll(async () => {
  proc = spawn('npx', ['tsx', 'server/src/index.ts'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, TURN_SECONDS: '2', GRACE_SECONDS: '2' }, stdio: 'pipe' });
  await new Promise<void>((res) => {
    proc.stdout!.on('data', (d) => String(d).includes('escuchando') && res());
  });
}, 30000);

afterAll(() => {
  proc?.kill();
});

describe('servidor online', () => {
  it('empareja, arbitra la partida y reparte copas', async () => {
    const a = new Client();
    const b = new Client();
    await Promise.all([a.open(), b.open()]);
    const wa = await a.hello('Ana');
    const wb = await b.hello('Beto');
    expect(wa.id).toHaveLength(8);
    expect(wa.id).not.toBe(wb.id);
    a.send({ t: 'queue', arena: 2, config: { mode: 'x01', start: 101, doubleOut: false } });
    b.send({ t: 'queue', arena: 2, config: { mode: 'x01', start: 101, doubleOut: false } });
    const [sa, sb] = await Promise.all([a.next('match_start'), b.next('match_start')]);
    expect(sa.matchId).toBe(sb.matchId);
    expect(sa.you + sb.you).toBe(1);
    expect(sa.ranked).toBe(true);
    const first = sa.state.current === sa.you ? a : b;
    const other = first === a ? b : a;
    // un turno que no es tuyo se rechaza
    other.send({ t: 'throw', x: 0, y: 0, bounce: false });
    await other.next('error');
    // 101 = T20 + T7 + 20 (sin doble obligatorio)
    for (const t of ['T20', 'T7', 'S20']) {
      const pt = targetPoint(t);
      first.send({ t: 'throw', x: pt.x, y: pt.y, bounce: false });
      const st = await first.next('state');
      expect(st.last?.hit.label).toBe(t === 'S20' ? '20' : t);
    }
    const end = await Promise.all([first.next('match_end'), other.next('match_end')]);
    expect(end[0].winner).toBe(first === a ? sa.you : sb.you);
    expect(end[0].trophies[end[0].winner]).toBeGreaterThan(0);
    expect(end[0].trophies[1 - end[0].winner]).toBeLessThan(0);
    a.ws.close();
    b.ws.close();
  }, 20000);

  it('turno agotado y abandono por desconexión', async () => {
    const a = new Client();
    const b = new Client();
    await Promise.all([a.open(), b.open()]);
    await a.hello('Carla');
    await b.hello('Dani');
    a.send({ t: 'queue', arena: 0, config: { mode: 'x01', start: 301 } });
    b.send({ t: 'queue', arena: 0, config: { mode: 'x01', start: 301 } });
    const sa = await a.next('match_start');
    await b.next('match_start');
    const st = await a.next('state', (m) => !!m.timeout, 8000);
    expect(st.timeout).toBe(true);
    expect(st.state.current).not.toBe(sa.state.current);
    const loser = a;
    loser.ws.close();
    const end = await b.next('match_end', undefined, 8000);
    expect(end.reason).toBe('disconnect');
    b.ws.close();
  }, 20000);

  it('salas privadas, clubes, chat, amigos y ranking', async () => {
    const a = new Client();
    const b = new Client();
    await Promise.all([a.open(), b.open()]);
    const wa = await a.hello('Eva');
    const wb = await b.hello('Fran');
    a.send({ t: 'room_create', config: { mode: 'cricket' } });
    const room = await a.next('room_created');
    b.send({ t: 'room_join', code: room.code });
    const ms = await b.next('match_start');
    expect(ms.ranked).toBe(false);
    expect(ms.config.mode).toBe('cricket');
    a.send({ t: 'leave' });
    await b.next('match_end');

    a.send({ t: 'club_create', name: 'Los Toros', tag: 'TOR', emblem: 1, desc: 'Hola', minTrophies: 0 });
    const c1 = await a.next('club');
    expect(c1.club?.name).toBe('Los Toros');
    b.send({ t: 'club_list', q: 'toros' });
    const list = await b.next('club_list');
    expect(list.clubs[0].tag).toBe('TOR');
    b.send({ t: 'club_join', id: list.clubs[0].id });
    const c2 = await b.next('club');
    expect(c2.club?.membersList.length).toBe(2);
    b.send({ t: 'club_chat', text: 'hola mierda' });
    const msg = await a.next('club_msg', (m) => !m.msg.system);
    expect(msg.msg.text).toBe('hola m*****'); // filtro de palabras
    a.send({ t: 'friends', ids: [wb.id] });
    const fr = await a.next('friends');
    expect(fr.list[0].online).toBe(true);
    a.send({ t: 'leaderboard' });
    const lb = await a.next('leaderboard');
    expect(lb.top.length).toBeGreaterThan(0);
    expect(lb.rank).toBeGreaterThan(0);
    // reconexión con token
    a.ws.close();
    const a2 = new Client();
    await a2.open();
    const w2 = await a2.hello('Eva', wa.id, wa.token);
    expect(w2.id).toBe(wa.id);
    a2.send({ t: 'delete_account' });
    await a2.next('deleted');
    a2.ws.close();
    b.ws.close();
  }, 20000);
});
