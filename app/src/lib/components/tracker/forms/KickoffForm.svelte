<script lang="ts">
  import type { Player, Possession } from '../../../db/repositories/types';
  import { SELECT_POSITIONS, type KickoffForm , type PlayDefaults, type PlayFormProps } from '../../../game/playForm';
  import FormShell from '../FormShell.svelte';
  import NumberField from '../NumberField.svelte';
  import JerseyInput from '../JerseyInput.svelte';
  import ToggleButton from '../ToggleButton.svelte';
  import NotesField from '../NotesField.svelte';

  type Props = PlayFormProps<KickoffForm>;
  let { form = $bindable(), roster, possession, playbook, defaults, busy, onsave, oncancel }: Props = $props();

  // The returner is on the receiving team, which is whoever is NOT kicking.
  const otherSide = $derived(possession === 'us' ? 'them' : 'us');

  /** Whoever is kicking, in the coach's words. */
  const kickers = $derived(possession === 'us' ? 'We' : 'They');

  /**
   * An onside kick has to travel ten yards and rarely goes much further, so
   * pressing it swaps the deep-kick defaults for a short one with no return.
   */
  function toggleOnside() {
    form.isOnsideKick = !form.isOnsideKick;
    if (form.isOnsideKick) {
      form.kickYards = 11;
      form.returnYards = 0;
      form.isTouchback = false;
    } else {
      form.onsideRecovered = false;
    }
  }

  /** Recovered by the kicking team: nobody returned it. */
  const returned = $derived(!form.isTouchback && !(form.isOnsideKick && form.onsideRecovered));
</script>

<FormShell type="kickoff" {busy} {onsave} {oncancel}>
  <JerseyInput label="Kicker" {roster} {possession} positions={SELECT_POSITIONS.kicker}
               carried={form.kickerNumber !== null && form.kickerNumber === defaults.kickerNumber}
    value={form.kickerNumber} onchange={(v) => (form.kickerNumber = v)} />
  <NumberField label="Kick distance" value={form.kickYards}
               onchange={(v) => (form.kickYards = v)} />
  {#if returned}
    <JerseyInput label="Returner" {roster} possession={otherSide} value={form.returnerNumber}
                 onchange={(v) => (form.returnerNumber = v)} />
    <NumberField label="Return yards" value={form.returnYards}
               onchange={(v) => (form.returnYards = v)} />
  {/if}

  <div class="toggles">
    <ToggleButton label="Touchback" variant="info" pressed={form.isTouchback}
                  onpress={() => (form.isTouchback = !form.isTouchback)} />
    <ToggleButton label="Muffed" variant="negative" pressed={form.fumbleLost}
                  onpress={() => { form.fumbleLost = !form.fumbleLost; form.fumbled = form.fumbleLost; }} />
    <ToggleButton label="Onside" variant="caution" pressed={form.isOnsideKick}
                  onpress={toggleOnside} />
    {#if form.isOnsideKick}
      <ToggleButton label="{kickers} recovered" variant="positive" pressed={form.onsideRecovered}
                    onpress={() => (form.onsideRecovered = !form.onsideRecovered)} />
    {/if}
    <ToggleButton label="Out of bounds" variant="caution" pressed={form.outOfBounds}
                  onpress={() => (form.outOfBounds = !form.outOfBounds)} />
  </div>
  <NotesField value={form.notes} onchange={(v) => (form.notes = v)} />
</FormShell>
