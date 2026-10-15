// Catálogo de objetos coleccionables: cuerpos (barriles), cañas, aletas, avatar, emotes, dianas.

import type { AvatarConfig } from '@shared/protocol';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Slot = 'barrel' | 'shaft' | 'flight';

export interface Stats {
  acc: number; // Precisión
  stab: number; // Estabilidad
  ctrl: number; // Control
}

export interface ItemBase {
  id: string;
  slot: Slot;
  name: string;
  rarity: Rarity;
  /** arena mínima (índice) en la que puede salir en cofres */
  arena: number;
  stats: Stats;
  /** exclusivo (pase de temporada, oferta...) — no sale en cofres */
  exclusive?: boolean;
}

export type BarrelShape = 'straight' | 'torpedo' | 'bomb' | 'scallop' | 'slim';
export type Grip = 'rings' | 'knurl' | 'shark' | 'smooth' | 'micro';

export interface BarrelDef extends ItemBase {
  slot: 'barrel';
  shape: BarrelShape;
  length: number; // mm
  radius: number; // mm
  grip: Grip;
  color: string;
  metalness: number;
  roughness: number;
  accent?: string; // anillos luminosos (emisivo)
}

export interface ShaftDef extends ItemBase {
  slot: 'shaft';
  length: number; // mm
  color: string;
  metalness: number;
  roughness: number;
  emissive?: string;
}

export type FlightShape = 'standard' | 'slim' | 'kite' | 'pear' | 'fantail';

export interface FlightDef extends ItemBase {
  slot: 'flight';
  shape: FlightShape;
  design: string;
}

export type ItemDef = BarrelDef | ShaftDef | FlightDef;

export const RARITY_INFO: Record<Rarity, { name: string; color: string; glow: string; base: number }> = {
  common: { name: 'Común', color: '#9fb3c8', glow: '#c9d6e3', base: 1 },
  rare: { name: 'Raro', color: '#3f9bff', glow: '#7cc0ff', base: 1.6 },
  epic: { name: 'Épico', color: '#b051ff', glow: '#d79bff', base: 2.3 },
  legendary: { name: 'Legendario', color: '#ffb31a', glow: '#ffe08a', base: 3.1 },
};

const st = (acc: number, stab: number, ctrl: number): Stats => ({ acc, stab, ctrl });

