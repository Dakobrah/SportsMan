<script lang="ts">
  import type { Play, Player, Possession } from '../../../db/repositories/types';
  import { SELECT_POSITIONS, gainImpliesCompletion, safetyFromYardage, safetyPossible, touchdownFromYardage, type PassForm , type PlayDefaults, type PlayFormProps } from '../../../game/playForm';
  import FormShell from '../FormShell.svelte';
  import JerseyInput from '../JerseyInput.svelte';
  import YardsInput from '../YardsInput.svelte';
  import NumberField from '../NumberField.svelte';
  import ToggleButton from '../ToggleButton.svelte';
  import NotesField from '../NotesField.svelte';
  import DefenseSection from '../DefenseSection.svelte';
  import PlayPicker from '../PlayPicker.svelte';

  type Props = PlayFormProps<PassForm>;
  let { form = $bindable(), roster, possession, playbook, defaults, busy,
        ballPosition, onsave, oncancel }: Props = $props();

  /** See RunForm: a completed pass into the end zone is a touchdown, and the
   *  toggle says so before the coach presses it. `recordPlay` scores it from
   *  this same predicate. */
  const scores = $derived(touchdownFromYardage(form, ballPosition, possession));

  /** The mirror: a loss into our own end zone is two for the defense. Offered
   *  only when backed up, where it can happen. */
  const concedes = $derived(safetyFromYardage(form, ballPosition, possession));
  const backedUp = $derived(safetyPossible(ballPosition, possession));

  /** A sack is not a completion, and an interception is not either. */
  function toggleSack() {
    autoCompleted = false;
    form.wasSacked = !form.wasSacked;
    if (form.wasSacked) {
      form.isComplete = false;
      form.isTouchdown = false;
      form.isInterception = false;
    }
  }
  /**
   * Set when the yardage ticked Complete rather than the coach, so that
   * backing the yards out to nothing unticks it again. A completion the coach
   * pressed is never undone behind their back.
   */
  let autoCompleted = false;

  /** A gain means a catch; see `gainImpliesCompletion`. */
  function setYards(yards: number) {
    form.yardsGained = yards;
    if (gainImpliesCompletion(form)) {
      if (!form.isComplete) {
        form.isComplete = true;
        form.isThrownAway = false;
        autoCompleted = true;
      }
    } else if (autoCompleted && yards <= 0) {
      form.isComplete = false;
      form.isTouchdown = false;
      autoCompleted = false;
    }
  }

  function toggleComplete() {
    autoCompleted = false;
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
    autoCompleted = false;
    form.isTouchdown = !form.isTouchdown;
    if (form.isTouchdown) {
      form.isComplete = true;
      form.wasSacked = false;
      form.isInterception = false;
    }
  }

  function toggleInterception() {
    autoCompleted = false;
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
    value={form.yardsGained} onchange={setYards}
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
    <ToggleButton label="TD" variant="positive" pressed={form.isTouchdown || scores}
                  onpress={toggleTouchdown} />
    <ToggleButton label="1st Down" variant="info" pressed={form.isFirstDown}
                  onpress={() => (form.isFirstDown = !form.isFirstDown)} />
    {#if backedUp || form.isSafety || concedes}
      <ToggleButton label="Safety" variant="negative" pressed={form.isSafety || concedes}
                    onpress={() => (form.isSafety = !form.isSafety)} />
    {/if}
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
