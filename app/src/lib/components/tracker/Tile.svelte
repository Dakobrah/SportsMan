<script lang="ts">
  /**
   * A play-type choice: the big outline buttons on the picker and the special
   * teams menu. Both screens carried the same rule at different heights.
   *
   * Tiles are outline-only on purpose -- coloured border and text, never a
   * fill. That is what lets the Run tile stay green without competing with
   * the green Save button, which is the only solid green thing on screen.
   */
  export type TileVariant = 'positive' | 'negative' | 'caution' | 'info' | 'special' | 'neutral';

  interface Props {
    label: string;
    variant?: TileVariant;
    /** 'xs' is a navigation tile such as Back, not a choice. */
    size?: 'xs' | 'sm' | 'md';
    /** Span the whole row -- a lone choice, or Back. */
    wide?: boolean;
    onpress: () => void;
  }
  let { label, variant = 'neutral', size = 'md', wide = false, onpress }: Props = $props();
</script>

<button type="button" class="tile {variant} {size}" class:wide onclick={onpress}>
  {label}
</button>

<style>
  .tile {
    border-radius: 12px;
    border: 1.5px solid var(--hue, var(--t-border));
    background: var(--t-surface-2);
    color: var(--hue, var(--t-text));
    font-weight: 800;
    cursor: pointer;
  }
  .tile:active { transform: scale(0.98); }
  .md { min-height: 88px; font-size: 1.05rem; }
  .sm { min-height: 78px; font-size: 1rem; }
  .xs { min-height: 56px; font-size: 1rem; }
  .wide { grid-column: 1 / -1; }

  .positive { --hue: var(--c-positive); }
  .negative { --hue: var(--c-negative); }
  .caution  { --hue: var(--c-caution); }
  .info     { --hue: var(--c-info); }
  .special  { --hue: var(--c-special); }
  .neutral  { color: var(--t-text-muted); }
</style>
