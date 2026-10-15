import { describe, expect, it } from 'vitest';
import { scoreAt, targetPoint, wireDistance, BOARD } from '../shared/board';
import { applyThrow, createMatch, threeDartAvg, type MatchState } from '../shared/rules';
import { checkoutRoute, suggestTarget } from '../shared/checkout';
import { botThrow, rng } from '../shared/bot';
import { trophyDelta } from '../shared/protocol';

const at = (t: string) => {
  const p = targetPoint(t);
  return scoreAt(p.x, p.y);
};

describe('diana', () => {
  it('puntúa los segmentos correctamente', () => {
    expect(at('T20').label).toBe('T20');
    expect(at('T20').points).toBe(60);
    expect(at('D16').points).toBe(32);
    expect(at('S5').points).toBe(5);
    expect(at('T19').points).toBe(57);
    expect(at('DB').label).toBe('BULL');
    expect(at('SB').points).toBe(25);
    expect(scoreAt(0, 200).ring).toBe('MISS');
    // el 6 está a la derecha, el 3 abajo, el 11 a la izquierda
    expect(scoreAt(130, 0).num).toBe(6);
    expect(scoreAt(0, -130).num).toBe(3);
    expect(scoreAt(-130, 0).num).toBe(11);
  });
  it('detecta alambres', () => {
    expect(wireDistance(0, BOARD.trebleIn)).toBeLessThan(0.01);
    expect(wireDistance(targetPoint('T20').x, targetPoint('T20').y)).toBeGreaterThan(3);
  });
});

const hit = (t: string) => at(t);
function play(s: MatchState, ts: string[]) {
  let r = { state: s, event: 'dart' as string, turnTotal: 0 };
  for (const t of ts) r = applyThrow(r.state, hit(t));
  return r;
}

describe('X01', () => {
  it('resta puntos y cambia de turno', () => {
    const r = play(createMatch({ mode: 'x01', start: 501 }, 2), ['T20', 'T20', 'T20']);
    expect(r.state.players[0].remaining).toBe(321);
    expect(r.state.players[0].max180).toBe(1);
    expect(r.state.current).toBe(1);
    expect(r.event).toBe('turnEnd');
  });
  it('se pasa (bust) y restaura la puntuación', () => {
    let s = createMatch({ mode: 'x01', start: 40 }, 2);
    const r = play(s, ['T20']);
    expect(r.event).toBe('bust');
    expect(r.state.players[0].remaining).toBe(40);
    expect(r.state.current).toBe(1);
    s = createMatch({ mode: 'x01', start: 40 }, 2);
    expect(play(s, ['S20', 'S20']).event).toBe('bust'); // termina sin doble
  });
  it('cierra con doble y gana', () => {
    const r = play(createMatch({ mode: 'x01', start: 40 }, 2), ['D20']);
    expect(r.event).toBe('matchWon');
    expect(r.state.winner).toBe(0);
    expect(r.state.players[0].checkoutBest).toBe(40);
  });
  it('legs al mejor de 3', () => {
    let s = createMatch({ mode: 'x01', start: 40, legsToWin: 2 }, 2);
    let r = play(s, ['D20']);
    expect(r.event).toBe('legWon');
    expect(r.state.current).toBe(1); // empieza el otro jugador
    expect(r.state.players[0].remaining).toBe(40);
    r = play(r.state, ['D20']);
    expect(r.state.players[1].legs).toBe(1);
    r = play(r.state, ['D20']);
    expect(r.event).toBe('matchWon');
  });
  it('media de tres dardos', () => {
    const r = play(createMatch({ mode: 'x01', start: 501 }, 2), ['T20', 'S20', 'S20']);
    expect(threeDartAvg(r.state.players[0])).toBe(100);
  });
});

describe('Cricket y Reloj', () => {
  it('cricket marca y puntúa', () => {
    let r = play(createMatch({ mode: 'cricket' }, 2), ['T20', 'T20', 'S1']);
    expect(r.state.players[0].marks[5]).toBeGreaterThanOrEqual(3);
    expect(r.state.players[0].points).toBe(60);
  });
  it('alrededor del reloj avanza', () => {
    const r = play(createMatch({ mode: 'atc' }, 1), ['S1', 'T2', 'S5']);
    expect(r.state.players[0].remaining).toBe(3);
  });
});

describe('checkouts', () => {
  it('rutas clásicas', () => {
    expect(checkoutRoute(170)).toEqual(['T20', 'T20', 'DB']);
    expect(checkoutRoute(40)).toEqual(['D20']);
    expect(checkoutRoute(32)).toEqual(['D16']);
    expect(checkoutRoute(169)).toBeNull();
    expect(checkoutRoute(159)).toBeNull();
    expect(checkoutRoute(100)?.length).toBe(2);
    for (let n = 2; n <= 170; n++) {
      const r = checkoutRoute(n);
      if (r) {
        expect(r[r.length - 1].startsWith('D')).toBe(true);
      }
    }
  });
  it('sugerencias sin pasarse', () => {
    expect(suggestTarget(501, 3)).toBe('T20');
    expect(['S1', 'S3', 'S5', 'S7', 'S9', 'S11', 'S13', 'S15', 'S17', 'S19']).toContain(suggestTarget(41, 1));
  });
});

describe('bots', () => {
  const avgFor = (sigma: number) => {
    const r = rng(7);
    let total = 0;
    let darts = 0;
    for (let g = 0; g < 200; g++) {
      let s = createMatch({ mode: 'x01', start: 501 }, 1);
      for (let i = 0; i < 300 && s.winner === null; i++) {
        s = applyThrow(s, botThrow(s, 0, { sigma, pressure: 1.1 }, r).hit).state;
      }
      total += s.players[0].scored;
      darts += s.players[0].darts;
    }
    return (total / darts) * 3;
  };
  it('mejor habilidad = mejor media', () => {
    const pro = avgFor(10);
    const novato = avgFor(40);
    expect(pro).toBeGreaterThan(novato);
  });
});

describe('copas', () => {
  it('ganar a alguien mejor da más', () => {
    expect(trophyDelta(1000, 1300).win).toBeGreaterThan(trophyDelta(1300, 1000).win);
  });
});
