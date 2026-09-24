<script lang="ts">
  import type { PlayFormType } from '../../game/playForm';
  import Tile from './Tile.svelte';

  interface Props {
    onselect: (type: PlayFormType) => void;
    onback: () => void;
  }
  let { onselect, onback }: Props = $props();
</script>

<div class="grid">
  <Tile label="Kickoff" variant="special" size="sm" onpress={() => onselect('kickoff')} />
  <Tile label="Punt" variant="special" size="sm" onpress={() => onselect('punt')} />
  <Tile label="Field Goal" variant="special" size="sm" onpress={() => onselect('field_goal')} />
  <Tile label="PAT / 2pt" variant="special" size="sm" onpress={() => onselect('extra_point')} />
  <Tile label="‹ Back" wide onpress={onback} />
</div>

<style>
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px; }
</style>
