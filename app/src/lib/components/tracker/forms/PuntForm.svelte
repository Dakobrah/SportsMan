<script lang="ts">
  import type { Player, Possession } from '../../../db/repositories/types';
  import { SELECT_POSITIONS, type PuntForm , type PlayDefaults, type PlayFormProps } from '../../../game/playForm';
  import FormShell from '../FormShell.svelte';
  import KickChoice from '../KickChoice.svelte';
  import NumberField from '../NumberField.svelte';
  import JerseyInput from '../JerseyInput.svelte';
  import ToggleButton from '../ToggleButton.svelte';
  import NotesField from '../NotesField.svelte';

  type Props = PlayFormProps<PuntForm>;
  let { form = $bindable(), roster, possession, playbook, defaults, busy, onsave, oncancel, onswitch }: Props = $props();

  // The returner is on the receiving team, which is whoever is NOT punting.
  const otherSide = $derived(possession === 'us' ? 'them' : 'us');
</script>

<FormShell type="punt" {busy} {onsave} {oncancel}>
  {#if onswitch}<KickChoice value="punt" onchange={onswitch} />{/if}
  <JerseyInput label="Punter" {roster} {possession} positions={SELECT_POSITIONS.punter}
               carried={form.punterNumber !== null && form.punterNumber === defaults.punterNumber}
    value={form.punterNumber} onchange={(v) => (form.punterNumber = v)} />
  <NumberField label="Punt distance" value={form.puntYards}
               onchange={(v) => (form.puntYards = v)} />
  {#if !form.isTouchback && !form.isBlocked}
    <JerseyInput label="Returner" {roster} possession={otherSide} value={form.returnerNumber}
                 onchange={(v) => (form.returnerNumber = v)} />
    {#if !form.isFairCatch}
      <NumberField label="Return yards" value={form.returnYards}
               onchange={(v) => (form.returnYards = v)} />
    {/if}
  {/if}

  <div class="toggles">
    <ToggleButton label="Touchback" variant="info" pressed={form.isTouchback}
                  onpress={() => (form.isTouchback = !form.isTouchback)} />
    <ToggleButton label="Fair catch" variant="info" pressed={form.isFairCatch}
                  onpress={() => { form.isFairCatch = !form.isFairCatch; if (form.isFairCatch) form.returnYards = 0; }} />
    <ToggleButton label="Muffed" variant="negative" pressed={form.fumbleLost}
                  onpress={() => { form.fumbleLost = !form.fumbleLost; form.fumbled = form.fumbleLost; }} />
    <ToggleButton label="Blocked" variant="negative" pressed={form.isBlocked}
                  onpress={() => (form.isBlocked = !form.isBlocked)} />
    <ToggleButton label="Out of bounds" variant="caution" pressed={form.outOfBounds}
                  onpress={() => (form.outOfBounds = !form.outOfBounds)} />
  </div>
  <NotesField value={form.notes} onchange={(v) => (form.notes = v)} />
</FormShell>