export const BARRELS: BarrelDef[] = [
  { id: 'b_brass', slot: 'barrel', name: 'Latón Clásico', rarity: 'common', arena: 0, stats: st(10, 4, 6), shape: 'straight', length: 46, radius: 3.6, grip: 'rings', color: '#c9a24a', metalness: 1, roughness: 0.32 },
  { id: 'b_nickel', slot: 'barrel', name: 'Níquel Plata', rarity: 'common', arena: 0, stats: st(11, 5, 5), shape: 'torpedo', length: 48, radius: 3.6, grip: 'knurl', color: '#cfd1d6', metalness: 1, roughness: 0.28 },
  { id: 'b_mamba', slot: 'barrel', name: 'Black Mamba', rarity: 'common', arena: 0, stats: st(9, 7, 5), shape: 'torpedo', length: 50, radius: 3.4, grip: 'shark', color: '#202126', metalness: 0.7, roughness: 0.35 },
  { id: 'b_t80', slot: 'barrel', name: 'Tungsteno 80%', rarity: 'rare', arena: 0, stats: st(16, 7, 8), shape: 'slim', length: 50, radius: 3.2, grip: 'rings', color: '#8d9198', metalness: 1, roughness: 0.38 },
  { id: 'b_copper', slot: 'barrel', name: 'Cobre Pulido', rarity: 'rare', arena: 1, stats: st(14, 10, 8), shape: 'bomb', length: 44, radius: 3.9, grip: 'knurl', color: '#c06a3c', metalness: 1, roughness: 0.25 },
  { id: 'b_sapphire', slot: 'barrel', name: 'Zafiro', rarity: 'rare', arena: 1, stats: st(15, 9, 9), shape: 'torpedo', length: 50, radius: 3.5, grip: 'rings', color: '#2e5fff', metalness: 0.9, roughness: 0.25 },
  { id: 'b_ruby', slot: 'barrel', name: 'Rubí Scallop', rarity: 'rare', arena: 2, stats: st(17, 8, 9), shape: 'scallop', length: 48, radius: 3.6, grip: 'shark', color: '#c3132c', metalness: 0.9, roughness: 0.25 },
  { id: 'b_t90', slot: 'barrel', name: 'Tungsteno 90% Pro', rarity: 'epic', arena: 2, stats: st(22, 10, 11), shape: 'straight', length: 52, radius: 3.25, grip: 'micro', color: '#9ea2aa', metalness: 1, roughness: 0.3 },
  { id: 'b_emerald', slot: 'barrel', name: 'Esmeralda Ranurada', rarity: 'epic', arena: 3, stats: st(20, 13, 10), shape: 'scallop', length: 50, radius: 3.5, grip: 'shark', color: '#11a86a', metalness: 0.9, roughness: 0.22 },
  { id: 'b_viper', slot: 'barrel', name: 'Víbora Morada', rarity: 'epic', arena: 3, stats: st(21, 11, 12), shape: 'torpedo', length: 52, radius: 3.4, grip: 'knurl', color: '#7a2cff', metalness: 0.9, roughness: 0.25 },
  { id: 'b_gold', slot: 'barrel', name: 'Oro 24K', rarity: 'epic', arena: 4, stats: st(23, 12, 11), shape: 'bomb', length: 46, radius: 3.8, grip: 'rings', color: '#ffcf3a', metalness: 1, roughness: 0.18 },
  { id: 'b_dragon', slot: 'barrel', name: 'Dragón de Fuego', rarity: 'legendary', arena: 4, stats: st(28, 15, 14), shape: 'scallop', length: 52, radius: 3.6, grip: 'shark', color: '#2a0d06', metalness: 0.8, roughness: 0.3, accent: '#ff5a00' },
  { id: 'b_phantom', slot: 'barrel', name: 'Fantasma Titanio', rarity: 'legendary', arena: 5, stats: st(27, 17, 14), shape: 'slim', length: 54, radius: 3.2, grip: 'micro', color: '#b7c3cf', metalness: 1, roughness: 0.2, accent: '#00e5ff' },
  { id: 'b_king', slot: 'barrel', name: 'Rey de la Diana', rarity: 'legendary', arena: 6, stats: st(30, 15, 16), shape: 'torpedo', length: 52, radius: 3.5, grip: 'rings', color: '#141414', metalness: 0.85, roughness: 0.25, accent: '#ffd23a' },
];

export const SHAFTS: ShaftDef[] = [
  { id: 's_nylon_w', slot: 'shaft', name: 'Nylon Blanco', rarity: 'common', arena: 0, stats: st(2, 3, 8), length: 41, color: '#f3f3f3', metalness: 0, roughness: 0.5 },
  { id: 's_nylon_b', slot: 'shaft', name: 'Nylon Negro Corto', rarity: 'common', arena: 0, stats: st(3, 2, 9), length: 35, color: '#1a1a1a', metalness: 0, roughness: 0.45 },
  { id: 's_alu_red', slot: 'shaft', name: 'Aluminio Rojo', rarity: 'rare', arena: 0, stats: st(4, 4, 14), length: 45, color: '#e0182d', metalness: 1, roughness: 0.3 },
  { id: 's_alu_blue', slot: 'shaft', name: 'Aluminio Azul', rarity: 'rare', arena: 1, stats: st(4, 5, 13), length: 45, color: '#1f6dff', metalness: 1, roughness: 0.3 },
  { id: 's_carbon', slot: 'shaft', name: 'Fibra de Carbono', rarity: 'epic', arena: 2, stats: st(6, 6, 19), length: 44, color: '#2a2a2e', metalness: 0.4, roughness: 0.35 },
  { id: 's_titan', slot: 'shaft', name: 'Titanio Arcoíris', rarity: 'epic', arena: 3, stats: st(6, 7, 20), length: 46, color: '#8f6bff', metalness: 1, roughness: 0.2 },
  { id: 's_gold', slot: 'shaft', name: 'Caña Dorada', rarity: 'legendary', arena: 4, stats: st(8, 8, 26), length: 44, color: '#ffcc33', metalness: 1, roughness: 0.15 },
  { id: 's_neon', slot: 'shaft', name: 'Neón Plasma', rarity: 'legendary', arena: 5, stats: st(8, 9, 25), length: 46, color: '#0a0a12', metalness: 0.5, roughness: 0.3, emissive: '#00f0ff' },
];

