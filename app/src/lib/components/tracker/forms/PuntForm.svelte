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
  <div class="toggles">
    <ToggleButton label="Touchback" variant="blue" pressed={form.isTouchback}
                  onpress={() => (form.isTouchback = !form.isTouchback)} />
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
