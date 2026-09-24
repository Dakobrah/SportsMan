<script lang="ts">
  import { QUICK_YARDS } from '../../game/playForm';
  import Chip from './Chip.svelte';

  interface Props {
    label?: string;
    value: number;
    onchange: (value: number) => void;
  }
  let { label = 'Yards gained', value, onchange }: Props = $props();
</script>

<div class="yards">
  <label class="field">
    <span>{label}</span>
    <input
      type="number" inputmode="numeric" value={value}
      oninput={(e) => onchange(Number((e.currentTarget as HTMLInputElement).value) || 0)}
    />
  </label>

  <!-- The most-used control in the app. 56x52 with 8px gaps is the floor a
       cold or gloved thumb needs; do not shrink these. -->
  <div class="quick-yards">
    {#each QUICK_YARDS as yards (yards)}
      <Chip label={yards > 0 ? `+${yards}` : yards} pressed={value === yards}
            onpress={() => onchange(yards)} />
    {/each}
  </div>
</div>

<style>
  .yards { display: grid; gap: 0.6rem; }
  .quick-yards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(56px, 1fr));
    gap: 8px;
  }
</style>
