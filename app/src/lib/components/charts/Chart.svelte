<script lang="ts">
  /**
   * The shell every chart uses, so none of them repeats it.
   *
   * Owns the accessible wrapper (role="img" with a title and description),
   * the legend, the responsive viewBox, and the table twin that sits under
   * every plot. That table is not optional: it is what makes a value
   * reachable without hovering, readable by a screen reader, and present in
   * an export.
   */
  import type { Snippet } from 'svelte';

  export interface LegendItem {
    label: string;
    color: string;
  }

  interface Props {
    title: string;
    desc: string;
    width?: number;
    height?: number;
    padding?: { top: number; right: number; bottom: number; left: number };
    legend?: LegendItem[];
    /** Rendered inside the SVG, given the plot area in user units. */
    children: Snippet<[{ w: number; h: number }]>;
    /** The same numbers as a table. Required. */
    table: Snippet;
  }

  let {
    title, desc, width = 640, height = 260,
    padding = { top: 12, right: 12, bottom: 28, left: 36 },
    legend = [], children, table,
  }: Props = $props();

  // A module counter rather than randomUUID, so ids are deterministic and a
  // component test can assert against them.
  const id = nextId();

  const plot = $derived({
    w: Math.max(width - padding.left - padding.right, 1),
    h: Math.max(height - padding.top - padding.bottom, 1),
  });
</script>

<script lang="ts" module>
  let counter = 0;
  const nextId = () => `chart-${++counter}`;
</script>

<figure class="chart">
  <figcaption>{title}</figcaption>

  <!-- One series needs no legend: the title names it. -->
  {#if legend.length >= 2}
    <ul class="legend">
      {#each legend as item (item.label)}
        <li><span class="swatch" style="background: {item.color}"></span>{item.label}</li>
      {/each}
    </ul>
  {/if}

  <!--
    aria-label rather than aria-labelledby pointing at the <title>: the
    labelledby form is correct SVG, but its resolution into SVG child
    elements is inconsistent across assistive tech and is not implemented in
    jsdom at all, so the name silently came out empty. The <title> and <desc>
    elements stay for tools that do read them.
  -->
  <svg
    role="img" aria-label={title} aria-describedby="{id}-d"
    viewBox="0 0 {width} {height}" preserveAspectRatio="xMidYMid meet"
    width="100%"
  >
    <title>{title}</title>
    <desc id="{id}-d">{desc}</desc>
    <g transform="translate({padding.left},{padding.top})">
      {@render children(plot)}
    </g>
  </svg>

  <details>
    <summary>Table</summary>
    <div class="scroll-x">{@render table()}</div>
  </details>
</figure>

<style>
  .chart { margin: 0; display: grid; gap: 0.5rem; }
  figcaption { font-weight: 700; font-size: 0.95rem; }
  .legend {
    display: flex; flex-wrap: wrap; gap: 0.9rem;
    list-style: none; margin: 0; padding: 0;
    font-size: 0.85rem; color: var(--t-text-muted);
  }
  .legend li { display: flex; align-items: center; gap: 0.35rem; }
  .swatch { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
  svg { display: block; overflow: visible; }
  details { font-size: 0.85rem; }
  summary { cursor: pointer; color: var(--t-text-muted); min-height: var(--tap); display: flex; align-items: center; }
  /* Printing a report should show the numbers, not a collapsed control. */
  @media print {
    details { display: block; }
    summary { display: none; }
  }
</style>
