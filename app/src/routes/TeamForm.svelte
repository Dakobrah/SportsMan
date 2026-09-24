<script lang="ts">
  import { getDb } from '../lib/db/context';
  import { createTeam, getTeam, updateTeam } from '../lib/db/repositories/teams';
  import { numericParam } from '../lib/router';
  import { navigate, router } from '../lib/router.svelte';
  import { describeError } from '../lib/data.svelte';
  import { onMount } from 'svelte';

  const id = $derived(numericParam(router.params, 'id'));

  let name = $state('');
  let abbreviation = $state('');
  let saving = $state(false);
  let error = $state('');
  let ready = $state(false);

  onMount(async () => {
    if (id !== null) {
      const team = await getTeam(getDb(), id);
      if (team) {
        name = team.name;
        abbreviation = team.abbreviation;
      }
    }
    ready = true;
  });

  async function save(event: SubmitEvent) {
    event.preventDefault();
    saving = true;
    error = '';
    try {
      const input = { name: name.trim(), abbreviation: abbreviation.trim().toUpperCase() };
      if (id !== null) {
        await updateTeam(getDb(), id, input);
        navigate(`/teams/${id}`);
      } else {
        const created = await createTeam(getDb(), input);
        navigate(`/teams/${created}`);
      }
    } catch (e) {
      // The likely failure is the UNIQUE on abbreviation.
      error = /UNIQUE|constraint/i.test(describeError(e))
        ? `Another team already uses the abbreviation ${abbreviation.toUpperCase()}.`
        : describeError(e);
    } finally {
      saving = false;
    }
  }
</script>

<h1>{id === null ? 'Add team' : 'Edit team'}</h1>

{#if ready}
  <form class="stack card" onsubmit={save}>
    <label class="field">
      <span>Name</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={name} required maxlength="80" autofocus placeholder="Northside" />
    </label>

    <label class="field">
      <span>Abbreviation</span>
      <input bind:value={abbreviation} required maxlength="10" placeholder="NSR" />
    </label>

    {#if error}<p class="err" role="alert">{error}</p>{/if}

    <div class="row">
      <button class="btn btn-primary" type="submit" disabled={saving || !name.trim() || !abbreviation.trim()}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button class="btn" type="button" onclick={() => history.back()}>Cancel</button>
    </div>
  </form>
{/if}

<style>
  form { max-width: 28rem; }
</style>
