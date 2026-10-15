// Arenas (ligas): copas necesarias, entrada, premio, reglas y nivel de los rivales.

import type { MatchConfig } from '@shared/rules';
import type { ChestType } from './chests';

export interface ArenaDef {
  id: number;
  name: string;
  subtitle: string;
  trophies: number;
  entry: number;
  prize: number;
  config: MatchConfig;
  /** desviación típica (mm) de los bots: [mín, máx] */
  botSigma: [number, number];
  xpWin: number;
  xpLose: number;
  color: string;
  icon: string;
  /** probabilidad de cofre especial al ganar */
  chestBonus: Partial<Record<ChestType, number>>;
}

export const ARENAS: ArenaDef[] = [
  {
    id: 0,
    name: 'El Pub de Barrio',
    subtitle: '301 · Cierre libre',
    trophies: 0,
    entry: 50,
    prize: 100,
    config: { mode: 'x01', start: 301, doubleOut: false },
    botSigma: [26, 34],
    xpWin: 30,
    xpLose: 12,
    color: '#ff5a3a',
    icon: '🍺',
    chestBonus: {},
  },
  {
    id: 1,
    name: 'Taberna del Puerto',
    subtitle: '301 · Doble para cerrar',
    trophies: 300,
    entry: 150,
    prize: 300,
    config: { mode: 'x01', start: 301, doubleOut: true },
    botSigma: [21, 27],
    xpWin: 40,
    xpLose: 15,
    color: '#21c8ff',
    icon: '⚓',
    chestBonus: { gold: 0.04 },
  },
  {
    id: 2,
    name: 'Club Neón',
    subtitle: '501 · Doble para cerrar',
    trophies: 700,
    entry: 400,
    prize: 800,
    config: { mode: 'x01', start: 501, doubleOut: true },
    botSigma: [17, 22],
    xpWin: 55,
    xpLose: 20,
    color: '#ff2bd6',
    icon: '🪩',
    chestBonus: { gold: 0.06, epic: 0.01 },
  },
  {
    id: 3,
    name: 'Salón Dorado',
    subtitle: '501 · Doble para cerrar',
    trophies: 1200,
    entry: 1000,
    prize: 2000,
    config: { mode: 'x01', start: 501, doubleOut: true },
    botSigma: [13.5, 17.5],
    xpWin: 70,
    xpLose: 25,
    color: '#ffc93a',
    icon: '🏛️',
    chestBonus: { gold: 0.08, epic: 0.02 },
  },
  {
    id: 4,
    name: 'Gran Arena',
    subtitle: '501 · Mejor de 3 legs',
    trophies: 1800,
    entry: 2500,
    prize: 5000,
    config: { mode: 'x01', start: 501, doubleOut: true, legsToWin: 2 },
    botSigma: [10.5, 13.5],
    xpWin: 90,
    xpLose: 30,
    color: '#3d8bff',
    icon: '🏟️',
    chestBonus: { gold: 0.1, epic: 0.03, legendary: 0.005 },
  },
  {
    id: 5,
    name: 'Campeonato Mundial',
    subtitle: '501 · Mejor de 3 legs',
    trophies: 2600,
    entry: 6000,
    prize: 12000,
    config: { mode: 'x01', start: 501, doubleOut: true, legsToWin: 2 },
    botSigma: [8.5, 10.5],
    xpWin: 110,
    xpLose: 35,
    color: '#ffb81f',
    icon: '🌍',
    chestBonus: { gold: 0.12, epic: 0.04, legendary: 0.01 },
  },
  {
    id: 6,
    name: 'Olimpo de Leyendas',
    subtitle: '501 · Mejor de 3 legs',
    trophies: 3500,
    entry: 15000,
    prize: 30000,
    config: { mode: 'x01', start: 501, doubleOut: true, legsToWin: 2 },
    botSigma: [6.8, 8.5],
    xpWin: 140,
    xpLose: 45,
    color: '#b88aff',
    icon: '⚡',
    chestBonus: { gold: 0.15, epic: 0.05, legendary: 0.015 },
  },
];

export function arenaForTrophies(t: number): number {
  let a = 0;
  for (const ar of ARENAS) if (t >= ar.trophies) a = ar.id;
  return a;
}

export function nextArena(t: number): ArenaDef | null {
  return ARENAS.find((a) => a.trophies > t) ?? null;
}
