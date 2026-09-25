<script lang="ts">
  import type { Player, Possession } from '../../../db/repositories/types';
  import { SELECT_POSITIONS, type FieldGoalForm , type PlayDefaults, type PlayFormProps } from '../../../game/playForm';
  import FormShell from '../FormShell.svelte';
  import KickChoice from '../KickChoice.svelte';
  import NumberField from '../NumberField.svelte';
  import JerseyInput from '../JerseyInput.svelte';
  import ToggleButton from '../ToggleButton.svelte';
  import NotesField from '../NotesField.svelte';

  type Props = PlayFormProps<FieldGoalForm>;
  let { form = $bindable(), roster, possession, playbook, defaults, busy, onsave, oncancel, onswitch }: Props = $props();

  // A union, so the three outcomes cannot both be set -- no exclusivity
  // bookkeeping needed.
  const RESULTS = [
    { value: 'GOOD', label: 'GOOD', variant: 'positive' },
    { value: 'MISS', label: 'MISSED', variant: 'negative' },
    { value: 'BLOCK', label: 'BLOCKED', variant: 'caution' },
  ] as const;
</script>

<FormShell type="field_goal" {busy} {onsave} {oncancel}>
  {#if onswitch}<KickChoice value="field_goal" onchange={onswitch} />{/if}
  <JerseyInput label="Kicker" {roster} {possession} positions={SELECT_POSITIONS.kicker}
               carried={form.kickerNumber !== null && form.kickerNumber === defaults.kickerNumber}
    value={form.kickerNumber} onchange={(v) => (form.kickerNumber = v)} />
  <NumberField label="Kick distance" value={form.kickDistance}
               onchange={(v) => (form.kickDistance = v)} />
  <div class="toggles">
    {#each RESULTS as option (option.value)}
      <ToggleButton label={option.label} variant={option.variant}
                    pressed={form.result === option.value}
                    onpress={() => (form.result = option.value)} />
    {/each}
  </div>
  <NotesField value={form.notes} onchange={(v) => (form.notes = v)} />
</FormShell>
