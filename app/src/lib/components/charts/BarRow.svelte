<script lang="ts">
  /**
   * A magnitude bar behind a number, for a leader board.
   *
   * Nine receivers is nine categories, which is past the point where colour
   * can carry identity -- so a leader board stays a table and the bar just
   * makes the ranking scannable.
   */
  interface Props {
    value: number;
    max: number;
    color?: string;
  }
  let { value, max, color = 'var(--t-blue)' }: Props = $props();
  const pct = $derived(max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100)));
</script>

<span class="track" aria-hidden="true">
  <span class="fill" style="width: {pct}%; background: {color}"></span>
</span>

<style>
  .track { display: block; height: 4px; border-radius: 2px; background: var(--t-surface-2); }
  .fill { display: block; height: 100%; border-radius: 2px; }
</style>
