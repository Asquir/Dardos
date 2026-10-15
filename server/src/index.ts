// Servidor online de Diana Legends: cuentas de invitado, emparejamiento, partidas arbitradas,
// salas privadas, clubes con chat, amigos y clasificación. Persistencia en un archivo JSON.
//
//   PORT=8080 DATA_DIR=./data npm start

import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { applyThrow, createMatch, forfeitTurn, normalizeConfig, type MatchConfig, type MatchState } from '../../shared/rules.ts';
import { makeHit, scoreAt, wireDistance, type Hit } from '../../shared/board.ts';
import { trophyDelta, type ClientMsg, type ClubDetail, type ClubMember, type ClubMessage, type ClubSummary, type PublicProfile, type ServerMsg } from '../../shared/protocol.ts';
import { censor, cleanName } from '../../shared/text.ts';
import { Db } from './db.ts';

const PORT = Number(process.env.PORT ?? 8080);
const TURN_SECONDS = Number(process.env.TURN_SECONDS ?? 25);
const GRACE_SECONDS = Number(process.env.GRACE_SECONDS ?? 30);
const db = new Db(process.env.DATA_DIR ?? './data');

// ------------------------------------------------------------------ conexiones

interface Conn {
  ws: WebSocket;
  id: string | null;
  profile: PublicProfile | null;
  match: Match | null;
  queuedArena: number | null;
  queuedAt: number;
  queuedConfig: MatchConfig | null;
  room: string | null;
  msgTimes: number[];
  lastChat: number;
}

const conns = new Set<Conn>();
const byId = new Map<string, Conn>();

function send(c: Conn | null | undefined, m: ServerMsg) {
  if (c && c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(m));
}

