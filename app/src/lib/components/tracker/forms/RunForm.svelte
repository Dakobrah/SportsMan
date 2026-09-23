<script lang="ts">
  import type { Play, Player, Possession } from '../../../db/repositories/types';
  import { SELECT_POSITIONS, touchdownFromYardage, type RunForm, type PlayFormProps } from '../../../game/playForm';
  import FormShell from '../FormShell.svelte';
  import JerseyInput from '../JerseyInput.svelte';
  import YardsInput from '../YardsInput.svelte';
  import ToggleButton from '../ToggleButton.svelte';
  import NotesField from '../NotesField.svelte';
  import DefenseSection from '../DefenseSection.svelte';
  import PlayPicker from '../PlayPicker.svelte';

  type Props = PlayFormProps<RunForm>;
  let { form = $bindable(), roster, possession, playbook, defaults, busy,
        ballPosition, onsave, oncancel }: Props = $props();

  /** Reaching the goal line IS the touchdown, so the toggle shows it without
   *  waiting to be pressed. `recordPlay` derives the same thing on save from
   *  the same predicate, so what the button says is what gets scored. */
  const scores = $derived(touchdownFromYardage(form, ballPosition, possession));
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
    <ToggleButton label="TD" variant="green" pressed={form.isTouchdown || scores}
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
