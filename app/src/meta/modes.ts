// Nombres, iconos y reglas resumidas de cada modo de juego (para menús, presentación y marcador).

import { HALVEIT_TARGETS, KILLER_LIVES, KILLER_MARKS, roundTarget, type MatchConfig, type MatchState, type ModeId } from '@shared/rules';
export { C121_ATTEMPTS, C121_DARTS } from '@shared/rules';

export interface ModeInfo {
  id: ModeId;
  name: string;
  icon: string;
  /** una línea para las tarjetas de los menús */
  short: string;
  /** reglas para la presentación de la partida */
  rules: string[];
  /** cuántos jugadores admite */
  players: [number, number];
}

export const MODES: Record<ModeId, ModeInfo> = {
  x01: {
    id: 'x01',
    name: 'X01',
    icon: '🎯',
    short: 'Baja de 501 (o 301) a cero.',
    rules: ['Resta lo que sumen tus 3 dardos.', 'Llega justo a cero: si te pasas, el turno no cuenta.', 'Con «doble para cerrar», el último dardo debe ser un doble.'],
    players: [1, 4],
  },
  cricket: {
    id: 'cricket',
    name: 'Cricket',
    icon: '🦗',
    short: 'Cierra del 15 al 20 y el bull.',
    rules: ['Marca 3 veces cada número (doble = 2, triple = 3).', 'En un número cerrado por ti y abierto en el rival, sumas puntos.', 'Gana quien lo cierre todo yendo por delante.'],
    players: [2, 4],
  },
  atc: {
    id: 'atc',
    name: 'Alrededor del reloj',
    icon: '🕐',
    short: 'Del 1 al 20 y el bull, en orden.',
    rules: ['Acierta cada número en orden, del 1 al 20.', 'Termina con el bull.', 'Gana quien llegue antes.'],
    players: [1, 4],
  },
  free: {
    id: 'free',
    name: 'Lanzamiento libre',
    icon: '🆓',
    short: 'Suma todo lo que puedas.',
    rules: ['Cada dardo suma sus puntos.', 'Mejora tu media de 3 dardos.'],
    players: [1, 1],
  },
  killer: {
    id: 'killer',
    name: 'Killer',
    icon: '🔪',
    short: 'Hazte Killer y elimina a los demás.',
    rules: [
      'A cada jugador le toca un número y ' + KILLER_LIVES + ' vidas.',
      `Marca ${KILLER_MARKS} veces tu número (doble = 2, triple = 3) para ser KILLER.`,
      'Siendo Killer, cada acierto en el número de un rival le quita vidas.',
      'El último que quede vivo gana.',
    ],
    players: [2, 4],
  },
  shanghai: {
    id: 'shanghai',
    name: 'Shanghái',
    icon: '🀄',
    short: '7 rondas: del 1 al 7. ¡Simple, doble y triple gana!',
    rules: ['En la ronda 1 se tira al 1, en la 2 al 2… hasta el 7.', 'Solo puntúa el número de la ronda (doble y triple multiplican).', '¡SHANGHÁI!: simple, doble y triple del número en un turno = victoria al instante.'],
    players: [1, 4],
  },
  halveit: {
    id: 'halveit',
    name: 'Halve-It',
    icon: '✂️',
    short: 'Acierta el objetivo de la ronda… o tus puntos a la mitad.',
    rules: ['Empiezas con 40 puntos.', 'Cada ronda tiene un objetivo: ' + HALVEIT_TARGETS.map(halveLabel).join(', ') + '.', 'Si fallas los 3 dardos, tus puntos se dividen a la mitad.'],
    players: [1, 4],
  },
  bobs27: {
    id: 'bobs27',
    name: "Bob's 27",
    icon: '💯',
    short: 'El entreno de dobles de los profesionales.',
    rules: ['Empiezas con 27 puntos.', 'Ronda a ronda, del doble 1 al doble 20 y el bull.', 'Cada doble acertado suma su valor; si fallas los 3, lo restas.', 'Si llegas a 0, se acaba.'],
    players: [1, 1],
  },
  c121: {
    id: 'c121',
    name: '121 Checkout',
    icon: '🏠',
    short: 'Cierra 121 en 9 dardos y ve subiendo.',
    rules: ['Tienes 9 dardos para cerrar 121 (con doble).', 'Si lo cierras, pasas a 122 y ese número queda como «casa segura».', 'Si fallas, vuelves a tu casa segura.', '10 intentos: ¿hasta dónde llegas?'],
    players: [1, 1],
  },
  duel9: {
    id: 'duel9',
    name: 'Duelo de 9 dardos',
    icon: '⚔️',
    short: 'El mismo reto para ti y tu amigo: ¿quién suma más?',
    rules: ['3 turnos (9 dardos): suma todo lo que puedas.', 'En cada turno hay un número que vale DOBLE.', 'Al acabar, comparte el código: tu amigo juega el mismo reto e intenta superarte.'],
    players: [1, 1],
  },
  baseball: {
    id: 'baseball',
    name: 'Béisbol',
    icon: '⚾',
    short: '9 entradas: carreras en el número de cada una.',
    rules: ['En la entrada 1 se tira al 1, en la 2 al 2… hasta el 9.', 'Simple = 1 carrera, doble = 2, triple = 3.', 'Gana quien más carreras haga.'],
    players: [1, 4],
  },
};

function halveLabel(t: string): string {
  return t === 'D' ? 'cualquier doble' : t === 'T' ? 'cualquier triple' : t === 'B' ? 'bull' : t;
}

/** Reglas de la variante Cut-Throat del Cricket. */
export const CUTTHROAT_RULES = [
  'Como el Cricket: marca 3 veces del 15 al 20 y el bull.',
  'Pero los puntos que haces se los SUMAS A TUS RIVALES que no han cerrado ese número.',
  'Gana quien lo cierre todo con MENOS puntos.',
];

/** Reglas a mostrar para una configuración (tiene en cuenta las variantes). */
export function modeRules(c: MatchConfig): string[] {
  return c.mode === 'cricket' && c.cutthroat ? CUTTHROAT_RULES : MODES[c.mode]?.rules ?? [];
}

/** Texto corto del formato: "501 · doble para cerrar", "Killer", "Shanghái"… */
export function modeLabel(c: MatchConfig): string {
  if (c.mode === 'cricket' && c.cutthroat) return 'Cricket Cut-Throat';
  if (c.mode === 'x01') return `${c.start ?? 501}${c.doubleOut === false ? ' · cierre libre' : ' · doble para cerrar'}${(c.legsToWin ?? 1) > 1 ? ` · al mejor de ${(c.legsToWin ?? 1) * 2 - 1}` : ''}`;
  return MODES[c.mode]?.name ?? c.mode;
}

/** Texto del objetivo de la ronda para el marcador ("AL 3", "CUALQUIER DOBLE", "DOBLE 7"…). */
export function roundGoal(s: MatchState): string {
  const t = roundTarget(s);
  if (!t) return '';
  if (t === 'DANY') return 'CUALQUIER DOBLE';
  if (t === 'TANY') return 'CUALQUIER TRIPLE';
  if (t === 'BULL') return 'BULL';
  if (t === 'DB') return 'BULL (DOBLE)';
  if (t[0] === 'D') return 'DOBLE ' + t.slice(1);
  if (s.config.mode === 'duel9') return `EL ${t.slice(1)} VALE x2`;
  return 'AL ' + t.slice(1);
}

/** Nombre de la ronda según el modo ("Ronda", "Entrada"). */
export function roundWord(mode: ModeId): string {
  return mode === 'baseball' ? 'Entrada' : 'Ronda';
}
