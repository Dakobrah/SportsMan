<script lang="ts">
  import { getDb } from '../lib/db/context';
  import { listGames, type GameResult } from '../lib/db/repositories/games';
  import { listSeasons } from '../lib/db/repositories/seasons';
  import type { Location } from '../lib/db/repositories/types';
  import { href } from '../lib/router';
  import { resource } from '../lib/data.svelte';
  import Loader from '../lib/components/ui/Loader.svelte';

  let seasonId = $state<number | null>(null);
  let result = $state<GameResult | null>(null);
  let location = $state<Location | null>(null);

  const seasons = resource(() => listSeasons(getDb()));

  // Re-runs whenever a filter changes.
  const games = $derived.by(() => {
    const filter = {
      ...(seasonId !== null ? { seasonId } : {}),
      ...(result !== null ? { result } : {}),
      ...(location !== null ? { location } : {}),
    };
    return resource(() => listGames(getDb(), filter));
  });

  const outcome = (g: { teamScore: number; opponentScore: number }) =>
    g.teamScore > g.opponentScore ? 'W' : g.teamScore < g.opponentScore ? 'L' : 'T';
</script>

<div class="row-between">
  <h1>Games</h1>
  <a class="btn btn-primary" href={href('/games/new')}>Add game</a>
</div>

<div class="card row filters">
  <label class="field">
    <span>Season</span>
    <select bind:value={seasonId}>
      <option value={null}>All</option>
      {#each seasons.data ?? [] as season (season.id)}
        <option value={season.id}>{season.year}</option>
      {/each}
    </select>
  </label>
  <label class="field">
    <span>Result</span>
    <select bind:value={result}>
      <option value={null}>All</option>
      <option value="W">Wins</option>
      <option value="L">Losses</option>
      <option value="T">Ties</option>
    </select>
  </label>
  <label class="field">
    <span>Location</span>
    <select bind:value={location}>
      <option value={null}>All</option>
      <option value="home">Home</option>
      <option value="away">Away</option>
      <option value="neutral">Neutral</option>
    </select>
  </label>
</div>

<Loader loading={games.loading} error={games.error} empty={games.data?.length === 0}
        emptyText="No games match.">
  {#snippet emptyAction()}
    <a class="btn btn-primary" href={href('/games/new')}>Add a game</a>
  {/snippet}

  <div class="card scroll-x">
    <table class="data">
      <thead>
        <tr><th>Date</th><th>Opponent</th><th>Score</th><th></th><th>Plays</th><th></th></tr>
      </thead>
      <tbody>
        {#each games.data ?? [] as game (game.id)}
          <tr>
            <td class="tabular">{game.date}</td>
            <td>{game.location === 'away' ? '@ ' : ''}{game.opponent}</td>
            <td class="tabular">{game.teamScore}–{game.opponentScore}</td>
            <td>
              <span class="badge badge-{outcome(game).toLowerCase()}">{outcome(game)}</span>
            </td>
            <td class="tabular">{game.snapCount}</td>
            <td class="actions">
              <a class="btn small" href={href(`/games/${game.id}`)}>View</a>
              <a class="btn small btn-primary" href={href(`/games/${game.id}/tracker`)}>Track</a>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</Loader>

<style>
  .filters { align-items: end; margin-bottom: var(--gap); }
  .actions { display: flex; gap: 0.4rem; justify-content: flex-end; }
</style>
