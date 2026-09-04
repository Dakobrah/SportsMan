<script lang="ts">
  import type { Player, Position } from '../../db/repositories/types';

  interface Props {
    label: string;
    players: Player[];
    positions?: readonly Position[];
    value: number | null;
    onchange: (value: number | null) => void;
  }
  let { label, players, positions, value, onchange }: Props = $props();

  const options = $derived(
    positions ? players.filter((p) => positions.includes(p.position)) : players,
  );
</script>

<label class="field">
  <span>{label}</span>
  <select
    value={value === null ? '' : String(value)}
    onchange={(e) => {
      const raw = (e.currentTarget as HTMLSelectElement).value;
      onchange(raw === '' ? null : Number(raw));
    }}
  >
    <option value="">—</option>
    {#each options as player (player.id)}
      <option value={String(player.id)}>#{player.number} {player.lastName}</option>
    {/each}
  </select>
</label>

<style>
  select { min-height: 52px; }
</style>
