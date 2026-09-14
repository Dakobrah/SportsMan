/**
 * Chart colour, computed rather than chosen.
 *
 * Every value below was checked with the dataviz validator against this
 * app's dark chart surface (#181a24). The measured figures are recorded so a
 * later change can be judged rather than guessed at.
 *
 *   us / them   #3b82f6 + #ef4444   all six checks PASS
 *                                   ΔE 26.7 protan · 36.3 tritan · 35.2 normal
 *   run / pass  #3b82f6 + #d97706   all six checks PASS
 *                                   ΔE 30.2 protan · 28.7 tritan · 34.2 normal
 *
 * One deliberate departure from the UI tokens: `--t-amber` (#f59e0b) FAILS
 * the lightness band at L 0.769, and so does `--t-green` at 0.723. The
 * darker amber-600 below passes every check while still reading as the same
 * hue beside the interface. Charts therefore use it instead of the token.
 *
 * Two orderings were rejected on measurement, not taste:
 *   - blue adjacent to purple: ΔE 1.3 under deuteranopia. Indistinguishable.
 *   - green adjacent to red:   ΔE 7.4 under deuteranopia, inside the 6-8
 *     floor band that is only legal with secondary encoding.
 */

/**
 * The two sides. Matches FieldView, where our end zone is already blue and
 * theirs red, so the same two colours mean the same two teams everywhere.
 */
export const SIDE_COLOR = {
  us: 'var(--t-blue)',
  them: 'var(--t-red)',
} as const;

/** Chart-only amber. See the note above on why this is not `--t-amber`. */
export const CHART_AMBER = '#d97706';

/**
 * The fixed categorical order for anything that is not a side.
 *
 * Assigned in order and never cycled: a fourth series folds into "other" or
 * becomes small multiples rather than getting a generated hue.
 */
export const SERIES = ['var(--t-blue)', CHART_AMBER, 'var(--t-purple)'] as const;

/** Run and pass are not sides, so they take the categorical pair. */
export const PLAY_KIND_COLOR = { run: SERIES[0], pass: SERIES[1] } as const;

/**
 * A sequential ramp for magnitude: one hue, light to dark by construction.
 *
 * Built with the `color-mix` idiom app.css already uses, so it tracks the
 * palette rather than hardcoding steps that would drift from it.
 */
export function ramp(steps: number, hue = 'var(--t-blue)'): string[] {
  if (steps <= 1) return [hue];
  return Array.from({ length: steps }, (_, i) => {
    // 25% at the light end through 100%, monotonic in one hue.
    const weight = 25 + (75 * i) / (steps - 1);
    return `color-mix(in srgb, ${hue} ${weight.toFixed(1)}%, var(--t-surface-2))`;
  });
}

/** Recessive furniture. Grid lines are solid, never dashed. */
export const GRID = 'var(--t-border)';
export const AXIS_TEXT = 'var(--t-text-muted)';
/** A gap of surface between adjacent fills, so they never merge. */
export const MARK_GAP = 2;
