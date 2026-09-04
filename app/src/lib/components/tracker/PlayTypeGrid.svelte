<script lang="ts">
  import type { PlayFormType } from '../../game/playForm';

  interface Props {
    onselect: (type: PlayFormType) => void;
    onspecialteams: () => void;
  }
  let { onselect, onspecialteams }: Props = $props();
</script>

<div class="grid">
  <button class="tile green" onclick={() => onselect('run')}>Run</button>
  <button class="tile blue" onclick={() => onselect('pass')}>Pass</button>
  <button class="tile purple" onclick={onspecialteams}>Special Teams</button>
  <button class="tile amber" onclick={() => onselect('penalty')}>Penalty</button>
</div>

<style>
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px; }
  .tile {
    min-height: 88px;
    border-radius: 12px;
    border: 1.5px solid var(--t-border);
    background: var(--t-surface-2);
    color: var(--t-text);
    font-size: 1.05rem; font-weight: 800;
    cursor: pointer;
  }
  .tile:active { transform: scale(0.98); }
  .green { border-color: var(--t-green); color: var(--t-green); }
  .blue { border-color: var(--t-blue); color: var(--t-blue); }
  .purple { border-color: var(--t-purple); color: var(--t-purple); }
  .amber { border-color: var(--t-amber); color: var(--t-amber); }
</style>
