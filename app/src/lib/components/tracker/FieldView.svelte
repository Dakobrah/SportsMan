<script lang="ts">
  import { toDisplay } from '../../game/field';

  interface Props { ballPosition: number }
  let { ballPosition }: Props = $props();

  // -50..+50 maps across the full width; see lib/game/field.ts.
  const left = $derived(((ballPosition + 50) / 100) * 100);
</script>

<div class="field" aria-label={`Ball at ${toDisplay(ballPosition)}`}>
  <div class="endzone left"></div>
  <div class="endzone right"></div>
  {#each [20, 40, 50, 40, 20] as mark, i (i)}
    <span class="tick" style="left: {((i + 1) * 100) / 6}%">{mark}</span>
  {/each}
  <div class="ball" style="left: {left}%">
    <span class="marker"></span>
    <span class="label tabular">{toDisplay(ballPosition)}</span>
  </div>
</div>

<style>
  .field {
    position: relative;
    height: 44px;
    background: linear-gradient(180deg, #12351f 0%, #0e2a19 100%);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }
  .endzone {
    position: absolute; top: 0; bottom: 0; width: 6%;
    background: rgba(255, 255, 255, 0.07);
  }
  .endzone.left { left: 0; }
  .endzone.right { right: 0; }
  .tick {
    position: absolute; top: 4px;
    transform: translateX(-50%);
    font-size: 0.65rem;
    color: rgba(255, 255, 255, 0.35);
    border-left: 1px solid rgba(255, 255, 255, 0.14);
    padding-left: 3px;
  }
  .ball {
    position: absolute; top: 0; bottom: 0;
    transform: translateX(-50%);
    display: grid; place-items: center; gap: 2px;
  }
  .marker {
    width: 10px; height: 14px; border-radius: 50%;
    background: #e07b28;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5);
  }
  .label {
    font-size: 0.6rem; font-weight: 700; color: #fff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
    white-space: nowrap;
  }
</style>
