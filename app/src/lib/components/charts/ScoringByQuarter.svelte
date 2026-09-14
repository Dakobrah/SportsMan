<script lang="ts">
  /**
   * Points per quarter, both sides.
   *
   * Grouped columns rather than stacked: the question is "who scored more in
   * the third?", which is a comparison between the pair, not a total. Only
   * eight numbers, so every column is labelled directly and the tooltip is a
   * convenience rather than the only way to read a value.
   */
  import type { QuarterPoints } from '../../reports/scoring';
  import { AXIS_TEXT, GRID, MARK_GAP, SIDE_COLOR } from './theme';
  import { band, linear, niceTicks } from './scale';
  import Chart from './Chart.svelte';

  interface Props {
    data: QuarterPoints[];
    us: string;
    them: string;
  }
  let { data, us, them }: Props = $props();

  const max = $derived(Math.max(4, ...data.flatMap((d) => [d.us, d.them])));
  const total = $derived(
    data.reduce((t, d) => ({ us: t.us + d.us, them: t.them + d.them }), { us: 0, them: 0 }),
  );
</script>

<Chart
  title="Scoring by quarter"
  desc={`${us} ${total.us}, ${them} ${total.them} across ${data.length} quarters.`}
  legend={[{ label: us, color: SIDE_COLOR.us }, { label: them, color: SIDE_COLOR.them }]}
>
  {#snippet children({ w, h })}
    {@const y = linear([0, max], [h, 0])}
    {@const outer = band(data.length, w, 12)}

    {#each niceTicks(0, max, 4) as tick (tick)}
      <line x1="0" x2={w} y1={y(tick)} y2={y(tick)} stroke={GRID} stroke-width="1" />
      <text x="-8" y={y(tick)} dy="0.32em" text-anchor="end" font-size="11" fill={AXIS_TEXT}>
        {tick}
      </text>
    {/each}

    {#each data as row, i (row.quarter)}
      {@const slot = outer.x(i)}
      {@const half = (outer.width - MARK_GAP) / 2}
      {#each [{ v: row.us, c: SIDE_COLOR.us, o: 0, who: us }, { v: row.them, c: SIDE_COLOR.them, o: half + MARK_GAP, who: them }] as bar (bar.who)}
        <rect
          x={slot + bar.o} y={y(bar.v)} width={half} height={Math.max(h - y(bar.v), 0)}
          fill={bar.c} rx="4"
        ><title>{bar.who} · Q{row.quarter} · {bar.v}</title></rect>
        {#if bar.v > 0}
          <text
            x={slot + bar.o + half / 2} y={y(bar.v) - 5}
            text-anchor="middle" font-size="12" font-weight="700" fill="var(--t-text)"
          >{bar.v}</text>
        {/if}
      {/each}
      <text x={slot + outer.width / 2} y={h + 18} text-anchor="middle" font-size="12" fill={AXIS_TEXT}>
        Q{row.quarter}
      </text>
    {/each}
  {/snippet}

  {#snippet table()}
    <table class="data">
      <thead>
        <tr><th>Quarter</th>{#each data as row (row.quarter)}<th>Q{row.quarter}</th>{/each}<th>Total</th></tr>
      </thead>
      <tbody>
        <tr><td>{us}</td>{#each data as row (row.quarter)}<td class="tabular">{row.us}</td>{/each}<td class="tabular">{total.us}</td></tr>
        <tr><td>{them}</td>{#each data as row (row.quarter)}<td class="tabular">{row.them}</td>{/each}<td class="tabular">{total.them}</td></tr>
      </tbody>
    </table>
  {/snippet}
</Chart>
