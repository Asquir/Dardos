// Retos entre amigos sin servidor: el código lleva la semilla del reto, la puntuación y el nombre.
// Quien lo recibe juega exactamente el mismo reto (mismos números dobles) e intenta superarla.

export interface DuelCode {
  seed: number;
  score: number;
  name: string;
}

const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SEED_MAX = 36 ** 4;

/** Semilla nueva para un reto. */
export function newDuelSeed(): number {
  return 1 + Math.floor(Math.random() * (SEED_MAX - 1));
}

function cleanName(n: string): string {
  return (
    n
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 12) || 'Amigo'
  );
}

function check(seed: number, score: number, name: string): string {
  let h = (seed * 31 + score * 7) >>> 0;
  for (const c of name.toUpperCase()) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return B36[h % 36];
}

/** "4F9K-187-JAVI-Q": semilla, puntos, nombre y una letra de control. */
export function encodeDuel(d: DuelCode): string {
  const seed = Math.max(1, Math.min(SEED_MAX - 1, Math.floor(d.seed)));
  const score = Math.max(0, Math.min(9999, Math.round(d.score)));
  const name = cleanName(d.name);
  return `${seed.toString(36).toUpperCase().padStart(4, '0')}-${score}-${name.toUpperCase()}-${check(seed, score, name)}`;
}

export function decodeDuel(code: string): DuelCode | null {
  const m = code
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .match(/^([0-9A-Z]{4})-(\d{1,4})-([0-9A-Z]{1,12})-([0-9A-Z])$/);
  if (!m) return null;
  const seed = parseInt(m[1], 36);
  const score = parseInt(m[2], 10);
  const name = m[3];
  if (!seed || check(seed, score, name) !== m[4]) return null;
  return { seed, score, name: name[0] + name.slice(1).toLowerCase() };
}
