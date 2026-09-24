<script lang="ts">
  /**
   * A press-to-set flag. Django tracked these with data-active attributes and
   * four hardcoded arrays to keep radio-style groups exclusive; here the
   * bound value is a boolean or an enum, so exclusivity is the caller's type.
   *
   * Variants name the meaning, not the hue. A call site reads
   * `variant="negative"` so that the day green also became the commit colour,
   * nothing here had to move.
   */
  export type ToggleVariant = 'positive' | 'negative' | 'caution' | 'info' | 'special';

  interface Props {
    label: string;
    pressed: boolean;
    variant?: ToggleVariant;
    onpress: () => void;
  }
  let { label, pressed, variant = 'info', onpress }: Props = $props();
</script>

<button type="button" class="toggle {variant}" class:on={pressed} aria-pressed={pressed} onclick={onpress}>
  {label}
</button>

<style>
  /* Level 1 off, level 2 on. The border keeps its hue in both states: before
     this, every variant was the same grey when off, so "Fumble" and "1st
     Down" were indistinguishable until after you had tapped one. */
  .toggle {
    min-height: 52px;
    padding: 0 0.75rem;
    border: 1.5px solid color-mix(in srgb, var(--hue) 35%, var(--t-border));
    border-radius: 8px;
    background: var(--t-surface-2);
    color: var(--t-text-muted);
    font-weight: 700;
    cursor: pointer;
  }
  /* Level 2 keeps a visible border -- darker than its own fill, so the ring
     reads. That ring is the whole distinction from the borderless commit
     button on the forms where the two share a hue (a pressed TD beside Save
     Run Play), so it must not be set to the fill colour. */
  .toggle.on {
    background: var(--hue);
    border-color: color-mix(in srgb, var(--hue) 65%, #000);
    color: var(--ink);
  }

  .positive { --hue: var(--c-positive); --ink: var(--c-positive-ink); }
  .negative { --hue: var(--c-negative); --ink: var(--c-negative-ink); }
  .caution  { --hue: var(--c-caution);  --ink: var(--c-caution-ink); }
  .info     { --hue: var(--c-info);     --ink: var(--c-info-ink); }
  .special  { --hue: var(--c-special);  --ink: var(--c-special-ink); }
</style>
