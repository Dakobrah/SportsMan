<script lang="ts">
  /**
   * One block of a report.
   *
   * The single place that knows how each block type is drawn, so a template
   * only has to describe what it wants shown.
   */
  import type { Block } from '../../reports/model';
  import StatTile from '../charts/StatTile.svelte';
  import ScoringByQuarter from '../charts/ScoringByQuarter.svelte';
  import DriveChart from '../charts/DriveChart.svelte';
  import PointsTrend from '../charts/PointsTrend.svelte';
  import DownEfficiency from '../charts/DownEfficiency.svelte';
  import YardageDistribution from '../charts/YardageDistribution.svelte';
  import FieldZones from '../charts/FieldZones.svelte';

  interface Props { block: Block }
  let { block }: Props = $props();
</script>

{#if block.type === 'stats'}
  {#if block.title}<h3>{block.title}</h3>{/if}
  <div class="tiles">
    {#each block.stats as s (s.label)}
      <StatTile label={s.label} value={s.value} hint={s.hint} tone={s.tone} />
    {/each}
  </div>

{:else if block.type === 'bluf'}
  <div class="card bluf">
    <h3>{block.title}</h3>
    {#each block.lines as line, i (i)}<p>{line}</p>{/each}
  </div>

{:else if block.type === 'text'}
  {#if block.title}<h3>{block.title}</h3>{/if}
  <p class="muted note">{block.body}</p>

{:else if block.type === 'table'}
  <div class="card">
    <h3>{block.title}</h3>
    <div class="scroll-x">
      <table class="data">
        <thead>
          <tr>{#each block.body.columns as c (c.key)}
            <th class:right={c.align === 'right'}>{c.label}</th>
          {/each}</tr>
        </thead>
        <tbody>
          {#each block.body.rows as row, i (i)}
            <tr>{#each block.body.columns as c (c.key)}
              <td class:right={c.align === 'right'} class:tabular={c.align === 'right'}>
                {row[c.key] ?? '—'}
              </td>
            {/each}</tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

{:else if block.type === 'chart'}
  <div class="card">
    {#if block.chart.chart === 'scoringByQuarter'}
      <ScoringByQuarter data={block.chart.data} us={block.chart.us} them={block.chart.them} />
    {:else if block.chart.chart === 'driveChart'}
      <DriveChart drives={block.chart.drives} us={block.chart.us} them={block.chart.them} />
    {:else if block.chart.chart === 'pointsTrend'}
      <PointsTrend data={block.chart.data} us={block.chart.us} them={block.chart.them} />
    {:else if block.chart.chart === 'downEfficiency'}
      <DownEfficiency data={block.chart.data} comparison={block.chart.comparison}
                      comparisonLabel={block.chart.comparisonLabel} />
    {:else if block.chart.chart === 'yardageDistribution'}
      <YardageDistribution data={block.chart.data} />
    {:else if block.chart.chart === 'fieldZones'}
      <FieldZones data={block.chart.data} />
    {/if}
    {#if block.caption}<p class="muted caption">{block.caption}</p>{/if}
  </div>
{/if}

<style>
  h3 { font-size: 0.9rem; color: var(--t-text-muted); margin: 0 0 0.4rem; }
  .tiles { display: grid; gap: var(--gap); grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); }
  .bluf p { margin: 0.2rem 0; }
  .note { max-width: 44rem; font-size: 0.85rem; }
  .caption { font-size: 0.8rem; margin: 0.4rem 0 0; }
  .right { text-align: right; }
</style>
