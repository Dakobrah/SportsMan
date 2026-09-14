<script lang="ts">
  import { getDb } from '../lib/db/context';
  import {
    clearPlays, createPlay, deletePlay, importPlays, listPlays,
  } from '../lib/db/repositories/plays';
  import type { UnitType } from '../lib/db/repositories/types';
  import { DEFAULT_PLAYBOOK } from '../lib/playbook/defaultPlaybook';
  import { describeError, resource } from '../lib/data.svelte';
  import { IS_DEMO } from '../lib/env';
  import { push } from '../lib/ui/toasts.svelte';
  import Loader from '../lib/components/ui/Loader.svelte';
  import ConfirmDialog from '../lib/components/ui/ConfirmDialog.svelte';

  const UNITS: { value: UnitType; label: string }[] = [
    { value: 'OFF', label: 'Offense' },
    { value: 'DEF', label: 'Defense' },
    { value: 'ST', label: 'Special teams' },
  ];

  const view = resource(() => listPlays(getDb()));

  let unitType = $state<UnitType>('OFF');
  let formation = $state('');
  let name = $state('');
  let busy = $state(false);
  let confirmClear = $state(false);

  const shown = $derived(view.data ?? []);
  const byUnit = $derived(
    UNITS.map((unit) => ({
      ...unit,
      plays: shown.filter((p) => p.unitType === unit.value),
    })).filter((group) => group.plays.length > 0),
  );

  async function run(work: () => Promise<string>) {
    busy = true;
    try {
      push(await work());
      await view.reload();
    } catch (error) {
      push(describeError(error), 'error');
    } finally {
      busy = false;
    }
  }

  const loadDefault = () =>
    run(async () => {
      const { added, skipped } = await importPlays(getDb(), [...DEFAULT_PLAYBOOK]);
      return skipped > 0
        ? `Added ${added}; ${skipped} already in the book.`
        : `Added ${added} plays.`;
    });

  const importFile = () =>
    run(async () => {
      const { openPlaybook } = await import('../lib/playbook/io');
      const doc = await openPlaybook();
      if (!doc) return 'Import cancelled.';
      const { added, skipped } = await importPlays(getDb(), doc.plays);
      return skipped > 0
        ? `Imported ${added} from “${doc.name}”; ${skipped} already in the book.`
        : `Imported ${added} plays from “${doc.name}”.`;
    });

  const exportFile = () =>
    run(async () => {
      const { savePlaybook } = await import('../lib/playbook/io');
      const { path } = await savePlaybook('Playbook', shown);
      return path ? `Saved to ${path}` : 'Export cancelled.';
    });

  const addPlay = (event: SubmitEvent) => {
    event.preventDefault();
    return run(async () => {
      await createPlay(getDb(), {
        unitType, formation: formation.trim(), name: name.trim(),
      });
      name = '';
      return 'Play added.';
    });
  };

  const remove = (id: number) => run(async () => {
    await deletePlay(getDb(), id);
    return 'Play removed.';
  });

  const clearAll = () => {
    confirmClear = false;
    return run(async () => {
      await clearPlays(getDb());
      return 'Playbook cleared.';
    });
  };
</script>

<div class="row-between">
  <h1>Playbook</h1>
  {#if !IS_DEMO}
    <div class="row">
      <button class="btn" onclick={importFile} disabled={busy}>Import…</button>
      <button class="btn" onclick={exportFile} disabled={busy || shown.length === 0}>Export…</button>
    </div>
  {/if}
</div>

<Loader loading={view.loading} error={view.error} empty={shown.length === 0}
        emptyText="No plays yet. Load the starter playbook, import your own, or add calls one at a time below.">
  {#snippet emptyAction()}
    <button class="btn btn-primary" onclick={loadDefault} disabled={busy}>
      Load starter playbook
    </button>
  {/snippet}

  {#each byUnit as group (group.value)}
    <div class="card">
      <h2>{group.label} <span class="muted tabular">{group.plays.length}</span></h2>
      <div class="scroll-x">
        <table class="data">
          <thead><tr><th>Formation</th><th>Play</th><th></th></tr></thead>
          <tbody>
            {#each group.plays as play (play.id)}
              <tr>
                <td>{play.formation || '—'}</td>
                <td>{play.name}</td>
                <td class="right">
                  <button class="btn small btn-danger" onclick={() => remove(play.id)} disabled={busy}>
                    Remove
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/each}
</Loader>

<form class="card row add" onsubmit={addPlay}>
  <label class="field">
    <span>Unit</span>
    <select bind:value={unitType}>
      {#each UNITS as unit (unit.value)}<option value={unit.value}>{unit.label}</option>{/each}
    </select>
  </label>
  <label class="field">
    <span>Formation</span>
    <input bind:value={formation} maxlength="40" placeholder="Shotgun" />
  </label>
  <label class="field">
    <span>Play</span>
    <input bind:value={name} maxlength="40" placeholder="Zone Read" required />
  </label>
  <button class="btn btn-primary" type="submit" disabled={busy || !name.trim()}>Add</button>
</form>

{#if shown.length > 0}
  <p class="row">
    <button class="btn btn-danger" onclick={() => (confirmClear = true)} disabled={busy}>
      Clear playbook
    </button>
    <button class="btn" onclick={loadDefault} disabled={busy}>Add starter plays</button>
  </p>
{/if}

<ConfirmDialog
  open={confirmClear}
  title="Clear the playbook"
  confirmLabel="Clear"
  onconfirm={clearAll}
  oncancel={() => (confirmClear = false)}
>
  <p>Remove all {shown.length} plays?</p>
  <p class="muted">
    Games already recorded keep the formation and play name they were entered
    with, so your history is not affected.
  </p>
</ConfirmDialog>

<style>
  h2 { display: flex; align-items: baseline; gap: 0.5rem; }
  .right { text-align: right; }
  form.add { align-items: end; margin-top: var(--gap); }
</style>
