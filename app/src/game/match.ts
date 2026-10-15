// Controlador de partida: une reglas, jugadores (humano, bot, online), la vista 3D y la interfaz.

import { resolveHit, scoreAt, type Hit } from '@shared/board';
import { applyThrow, createMatch, forfeitTurn, threeDartAvg, type MatchConfig, type MatchState, type ThrowEvent } from '@shared/rules';
import { botThrow, rng, type BotProfile } from '@shared/bot';
import { checkoutRoute, routeLabel } from '@shared/checkout';
import { trophyDelta, type AvatarConfig, type DartLook, type ServerMsg } from '@shared/protocol';
import { Store } from '../core/store';
import { gameView, type ThrowQuality } from '../engine/gameView';
import { engine } from '../engine/renderer';
import { audio } from '../services/audio';
import { haptics } from '../services/haptics';
import { net } from '../services/net';
import { mutate, profile, isVip } from '../meta/profile';
import { ARENAS, arenaForTrophies } from '../meta/arenas';
import { addXp, awardWinChest, dartStats, track, noteMatchForAds, addSeasonXp } from '../meta/economy';
import type { ChestType } from '../meta/chests';
import type { ChallengeDef } from '../meta/progression';
import { EMOTES } from '../meta/catalog';

export type PlayerKind = 'human' | 'bot' | 'remote';

export interface MatchPlayer {
  kind: PlayerKind;
  name: string;
  level: number;
  trophies: number;
  avatar: AvatarConfig;
  dart: DartLook;
  bot?: BotProfile;
  club?: string;
}

export type MatchType = 'ranked' | 'training' | 'tournament' | 'challenge' | 'private' | 'tutorial' | 'online' | 'local';

export interface MatchSetup {
  type: MatchType;
  config: MatchConfig;
  arena: number;
  players: MatchPlayer[];
  starter: number;
  entry?: number;
  prize?: number;
  online?: { matchId: string; you: number; ranked: boolean };
  challenge?: ChallengeDef;
  assist?: number;
  title?: string;
  /** límite de dardos (desafíos / entrenamiento) */
  dartLimit?: number;
}

export interface Popup {
  id: number;
  x: number;
  y: number;
  label: string;
  points: number;
  ring: Hit['ring'];
}

export interface BigMessage {
  id: number;
  text: string;
  sub?: string;
  kind: 'gold' | 'red' | 'blue' | 'green' | 'purple';
}

export interface MatchResult {
  won: boolean;
  winner: number;
  reason: 'win' | 'forfeit' | 'disconnect' | 'limit';
  coins: number;
  trophies: number;
  xp: number;
  chest: ChestType | null;
  chestFull: boolean;
  levelUps: number[];
  stats: { avg: number; darts: number; best: number; s180: number; checkout: number; tons: number }[];
  challengeScore?: number;
  stars?: number;
  doubled?: boolean;
}

export interface MatchUI {
  setup: MatchSetup;
  state: MatchState;
  phase: 'intro' | 'aim' | 'wait' | 'between' | 'ended';
  popups: Popup[];
  message: BigMessage | null;
  checkout: string;
  quality: { id: number; q: ThrowQuality } | null;
  hint: 'flick' | 'aim' | null;
  emote: { player: number; id: string; key: number } | null;
  deadline: number;
  dartsUsed: number;
  challengeHits: Hit[];
  result: MatchResult | null;
  opponentConnected: boolean;
  lastTurn: { player: number; total: number; bust: boolean; key: number } | null;
  /** arena máxima desbloqueada antes de la partida (para detectar ascensos) */
  arenaBefore: number;
}

export const matchStore = new Store<MatchUI | null>(null);

