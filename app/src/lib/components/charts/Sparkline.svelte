<script lang="ts">
  /**
   * A trend at a glance: no axes, no legend, no labels but the last point.
   *
   * Deliberately not a Chart: at this size the furniture would outweigh the
   * line, and it lives inside a table row that already names what it shows.
   */
  import { linear, path } from './scale';

  interface Props {
    values: number[];
    label: string;
    width?: number;
    height?: number;
  }
  let { values, label, width = 96, height = 24 }: Props = $props();

  const min = $derived(Math.min(0, ...values));
  const max = $derived(Math.max(1, ...values));
  const points = $derived.by(() => {
    if (values.length < 2) return [];
    const x = linear([0, values.length - 1], [1, width - 1]);
    const y = linear([min, max], [height - 2, 2]);
    return values.map((v, i) => [x(i), y(v)] as [number, number]);
  });
  const last = $derived(points[points.length - 1]);
</script>

{#if points.length >= 2}
  <svg role="img" aria-label={`${label}: ${values.join(', ')}`}
       viewBox="0 0 {width} {height}" width={width} height={height}>
    <path d={path(points)} fill="none" stroke="var(--t-text-muted)" stroke-width="2"
          stroke-linejoin="round" stroke-linecap="round" />
    <circle cx={last[0]} cy={last[1]} r="3" fill="var(--t-blue)"
            stroke="var(--t-surface)" stroke-width="2" />
  </svg>
{:else}
  <span class="muted">—</span>
{/if}

<style>
  svg { display: block; overflow: visible; }
</style>
