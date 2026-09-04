<script lang="ts">
  import { toDisplay, type Possession } from '../../game/field';

  /**
   * The field, drawn in a fixed frame.
   *
   * Our end zone and theirs each stay put for the whole game, so the ball
   * never jumps across the field on a turnover -- only the arrow showing who
   * is driving turns round. Teams change ends at halftime, which mirrors this
   * rendering and nothing else.
   */
  interface Props {
    ballPosition: number;
    possession: Possession;
    teamAbbr: string;
    opponent: string;
    swapped?: boolean;
  }
  let { ballPosition, possession, teamAbbr, opponent, swapped = false }: Props = $props();

  // -50..+50 maps across the width; see lib/game/field.ts.
  const raw = $derived(((ballPosition + 50) / 100) * 100);
  const left = $derived(swapped ? 100 - raw : raw);

  // We attack +50, they attack -50. Swapping ends mirrors which way that is
  // on screen.
  const drivingRight = $derived(possession === 'us' ? !swapped : swapped);

  const leftLabel = $derived(swapped ? opponent : teamAbbr);
  const rightLabel = $derived(swapped ? teamAbbr : opponent);
</script>

<div class="field" aria-label={`Ball at ${toDisplay(ballPosition)}, ${possession === 'us' ? teamAbbr : opponent} driving`}>
  <div class="endzone left" class:theirs={swapped}><span>{leftLabel}</span></div>
  <div class="endzone right" class:theirs={!swapped}><span>{rightLabel}</span></div>

  {#each [20, 40, 50, 40, 20] as mark, i (i)}
    <span class="tick" style="left: {((i + 1) * 100) / 6}%">{mark}</span>
  {/each}

  <div class="ball" style="left: {left}%">
    <span class="marker" class:them={possession === 'them'}></span>
    <span class="label tabular">{toDisplay(ballPosition)}</span>
  </div>

  <span class="arrow" class:right={drivingRight} style="left: {left}%">
    {drivingRight ? '▶' : '◀'}
  </span>
</div>

<style>
  .field {
    position: relative;
    height: 52px;
    background: linear-gradient(180deg, #12351f 0%, #0e2a19 100%);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }
  .endzone {
    position: absolute; top: 0; bottom: 0; width: 9%;
    display: grid; place-items: center;
    background: rgba(59, 130, 246, 0.18);
  }
  .endzone.theirs { background: rgba(239, 68, 68, 0.18); }
  .endzone span {
    font-size: 0.5rem; font-weight: 800; letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.75);
    writing-mode: vertical-rl; text-orientation: mixed;
  }
  .endzone.left { left: 0; }
  .endzone.right { right: 0; }
  .tick {
    position: absolute; top: 3px;
    transform: translateX(-50%);
    font-size: 0.62rem;
    color: rgba(255, 255, 255, 0.35);
    border-left: 1px solid rgba(255, 255, 255, 0.14);
    padding-left: 3px;
  }
  .ball {
    position: absolute; top: 6px;
    transform: translateX(-50%);
    display: grid; place-items: center; gap: 2px;
  }
  .marker {
    width: 10px; height: 14px; border-radius: 50%;
    background: #e07b28;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.55);
  }
  .marker.them { background: var(--t-red); }
  .label {
    font-size: 0.6rem; font-weight: 700; color: #fff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
    white-space: nowrap;
  }
  .arrow {
    position: absolute; bottom: 1px;
    transform: translateX(-50%);
    font-size: 0.6rem;
    color: rgba(255, 255, 255, 0.7);
  }
</style>