export const FLIGHTS: FlightDef[] = [
  { id: 'f_red', slot: 'flight', name: 'Estándar Roja', rarity: 'common', arena: 0, stats: st(2, 9, 3), shape: 'standard', design: 'solid_red' },
  { id: 'f_blue', slot: 'flight', name: 'Estándar Azul', rarity: 'common', arena: 0, stats: st(2, 9, 3), shape: 'standard', design: 'solid_blue' },
  { id: 'f_black', slot: 'flight', name: 'Slim Negra', rarity: 'common', arena: 0, stats: st(3, 7, 4), shape: 'slim', design: 'solid_black' },
  { id: 'f_stripes', slot: 'flight', name: 'Rayas Naranja', rarity: 'common', arena: 0, stats: st(2, 10, 2), shape: 'standard', design: 'stripes' },
  { id: 'f_checker', slot: 'flight', name: 'Bandera a Cuadros', rarity: 'common', arena: 1, stats: st(3, 9, 3), shape: 'kite', design: 'checker' },
  { id: 'f_target', slot: 'flight', name: 'Diana', rarity: 'common', arena: 1, stats: st(2, 10, 3), shape: 'pear', design: 'target' },
  { id: 'f_spain', slot: 'flight', name: 'España', rarity: 'rare', arena: 0, stats: st(3, 14, 4), shape: 'standard', design: 'spain' },
  { id: 'f_mexico', slot: 'flight', name: 'México', rarity: 'rare', arena: 0, stats: st(3, 14, 4), shape: 'standard', design: 'mexico' },
  { id: 'f_argentina', slot: 'flight', name: 'Argentina', rarity: 'rare', arena: 0, stats: st(3, 14, 4), shape: 'standard', design: 'argentina' },
  { id: 'f_colombia', slot: 'flight', name: 'Colombia', rarity: 'rare', arena: 1, stats: st(3, 14, 4), shape: 'standard', design: 'colombia' },
  { id: 'f_uk', slot: 'flight', name: 'Reino Unido', rarity: 'rare', arena: 1, stats: st(3, 14, 4), shape: 'standard', design: 'uk' },
  { id: 'f_usa', slot: 'flight', name: 'Estados Unidos', rarity: 'rare', arena: 1, stats: st(3, 14, 4), shape: 'standard', design: 'usa' },
  { id: 'f_flames', slot: 'flight', name: 'Llamas', rarity: 'rare', arena: 1, stats: st(4, 15, 4), shape: 'fantail', design: 'flames' },
  { id: 'f_tiger', slot: 'flight', name: 'Tigre', rarity: 'rare', arena: 2, stats: st(4, 15, 5), shape: 'kite', design: 'tiger' },
  { id: 'f_lightning', slot: 'flight', name: 'Rayo', rarity: 'rare', arena: 2, stats: st(5, 14, 5), shape: 'slim', design: 'lightning' },
  { id: 'f_camo', slot: 'flight', name: 'Camuflaje', rarity: 'rare', arena: 2, stats: st(4, 15, 4), shape: 'standard', design: 'camo' },
  { id: 'f_heart', slot: 'flight', name: 'Corazón', rarity: 'rare', arena: 2, stats: st(4, 15, 4), shape: 'pear', design: 'heart' },
  { id: 'f_wave', slot: 'flight', name: 'Ola', rarity: 'rare', arena: 3, stats: st(4, 15, 5), shape: 'standard', design: 'wave' },
  { id: 'f_carbon', slot: 'flight', name: 'Carbono', rarity: 'rare', arena: 3, stats: st(5, 14, 6), shape: 'slim', design: 'carbon' },
  { id: 'f_rainbow', slot: 'flight', name: 'Arcoíris', rarity: 'rare', arena: 3, stats: st(4, 15, 5), shape: 'standard', design: 'rainbow' },
  { id: 'f_galaxy', slot: 'flight', name: 'Galaxia', rarity: 'epic', arena: 2, stats: st(6, 20, 6), shape: 'fantail', design: 'galaxy' },
  { id: 'f_neon', slot: 'flight', name: 'Neón Retro', rarity: 'epic', arena: 3, stats: st(6, 20, 7), shape: 'kite', design: 'neon' },
  { id: 'f_ice', slot: 'flight', name: 'Hielo Eterno', rarity: 'epic', arena: 3, stats: st(7, 21, 6), shape: 'standard', design: 'ice' },
  { id: 'f_skull', slot: 'flight', name: 'Calavera', rarity: 'epic', arena: 4, stats: st(7, 20, 7), shape: 'standard', design: 'skull' },
  { id: 'f_sakura', slot: 'flight', name: 'Sakura', rarity: 'epic', arena: 4, stats: st(6, 21, 7), shape: 'pear', design: 'sakura' },
  { id: 'f_pixel', slot: 'flight', name: 'Pixel Arcade', rarity: 'epic', arena: 4, stats: st(7, 20, 7), shape: 'kite', design: 'pixel' },
  { id: 'f_gold', slot: 'flight', name: 'Ala de Oro', rarity: 'legendary', arena: 4, stats: st(9, 27, 8), shape: 'standard', design: 'gold' },
  { id: 'f_dragon', slot: 'flight', name: 'Dragón Imperial', rarity: 'legendary', arena: 5, stats: st(9, 28, 9), shape: 'fantail', design: 'dragon' },
  { id: 'f_legend', slot: 'flight', name: 'Leyenda Solar', rarity: 'legendary', arena: 6, stats: st(10, 29, 9), shape: 'kite', design: 'legend' },
  { id: 'f_season1', slot: 'flight', name: 'Llama Dorada (T1)', rarity: 'legendary', arena: 0, stats: st(10, 28, 10), shape: 'fantail', design: 'season1', exclusive: true },
  // exclusivas de eventos en vivo
  { id: 'f_ev_bull', slot: 'flight', name: 'Ojo de Toro', rarity: 'legendary', arena: 0, stats: st(11, 27, 10), shape: 'pear', design: 'ev_bull', exclusive: true },
  { id: 'f_ev_neon3', slot: 'flight', name: 'Triple Neón', rarity: 'legendary', arena: 0, stats: st(10, 28, 10), shape: 'kite', design: 'ev_neon3', exclusive: true },
  { id: 'f_ev_thunder', slot: 'flight', name: 'Tormenta', rarity: 'legendary', arena: 0, stats: st(10, 27, 11), shape: 'slim', design: 'ev_thunder', exclusive: true },
  { id: 'f_ev_cricket', slot: 'flight', name: 'Rey del Cricket', rarity: 'legendary', arena: 0, stats: st(10, 28, 10), shape: 'standard', design: 'ev_cricket', exclusive: true },
  { id: 'f_ev_crown', slot: 'flight', name: 'Corona Dorada', rarity: 'legendary', arena: 0, stats: st(11, 27, 11), shape: 'fantail', design: 'ev_crown', exclusive: true },
  { id: 'f_ev_inferno', slot: 'flight', name: 'Infierno 180', rarity: 'legendary', arena: 0, stats: st(10, 29, 10), shape: 'fantail', design: 'ev_inferno', exclusive: true },
];

