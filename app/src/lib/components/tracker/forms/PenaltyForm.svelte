<script lang="ts">
  import type { PlayFormProps } from '../../../game/playForm';
  import type { PenaltyForm } from '../../../game/playForm';
  import type { Penalty } from '../../../game/penalties';
  import FormShell from '../FormShell.svelte';
  import PenaltyList from '../PenaltyList.svelte';
  import ToggleButton from '../ToggleButton.svelte';
  import NotesField from '../NotesField.svelte';

  type Props = PlayFormProps<PenaltyForm>;
  let { form = $bindable(), roster, possession, playbook, defaults, busy, onsave, oncancel }: Props = $props();

  /** Picking a penalty fills in its standard enforcement; the coach can
   *  still override the yardage for a spot foul. */
  function pick(penalty: Penalty) {
    form.penaltyName = penalty.name;
    form.penaltyYards = penalty.yards;
    form.onOffense = penalty.onOffense;
    form.accepted = true;
    form.autoFirstDown = penalty.autoFirstDown ?? false;
  }
</script>

<FormShell type="penalty" {busy} valid={form.penaltyName !== ''} {onsave} {oncancel}>
  <PenaltyList selected={form.penaltyName} onpick={pick} />

  {#if form.penaltyName}
    <label class="field">
      <span>Yards</span>
      <input
        type="number" inputmode="numeric" value={form.penaltyYards}
        oninput={(e) => (form.penaltyYards = Number((e.currentTarget as HTMLInputElement).value) || 0)}
      />
    </label>

    <div class="toggles">
      <ToggleButton label="Accepted" variant="green" pressed={form.accepted}
                    onpress={() => (form.accepted = true)} />
      <ToggleButton label="Declined" variant="red" pressed={!form.accepted}
                    onpress={() => (form.accepted = false)} />
    </div>

    <div class="toggles">
      <ToggleButton label="On offense" variant="amber" pressed={form.onOffense}
                    onpress={() => (form.onOffense = true)} />
      <ToggleButton label="On defense" variant="amber" pressed={!form.onOffense}
                    onpress={() => (form.onOffense = false)} />
      <ToggleButton label="Auto 1st" variant="blue" pressed={form.autoFirstDown}
                    onpress={() => (form.autoFirstDown = !form.autoFirstDown)} />
    </div>

    <NotesField value={form.notes} onchange={(v) => (form.notes = v)} />
  {/if}
</FormShell>
