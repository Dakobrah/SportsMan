<script lang="ts">
  /**
   * Every drive of the game, on one field.
   *
   * A lane per drive, each bar spanning where the drive started to where it
   * ended, on a fixed -50..+50 axis via `fieldPercent` -- the same function
   * FieldView uses, so the tracker and this chart cannot disagree about
   * where the twenty is.
   *
   * Colour is the two sides, which is the only thing colour carries here;
   * the outcome is a word at the end of the bar, never a hue.
   */
  import type { Drive, DriveOutcome } from '../../reports/drives';
  import { RED_ZONE, fieldPercent, toDisplay } from '../../game/field';
  import { AXIS_TEXT, GRID, SIDE_COLOR } from './theme';
  import { band } from './scale';
  import Chart from './Chart.svelte';

  interface Props {
    drives: Drive[];
    us: string;
    them: string;
  }
  let { drives, us, them }: Props = $props();

  const OUTCOME: Record<DriveOutcome, string> = {
    touchdown: 'TD', field_goal: 'FG', missed_fg: 'FG miss', punt: 'Punt',
    downs: 'Downs', interception: 'INT', fumble: 'Fumble', end_of_period: 'End',
  };

  const height = $derived(Math.max(140, drives.length * 18 + 44));
  const scoring = $derived(drives.filter((d) => d.points > 0).length);
  const who = (d: Drive) => (d.possession === 'us' ? us : them);
</script>

<Chart
  title="Drive by drive"
  desc={`${drives.length} drives, ${scoring} of which produced points.`}
  {height}
  padding={{ top: 8, right: 64, bottom: 28, left: 26 }}
  legend={[{ label: us, color: SIDE_COLOR.us }, { label: them, color: SIDE_COLOR.them }]}
>
  {#snippet children({ w, h })}
    {@const lanes = band(drives.length, h, 6)}
    {@const at = (position: number) => (fieldPercent(position) / 100) * w}

    <!-- The red zones at each end, so a bar reaching one is visible as such. -->
    <rect x={at(RED_ZONE)} y="0" width={Math.max(at(50) - at(RED_ZONE), 0)} height={h}
          fill="var(--t-red)" opacity="0.09" />
    <rect x={at(-50)} y="0" width={Math.max(at(-RED_ZONE) - at(-50), 0)} height={h}
          fill="var(--t-blue)" opacity="0.09" />

    {#each [-50, -25, 0, 25, 50] as mark (mark)}
      <line x1={at(mark)} x2={at(mark)} y1="0" y2={h} stroke={GRID} stroke-width="1" />
      <text x={at(mark)} y={h + 16} text-anchor="middle" font-size="11" fill={AXIS_TEXT}>
        {toDisplay(mark)}
      </text>
    {/each}

    {#each drives as drive, i (drive.index)}
      {@const y = lanes.x(i)}
      {@const x1 = at(Math.min(drive.startPosition, drive.endPosition))}
      {@const x2 = at(Math.max(drive.startPosition, drive.endPosition))}
      <rect x={x1} y={y} width={Math.max(x2 - x1, 3)} height={lanes.width}
            fill={SIDE_COLOR[drive.possession]} rx="3">
        <title>
          {who(drive)} · Q{drive.quarter} · {drive.plays} plays, {drive.yards} yards ·
          {OUTCOME[drive.outcome]}
        </title>
      </rect>
      <text x={x2 + 6} y={y + lanes.width / 2} dy="0.32em" font-size="11" fill={AXIS_TEXT}>
        {OUTCOME[drive.outcome]}
      </text>
    {/each}
  {/snippet}

  {#snippet table()}
    <table class="data">
      <thead>
        <tr><th>#</th><th>Team</th><th>Q</th><th>Start</th><th>End</th>
          <th>Plays</th><th>Yards</th><th>Result</th><th>Pts</th></tr>
      </thead>
      <tbody>
        {#each drives as drive (drive.index)}
          <tr>
            <td class="tabular">{drive.index}</td>
            <td>{who(drive)}</td>
            <td class="tabular">{drive.quarter}</td>
            <td>{toDisplay(drive.startPosition)}</td>
            <td>{toDisplay(drive.endPosition)}</td>
            <td class="tabular">{drive.plays}</td>
            <td class="tabular">{drive.yards}</td>
            <td>{OUTCOME[drive.outcome]}</td>
            <td class="tabular">{drive.points}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/snippet}
</Chart>