export const ALL_ITEMS: ItemDef[] = [...BARRELS, ...SHAFTS, ...FLIGHTS];
export const ITEM_MAP: Record<string, ItemDef> = Object.fromEntries(ALL_ITEMS.map((i) => [i.id, i]));

export function getItem(id: string): ItemDef {
  return ITEM_MAP[id] ?? ITEM_MAP['b_brass'];
}
export function barrelDef(id: string): BarrelDef {
  const d = ITEM_MAP[id];
  return d && d.slot === 'barrel' ? d : BARRELS[0];
}
export function shaftDef(id: string): ShaftDef {
  const d = ITEM_MAP[id];
  return d && d.slot === 'shaft' ? d : SHAFTS[0];
}
export function flightDef(id: string): FlightDef {
  const d = ITEM_MAP[id];
  return d && d.slot === 'flight' ? d : FLIGHTS[0];
}

// ---------------------------------------------------------------- Mejoras

export const MAX_LEVEL = 10;
/** Cartas necesarias para pasar del nivel n al n+1 (índice n-1). */
export const CARDS_FOR_LEVEL = [2, 4, 10, 20, 40, 80, 150, 250, 400];
/** Monedas necesarias para mejorar (por rareza multiplicado). */
export const COINS_FOR_LEVEL = [20, 60, 150, 400, 1000, 2000, 4000, 8000, 15000];
export const RARITY_CARD_MULT: Record<Rarity, number> = { common: 1, rare: 0.5, epic: 0.2, legendary: 0.05 };

