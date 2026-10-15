// Arranque de partidas online a partir del mensaje del servidor (también al reconectar).

import type { ServerMsg } from '@shared/protocol';
import { ARENAS } from '../meta/arenas';
import { mutate, profile } from '../meta/profile';
import { net } from '../services/net';
import { audio } from '../services/audio';
import { go, ui } from '../ui/state';
import { currentMatch, startMatch, matchStore, type MatchSetup } from './match';
import { humanPlayer, remotePlayer } from './launch';

export function startOnline(m: Extract<ServerMsg, { t: 'match_start' }>, arenaId = profile().selectedArena) {
  const arena = ARENAS[arenaId] ?? ARENAS[0];
  const you = m.you;
  const ranked = m.ranked;
  const resumed = m.state.history.length > 0 || m.state.players.some((p) => p.darts > 0);
  if (ranked && !resumed) mutate((p) => (p.coins = Math.max(0, p.coins - arena.entry)));
  const players = m.players.map((pp, i) => (i === you ? humanPlayer() : remotePlayer(pp)));
  const setup: MatchSetup = {
    type: ranked ? 'online' : 'private',
    config: m.config,
    arena: arenaId,
    players,
    starter: m.state.legStarter,
    entry: ranked ? arena.entry : 0,
    prize: ranked ? arena.prize : 0,
    online: { matchId: m.matchId, you, ranked },
    title: ranked ? arena.name : 'Sala privada',
  };
  audio.levelUp();
  go('game');
  const match = startMatch(setup, m.state);
  if (m.deadline) match.setDeadline(m.deadline, m.serverNow);
}

/** Si el servidor nos reenvía una partida en curso (reconexión), la retomamos. */
export function initOnlineHandlers() {
  net.on('match_start', (m) => {
    if (ui.get().screen === 'matchmaking') return; // lo gestiona la pantalla de búsqueda
    const cur = currentMatch();
    if (cur && matchStore.get() && cur.setup.online?.matchId === m.matchId) {
      // reconexión a la partida en curso: retomamos el estado del servidor
      if (!matchStore.get()?.result) cur.resync(m);
      return;
    }
    startOnline(m);
  });
}
