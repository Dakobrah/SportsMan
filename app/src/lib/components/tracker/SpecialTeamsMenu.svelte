<script lang="ts">
  /**
   * The kicks, narrowed to the ones the situation allows.
   *
   * After a touchdown the tracker opens the try on its own, and after a score
   * or a safety it opens the kickoff; this menu is reached when the coach
   * backs out of one of those, or chooses to kick on a down. So:
   *
   *   try pending      -> PAT / 2pt only
   *   kickoff pending  -> Kickoff only
   *   on a down        -> Punt / Field Goal, and Kickoff -- which a down never
   *                       leads to, except the opening kick of the game,
   *                       which the tracker starts without.
   *
   * Punt and field goal are one choice because they are one decision: fourth
   * down, kick it. The form they open lets the coach switch between them.
   */
  import type { Situation } from '../../db/repositories/types';
  import type { PlayFormType } from '../../game/playForm';
  import Tile from './Tile.svelte';

  interface Props {
    situation: Situation;
    onselect: (type: PlayFormType) => void;
    /** Punt or field goal; the tracker picks which to open on. */
    onkick: () => void;
    onback: () => void;
  }
  let { situation, onselect, onkick, onback }: Props = $props();
</script>

<div class="grid">
  {#if situation === 'extra_point'}
    <Tile label="PAT / 2pt" variant="special" size="sm" wide onpress={() => onselect('extra_point')} />
  {:else if situation === 'kickoff'}
    <Tile label="Kickoff" variant="special" size="sm" wide onpress={() => onselect('kickoff')} />
  {:else}
    <Tile label="Punt / Field Goal" variant="special" size="sm" onpress={onkick} />
    <Tile label="Kickoff" variant="special" size="sm" onpress={() => onselect('kickoff')} />
  {/if}
  <Tile label="‹ Back" size="xs" wide onpress={onback} />
</div>

<style>
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px; }
</style>
