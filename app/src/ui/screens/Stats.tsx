// Estadísticas avanzadas del perfil: medias, primeros 9, cierres por doble, evolución, mapa de calor,
// récords de los modos y premios conseguidos.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useStore, fmtNum } from '../../core/store';
import { profileStore, unpackHit, type MatchSummary } from '../../meta/profile';
import { scoreAt, SEGMENTS, BOARD } from '@shared/board';
import { MODES } from '../../meta/modes';
import { AWARDS, type AwardId } from '../../game/awards';
import { audio } from '../../services/audio';

export function StatsPanel() {
  const p = useStore(profileStore);
  const st = p.stats;
  const avg = st.darts ? (st.points / st.darts) * 3 : 0;
  const winRate = st.matches ? Math.round((st.wins / st.matches) * 100) : 0;
  const f9s = p.history.map((h) => h.f9).filter((x): x is number => typeof x === 'number');
  const f9 = f9s.length ? f9s.reduce((a, b) => a + b, 0) / f9s.length : 0;
  const dbl = Object.values(p.doubles).reduce((a, [n, k]) => [a[0] + n, a[1] + k], [0, 0]);
  const coPct = dbl[0] ? Math.round((dbl[1] / dbl[0]) * 100) : 0;
  const [more, setMore] = useState(false);

  return (
    <div class="stats-v2">
      <div class="sv-kpis">
        <Kpi label="Media de 3 dardos" value={avg.toFixed(1)} sub={`Mejor: ${st.bestAvg.toFixed(1)}`} />
        <Kpi label="Primeros 9" value={f9 ? f9.toFixed(1) : '-'} sub={f9s.length ? `en ${f9s.length} partidas` : 'juega un 501'} />
        <Kpi label="% de cierre" value={dbl[0] ? coPct + '%' : '-'} sub={dbl[0] ? `${dbl[1]} de ${dbl[0]} dobles` : 'aún sin intentos'} />
        <Kpi label="Victorias" value={winRate + '%'} sub={`${st.wins} de ${st.matches}`} />
      </div>

      <TrendChart history={p.history} />

      <Heatmap hits={p.hitLog} />

      <DoublesTable doubles={p.doubles} />

      <Records records={p.records} />

      <Awards awards={p.awards} />

      <button class="btn small gray block" style={{ marginTop: '10px' }} onClick={() => (audio.click(), setMore(!more))}>
        {more ? 'Menos datos ▲' : 'Más datos ▼'}
      </button>
      {more && (
        <div class="sv-grid">
          {(
            [
              ['180s', st.s180],
              ['Turnos de 100+', st.tons],
              ['Mayor cierre', st.bestCheckout || '-'],
              ['Leg más rápido (501)', st.bestLegDarts ? st.bestLegDarts + ' dardos' : '-'],
              ['Triples', fmtNum(st.trebles)],
              ['Bulls', fmtNum(st.bulls)],
              ['Dardos lanzados', fmtNum(st.darts)],
              ['Mejor racha', st.bestStreak],
              ['Victorias online', st.onlineWins],
              ['Torneos ganados', st.tournamentsWon],
              ['Cofres abiertos', st.chestsOpened],
              ['Copas máximas', fmtNum(p.bestTrophies)],
            ] as [string, string | number][]
          ).map(([k, v]) => (
            <div key={k} class="sv-cell">
              <div class="k">{k}</div>
              <div class="v">{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div class="sv-kpi">
      <div class="k">{label}</div>
      <div class="v">{value}</div>
      <div class="s">{sub}</div>
    </div>
  );
}

// ------------------------------------------------------------------ evolución de la media

const fmtDay = (t: number) => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

function TrendChart({ history }: { history: MatchSummary[] }) {
  // de la más antigua a la más reciente; solo partidas con media (no las de Killer, Cricket…)
  const pts = history.filter((h) => h.avg > 0 && (!h.game || h.game === 'x01' || h.game === 'free')).slice(0, 30).reverse();
  const [sel, setSel] = useState<number | null>(null);
  if (pts.length < 2)
    return (
      <div class="sv-card">
        <div class="sv-title">📈 Evolución de tu media</div>
        <div class="sv-empty">Juega un par de partidas de 301/501 para ver tu evolución.</div>
      </div>
    );
  const W = 340;
  const H = 130;
  const L = 28;
  const R = 8;
  const T = 10;
  const B = 18;
  const max = Math.max(20, Math.ceil((Math.max(...pts.map((x) => x.avg)) + 5) / 10) * 10);
  const x = (i: number) => L + (i / (pts.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const line = pts.map((h, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(h.avg).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const grid = [0, max / 2, max];
  const mean = pts.reduce((a, h) => a + h.avg, 0) / pts.length;
  const cur = sel ?? pts.length - 1;
  const h = pts[cur];
  const pick = (e: PointerEvent) => {
    const svg = e.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setSel(best);
  };
  return (
    <div class="sv-card">
      <div class="sv-title">📈 Evolución de tu media</div>
      <div class="sv-tip">
        <b>{h.avg.toFixed(1)}</b> de media{h.f9 ? ` · primeros 9: ${h.f9.toFixed(1)}` : ''} · {h.won ? 'victoria' : 'derrota'} contra {h.opponent} · {fmtDay(h.at)}
      </div>
      <svg class="sv-chart" viewBox={`0 0 ${W} ${H}`} onPointerDown={pick} onPointerMove={(e) => e.buttons && pick(e)} role="img" aria-label="Media de tus últimas partidas">
        <defs>
          <linearGradient id="svArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#5fa8ff" stop-opacity="0.35" />
            <stop offset="1" stop-color="#5fa8ff" stop-opacity="0" />
          </linearGradient>
        </defs>
        {grid.map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} class="sv-grid-line" />
            <text x={L - 5} y={y(g) + 3.5} class="sv-axis" text-anchor="end">
              {Math.round(g)}
            </text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(mean)} y2={y(mean)} class="sv-mean" />
        <text x={W - R} y={y(mean) - 4} class="sv-axis" text-anchor="end">
          media {mean.toFixed(1)}
        </text>
        <path d={area} fill="url(#svArea)" />
        <path d={line} class="sv-line" />
        <line x1={x(cur)} x2={x(cur)} y1={T} y2={y(0)} class="sv-cross" />
        {pts.map((p, i) => (
          // victoria = punto relleno; derrota = hueco (no se distingue solo por color)
          <circle key={i} cx={x(i)} cy={y(p.avg)} r={i === cur ? 5.5 : 4} class={'sv-dot' + (p.won ? ' won' : ' lost')} />
        ))}
        <text x={L} y={H - 4} class="sv-axis">
          {fmtDay(pts[0].at)}
        </text>
        <text x={W - R} y={H - 4} class="sv-axis" text-anchor="end">
          {fmtDay(pts[pts.length - 1].at)}
        </text>
      </svg>
      <div class="sv-legend">
        <span>
          <i class="dot won" /> victoria
        </span>
        <span>
          <i class="dot lost" /> derrota
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ mapa de calor

function Heatmap({ hits }: { hits: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const top = useMemo(() => {
    const count = new Map<string, number>();
    for (const v of hits) {
      const { x, y } = unpackHit(v);
      const h = scoreAt(x, y);
      const k = h.ring === 'MISS' ? 'Fuera' : h.label;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [hits.length]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    drawHeatmap(c, hits);
  }, [hits.length]);
  return (
    <div class="sv-card">
      <div class="sv-title">🔥 Dónde caen tus dardos</div>
      {hits.length < 10 ? (
        <div class="sv-empty">Lanza unos cuantos dardos y aquí verás tu mapa de calor.</div>
      ) : (
        <>
          <canvas ref={ref} class="sv-heat" width={480} height={480} aria-label="Mapa de calor de tus impactos" />
          <div class="sv-top">
            {top.map(([k, n]) => (
              <span key={k}>
                <b>{k}</b> {Math.round((n / hits.length) * 100)}%
              </span>
            ))}
          </div>
          <div class="sv-note">Últimos {hits.length} dardos · más claro = más impactos</div>
        </>
      )}
    </div>
  );
}

/** Diana esquemática + densidad de impactos (rampa de un solo tono, de oscuro a claro). */
function drawHeatmap(c: HTMLCanvasElement, hits: number[]) {
  const S = c.width;
  const ctx = c.getContext('2d')!;
  const R = 235; // mm visibles desde el centro
  const k = S / 2 / R;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.translate(S / 2, S / 2);
  // diana apagada para que destaque el calor
  const ring = (r0: number, r1: number, i: number, colors: [string, string]) => {
    const a0 = ((90 - i * 18 - 9) * Math.PI) / 180;
    const a1 = ((90 - i * 18 + 9) * Math.PI) / 180;
    ctx.beginPath();
    ctx.arc(0, 0, r1 * k, -a1, -a0);
    ctx.arc(0, 0, r0 * k, -a0, -a1, true);
    ctx.closePath();
    ctx.fillStyle = colors[i % 2];
    ctx.fill();
  };
  ctx.fillStyle = '#0d1030';
  ctx.beginPath();
  ctx.arc(0, 0, BOARD.radius * k, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 20; i++) {
    ring(BOARD.outerBull, BOARD.trebleIn, i, ['#1c2040', '#3a3f62']);
    ring(BOARD.trebleIn, BOARD.trebleOut, i, ['#5c2433', '#22503a']);
    ring(BOARD.trebleOut, BOARD.doubleIn, i, ['#1c2040', '#3a3f62']);
    ring(BOARD.doubleIn, BOARD.doubleOut, i, ['#5c2433', '#22503a']);
  }
  ctx.fillStyle = '#2a4a3a';
  ctx.beginPath();
  ctx.arc(0, 0, BOARD.outerBull * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a2a3a';
  ctx.beginPath();
  ctx.arc(0, 0, BOARD.bull * k, 0, Math.PI * 2);
  ctx.fill();
  // números
  ctx.fillStyle = 'rgba(220,228,255,0.75)';
  ctx.font = `bold ${Math.round(S * 0.04)}px Nunito, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  SEGMENTS.forEach((n, i) => {
    const a = ((90 - i * 18) * Math.PI) / 180;
    ctx.fillText(String(n), Math.cos(a) * BOARD.numberRing * k, -Math.sin(a) * BOARD.numberRing * k);
  });
  ctx.restore();

  // densidad en una rejilla suavizada
  const N = 96;
  const grid = new Float32Array(N * N);
  const cell = (2 * R) / N;
  const rad = 3;
  for (const v of hits) {
    const { x, y } = unpackHit(v);
    const gx = Math.floor((x + R) / cell);
    const gy = Math.floor((R - y) / cell);
    for (let dy = -rad; dy <= rad; dy++)
      for (let dx = -rad; dx <= rad; dx++) {
        const X = gx + dx;
        const Y = gy + dy;
        if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
        grid[Y * N + X] += Math.exp(-(dx * dx + dy * dy) / 5.2);
      }
  }
  let max = 0;
  for (const g of grid) max = Math.max(max, g);
  if (!max) return;
  const img = ctx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const t = Math.pow(grid[i] / max, 0.7);
    if (t < 0.08) continue;
    // un solo tono (ámbar): de naranja oscuro y transparente a casi blanco y opaco
    img.data[i * 4] = 255;
    img.data[i * 4 + 1] = Math.round(110 + 135 * t);
    img.data[i * 4 + 2] = Math.round(30 + 170 * t * t);
    img.data[i * 4 + 3] = Math.round(40 + 200 * t);
  }
  const tmp = document.createElement('canvas');
  tmp.width = N;
  tmp.height = N;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tmp, 0, 0, S, S);
}

// ------------------------------------------------------------------ dobles

function DoublesTable({ doubles }: { doubles: Record<string, [number, number]> }) {
  const rows = Object.entries(doubles)
    .filter(([, [n]]) => n > 0)
    .sort((a, b) => b[1][0] - a[1][0])
    .slice(0, 8);
  const best = rows.filter(([, [n]]) => n >= 5).sort((a, b) => b[1][1] / b[1][0] - a[1][1] / a[1][0])[0];
  return (
    <div class="sv-card">
      <div class="sv-title">🎯 Tus dobles de cierre</div>
      {!rows.length ? (
        <div class="sv-empty">Cuando tires a un doble para cerrar un 501 verás aquí tu acierto con cada uno.</div>
      ) : (
        <>
          {best && (
            <div class="sv-note">
              Tu doble favorito: <b>{best[0] === 'DB' ? 'BULL' : best[0]}</b> ({Math.round((best[1][1] / best[1][0]) * 100)}%)
            </div>
          )}
          {rows.map(([d, [n, k]]) => {
            const pct = Math.round((k / n) * 100);
            return (
              <div key={d} class="sv-drow">
                <span class="d">{d === 'DB' ? 'BULL' : d}</span>
                <div class="bar">
                  <i style={{ width: pct + '%' }} />
                </div>
                <span class="n">
                  {k}/{n} · <b>{pct}%</b>
                </span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ récords y premios

function Records({ records }: { records: Record<string, number> }) {
  const rows: [string, string, string][] = [];
  for (const id of ['shanghai', 'halveit', 'baseball', 'bobs27'] as const) if (records[id] !== undefined) rows.push([MODES[id].icon, MODES[id].name, `${records[id]} ${id === 'baseball' ? 'carreras' : 'pts'}`]);
  if (records.atc !== undefined) rows.push([MODES.atc.icon, MODES.atc.name, `${records.atc} dardos`]);
  if (records.c121) rows.push([MODES.c121.icon, MODES.c121.name, `hasta ${records.c121}`]);
  if (records.killer) rows.push([MODES.killer.icon, 'Killer', `${records.killer} victorias`]);
  if (!rows.length) return null;
  return (
    <div class="sv-card">
      <div class="sv-title">🏅 Récords personales</div>
      {rows.map(([ic, n, v]) => (
        <div key={n} class="sv-rec">
          <span>
            {ic} {n}
          </span>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}

function Awards({ awards }: { awards: Record<string, number> }) {
  const ids = (Object.keys(AWARDS) as AwardId[]).sort((a, b) => AWARDS[b].tier - AWARDS[a].tier);
  return (
    <div class="sv-card">
      <div class="sv-title">🏆 Premios de turno</div>
      <div class="sv-awards">
        {ids.map((id) => {
          const n = awards[id] ?? 0;
          return (
            <div key={id} class={'sv-aw' + (n ? '' : ' off')} style={{ ['--ac' as string]: AWARDS[id].color }} title={AWARDS[id].desc}>
              <span class="ic">{AWARDS[id].icon}</span>
              <span class="nm">{AWARDS[id].name.replace(/[¡!]/g, '')}</span>
              <b>{n ? '×' + n : '—'}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}
