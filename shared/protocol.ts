// Mensajes entre la app y el servidor online (JSON sobre WebSocket).

import type { Hit } from './board';
import type { MatchConfig, MatchState, ThrowEvent } from './rules';

export interface AvatarConfig {
  skin: number;
  hair: string;
  hairColor: number;
  eyes: number;
  beard: string;
  glasses: string;
  hat: string;
  shirt: string;
  shirtColor: number;
  number: number;
  /** complexión 0-3 */
  body?: number;
  /** forma de la cara */
  face?: string;
  eyeStyle?: string;
  brows?: string;
  mouth?: string;
  nose?: string;
  marks?: string;
  pants?: string;
  pantsColor?: number;
  shoes?: string;
  shoesColor?: number;
  acc?: string;
}

export interface DartLook {
  barrel: string;
  shaft: string;
  flight: string;
}

export interface PublicProfile {
  id: string;
  name: string;
  level: number;
  trophies: number;
  avatar: AvatarConfig;
  dart: DartLook;
  club?: { id: string; name: string; tag: string; emblem: number } | null;
  wins?: number;
  avg?: number;
  country?: string;
  isBot?: boolean;
}

export interface ClubSummary {
  id: string;
  name: string;
  tag: string;
  emblem: number;
  desc: string;
  members: number;
  trophies: number;
  minTrophies: number;
}

export interface ClubMember {
  id: string;
  name: string;
  level: number;
  trophies: number;
  role: 'leader' | 'elder' | 'member';
  online: boolean;
  avatar: AvatarConfig;
}

export interface ClubMessage {
  id: string;
  from: string;
  name: string;
  text: string;
  at: number;
  system?: boolean;
}

export interface ClubDetail extends ClubSummary {
  membersList: ClubMember[];
  chat: ClubMessage[];
  weeklyWins: number;
}

export type ClientMsg =
  | { t: 'hello'; id?: string; token?: string; profile: PublicProfile; version: string }
  | { t: 'profile'; profile: PublicProfile }
  | { t: 'queue'; arena: number; config: MatchConfig }
  | { t: 'cancel_queue' }
  | { t: 'room_create'; config: MatchConfig }
  | { t: 'room_join'; code: string }
  | { t: 'throw'; x: number; y: number; bounce: boolean }
  | { t: 'emote'; id: string }
  | { t: 'leave' }
  | { t: 'club_list'; q?: string }
  | { t: 'club_create'; name: string; tag: string; emblem: number; desc: string; minTrophies: number }
  | { t: 'club_join'; id: string }
  | { t: 'club_leave' }
  | { t: 'club_info'; id?: string }
  | { t: 'club_chat'; text: string }
  | { t: 'report'; target: string; reason: string; text?: string }
  | { t: 'leaderboard' }
  | { t: 'friends'; ids: string[] }
  | { t: 'delete_account' }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'welcome'; id: string; token: string; online: number }
  | { t: 'error'; code: string; msg: string }
  | { t: 'queue_status'; waiting: number; elapsed: number }
  | { t: 'match_start'; matchId: string; config: MatchConfig; you: number; players: PublicProfile[]; state: MatchState; ranked: boolean }
  | { t: 'state'; state: MatchState; last: { player: number; hit: Hit; event: ThrowEvent } | null; deadline: number; timeout?: boolean }
  | { t: 'emote'; player: number; id: string }
  | { t: 'opponent_status'; connected: boolean }
  | { t: 'match_end'; winner: number; reason: 'win' | 'forfeit' | 'disconnect'; trophies: number[] }
  | { t: 'room_created'; code: string }
  | { t: 'club_list'; clubs: ClubSummary[] }
  | { t: 'club'; club: ClubDetail | null }
  | { t: 'club_msg'; msg: ClubMessage }
  | { t: 'leaderboard'; top: PublicProfile[]; rank: number }
  | { t: 'friends'; list: (PublicProfile & { online: boolean })[] }
  | { t: 'deleted' }
  | { t: 'pong'; online: number };

export const PROTOCOL_VERSION = '1';

/** Cambio de copas en una partida clasificatoria (estilo Elo simplificado). */
export function trophyDelta(winnerTrophies: number, loserTrophies: number): { win: number; lose: number } {
  const diff = Math.max(-400, Math.min(400, loserTrophies - winnerTrophies));
  const win = Math.round(30 + diff / 40);
  const lose = Math.round(20 + diff / 50);
  return { win: Math.max(18, win), lose: Math.max(10, lose) };
}
