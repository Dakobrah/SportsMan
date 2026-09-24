<script lang="ts">
  import { onMount } from 'svelte';
  import { getDb } from '../lib/db/context';
  import { createPlayer, getPlayer, updatePlayer } from '../lib/db/repositories/players';
  import { POSITIONS, type Position } from '../lib/db/repositories/types';
  import { numericParam } from '../lib/router';
  import { navigate, router } from '../lib/router.svelte';
  import { describeError } from '../lib/data.svelte';

  const playerId = $derived(numericParam(router.params, 'id'));
  const routeTeamId = $derived(numericParam(router.params, 'teamId'));

  let teamId = $state<number | null>(null);
  let firstName = $state('');
  let lastName = $state('');
  let position = $state<Position>('RB');
  let numberText = $state('');
  let isActive = $state(true);
  let saving = $state(false);
  let error = $state('');
  let ready = $state(false);

  onMount(async () => {
    if (playerId !== null) {
      const player = await getPlayer(getDb(), playerId);
      if (player) {
        teamId = player.teamId;
        firstName = player.firstName;
        lastName = player.lastName;
        position = player.position;
        numberText = String(player.number);
        isActive = player.isActive;
      }
    } else {
      teamId = routeTeamId;
    }
    ready = true;
  });

  const jersey = $derived(Number(numberText));
  const valid = $derived(
    teamId !== null && firstName.trim() !== '' && lastName.trim() !== '' &&
    Number.isInteger(jersey) && jersey >= 0 && jersey <= 99,
  );

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!valid || teamId === null) return;
    saving = true;
    error = '';
    try {
      const input = {
        teamId, firstName: firstName.trim(), lastName: lastName.trim(),
        position, number: jersey, isActive,
      };
      if (playerId !== null) await updatePlayer(getDb(), playerId, input);
      else await createPlayer(getDb(), input);
      navigate(`/teams/${teamId}`);
    } catch (e) {
      error = describeError(e);
    } finally {
      saving = false;
    }
  }
</script>

<h1>{playerId === null ? 'Add player' : 'Edit player'}</h1>

{#if ready}
  <form class="stack card" onsubmit={save}>
    <div class="grid-2">
      <label class="field">
        <span>First name</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={firstName} required maxlength="40" autofocus />
      </label>
      <label class="field">
        <span>Last name</span>
        <input bind:value={lastName} required maxlength="40" />
      </label>
      <label class="field">
        <span>Jersey number</span>
        <input type="number" bind:value={numberText} min="0" max="99" inputmode="numeric" required />
      </label>
      <label class="field">
        <span>Position</span>
        <select bind:value={position}>
          {#each POSITIONS as option (option)}<option value={option}>{option}</option>{/each}
        </select>
      </label>
    </div>

    {#if playerId !== null}
      <label class="row"><input type="checkbox" bind:checked={isActive} /> Active on the roster</label>
    {/if}

    {#if error}<p class="err" role="alert">{error}</p>{/if}

    <div class="row">
      <button class="btn btn-primary" type="submit" disabled={saving || !valid}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button class="btn" type="button" onclick={() => history.back()}>Cancel</button>
    </div>
  </form>
{/if}

<style>
  form { max-width: 34rem; }
</style>
