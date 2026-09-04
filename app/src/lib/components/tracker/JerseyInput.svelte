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

  interface Props {
    label: string;
    roster: Player[];
    positions?: readonly Position[];
    possession: Possession;
    value: number | null;
    onchange: (value: number | null) => void;
  }
  let { label, roster, positions, possession, value, onchange }: Props = $props();

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
        <button
          type="button" class="chip" class:on={value === player.number}
          onclick={() => onchange(value === player.number ? null : player.number)}
          title={`${player.firstName} ${player.lastName}`}
        >
          {player.number}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .jersey { display: grid; gap: 0.5rem; }
  .who { font-style: normal; font-weight: 700; color: var(--t-green); margin-left: 0.35rem; }
  .who.off { color: var(--t-text-muted); font-weight: 500; }
  input { min-height: 52px; font-size: 1.15rem; font-weight: 700; }

  /* Same floor as the quick-yard chips: a gloved thumb must not catch the
     neighbouring number. */
  .chips { display: grid; grid-template-columns: repeat(auto-fit, minmax(56px, 1fr)); gap: 8px; }
  .chip {
    min-width: 56px; min-height: 52px;
    border-radius: 8px; border: 1.5px solid var(--t-border);
    background: var(--t-surface-2); color: var(--t-text);
    font-weight: 700; font-variant-numeric: tabular-nums; cursor: pointer;
  }
  .chip.on { background: var(--t-blue); border-color: var(--t-blue); color: #fff; }
</style>
