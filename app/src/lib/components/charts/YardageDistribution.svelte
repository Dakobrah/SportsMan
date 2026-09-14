<script lang="ts">
  /**
   * How gains were distributed.
   *
   * Run and pass are the two categories, in the blue/amber pair -- blue/red
   * is reserved for the two teams, and a run is not a side. Stacked, because
   * the question is how many plays landed in each band in total, with the
   * split as secondary.
   */
  import type { YardageBucketRow } from '../../db/reports/team';
  import { AXIS_TEXT, GRID, MARK_GAP, PLAY_KIND_COLOR } from './theme';
  import { band, linear } from './scale';
  import Chart from './Chart.svelte';

  interface Props { data: YardageBucketRow[] }
  let { data }: Props = $props();

  const max = $derived(Math.max(1, ...data.map((d) => d.runs + d.passes)));
  const total = $derived(data.reduce((t, d) => t + d.runs + d.passes, 0));
  const explosive = $derived(
    data.filter((d) => d.bucket === '10-19' || d.bucket === '20+')
        .reduce((t, d) => t + d.runs + d.passes, 0),
  );
</script>

<Chart
  title="Gains by yardage"
  desc={`${total} plays, ${explosive} of them ten yards or more.`}
  height={220}
  padding={{ top: 8, right: 32, bottom: 24, left: 56 }}
  legend={[
    { label: 'Run', color: PLAY_KIND_COLOR.run },
    { label: 'Pass', color: PLAY_KIND_COLOR.pass },
  ]}
>
  {#snippet children({ w, h })}
    {@const x = linear([0, max], [0, w])}
    {@const rows = band(data.length, h, 6)}

    {#each data as row, i (row.bucket)}
      {@const y = rows.x(i)}
      {@const runWidth = row.runs > 0 ? Math.max(x(row.runs), 2) : 0}
      {@const passWidth = row.passes > 0 ? Math.max(x(row.passes), 2) : 0}

      {#if runWidth > 0}
        <rect x="0" y={y} width={runWidth} height={rows.width}
              fill={PLAY_KIND_COLOR.run} rx="4">
          <title>{row.bucket} yards · {row.runs} runs</title>
        </rect>
      {/if}
      {#if passWidth > 0}
        <!-- A gap of surface, so the two segments never read as one bar. -->
        <rect x={runWidth + (runWidth > 0 ? MARK_GAP : 0)} y={y}
              width={passWidth} height={rows.width}
              fill={PLAY_KIND_COLOR.pass} rx="4">
          <title>{row.bucket} yards · {row.passes} passes</title>
        </rect>
      {/if}

      <text x="-8" y={y + rows.width / 2} dy="0.32em" text-anchor="end"
            font-size="12" fill={AXIS_TEXT}>{row.bucket}</text>
      {#if row.runs + row.passes > 0}
        <text x={runWidth + passWidth + MARK_GAP + 6} y={y + rows.width / 2} dy="0.32em"
              font-size="12" fill="var(--t-text)">{row.runs + row.passes}</text>
      {/if}
    {/each}
    <line x1="0" x2="0" y1="0" y2={h} stroke={GRID} stroke-width="1" />
  {/snippet}

  {#snippet table()}
    <table class="data">
      <thead><tr><th>Yards</th><th>Runs</th><th>Passes</th><th>Total</th></tr></thead>
      <tbody>
        {#each data as row (row.bucket)}
          <tr>
            <td>{row.bucket}</td>
            <td class="tabular">{row.runs}</td>
            <td class="tabular">{row.passes}</td>
            <td class="tabular">{row.runs + row.passes}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/snippet}
</Chart>
