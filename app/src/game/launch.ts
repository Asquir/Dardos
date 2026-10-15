// Creación de partidas: clasificatorias contra bots, online, entrenamiento, desafíos, torneos y tutorial.

import { makeBot, rng } from '@shared/bot';
import type { MatchConfig } from '@shared/rules';
import type { AvatarConfig, DartLook, PublicProfile } from '@shared/protocol';
import { ARENAS } from '../meta/arenas';
import { BARRELS, FLIGHTS, SHAFTS, HAIRS, BEARDS, GLASSES, HATS, SHIRTS, SKIN_TONES, HAIR_COLORS, SHIRT_COLORS } from '../meta/catalog';
import { profile, mutate } from '../meta/profile';
import { startMatch, type MatchPlayer, type MatchSetup, type Match } from './match';
import { todaysChallenge } from '../meta/progression';

export function randomAvatar(seed: number): AvatarConfig {
  const r = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  return {
    skin: Math.floor(r() * SKIN_TONES.length),
    hair: pick(HAIRS).id,
    hairColor: Math.floor(r() * 7),
    eyes: Math.floor(r() * 5),
    beard: r() < 0.55 ? 'none' : pick(BEARDS).id,
    glasses: r() < 0.75 ? 'none' : pick(GLASSES).id,
    hat: r() < 0.7 ? 'none' : pick(HATS).id,
    shirt: pick(SHIRTS).id,
    shirtColor: Math.floor(r() * SHIRT_COLORS.length),
    number: Math.floor(r() * 99) + 1,
  };
}
void HAIR_COLORS;

export function randomDart(seed: number, arena: number): DartLook {
  const r = rng(seed * 7 + 3);
  const ok = <T extends { arena: number; exclusive?: boolean }>(a: T[]) => a.filter((x) => x.arena <= arena && !x.exclusive);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  return { barrel: (pick(ok(BARRELS)) as { id: string }).id, shaft: (pick(ok(SHAFTS)) as { id: string }).id, flight: (pick(ok(FLIGHTS)) as { id: string }).id };
}

export function humanPlayer(): MatchPlayer {
  const p = profile();
  return { kind: 'human', name: p.name, level: p.level, trophies: p.trophies, avatar: p.avatar, dart: p.equipped, club: p.club?.tag };
}

export function botPlayer(arenaId: number, opts: { sigma?: number; trophies?: number; seed?: number; name?: string } = {}): MatchPlayer {
  const arena = ARENAS[arenaId] ?? ARENAS[0];
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const r = rng(seed);
  const sigma = opts.sigma ?? arena.botSigma[0] + r() * (arena.botSigma[1] - arena.botSigma[0]);
  const bot = makeBot(seed, sigma, opts.trophies ?? Math.max(arena.trophies, profile().trophies));
  return {
    kind: 'bot',
    name: opts.name ?? bot.name,
    level: bot.level,
    trophies: bot.trophies,
    avatar: randomAvatar(seed),
    dart: randomDart(seed, arenaId),
    bot,
  };
}

export function remotePlayer(pp: PublicProfile): MatchPlayer {
  return { kind: 'remote', name: pp.name, level: pp.level, trophies: pp.trophies, avatar: pp.avatar, dart: pp.dart, club: pp.club?.tag };
}

/** Partida clasificatoria contra la máquina (paga la entrada). */
export function rankedSetup(arenaId: number): MatchSetup | null {
  const arena = ARENAS[arenaId];
  const p = profile();
  if (p.coins < arena.entry) return null;
  mutate((pp) => (pp.coins -= arena.entry));
  const starter = Math.random() < 0.5 ? 0 : 1;
  return {
    type: 'ranked',
    config: arena.config,
    arena: arenaId,
    players: [humanPlayer(), botPlayer(arenaId)],
    starter,
    entry: arena.entry,
    prize: arena.prize,
    title: arena.name,
  };
}

export function trainingSetup(kind: 'atc' | 'cricket' | 'x01' | 'free' | 'checkout', vsBot: boolean): MatchSetup {
  const p = profile();
  const arena = Math.min(p.selectedArena, 6);
  let config: MatchConfig;
  let dartLimit: number | undefined;
  switch (kind) {
    case 'atc':
      config = { mode: 'atc' };
      break;
    case 'cricket':
      config = { mode: 'cricket', maxTurns: 20 };
      break;
    case 'free':
      config = { mode: 'free', maxTurns: 10 };
      break;
    case 'checkout': {
      const opts = [40, 50, 61, 76, 81, 96, 100, 101, 110, 121, 136, 141, 160, 170];
      config = { mode: 'x01', start: opts[Math.floor(Math.random() * opts.length)], doubleOut: true };
      dartLimit = 9;
      break;
    }
    default:
      config = { mode: 'x01', start: 501, doubleOut: true };
  }
  const players = [humanPlayer()];
  if (vsBot && kind !== 'checkout') players.push(botPlayer(arena));
  return { type: 'training', config, arena, players, starter: 0, dartLimit, title: 'Entrenamiento' };
}

export function localSetup(names: string[], config: MatchConfig): MatchSetup {
  const p = profile();
  const players = names.map((n, i) => ({ ...humanPlayer(), name: n, dart: i === 0 ? p.equipped : { barrel: 'b_nickel', shaft: 's_alu_blue', flight: 'f_blue' } }));
  return { type: 'local', config, arena: p.selectedArena, players, starter: 0, title: 'Partida local' };
}

export function challengeSetup(): MatchSetup {
  const ch = todaysChallenge();
  return { type: 'challenge', config: { mode: 'free' }, arena: profile().selectedArena, players: [humanPlayer()], starter: 0, challenge: ch, dartLimit: ch.darts, title: ch.name };
}

export function tutorialSetup(): MatchSetup {
  return {
    type: 'tutorial',
    config: { mode: 'x01', start: 101, doubleOut: false },
    arena: 0,
    players: [humanPlayer(), botPlayer(0, { sigma: 60, name: 'Paco "El Novato"', seed: 1234 })],
    starter: 0,
    assist: 0.6,
    title: 'Tutorial',
  };
}

export function launch(setup: MatchSetup): Match {
  return startMatch(setup);
}
