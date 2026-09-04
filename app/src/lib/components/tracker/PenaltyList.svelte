<script lang="ts">
  import { PENALTIES, type Penalty } from '../../game/penalties';

  interface Props {
    selected: string;
    onpick: (penalty: Penalty) => void;
  }
  let { selected, onpick }: Props = $props();
</script>

<div class="list" role="listbox" aria-label="Penalty">
  {#each PENALTIES as penalty (penalty.name)}
    <button
      type="button" role="option" aria-selected={selected === penalty.name}
      class:on={selected === penalty.name}
      onclick={() => onpick(penalty)}
    >
      <span class="name">{penalty.name}</span>
      <span class="meta">
        {penalty.yards > 0 ? `${penalty.yards} yds` : 'spot'}
        · {penalty.onOffense ? 'OFF' : 'DEF'}
        {#if penalty.autoFirstDown}· auto 1st{/if}
      </span>
    </button>
  {/each}
</div>

<style>
  .list {
    display: grid; gap: 4px;
    max-height: 46vh; overflow-y: auto;
    border: 1px solid var(--t-border); border-radius: 8px; padding: 4px;
  }
  button {
    display: grid; gap: 2px; text-align: left;
    min-height: var(--tap); padding: 8px 10px;
    background: var(--t-surface-2); border: 1.5px solid transparent;
    border-radius: 6px; color: var(--t-text); cursor: pointer;
  }
  button.on { border-color: var(--t-amber); background: color-mix(in srgb, var(--t-amber) 16%, var(--t-surface-2)); }
  .name { font-weight: 600; }
  .meta { font-size: 0.75rem; color: var(--t-text-muted); }
</style>
