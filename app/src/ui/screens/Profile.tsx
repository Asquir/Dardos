// Perfil del jugador: avatar 3D, estadísticas, logros e historial.

import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useStore, fmtNum } from '../../core/store';
import { profileStore } from '../../meta/profile';
import { avatarView } from '../../engine/avatar';
import { useDragRotate, Progress } from '../components/common';
import { Back, Trophy, Gem } from '../icons';
import { go, openModal, toast } from '../state';
import { audio } from '../../services/audio';
import { ACHIEVEMENTS, xpForNext } from '../../meta/progression';
import { claimAchievement } from '../../meta/economy';
import { ARENAS, arenaForTrophies } from '../../meta/arenas';
import { bumpCurrency } from '../state';
import { EMBLEMS } from './Social';
import { StatsPanel } from './Stats';

export function Profile() {
  const p = useStore(profileStore);
  const v = avatarView();
  const drag = useDragRotate(v);
  const stage = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const r = stage.current?.getBoundingClientRect();
      if (r) v.setRegion(r.top, r.height);
    };
    measure();
    v.focus('full');
    v.setDart(p.equipped);
    window.addEventListener('resize', measure);
    const t = setTimeout(() => v.play('wave'), 700);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      v.setDart(null);
    };
  }, []);
  const [tab, setTab] = useState<'stats' | 'ach' | 'hist'>('stats');
  const claimable = ACHIEVEMENTS.filter((a) => {
    const c = p.achievements[a.id] ?? 0;
    return c < a.tiers.length && a.value(p) >= a.tiers[c];
  }).length;
  return (
    <div class="screen full">
      <div class="pad row">
        <button class="icon-btn" onClick={() => go('home')} aria-label="Volver">
          <Back />
        </button>
        <div class="grow" />
        <button class="btn small blue" onClick={() => go('avatar')}>
          ✏️ Editar avatar
        </button>
      </div>
      <div ref={stage} style={{ height: '34vh', flex: 'none', touchAction: 'none' }} {...drag} />
      <div class="pad content" style={{ textAlign: 'center' }}>
        <button class="display outline" style={{ fontSize: '28px' }} onClick={() => openModal({ kind: 'nameEdit' })}>
          {p.name} ✏️
        </button>
        <div class="row" style={{ justifyContent: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
          <span class="pill">⭐ Nivel {p.level}</span>
          <span class="pill">
            <Trophy class="ico" /> {fmtNum(p.trophies)}
          </span>
          <span class="pill">{ARENAS[arenaForTrophies(p.bestTrophies)].icon} Arena {arenaForTrophies(p.bestTrophies) + 1}</span>
          {p.club && (
            <span class="pill">
              {EMBLEMS[p.club.emblem % EMBLEMS.length]} {p.club.tag}
            </span>
          )}
        </div>
        <div style={{ margin: '8px auto 0', maxWidth: '300px' }}>
          <Progress value={p.xp} max={xpForNext(p.level)} color="blue" label={`${p.xp} / ${xpForNext(p.level)} XP`} />
        </div>
      </div>
      <div class="pad content" style={{ marginTop: '10px' }}>
        <div class="tabs">
          <button class={tab === 'stats' ? 'on' : ''} onClick={() => setTab('stats')}>
            Estadísticas
          </button>
          <button class={tab === 'ach' ? 'on' : ''} onClick={() => setTab('ach')}>
            Logros {claimable > 0 && <span class="badge" style={{ top: '-6px', right: '-2px' }}>{claimable}</span>}
          </button>
          <button class={tab === 'hist' ? 'on' : ''} onClick={() => setTab('hist')}>
            Historial
          </button>
        </div>
      </div>
      <div class="scroll grow content pad" style={{ paddingTop: '10px' }}>
        {tab === 'stats' && <StatsPanel />}
        {tab === 'ach' && (
          <div>
            {ACHIEVEMENTS.map((a) => {
              const claimed = p.achievements[a.id] ?? 0;
              const done = claimed >= a.tiers.length;
              const target = a.tiers[Math.min(claimed, a.tiers.length - 1)];
              const val = a.value(p);
              const can = !done && val >= target;
              return (
                <div class="list-item" key={a.id}>
                  <div class="ic">{a.icon}</div>
                  <div class="grow" style={{ minWidth: 0 }}>
                    <div class="tt">
                      {a.name} <span class="muted">{'★'.repeat(claimed)}{'☆'.repeat(a.tiers.length - claimed)}</span>
                    </div>
                    <div class="ds">{done ? '¡Completado!' : a.desc(target)}</div>
                    {!done && <Progress value={Math.min(val, target)} max={target} style={{ height: '14px', marginTop: '4px' }} />}
                  </div>
                  {!done && (
                    <button
                      class={'btn tiny ' + (can ? 'shine' : 'gray')}
                      disabled={!can}
                      onClick={() => {
                        const g = claimAchievement(a.id);
                        if (g) {
                          audio.gem();
                          bumpCurrency('gems');
                          toast(`+${g} gemas`, 'good');
                        }
                      }}
                    >
                      <Gem class="ico" /> {a.gems[claimed]}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {tab === 'hist' && (
          <div>
            {p.history.length === 0 && <div class="empty-state">Todavía no has jugado partidas.</div>}
            {p.history.map((h, i) => (
              <div class="list-item" key={i}>
                <div class="ic" style={{ background: h.won ? 'rgba(54,214,107,.3)' : 'rgba(255,77,109,.25)' }}>{h.won ? '🏆' : '✖️'}</div>
                <div class="grow">
                  <div class="tt">
                    {h.won ? 'Victoria' : 'Derrota'} vs {h.opponent}
                  </div>
                  <div class="ds">
                    {{ ranked: 'Clasificatoria', online: 'Online', training: 'Entrenamiento', tournament: 'Torneo', private: 'Sala privada', local: 'Local', challenge: 'Desafío', tutorial: 'Tutorial' }[h.mode] ?? h.mode} · Media {h.avg} · {new Date(h.at).toLocaleDateString('es-ES')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
