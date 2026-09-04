<script lang="ts">
  import { getDb } from '../lib/db/context';
  import { getTeam } from '../lib/db/repositories/teams';
  import { listPlayers, playerSnapCount, setPlayerActive, deletePlayer } from '../lib/db/repositories/players';
  import { href, numericParam } from '../lib/router';
  import { router } from '../lib/router.svelte';
  import { resource } from '../lib/data.svelte';
  import Loader from '../lib/components/ui/Loader.svelte';
  import ConfirmDialog from '../lib/components/ui/ConfirmDialog.svelte';

  const id = $derived(numericParam(router.params, 'id'));

  const view = resource(async () => {
    if (id === null) return null;
    const db = getDb();
    const [team, players] = await Promise.all([getTeam(db, id), listPlayers(db, { teamId: id })]);
    return team ? { team, players } : null;
  });

  let confirming = $state<{ id: number; name: string; snaps: number } | null>(null);

  async function askRemove(playerId: number, name: string) {
    confirming = { id: playerId, name, snaps: await playerSnapCount(getDb(), playerId) };
  }

  async function remove() {
    if (!confirming) return;
    // A player who appears on a play is retired, never deleted: every player
    // FK on snaps is ON DELETE SET NULL, so deleting would strip the ball
    // carrier off games already recorded.
    if (confirming.snaps > 0) await setPlayerActive(getDb(), confirming.id, false);
    else await deletePlayer(getDb(), confirming.id);
    confirming = null;
    await view.reload();
  }
</script>

<Loader loading={view.loading} error={view.error} empty={view.data === null}
        emptyText="That team does not exist.">
  {#if view.data}
    <div class="row-between">
      <h1>{view.data.team.name} <span class="muted">{view.data.team.abbreviation}</span></h1>
      <div class="row">
        <a class="btn" href={href(`/teams/${view.data.team.id}/edit`)}>Edit</a>
        <a class="btn btn-primary" href={href(`/teams/${view.data.team.id}/players/new`)}>Add player</a>
      </div>
    </div>

    {#if view.data.players.length === 0}
      <p class="muted">No players yet. The tracker needs a roster before you can record a play.</p>
    {:else}
      <div class="card scroll-x">
        <table class="data">
          <thead>
            <tr><th>#</th><th>Name</th><th>Pos</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {#each view.data.players as player (player.id)}
              <tr class:retired={!player.isActive}>
                <td class="tabular">{player.number}</td>
                <td>{player.firstName} {player.lastName}</td>
                <td>{player.position}</td>
                <td>{player.isActive ? 'Active' : 'Retired'}</td>
                <td class="actions">
                  <a class="btn small" href={href(`/players/${player.id}/edit`)}>Edit</a>
                  {#if player.isActive}
                    <button class="btn small btn-danger"
                            onclick={() => askRemove(player.id, `${player.firstName} ${player.lastName}`)}>
                      Remove
                    </button>
                  {:else}
                    <button class="btn small" onclick={async () => { await setPlayerActive(getDb(), player.id, true); await view.reload(); }}>
                      Restore
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</Loader>

<ConfirmDialog
  open={confirming !== null}
  title={confirming && confirming.snaps > 0 ? 'Retire player' : 'Delete player'}
  confirmLabel={confirming && confirming.snaps > 0 ? 'Retire' : 'Delete'}
  onconfirm={remove}
  oncancel={() => (confirming = null)}
>
  {#if confirming}
    {#if confirming.snaps > 0}
      <p>{confirming.name} appears on {confirming.snaps} recorded {confirming.snaps === 1 ? 'play' : 'plays'}.</p>
      <p class="muted">They will be retired rather than deleted, so those plays keep their attribution. You can restore them later.</p>
    {:else}
      <p>{confirming.name} has no recorded plays and will be deleted permanently.</p>
    {/if}
  {/if}
</ConfirmDialog>

<style>
  .actions { display: flex; gap: 0.4rem; justify-content: flex-end; }
  .btn.small { min-height: 32px; padding: 0 0.6rem; font-size: 0.85rem; }
  tr.retired td { opacity: 0.55; }
</style>