function err(c: Conn, code: string, msg: string) {
  send(c, { t: 'error', code, msg });
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function code(n: number): string {
  const b = randomBytes(n);
  return Array.from(b, (x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// ------------------------------------------------------------------ validación de perfiles

const num = (v: unknown, min: number, max: number, def = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : def);
const str = (v: unknown, max: number, def = '') => (typeof v === 'string' ? v.slice(0, max) : def);

function sanitizeProfile(p: Partial<PublicProfile> | undefined, id: string): PublicProfile {
  const a = (p?.avatar ?? {}) as Partial<PublicProfile['avatar']>;
  const d = (p?.dart ?? {}) as Partial<PublicProfile['dart']>;
  const prev = db.players[id]?.profile;
  return {
    id,
    name: cleanName(str(p?.name, 16)) || 'Jugador',
    level: num(p?.level, 1, 999, 1),
    // las copas online las decide el servidor; aceptamos las del cliente solo la primera vez
    trophies: prev ? prev.trophies : num(p?.trophies, 0, 4000, 0),
    avatar: {
      skin: num(a.skin, 0, 20),
      hair: str(a.hair, 16, 'short'),
      hairColor: num(a.hairColor, 0, 20),
      eyes: num(a.eyes, 0, 20),
      beard: str(a.beard, 16, 'none'),
      glasses: str(a.glasses, 16, 'none'),
      hat: str(a.hat, 16, 'none'),
      shirt: str(a.shirt, 16, 'polo'),
      shirtColor: num(a.shirtColor, 0, 20),
      number: num(a.number, 0, 99, 7),
    },
    dart: { barrel: str(d.barrel, 24, 'b_brass'), shaft: str(d.shaft, 24, 's_nylon_w'), flight: str(d.flight, 24, 'f_red') },
    club: null,
    wins: num(p?.wins, 0, 1e7),
    avg: typeof p?.avg === 'number' ? Math.max(0, Math.min(180, p.avg)) : 0,
    country: str(p?.country, 3, ''),
  };
}

function publicOf(id: string): PublicProfile | null {
  const rec = db.players[id];
  if (!rec) return null;
  const club = rec.clubId ? db.clubs[rec.clubId] : null;
  return { ...rec.profile, club: club ? { id: club.id, name: club.name, tag: club.tag, emblem: club.emblem } : null };
}

// ------------------------------------------------------------------ partidas

class Match {
  id = code(10);
  state: MatchState;
  deadline = 0;
  timer: ReturnType<typeof setTimeout> | null = null;
  grace: (ReturnType<typeof setTimeout> | null)[] = [null, null];
  ended = false;
  constructor(
    public players: [Conn, Conn],
    public ids: [string, string],
    public config: MatchConfig,
    public ranked: boolean,
    public arena: number,
  ) {
    const starter = Math.random() < 0.5 ? 0 : 1;
    this.state = createMatch(normalizeConfig(config), 2, starter);
  }

  start() {
    for (let i = 0; i < 2; i++) {
      this.players[i].match = this;
      this.sendStart(i);
    }
    this.armTimer();
  }

  sendStart(i: number) {
    const profiles = this.ids.map((id) => publicOf(id)!) as PublicProfile[];
    send(this.players[i], { t: 'match_start', matchId: this.id, config: this.config, you: i, players: profiles, state: this.state, ranked: this.ranked });
  }

  broadcast(m: ServerMsg) {
    for (const p of this.players) send(p, m);
  }

  armTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.deadline = Date.now() + TURN_SECONDS * 1000 + 3000; // margen para animaciones
    this.timer = setTimeout(() => this.timeout(), this.deadline - Date.now());
  }

  index(c: Conn) {
    return this.players.indexOf(c);
  }

  throw(c: Conn, x: number, y: number, bounce: boolean) {
    if (this.ended) return;
    const i = this.index(c);
    if (i < 0 || this.state.current !== i) return err(c, 'not_your_turn', 'No es tu turno');
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    x = Math.max(-999, Math.min(999, x));
    y = Math.max(-999, Math.min(999, y));
    // un rebote solo es posible cerca de un alambre
    let hit: Hit = scoreAt(x, y);
    if (bounce && wireDistance(x, y) < 1) hit = { ...makeHit(x, y, 'MISS', 0), bounce: true, label: 'REBOTE' };
    const prevTurn = this.state.current;
    const res = applyThrow(this.state, hit);
    this.state = res.state;
    if (this.state.current !== prevTurn || res.event !== 'dart') this.armTimer();
    this.broadcast({ t: 'state', state: this.state, last: { player: i, hit, event: res.event }, deadline: this.deadline });
    if (res.event === 'matchWon') this.end(i, 'win');
  }

  timeout() {
    if (this.ended) return;
    const p = this.state.current;
    const res = forfeitTurn(this.state, (k) => makeHit(999 + k, 999, 'MISS', 0));
    this.state = res.state;
    this.armTimer();
    this.broadcast({ t: 'state', state: this.state, last: { player: p, hit: makeHit(999, 999, 'MISS', 0), event: res.event }, deadline: this.deadline, timeout: true });
  }

  disconnected(c: Conn) {
    const i = this.index(c);
    if (i < 0 || this.ended) return;
    send(this.players[1 - i], { t: 'opponent_status', connected: false });
    this.grace[i] = setTimeout(() => this.end(1 - i, 'disconnect'), GRACE_SECONDS * 1000);
  }

  reconnected(i: number, c: Conn) {
    this.players[i] = c;
    c.match = this;
    if (this.grace[i]) clearTimeout(this.grace[i]!);
    this.grace[i] = null;
    send(this.players[1 - i], { t: 'opponent_status', connected: true });
    this.sendStart(i);
  }

  leave(c: Conn) {
    const i = this.index(c);
    if (i >= 0) this.end(1 - i, 'forfeit');
  }

  end(winner: number, reason: 'win' | 'forfeit' | 'disconnect') {
    if (this.ended) return;
    this.ended = true;
    if (this.timer) clearTimeout(this.timer);
    for (const g of this.grace) if (g) clearTimeout(g);
    const trophies = [0, 0];
    if (this.ranked) {
      const w = db.players[this.ids[winner]];
      const l = db.players[this.ids[1 - winner]];
      if (w && l) {
        const d = trophyDelta(w.profile.trophies, l.profile.trophies);
        trophies[winner] = d.win;
        trophies[1 - winner] = -d.lose;
        w.profile.trophies += d.win;
        l.profile.trophies = Math.max(0, l.profile.trophies - d.lose);
        w.profile.wins = (w.profile.wins ?? 0) + 1;
        const club = w.clubId ? db.clubs[w.clubId] : null;
        if (club) {
          db.rollWeek(club);
          club.weeklyWins++;
        }
        db.save();
      }
    }
    this.broadcast({ t: 'match_end', winner, reason, trophies });
    for (const p of this.players) if (p.match === this) p.match = null;
    matches.delete(this.id);
  }
}

const matches = new Map<string, Match>();

function startMatch(a: Conn, b: Conn, config: MatchConfig, ranked: boolean, arena: number) {
  a.queuedArena = b.queuedArena = null;
  const m = new Match([a, b], [a.id!, b.id!], config, ranked, arena);
  matches.set(m.id, m);
  m.start();
}

// emparejamiento: misma arena y copas parecidas (la ventana crece con la espera)
setInterval(() => {
  const waiting = [...conns].filter((c) => c.queuedArena !== null && !c.match && c.ws.readyState === WebSocket.OPEN);
  const used = new Set<Conn>();
  for (const a of waiting) {
    if (used.has(a)) continue;
    let best: Conn | null = null;
    let bestDiff = Infinity;
    for (const b of waiting) {
      if (b === a || used.has(b) || b.queuedArena !== a.queuedArena) continue;
      const wait = (Date.now() - Math.min(a.queuedAt, b.queuedAt)) / 1000;
      const diff = Math.abs((a.profile?.trophies ?? 0) - (b.profile?.trophies ?? 0));
      if (diff <= 120 + wait * 25 && diff < bestDiff) {
        best = b;
        bestDiff = diff;
      }
    }
    if (best) {
      used.add(a).add(best);
      startMatch(a, best, a.queuedConfig ?? { mode: 'x01', start: 501, doubleOut: true }, true, a.queuedArena!);
    }
  }
  for (const c of waiting) if (!used.has(c)) send(c, { t: 'queue_status', waiting: waiting.length, elapsed: Math.round((Date.now() - c.queuedAt) / 1000) });
}, 1000);

// ------------------------------------------------------------------ salas privadas

const rooms = new Map<string, { host: Conn; config: MatchConfig; at: number }>();
setInterval(() => {
  for (const [k, r] of rooms) if (Date.now() - r.at > 30 * 60_000 || r.host.ws.readyState !== WebSocket.OPEN) rooms.delete(k);
}, 60_000);

function safeConfig(c: Partial<MatchConfig> | undefined): MatchConfig {
  const mode = c?.mode === 'cricket' || c?.mode === 'atc' ? c.mode : 'x01';
  const start = c?.start && [101, 301, 501, 701].includes(c.start) ? c.start : 501;
  return { mode, start, doubleOut: c?.doubleOut !== false, legsToWin: num(c?.legsToWin, 1, 3, 1) };
}

// ------------------------------------------------------------------ clubes

function clubSummary(id: string): ClubSummary | null {
  const c = db.clubs[id];
  if (!c) return null;
  const trophies = c.members.reduce((a, m) => a + (db.players[m.id]?.profile.trophies ?? 0), 0);
  return { id: c.id, name: c.name, tag: c.tag, emblem: c.emblem, desc: c.desc, members: c.members.length, trophies, minTrophies: c.minTrophies };
}

function clubDetail(id: string): ClubDetail | null {
  const c = db.clubs[id];
  const s = clubSummary(id);
  if (!c || !s) return null;
  db.rollWeek(c);
  const membersList: ClubMember[] = c.members.map((m) => {
    const p = db.players[m.id]?.profile;
    return { id: m.id, name: p?.name ?? '?', level: p?.level ?? 1, trophies: p?.trophies ?? 0, role: m.role, online: byId.has(m.id), avatar: p?.avatar ?? sanitizeProfile(undefined, m.id).avatar };
  });
  return { ...s, membersList, chat: c.chat.slice(-60), weeklyWins: c.weeklyWins };
}

function clubPost(clubId: string, msg: ClubMessage) {
  const c = db.clubs[clubId];
  if (!c) return;
  c.chat.push(msg);
  if (c.chat.length > 150) c.chat.splice(0, c.chat.length - 150);
  db.save();
  for (const m of c.members) send(byId.get(m.id), { t: 'club_msg', msg });
}

function sysMsg(clubId: string, text: string) {
  clubPost(clubId, { id: code(8), from: 'system', name: '', text, at: Date.now(), system: true });
}

function leaveClub(playerId: string) {
  const rec = db.players[playerId];
  if (!rec?.clubId) return;
  const c = db.clubs[rec.clubId];
  rec.clubId = undefined;
  if (!c) return;
  const wasLeader = c.members.find((m) => m.id === playerId)?.role === 'leader';
  c.members = c.members.filter((m) => m.id !== playerId);
  if (!c.members.length) {
    delete db.clubs[c.id];
  } else {
    if (wasLeader) c.members.sort((a, b) => a.joinedAt - b.joinedAt)[0].role = 'leader';
    sysMsg(c.id, `${rec.profile.name} ha salido del club`);
  }
  db.save();
}

// ------------------------------------------------------------------ clasificación

let lbCache: { at: number; list: PublicProfile[] } = { at: 0, list: [] };
function leaderboard(): PublicProfile[] {
  if (Date.now() - lbCache.at < 15_000) return lbCache.list;
  const list = Object.keys(db.players)
    .map((id) => publicOf(id)!)
    .sort((a, b) => b.trophies - a.trophies);
  lbCache = { at: Date.now(), list };
  return list;
}

// ------------------------------------------------------------------ mensajes

function handle(c: Conn, m: ClientMsg) {
  if (m.t !== 'hello' && !c.id) return err(c, 'no_auth', 'Saluda primero');
  switch (m.t) {
    case 'hello': {
      let id = typeof m.id === 'string' ? m.id : '';
      let token = typeof m.token === 'string' ? m.token : '';
      const rec = id ? db.players[id] : undefined;
      if (!rec || rec.tokenHash !== sha(token)) {
        // cuenta nueva
        do id = code(8);
        while (db.players[id]);
        token = randomBytes(24).toString('hex');
        db.players[id] = { id, tokenHash: sha(token), profile: sanitizeProfile(m.profile, id), createdAt: Date.now(), lastSeen: Date.now() };
      } else {
        rec.profile = { ...sanitizeProfile(m.profile, id) };
        rec.lastSeen = Date.now();
      }
      // una sola conexión por cuenta
      const old = byId.get(id);
      if (old && old !== c) {
        old.id = null;
        old.ws.close(4000, 'replaced');
      }
      c.id = id;
      c.profile = publicOf(id);
      byId.set(id, c);
      db.save();
      send(c, { t: 'welcome', id, token, online: byId.size });
      // ¿estaba en una partida? la retomamos
      for (const mt of matches.values()) {
        const i = mt.ids.indexOf(id);
        if (i >= 0 && !mt.ended) mt.reconnected(i, c);
      }
      return;
    }
    case 'profile': {
      const rec = db.players[c.id!];
      if (!rec) return;
      rec.profile = sanitizeProfile(m.profile, c.id!);
      c.profile = publicOf(c.id!);
      db.save();
      return;
    }
    case 'ping':
      return send(c, { t: 'pong', online: byId.size });
    case 'queue':
      if (c.match) return err(c, 'in_match', 'Ya estás en una partida');
      c.queuedArena = num(m.arena, 0, 6);
      c.queuedAt = Date.now();
      c.queuedConfig = safeConfig(m.config);
      return;
    case 'cancel_queue':
      c.queuedArena = null;
      if (c.room) rooms.delete(c.room);
      c.room = null;
      return;
    case 'room_create': {
      let k: string;
      do k = code(6);
      while (rooms.has(k));
      rooms.set(k, { host: c, config: safeConfig(m.config), at: Date.now() });
      c.room = k;
      return send(c, { t: 'room_created', code: k });
    }
    case 'room_join': {
      const k = str(m.code, 8).toUpperCase();
      const r = rooms.get(k);
      if (!r || r.host.ws.readyState !== WebSocket.OPEN) return err(c, 'room_not_found', 'No existe ninguna sala con ese código');
      if (r.host === c) return err(c, 'room_self', 'No puedes unirte a tu propia sala');
      rooms.delete(k);
      r.host.room = null;
      return startMatch(r.host, c, r.config, false, 0);
    }
    case 'throw':
      return c.match?.throw(c, Number(m.x), Number(m.y), !!m.bounce);
    case 'emote': {
      const mt = c.match;
      if (!mt) return;
      const i = mt.index(c);
      return mt.broadcast({ t: 'emote', player: i, id: str(m.id, 12) });
    }
    case 'leave':
      return c.match?.leave(c);
    case 'club_list': {
      const q = str(m.q, 30).toLowerCase().trim();
      const list = Object.keys(db.clubs)
        .map((id) => clubSummary(id)!)
        .filter((s) => !q || s.name.toLowerCase().includes(q) || s.tag.toLowerCase() === q)
        .sort((a, b) => b.trophies - a.trophies)
        .slice(0, 50);
      return send(c, { t: 'club_list', clubs: list });
    }
    case 'club_create': {
      const rec = db.players[c.id!];
      if (rec.clubId) return err(c, 'already', 'Ya estás en un club');
      const name = censor(str(m.name, 20).trim());
      const tag = censor(str(m.tag, 4).trim().toUpperCase()).replace(/[^A-Z0-9]/g, '');
      if (name.length < 3 || tag.length < 2) return err(c, 'invalid', 'Nombre o etiqueta no válidos');
      if (Object.values(db.clubs).some((cl) => cl.tag === tag)) return err(c, 'tag_taken', 'Esa etiqueta ya existe');
      const id = code(8);
      db.clubs[id] = { id, name, tag, emblem: num(m.emblem, 0, 64), desc: censor(str(m.desc, 120)), minTrophies: num(m.minTrophies, 0, 5000), members: [{ id: c.id!, role: 'leader', joinedAt: Date.now() }], chat: [], weeklyWins: 0, week: db.weekKey(), createdAt: Date.now() };
      rec.clubId = id;
      db.save();
      sysMsg(id, `${rec.profile.name} ha fundado el club 🎉`);
      return send(c, { t: 'club', club: clubDetail(id) });
    }
    case 'club_join': {
      const rec = db.players[c.id!];
      const cl = db.clubs[str(m.id, 12)];
      if (!cl) return err(c, 'not_found', 'El club no existe');
      if (rec.clubId) leaveClub(c.id!);
      if (cl.members.length >= 30) return err(c, 'full', 'El club está lleno');
      if (rec.profile.trophies < cl.minTrophies) return err(c, 'trophies', 'No tienes copas suficientes');
      cl.members.push({ id: c.id!, role: 'member', joinedAt: Date.now() });
      rec.clubId = cl.id;
      db.save();
      sysMsg(cl.id, `${rec.profile.name} se ha unido 👋`);
      return send(c, { t: 'club', club: clubDetail(cl.id) });
    }
    case 'club_leave':
      leaveClub(c.id!);
      return send(c, { t: 'club', club: null });
    case 'club_info': {
      const rec = db.players[c.id!];
      const id = m.id ? str(m.id, 12) : rec.clubId;
      return send(c, { t: 'club', club: id ? clubDetail(id) : null });
    }
    case 'club_chat': {
      const rec = db.players[c.id!];
      if (!rec.clubId) return;
      if (Date.now() - c.lastChat < 1000) return err(c, 'slow', 'Espera un momento antes de escribir otra vez');
      c.lastChat = Date.now();
      const text = censor(str(m.text, 200).trim());
      if (!text) return;
      return clubPost(rec.clubId, { id: code(8), from: c.id!, name: rec.profile.name, text, at: Date.now() });
    }
    case 'report':
      db.reports.push({ from: c.id!, target: str(m.target, 12), reason: str(m.reason, 30), text: str(m.text, 300), at: Date.now() });
      if (db.reports.length > 2000) db.reports.splice(0, db.reports.length - 2000);
      console.log('[report]', c.id, '->', m.target, m.reason);
      db.save();
      return;
    case 'leaderboard': {
      const list = leaderboard();
      const rank = list.findIndex((p) => p.id === c.id) + 1;
      return send(c, { t: 'leaderboard', top: list.slice(0, 100), rank });
    }
    case 'friends': {
      const ids = Array.isArray(m.ids) ? m.ids.slice(0, 100).map((x) => str(x, 12).toUpperCase()) : [];
      const list = ids.map((id) => publicOf(id)).filter((p): p is PublicProfile => !!p).map((p) => ({ ...p, online: byId.has(p.id) }));
      return send(c, { t: 'friends', list });
    }
    case 'delete_account': {
      const id = c.id!;
      leaveClub(id);
      delete db.players[id];
      byId.delete(id);
      db.save();
      send(c, { t: 'deleted' });
      c.id = null;
      return;
    }
  }
}

// ------------------------------------------------------------------ servidor HTTP + WS

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, online: byId.size, matches: matches.size, players: Object.keys(db.players).length, clubs: Object.keys(db.clubs).length }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Diana Legends · servidor online. Conecta por WebSocket.');
});

