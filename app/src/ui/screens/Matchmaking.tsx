// Búsqueda de rival online y salas privadas con código.

import { useEffect, useState } from 'preact/hooks';
import { useStore, fmtNum } from '../../core/store';
import { ui, go, toast, closeModal } from '../state';
import { net, onlineCount, publicProfile } from '../../services/net';
import { profile } from '../../meta/profile';
import { ARENAS } from '../../meta/arenas';
import { rankedSetup, launch } from '../../game/launch';
import { startOnline } from '../../game/online';
import { AvatarImg, Modal } from '../components/common';
import { audio } from '../../services/audio';
import { shareText } from '../../services/platform';
import { ShareIco } from '../icons';

export function Matchmaking() {
  const s = useStore(ui);
  const online = useStore(onlineCount);
  const arenaId = (s.params.arena as number) ?? profile().selectedArena;
  const room = s.params.room as string | undefined; // 'create' | código
  const arena = ARENAS[arenaId];
  const [elapsed, setElapsed] = useState(0);
  const [code, setCode] = useState<string | null>(null);
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
      setDots((d) => (d + 1) % 4);
    }, 500);
    let started = false;
    const offStart = net.on('match_start', (m) => {
      started = true;
      startOnline(m, arenaId);
    });
    const offRoom = net.on('room_created', (m) => setCode(m.code));
    const offErr = net.on('error', (m) => {
      toast(m.msg, 'bad');
      if (m.code === 'room_not_found') go('events');
    });
    net.syncProfile();
    if (room === 'create') net.send({ t: 'room_create', config: { mode: 'x01', start: 501, doubleOut: true } });
    else if (room) net.send({ t: 'room_join', code: room });
    else net.send({ t: 'queue', arena: arenaId, config: arena.config });
    return () => {
      clearInterval(id);
      offStart();
      offRoom();
      offErr();
      // salir de la búsqueda por cualquier vía (atrás de Android, menú…) cancela la cola en el servidor
      if (!started) net.send({ t: 'cancel_queue' });
    };
  }, []);

  const cancel = () => {
    audio.click();
    net.send({ t: 'cancel_queue' });
    go(room ? 'events' : 'home');
  };
  const vsBot = () => {
    net.send({ t: 'cancel_queue' });
    const setup = rankedSetup(arenaId);
    if (!setup) return toast('No tienes monedas suficientes', 'bad');
    go('game');
    launch(setup);
  };
  const me = publicProfile();

  return (
    <div class="screen full dim" style={{ justifyContent: 'center', alignItems: 'center', gap: '18px', padding: '24px' }}>
      <div class="display outline" style={{ fontSize: '28px', textAlign: 'center' }}>
        {room ? 'Sala privada' : 'Buscando rival' + '.'.repeat(dots)}
      </div>
      <div style={{ position: 'relative', width: '180px', height: '180px' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid rgba(255,255,255,.12)', borderTopColor: 'var(--gold)', animation: 'spin 1s linear infinite' }} />
        <div style={{ position: 'absolute', inset: '18px', borderRadius: '50%', overflow: 'hidden', background: 'radial-gradient(circle at 50% 35%, #3d4b9a, #1b2152)' }}>
          <AvatarImg cfg={me.avatar} size={300} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>
      {room ? (
        code || room !== 'create' ? (
          <div class="panel" style={{ textAlign: 'center' }}>
            <div class="muted" style={{ fontWeight: 800, fontSize: '12px' }}>CÓDIGO DE LA SALA</div>
            <div class="display" style={{ fontSize: '44px', letterSpacing: '0.15em' }}>{code ?? room}</div>
            <div class="muted" style={{ fontWeight: 700, fontSize: '13px' }}>Esperando a tu amigo...</div>
            {code && (
              <button class="btn small blue" style={{ marginTop: '10px' }} onClick={() => shareText('Diana Legends', `¡Te reto a una partida de dardos en Diana Legends! Entra en "Sala privada" con el código ${code} 🎯`)}>
                <ShareIco class="ico" /> Invitar
              </button>
            )}
          </div>
        ) : (
          <div class="muted">Creando sala...</div>
        )
      ) : (
        <div class="col" style={{ alignItems: 'center' }}>
          <div class="pill" style={{ fontSize: '15px' }}>
            {arena.icon} {arena.name} · {fmtNum(arena.entry)} 🪙
          </div>
          <div class="muted" style={{ fontWeight: 800 }}>
            {elapsed}s · {online} jugadores conectados
          </div>
          {elapsed >= 25 && (
            <div class="panel" style={{ textAlign: 'center', maxWidth: '320px' }}>
              <div style={{ fontWeight: 800, fontSize: '13px' }}>No hay rivales online disponibles ahora mismo.</div>
              <button class="btn small gold" style={{ marginTop: '8px' }} onClick={vsBot}>
                🤖 Jugar contra la máquina
              </button>
            </div>
          )}
        </div>
      )}
      <button class="btn red" onClick={cancel}>
        Cancelar
      </button>
    </div>
  );
}

export function PrivateRoomModal() {
  const [code, setCode] = useState('');
  if (!net.online) {
    return (
      <Modal title="Sala privada">
        <div class="empty-state">
          <div class="big">🌐</div>
          {net.enabled() ? 'Sin conexión con el servidor.' : 'El servidor online no está configurado en esta versión.'}
          <div class="muted" style={{ marginTop: '6px', fontSize: '12px' }}>Puedes jugar con amigos en el mismo móvil desde «Partida local».</div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title="Sala privada">
      <div class="col">
        <button class="btn block gold" onClick={() => (closeModal(), go('matchmaking', { room: 'create' }))}>
          Crear sala (501)
        </button>
        <div class="muted" style={{ textAlign: 'center', fontWeight: 800 }}>— o únete con un código —</div>
        <input class="form-field" maxLength={6} placeholder="CÓDIGO" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value.toUpperCase())} style={{ textAlign: 'center', letterSpacing: '0.2em', fontSize: '22px' }} />
        <button class="btn block blue" disabled={code.length < 4} onClick={() => (closeModal(), go('matchmaking', { room: code }))}>
          Unirse
        </button>
      </div>
    </Modal>
  );
}
