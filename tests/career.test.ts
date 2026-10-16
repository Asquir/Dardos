import { describe, expect, it } from 'vitest';
import { profileStore, defaultProfile } from '../app/src/meta/profile';
import { TOUR, applyCareer, careerRank, closeSeason, currentOpponent, newCareer, skipStop, startStop } from '../app/src/meta/career';

function fresh() {
  const p = defaultProfile();
  p.career = newCareer();
  profileStore.set(p);
  return p;
}

describe('carrera profesional', () => {
  it('monta el cuadro, avanza al ganar y reparte puntos y premio', () => {
    fresh();
    startStop();
    let c = profileStore.get().career!;
    expect(c.bracket).toHaveLength(8);
    expect(c.bracket).toContain(-1);
    expect(currentOpponent(c)).not.toBeNull();
    const coins = profileStore.get().coins;
    applyCareer(true);
    applyCareer(true);
    const post = applyCareer(true); // campeón
    c = profileStore.get().career!;
    expect(post.champion).toBe(true);
    expect(c.titles).toBe(1);
    expect(c.pts).toBe(100);
    expect(c.stop).toBe(1);
    expect(profileStore.get().coins).toBeGreaterThan(coins);
    // el resto del cuadro también sumó
    expect(c.pros.some((x) => x.pts > 0)).toBe(true);
  });
  it('perder en cuartos da los puntos de cuartos y pasa de parada', () => {
    fresh();
    startStop();
    applyCareer(false);
    const c = profileStore.get().career!;
    expect(c.pts).toBe(15);
    expect(c.results[0]).toBe(0);
    expect(c.stop).toBe(1);
  });
  it('la temporada termina, se cobra y empieza otra con el ranking a cero', () => {
    fresh();
    for (let i = 0; i < TOUR.length; i++) {
      const { qualified } = startStop();
      if (!qualified) {
        skipStop();
        continue;
      }
      applyCareer(i % 2 === 0);
      if (profileStore.get().career!.stop === i) applyCareer(false);
      while (profileStore.get().career!.stop === i) applyCareer(false);
    }
    const c = profileStore.get().career!;
    expect(c.stop).toBe(TOUR.length);
    expect(careerRank(c)).toBeGreaterThan(0);
    const res = closeSeason();
    expect(res).not.toBeNull();
    const next = profileStore.get().career!;
    expect(next.season).toBe(2);
    expect(next.pts).toBe(0);
    expect(next.pros.every((x) => x.pts <= 100)).toBe(true);
  });
});
