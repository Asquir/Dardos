// Controlador de partida: une reglas, jugadores (humano, bot, online), la vista 3D y la interfaz.

import { resolveHit, scoreAt, targetPoint, SEGMENTS, type Hit, type Target } from '@shared/board';
import { applyThrow, createMatch, forfeitTurn, threeDartAvg, type MatchConfig, type MatchState, type ThrowEvent } from '@shared/rules';
import { botThrow, chooseTarget, rng, type BotProfile } from '@shared/bot';
import { checkoutRoute, routeLabel, suggestTarget } from '@shared/checkout';
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
import { currentLiveEvent, scoreEventMatch } from '../meta/liveEvents';
import { addEventPoints } from '../meta/events';
import { EMOTES } from '../meta/catalog';
import { applyTournament, applyChallenge, applyTutorial, type PostMatch } from '../meta/postmatch';
import type { Reward } from '../meta/chests';

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

export type MatchType = 'ranked' | 'training' | 'tournament' | 'challenge' | 'private' | 'tutorial' | 'online' | 'local' | 'event';

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
  levelUps: { level: number; reward: Reward }[];
  /** torneo, desafío o tutorial: lo que se ganó (ya aplicado) */
  post?: PostMatch;
  stats: { avg: number; darts: number; best: number; s180: number; checkout: number; tons: number }[];
  challengeScore?: number;
  stars?: number;
  eventPoints?: number;
  eventLines?: { label: string; pts: number }[];
  doubled?: boolean;
  /** monedas de las zonas bonus y los combos (ya sumadas) */
  bonusCoins?: number;
  bestCombo?: number;
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
  /** turnos seguidos de 100+ de cada jugador (racha) */
  streak: number[];
  /** conexión perdida: esperando a recuperarla (online) */
  reconnecting: boolean;
  /** diferencia de reloj con el servidor (ms) para la cuenta atrás */
  clockOffset: number;
  /** zona bonus del turno del jugador: si un dardo cae en ella, monedas */
  bonus: { target: Target; coins: number } | null;
  /** monedas ganadas con bonus y combos (se suman al terminar) */
  bonusCoins: number;
  /** aviso en pantalla de bonus o combo */
  bonusFx: { id: number; kind: 'bonus' | 'combo'; text: string; coins: number; x: number; y: number } | null;
  /** dardos buenos seguidos (triples, dobles, bull o bonus) */
  combo: number;
  bestCombo: number;
  /** turnos de los bots acelerados */
  fast: boolean;
}

export const matchStore = new Store<MatchUI | null>(null);

let uid = 1;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** velocidad de los turnos de los bots al acelerarlos */
const FAST = 2.2;

/** ¿Cae el dardo en la zona bonus? (en "S" vale cualquiera de las dos zonas de simple) */
function inBonus(t: Target, h: Hit): boolean {
  if (t === 'DB') return h.ring === 'DB';
  if (t === 'SB') return h.ring === 'SB' || h.ring === 'DB';
  return h.ring === t[0] && h.num === parseInt(t.slice(1), 10);
}

