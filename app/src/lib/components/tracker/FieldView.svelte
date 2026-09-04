<script lang="ts">
  import {
    END_ZONE_PCT,
    HASH_PCT,
    PLAYING_PCT,
    fieldPercent,
    toDisplay,
    type Possession,
  } from '../../game/field';

  /**
   * The field, drawn in a fixed frame.
   *
   * Our end zone and theirs each stay put for the whole game, so the ball
   * never jumps across the field on a turnover -- only the arrow showing who
   * is driving turns round. Teams change ends at halftime, which mirrors this
   * rendering and nothing else.
   *
   * The geometry lives in field.ts so it can be asserted rather than
   * eyeballed: end zones outside the playing surface, and hash marks at the
   * NFL's 70'9" from each sideline.
   */
  interface Props {
    ballPosition: number;
    possession: Possession;
    teamAbbr: string;
    opponent: string;
    swapped?: boolean;
  }
  let { ballPosition, possession, teamAbbr, opponent, swapped = false }: Props = $props();

  const pct = (position: number): number => fieldPercent(position, swapped);
  const left = $derived(pct(ballPosition));

  // We attack +50, they attack -50. Swapping ends mirrors which way that is
  // on screen.
  const drivingRight = $derived(possession === 'us' ? !swapped : swapped);

  const leftLabel = $derived(swapped ? opponent : teamAbbr);
  const rightLabel = $derived(swapped ? teamAbbr : opponent);

  /** Numbers every ten yards, counting down to each goal line. */
  const NUMBERS = [-40, -30, -20, -10, 0, 10, 20, 30, 40].map((at) => ({
    at,
    label: String(Math.min(at + 50, 50 - at)),
  }));
</script>

<div
  class="field"
  aria-label={`Ball at ${toDisplay(ballPosition)}, ${possession === 'us' ? teamAbbr : opponent} driving`}
>
  <div class="endzone left" class:theirs={swapped} style="width: {END_ZONE_PCT}%">
    <span>{leftLabel}</span>
  </div>
  <div class="endzone right" class:theirs={!swapped} style="width: {END_ZONE_PCT}%">
    <span>{rightLabel}</span>
  </div>

  <!-- The playing surface, so yard spacing is 1% per yard inside it. -->
  <div class="playing" style="left: {END_ZONE_PCT}%; width: {PLAYING_PCT}%">
    <div class="fives"></div>
    <div class="hash" style="top: {HASH_PCT}%"></div>
    <div class="hash" style="top: {100 - HASH_PCT}%"></div>
  </div>

  <!-- Goal lines: the edges of the playing surface. -->
  <span class="goal" style="left: {pct(-50)}%"></span>
  <span class="goal" style="left: {pct(50)}%"></span>

  {#each NUMBERS as number (number.at)}
    <span class="number" style="left: {pct(number.at)}%">{number.label}</span>
  {/each}

  <div class="ball" style="left: {left}%">
    <span class="marker" class:them={possession === 'them'}></span>
    <span class="label tabular">{toDisplay(ballPosition)}</span>
  </div>

  <span class="arrow" style="left: {left}%">{drivingRight ? '▶' : '◀'}</span>
</div>

<style>
  /* Sideline legibility: this is read at arm's length, in daylight. */
  .field {
    position: relative;
    height: 104px;
    background: linear-gradient(180deg, #12351f 0%, #0e2a19 100%);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .playing { position: absolute; top: 0; bottom: 0; }

  /* Yard lines every five yards, across the full width of the field. */
  .fives {
    position: absolute; inset: 0;
    background: repeating-linear-gradient(
      to right,
      rgba(255, 255, 255, 0.22) 0 1px,
      transparent 1px 5%
    );
  }

  /* Inbounds lines: one short tick per yard, in two rows at NFL spacing. */
  .hash {
    position: absolute; left: 0; right: 0; height: 9px;
    transform: translateY(-50%);
    background: repeating-linear-gradient(
      to right,
      rgba(255, 255, 255, 0.4) 0 1px,
      transparent 1px 1%
    );
  }

  .endzone {
    position: absolute; top: 0; bottom: 0;
    display: grid; place-items: center;
    background: rgba(59, 130, 246, 0.22);
  }
  .endzone.theirs { background: rgba(239, 68, 68, 0.22); }
  .endzone span {
    font-size: 1rem; font-weight: 800; letter-spacing: 0.06em;
    color: rgba(255, 255, 255, 0.8);
    writing-mode: vertical-rl; text-orientation: mixed;
  }
  .endzone.left { left: 0; }
  .endzone.right { right: 0; }

  .goal {
    position: absolute; top: 0; bottom: 0; width: 2px;
    background: rgba(255, 255, 255, 0.7);
    transform: translateX(-50%);
  }

  .number {
    position: absolute; bottom: 3px;
    transform: translateX(-50%);
    font-size: 1.05rem; font-weight: 700;
    color: rgba(255, 255, 255, 0.45);
    font-variant-numeric: tabular-nums;
  }

  .ball {
    position: absolute; top: 10px;
    transform: translateX(-50%);
    display: grid; place-items: center; gap: 4px;
  }
  .marker {
    width: 20px; height: 28px; border-radius: 50%;
    background: #e07b28;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.65);
  }
  .marker.them { background: var(--t-red); }
  .label {
    font-size: 1.2rem; font-weight: 800; color: #fff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.95);
    white-space: nowrap;
  }
  .arrow {
    position: absolute; top: 2px;
    transform: translateX(-50%);
    font-size: 1.1rem;
    color: rgba(255, 255, 255, 0.8);
  }
</style>
