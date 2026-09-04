<script lang="ts">
  import { getDb } from '../lib/db/context';
  import { getGameContext, listQuarterScores } from '../lib/db/repositories/games';
  import { listSnaps } from '../lib/db/repositories/snaps';
  import { rosterForGame } from '../lib/db/repositories/players';
  import { playerLookup, summarize } from '../lib/game/summary';
  import { toDisplay } from '../lib/game/field';
  import { href, numericParam } from '../lib/router';
  import { router } from '../lib/router.svelte';
  import { resource } from '../lib/data.svelte';
  import Loader from '../lib/components/ui/Loader.svelte';

  const id = $derived(numericParam(router.params, 'id'));

  const view = resource(async () => {
    if (id === null) return null;
    const db = getDb();
    const context = await getGameContext(db, id);
    if (!context) return null;
    const [quarters, snaps, roster] = await Promise.all([
      listQuarterScores(db, id),
      listSnaps(db, id),
      rosterForGame(db, id),
    ]);
    return { ...context, quarters, snaps, players: playerLookup(roster) };
  });

  const totals = $derived.by(() => {
    const snaps = view.data?.snaps ?? [];
    const runs = snaps.filter((s) => s.kind === 'RUN');
    const passes = snaps.filter((s) => s.kind === 'PASS');
    const completions = passes.filter((s) => s.isComplete);
    return {
      plays: snaps.length,
      rushYards: runs.reduce((sum, s) => sum + s.yardsGained, 0),
      rushAttempts: runs.length,
      passYards: completions.reduce((sum, s) => sum + s.yardsGained, 0),
      completions: completions.length,
      attempts: passes.filter((s) => !s.wasSacked).length,
      turnovers: snaps.filter((s) => s.isInterception || s.fumbleLost).length,
    };
  });
</script>

<Loader loading={view.loading} error={view.error} empty={view.data === null}
        emptyText="That game does not exist.">
  {#if view.data}
    {@const game = view.data.game}
    <div class="row-between">
      <h1>{view.data.team.abbreviation} vs {game.opponent}</h1>
      <div class="row">
        <a class="btn" href={href(`/games/${game.id}/edit`)}>Edit</a>
        <a class="btn" href={href(`/games/${game.id}/plays`)}>Play-by-play</a>
        <a class="btn btn-go" href={href(`/games/${game.id}/tracker`)}>Open tracker</a>
      </div>
    </div>

    <div class="scorebar card">
      <div class="side">
        <span class="abbr">{view.data.team.abbreviation}</span>
        <span class="score tabular">{game.teamScore}</span>
      </div>
      <div class="meta">
        <span class="muted">{game.date}</span>
        <span class="muted">{game.location} · {game.weather} · {game.fieldCondition}</span>
        {#if totals.plays > 0}
          <span class="muted">Q{game.currentQuarter} · ball at {toDisplay(game.currentBallPosition)}</span>
        {/if}
      </div>
      <div class="side">
        <span class="abbr">{game.opponent}</span>
        <span class="score tabular">{game.opponentScore}</span>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h2>Scoring by quarter</h2>
        {#if view.data.quarters.length === 0}
          <p class="muted">No quarter scores recorded.</p>
        {:else}
          <div class="scroll-x">
            <table class="data">
              <thead>
                <tr><th></th>{#each view.data.quarters as q (q.id)}<th>Q{q.quarter}</th>{/each}<th>T</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>{view.data.team.abbreviation}</td>
                  {#each view.data.quarters as q (q.id)}<td class="tabular">{q.teamScore}</td>{/each}
                  <td class="tabular">{game.teamScore}</td>
                </tr>
                <tr>
                  <td>{game.opponent}</td>
                  {#each view.data.quarters as q (q.id)}<td class="tabular">{q.opponentScore}</td>{/each}
                  <td class="tabular">{game.opponentScore}</td>
                </tr>
              </tbody>
            </table>
          </div>
        {/if}
      </div>

      <div class="card">
        <h2>Offense</h2>
        <dl>
          <div><dt>Total plays</dt><dd class="tabular">{totals.plays}</dd></div>
          <div><dt>Rushing</dt><dd class="tabular">{totals.rushYards} yds on {totals.rushAttempts}</dd></div>
          <div><dt>Passing</dt><dd class="tabular">{totals.passYards} yds, {totals.completions}/{totals.attempts}</dd></div>
          <div><dt>Total yards</dt><dd class="tabular">{totals.rushYards + totals.passYards}</dd></div>
          <div><dt>Turnovers</dt><dd class="tabular">{totals.turnovers}</dd></div>
        </dl>
      </div>
    </div>

    {#if game.notes}
      <div class="card"><h2>Notes</h2><p>{game.notes}</p></div>
    {/if}

    <div class="card">
      <div class="row-between">
        <h2>Last plays</h2>
        <a href={href(`/games/${game.id}/plays`)}>All {totals.plays}</a>
      </div>
      {#if view.data.snaps.length === 0}
        <p class="muted">No plays recorded yet.</p>
      {:else}
        <ol class="feed">
          {#each view.data.snaps.slice(-8).reverse() as snap (snap.id)}
            <li>
              <span class="seq tabular">#{snap.sequenceNumber}</span>
              <span class="q">Q{snap.quarter}</span>
              <span class="what">{summarize(snap, view.data.players)}</span>
            </li>
          {/each}
        </ol>
      {/if}
    </div>
  {/if}
</Loader>

<style>
  .scorebar { display: flex; align-items: center; justify-content: space-between; gap: var(--gap); margin-bottom: var(--gap); }
  .side { display: grid; justify-items: center; gap: 0.2rem; min-width: 5rem; }
  .abbr { font-weight: 700; color: var(--t-text-muted); }
  .score { font-size: 2rem; font-weight: 800; }
  .meta { display: grid; gap: 0.15rem; text-align: center; font-size: 0.85rem; }
  dl { display: grid; gap: 0.35rem; margin: 0; }
  dl div { display: flex; justify-content: space-between; border-bottom: 1px solid var(--t-border); padding-bottom: 0.25rem; }
  dt { color: var(--t-text-muted); }
  dd { margin: 0; }
  .feed { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.3rem; }
  .feed li { display: flex; gap: 0.6rem; align-items: baseline; border-bottom: 1px solid var(--t-border); padding-bottom: 0.3rem; }
  .seq { color: var(--t-text-muted); min-width: 2.5rem; }
  .q { color: var(--t-text-muted); font-size: 0.8rem; }
</style>
