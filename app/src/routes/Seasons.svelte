<script lang="ts">
  import { getDb } from '../lib/db/context';
  import { createSeason, listSeasons } from '../lib/db/repositories/seasons';
  import { listTeams } from '../lib/db/repositories/teams';
  import { href } from '../lib/router';
  import { resource, describeError } from '../lib/data.svelte';
  import Loader from '../lib/components/ui/Loader.svelte';

  const view = resource(async () => {
    const db = getDb();
    const [seasons, teams] = await Promise.all([listSeasons(db), listTeams(db)]);
    return { seasons, teams };
  });

  let teamId = $state<number | null>(null);
  let year = $state(new Date().getFullYear());
  let error = $state('');

  async function add(event: SubmitEvent) {
    event.preventDefault();
    if (teamId === null) return;
    error = '';
    try {
      await createSeason(getDb(), { year, teamId });
      await view.reload();
    } catch (e) {
      error = /UNIQUE|constraint/i.test(describeError(e))
        ? 'That team already has a season for that year.'
        : describeError(e);
    }
  }

  const teamName = (id: number) =>
    view.data?.teams.find((t) => t.id === id)?.abbreviation ?? '—';
</script>

<h1>Seasons</h1>

<Loader loading={view.loading} error={view.error}>
  {#if view.data}
    {#if view.data.teams.length === 0}
      <p class="muted">Add a team first — a season belongs to one.</p>
      <p><a class="btn btn-primary" href={href('/teams/new')}>Add team</a></p>
    {:else}
      <form class="card row" onsubmit={add}>
        <label class="field">
          <span>Team</span>
          <select bind:value={teamId}>
            <option value={null} disabled>Choose…</option>
            {#each view.data.teams as team (team.id)}
              <option value={team.id}>{team.name}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span>Year</span>
          <input type="number" bind:value={year} min="1900" max="2200" inputmode="numeric" />
        </label>
        <button class="btn btn-primary" type="submit" disabled={teamId === null}>Add season</button>
      </form>
      {#if error}<p class="err" role="alert">{error}</p>{/if}

      {#if view.data.seasons.length === 0}
        <p class="muted">No seasons yet.</p>
      {:else}
        <div class="card scroll-x">
          <table class="data">
            <thead><tr><th>Season</th><th>Team</th><th>Games</th></tr></thead>
            <tbody>
              {#each view.data.seasons as season (season.id)}
                <tr>
                  <td class="tabular">{season.year}</td>
                  <td>{teamName(season.teamId)}</td>
                  <td class="tabular">{season.gameCount}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}
  {/if}
</Loader>

<style>
  form.row { align-items: end; margin-bottom: var(--gap); }
  .err { color: var(--t-red); }
</style>
