<script lang="ts">
  /**
   * Points for and against across a season.
   *
   * Only the last point is labelled: a number on every marker is noise, and
   * the shape is what the chart is for. Markers get a surface ring so the
   * two lines stay separable where they cross.
   */
  import { AXIS_TEXT, GRID, SIDE_COLOR } from './theme';
  import { linear, niceTicks, path } from './scale';
  import Chart from './Chart.svelte';
  import type { TrendPoint } from '../../reports/model';

  interface Props {
    data: TrendPoint[];
    us: string;
    them: string;
  }
  let { data, us, them }: Props = $props();

  const max = $derived(Math.max(7, ...data.flatMap((d) => [d.us, d.them])));
  const totals = $derived(
    data.reduce((t, d) => ({ us: t.us + d.us, them: t.them + d.them }), { us: 0, them: 0 }),
  );
</script>

<Chart
  title="Points by game"
  desc={`${totals.us} scored and ${totals.them} allowed across ${data.length} games.`}
  height={240}
  legend={[{ label: us, color: SIDE_COLOR.us }, { label: them, color: SIDE_COLOR.them }]}
>
  {#snippet children({ w, h })}
    {@const x = linear([0, Math.max(data.length - 1, 1)], [0, w])}
    {@const y = linear([0, max], [h, 0])}

    {#each niceTicks(0, max, 4) as tick (tick)}
      <line x1="0" x2={w} y1={y(tick)} y2={y(tick)} stroke={GRID} stroke-width="1" />
      <text x="-8" y={y(tick)} dy="0.32em" text-anchor="end" font-size="11" fill={AXIS_TEXT}>
        {tick}
      </text>
    {/each}

    {#each [{ key: 'us', color: SIDE_COLOR.us }, { key: 'them', color: SIDE_COLOR.them }] as series (series.key)}
      {@const points = data.map((d, i) => [x(i), y(d[series.key as 'us' | 'them'])] as [number, number])}
      <path d={path(points)} fill="none" stroke={series.color} stroke-width="2"
            stroke-linejoin="round" stroke-linecap="round" />
      {#each points as [cx, cy], i (i)}
        <circle {cx} {cy} r="4" fill={series.color}
                stroke="var(--t-surface)" stroke-width="2">
          <title>{data[i].label} · {series.key === 'us' ? us : them} {data[i][series.key as 'us' | 'them']}</title>
        </circle>
      {/each}
      {#if points.length > 0}
        {@const last = points[points.length - 1]}
        <text x={last[0] + 8} y={last[1]} dy="0.32em" font-size="12" font-weight="700"
              fill="var(--t-text)">
          {data[data.length - 1][series.key as 'us' | 'them']}
        </text>
      {/if}
    {/each}

    {#each data as point, i (point.label)}
      <text x={x(i)} y={h + 18} text-anchor="middle" font-size="11" fill={AXIS_TEXT}>
        {point.label}
      </text>
    {/each}
  {/snippet}

  {#snippet table()}
    <table class="data">
      <thead><tr><th>Game</th><th>{us}</th><th>{them}</th></tr></thead>
      <tbody>
        {#each data as point (point.label)}
          <tr>
            <td>{point.label}</td>
            <td class="tabular">{point.us}</td>
            <td class="tabular">{point.them}</td>
          </tr>
        {/each}
        <tr><td>Total</td><td class="tabular">{totals.us}</td><td class="tabular">{totals.them}</td></tr>
      </tbody>
    </table>
  {/snippet}
</Chart>
