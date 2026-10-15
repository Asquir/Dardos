// Social: clubes con chat, amigos y clasificación (requiere el servidor online).

import { useEffect, useRef, useState } from 'preact/hooks';
import type { ClubDetail, ClubSummary, PublicProfile } from '@shared/protocol';
import { useStore, fmtNum } from '../../core/store';
import { profileStore, mutate, profile } from '../../meta/profile';
import { net, netStatus, onlineCount } from '../../services/net';
import { AvatarImg, Modal } from '../components/common';
import { Trophy, ShareIco, GlobeIco } from '../icons';
import { openModal, closeModal, toast } from '../state';
import { audio } from '../../services/audio';
import { shareText } from '../../services/platform';
import { FEATURE_LEVEL } from '../../meta/progression';
import { censor } from '@shared/text';

export const EMBLEMS = ['🦁', '🐺', '🦅', '🐉', '⚡', '🔥', '🎯', '👑', '💀', '🍀', '🌙', '⭐', '🦈', '🐻', '🚀', '🏴‍☠️'];

type Tab = 'club' | 'friends' | 'rank';

export function Social() {
  const p = useStore(profileStore);
  const st = useStore(netStatus);
  const [tab, setTab] = useState<Tab>('club');
  return (
    <div class="screen dim">
      <div class="pad content">
        <div class="tabs">
          {(
            [
              ['club', 'Club'],
              ['friends', 'Amigos'],
              ['rank', 'Ranking'],
            ] as [Tab, string][]
          ).map(([id, l]) => (
            <button key={id} class={tab === id ? 'on' : ''} onClick={() => (audio.click(), setTab(id))}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div class="scroll grow content pad" style={{ paddingTop: '10px' }}>
        {st !== 'online' ? (
          <Offline status={st} tab={tab} />
        ) : tab === 'club' ? (
          p.level < FEATURE_LEVEL.club ? (
            <div class="empty-state">
              <div class="big">🔒</div>Los clubes se desbloquean en el nivel {FEATURE_LEVEL.club}.
            </div>
          ) : p.club ? (
            <MyClub />
          ) : (
            <ClubList />
          )
        ) : tab === 'friends' ? (
          <Friends />
        ) : (
          <Ranking />
        )}
      </div>
    </div>
  );
}

function Offline({ status, tab }: { status: string; tab: Tab }) {
  const p = profile();
  return (
    <div class="col">
      <div class="empty-state">
        <div class="big">{status === 'connecting' ? '⏳' : '🌐'}</div>
        {status === 'disabled'
          ? 'El servidor online no está configurado en esta versión de la app.'
          : status === 'connecting'
            ? 'Conectando con el servidor...'
            : 'Sin conexión con el servidor. Comprueba tu internet.'}
        {status === 'offline' && (
          <div style={{ marginTop: '12px' }}>
            <button class="btn small blue" onClick={() => net.connect()}>
              Reintentar
            </button>
          </div>
        )}
      </div>
      {tab === 'rank' && (
        <div class="panel">
          <div class="display" style={{ fontSize: '18px', marginBottom: '8px' }}>
            Tus récords
          </div>
          {(
            [
              ['🏆 Copas máximas', fmtNum(p.bestTrophies)],
              ['📈 Mejor media', p.stats.bestAvg.toFixed(1)],
              ['✅ Mayor cierre', p.stats.bestCheckout || '-'],
              ['💥 180s', p.stats.s180],
              ['🔥 Mejor racha', p.stats.bestStreak],
              ['🥇 Torneos ganados', p.stats.tournamentsWon],
            ] as [string, string | number][]
          ).map(([k, v]) => (
            <div class="row" key={k} style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--stroke)' }}>
              <span style={{ fontWeight: 800 }}>{k}</span>
              <span class="display">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClubList() {
  const [q, setQ] = useState('');
  const [clubs, setClubs] = useState<ClubSummary[] | null>(null);
  const load = async () => {
    try {
      const r = await net.request({ t: 'club_list', q }, 'club_list');
      setClubs(r.clubs);
    } catch {
      setClubs([]);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const join = async (c: ClubSummary) => {
    try {
      const r = await net.request({ t: 'club_join', id: c.id }, 'club');
      if (r.club) {
        mutate((p) => (p.club = { id: r.club!.id, name: r.club!.name, tag: r.club!.tag, emblem: r.club!.emblem }));
        audio.levelUp();
        toast(`¡Te has unido a ${r.club.name}!`, 'good');
      }
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  };
  return (
    <div class="col">
      <div class="panel" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '40px' }}>🛡️</div>
        <div class="display" style={{ fontSize: '20px' }}>Únete a un club</div>
        <div class="muted" style={{ fontWeight: 700, fontSize: '13px', margin: '4px 0 10px' }}>
          Chatea, compite en la clasificación de clubes y juega con tus compañeros.
        </div>
        <button class="btn gold" onClick={() => openModal({ kind: 'clubCreate' })}>
          Crear club (500 🪙)
        </button>
      </div>
      <div class="row">
        <input class="form-field" placeholder="Buscar club..." value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
        <button class="btn small blue" onClick={load}>
          Buscar
        </button>
      </div>
      {clubs === null && <div class="empty-state">Cargando...</div>}
      {clubs?.length === 0 && <div class="empty-state">No hay clubes todavía. ¡Crea el primero!</div>}
      {clubs?.map((c) => (
        <div class="list-item" key={c.id}>
          <div class="ic">{EMBLEMS[c.emblem % EMBLEMS.length]}</div>
          <div class="grow" style={{ minWidth: 0 }}>
            <div class="tt">
              {c.name} <span class="muted">[{c.tag}]</span>
            </div>
            <div class="ds">
              {c.members}/30 miembros · 🏆 {fmtNum(c.trophies)} · mín. {fmtNum(c.minTrophies)}
            </div>
          </div>
          <button class="btn small" disabled={profile().trophies < c.minTrophies || c.members >= 30} onClick={() => join(c)}>
            Unirse
          </button>
        </div>
      ))}
    </div>
  );
}

export function ClubCreateModal() {
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [desc, setDesc] = useState('');
  const [emblem, setEmblem] = useState(0);
  const [min, setMin] = useState(0);
  const create = async () => {
    const p = profile();
    if (p.coins < 500) return toast('Necesitas 500 monedas', 'bad');
    if (name.trim().length < 3 || tag.trim().length < 2) return toast('Nombre (3+) y etiqueta (2-4) obligatorios', 'bad');
    try {
      const r = await net.request({ t: 'club_create', name: censor(name.trim()).slice(0, 20), tag: censor(tag.trim().toUpperCase()).slice(0, 4), emblem, desc: censor(desc).slice(0, 120), minTrophies: min }, 'club');
      if (r.club) {
        mutate((pp) => {
          pp.coins -= 500;
          pp.club = { id: r.club!.id, name: r.club!.name, tag: r.club!.tag, emblem: r.club!.emblem };
        });
        closeModal();
        audio.levelUp();
        toast('¡Club creado!', 'good');
      }
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  };
  return (
    <Modal title="Crear club">
      <div class="col">
        <input class="form-field" placeholder="Nombre del club" maxLength={20} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <input class="form-field" placeholder="Etiqueta (ej. DL)" maxLength={4} value={tag} onInput={(e) => setTag((e.target as HTMLInputElement).value.toUpperCase())} />
        <input class="form-field" placeholder="Descripción" maxLength={120} value={desc} onInput={(e) => setDesc((e.target as HTMLInputElement).value)} />
        <div style={{ fontWeight: 800, fontSize: '13px' }}>Escudo</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: '6px' }}>
          {EMBLEMS.map((e, i) => (
            <button key={i} onClick={() => setEmblem(i)} style={{ fontSize: '24px', padding: '4px', borderRadius: '10px', background: emblem === i ? 'var(--blue-2)' : 'rgba(255,255,255,.07)' }}>
              {e}
            </button>
          ))}
        </div>
        <div style={{ fontWeight: 800, fontSize: '13px' }}>Copas mínimas: {min}</div>
        <input type="range" min={0} max={3000} step={100} value={min} onInput={(e) => setMin(+(e.target as HTMLInputElement).value)} />
        <button class="btn gold block" onClick={create}>
          Crear por 500 🪙
        </button>
      </div>
    </Modal>
  );
}

function MyClub() {
  const p = useStore(profileStore);
  const [club, setClub] = useState<ClubDetail | null>(null);
  const [sub, setSub] = useState<'chat' | 'members'>('chat');
  const [text, setText] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    net.request({ t: 'club_info' }, 'club').then((r) => {
      if (!alive) return;
      if (!r.club) mutate((pp) => (pp.club = null));
      setClub(r.club);
    }).catch(() => undefined);
    const off = net.on('club_msg', (m) => setClub((c) => (c ? { ...c, chat: [...c.chat, m.msg].slice(-100) } : c)));
    return () => {
      alive = false;
      off();
    };
  }, []);
  useEffect(() => {
    chatRef.current?.scrollTo({ top: 1e9 });
  }, [club?.chat.length, sub]);
  if (!club) return <div class="empty-state">Cargando club...</div>;
  const send = () => {
    const t = text.trim();
    if (!t) return;
    net.send({ t: 'club_chat', text: censor(t).slice(0, 200) });
    setText('');
  };
  const leave = () =>
    openModal({
      kind: 'confirm',
      title: 'Salir del club',
      text: `¿Seguro que quieres salir de ${club.name}?`,
      ok: 'Salir',
      danger: true,
      onOk: async () => {
        net.send({ t: 'club_leave' });
        mutate((pp) => (pp.club = null));
        toast('Has salido del club');
      },
    });
  const myId = p.serverId;
  return (
    <div class="col">
      <div class="panel row">
        <div style={{ fontSize: '46px' }}>{EMBLEMS[club.emblem % EMBLEMS.length]}</div>
        <div class="grow">
          <div class="display" style={{ fontSize: '21px' }}>
            {club.name} <span class="muted">[{club.tag}]</span>
          </div>
          <div class="muted" style={{ fontSize: '12px', fontWeight: 800 }}>
            {club.membersList.length}/30 · 🏆 {fmtNum(club.trophies)} · Victorias esta semana: {club.weeklyWins}
          </div>
          {club.desc && <div style={{ fontSize: '12px', fontWeight: 700, marginTop: '2px' }}>{club.desc}</div>}
        </div>
      </div>
      <div class="seg">
        <button class={sub === 'chat' ? 'on' : ''} onClick={() => setSub('chat')}>
          Chat
        </button>
        <button class={sub === 'members' ? 'on' : ''} onClick={() => setSub('members')}>
          Miembros
        </button>
      </div>
      {sub === 'chat' ? (
        <div class="panel" style={{ padding: 0 }}>
          <div class="chat scroll" ref={chatRef} style={{ height: '42vh' }}>
            {club.chat.length === 0 && <div class="msg sys">¡Saluda a tu club! 👋</div>}
            {club.chat
              .filter((m) => !p.blocked.includes(m.from))
              .map((m) => (
                <div key={m.id} class={'msg' + (m.system ? ' sys' : m.from === myId ? ' me' : '')} onClick={() => !m.system && m.from !== myId && openModal({ kind: 'confirm', title: m.name, text: '¿Qué quieres hacer con este mensaje?', ok: 'Bloquear y denunciar', danger: true, onOk: () => (net.send({ t: 'report', target: m.from, reason: 'chat', text: m.text }), mutate((pp) => pp.blocked.push(m.from)), toast('Usuario bloqueado y denunciado')) })}>
                  {!m.system && m.from !== myId && <div class="from">{m.name}</div>}
                  {m.text}
                </div>
              ))}
          </div>
          <div class="row" style={{ padding: '8px' }}>
            <input class="form-field" maxLength={200} placeholder="Escribe un mensaje..." value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
            <button class="btn small blue" onClick={send}>
              Enviar
            </button>
          </div>
        </div>
      ) : (
        <div>
          {club.membersList
            .sort((a, b) => b.trophies - a.trophies)
            .map((mb, i) => (
              <div class="list-item" key={mb.id}>
                <div class="display" style={{ width: '22px', textAlign: 'center' }}>
                  {i + 1}
                </div>
                <div class="ic">
                  <AvatarImg cfg={mb.avatar} size={88} />
                </div>
                <div class="grow">
                  <div class="tt">
                    {mb.name} {mb.id === myId && <span class="muted">(tú)</span>}
                  </div>
                  <div class="ds">
                    {mb.role === 'leader' ? '👑 Líder' : mb.role === 'elder' ? '⭐ Veterano' : 'Miembro'} · Nv. {mb.level} {mb.online ? '· 🟢 en línea' : ''}
                  </div>
                </div>
                <span class="pill">
                  <Trophy class="ico" /> {fmtNum(mb.trophies)}
                </span>
              </div>
            ))}
        </div>
      )}
      <button class="btn small red" style={{ alignSelf: 'center' }} onClick={leave}>
        Salir del club
      </button>
    </div>
  );
}

function Friends() {
  const p = useStore(profileStore);
  const [list, setList] = useState<(PublicProfile & { online: boolean })[]>([]);
  const [code, setCode] = useState('');
  const myCode = (p.serverId ?? '').slice(0, 8).toUpperCase();
  const refresh = () => {
    if (!p.friends.length) return setList([]);
    net.request({ t: 'friends', ids: p.friends.map((f) => f.id) }, 'friends').then((r) => setList(r.list)).catch(() => undefined);
  };
  useEffect(refresh, [p.friends.length]);
  const add = async () => {
    const c = code.trim().toUpperCase();
    if (c.length < 6) return toast('Código no válido', 'bad');
    if (c === myCode) return toast('¡Ese es tu propio código!', 'bad');
    try {
      const r = await net.request({ t: 'friends', ids: [c] }, 'friends');
      const f = r.list[0];
      if (!f) return toast('No se encontró ningún jugador con ese código', 'bad');
      mutate((pp) => {
        if (!pp.friends.some((x) => x.id === f.id)) pp.friends.push({ id: f.id, name: f.name });
      });
      setCode('');
      audio.coin();
      toast(`¡${f.name} añadido!`, 'good');
    } catch {
      toast('No se pudo añadir', 'bad');
    }
  };
  return (
    <div class="col">
      <div class="panel" style={{ textAlign: 'center' }}>
        <div class="muted" style={{ fontWeight: 800, fontSize: '12px' }}>TU CÓDIGO DE AMIGO</div>
        <div class="display" style={{ fontSize: '32px', letterSpacing: '0.1em' }}>{myCode || '—'}</div>
        <div class="row" style={{ justifyContent: 'center' }}>
          <button class="btn small blue" onClick={() => shareText('Diana Legends', `¡Juega a los dardos conmigo en Diana Legends! Mi código de amigo es ${myCode} 🎯`)}>
            <ShareIco class="ico" /> Compartir
          </button>
          <button class="btn small" onClick={() => openModal({ kind: 'privateRoom' })}>
            Sala privada
          </button>
        </div>
      </div>
      <div class="row">
        <input class="form-field" placeholder="Código de tu amigo" maxLength={8} value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value.toUpperCase())} />
        <button class="btn small" onClick={add}>
          Añadir
        </button>
      </div>
      {list.length === 0 && <div class="empty-state">Aún no tienes amigos añadidos.</div>}
      {list
        .sort((a, b) => Number(b.online) - Number(a.online))
        .map((f) => (
          <div class="list-item" key={f.id}>
            <div class="ic">
              <AvatarImg cfg={f.avatar} size={88} />
            </div>
            <div class="grow">
              <div class="tt">{f.name}</div>
              <div class="ds">
                Nv. {f.level} · 🏆 {fmtNum(f.trophies)} · {f.online ? '🟢 En línea' : '⚫ Desconectado'}
              </div>
            </div>
            <button class="btn tiny red" onClick={() => mutate((pp) => (pp.friends = pp.friends.filter((x) => x.id !== f.id)))}>
              ✕
            </button>
          </div>
        ))}
    </div>
  );
}

function Ranking() {
  const p = useStore(profileStore);
  const online = useStore(onlineCount);
  const [data, setData] = useState<{ top: PublicProfile[]; rank: number } | null>(null);
  useEffect(() => {
    net.request({ t: 'leaderboard' }, 'leaderboard').then((r) => setData(r)).catch(() => setData({ top: [], rank: 0 }));
  }, []);
  return (
    <div class="col">
      <div class="panel row">
        <GlobeIco style={{ width: '42px', height: '42px' }} />
        <div class="grow">
          <div class="display" style={{ fontSize: '19px' }}>Clasificación mundial</div>
          <div class="muted" style={{ fontSize: '12px', fontWeight: 800 }}>
            {online} jugadores conectados · Tu posición: {data?.rank ? '#' + data.rank : '—'}
          </div>
        </div>
      </div>
      {!data && <div class="empty-state">Cargando...</div>}
      {data?.top.map((pl, i) => (
        <div class="list-item" key={pl.id} style={pl.id === p.serverId ? { borderColor: 'var(--gold)' } : undefined}>
          <div class="display" style={{ width: '30px', textAlign: 'center', fontSize: i < 3 ? '22px' : '16px' }}>
            {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
          </div>
          <div class="ic">
            <AvatarImg cfg={pl.avatar} size={88} />
          </div>
          <div class="grow" style={{ minWidth: 0 }}>
            <div class="tt">{pl.name}</div>
            <div class="ds">
              Nv. {pl.level} {pl.club ? `· [${pl.club.tag}]` : ''}
            </div>
          </div>
          <span class="pill">
            <Trophy class="ico" /> {fmtNum(pl.trophies)}
          </span>
        </div>
      ))}
    </div>
  );
}
