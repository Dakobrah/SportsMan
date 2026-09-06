<script lang="ts">
  /**
   * Where the plays happened, as a strip of the field.
   *
   * A sequential ramp: the value is a count, and the zones are ordered by
   * position rather than being unrelated categories.
   */
  import type { ZoneRow } from '../../db/reports/team';
  import { AXIS_TEXT, MARK_GAP, ramp } from './theme';
  import { band } from './scale';
  import Chart from './Chart.svelte';

  interface Props { data: ZoneRow[] }
  let { data }: Props = $props();

  const LABEL: Record<string, string> = {
    own: 'Own half', midfield: 'Midfield', fringe: 'Fringe', red: 'Red zone',
  };

  const max = $derived(Math.max(1, ...data.map((d) => d.plays)));
  const shades = $derived(ramp(5));
  const shadeFor = (plays: number) => shades[Math.min(4, Math.floor((plays / max) * 4.999))];
  const red = $derived(data.find((d) => d.zone === 'red'));
</script>

<Chart
  title="Plays by field zone"
  desc={red
    ? `${red.plays} plays inside the twenty, for ${red.touchdowns} touchdowns.`
    : 'No plays inside the twenty.'}
  height={120}
  padding={{ top: 8, right: 8, bottom: 40, left: 8 }}
>
  {#snippet children({ w, h })}
    {@const cells = band(data.length, w, MARK_GAP)}
    {#each data as zone, i (zone.zone)}
      <rect x={cells.x(i)} y="0" width={cells.width} height={h}
            fill={shadeFor(zone.plays)} rx="6">
        <title>{LABEL[zone.zone]} · {zone.plays} plays · {zone.yards} yards</title>
      </rect>
      <text x={cells.x(i) + cells.width / 2} y={h / 2} dy="0.32em" text-anchor="middle"
            font-size="20" font-weight="800" fill="var(--t-text)">{zone.plays}</text>
      <text x={cells.x(i) + cells.width / 2} y={h + 16} text-anchor="middle"
            font-size="12" fill={AXIS_TEXT}>{LABEL[zone.zone]}</text>
      <text x={cells.x(i) + cells.width / 2} y={h + 32} text-anchor="middle"
            font-size="11" fill={AXIS_TEXT}>{zone.yards} yds</text>
    {/each}
  {/snippet}

  {#snippet table()}
    <table class="data">
      <thead><tr><th>Zone</th><th>Plays</th><th>Yards</th><th>TDs</th></tr></thead>
      <tbody>
        {#each data as zone (zone.zone)}
          <tr>
            <td>{LABEL[zone.zone]}</td>
            <td class="tabular">{zone.plays}</td>
            <td class="tabular">{zone.yards}</td>
            <td class="tabular">{zone.touchdowns}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/snippet}
</Chart>
