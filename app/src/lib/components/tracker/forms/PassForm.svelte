<script lang="ts">
  import type { Play, Player, Possession } from '../../../db/repositories/types';
  import { SELECT_POSITIONS, type PassForm , type PlayDefaults } from '../../../game/playForm';
  import FormShell from '../FormShell.svelte';
  import JerseyInput from '../JerseyInput.svelte';
  import YardsInput from '../YardsInput.svelte';
  import ToggleButton from '../ToggleButton.svelte';
  import NotesField from '../NotesField.svelte';
  import DefenseSection from '../DefenseSection.svelte';
  import PlayPicker from '../PlayPicker.svelte';

  interface Props {
    form: PassForm;
    roster: Player[];
    possession: Possession;
    playbook: Play[];
    defaults: PlayDefaults;
    busy: boolean;
    onsave: () => void;
    oncancel: () => void;
  }
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
  {#if !form.wasSacked}
    <JerseyInput
      label="Receiver" {roster} {possession} positions={SELECT_POSITIONS.receiver}
      carried={form.receiverNumber !== null && form.receiverNumber === defaults.receiverNumber}
    value={form.receiverNumber} onchange={(v) => (form.receiverNumber = v)}
    />
  {/if}

  <div class="toggles">
    <ToggleButton label="Complete" variant="green" pressed={form.isComplete} onpress={toggleComplete} />
    <ToggleButton label="Sack" variant="red" pressed={form.wasSacked} onpress={toggleSack} />
    <ToggleButton label="INT" variant="red" pressed={form.isInterception} onpress={toggleInterception} />
  </div>

  <YardsInput
    label={form.wasSacked ? 'Yards lost' : 'Yards gained'}
    value={form.yardsGained} onchange={(v) => (form.yardsGained = v)}
  />

  <div class="toggles">
    <ToggleButton label="TD" variant="green" pressed={form.isTouchdown}
                  onpress={toggleTouchdown} />
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
    <DefenseSection detail={form} {roster} passing={true} />
  {/if}

  <NotesField value={form.notes} onchange={(v) => (form.notes = v)} />
</FormShell>

<style>
  .toggles { display: grid; grid-template-columns: repeat(auto-fit, minmax(88px, 1fr)); gap: 8px; }
</style>
