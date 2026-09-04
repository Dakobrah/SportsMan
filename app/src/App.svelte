<script lang="ts">
  import { onMount } from 'svelte';
  import { openDatabase } from './lib/db/tauri';

  let status = $state('opening database…');
  let counts = $state<{ teams: number; games: number; snaps: number } | null>(null);

  onMount(async () => {
    try {
      const db = await openDatabase();
      const row = await db.get<{ teams: number; games: number; snaps: number }>(`
        SELECT (SELECT COUNT(*) FROM teams) AS teams,
               (SELECT COUNT(*) FROM games) AS games,
               (SELECT COUNT(*) FROM snaps) AS snaps
      `);
      counts = row ?? null;
      status = 'ready';
    } catch (error) {
      status = `database unavailable: ${error instanceof Error ? error.message : error}`;
    }
  });
</script>

<main>
  <h1>Sportsman</h1>
  <p class="status">{status}</p>
  {#if counts}
    <dl>
      <div><dt>Teams</dt><dd>{counts.teams}</dd></div>
      <div><dt>Games</dt><dd>{counts.games}</dd></div>
      <div><dt>Snaps</dt><dd>{counts.snaps}</dd></div>
    </dl>
  {/if}
</main>

<style>
  main {
    padding: 2rem 1rem;
    max-width: 32rem;
    margin: 0 auto;
    font-family: system-ui, sans-serif;
  }
  h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
  .status { color: #888; margin: 0 0 1.5rem; }
  dl { display: grid; gap: 0.5rem; margin: 0; }
  dl div { display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 0.25rem; }
  dt { font-weight: 600; }
  dd { margin: 0; font-variant-numeric: tabular-nums; }
</style>
