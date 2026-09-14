/**
 * Scales and paths.
 *
 * Pure, so the geometry is asserted in tests rather than eyeballed -- the
 * same treatment field.ts gets.
 */

/** Map a value from `domain` onto `range`. A zero-width domain pins to the start. */
export function linear(
  domain: [number, number],
  range: [number, number],
): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  if (span === 0) return () => r0;
  return (value) => r0 + ((value - d0) / span) * (r1 - r0);
}

/**
 * Round tick values covering [min, max].
 *
 * Steps are 1, 2, 5 or 10 times a power of ten, so an axis never reads
 * 0, 3.7, 7.4.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];

  const rough = (max - min) / Math.max(count, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;

  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  // Rounded because floating point accumulates: 0.30000000000000004 on an axis.
  for (let t = start; t <= max + step / 1e6; t += step) {
    ticks.push(Number(t.toFixed(10)));
  }
  return ticks;
}

export interface Band {
  x(index: number): number;
  width: number;
}

/** Evenly spaced slots across `width`, with `gap` of surface between them. */
export function band(count: number, width: number, gap = 2): Band {
  if (count <= 0) return { x: () => 0, width: 0 };
  const slot = width / count;
  return {
    x: (index) => index * slot + gap / 2,
    width: Math.max(slot - gap, 1),
  };
}

/** An SVG path through points. Empty input yields an empty path, not "M". */
export const path = (points: [number, number][]): string =>
  points.length === 0
    ? ''
    : points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
