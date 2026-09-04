<script lang="ts">
  import type { Player, Possession } from '../../../db/repositories/types';
  import { SELECT_POSITIONS, type ExtraPointForm , type PlayDefaults } from '../../../game/playForm';
  import FormShell from '../FormShell.svelte';
  import JerseyInput from '../JerseyInput.svelte';
  import ToggleButton from '../ToggleButton.svelte';
  import NotesField from '../NotesField.svelte';

  interface Props {
    form: ExtraPointForm;
    roster: Player[];
    possession: Possession;
    defaults: PlayDefaults;
    busy: boolean;
    onsave: () => void;
    oncancel: () => void;
  }
  let { form = $bindable(), roster, possession, defaults, busy, onsave, oncancel }: Props = $props();

  const ATTEMPTS = [
    { value: 'KICK', label: 'PAT Kick' },
    { value: '2PT_RUN', label: '2pt Run' },
    { value: '2PT_PASS', label: '2pt Pass' },
  ] as const;
</script>

<FormShell type="extra_point" {busy} {onsave} {oncancel}>
  <div class="toggles three">
    {#each ATTEMPTS as option (option.value)}
      <ToggleButton label={option.label} variant="purple"
                    pressed={form.attemptType === option.value}
                    onpress={() => (form.attemptType = option.value)} />
    {/each}
  </div>

  {#if form.attemptType === 'KICK'}
    <JerseyInput label="Kicker" {roster} {possession} positions={SELECT_POSITIONS.kicker}
                 carried={form.kickerNumber !== null && form.kickerNumber === defaults.kickerNumber}
    value={form.kickerNumber} onchange={(v) => (form.kickerNumber = v)} />
  {/if}

  <div class="toggles">
    <ToggleButton label="GOOD" variant="green" pressed={form.result === 'GOOD'}
                  onpress={() => (form.result = 'GOOD')} />
    <ToggleButton label="NO GOOD" variant="red" pressed={form.result === 'MISS'}
                  onpress={() => (form.result = 'MISS')} />
  </div>
  <NotesField value={form.notes} onchange={(v) => (form.notes = v)} />
</FormShell>

<style>
  .toggles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .toggles.three { grid-template-columns: repeat(3, 1fr); }
</style>
