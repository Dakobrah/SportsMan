<script lang="ts">
  import { getDb } from '../lib/db/context';
  import { getGameContext } from '../lib/db/repositories/games';
  import { rosterForGame } from '../lib/db/repositories/players';
  import { teamTotals } from '../lib/db/reports/team';
  import { reportSnaps } from '../lib/db/reports/snaps';
  import { deriveOffense, turnoverMargin } from '../lib/reports/metrics';
  import { pointsByQuarter } from '../lib/reports/scoring';
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
    // Both sides, because either can score and only one of them is our
    // offense. This screen used to aggregate the snaps inline without
    // filtering by possession, so "Offense" was really both teams added
    // together.
    const [us, them, snaps, roster] = await Promise.all([
      teamTotals(db, { gameIds: [id], possession: 'us' }),
      teamTotals(db, { gameIds: [id], possession: 'them' }),
      reportSnaps(db, { gameIds: [id] }),
      rosterForGame(db, id),
    ]);
    return { ...context, us, them, snaps, players: playerLookup(roster) };
  });

  const offense = $derived(view.data ? deriveOffense(view.data.us) : null);
  const margin = $derived(view.data ? turnoverMargin(view.data.us, view.data.them) : null);
  // Derived from the plays: quarter_scores is never written, so reading it
  // showed "No quarter scores recorded" on every game ever played.
  const quarters = $derived(view.data ? pointsByQuarter(view.data.snaps) : []);
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
        <a class="btn" href={href(`/reports/post-game?game=${game.id}`)}>Full report</a>
        <a class="btn btn-primary" href={href(`/games/${game.id}/tracker`)}>Open tracker</a>
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
        {#if view.data.snaps.length > 0}
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
        {#if quarters.length === 0}
          <p class="muted">No plays recorded yet.</p>
        {:else}
          <div class="scroll-x">
            <table class="data">
              <thead>
                <tr><th></th>{#each quarters as q (q.quarter)}<th>Q{q.quarter}</th>{/each}<th>T</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>{view.data.team.abbreviation}</td>
                  {#each quarters as q (q.quarter)}<td class="tabular">{q.us}</td>{/each}
                  <td class="tabular">{game.teamScore}</td>
                </tr>
                <tr>
                  <td>{game.opponent}</td>
                  {#each quarters as q (q.quarter)}<td class="tabular">{q.them}</td>{/each}
                  <td class="tabular">{game.opponentScore}</td>
                </tr>
              </tbody>
            </table>
          </div>
        {/if}
      </div>

      <div class="card">
        <h2>Our offense</h2>
        <dl>
          <div><dt>Offensive plays</dt><dd class="tabular">{view.data.us.scrimmagePlays}</dd></div>
          <div><dt>Rushing</dt><dd class="tabular">{view.data.us.rushYards} yds on {view.data.us.rushAttempts}</dd></div>
          <div><dt>Passing</dt><dd class="tabular">{view.data.us.passYards} yds, {view.data.us.completions}/{view.data.us.passAttempts}</dd></div>
          <div><dt>Total yards</dt><dd class="tabular">{offense?.totalYards ?? 0}</dd></div>
          <div><dt>Yards per play</dt><dd class="tabular">{(offense?.yardsPerPlay ?? 0).toFixed(1)}</dd></div>
          <div><dt>Turnovers</dt><dd class="tabular">{offense?.turnovers ?? 0}</dd></div>
        </dl>
      </div>

      <div class="card">
        <h2>Their offense</h2>
        <p class="muted note">
          No defensive play form exists, so this is what they did against us —
          their yards are yards allowed, their turnovers are our takeaways.
        </p>
        <dl>
          <div><dt>Offensive plays</dt><dd class="tabular">{view.data.them.scrimmagePlays}</dd></div>
          <div><dt>Rushing allowed</dt><dd class="tabular">{view.data.them.rushYards} yds on {view.data.them.rushAttempts}</dd></div>
          <div><dt>Passing allowed</dt><dd class="tabular">{view.data.them.passYards} yds, {view.data.them.completions}/{view.data.them.passAttempts}</dd></div>
          <div><dt>Sacks by us</dt><dd class="tabular">{view.data.them.sacks}</dd></div>
          <div><dt>Takeaways</dt><dd class="tabular">{margin?.takeaways ?? 0}</dd></div>
          <div><dt>Turnover margin</dt><dd class="tabular">{(margin?.margin ?? 0) > 0 ? '+' : ''}{margin?.margin ?? 0}</dd></div>
        </dl>
      </div>
    </div>

    {#if game.notes}
      <div class="card"><h2>Notes</h2><p>{game.notes}</p></div>
    {/if}

    <div class="card">
      <div class="row-between">
        <h2>Last plays</h2>
        <a href={href(`/games/${game.id}/plays`)}>All {view.data.snaps.length}</a>
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
  .note { font-size: 0.8rem; margin: 0 0 0.5rem; }
  dd { margin: 0; }
  .feed { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.3rem; }
  .feed li { display: flex; gap: 0.6rem; align-items: baseline; border-bottom: 1px solid var(--t-border); padding-bottom: 0.3rem; }
  .seq { color: var(--t-text-muted); min-width: 2.5rem; }
  .q { color: var(--t-text-muted); font-size: 0.8rem; }
</style>
