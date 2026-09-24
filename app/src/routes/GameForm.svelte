<script lang="ts">
  import { onMount } from 'svelte';
  import { getDb } from '../lib/db/context';
  import { createGame, getGame, updateGame } from '../lib/db/repositories/games';
  import { listSeasons } from '../lib/db/repositories/seasons';
  import type { FieldCondition, Location, Weather } from '../lib/db/repositories/types';
  import { numericParam } from '../lib/router';
  import { navigate, router } from '../lib/router.svelte';
  import { describeError } from '../lib/data.svelte';

  const id = $derived(numericParam(router.params, 'id'));

  const LOCATIONS: Location[] = ['home', 'away', 'neutral'];
  const WEATHER: Weather[] = ['clear', 'rainy', 'snowy', 'windy', 'hot', 'cold'];
  // Django's form omitted this control even though the view read it.
  const CONDITIONS: FieldCondition[] = ['turf', 'grass', 'wet'];

  let seasons = $state<{ id: number; year: number }[]>([]);
  let seasonId = $state<number | null>(null);
  let date = $state(new Date().toISOString().slice(0, 10));
  let opponent = $state('');
  let location = $state<Location>('home');
  let weather = $state<Weather>('clear');
  let fieldCondition = $state<FieldCondition>('turf');
  let teamScore = $state(0);
  let opponentScore = $state(0);
  let notes = $state('');
  let saving = $state(false);
  let error = $state('');
  let ready = $state(false);

  onMount(async () => {
    const db = getDb();
    seasons = await listSeasons(db);
    if (id !== null) {
      const game = await getGame(db, id);
      if (game) {
        seasonId = game.seasonId; date = game.date; opponent = game.opponent;
        location = game.location; weather = game.weather;
        fieldCondition = game.fieldCondition;
        teamScore = game.teamScore; opponentScore = game.opponentScore;
        notes = game.notes;
      }
    } else {
      seasonId = seasons[0]?.id ?? null;
    }
    ready = true;
  });

  const valid = $derived(seasonId !== null && opponent.trim() !== '' && date !== '');

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!valid || seasonId === null) return;
    saving = true;
    error = '';
    try {
      const input = {
        seasonId, date, opponent: opponent.trim(), location, weather,
        fieldCondition, teamScore, opponentScore, notes,
      };
      if (id !== null) {
        await updateGame(getDb(), id, input);
        navigate(`/games/${id}`);
      } else {
        navigate(`/games/${await createGame(getDb(), input)}`);
      }
    } catch (e) {
      error = describeError(e);
    } finally {
      saving = false;
    }
  }
</script>

<h1>{id === null ? 'Add game' : 'Edit game'}</h1>

{#if ready}
  {#if seasons.length === 0}
    <p class="muted">Add a season first — every game belongs to one.</p>
    <p><a class="btn btn-primary" href="#/seasons">Go to seasons</a></p>
  {:else}
    <form class="stack card" onsubmit={save}>
      <div class="grid-2">
        <label class="field">
          <span>Season</span>
          <select bind:value={seasonId}>
            {#each seasons as season (season.id)}<option value={season.id}>{season.year}</option>{/each}
          </select>
        </label>
        <label class="field"><span>Date</span><input type="date" bind:value={date} required /></label>
        <label class="field">
          <span>Opponent</span>
          <input bind:value={opponent} required maxlength="80" placeholder="Westfield" />
        </label>
        <label class="field">
          <span>Location</span>
          <select bind:value={location}>
            {#each LOCATIONS as option (option)}<option value={option}>{option}</option>{/each}
          </select>
        </label>
        <label class="field">
          <span>Weather</span>
          <select bind:value={weather}>
            {#each WEATHER as option (option)}<option value={option}>{option}</option>{/each}
          </select>
        </label>
        <label class="field">
          <span>Field</span>
          <select bind:value={fieldCondition}>
            {#each CONDITIONS as option (option)}<option value={option}>{option}</option>{/each}
          </select>
        </label>
      </div>

      {#if id !== null}
        <div class="grid-2">
          <label class="field">
            <span>Our score</span>
            <input type="number" bind:value={teamScore} min="0" max="199" inputmode="numeric" />
          </label>
          <label class="field">
            <span>Their score</span>
            <input type="number" bind:value={opponentScore} min="0" max="199" inputmode="numeric" />
          </label>
        </div>
      {/if}

      <label class="field"><span>Notes</span><textarea bind:value={notes}></textarea></label>

      {#if error}<p class="err" role="alert">{error}</p>{/if}

      <div class="row">
        <button class="btn btn-primary" type="submit" disabled={saving || !valid}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button class="btn" type="button" onclick={() => history.back()}>Cancel</button>
      </div>
    </form>
  {/if}
{/if}

<style>
  form { max-width: 40rem; }
</style>
