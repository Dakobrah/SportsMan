<script lang="ts">
  /**
   * What was called.
   *
   * Two steps rather than one long list: pick the formation, then the play
   * from it. A playbook of forty calls is unusable as a single dropdown on a
   * phone, and a coach thinks in that order anyway.
   *
   * The unit follows possession, so this records our offensive call when we
   * have the ball and our defensive call when they do.
   */
  import type { Play, UnitType } from '../../db/repositories/types';

  interface Props {
    playbook: Play[];
    unitType: UnitType;
    playId: number | null;
    formation: string;
    onchange: (playId: number | null, formation: string) => void;
  }
  let { playbook, unitType, playId, formation, onchange }: Props = $props();

  const forUnit = $derived(playbook.filter((p) => p.unitType === unitType));
  const formations = $derived([...new Set(forUnit.map((p) => p.formation))].sort());

  // Which formation's plays to show: the chosen one, else the one belonging
  // to the selected play, else nothing yet.
  let open = $state<string | null>(null);
  const shown = $derived(open ?? formation ?? null);
  const plays = $derived(forUnit.filter((p) => p.formation === shown));

  const label = $derived(
    playId !== null ? (forUnit.find((p) => p.id === playId)?.name ?? '') : '',
  );
</script>

{#if forUnit.length > 0}
  <div class="picker">
    <span class="heading">
      Play call
      {#if label}<em class="chosen">{formation} · {label}</em>
      {:else}<em class="none">none</em>{/if}
    </span>

    <div class="chips">
      {#each formations as name (name)}
        <button
          type="button" class="chip" class:on={shown === name}
          onclick={() => (open = open === name ? null : name)}
        >{name}</button>
      {/each}
      {#if playId !== null}
        <button type="button" class="chip clear" onclick={() => { onchange(null, ''); open = null; }}>
          Clear
        </button>
      {/if}
    </div>

    {#if shown}
      <div class="chips plays">
        {#each plays as play (play.id)}
          <button
            type="button" class="chip play" class:on={playId === play.id}
            onclick={() => onchange(play.id, play.formation)}
          >{play.name}</button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .picker { display: grid; gap: 0.5rem; }
  .heading { font-size: 0.85rem; color: var(--t-text-muted); }
  .chosen { font-style: normal; font-weight: 700; color: var(--t-blue); margin-left: 0.35rem; }
  .none { font-style: normal; margin-left: 0.35rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip {
    min-height: 44px; padding: 0 0.75rem;
    border-radius: 8px; border: 1.5px solid var(--t-border);
    background: var(--t-surface-2); color: var(--t-text);
    font-weight: 600; cursor: pointer;
  }
  .chip.on { background: var(--t-blue); border-color: var(--t-blue); color: #fff; }
  .chip.play.on { background: var(--t-green); border-color: var(--t-green); color: #06240f; }
  .chip.clear { border-color: var(--t-border); color: var(--t-text-muted); }
  .plays { padding-left: 0.5rem; border-left: 2px solid var(--t-border); }
</style>