let uid = 1;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Match {
  ui: MatchUI;
  private aborted = false;
  private view = gameView();
  private r = rng(Date.now() & 0xffffff);
  private offs: (() => void)[] = [];
  private remoteQueue: ServerMsg[] = [];
  private remoteWake: (() => void) | null = null;
  private turnHits: Hit[] = [];
  onEnd?: (r: MatchResult) => void;

  constructor(public setup: MatchSetup, state?: MatchState) {
    this.ui = {
      setup,
      state: state ?? createMatch(setup.config, setup.players.length, setup.starter),
      phase: 'intro',
      popups: [],
      message: null,
      checkout: '',
      quality: null,
      hint: null,
      emote: null,
      deadline: 0,
      dartsUsed: 0,
      challengeHits: [],
      result: null,
      opponentConnected: true,
      lastTurn: null,
      arenaBefore: arenaForTrophies(profile().bestTrophies),
    };
    matchStore.set(this.ui);
  }

  private emit() {
    matchStore.set({ ...this.ui });
  }

  get you(): number {
    return this.setup.online?.you ?? 0;
  }

  // ------------------------------------------------------------------ ciclo

  async start() {
    const v = this.view;
    v.setArena(this.setup.arena);
    v.setBoardStyle((profile().boardSkin as 'classic') ?? 'classic');
    v.setGameMode(true);
    engine.setView(v);
    audio.stopMusic();
    audio.setAmbience(this.setup.arena >= 4 ? 1.4 : 1);
    if (this.setup.online) this.listenOnline();
    this.updateCheckout();
    this.emit();
    await sleep(1900);
    if (this.aborted) return;
    this.ui.phase = 'wait';
    this.emit();
    try {
      await this.loop();
    } catch (e) {
      if (!this.aborted) console.error(e);
    }
  }

  private async loop() {
    while (!this.aborted && this.ui.state.winner === null) {
      const cur = this.ui.state.current;
      const pl = this.setup.players[cur];
      if (this.setup.online) {
        if (cur === this.you) await this.humanDart(cur);
        else await this.remoteStep();
      } else if (pl.kind === 'human') await this.humanDart(cur);
      else await this.botDart(cur);
      if (this.setup.dartLimit && this.ui.dartsUsed >= this.setup.dartLimit && this.ui.state.winner === null) {
        await sleep(700);
        this.finish(0, 'limit');
        return;
      }
    }
  }

  private async humanDart(idx: number) {
    const p = profile();
    const pl = this.setup.players[idx];
    const stats = dartStats(p);
    this.ui.phase = 'aim';
    this.emit();
    this.view.onHint = (h) => {
      this.ui.hint = h;
      this.emit();
    };
    const shot = await this.view.humanAim({
      look: pl.dart,
      stats,
      sensitivity: p.settings.sensitivity,
      control: p.settings.control,
      leftHanded: p.settings.leftHanded,
      assist: this.setup.assist,
    });
    if (this.aborted) return;
    if (!shot) {
      // turno agotado (online): aplicamos el estado del servidor
      if (this.setup.online) await this.remoteStep();
      return;
    }
    this.ui.phase = 'wait';
    this.ui.quality = { id: uid++, q: shot.quality };
    this.emit();
    const hit = resolveHit(shot.x, shot.y, Math.random());
    audio.whoosh();
    if (this.setup.online) {
      net.send({ t: 'throw', x: hit.x, y: hit.y, bounce: !!hit.bounce });
      await this.view.throwDart({ x: hit.x, y: hit.y, look: pl.dart, bounce: hit.bounce, fromHand: true });
      this.onImpact(hit, idx);
      // el estado oficial llega del servidor
      await this.waitRemoteState(true);
      return;
    }
    await this.view.throwDart({ x: hit.x, y: hit.y, look: pl.dart, bounce: hit.bounce, fromHand: true });
    this.onImpact(hit, idx);
    await this.applyLocal(hit, idx);
  }

  private async botDart(idx: number) {
    const pl = this.setup.players[idx];
    const bot = pl.bot!;
    await sleep(this.ui.state.turn.length === 0 ? 900 : 520 + this.r() * 380);
    if (this.aborted) return;
    const { hit } = botThrow(this.ui.state, idx, bot.skill, this.r);
    audio.whoosh();
    await this.view.throwDart({ x: hit.x, y: hit.y, look: pl.dart, bounce: hit.bounce });
    this.onImpact(hit, idx);
    await this.applyLocal(hit, idx);
  }

  /** Efectos inmediatos de un impacto. */
  private onImpact(hit: Hit, player: number) {
    if (this.aborted) return;
    const r = Math.hypot(hit.x, hit.y);
    if (hit.bounce) audio.clank();
    else if (r > 330) audio.wallHit();
    else audio.thud(1);
    haptics.light();
    if (!hit.bounce) this.view.highlight(hit);
    const pos = this.view.toScreen(hit.x, hit.y);
    this.ui.popups = [...this.ui.popups.slice(-4), { id: uid++, x: pos.x, y: pos.y, label: hit.label, points: hit.points, ring: hit.ring }];
    if (hit.ring === 'T') audio.treble();
    else if (hit.ring === 'DB') {
      audio.bull();
      this.view.crowdFlash(0.5);
    } else if (hit.points > 0) audio.score(hit.points);
    if (player === this.you) this.ui.dartsUsed++;
    if (this.setup.type === 'challenge') this.ui.challengeHits = [...this.ui.challengeHits, hit];
    const localHuman = this.setup.online ? player === this.you : this.setup.players[player].kind === 'human' && player === 0;
    if (localHuman && this.setup.type !== 'tutorial') track({ type: 'dart', hit });
    this.emit();
  }

  private async applyLocal(hit: Hit, idx: number) {
    const res = applyThrow(this.ui.state, hit);
    this.ui.state = res.state;
    this.turnHits.push(hit);
    await this.afterThrow(res.event, res.turnTotal, idx);
  }

  private async afterThrow(event: ThrowEvent, turnTotal: number, idx: number) {
    const s = this.ui.state;
    const cfg = s.config;
    const human = idx === this.you;
    this.updateCheckout();
    this.emit();
    if (event === 'dart') return;
    if (event === 'bust') {
      this.say('red', '¡TE PASAS!', 'Bust');
      audio.bust();
      if (human) haptics.error();
      this.ui.lastTurn = { player: idx, total: 0, bust: true, key: uid++ };
    } else if (event === 'turnEnd' || event === 'legWon' || event === 'matchWon') {
      this.ui.lastTurn = { player: idx, total: turnTotal, bust: false, key: uid++ };
      if (cfg.mode === 'x01' || cfg.mode === 'free') {
        if (turnTotal === 180) {
          this.say('gold', '¡180!', '¡MÁXIMO!');
          audio.oneEighty();
          haptics.heavy();
          this.view.celebrate(1.2);
          if (!human) this.botReact('shock', 0.6);
        } else if (turnTotal >= 140) {
          this.say('purple', String(turnTotal), '¡Tremendo!');
          audio.cheer(0.8);
          audio.callScore(turnTotal);
          this.view.celebrate(0.7);
        } else if (turnTotal >= 100) {
          this.say('blue', String(turnTotal), '¡TON!');
          audio.cheer(0.5);
          audio.callScore(turnTotal);
          this.view.crowdFlash(0.4);
        } else if (event === 'turnEnd') {
          audio.callScore(turnTotal);
        }
        if (human && this.setup.type !== 'tutorial') track({ type: 'turn', total: turnTotal });
      }
      if (event === 'legWon' || event === 'matchWon') {
        const checkout = s.players[idx].checkoutBest;
        this.say('green', event === 'matchWon' ? '¡GAME SHOT!' : '¡LEG!', `${this.setup.players[idx].name}${cfg.mode === 'x01' && checkout ? ' · cierre de ' + checkout : ''}`);
        audio.cheer(1.2);
        this.view.celebrate(1);
        if (event === 'matchWon') {
          await sleep(2300);
          this.finish(idx, 'win');
          return;
        }
      }
      if (!human && this.setup.players[idx].kind === 'bot' && turnTotal >= 100) this.botReact('go', 0.35);
    }
    this.ui.phase = 'between';
    this.emit();
    await sleep(event === 'bust' ? 1300 : 1100);
    if (this.aborted) return;
    await this.view.clearDarts();
    this.turnHits = [];
    this.ui.popups = [];
    this.ui.phase = 'wait';
    this.emit();
  }

  private say(kind: BigMessage['kind'], text: string, sub?: string) {
    this.ui.message = { id: uid++, text, sub, kind };
    this.emit();
  }

  private updateCheckout() {
    const s = this.ui.state;
    if (s.config.mode !== 'x01' || !profile().settings.showCheckout) {
      this.ui.checkout = '';
      return;
    }
    const p = s.players[s.current];
    const route = p.remaining <= 170 ? checkoutRoute(p.remaining, 3 - s.turn.length, s.config.doubleOut) : null;
    this.ui.checkout = routeLabel(route);
  }

  // ------------------------------------------------------------------ emotes

  sendEmote(id: string) {
    this.ui.emote = { player: this.you, id, key: uid++ };
    this.emit();
    audio.pop();
    if (this.setup.online) net.send({ t: 'emote', id });
    else if (this.setup.players.some((p) => p.kind === 'bot') && this.r() < 0.5) {
      const replies: Record<string, string> = { gg: 'gg', nice: 'gg', oops: 'lol', go: 'cool', lol: 'oops', cool: 'think', king: 'lol' };
      setTimeout(() => this.botReact(replies[id] ?? 'nice', 1), 1400);
    }
  }

  private botReact(id: string, chance: number) {
    if (this.r() > chance || !EMOTES.find((e) => e.id === id)) return;
    const idx = this.setup.players.findIndex((p) => p.kind === 'bot');
    if (idx < 0) return;
    setTimeout(() => {
      this.ui.emote = { player: idx, id, key: uid++ };
      audio.pop();
      this.emit();
    }, 600);
  }

  // ------------------------------------------------------------------ online

  private listenOnline() {
    this.offs.push(
      net.on('state', (m) => {
        this.remoteQueue.push(m);
        if (m.timeout && m.last?.player === this.you && this.view.isAiming) this.view.cancelAim();
        this.remoteWake?.();
      }),
      net.on('match_end', (m) => {
        this.remoteQueue.push(m);
        this.remoteWake?.();
      }),
      net.on('emote', (m) => {
        if (m.player === this.you) return;
        this.ui.emote = { player: m.player, id: m.id, key: uid++ };
        audio.pop();
        this.emit();
      }),
      net.on('opponent_status', (m) => {
        this.ui.opponentConnected = m.connected;
        this.emit();
      }),
      net.on('close', () => {
        this.remoteQueue.push({ t: 'match_end', winner: 1 - this.you, reason: 'disconnect', trophies: [0, 0] });
        this.remoteWake?.();
      }),
    );
  }

  private async nextRemote(): Promise<ServerMsg> {
    while (!this.remoteQueue.length) {
      await new Promise<void>((r) => (this.remoteWake = r));
      this.remoteWake = null;
      if (this.aborted) throw new Error('aborted');
    }
    return this.remoteQueue.shift()!;
  }

  /** Espera el estado oficial tras nuestro dardo. */
  private async waitRemoteState(mine: boolean) {
    const m = await this.nextRemote();
    if (m.t === 'match_end') return this.handleRemoteEnd(m);
    if (m.t !== 'state') return;
    this.ui.state = m.state;
    this.ui.deadline = m.deadline;
    if (m.last) await this.afterThrow(m.last.event, m.state.history.at(-1)?.total ?? 0, m.last.player);
    void mine;
  }

  private async remoteStep() {
    this.ui.phase = 'wait';
    this.emit();
    const m = await this.nextRemote();
    if (m.t === 'match_end') return this.handleRemoteEnd(m);
    if (m.t !== 'state') return;
    this.ui.deadline = m.deadline;
    if (m.timeout && m.last) {
      this.ui.state = m.state;
      this.say('red', '¡TIEMPO!', m.last.player === this.you ? 'Se te acabó el tiempo' : 'Tu rival no lanzó a tiempo');
      await this.afterThrow(m.last.event, 0, m.last.player);
      return;
    }
    if (m.last && m.last.player !== this.you) {
      const pl = this.setup.players[m.last.player];
      audio.whoosh();
      await this.view.throwDart({ x: m.last.hit.x, y: m.last.hit.y, look: pl.dart, bounce: m.last.hit.bounce });
      this.onImpact(m.last.hit, m.last.player);
      this.ui.state = m.state;
      await this.afterThrow(m.last.event, m.state.history.at(-1)?.total ?? 0, m.last.player);
    } else {
      this.ui.state = m.state;
      this.emit();
    }
  }

  private handleRemoteEnd(m: Extract<ServerMsg, { t: 'match_end' }>) {
    this.ui.state = { ...this.ui.state, winner: m.winner };
    this.finish(m.winner, m.reason, m.trophies[this.you]);
  }

  // ------------------------------------------------------------------ fin

  /** Abandonar: en partidas clasificatorias cuenta como derrota. */
  abort() {
    if (this.ui.phase === 'ended') return;
    const forfeit = this.setup.type === 'ranked' || this.setup.type === 'online' || this.setup.type === 'tournament';
    if (this.setup.online) net.send({ t: 'leave' });
    if (forfeit && this.ui.state.winner === null) {
      this.finish(this.setup.players.length > 1 ? 1 - this.you : 0, 'forfeit');
    } else {
      this.cleanup();
      matchStore.set(null);
    }
  }

  private cleanup() {
    this.aborted = true;
    this.view.cancelAim();
    this.remoteWake?.();
    for (const o of this.offs) o();
    this.offs = [];
    audio.setAmbience(0);
  }

  private finish(winner: number, reason: MatchResult['reason'], onlineTrophies?: number) {
    if (this.ui.result) return;
    this.cleanup();
    const s = this.ui.state;
    const you = this.you;
    const setup = this.setup;
    const arena = ARENAS[setup.arena] ?? ARENAS[0];
    const res: MatchResult = {
      won: winner === you,
      winner,
      reason,
      coins: 0,
      trophies: 0,
      xp: 0,
      chest: null,
      chestFull: false,
      levelUps: [],
      stats: s.players.map((p) => ({ avg: Math.round(threeDartAvg(p) * 10) / 10, darts: p.darts, best: p.best, s180: p.max180, checkout: p.checkoutBest, tons: p.tons })),
    };
    const me = s.players[you];
    const opp = setup.players[1 - you] ?? setup.players[0];
    const isRanked = setup.type === 'ranked' || (setup.type === 'online' && !!setup.online?.ranked);

    if (setup.type === 'challenge' && setup.challenge) {
      const score = setup.challenge.score(this.ui.challengeHits);
      res.challengeScore = score;
      res.stars = setup.challenge.stars.filter((x) => score >= x).length;
      res.won = (res.stars ?? 0) > 0;
    }

    mutate((p) => {
      if (setup.type === 'tutorial') return;
      const avg = threeDartAvg(me);
      if (setup.type !== 'challenge' && setup.type !== 'local') {
        p.stats.matches++;
        if (res.won) {
          p.stats.wins++;
          p.stats.winStreak++;
          p.stats.bestStreak = Math.max(p.stats.bestStreak, p.stats.winStreak);
          if (setup.type === 'online') p.stats.onlineWins++;
          if (s.config.mode === 'x01') {
            p.stats.bestCheckout = Math.max(p.stats.bestCheckout, me.checkoutBest);
            if (me.darts && (p.stats.bestLegDarts === 0 || me.darts < p.stats.bestLegDarts) && s.config.start === 501 && s.config.legsToWin === 1) p.stats.bestLegDarts = me.darts;
          }
        } else {
          p.stats.losses++;
          p.stats.winStreak = 0;
        }
        if (me.darts >= 9) p.stats.bestAvg = Math.max(p.stats.bestAvg, Math.round(avg * 10) / 10);
      }
      // recompensas
      if (isRanked) {
        if (res.won) {
          const bonus = isVip(p) ? 1.5 : 1;
          res.coins = Math.round((setup.prize ?? arena.prize) * bonus);
          res.trophies = onlineTrophies ?? trophyDelta(p.trophies, opp.trophies).win;
          res.xp = arena.xpWin;
        } else {
          res.trophies = onlineTrophies ?? -trophyDelta(opp.trophies, p.trophies).lose;
          res.xp = reason === 'forfeit' ? 0 : arena.xpLose;
        }
        p.trophies = Math.max(0, p.trophies + res.trophies);
        p.bestTrophies = Math.max(p.bestTrophies, p.trophies);
        p.coins += res.coins;
        addSeasonXp(p, res.won ? 30 : 12);
      } else if (setup.type === 'training' || setup.type === 'local' || setup.type === 'private') {
        res.xp = reason === 'forfeit' ? 0 : 12;
        addSeasonXp(p, 8);
      } else if (setup.type === 'tournament') {
        res.xp = res.won ? 40 : 15;
        addSeasonXp(p, res.won ? 20 : 8);
      } else if (setup.type === 'challenge') {
        res.xp = 15;
        addSeasonXp(p, 15);
      }
      if (res.xp) res.levelUps = addXp(p, res.xp).map((l) => l.level);
      p.history = [{ at: Date.now(), mode: setup.type, opponent: opp.name, won: res.won, avg: Math.round(avg * 10) / 10, online: !!setup.online }, ...p.history].slice(0, 30);
    });

    if (isRanked && res.won) {
      res.chest = awardWinChest(setup.arena);
      res.chestFull = res.chest === null;
    }
    if (setup.type !== 'tutorial' && setup.type !== 'challenge') {
      track({ type: 'match', won: res.won, online: setup.type === 'online', checkoutDouble: res.won && s.config.mode === 'x01' && s.config.doubleOut && reason === 'win', ranked: isRanked });
      if (setup.type === 'training' && reason !== 'forfeit') track({ type: 'training' });
      noteMatchForAds();
    } else if (setup.type === 'challenge') track({ type: 'training' });

    if (res.won) {
      audio.win();
      haptics.success();
    } else audio.lose();
    this.ui.result = res;
    this.ui.phase = 'ended';
    this.emit();
    net.syncProfile();
    this.onEnd?.(res);
  }
}

let current: Match | null = null;

export function startMatch(setup: MatchSetup, state?: MatchState): Match {
  current?.abort();
  const m = new Match(setup, state);
  current = m;
  void m.start();
  return m;
}

export function currentMatch(): Match | null {
  return current;
}

export function closeMatch() {
  current = null;
  matchStore.set(null);
}

/** Dardo fallado para turnos agotados. */
export const missHit = () => scoreAt(999, 999);
export { forfeitTurn };
