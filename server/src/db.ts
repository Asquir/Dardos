// Persistencia sencilla en JSON (escritura atómica y con retardo). Suficiente para miles de jugadores;
// para escalar, sustitúyela por PostgreSQL/Redis manteniendo esta interfaz.

import fs from 'node:fs';
import path from 'node:path';
import type { ClubMessage, PublicProfile } from '../../shared/protocol.ts';

export interface PlayerRec {
  id: string;
  tokenHash: string;
  profile: PublicProfile;
  clubId?: string;
  createdAt: number;
  lastSeen: number;
}

export interface ClubRec {
  id: string;
  name: string;
  tag: string;
  emblem: number;
  desc: string;
  minTrophies: number;
  members: { id: string; role: 'leader' | 'elder' | 'member'; joinedAt: number }[];
  chat: ClubMessage[];
  weeklyWins: number;
  week: string;
  createdAt: number;
}

export interface Report {
  from: string;
  target: string;
  reason: string;
  text: string;
  at: number;
}

export class Db {
  players: Record<string, PlayerRec> = {};
  clubs: Record<string, ClubRec> = {};
  reports: Report[] = [];
  private file: string;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'db.json');
    if (fs.existsSync(this.file)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        this.players = raw.players ?? {};
        this.clubs = raw.clubs ?? {};
        this.reports = raw.reports ?? [];
      } catch (e) {
        console.error('db.json dañado, se crea uno nuevo', e);
      }
    }
  }

  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 2000);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ players: this.players, clubs: this.clubs, reports: this.reports }));
    fs.renameSync(tmp, this.file);
  }

  weekKey(t = Date.now()): string {
    const d = new Date(t);
    const onejan = new Date(d.getFullYear(), 0, 1);
    return d.getFullYear() + '-' + Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
  }

  /** Reinicia las victorias semanales del club al cambiar de semana. */
  rollWeek(c: ClubRec) {
    const w = this.weekKey();
    if (c.week !== w) {
      c.week = w;
      c.weeklyWins = 0;
    }
  }
}
