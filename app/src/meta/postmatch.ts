// Resultado de las partidas especiales (torneo, desafío diario, tutorial). Se aplica al terminar
// la partida, no al pulsar «Continuar», para que no se pierda ni se pueda repetir si se cierra la app.

import { dayKey } from '../core/store';
import { mutate, profile } from './profile';
import { todaysChallenge } from './progression';
import type { Reward } from './chests';

export interface PostMatch {
  /** título de la ventana de premio (si hay premio) */
  title?: string;
  /** premio ya concedido (solo para mostrarlo) */
  reward?: Reward;
  toast?: string;
  good?: boolean;
  champion?: boolean;
}

/** Monedas y gemas al momento; los cofres van a la cola y se abren con su animación. */
function give(reward: Reward, title: string) {
  mutate((p) => {
    p.coins += reward.coins ?? 0;
    p.gems += reward.gems ?? 0;
    if (reward.chest) p.pendingChests.push({ type: reward.chest, title });
  });
}

export const ROUND_NAMES = ['Cuartos de final', 'Semifinal', 'Gran Final'];

export function applyTournament(won: boolean): PostMatch {
  const t = profile().tournament;
  if (!t || !t.alive || t.round >= 3) return {};
  const round0 = t.round; // ¡antes de modificar el torneo!
  const entry = t.entry;
  const me = t.bracket.findIndex((b) => b.sigma === 0);
  const alive = t.rounds[round0];
  const next: number[] = [];
  for (let i = 0; i < alive.length; i += 2) {
    const a = alive[i];
    const b = alive[i + 1];
    if (a === me || b === me) next.push(won ? me : a === me ? b : a);
    else {
      // partidos entre bots: gana más a menudo el de menor sigma
      const sa = t.bracket[a].sigma;
      const sb = t.bracket[b].sigma;
      next.push(Math.random() < sb / (sa + sb) ? a : b);
    }
  }
  const round = round0 + 1;
  const champion = won && round === 3;
  mutate((pp) => {
    if (!pp.tournament) return;
    pp.tournament.rounds.push(next);
    pp.tournament.round = round;
    pp.tournament.alive = won && round < 3;
    pp.tournament.won = champion;
    if (champion) pp.stats.tournamentsWon++;
  });
  if (champion) {
    const reward: Reward = { coins: entry * 6, chest: 'gold' };
    give(reward, '¡CAMPEÓN DEL TORNEO!');
    return { title: '¡CAMPEÓN DEL TORNEO!', reward, champion: true };
  }
  if (!won) {
    // eliminado en la ronda que se acaba de jugar
    const prize = round0 === 2 ? Math.round(entry * 2.5) : round0 === 1 ? entry : 0;
    if (prize) {
      const title = round0 === 2 ? '¡Subcampeón!' : 'Semifinalista';
      give({ coins: prize }, title);
      return { title, reward: { coins: prize } };
    }
    return { toast: 'Eliminado en cuartos. ¡La próxima vez!' };
  }
  return { toast: `¡Pasas a ${ROUND_NAMES[round]}!`, good: true };
}

export function applyChallenge(score: number, stars: number): PostMatch {
  const ch = todaysChallenge();
  const today = dayKey();
  const p = profile();
  const prevStars = p.challenge.day === today ? p.challenge.claimed : 0;
  mutate((pp) => {
    if (pp.challenge.day !== today) pp.challenge = { day: today, best: 0, claimed: 0 };
    pp.challenge.best = Math.max(pp.challenge.best, score);
    pp.challenge.claimed = Math.max(pp.challenge.claimed, stars);
  });
  if (stars > prevStars) {
    const reward: Reward = { coins: 0, gems: 0 };
    for (let s = prevStars; s < stars; s++) {
      const rw = ch.rewards[s];
      reward.coins! += rw.coins ?? 0;
      reward.gems! += rw.gems ?? 0;
      if (rw.chest) reward.chest = rw.chest as Reward['chest'];
    }
    const title = `¡${stars} estrella${stars > 1 ? 's' : ''}!`;
    give(reward, title);
    return { title, reward };
  }
  return { toast: stars ? 'Ya tenías estas estrellas hoy. ¡Inténtalo para más!' : 'Sin estrellas esta vez. ¡Prueba otra vez!' };
}

/** El regalo del tutorial solo se da la primera vez. */
export function applyTutorial(): PostMatch {
  const first = !profile().tutorial.rewarded;
  mutate((p) => {
    if (first) {
      p.coins += 200;
      const free = p.chests.findIndex((c) => c === null);
      if (free >= 0) p.chests[free] = { type: 'silver', arena: 0, readyAt: Date.now() + 4000 };
      p.tutorial.rewarded = true;
    }
    if (!p.tutorial.tips.includes('match')) p.tutorial.tips.push('match');
  });
  return {};
}
