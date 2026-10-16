import { describe, expect, it } from 'vitest';
import { scoreAt, targetPoint } from '../shared/board';
import { detectAwards, type TurnInfo } from '../app/src/game/awards';

const at = (t: string) => {
  const p = targetPoint(t);
  return scoreAt(p.x, p.y);
};
const turn = (ts: string[], extra: Partial<TurnInfo> = {}): TurnInfo => {
  const hits = ts.map(at);
  return { mode: 'x01', hits, total: hits.reduce((a, h) => a + h.points, 0), bust: false, checkout: false, startLeft: 0, legDarts: 30, start: 501, ...extra };
};

describe('premios de turno', () => {
  it('180, high ton y low ton', () => {
    expect(detectAwards(turn(['T20', 'T20', 'T20']))[0]).toBe('ton80');
    expect(detectAwards(turn(['T20', 'T20', 'T19']))).toContain('highton');
    expect(detectAwards(turn(['T20', 'S20', 'S20']))).toContain('lowton');
    expect(detectAwards(turn(['S20', 'S1', 'S5']))).toEqual([]);
  });
  it('hat trick, tres en la cama, caballo blanco y shanghái', () => {
    expect(detectAwards(turn(['DB', 'SB', 'DB']))[0]).toBe('hattrick');
    expect(detectAwards(turn(['T19', 'T19', 'T19']))).toContain('bed');
    expect(detectAwards(turn(['S5', 'S5', 'S5']))).toContain('bed');
    expect(detectAwards(turn(['T20', 'T19', 'T18']))).toContain('whitehorse');
    expect(detectAwards(turn(['S20', 'D20', 'T20']))).toContain('shanghai');
  });
  it('cierres especiales', () => {
    expect(detectAwards(turn(['T20', 'T20', 'DB'], { checkout: true, startLeft: 170 }))[0]).toBe('bigfish');
    expect(detectAwards(turn(['D1'], { checkout: true, startLeft: 2 }))).toContain('madhouse');
    expect(detectAwards(turn(['T20', 'T19', 'D12'], { checkout: true, startLeft: 141, legDarts: 9 }))[0]).toBe('ninedarter');
    expect(detectAwards(turn(['T20', 'T20', 'T20'], { bust: true }))).toEqual([]);
  });
});

import { decodeDuel, encodeDuel } from '../app/src/meta/duel';
import { applyThrow, createMatch, duelNumbers, roundTarget } from '../shared/rules';

describe('retos entre amigos', () => {
  it('el código lleva semilla, puntos y nombre y detecta erratas', () => {
    const code = encodeDuel({ seed: 123456, score: 187, name: 'Javí' });
    expect(decodeDuel(code)).toEqual({ seed: 123456, score: 187, name: 'Javi' });
    expect(decodeDuel(code.replace('187', '188'))).toBeNull();
    expect(decodeDuel('hola')).toBeNull();
  });
  it('el mismo reto tiene los mismos números dobles', () => {
    expect(duelNumbers(42)).toEqual(duelNumbers(42));
    const s = createMatch({ mode: 'duel9', seed: 42 }, 1);
    expect(roundTarget(s)).toBe('S' + duelNumbers(42)[0]);
    const n = duelNumbers(42)[0];
    const r = applyThrow(s, at('T' + n));
    expect(r.state.players[0].points).toBe(n * 6);
  });
});
