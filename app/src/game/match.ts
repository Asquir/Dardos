// Controlador de partida: une reglas, jugadores (humano, bot, online), la vista 3D y la interfaz.

import { resolveHit, scoreAt, targetPoint, SEGMENTS, type Hit, type Target } from '@shared/board';
import { applyThrow, createMatch, forfeitTurn, threeDartAvg, roundTarget, KILLER_MARKS, ROUND_MODES, type MatchConfig, type MatchState, type ThrowEvent } from '@shared/rules';
import { botThrow, chooseTarget, gaussian, rng, type BotProfile } from '@shared/bot';
import { checkoutRoute, routeLabel, suggestTarget } from '@shared/checkout';
import { trophyDelta, type AvatarConfig, type DartLook, type ServerMsg } from '@shared/protocol';
import { Store } from '../core/store';
import { gameView, type ThrowQuality } from '../engine/gameView';
import { engine } from '../engine/renderer';
import { audio } from '../services/audio';
import { haptics } from '../services/haptics';
import { net } from '../services/net';
import { mutate, profile, isVip, packHit } from '../meta/profile';
import { ARENAS, arenaForTrophies } from '../meta/arenas';
import { addXp, awardWinChest, dartStats, track, noteMatchForAds, addSeasonXp } from '../meta/economy';
import type { ChestType } from '../meta/chests';
import type { ChallengeDef } from '../meta/progression';
import { currentLiveEvent, scoreEventMatch } from '../meta/liveEvents';
import { addEventPoints } from '../meta/events';
import { EMOTES } from '../meta/catalog';
import { applyTournament, applyChallenge, applyTutorial, type PostMatch } from '../meta/postmatch';
import { AWARDS, detectAwards, type AwardId } from './awards';
import { encodeDuel } from '../meta/duel';
import { applyCareer } from '../meta/career';
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
  /** id del jugador online (para añadirlo a amigos) */
  id?: string;
  /** el servidor lo marca como rival de la máquina: se enseña siempre */
  ai?: boolean;
}