export function cardsNeeded(rarity: Rarity, level: number): number {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.max(1, Math.round(CARDS_FOR_LEVEL[level - 1] * RARITY_CARD_MULT[rarity]));
}
export function coinsNeeded(rarity: Rarity, level: number): number {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.round(COINS_FOR_LEVEL[level - 1] * RARITY_INFO[rarity].base * 0.8);
}

export function statsAt(def: ItemBase, level: number): Stats {
  const k = 1 + (level - 1) * 0.08;
  return { acc: def.stats.acc * k, stab: def.stats.stab * k, ctrl: def.stats.ctrl * k };
}

// ---------------------------------------------------------------- Avatar

export interface AvatarPart {
  id: string;
  name: string;
  price?: { gems?: number; coins?: number };
  level?: number; // nivel de jugador necesario
}

export const SKIN_TONES = ['#ffe6d2', '#ffd9bd', '#f5c9a6', '#e8b48c', '#d79a6c', '#c08355', '#9b6440', '#7a4a2c', '#5a3420', '#3e2416'];
export const HAIR_COLORS = ['#1b1612', '#3b2516', '#6b4226', '#a8692e', '#d9a441', '#efd9a0', '#b03a2e', '#e7e7e7', '#3a6bff', '#ff4fa3', '#36d66b', '#9b5cff'];
export const SHIRT_COLORS = ['#e8193c', '#1f6dff', '#11a86a', '#ffb31a', '#7a2cff', '#111111', '#f3f3f3', '#ff6a00', '#00c2d6', '#ff4fa3', '#2a3b8f', '#8b1e3f'];
export const EYE_COLORS = ['#3b2516', '#6b4226', '#2e6bd6', '#5fa8ff', '#2f8a4a', '#7dbf5a', '#6b6b6b', '#8a5a2a', '#8f4fd6'];
export const PANTS_COLORS = ['#2f5b9a', '#1f2f52', '#141518', '#b9a27a', '#6b6f78', '#e9e6df', '#8b1e3f', '#2f6b3f', '#e8193c', '#ff9d00'];
export const SHOE_COLORS = ['#f4f4f4', '#141414', '#e8193c', '#1f6dff', '#ffb31a', '#11a86a', '#7a2cff', '#ff4fa3', '#8a5a2b', '#00e5ff'];

