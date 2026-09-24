<script lang="ts">
  import { getDb } from '../lib/db/context';
  import { getGameContext } from '../lib/db/repositories/games';
  import { listSnaps } from '../lib/db/repositories/snaps';
  import { rosterForGame } from '../lib/db/repositories/players';
  import { playerLookup, snapYardage, summarize } from '../lib/game/summary';
  import { toDisplay } from '../lib/game/field';
  import { href, numericParam } from '../lib/router';
  import { router } from '../lib/router.svelte';
  import { resource } from '../lib/data.svelte';
  import Loader from '../lib/components/ui/Loader.svelte';

  const id = $derived(numericParam(router.params, 'id'));
  let quarter = $state<number | null>(null);

  const view = resource(async () => {
    if (id === null) return null;
    const db = getDb();
    const context = await getGameContext(db, id);
    if (!context) return null;
    const [snaps, roster] = await Promise.all([listSnaps(db, id), rosterForGame(db, id)]);
    return { ...context, snaps, players: playerLookup(roster) };
  });

  const quarters = $derived([...new Set((view.data?.snaps ?? []).map((s) => s.quarter))].sort());
  const shown = $derived(
    (view.data?.snaps ?? []).filter((s) => quarter === null || s.quarter === quarter),
  );

  const downLabel = (down: number | null, distance: number | null) => {
    if (down === null) return '—';
    const ordinal = ['', '1st', '2nd', '3rd', '4th'][down] ?? String(down);
    return distance === null ? ordinal : `${ordinal} & ${distance}`;
  };
</script>

<Loader loading={view.loading} error={view.error} empty={view.data === null}
        emptyText="That game does not exist.">
  {#if view.data}
    <div class="row-between">
      <h1>Play-by-play</h1>
      <a class="btn" href={href(`/games/${view.data.game.id}`)}>Back to game</a>
    </div>

    {#if view.data.snaps.length === 0}
      <p class="muted">No plays recorded yet.</p>
      <p><a class="btn btn-primary" href={href(`/games/${view.data.game.id}/tracker`)}>Open the tracker</a></p>
    {:else}
      <div class="row pills">
        <button class="btn small" class:on={quarter === null} onclick={() => (quarter = null)}>All</button>
        {#each quarters as q (q)}
          <button class="btn small" class:on={quarter === q} onclick={() => (quarter = q)}>Q{q}</button>
        {/each}
      </div>

      <div class="card scroll-x">
        <table class="data">
          <thead>
            <tr><th>#</th><th>Q</th><th>Down</th><th>Ball</th><th>Play</th><th>Yds</th></tr>
          </thead>
          <tbody>
            {#each shown as snap (snap.id)}
              {@const yards = snapYardage(snap)}
              <tr>
                <td class="tabular">{snap.sequenceNumber}</td>
                <td class="tabular">{snap.quarter}</td>
                <td>{downLabel(snap.down, snap.distance)}</td>
                <td>{snap.ballPosition === null ? '—' : toDisplay(snap.ballPosition)}</td>
                <td class="what">{summarize(snap, view.data.players)}</td>
                <td class="tabular" class:gain={yards > 0} class:loss={yards < 0}>
                  {yards > 0 ? '+' : ''}{yards}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</Loader>

<style>
  .pills { margin-bottom: var(--gap); }
  .what { white-space: normal; min-width: 14rem; }
  .gain { color: var(--c-positive); }
  .loss { color: var(--c-negative); }
</style>
