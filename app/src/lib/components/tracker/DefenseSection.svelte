<script lang="ts">
  /**
   * Who made the play, when the opponent has the ball.
   *
   * Appears on the run and pass forms rather than being a form of its own:
   * one play happened, so the coach records it once. The tackler and the
   * assists are OUR players even though the opponent has possession, so the
   * roster chips are always meaningful here.
   */
  import type { Player } from '../../db/repositories/types';
  import type { DefensiveDetail } from '../../game/playForm';
  import Chip from './Chip.svelte';
  import JerseyInput from './JerseyInput.svelte';
  import ToggleButton from './ToggleButton.svelte';

  interface Props {
    detail: DefensiveDetail;
    roster: Player[];
    /** Pressure and pass-breakup only make sense on a pass. */
    passing?: boolean;
  }
  let { detail, roster, passing = false }: Props = $props();

  const toggleAssist = (number: number) => {
    const at = detail.assistNumbers.indexOf(number);
    if (at === -1) detail.assistNumbers.push(number);
    else detail.assistNumbers.splice(at, 1);
  };

  // The tackler is not also an assist.
  const helpers = $derived(roster.filter((p) => p.number !== detail.tacklerNumber));
</script>

<fieldset class="defense">
  <legend>Our defense</legend>

  <JerseyInput
    label="Tackler" {roster} possession="us"
    value={detail.tacklerNumber}
    onchange={(v) => {
      detail.tacklerNumber = v;
      // Moving someone into the primary slot takes them out of the assists.
      if (v !== null) {
        const at = detail.assistNumbers.indexOf(v);
        if (at !== -1) detail.assistNumbers.splice(at, 1);
      }
    }}
  />

  {#if detail.tacklerNumber !== null}
    <div class="assists">
      <span class="label">Assisted by</span>
      <div class="chips">
        {#each helpers as player (player.id)}
          <Chip
            label={player.number}
            pressed={detail.assistNumbers.includes(player.number)}
            title={`${player.firstName} ${player.lastName}`}
            onpress={() => toggleAssist(player.number)}
          />
        {/each}
      </div>
    </div>
  {/if}

  <div class="toggles">
    <ToggleButton
      label="TFL" variant="positive" pressed={detail.tackleForLoss}
      onpress={() => (detail.tackleForLoss = !detail.tackleForLoss)}
    />
    {#if passing}
      <ToggleButton
        label="Pressure" variant="caution" pressed={detail.appliedPressure}
        onpress={() => (detail.appliedPressure = !detail.appliedPressure)}
      />
      <ToggleButton
        label="Pass def" variant="info" pressed={detail.forcedIncompletion}
        onpress={() => (detail.forcedIncompletion = !detail.forcedIncompletion)}
      />
    {/if}
    <ToggleButton
      label="Def TD" variant="positive" pressed={detail.isDefensiveTouchdown}
      onpress={() => (detail.isDefensiveTouchdown = !detail.isDefensiveTouchdown)}
    />
  </div>
</fieldset>

<style>
  .defense {
    display: grid;
    gap: 0.75rem;
    border: 1.5px solid color-mix(in srgb, var(--c-negative) 35%, transparent);
    border-radius: var(--radius);
    padding: 0.75rem;
    margin: 0;
    background: color-mix(in srgb, var(--c-negative) 6%, transparent);
  }
  legend {
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--c-negative);
    padding: 0 0.4rem;
  }
  .assists { display: grid; gap: 0.4rem; }
  .label { font-size: 0.85rem; color: var(--t-text-muted); }
  .chips { display: grid; grid-template-columns: repeat(auto-fit, minmax(56px, 1fr)); gap: 8px; }
  .toggles { display: grid; grid-template-columns: repeat(auto-fit, minmax(88px, 1fr)); gap: 8px; }
</style>
