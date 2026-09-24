<script lang="ts">
  /**
   * A one-tap pick from a short list: a quick-yard amount, a roster number, a
   * formation, a play.
   *
   * Four components each carried their own copy of this rule, and the copies
   * had drifted to three different selected colours for the same act of
   * picking something. One component, one meaning.
   */
  export type ChipVariant = 'selected' | 'positive' | 'negative' | 'caution' | 'info' | 'special';

  interface Props {
    label: string | number;
    pressed: boolean;
    variant?: ChipVariant;
    /** 'md' is the gloved-thumb floor for grids of numbers; 'sm' suits inline
     *  word chips that wrap, where 56px of width would be wasted. */
    size?: 'sm' | 'md';
    title?: string;
    onpress: () => void;
  }
  let { label, pressed, variant = 'selected', size = 'md', title, onpress }: Props = $props();
</script>

<button
  type="button" class="chip {variant} {size}" class:on={pressed}
  aria-pressed={pressed} {title} onclick={onpress}
>{label}</button>

<style>
  .chip {
    border-radius: 8px;
    border: 1.5px solid var(--t-border);
    background: var(--t-surface-2);
    color: var(--t-text);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  /* The floor a cold or gloved thumb needs; do not shrink these. */
  .md { min-width: 56px; min-height: 52px; padding: 4px 8px; }
  .sm { min-height: 44px; padding: 0 0.75rem; font-weight: 600; }

  /* Level 2: fill plus a ring darker than the fill. See ToggleButton for why
     the ring is not the fill colour. */
  .chip.on {
    background: var(--hue);
    border-color: color-mix(in srgb, var(--hue) 65%, #000);
    color: var(--ink);
  }

  .selected { --hue: var(--c-selected); --ink: var(--c-selected-ink); }
  .positive { --hue: var(--c-positive); --ink: var(--c-positive-ink); }
  .negative { --hue: var(--c-negative); --ink: var(--c-negative-ink); }
  .caution  { --hue: var(--c-caution);  --ink: var(--c-caution-ink); }
  .info     { --hue: var(--c-info);     --ink: var(--c-info-ink); }
  .special  { --hue: var(--c-special);  --ink: var(--c-special-ink); }
</style>
