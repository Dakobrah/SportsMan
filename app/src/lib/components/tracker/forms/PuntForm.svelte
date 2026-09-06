<script lang="ts">
  import type { Player, Possession } from '../../../db/repositories/types';
  import { SELECT_POSITIONS, type PuntForm , type PlayDefaults } from '../../../game/playForm';
  import FormShell from '../FormShell.svelte';
  import JerseyInput from '../JerseyInput.svelte';
  import ToggleButton from '../ToggleButton.svelte';
  import NotesField from '../NotesField.svelte';

  interface Props {
    form: PuntForm;
    roster: Player[];
    possession: Possession;
    defaults: PlayDefaults;
    busy: boolean;
    onsave: () => void;
    oncancel: () => void;
  }
  let { form = $bindable(), roster, possession, defaults, busy, onsave, oncancel }: Props = $props();

  // The returner is on the receiving team, which is whoever is NOT punting.
  const otherSide = $derived(possession === 'us' ? 'them' : 'us');
</script>

<FormShell type="punt" {busy} {onsave} {oncancel}>
  <JerseyInput label="Punter" {roster} {possession} positions={SELECT_POSITIONS.punter}
               carried={form.punterNumber !== null && form.punterNumber === defaults.punterNumber}
    value={form.punterNumber} onchange={(v) => (form.punterNumber = v)} />
  <label class="field">
    <span>Punt distance</span>
    <input type="number" inputmode="numeric" value={form.puntYards}
           oninput={(e) => (form.puntYards = Number((e.currentTarget as HTMLInputElement).value) || 0)} />
  </label>
  {#if !form.isTouchback && !form.isBlocked}
    <JerseyInput label="Returner" {roster} possession={otherSide} value={form.returnerNumber}
                 onchange={(v) => (form.returnerNumber = v)} />
    {#if !form.isFairCatch}
      <label class="field">
        <span>Return yards</span>
        <input type="number" inputmode="numeric" value={form.returnYards}
               oninput={(e) => (form.returnYards = Number((e.currentTarget as HTMLInputElement).value) || 0)} />
      </label>
    {/if}
  {/if}

  <div class="toggles">
    <ToggleButton label="Touchback" variant="blue" pressed={form.isTouchback}
                  onpress={() => (form.isTouchback = !form.isTouchback)} />
    <ToggleButton label="Fair catch" variant="blue" pressed={form.isFairCatch}
                  onpress={() => { form.isFairCatch = !form.isFairCatch; if (form.isFairCatch) form.returnYards = 0; }} />
    <ToggleButton label="Muffed" variant="red" pressed={form.fumbleLost}
                  onpress={() => { form.fumbleLost = !form.fumbleLost; form.fumbled = form.fumbleLost; }} />
    <ToggleButton label="Blocked" variant="red" pressed={form.isBlocked}
                  onpress={() => (form.isBlocked = !form.isBlocked)} />
    <ToggleButton label="Out of bounds" variant="amber" pressed={form.outOfBounds}
                  onpress={() => (form.outOfBounds = !form.outOfBounds)} />
  </div>
  <NotesField value={form.notes} onchange={(v) => (form.notes = v)} />
</FormShell>

<style>
  .toggles { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; }
  input { min-height: 52px; }
</style>
