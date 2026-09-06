import { describe, expect, it } from 'vitest';
import { band, linear, niceTicks, path } from '../../src/lib/components/charts/scale';

describe('linear', () => {
  it('maps the ends of the domain onto the ends of the range', () => {
    const s = linear([0, 10], [0, 100]);
    expect(s(0)).toBe(0);
    expect(s(10)).toBe(100);
    expect(s(5)).toBe(50);
  });

  it('handles an inverted range, which is how SVG y-axes work', () => {
    const s = linear([0, 10], [200, 0]);
    expect(s(0)).toBe(200);
    expect(s(10)).toBe(0);
  });

  it('does not divide by zero on a flat domain', () => {
    const s = linear([5, 5], [0, 100]);
    expect(Number.isFinite(s(5))).toBe(true);
    expect(s(5)).toBe(0);
  });

  it('extrapolates outside the domain rather than clamping', () => {
    expect(linear([0, 10], [0, 100])(15)).toBe(150);
  });
});

describe('niceTicks', () => {
  it('uses round steps', () => {
    expect(niceTicks(0, 10)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(0, 100)).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it('never produces floating-point noise', () => {
    for (const tick of niceTicks(0, 1)) {
      expect(String(tick)).not.toMatch(/\d{6,}/);
    }
  });

  it('covers the range it was given', () => {
    const ticks = niceTicks(3, 27);
    expect(ticks[0]).toBeGreaterThanOrEqual(3);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(27);
    expect(ticks.length).toBeGreaterThan(1);
  });

  it('copes with a single value and with nonsense', () => {
    expect(niceTicks(7, 7)).toEqual([7]);
    expect(niceTicks(Number.NaN, 10)).toEqual([]);
  });

  it('handles negatives, which a yardage axis needs', () => {
    const ticks = niceTicks(-10, 20);
    expect(ticks).toContain(0);
    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(-10);
  });
});

describe('band', () => {
  it('divides the width evenly with a gap between slots', () => {
    const b = band(4, 400, 2);
    expect(b.width).toBe(98);
    expect(b.x(0)).toBe(1);
    expect(b.x(3)).toBe(301);
    expect(b.x(3) + b.width).toBeLessThanOrEqual(400);
  });

  it('never returns a zero or negative width', () => {
    expect(band(200, 100).width).toBeGreaterThan(0);
  });

  it('survives an empty series', () => {
    expect(band(0, 400).width).toBe(0);
  });
});

describe('path', () => {
  it('starts with a move and continues with lines', () => {
    expect(path([[0, 0], [10, 20]])).toBe('M0.00,0.00 L10.00,20.00');
  });

  it('is empty for no points, rather than a bare M', () => {
    expect(path([])).toBe('');
  });
});
