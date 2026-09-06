<script lang="ts">
  import type { Play, Player, Possession } from '../../../db/repositories/types';
  import { SELECT_POSITIONS, type RunForm } from '../../../game/playForm';
  import FormShell from '../FormShell.svelte';
  import JerseyInput from '../JerseyInput.svelte';
  import YardsInput from '../YardsInput.svelte';
  import ToggleButton from '../ToggleButton.svelte';
  import NotesField from '../NotesField.svelte';
  import DefenseSection from '../DefenseSection.svelte';
  import PlayPicker from '../PlayPicker.svelte';

  interface Props {
    form: RunForm;
    roster: Player[];
    possession: Possession;
    playbook: Play[];
    busy: boolean;
    onsave: () => void;
    oncancel: () => void;
  }
  let { form = $bindable(), roster, possession, playbook, busy, onsave, oncancel }: Props = $props();
</script>

<FormShell type="run" {busy} {onsave} {oncancel}>
  <PlayPicker
    {playbook} unitType={possession === 'us' ? 'OFF' : 'DEF'}
    playId={form.playId} formation={form.formation}
    onchange={(id, formation) => { form.playId = id; form.formation = formation; }}
  />

  <JerseyInput
    label="Ball carrier" {roster} {possession} positions={SELECT_POSITIONS.ballCarrier}
    value={form.ballCarrierNumber} onchange={(v) => (form.ballCarrierNumber = v)}
  />
  <YardsInput value={form.yardsGained} onchange={(v) => (form.yardsGained = v)} />
  <div class="toggles">
    <ToggleButton label="TD" variant="green" pressed={form.isTouchdown}
                  onpress={() => (form.isTouchdown = !form.isTouchdown)} />
    <ToggleButton label="1st Down" variant="blue" pressed={form.isFirstDown}
                  onpress={() => (form.isFirstDown = !form.isFirstDown)} />
    <ToggleButton label="Fumble" variant="red" pressed={form.fumbled}
                  onpress={() => (form.fumbled = !form.fumbled)} />
    {#if form.fumbled}
      <ToggleButton label="Lost" variant="red" pressed={form.fumbleLost}
                    onpress={() => (form.fumbleLost = !form.fumbleLost)} />
    {/if}
  </div>
  {#if possession === 'them'}
    <DefenseSection detail={form} {roster} passing={false} />
  {/if}

  <NotesField value={form.notes} onchange={(v) => (form.notes = v)} />
</FormShell>

<style>
  .toggles { display: grid; grid-template-columns: repeat(auto-fit, minmax(88px, 1fr)); gap: 8px; }
</style>
