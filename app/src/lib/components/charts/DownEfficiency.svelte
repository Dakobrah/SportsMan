<script lang="ts">
  /**
   * Conversion rate by down.
   *
   * A sequential single hue, not a categorical scale: the question is how
   * big each rate is, and first down is not a different KIND of thing from
   * third. `comparison` draws a thin baseline tick, which is how a season
   * average sits behind one game without becoming a second series.
   */
  import type { Conversion } from '../../reports/metrics';
  import { AXIS_TEXT, GRID, ramp } from './theme';
  import { band, linear } from './scale';
  import Chart from './Chart.svelte';

  interface Props {
    data: Conversion[];
    comparison?: Conversion[];
    comparisonLabel?: string;
  }
  let { data, comparison, comparisonLabel = 'Season' }: Props = $props();

  const shades = $derived(ramp(Math.max(data.length, 1)));
  const best = $derived(data.reduce((b, d) => (d.pct > b.pct ? d : b), data[0]));
  const ordinal = (down: number) => ['', '1st', '2nd', '3rd', '4th'][down] ?? `${down}`;
</script>

<Chart
  title="Conversion rate by down"
  desc={data.length === 0
    ? 'No downs recorded.'
    : `Best on ${ordinal(best.down)} down at ${best.pct.toFixed(0)}%.`}
  height={200}
  padding={{ top: 8, right: 44, bottom: 24, left: 44 }}
>
  {#snippet children({ w, h })}
    {@const x = linear([0, 100], [0, w])}
    {@const rows = band(data.length, h, 8)}

    {#each [0, 25, 50, 75, 100] as tick (tick)}
      <line x1={x(tick)} x2={x(tick)} y1="0" y2={h} stroke={GRID} stroke-width="1" />
      <text x={x(tick)} y={h + 16} text-anchor="middle" font-size="11" fill={AXIS_TEXT}>{tick}</text>
    {/each}

    {#each data as row, i (row.down)}
      {@const y = rows.x(i)}
      <rect x="0" y={y} width={Math.max(x(row.pct), 1)} height={rows.width}
            fill={shades[i]} rx="4">
        <title>{ordinal(row.down)} down · {row.converted} of {row.attempts} · {row.pct.toFixed(0)}%</title>
      </rect>
      <text x="-8" y={y + rows.width / 2} dy="0.32em" text-anchor="end"
            font-size="12" fill={AXIS_TEXT}>{ordinal(row.down)}</text>
      <text x={x(row.pct) + 6} y={y + rows.width / 2} dy="0.32em"
            font-size="12" font-weight="700" fill="var(--t-text)">
        {row.converted}/{row.attempts}
      </text>

      {#if comparison}
        {@const other = comparison.find((c) => c.down === row.down)}
        {#if other}
          <line x1={x(other.pct)} x2={x(other.pct)} y1={y} y2={y + rows.width}
                stroke="var(--t-text)" stroke-width="2" opacity="0.65">
            <title>{comparisonLabel}: {other.pct.toFixed(0)}%</title>
          </line>
        {/if}
      {/if}
    {/each}
  {/snippet}

  {#snippet table()}
    <table class="data">
      <thead>
        <tr><th>Down</th><th>Converted</th><th>Attempts</th><th>Rate</th>
          {#if comparison}<th>{comparisonLabel}</th>{/if}</tr>
      </thead>
      <tbody>
        {#each data as row (row.down)}
          <tr>
            <td>{ordinal(row.down)}</td>
            <td class="tabular">{row.converted}</td>
            <td class="tabular">{row.attempts}</td>
            <td class="tabular">{row.pct.toFixed(0)}%</td>
            {#if comparison}
              <td class="tabular">
                {(comparison.find((c) => c.down === row.down)?.pct ?? 0).toFixed(0)}%
              </td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  {/snippet}
</Chart>
