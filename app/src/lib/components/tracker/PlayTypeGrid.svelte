<script lang="ts">
  import type { PlayFormType } from '../../game/playForm';
  import Tile from './Tile.svelte';

  interface Props {
    onselect: (type: PlayFormType) => void;
    onspecialteams: () => void;
  }
  let { onselect, onspecialteams }: Props = $props();
</script>

<div class="grid">
  <Tile label="Run" variant="positive" onpress={() => onselect('run')} />
  <Tile label="Pass" variant="info" onpress={() => onselect('pass')} />
  <Tile label="Special Teams" variant="special" onpress={onspecialteams} />
  <Tile label="Penalty" variant="caution" onpress={() => onselect('penalty')} />
</div>

<style>
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px; }
</style>