export class Match {
  ui: MatchUI;
  private aborted = false;
  private view = gameView();
  private r = rng(Date.now() & 0xffffff);
  private offs: (() => void)[] = [];
  private remoteQueue: ServerMsg[] = [];
  private remoteWake: (() => void) | null = null;
  private turnHits: Hit[] = [];
  /** dardos del jugador local en esta partida (para eventos y estadísticas) */
  private myHits: Hit[] = [];
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
      streak: setup.players.map(() => 0),
      reconnecting: false,
      clockOffset: 0,
      bonus: null,
      bonusCoins: 0,
      bonusFx: null,
      combo: 0,
      bestCombo: 0,
      fast: false,
    };
    matchStore.set(this.ui);
  }

  private emit() {
    // una partida ya abandonada no debe tocar la pantalla de la siguiente
    if (current !== this) return;
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
    audio.setAmbience(this.setup.arena >= 4 ? 1.4 : 1, this.setup.arena >= 4 ? 'arena' : this.setup.arena >= 2 ? 'club' : 'pub');
    if (this.setup.online) this.listenOnline();
    this.updateCheckout();
    this.emit();
    // mientras dura la presentación se compilan los dardos de todos (evita tirones al lanzar)
    const looks = [...new Map(this.setup.players.map((p) => [p.dart.barrel + p.dart.shaft + p.dart.flight, p.dart])).values()];
    await Promise.all([sleep(1500), v.warmup(looks)]);
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
      if (this.aborted) return;
      if (this.setup.dartLimit && this.ui.dartsUsed >= this.setup.dartLimit && this.ui.state.winner === null) {
        await sleep(700);
        if (this.aborted) return;
        this.finish(0, 'limit');
        return;
      }
    }
  }

  private async humanDart(idx: number) {
    const p = profile();
    const pl = this.setup.players[idx];
    const stats = dartStats(p);
    this.view.setTurnCam(false);
    this.view.fire = (this.ui.streak[idx] ?? 0) >= 2;
    if (!this.view.slowMo) engine.timeScale = 1;
    this.showTarget();
    if (idx === this.you && this.ui.state.turn.length === 0) this.pickBonus();
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
    const cine = this.maxChance();
    if (cine) audio.tension();
    if (this.setup.online) {
      net.send({ t: 'throw', x: hit.x, y: hit.y, bounce: !!hit.bounce });
      await this.view.throwDart({ x: hit.x, y: hit.y, look: pl.dart, bounce: hit.bounce, fromHand: true, cine });
      if (this.aborted) return;
      this.onImpact(hit, idx);
      if (cine) this.endCine(hit);
      // el estado oficial llega del servidor
      await this.waitRemoteState(true);
      return;
    }
    await this.view.throwDart({ x: hit.x, y: hit.y, look: pl.dart, bounce: hit.bounce, fromHand: true, cine });
    if (this.aborted) return;
    this.onImpact(hit, idx);
    if (cine) this.endCine(hit);
    await this.applyLocal(hit, idx);
  }

  /** ¿Lleva dos T20 en el turno? El tercer dardo se ve a cámara lenta. */
  private maxChance(): boolean {
    const s = this.ui.state;
    if (this.setup.type === 'tutorial' || (s.config.mode !== 'x01' && s.config.mode !== 'free')) return false;
    if (s.turn.length !== 2 || !s.turn.every((h) => h.ring === 'T' && h.num === 20)) return false;
    if (s.config.mode === 'x01') {
      const left = s.players[s.current].remaining;
      if (s.config.doubleOut ? left - 60 < 2 : left < 60) return false;
    }
    return true;
  }

  private endCine(hit: Hit) {
    this.view.endCine();
    if (!(hit.ring === 'T' && hit.num === 20)) audio.ooh(1.1);
  }

  private async botDart(idx: number) {
    const pl = this.setup.players[idx];
    const bot = pl.bot!;
    this.view.setTurnCam(true);
    this.view.fire = (this.ui.streak[idx] ?? 0) >= 2;
    this.clearBonus();
    const pace = this.ui.fast ? FAST : 1;
    if (this.ui.fast && !this.view.slowMo) engine.timeScale = FAST;
    await sleep((this.ui.state.turn.length === 0 ? 380 : 160 + this.r() * 220) / pace);
    if (this.aborted) return;
    const { target, hit } = botThrow(this.ui.state, idx, bot.skill, this.r);
    // se ve cómo apunta el rival antes de lanzar
    const tp = targetPoint(target);
    await this.view.botAim(tp.x, tp.y, 0.5 + this.r() * 0.3);
    if (this.aborted) return;
    audio.whoosh();
    const cine = this.maxChance();
    if (cine) audio.tension();
    await this.view.throwDart({ x: hit.x, y: hit.y, look: pl.dart, bounce: hit.bounce, cine });
    if (this.aborted) return;
    this.onImpact(hit, idx);
    if (cine) this.endCine(hit);
    await this.applyLocal(hit, idx);
  }

  /** Efectos inmediatos de un impacto. */
  private onImpact(hit: Hit, player: number) {
    if (this.aborted) return;
    const r = Math.hypot(hit.x, hit.y);
    if (hit.bounce) audio.clank();
    else if (r > 330) audio.wallHit();
    else audio.thud(hit.ring === 'T' || hit.ring === 'DB' ? 1.15 : 1);
    const mine = this.setup.online ? player === this.you : this.setup.players[player].kind === 'human';
    if (mine) {
      if (hit.ring === 'DB') haptics.heavy();
      else if (hit.ring === 'T') haptics.medium();
      else haptics.light();
    }
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
    if (localHuman) this.myHits.push(hit);
    if (localHuman && this.setup.type !== 'tutorial') track({ type: 'dart', hit });
    if (player === this.you && this.setup.type !== 'local' && this.setup.type !== 'tutorial') this.scoreBonus(hit, pos);
    this.emit();
  }

  // ------------------------------------------------------------------ bonus y combos

  /** Solo dan monedas las partidas con algo en juego (si no, se podrían farmear en el entrenamiento). */
  private get paysBonus(): boolean {
    const t = this.setup.type;
    return t === 'ranked' || t === 'online' || t === 'event' || t === 'tournament';
  }

  private bonusBase(): number {
    const entry = (ARENAS[this.setup.arena] ?? ARENAS[0]).entry;
    return Math.max(5, Math.round((entry * 0.04) / 5) * 5);
  }

  /** Elige la zona bonus del turno (nunca en el número al que se aconseja tirar ni en el 20). */
  private pickBonus() {
    this.clearBonus();
    if (!this.paysBonus) return;
    const base = this.bonusBase();
    const avoid = this.curTarget ? this.curTarget.slice(1) : '';
    for (let k = 0; k < 8; k++) {
      const r = this.r();
      const n = SEGMENTS[1 + Math.floor(this.r() * 19)];
      const [t, mult]: [Target, number] = r < 0.45 ? ['S' + n, 1] : r < 0.65 ? ['D' + n, 3] : r < 0.85 ? ['T' + n, 3] : r < 0.95 ? ['SB', 2] : ['DB', 5];
      if (avoid && t.slice(1) === avoid) continue;
      this.ui.bonus = { target: t, coins: base * mult };
      this.view.setBonus(t, base * mult);
      return;
    }
  }

  private clearBonus() {
    if (!this.ui.bonus) return;
    this.ui.bonus = null;
    this.view.setBonus(null);
  }

  private scoreBonus(hit: Hit, pos: { x: number; y: number }) {
    const b = this.ui.bonus;
    const bonus = !!b && !hit.bounce && inBonus(b.target, hit);
    const good = bonus || hit.ring === 'T' || hit.ring === 'D' || hit.ring === 'DB' || hit.ring === 'SB';
    this.ui.combo = good ? this.ui.combo + 1 : 0;
    this.ui.bestCombo = Math.max(this.ui.bestCombo, this.ui.combo);
    let coins = 0;
    let text = '';
    if (bonus) {
      coins += b!.coins;
      text = '¡BONUS!';
      this.clearBonus();
      this.view.bonusBurst(hit.x, hit.y);
      audio.coinBurst(8);
      haptics.success();
    }
    const c = this.ui.combo;
    if (c >= 2) {
      // a partir de x3 cada dardo bueno seguido suma monedas (hasta 3 veces la base)
      if (c >= 3) coins += Math.min(3, (c - 2) * 0.5) * this.bonusBase();
      text = text ? `${text} COMBO x${c}` : `COMBO x${c}`;
      audio.combo(c);
      if (c >= 3) haptics.medium();
    }
    if (!text) return;
    coins = this.paysBonus ? Math.round(coins) : 0;
    this.ui.bonusCoins += coins;
    this.ui.bonusFx = { id: uid++, kind: bonus ? 'bonus' : 'combo', text, coins, x: pos.x, y: pos.y };
  }

  /** Acelera (o deja de acelerar) los turnos de los bots. */
  toggleFast() {
    this.ui.fast = !this.ui.fast;
    const cur = this.setup.players[this.ui.state.current];
    if (cur?.kind === 'bot' && !this.view.slowMo) engine.timeScale = this.ui.fast ? FAST : 1;
    audio.click();
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
    this.clearBonus();
    if (event === 'bust') {
      this.say('red', '¡TE PASAS!', 'Bust');
      audio.bust();
      if (human) haptics.error();
      this.ui.lastTurn = { player: idx, total: 0, bust: true, key: uid++ };
      this.ui.streak[idx] = 0;
    } else if (event === 'turnEnd' || event === 'legWon' || event === 'matchWon') {
      this.ui.lastTurn = { player: idx, total: turnTotal, bust: false, key: uid++ };
      const streak = (this.ui.streak[idx] = (cfg.mode === 'x01' || cfg.mode === 'free') && turnTotal >= 100 ? (this.ui.streak[idx] ?? 0) + 1 : 0);
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
          this.say(streak >= 2 ? 'purple' : 'blue', String(turnTotal), streak >= 2 ? `🔥 ¡EN RACHA! x${streak}` : '¡TON!');
          if (streak >= 2) haptics.medium();
          audio.cheer(0.5);
          audio.callScore(turnTotal);
          this.view.crowdFlash(0.4);
        } else if (event === 'turnEnd') {
          audio.callScore(turnTotal);
        }
        if (human && this.setup.type !== 'tutorial') track({ type: 'turn', total: turnTotal });
      }
      if (event === 'legWon' || event === 'matchWon') {
        // al llegar al límite de rondas gana quien va mejor, no quien lanzó el último dardo
        const w = s.legWinner ?? idx;
        const closed = w === idx && (cfg.mode !== 'cricket' || s.players[w].marks.every((m) => m >= 3));
        const checkout = cfg.mode === 'x01' && closed ? turnTotal : 0;
        const title = event === 'matchWon' ? (closed ? '¡GAME SHOT!' : '¡FIN DE RONDAS!') : '¡LEG!';
        this.say('green', title, `${this.setup.players[w].name}${checkout ? ' · cierre de ' + checkout : event === 'matchWon' && !closed ? ' gana la partida' : ''}`);
        audio.cheer(1.2);
        this.view.celebrate(1);
        if (event === 'matchWon') {
          await sleep(2000);
          if (this.aborted) return;
          if (this.setup.online) return this.awaitRemoteEnd(s.winner ?? w);
          this.finish(s.winner ?? w, 'win');
          return;
        }
      }
      if (!human && this.setup.players[idx].kind === 'bot' && turnTotal >= 100) this.botReact('go', 0.35);
    }
    this.ui.phase = 'between';
    this.emit();
    const pace = this.ui.fast && this.setup.players[idx]?.kind === 'bot' ? FAST : 1;
    await sleep((event === 'bust' ? 1100 : 900) / pace);
    if (this.aborted) return;
    await this.view.clearDarts();
    if (this.aborted) return;
    this.turnHits = [];
    this.ui.popups = [];
    this.ui.phase = 'wait';
    this.emit();
  }

  private say(kind: BigMessage['kind'], text: string, sub?: string) {
    this.ui.message = { id: uid++, text, sub, kind };
    this.emit();
  }

  private curTarget: Target | null = null;
  private aimAt(t: Target | null, kind?: 'finish' | 'route' | 'score', wedge?: boolean) {
    this.curTarget = t;
    this.view.setTarget(t, kind, wedge);
  }

  /** Ilumina en la diana la zona a la que conviene tirar con el siguiente dardo. */
  private showTarget() {
    this.curTarget = null;
    const s = this.ui.state;
    if (!profile().settings.showCheckout) return this.aimAt(null);
    const p = s.players[s.current];
    const dartsLeft = 3 - s.turn.length;
    switch (s.config.mode) {
      case 'x01': {
        const route = p.remaining <= 170 ? checkoutRoute(p.remaining, dartsLeft, s.config.doubleOut) : null;
        if (route && s.turn.length === 0) audio.ready();
        if (route) return this.aimAt(route[0], route.length === 1 ? 'finish' : 'route');
        // sin cierre: sugerencia para dejar una buena salida (solo cuando ya se acerca el final)
        if (p.remaining <= 200) return this.aimAt(suggestTarget(p.remaining, dartsLeft, s.config.doubleOut), 'score');
        return this.aimAt(null);
      }
      case 'atc': {
        const t = chooseTarget(s, s.current);
        return this.aimAt(t, 'route', t !== 'DB');
      }
      case 'cricket':
        return this.aimAt(chooseTarget(s, s.current), 'route');
      default:
        return this.aimAt(null);
    }
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
        if (m.serverNow) this.ui.clockOffset = m.serverNow - Date.now();
        this.remoteQueue.push(m);
        if (m.timeout && m.last?.player === this.you && this.view.isAiming) this.view.cancelAim();
        this.remoteWake?.();
      }),
      net.on('match_end', (m) => {
        this.clearReconnect();
        this.remoteQueue.push(m);
        if (this.view.isAiming) this.view.cancelAim();
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
        // el servidor guarda la partida unos segundos: esperamos a reconectar antes de darla por perdida
        if (this.ui.result || this.reconnectTimer) return;
        this.ui.reconnecting = true;
        if (this.view.isAiming) this.view.cancelAim();
        this.emit();
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.remoteQueue.push({ t: 'match_end', winner: 1 - this.you, reason: 'disconnect', trophies: [0, 0] });
          this.remoteWake?.();
        }, 32000);
      }),
    );
  }

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private clearReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ui.reconnecting) {
      this.ui.reconnecting = false;
      this.emit();
    }
  }

  /** Cuenta atrás del primer turno online (llega con el inicio de la partida). */
  setDeadline(deadline: number, serverNow?: number) {
    this.ui.deadline = deadline;
    if (serverNow) this.ui.clockOffset = serverNow - Date.now();
    this.emit();
  }

  /** El servidor nos reenvió la partida tras reconectar: retomamos su estado. */
  resync(m: Extract<ServerMsg, { t: 'match_start' }>) {
    this.clearReconnect();
    if (this.view.isAiming) this.view.cancelAim();
    if (m.serverNow) this.ui.clockOffset = m.serverNow - Date.now();
    this.remoteQueue.push({ t: 'state', state: m.state, last: null, deadline: m.deadline ?? 0 });
    this.remoteWake?.();
  }

  /** Online: el resultado (y las copas) los decide el servidor. */
  private async awaitRemoteEnd(fallbackWinner: number) {
    const timeout = sleep(6000).then(() => null);
    for (;;) {
      const m = await Promise.race([this.nextRemote().catch(() => null), timeout]);
      if (this.aborted) return;
      if (!m) return this.finish(fallbackWinner, 'win');
      if (m.t === 'match_end') return this.handleRemoteEnd(m);
    }
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
    else this.emit();
    void mine;
  }

  private async remoteStep() {
    this.ui.phase = 'wait';
    if (this.ui.state.current !== this.you) {
      this.view.setTurnCam(true);
      this.clearBonus();
    }
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
      if (this.aborted) return;
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
    if (this.ui.state.winner !== null && !this.ui.result) {
      // ya estaba decidida (p. ej. durante la celebración): se cierra con su resultado real
      this.finish(this.ui.state.winner, 'win');
    } else if (forfeit && this.ui.state.winner === null) {
      this.finish(this.setup.players.length > 1 ? 1 - this.you : 0, 'forfeit');
    } else {
      this.cleanup();
      matchStore.set(null);
    }
  }

  private cleanup() {
    this.aborted = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.view.setTurnCam(false);
    this.view.fire = false;
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
    const solo = setup.players.length === 1;
    engine.timeScale = 1;
    const res: MatchResult = {
      bestCombo: this.ui.bestCombo,
      won: winner === you && reason !== 'limit',
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

    if (setup.type === 'event') {
      const def = currentLiveEvent().def;
      const turns = s.history.filter((h) => h.player === you && !h.bust);
      const ev = scoreEventMatch(def, res.won && reason !== 'forfeit', {
        bulls: this.myHits.filter((h) => h.ring === 'SB' || h.ring === 'DB').length,
        dbulls: this.myHits.filter((h) => h.ring === 'DB').length,
        trebles: this.myHits.filter((h) => h.ring === 'T').length,
        doubles: this.myHits.filter((h) => h.ring === 'D' || h.ring === 'DB').length,
        tons: Math.max(me.tons, turns.filter((h) => h.total >= 100).length),
        s180: me.max180,
        checkout: res.won && s.config.mode === 'x01' && !!s.config.doubleOut && reason === 'win',
      });
      res.eventPoints = reason === 'forfeit' ? 0 : ev.total;
      res.eventLines = reason === 'forfeit' ? [] : ev.lines;
      addEventPoints(res.eventPoints);
    }

    if (setup.type === 'challenge' && setup.challenge) {
      const score = setup.challenge.score(this.ui.challengeHits);
      res.challengeScore = score;
      res.stars = setup.challenge.stars.filter((x) => score >= x).length;
      res.won = (res.stars ?? 0) > 0;
    }

    mutate((p) => {
      if (setup.type === 'tutorial') return;
      const avg = threeDartAvg(me);
      if (setup.type !== 'challenge' && setup.type !== 'local' && !solo) {
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
      } else if (setup.type === 'event') {
        res.xp = reason === 'forfeit' ? 0 : res.won ? 35 : 15;
        res.coins = res.won ? 150 + setup.arena * 60 : 0;
        p.coins += res.coins;
        addSeasonXp(p, res.won ? 25 : 10);
      } else if (setup.type === 'tournament') {
        res.xp = res.won ? 40 : 15;
        addSeasonXp(p, res.won ? 20 : 8);
      } else if (setup.type === 'challenge') {
        res.xp = 15;
        addSeasonXp(p, 15);
      }
      if (reason !== 'forfeit' && this.ui.bonusCoins > 0) {
        res.bonusCoins = this.ui.bonusCoins;
        p.coins += this.ui.bonusCoins;
      }
      if (res.xp) res.levelUps = addXp(p, res.xp);
      p.history = [{ at: Date.now(), mode: setup.type, opponent: opp.name, won: res.won, avg: Math.round(avg * 10) / 10, online: !!setup.online }, ...p.history].slice(0, 30);
    });

    if (isRanked && res.won) {
      res.chest = awardWinChest(setup.arena);
      res.chestFull = res.chest === null;
    }
    // progreso de torneo, desafío y tutorial: se guarda ya (no al pulsar «Continuar»)
    if (setup.type === 'tournament') res.post = applyTournament(res.won);
    else if (setup.type === 'challenge') res.post = applyChallenge(res.challengeScore ?? 0, res.stars ?? 0);
    else if (setup.type === 'tutorial') res.post = applyTutorial();
    if (setup.type !== 'tutorial' && setup.type !== 'challenge') {
      if (!solo) track({ type: 'match', won: res.won, online: setup.type === 'online', checkoutDouble: res.won && s.config.mode === 'x01' && s.config.doubleOut && reason === 'win', ranked: isRanked });
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
