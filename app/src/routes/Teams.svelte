<script lang="ts">
  import { getDb } from '../lib/db/context';
  import { listTeamsWithCounts } from '../lib/db/repositories/teams';
  import { href } from '../lib/router';
  import { resource } from '../lib/data.svelte';
  import Loader from '../lib/components/ui/Loader.svelte';

  const teams = resource(() => listTeamsWithCounts(getDb()));
</script>

<div class="row-between">
  <h1>Teams</h1>
  <a class="btn btn-primary" href={href('/teams/new')}>Add team</a>
</div>

<Loader loading={teams.loading} error={teams.error} empty={teams.data?.length === 0}
        emptyText="No teams yet. A team holds your roster and its seasons.">
  {#snippet emptyAction()}
    <a class="btn btn-primary" href={href('/teams/new')}>Add your first team</a>
  {/snippet}

  <div class="grid-2">
    {#each teams.data ?? [] as team (team.id)}
      <a class="card team" href={href(`/teams/${team.id}`)}>
        <span class="abbr">{team.abbreviation}</span>
        <span class="name">{team.name}</span>
        <span class="muted tabular">{team.playerCount} active {team.playerCount === 1 ? 'player' : 'players'}</span>
      </a>
    {/each}
  </div>
</Loader>

<style>
  .team { display: grid; gap: 0.2rem; color: inherit; }
  .team:hover { border-color: var(--c-selected); text-decoration: none; }
  .abbr { font-weight: 700; color: var(--c-link); letter-spacing: 0.06em; }
  .name { font-size: 1.05rem; }
</style>
