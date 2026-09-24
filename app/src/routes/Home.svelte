<script lang="ts">
  import { getDb } from '../lib/db/context';
  import { listTeams } from '../lib/db/repositories/teams';
  import { currentSeason } from '../lib/db/repositories/seasons';
  import { listGames } from '../lib/db/repositories/games';
  import { href } from '../lib/router';
  import { resource } from '../lib/data.svelte';
  import Loader from '../lib/components/ui/Loader.svelte';

  const view = resource(async () => {
    const db = getDb();
    const teams = await listTeams(db);
    if (teams.length === 0) return { teams, season: null, games: [] };

    const season = await currentSeason(db, teams[0].id);
    const games = season ? await listGames(db, { seasonId: season.id }) : [];
    return { teams, season, games };
  });

  const record = $derived.by(() => {
    const games = view.data?.games ?? [];
    const played = games.filter((g) => g.snapCount > 0 || g.teamScore + g.opponentScore > 0);
    return {
      wins: played.filter((g) => g.teamScore > g.opponentScore).length,
      losses: played.filter((g) => g.teamScore < g.opponentScore).length,
      ties: played.filter((g) => g.teamScore === g.opponentScore).length,
      pointsFor: played.reduce((sum, g) => sum + g.teamScore, 0),
      pointsAgainst: played.reduce((sum, g) => sum + g.opponentScore, 0),
      plays: games.reduce((sum, g) => sum + g.snapCount, 0),
    };
  });

  /** A game with plays whose cursor has moved off the opening state. */
  const inProgress = $derived(
    (view.data?.games ?? []).find((g) => g.snapCount > 0),
  );
</script>

<Loader loading={view.loading} error={view.error}>
  {#if view.data}
    {#if view.data.teams.length === 0}
      <div class="card welcome">
        <h1>Welcome to Sportsman</h1>
        <p class="muted">
          Everything stays on this device: no account, no network, nothing collected.
        </p>
        <p class="muted">Start by adding your team, then a season, then a game.</p>
        <a class="btn btn-primary" href={href('/teams/new')}>Add your team</a>
      </div>
    {:else}
      <div class="row-between">
        <h1>{view.data.teams[0].name}{view.data.season ? ` · ${view.data.season.year}` : ''}</h1>
        <a class="btn btn-primary" href={href('/games/new')}>Add game</a>
      </div>

      {#if inProgress}
        <a class="card resume" href={href(`/games/${inProgress.id}/tracker`)}>
          <span class="muted">Game in progress</span>
          <strong>{inProgress.location === 'away' ? '@ ' : 'vs '}{inProgress.opponent}</strong>
          <span class="tabular">{inProgress.teamScore}–{inProgress.opponentScore} · Q{inProgress.currentQuarter} · {inProgress.snapCount} plays</span>
          <span class="go">Resume tracking →</span>
        </a>
      {/if}

      <div class="grid-2 stats">
        <div class="card stat"><span class="muted">Record</span><strong class="tabular">{record.wins}–{record.losses}{record.ties ? `–${record.ties}` : ''}</strong></div>
        <div class="card stat"><span class="muted">Points for</span><strong class="tabular">{record.pointsFor}</strong></div>
        <div class="card stat"><span class="muted">Points against</span><strong class="tabular">{record.pointsAgainst}</strong></div>
        <div class="card stat"><span class="muted">Plays recorded</span><strong class="tabular">{record.plays}</strong></div>
      </div>

      <div class="card">
        <div class="row-between"><h2>Recent games</h2><a href={href('/games')}>All games</a></div>
        {#if view.data.games.length === 0}
          <p class="muted">No games this season yet.</p>
        {:else}
          <ul class="games">
            {#each view.data.games.slice(0, 5) as game (game.id)}
              <li>
                <a href={href(`/games/${game.id}`)}>
                  <span class="tabular date">{game.date}</span>
                  <span class="opp">{game.location === 'away' ? '@ ' : ''}{game.opponent}</span>
                  <span class="tabular">{game.teamScore}–{game.opponentScore}</span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  {/if}
</Loader>

<style>
  .welcome { display: grid; gap: 0.6rem; justify-items: start; max-width: 34rem; }
  .stats { margin-bottom: var(--gap); }
  .stat { display: grid; gap: 0.2rem; }
  .stat strong { font-size: 1.6rem; }
  .resume {
    display: grid; gap: 0.2rem; color: inherit; margin-bottom: var(--gap);
    border-color: var(--c-action);
    background: color-mix(in srgb, var(--c-action) 8%, var(--t-surface));
  }
  .resume:hover { text-decoration: none; background: color-mix(in srgb, var(--c-action) 14%, var(--t-surface)); }
  .resume .go { color: var(--c-action); font-weight: 700; }
  .games { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.2rem; }
  .games a {
    display: flex; gap: var(--gap); align-items: baseline; color: inherit;
    padding: 0.45rem 0; border-bottom: 1px solid var(--t-border);
  }
  .games a:hover { text-decoration: none; color: var(--c-link); }
  .date { color: var(--t-text-muted); }
  .opp { flex: 1; }
</style>
