<script lang="ts">
  import type { PlayFormType } from '../../game/playForm';
  import type { Situation } from '../../game/nextState';

  interface Props {
    onselect: (type: PlayFormType) => void;
    onback: () => void;
    situation: Situation;
  }
  let { onselect, onback, situation }: Props = $props();
</script>

<div class="grid">
  {#if situation === 'kickoff'}
    <button class="tile" onclick={() => onselect('kickoff')}>Kickoff</button>
  {:else if situation === 'extra_point'}
    <button class="tile" onclick={() => onselect('extra_point')}>PAT / 2pt</button>
  {:else}
    <button class="tile" onclick={() => onselect('punt')}>Punt</button>
    <button class="tile" onclick={() => onselect('field_goal')}>Field Goal</button>
  {/if}
  <button class="tile back" onclick={onback}>‹ Back</button>
</div>

<style>
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px; }
  .tile {
    min-height: 78px; border-radius: 12px;
    border: 1.5px solid var(--t-purple);
    background: var(--t-surface-2); color: var(--t-purple);
    font-size: 1rem; font-weight: 800; cursor: pointer;
  }
  .back { grid-column: 1 / -1; border-color: var(--t-border); color: var(--t-text-muted); min-height: 56px; }
</style>
