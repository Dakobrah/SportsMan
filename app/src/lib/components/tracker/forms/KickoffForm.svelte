<script lang="ts">
  import type { Player, Possession } from '../../../db/repositories/types';
  import { SELECT_POSITIONS, type KickoffForm , type PlayDefaults } from '../../../game/playForm';
  import FormShell from '../FormShell.svelte';
  import JerseyInput from '../JerseyInput.svelte';
  import ToggleButton from '../ToggleButton.svelte';
  import NotesField from '../NotesField.svelte';

  interface Props {
    form: KickoffForm;
    roster: Player[];
    possession: Possession;
    defaults: PlayDefaults;
    busy: boolean;
    onsave: () => void;
    oncancel: () => void;
  }
  let { form = $bindable(), roster, possession, defaults, busy, onsave, oncancel }: Props = $props();

  // The returner is on the receiving team, which is whoever is NOT kicking.
  const otherSide = $derived(possession === 'us' ? 'them' : 'us');
</script>

<FormShell type="kickoff" {busy} {onsave} {oncancel}>
  <JerseyInput label="Kicker" {roster} {possession} positions={SELECT_POSITIONS.kicker}
               carried={form.kickerNumber !== null && form.kickerNumber === defaults.kickerNumber}
    value={form.kickerNumber} onchange={(v) => (form.kickerNumber = v)} />
  <label class="field">
    <span>Kick distance</span>
    <input type="number" inputmode="numeric" value={form.kickYards}
           oninput={(e) => (form.kickYards = Number((e.currentTarget as HTMLInputElement).value) || 0)} />
  </label>
  {#if !form.isTouchback}
    <JerseyInput label="Returner" {roster} possession={otherSide} value={form.returnerNumber}
                 onchange={(v) => (form.returnerNumber = v)} />
    <label class="field">
      <span>Return yards</span>
      <input type="number" inputmode="numeric" value={form.returnYards}
             oninput={(e) => (form.returnYards = Number((e.currentTarget as HTMLInputElement).value) || 0)} />
    </label>
  {/if}

  <div class="toggles">
    <ToggleButton label="Touchback" variant="blue" pressed={form.isTouchback}
                  onpress={() => (form.isTouchback = !form.isTouchback)} />
    <ToggleButton label="Muffed" variant="red" pressed={form.fumbleLost}
                  onpress={() => { form.fumbleLost = !form.fumbleLost; form.fumbled = form.fumbleLost; }} />
    <ToggleButton label="Onside" variant="amber" pressed={form.isOnsideKick}
                  onpress={() => (form.isOnsideKick = !form.isOnsideKick)} />
    <ToggleButton label="Out of bounds" variant="red" pressed={form.outOfBounds}
                  onpress={() => (form.outOfBounds = !form.outOfBounds)} />
  </div>
  <NotesField value={form.notes} onchange={(v) => (form.notes = v)} />
</FormShell>

<style>
  .toggles { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; }
  input { min-height: 52px; }
</style>