const wss = new WebSocketServer({ server, maxPayload: 8 * 1024 });

wss.on('connection', (ws) => {
  const c: Conn = { ws, id: null, profile: null, match: null, queuedArena: null, queuedAt: 0, queuedConfig: null, room: null, msgTimes: [], lastChat: 0 };
  conns.add(c);
  let alive = true;
  ws.on('pong', () => (alive = true));
  const hb = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 30_000);
  ws.on('message', (raw: RawData) => {
    const now = Date.now();
    c.msgTimes = c.msgTimes.filter((t) => now - t < 1000);
    c.msgTimes.push(now);
    if (c.msgTimes.length > 40) return; // límite de mensajes por segundo
    let m: ClientMsg;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!m || typeof m !== 'object' || typeof (m as { t?: unknown }).t !== 'string') return;
    try {
      handle(c, m);
    } catch (e) {
      console.error('error manejando', m.t, e);
    }
  });
  ws.on('close', () => {
    clearInterval(hb);
    conns.delete(c);
    if (c.id && byId.get(c.id) === c) byId.delete(c.id);
    if (c.room) rooms.delete(c.room);
    if (c.match) c.match.disconnected(c);
  });
});

server.listen(PORT, () => console.log(`Diana Legends server escuchando en :${PORT}`));

function shutdown() {
  db.flush();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
