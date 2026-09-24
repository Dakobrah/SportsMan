<script lang="ts">
  /**
   * Who made the play, by the number on the shirt.
   *
   * A dropdown of the roster cannot express the opponent's offence, which
   * has no roster here — so this takes a number first and offers our own
   * players as one-tap chips beside it. An unmatched number is a normal
   * answer, not an error: it is stored as typed and simply carries no player
   * link.
   */
  import type { Player, Possession } from '../../db/repositories/types';
  import { JERSEY_MAX, JERSEY_MIN, playerByNumber } from '../../game/playForm';
  import type { Position } from '../../db/repositories/types';
  import Chip from './Chip.svelte';

  interface Props {
    label: string;
    roster: Player[];
    positions?: readonly Position[];
    possession: Possession;
    value: number | null;
    /** True when this number came from an earlier play rather than this one. */
    carried?: boolean;
    onchange: (value: number | null) => void;
  }
  let { label, roster, positions, possession, value, carried = false, onchange }: Props = $props();

  const ours = $derived(possession === 'us');

  /** Chips are a shortcut to our own roster, so they only appear for our ball. */
  const chips = $derived(
    !ours ? [] : (positions ? roster.filter((p) => positions.includes(p.position)) : roster),
  );

  const matched = $derived(ours ? playerByNumber(value, roster) : undefined);
  const unmatched = $derived(ours && value !== null && matched === undefined);

  function set(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === '') return onchange(null);
    const parsed = Number(trimmed);
    onchange(Number.isFinite(parsed) ? Math.trunc(parsed) : null);
  }
</script>

<div class="jersey">
  <label class="field">
    <span>
      {label}
      {#if matched}<em class="who">{matched.firstName} {matched.lastName}</em>
      {:else if unmatched}<em class="who off">not on roster</em>
      {:else if !ours}<em class="who off">opponent</em>{/if}
      {#if carried && value !== null}<em class="carried">↺ last play</em>{/if}
    </span>
    <input
      type="number" inputmode="numeric" enterkeyhint="done"
      min={JERSEY_MIN} max={JERSEY_MAX} placeholder="#"
      value={value ?? ''}
      oninput={(e) => set((e.currentTarget as HTMLInputElement).value)}
    />
  </label>

  {#if chips.length > 0}
    <div class="chips">
      {#each chips as player (player.id)}
        <Chip
          label={player.number} pressed={value === player.number}
          title={`${player.firstName} ${player.lastName}`}
          onpress={() => onchange(value === player.number ? null : player.number)}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .jersey { display: grid; gap: 0.5rem; }
  .who { font-style: normal; font-weight: 700; color: var(--c-positive); margin-left: 0.35rem; }
  .who.off { color: var(--t-text-muted); font-weight: 500; }
  /* A carried-over value is right most of the time and wrong occasionally,
     so it has to be visible before the coach hits save. */
  .carried {
    font-style: normal; font-size: 0.75rem; font-weight: 700;
    color: var(--c-caution); margin-left: 0.4rem;
  }
  input { min-height: 52px; font-size: 1.15rem; font-weight: 700; }

  /* Same floor as the quick-yard chips: a gloved thumb must not catch the
     neighbouring number. */
  .chips { display: grid; grid-template-columns: repeat(auto-fit, minmax(56px, 1fr)); gap: 8px; }
</style>