export const BODIES: AvatarPart[] = [
  { id: '0', name: 'Delgado' },
  { id: '1', name: 'Normal' },
  { id: '2', name: 'Atlético' },
  { id: '3', name: 'Robusto' },
];
export const FACES: AvatarPart[] = [
  { id: 'round', name: 'Redonda' },
  { id: 'oval', name: 'Ovalada' },
  { id: 'square', name: 'Cuadrada' },
  { id: 'long', name: 'Alargada' },
];
export const EYE_STYLES: AvatarPart[] = [
  { id: 'round', name: 'Redondos' },
  { id: 'almond', name: 'Almendra' },
  { id: 'lashes', name: 'Pestañas' },
  { id: 'sleepy', name: 'Tranquilos' },
  { id: 'sharp', name: 'Decididos', price: { coins: 300 } },
  { id: 'big', name: 'Grandes', price: { coins: 300 } },
  { id: 'joy', name: 'Felices', price: { gems: 30 } },
  { id: 'star', name: 'Estrella', price: { gems: 80 }, level: 10 },
];
export const BROWS: AvatarPart[] = [
  { id: 'normal', name: 'Normales' },
  { id: 'thick', name: 'Gruesas' },
  { id: 'thin', name: 'Finas' },
  { id: 'arched', name: 'Arqueadas' },
  { id: 'angry', name: 'Serias', price: { coins: 150 } },
  { id: 'uni', name: 'Uniceja', price: { coins: 200 } },
  { id: 'none', name: 'Sin cejas' },
];
export const MOUTHS: AvatarPart[] = [
  { id: 'smile', name: 'Sonrisa' },
  { id: 'grin', name: 'Carcajada' },
  { id: 'neutral', name: 'Neutra' },
  { id: 'teeth', name: 'Dientes' },
  { id: 'smirk', name: 'Pícara', price: { coins: 200 } },
  { id: 'open', name: '¡Oh!', price: { coins: 200 } },
  { id: 'tongue', name: 'Lengua', price: { gems: 20 } },
  { id: 'gold', name: 'Diente de oro', price: { gems: 70 }, level: 8 },
];
export const NOSES: AvatarPart[] = [
  { id: 'button', name: 'Botón' },
  { id: 'round', name: 'Redonda' },
  { id: 'long', name: 'Larga' },
  { id: 'pointy', name: 'Respingona' },
];
export const MARKS: AvatarPart[] = [
  { id: 'none', name: 'Nada' },
  { id: 'blush', name: 'Rubor' },
  { id: 'freckles', name: 'Pecas', price: { coins: 200 } },
  { id: 'scar', name: 'Cicatriz', price: { coins: 400 } },
  { id: 'paint', name: 'Pintura de guerra', price: { gems: 40 }, level: 7 },
  { id: 'flag', name: 'Bandera', price: { gems: 40 } },
  { id: 'target', name: 'Diana tatuada', price: { gems: 90 }, level: 14 },
];
export const HAIRS: AvatarPart[] = [
  { id: 'short', name: 'Corto' },
  { id: 'buzz', name: 'Rapado' },
  { id: 'bald', name: 'Calvo' },
  { id: 'side', name: 'Raya al lado' },
  { id: 'spiky', name: 'Pinchos', price: { coins: 300 } },
  { id: 'long', name: 'Largo' },
  { id: 'bob', name: 'Media melena' },
  { id: 'bun', name: 'Moño', price: { coins: 300 } },
  { id: 'mohawk', name: 'Cresta', price: { gems: 30 } },
  { id: 'curly', name: 'Rizado', price: { coins: 500 } },
  { id: 'ponytail', name: 'Coleta' },
  { id: 'braids', name: 'Trenzas', price: { coins: 600 } },
  { id: 'afro', name: 'Afro', price: { gems: 40 } },
  { id: 'quiff', name: 'Tupé', price: { gems: 50 }, level: 9 },
];
export const BEARDS: AvatarPart[] = [
  { id: 'none', name: 'Sin barba' },
  { id: 'stubble', name: 'Sombra' },
  { id: 'mustache', name: 'Bigote', price: { coins: 200 } },
  { id: 'goatee', name: 'Perilla', price: { coins: 300 } },
  { id: 'full', name: 'Barba completa', price: { coins: 600 } },
  { id: 'viking', name: 'Vikinga', price: { gems: 50 }, level: 8 },
];
export const GLASSES: AvatarPart[] = [
  { id: 'none', name: 'Sin gafas' },
  { id: 'round', name: 'Redondas', price: { coins: 250 } },
  { id: 'square', name: 'Pasta', price: { coins: 250 } },
  { id: 'sun', name: 'De sol', price: { gems: 25 } },
  { id: 'aviator', name: 'Aviador', price: { gems: 45 }, level: 5 },
  { id: 'pro', name: 'Deportivas Pro', price: { gems: 60 }, level: 10 },
];
export const HATS: AvatarPart[] = [
  { id: 'none', name: 'Sin gorro' },
  { id: 'cap', name: 'Gorra', price: { coins: 400 } },
  { id: 'backcap', name: 'Gorra al revés', price: { coins: 450 } },
  { id: 'beanie', name: 'Gorro de lana', price: { coins: 400 } },
  { id: 'headband', name: 'Cinta', price: { coins: 250 } },
  { id: 'fedora', name: 'Sombrero', price: { gems: 50 }, level: 6 },
  { id: 'cowboy', name: 'Vaquero', price: { gems: 60 }, level: 6 },
  { id: 'crown', name: 'Corona', price: { gems: 200 }, level: 15 },
];
export const SHIRTS: AvatarPart[] = [
  { id: 'polo', name: 'Polo' },
  { id: 'tee', name: 'Camiseta' },
  { id: 'jersey', name: 'Camiseta Pro' },
  { id: 'tank', name: 'Tirantes', price: { coins: 300 } },
  { id: 'hoodie', name: 'Sudadera', price: { coins: 500 } },
  { id: 'hawaii', name: 'Hawaiana', price: { gems: 40 } },
  { id: 'jacket', name: 'Chupa de cuero', price: { gems: 70 }, level: 9 },
  { id: 'suit', name: 'Traje', price: { gems: 90 }, level: 12 },
  { id: 'champion', name: 'Campeón', price: { gems: 150 }, level: 18 },
];
export const PANTS: AvatarPart[] = [
  { id: 'jeans', name: 'Vaqueros' },
  { id: 'chinos', name: 'Chinos' },
  { id: 'shorts', name: 'Bermudas' },
  { id: 'track', name: 'Chándal', price: { coins: 300 } },
  { id: 'cargo', name: 'Cargo', price: { coins: 400 } },
  { id: 'suit', name: 'De vestir', price: { gems: 30 } },
];
export const SHOES: AvatarPart[] = [
  { id: 'sneakers', name: 'Deportivas' },
  { id: 'classic', name: 'Zapatos' },
  { id: 'hightops', name: 'Botines', price: { coins: 350 } },
  { id: 'boots', name: 'Botas', price: { coins: 450 } },
  { id: 'runner', name: 'Running', price: { gems: 30 } },
  { id: 'neon', name: 'Neón', price: { gems: 60 }, level: 7 },
];
export const ACCESSORIES: AvatarPart[] = [
  { id: 'none', name: 'Nada' },
  { id: 'watch', name: 'Reloj', price: { coins: 300 } },
  { id: 'chain', name: 'Cadena', price: { coins: 500 } },
  { id: 'earring', name: 'Pendiente', price: { coins: 250 } },
  { id: 'headphones', name: 'Cascos', price: { gems: 40 } },
  { id: 'scarf', name: 'Bufanda', price: { coins: 400 } },
  { id: 'medal', name: 'Medalla', price: { gems: 80 }, level: 12 },
  { id: 'wristband', name: 'Muñequeras', price: { coins: 200 } },
];