export type MatchType = 'ranked' | 'training' | 'tournament' | 'challenge' | 'private' | 'tutorial' | 'online' | 'local' | 'event' | 'duel' | 'career';

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
  /** reto entre amigos: semilla y, si se acepta un código, la puntuación a batir */
  duel?: { seed: number; rival?: { name: string; score: number } };
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
  /** récord personal batido en este modo */
  newRecord?: boolean;
  /** premios de turno conseguidos en la partida */
  awards?: AwardId[];
  /** reto entre amigos: tu puntuación y el código para pasarlo */
  duel?: { score: number; code: string; rival?: { name: string; score: number } };
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
  /** premio de turno en pantalla (Hat Trick, Tres en la cama…) */
  award: { key: number; id: AwardId; player: number; also: AwardId[]; coins: number } | null;
  /** premios del jugador en esta partida */
  awardsWon: AwardId[];
  /** reloj de la tirada del jugador (segundos que quedan; se actualiza sin redibujar toda la pantalla) */
  clock: { total: number; left: number; key: number } | null;
  /** sorteo al bull: distancia (mm) de cada jugador, null si aún no ha tirado */
  bullOff: { dist: (number | null)[]; cur: number; winner: number | null } | null;
  /** repetición a cámara lenta en marcha */
  replay: boolean;
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
  /** dardos de cada jugador en el leg actual (para el nueve dardos) */
  private legDarts: number[] = [];
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
      award: null,
      awardsWon: [],
      bullOff: null,
      replay: false,
      clock: null,
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
    // los modos menos conocidos enseñan sus reglas un poco más (se puede saltar tocando)
    const mode = this.setup.config.mode;
    const introMs = mode === 'x01' || mode === 'free' || this.setup.type === 'tutorial' ? 1500 : 3600;
    const skip = new Promise<void>((r) => (this.skipIntroFn = r));
    await Promise.all([Promise.race([sleep(introMs), skip.then(() => sleep(250))]), v.warmup(looks)]);
    if (this.aborted) return;
    if (this.wantsBullOff()) {
      await this.runBullOff();
      if (this.aborted) return;
    }
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
    if (this.ui.state.turn.length === 0) {
      this.robinTurn = false;
      this.callRequire(idx);
    }
    if (idx === this.you && this.ui.state.turn.length === 0) this.pickBonus();
    this.startShotClock();
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
    this.stopShotClock();
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
    await this.view.throwDart({ x: hit.x, y: hit.y, look: pl.dart, bounce: hit.bounce, fromHand: true, cine, robin: this.robinHood(hit) });
    if (this.aborted) return;
    this.onImpact(hit, idx);
    if (cine) this.endCine(hit);
    await this.applyLocal(hit, idx);
  }

  /** El locutor anuncia lo que te queda cuando ya tienes cierre ("Te quedan 32"). */
  private callRequire(idx: number) {
    const s = this.ui.state;
    if ((s.config.mode !== 'x01' && s.config.mode !== 'c121') || this.setup.players[idx].kind !== 'human') return;
    const left = s.players[idx].remaining;
    if (left > 170 || !checkoutRoute(left, 3, s.config.mode === 'c121' || s.config.doubleOut)) return;
    setTimeout(() => audio.say(`Te quedan ${left}`), 250);
  }

  /** De vez en cuando, un dardo que cae pegado a otro se clava en su cola: ¡Robin Hood! */
  private robinTurn = false;
  private robinHood(hit: Hit): number | undefined {
    if (hit.bounce || this.setup.type === 'tutorial') return undefined;
    const i = this.view.robinHoodSpot(hit.x, hit.y);
    if (i < 0 || Math.random() > 0.4) return undefined;
    this.robinTurn = true;
    audio.clank();
    return i;
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
    if (this.ui.state.turn.length === 0) this.robinTurn = false;
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
    await this.view.throwDart({ x: hit.x, y: hit.y, look: pl.dart, bounce: hit.bounce, cine, robin: this.robinHood(hit) });
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
    this.legDarts[player] = (this.legDarts[player] ?? 0) + 1;
    if (this.setup.type === 'challenge') this.ui.challengeHits = [...this.ui.challengeHits, hit];
    const localHuman = this.setup.online ? player === this.you : this.setup.players[player].kind === 'human' && player === 0;
    if (localHuman) this.myHits.push(hit);
    if (localHuman && this.setup.type !== 'tutorial') {
      track({ type: 'dart', hit });
      this.recordDart(hit);
    }
    if (player === this.you && this.setup.type !== 'local' && this.setup.type !== 'tutorial') this.scoreBonus(hit, pos);
    this.emit();
  }

  // ------------------------------------------------------------------ estadísticas

  /** Guarda el impacto para el mapa de calor y, si el dardo iba a un doble de cierre, el intento. */
  private recordDart(hit: Hit) {
    const s = this.ui.state; // todavía sin aplicar el dardo
    const p = s.players[s.current];
    let dbl: string | null = null;
    if (s.config.mode === 'x01' && s.config.doubleOut && p.remaining <= 50) {
      const route = checkoutRoute(p.remaining, 3 - s.turn.length, true);
      if (route && route.length === 1 && (route[0][0] === 'D' || route[0] === 'DB')) dbl = route[0];
    }
    mutate((pp) => {
      if (!hit.bounce && Math.hypot(hit.x, hit.y) < 400) {
        pp.hitLog.push(packHit(hit.x, hit.y));
        if (pp.hitLog.length > 800) pp.hitLog.splice(0, pp.hitLog.length - 800);
      }
      if (dbl) {
        const d = pp.doubles[dbl] ?? [0, 0];
        d[0]++;
        if (dbl === 'DB' ? hit.ring === 'DB' : hit.ring === 'D' && hit.num === parseInt(dbl.slice(1), 10)) d[1]++;
        pp.doubles[dbl] = d;
      }
    });
  }

  // ------------------------------------------------------------------ sorteo al bull

  /** Contra la máquina o en local se sortea quién empieza tirando al bull (online lo decide el servidor). */
  private wantsBullOff(): boolean {
    const t = this.setup.type;
    if (this.setup.online || this.setup.players.length < 2 || t === 'tutorial' || t === 'challenge') return false;
    if (this.ui.state.turn.length || this.ui.state.history.length) return false; // partida retomada
    return profile().settings.bullOff !== false;
  }

  private async runBullOff() {
    const n = this.setup.players.length;
    this.ui.bullOff = { dist: Array(n).fill(null), cur: 0, winner: null };
    this.say('blue', 'SORTEO AL BULL', 'El más cerca del centro empieza');
    audio.ready();
    await sleep(900);
    for (let i = 0; i < n && !this.aborted; i++) {
      this.ui.bullOff = { ...this.ui.bullOff!, cur: i };
      const pl = this.setup.players[i];
      let x: number;
      let y: number;
      if (pl.kind === 'human') {
        this.view.setTurnCam(false);
        this.view.setTarget('DB', 'route', false, 'SORTEO');
        this.ui.phase = 'aim';
        this.emit();
        const shot = await this.view.humanAim({
          look: pl.dart,
          stats: dartStats(profile()),
          sensitivity: profile().settings.sensitivity,
          control: profile().settings.control,
          leftHanded: profile().settings.leftHanded,
          assist: this.setup.assist,
        });
        if (this.aborted || !shot) return;
        x = shot.x;
        y = shot.y;
      } else {
        this.view.setTurnCam(true);
        this.ui.phase = 'wait';
        this.emit();
        await sleep(350);
        const sigma = (pl.bot?.skill.sigma ?? 25) * 1.1;
        await this.view.botAim(0, 0, 0.6);
        if (this.aborted) return;
        x = gaussian(this.r) * sigma;
        y = gaussian(this.r) * sigma;
      }
      this.ui.phase = 'wait';
      const hit = resolveHit(x, y, Math.random());
      audio.whoosh();
      await this.view.throwDart({ x: hit.x, y: hit.y, look: pl.dart, bounce: hit.bounce, fromHand: pl.kind === 'human' });
      if (this.aborted) return;
      const d = hit.bounce ? 999 : Math.hypot(hit.x, hit.y);
      if (hit.bounce) audio.clank();
      else audio.thud(hit.ring === 'DB' ? 1.2 : 1);
      if (hit.ring === 'DB') audio.bull();
      const dist: (number | null)[] = [...this.ui.bullOff!.dist];
      dist[i] = Math.round(d * 10) / 10;
      this.ui.bullOff = { ...this.ui.bullOff!, dist };
      if (!hit.bounce) this.view.highlight(hit);
      const pos = this.view.toScreen(hit.x, hit.y);
      this.ui.popups = [...this.ui.popups.slice(-4), { id: uid++, x: pos.x, y: pos.y, label: hit.bounce ? 'REBOTE' : `${dist[i]} mm`, points: 0, ring: hit.ring === 'DB' || hit.ring === 'SB' ? hit.ring : 'S' }];
      this.emit();
      await sleep(500);
    }
    if (this.aborted) return;
    const dist = this.ui.bullOff!.dist.map((d) => d ?? 999);
    const best = Math.min(...dist);
    const winner = dist.indexOf(best);
    this.ui.bullOff = { ...this.ui.bullOff!, winner };
    this.view.setTarget(null);
    this.say('green', `¡EMPIEZA ${this.setup.players[winner].name.toUpperCase()}!`, best < 999 ? `a ${best} mm del centro` : 'todos rebotaron');
    audio.cheer(0.6);
    await sleep(1500);
    if (this.aborted) return;
    await this.view.clearDarts();
    this.ui.popups = [];
    this.ui.state = createMatch(this.setup.config, n, winner);
    this.ui.bullOff = null;
    this.updateCheckout();
    this.emit();
  }

  // ------------------------------------------------------------------ premios de turno

  /**
   * Busca premios (Hat Trick, Tres en la cama…) en el turno que acaba de terminar y los enseña.
   * Devuelve true si hay uno grande en pantalla (sustituye al mensaje normal del turno).
   */
  private turnAwards(event: ThrowEvent, idx: number): number {
    const s = this.ui.state;
    const last = s.history.at(-1);
    if (!last || last.player !== idx || this.setup.type === 'tutorial') return 0;
    const checkout = (event === 'legWon' || event === 'matchWon') && s.legWinner === idx && s.config.mode === 'x01' && !last.bust;
    const list = detectAwards({
      mode: s.config.mode,
      hits: last.hits,
      total: last.total,
      bust: last.bust,
      checkout,
      startLeft: checkout ? last.total : 0,
      legDarts: this.legDarts[idx] ?? 0,
      start: s.config.start,
    });
    if (this.robinTurn) {
      list.push('robinhood');
      list.sort((a, b) => AWARDS[b].tier - AWARDS[a].tier);
      this.robinTurn = false;
    }
    if (!list.length) return 0;
    const top = AWARDS[list[0]];
    const mine = idx === this.you && this.setup.type !== 'local';
    let coins = 0;
    if (mine) {
      for (const a of list) coins += AWARDS[a].coins * this.bonusBase();
      coins = this.paysBonus ? coins : 0;
      this.ui.bonusCoins += coins;
      this.ui.awardsWon = [...this.ui.awardsWon, ...list];
      mutate((p) => {
        for (const a of list) p.awards[a] = (p.awards[a] ?? 0) + 1;
      });
    }
    if (top.tier < 2) return top.tier; // los "ton" se quedan en el mensaje normal del turno
    this.ui.award = { key: uid++, id: top.id, player: idx, also: list.slice(1), coins };
    audio.fanfare(top.tier);
    audio.say(top.name.replace(/[¡!]/g, ''), true);
    if (mine) haptics.heavy();
    this.view.celebrate(top.tier >= 3 ? 1.1 : 0.8);
    if (!mine && this.setup.players[idx].kind === 'bot') this.botReact('cool', 0.5);
    return top.tier;
  }

  // ------------------------------------------------------------------ reloj de la tirada

  private clockTimer = 0;
  private clockHold = false;

  /** Segundos para cada dardo (online manda el reloj del servidor; en el tutorial no hay prisa). */
  private get shotClockSecs(): number {
    if (this.setup.online || this.setup.type === 'tutorial') return 0;
    return profile().settings.shotClock ?? 15;
  }

  /** Para el reloj mientras hay una ventana abierta (pausa, ajustes…). */
  holdClock(on: boolean) {
    this.clockHold = on;
  }

  private startShotClock() {
    this.stopShotClock();
    const secs = this.shotClockSecs;
    if (!secs) return;
    const c = { total: secs, left: secs, key: uid++ };
    this.ui.clock = c;
    let last = performance.now();
    let warned = Math.ceil(secs);
    let grace = 0;
    this.clockTimer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (this.aborted || this.ui.clock !== c) return this.stopShotClock();
      if (this.clockHold || engine.paused || document.hidden || this.ui.phase !== 'aim') return;
      c.left = Math.max(0, c.left - dt);
      const whole = Math.ceil(c.left);
      if (whole < warned) {
        warned = whole;
        if (whole <= 5 && whole > 0) {
          audio.clockTick(whole <= 3);
          if (whole <= 3) haptics.light();
        }
      }
      if (c.left > 0) return;
      // con el dedo ya en el dardo le dejamos terminar el gesto (segundo y medio como mucho)
      if (this.view.isDragging && grace < 1.5) {
        grace += dt;
        return;
      }
      this.stopShotClock();
      audio.buzzer();
      haptics.error();
      this.say('red', '¡TIEMPO!', 'Dardo perdido');
      this.view.timeoutAim();
    }, 100);
  }

  private stopShotClock() {
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.clockTimer = 0;
    this.ui.clock = null;
  }

  // ------------------------------------------------------------------ repeticiones

  private get replaysOn(): boolean {
    return !this.setup.online && this.setup.type !== 'tutorial' && profile().settings.replays !== false;
  }

  private async playReplay() {
    // el premio ya se ha visto: la repetición va limpia, sin el emblema encima
    this.ui.award = null;
    this.ui.message = null;
    this.ui.replay = true;
    this.emit();
    await this.view.replayLast(1);
    this.ui.replay = false;
    this.emit();
  }

  /** Toque durante la repetición: se salta. */
  skipReplay() {
    this.view.skipReplay();
  }

  // ------------------------------------------------------------------ bonus y combos

  /** Solo dan monedas las partidas con algo en juego (si no, se podrían farmear en el entrenamiento). */
  private get paysBonus(): boolean {
    const t = this.setup.type;
    return t === 'ranked' || t === 'online' || t === 'event' || t === 'tournament' || t === 'career';
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
      const tier = this.turnAwards(event, idx);
      const won = tier >= 2;
      const streak = (this.ui.streak[idx] = (cfg.mode === 'x01' || cfg.mode === 'free') && turnTotal >= 100 ? (this.ui.streak[idx] ?? 0) + 1 : 0);
      if (cfg.mode === 'x01' || cfg.mode === 'free') {
        if (turnTotal === 180) {
          if (!won) this.say('gold', '¡180!', '¡MÁXIMO!');
          audio.oneEighty();
          haptics.heavy();
          this.view.celebrate(1.2);
          if (!human) this.botReact('shock', 0.6);
        } else if (turnTotal >= 140) {
          if (!won) this.say('purple', String(turnTotal), turnTotal >= 151 ? '⭐ HIGH TON' : '¡Tremendo!');
          audio.cheer(0.8);
          audio.callScore(turnTotal);
          this.view.celebrate(0.7);
        } else if (turnTotal >= 100) {
          if (!won) this.say(streak >= 2 ? 'purple' : 'blue', String(turnTotal), streak >= 2 ? `🔥 ¡EN RACHA! x${streak}` : '✨ LOW TON');
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
        this.legDarts = [];
        // al llegar al límite de rondas gana quien va mejor, no quien lanzó el último dardo
        const w = s.legWinner ?? idx;
        const closed = w === idx && (cfg.mode !== 'cricket' || s.players[w].marks.every((m) => m >= 3));
        const checkout = cfg.mode === 'x01' && closed ? turnTotal : 0;
        const title = event === 'matchWon' ? (closed ? '¡GAME SHOT!' : '¡FIN DE RONDAS!') : '¡LEG!';
        this.say('green', title, `${this.setup.players[w].name}${checkout ? ' · cierre de ' + checkout : event === 'matchWon' && !closed ? ' gana la partida' : ''}`);
        if (closed && cfg.mode === 'x01') setTimeout(() => audio.say(event === 'matchWon' ? 'Game shot, y la partida' : 'Game shot, y el leg', true), 350);
        audio.cheer(1.2);
        this.view.celebrate(1);
        if (event === 'matchWon') {
          // el dardo que gana la partida, otra vez a cámara lenta
          if (closed && this.replaysOn) {
            await sleep(tier >= 2 ? 2300 : 1300);
            if (this.aborted) return;
            await this.playReplay();
            await sleep(500);
          } else await sleep(2000);
          if (this.aborted) return;
          if (this.setup.online) return this.awaitRemoteEnd(s.winner ?? w);
          this.finish(s.winner ?? w, 'win');
          return;
        }
      }
      if (!human && this.setup.players[idx].kind === 'bot' && turnTotal >= 100) this.botReact('go', 0.35);
      // los momentazos (180, Big Fish, Hat Trick…) se repiten cuando ya se ha visto el premio
      if (tier >= 3 && this.replaysOn) {
        await sleep(2300);
        if (this.aborted) return;
        await this.playReplay();
      }
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
  private skipIntroFn: (() => void) | null = null;

  /** Toque durante la presentación: empieza ya. */
  skipIntro() {
    this.skipIntroFn?.();
  }
  private aimAt(t: Target | null, kind?: 'finish' | 'route' | 'score', wedge?: boolean) {
    this.curTarget = t;
    // la chapa solo habla de "cierre" en X01; en el resto de modos es el objetivo de la ronda
    const mode = this.ui.state.config.mode;
    const sub = mode === 'x01' || mode === 'c121' ? undefined : mode === 'killer' ? (kind === 'finish' ? 'RIVAL' : 'TU NÚMERO') : mode === 'shanghai' && kind === 'finish' ? '¡SHANGHÁI!' : 'OBJETIVO';
    this.view.setTarget(t, kind, wedge, sub);
  }

  /** Ilumina en la diana la zona a la que conviene tirar con el siguiente dardo. */
  private showTarget() {
    this.curTarget = null;
    const s = this.ui.state;
    if (!profile().settings.showCheckout) return this.aimAt(null);
    const p = s.players[s.current];
    const dartsLeft = 3 - s.turn.length;
    switch (s.config.mode) {
      case 'c121':
      case 'x01': {
        const route = p.remaining <= 170 ? checkoutRoute(p.remaining, dartsLeft, s.config.mode === 'c121' || s.config.doubleOut) : null;
        if (route && s.turn.length === 0) audio.ready();
        if (route) return this.aimAt(route[0], route.length === 1 ? 'finish' : 'route');
        // sin cierre: sugerencia para dejar una buena salida (solo cuando ya se acerca el final)
        if (p.remaining <= 200) return this.aimAt(suggestTarget(p.remaining, dartsLeft, s.config.mode === 'c121' || s.config.doubleOut), 'score');
        return this.aimAt(null);
      }
      case 'atc': {
        const t = chooseTarget(s, s.current);
        return this.aimAt(t, 'route', t !== 'DB');
      }
      case 'cricket':
        return this.aimAt(chooseTarget(s, s.current), 'route');
      case 'shanghai': {
        // primero el triple; si ya cayó, lo que falte para el Shanghái
        const t = chooseTarget(s, s.current);
        return this.aimAt(t, s.turn.length && t !== 'T' + (s.turnNo + 1) ? 'finish' : 'route');
      }
      case 'baseball':
      case 'halveit':
      case 'bobs27': {
        const t = roundTarget(s)!;
        return this.aimAt(t, 'route', t[0] === 'S');
      }
      case 'killer': {
        const me = s.players[s.current];
        const t = me.killerMarks >= KILLER_MARKS ? chooseTarget(s, s.current) : 'S' + me.num;
        return this.aimAt(t, me.killerMarks >= KILLER_MARKS ? 'finish' : 'route', true);
      }
      default:
        return this.aimAt(null);
    }
  }

  private updateCheckout() {
    const s = this.ui.state;
    if ((s.config.mode !== 'x01' && s.config.mode !== 'c121') || !profile().settings.showCheckout) {
      this.ui.checkout = '';
      return;
    }
    const p = s.players[s.current];
    const route = p.remaining <= 170 ? checkoutRoute(p.remaining, 3 - s.turn.length, s.config.mode === 'c121' || s.config.doubleOut) : null;
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
    this.stopShotClock();
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
      awards: this.ui.awardsWon,
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
      } else if (setup.type === 'tournament' || setup.type === 'career') {
        res.xp = res.won ? 40 : 15;
        addSeasonXp(p, res.won ? 20 : 8);
      } else if (setup.type === 'challenge') {
        res.xp = 15;
        addSeasonXp(p, 15);
      } else if (setup.type === 'duel') {
        res.xp = reason === 'forfeit' ? 0 : 10;
        addSeasonXp(p, 6);
      }
      // récords de los modos de práctica y de bar
      if (reason !== 'forfeit' && setup.type !== 'challenge') {
        const mode = s.config.mode;
        if (mode === 'killer') {
          if (res.won) p.records.killer = (p.records.killer ?? 0) + 1;
        } else if (ROUND_MODES.includes(mode) || mode === 'c121') {
          if (p.records[mode] === undefined || me.points > p.records[mode]) {
            res.newRecord = p.records[mode] !== undefined;
            p.records[mode] = me.points;
          }
        } else if (mode === 'atc' && me.remaining > 21) {
          if (p.records.atc === undefined || me.darts < p.records.atc) {
            res.newRecord = p.records.atc !== undefined;
            p.records.atc = me.darts;
          }
        }
      }
      if (reason !== 'forfeit' && this.ui.bonusCoins > 0) {
        res.bonusCoins = this.ui.bonusCoins;
        p.coins += this.ui.bonusCoins;
      }
      if (res.xp) res.levelUps = addXp(p, res.xp);
      const first9 = this.myHits.slice(0, 9);
      const f9 = s.config.mode === 'x01' && first9.length === 9 ? Math.round((first9.reduce((a, h) => a + h.points, 0) / 3) * 10) / 10 : undefined;
      p.history = [{ at: Date.now(), mode: setup.type, opponent: opp.name, won: res.won, avg: Math.round(avg * 10) / 10, online: !!setup.online, game: s.config.mode, f9 }, ...p.history].slice(0, 30);
    });

    if (setup.type === 'duel' && setup.duel) {
      const score = s.players[you].points;
      const rival = setup.duel.rival;
      res.won = !rival || score > rival.score;
      res.duel = { score, rival, code: encodeDuel({ seed: setup.duel.seed, score, name: profile().name }) };
    }
    if (isRanked && res.won) {
      res.chest = awardWinChest(setup.arena);
      res.chestFull = res.chest === null;
    }
    // progreso de torneo, desafío y tutorial: se guarda ya (no al pulsar «Continuar»)
    if (setup.type === 'tournament') res.post = applyTournament(res.won);
    else if (setup.type === 'career') res.post = applyCareer(res.won);
    else if (setup.type === 'challenge') res.post = applyChallenge(res.challengeScore ?? 0, res.stars ?? 0);
    else if (setup.type === 'tutorial') res.post = applyTutorial();
    if (setup.type !== 'tutorial' && setup.type !== 'challenge') {
      if (!solo) track({ type: 'match', won: res.won, online: setup.type === 'online', checkoutDouble: res.won && s.config.mode === 'x01' && s.config.doubleOut && reason === 'win', ranked: isRanked });
      if (setup.type === 'training' && reason !== 'forfeit') track({ type: 'training' });
      // el entrenamiento y los juegos de bar no cuentan para los anuncios
      if (isRanked || setup.type === 'event' || setup.type === 'tournament' || setup.type === 'career') noteMatchForAds();
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
