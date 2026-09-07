<script lang="ts">
  import { getDb } from '../lib/db/context';
  import { listGames } from '../lib/db/repositories/games';
  import { listSeasons } from '../lib/db/repositories/seasons';
  import { teamTotals } from '../lib/db/reports/team';
  import { turnoverMargin } from '../lib/reports/metrics';
  import { TEMPLATES } from '../lib/reports/templates';
  import { pathForScope } from '../lib/reports/scope';
  import { resource } from '../lib/data.svelte';
  import { href } from '../lib/router';
  import Loader from '../lib/components/ui/Loader.svelte';
  import StatTile from '../lib/components/charts/StatTile.svelte';

  let seasonId = $state<number | null>(null);

  const seasons = resource(() => listSeasons(getDb()));

  const view = $derived.by(() => {
    const filters = seasonId === null ? {} : { seasonId };
    return resource(async () => {
      const db = getDb();
      const [games, ours, theirs] = await Promise.all([
        listGames(db, seasonId === null ? {} : { seasonId }),
        teamTotals(db, { ...filters, possession: 'us' }),
        teamTotals(db, { ...filters, possession: 'them' }),
      ]);
      const played = games.filter((g) => g.snapCount > 0 || g.teamScore + g.opponentScore > 0);
      return {
        games,
        record: {
          wins: played.filter((g) => g.teamScore > g.opponentScore).length,
          losses: played.filter((g) => g.teamScore < g.opponentScore).length,
          ties: played.filter((g) => g.teamScore === g.opponentScore).length,
          pointsFor: played.reduce((s, g) => s + g.teamScore, 0),
          pointsAgainst: played.reduce((s, g) => s + g.opponentScore, 0),
          plays: games.reduce((s, g) => s + g.snapCount, 0),
        },
        margin: turnoverMargin(ours, theirs),
      };
    });
  });

  const gamesFor = $derived(view.data?.games ?? []);
</script>

<h1>Reports</h1>

<div class="card row filters">
  <label class="field">
    <span>Season</span>
    <select bind:value={seasonId}>
      <option value={null}>All seasons</option>
      {#each seasons.data ?? [] as season (season.id)}
        <option value={season.id}>{season.year}</option>
      {/each}
    </select>
  </label>
</div>

<Loader loading={view.loading} error={view.error}>
  {#if view.data}
    {@const r = view.data.record}
    <div class="tiles">
      <StatTile label="Record" value={`${r.wins}–${r.losses}${r.ties ? `–${r.ties}` : ''}`} />
      <StatTile label="Points for" value={r.pointsFor} />
      <StatTile label="Points against" value={r.pointsAgainst} />
      <StatTile
        label="Turnover margin"
        value={view.data.margin.margin > 0 ? `+${view.data.margin.margin}` : view.data.margin.margin}
        tone={view.data.margin.margin > 0 ? 'good' : view.data.margin.margin < 0 ? 'bad' : 'neutral'}
      />
      <StatTile label="Plays recorded" value={r.plays} />
    </div>

    <div class="stack">
      {#each TEMPLATES as template (template.id)}
        <div class="card">
          <h2>{template.name}</h2>
          <p class="muted">{template.description}</p>

          {#if template.scopeKind === 'game'}
            {#if gamesFor.length === 0}
              <p class="muted">No games to report on yet.</p>
            {:else}
              <ul class="games">
                {#each gamesFor as game (game.id)}
                  <li>
                    <a class="btn small" href={href(pathForScope(template.id, { kind: 'game', gameId: game.id }))}>
                      {game.date} · {game.location === 'away' ? '@ ' : ''}{game.opponent}
                      <span class="tabular">{game.teamScore}–{game.opponentScore}</span>
                    </a>
                  </li>
                {/each}
              </ul>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</Loader>

<style>
  .filters { align-items: end; margin-bottom: var(--gap); }
  .tiles {
    display: grid; gap: var(--gap); margin-bottom: var(--gap);
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  }
  h2 { margin-top: 0; }
  .games { list-style: none; margin: 0.5rem 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
  .games .btn { gap: 0.5rem; }
</style>
