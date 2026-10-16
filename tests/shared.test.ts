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

describe('modos nuevos', () => {
  it('Shanghái: puntúa el número de la ronda y gana con simple, doble y triple', () => {
    let r = play(createMatch({ mode: 'shanghai' }, 2), ['S1', 'T1', 'S5']);
    expect(r.state.players[0].points).toBe(4);
    expect(r.event).toBe('turnEnd');
    // ronda 1 del rival y ronda 2: Shanghái
    r = play(r.state, ['S1', 'S1', 'S1']);
    r = play(r.state, ['S2', 'D2', 'T2']);
    expect(r.event).toBe('matchWon');
    expect(r.state.winner).toBe(0);
  });
  it('Shanghái: tras las rondas gana quien más suma', () => {
    let s = createMatch({ mode: 'shanghai', maxTurns: 2 }, 2);
    let r = play(s, ['T1', 'S20', 'S20']);
    r = play(r.state, ['S1', 'S20', 'S20']);
    r = play(r.state, ['S2', 'S20', 'S20']);
    r = play(r.state, ['S2', 'S20', 'S20']);
    expect(r.event).toBe('matchWon');
    expect(r.state.winner).toBe(0);
    s = r.state;
    expect(s.players[0].points).toBe(5);
  });
  it('Halve-It: sin acertar el objetivo se divide a la mitad', () => {
    const r = play(createMatch({ mode: 'halveit' }, 1), ['S20', 'S20', 'S20']);
    expect(r.state.players[0].points).toBe(20); // 40 → 20
    const r2 = play(createMatch({ mode: 'halveit' }, 1), ['T15', 'S20', 'S20']);
    expect(r2.state.players[0].points).toBe(85);
  });
  it("Bob's 27: suma el doble acertado y resta si no", () => {
    let r = play(createMatch({ mode: 'bobs27' }, 1), ['D1', 'D1', 'S20']);
    expect(r.state.players[0].points).toBe(31);
    r = play(r.state, ['S20', 'S20', 'S20']); // ronda D2 fallada: -4
    expect(r.state.players[0].points).toBe(27);
    // fallar mucho acaba la partida
    let s = createMatch({ mode: 'bobs27' }, 1);
    let ev = '';
    for (let i = 0; i < 6 && ev !== 'matchWon'; i++) ev = play(s, ['S20', 'S20', 'S20']).event, (s = play(s, ['S20', 'S20', 'S20']).state);
    expect(s.winner).toBe(0);
    expect(s.players[0].points).toBeLessThanOrEqual(0);
  });
  it('Béisbol: carreras según el multiplicador', () => {
    const r = play(createMatch({ mode: 'baseball' }, 1), ['T1', 'D1', 'S2']);
    expect(r.state.players[0].points).toBe(5);
  });
  it('Killer: marcas para ser Killer, quitar vidas y eliminar', () => {
    let s = createMatch({ mode: 'killer', seed: 9 }, 2);
    const [a, b] = s.players.map((p) => p.num);
    expect(a).not.toBe(b);
    expect(s.players[0].lives).toBe(3);
    let r = play(s, ['T' + a, 'T' + b, 'S20']); // se hace Killer y quita 3 vidas al rival
    expect(r.state.players[0].killerMarks).toBe(3);
    expect(r.event).toBe('matchWon');
    expect(r.state.winner).toBe(0);
    s = createMatch({ mode: 'killer', seed: 9 }, 3);
    r = play(s, ['S' + s.players[1].num, 'S' + s.players[1].num, 'S' + s.players[1].num]); // sin ser Killer no quita vidas
    expect(r.state.players[1].lives).toBe(3);
  });
  it('los bots juegan los modos nuevos hasta el final', () => {
    const r = rng(3);
    for (const mode of ['shanghai', 'halveit', 'bobs27', 'baseball', 'killer'] as const) {
      let s = createMatch({ mode, seed: 4 }, mode === 'bobs27' ? 1 : 3);
      for (let i = 0; i < 600 && s.winner === null; i++) s = applyThrow(s, botThrow(s, s.current, { sigma: 18, pressure: 1.1 }, r).hit).state;
      expect(s.winner, mode).not.toBeNull();
    }
  });
});

describe('121 Checkout', () => {
  it('al cerrar sube uno y deja casa segura; al fallar vuelve a ella', () => {
    let r = play(createMatch({ mode: 'c121' }, 1), ['T20', 'S11', 'D25']);
    // 121 - 60 - 11 = 50 → bull (DB) = 50 ¡cerrado!
    r = play(createMatch({ mode: 'c121' }, 1), ['T20', 'S11', 'DB']);
    expect(r.state.players[0].target).toBe(122);
    expect(r.state.players[0].safe).toBe(121);
    expect(r.state.players[0].points).toBe(121);
    expect(r.state.players[0].remaining).toBe(122);
    // 9 dardos sin cerrar: vuelta a 121
    let s = r.state;
    for (let i = 0; i < 3; i++) s = play(s, ['S1', 'S1', 'S1']).state;
    expect(s.players[0].target).toBe(121);
    expect(s.players[0].attempts).toBe(2);
    expect(s.players[0].remaining).toBe(121);
  });
  it('termina tras 10 intentos', () => {
    let s = createMatch({ mode: 'c121' }, 1);
    for (let i = 0; i < 30 && s.winner === null; i++) s = play(s, ['S1', 'S1', 'S1']).state;
    expect(s.winner).toBe(0);
    expect(s.players[0].attempts).toBe(10);
  });
});

describe('Cricket Cut-Throat', () => {
  it('los puntos van al rival y gana quien menos tiene', () => {
    let r = play(createMatch({ mode: 'cricket', cutthroat: true }, 2), ['T20', 'T20', 'S1']);
    expect(r.state.players[0].points).toBe(0);
    expect(r.state.players[1].points).toBe(60);
    r = play(createMatch({ mode: 'cricket' }, 2), ['T20', 'T20', 'S1']);
    expect(r.state.players[0].points).toBe(60);
  });
});