/** Rellena los campos nuevos del avatar en perfiles antiguos. */
export function normAvatar(a: AvatarConfig): Required<AvatarConfig> {
  return {
    body: 1,
    face: 'round',
    eyeStyle: 'round',
    brows: 'normal',
    mouth: 'smile',
    nose: 'button',
    marks: 'none',
    pants: 'jeans',
    pantsColor: 0,
    shoes: 'sneakers',
    shoesColor: 0,
    acc: 'none',
    ...a,
  } as Required<AvatarConfig>;
}

export function partPriceKey(cat: string, id: string) {
  return `${cat}:${id}`;
}

// ---------------------------------------------------------------- Emotes y estilos de diana

export interface EmoteDef {
  id: string;
  text: string;
  icon: string;
  price?: { gems?: number; coins?: number };
}
export const EMOTES: EmoteDef[] = [
  { id: 'gg', text: '¡Buena partida!', icon: '🤝' },
  { id: 'nice', text: '¡Buen tiro!', icon: '👏' },
  { id: 'oops', text: '¡Uy!', icon: '😬' },
  { id: 'go', text: '¡Vamos!', icon: '🔥' },
  { id: 'lol', text: 'Jajaja', icon: '😂', price: { coins: 300 } },
  { id: 'cool', text: 'Demasiado fácil', icon: '😎', price: { coins: 500 } },
  { id: 'cry', text: 'Noooo', icon: '😭', price: { gems: 20 } },
  { id: 'shock', text: '¡¿Qué?!', icon: '😱', price: { gems: 20 } },
  { id: 'think', text: 'Mmm...', icon: '🤔', price: { coins: 400 } },
  { id: 'king', text: 'Soy el rey', icon: '👑', price: { gems: 50 } },
];

export interface BoardSkinDef {
  id: 'classic' | 'neon' | 'gold' | 'ice' | 'inferno';
  name: string;
  price?: { gems?: number };
  level?: number;
}
export const BOARD_SKINS: BoardSkinDef[] = [
  { id: 'classic', name: 'Clásica' },
  { id: 'neon', name: 'Neón Nocturna', price: { gems: 150 } },
  { id: 'ice', name: 'Glaciar', price: { gems: 150 } },
  { id: 'inferno', name: 'Infierno', price: { gems: 250 }, level: 10 },
  { id: 'gold', name: 'Edición Oro', price: { gems: 400 }, level: 20 },
];
