<script lang="ts">
  import type { Play, Player, Possession } from '../../../db/repositories/types';
  import { SELECT_POSITIONS, type PassForm , type PlayDefaults, type PlayFormProps } from '../../../game/playForm';
  import FormShell from '../FormShell.svelte';
  import JerseyInput from '../JerseyInput.svelte';
  import YardsInput from '../YardsInput.svelte';
  import NumberField from '../NumberField.svelte';
  import ToggleButton from '../ToggleButton.svelte';
  import NotesField from '../NotesField.svelte';
  import DefenseSection from '../DefenseSection.svelte';
  import PlayPicker from '../PlayPicker.svelte';

  type Props = PlayFormProps<PassForm>;
  let { form = $bindable(), roster, possession, playbook, defaults, busy, onsave, oncancel }: Props = $props();

  /** A sack is not a completion, and an interception is not either. */
  function toggleSack() {
    form.wasSacked = !form.wasSacked;
    if (form.wasSacked) {
      form.isComplete = false;
      form.isTouchdown = false;
      form.isInterception = false;
    }
  }
  function toggleComplete() {
    form.isComplete = !form.isComplete;
    if (form.isComplete) form.isThrownAway = false;
    if (form.isComplete) {
      form.wasSacked = false;
      form.isInterception = false;
    } else {
      form.isTouchdown = false;
    }
  }
  /** validate.ts rejects a touchdown pass that was not completed, so pressing
   *  TD marks the completion rather than letting the save fail. */
  function toggleTouchdown() {
    form.isTouchdown = !form.isTouchdown;
    if (form.isTouchdown) {
      form.isComplete = true;
      form.wasSacked = false;
      form.isInterception = false;
    }
  }

  function toggleInterception() {
    form.isInterception = !form.isInterception;
    if (form.isInterception) {
      form.isComplete = false;
      form.isTouchdown = false;
      form.wasSacked = false;
    }
  }
</script>

<FormShell type="pass" {busy} {onsave} {oncancel}>
  <PlayPicker
    {playbook} unitType={possession === 'us' ? 'OFF' : 'DEF'}
    playId={form.playId} formation={form.formation}
    onchange={(id, formation) => { form.playId = id; form.formation = formation; }}
  />

  <JerseyInput
    label="Quarterback" {roster} {possession} positions={SELECT_POSITIONS.quarterback}
    carried={form.quarterbackNumber !== null && form.quarterbackNumber === defaults.quarterbackNumber}
    value={form.quarterbackNumber} onchange={(v) => (form.quarterbackNumber = v)}
  />
  {#if !form.wasSacked && !form.isThrownAway}
    <JerseyInput
      label="Target" {roster} {possession} positions={SELECT_POSITIONS.receiver}
      carried={form.targetNumber !== null && form.targetNumber === defaults.receiverNumber}
      value={form.targetNumber} onchange={(v) => (form.targetNumber = v)}
    />
  {/if}

  <div class="toggles">
    <ToggleButton label="Complete" variant="positive" pressed={form.isComplete} onpress={toggleComplete} />
    <ToggleButton label="Sack" variant="negative" pressed={form.wasSacked} onpress={toggleSack} />
    <ToggleButton label="INT" variant="negative" pressed={form.isInterception} onpress={toggleInterception} />
    <ToggleButton label="Throwaway" variant="caution" pressed={form.isThrownAway}
                  onpress={() => { form.isThrownAway = !form.isThrownAway;
                                   if (form.isThrownAway) { form.isComplete = false; form.targetNumber = null; } }} />
    {#if possession === 'us'}
      <ToggleButton label="Pressured" variant="caution" pressed={form.wasUnderPressure}
                    onpress={() => (form.wasUnderPressure = !form.wasUnderPressure)} />
    {/if}
  </div>

  <YardsInput
    label={form.wasSacked ? 'Yards lost' : 'Yards gained'}
    value={form.yardsGained} onchange={(v) => (form.yardsGained = v)}
  />

  {#if form.isComplete}
    <NumberField
      label="Air yards" value={form.airYards}
      onchange={(v) => (form.airYards = v)}
    />
    <!-- Derived, not entered: the two cannot contradict the total. -->
    <p class="derived">
      {form.yardsGained - form.airYards} yards after the catch
    </p>
  {/if}

  <div class="toggles">
    <ToggleButton label="TD" variant="positive" pressed={form.isTouchdown}
                  onpress={toggleTouchdown} />
    <ToggleButton label="1st Down" variant="info" pressed={form.isFirstDown}
                  onpress={() => (form.isFirstDown = !form.isFirstDown)} />
    <ToggleButton label="Fumble" variant="negative" pressed={form.fumbled}
                  onpress={() => (form.fumbled = !form.fumbled)} />
    {#if form.fumbled}
      <ToggleButton label="Lost" variant="negative" pressed={form.fumbleLost}
                    onpress={() => (form.fumbleLost = !form.fumbleLost)} />
    {/if}
  </div>
  {#if possession === 'them'}
    <DefenseSection detail={form} {roster} passing={true} />
  {/if}

  <NotesField value={form.notes} onchange={(v) => (form.notes = v)} />
</FormShell>

<style>
  .derived { margin: 0; font-size: 0.85rem; color: var(--t-text-muted); }
</style>
