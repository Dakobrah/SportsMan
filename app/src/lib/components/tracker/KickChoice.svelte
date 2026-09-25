<script lang="ts">
  /**
   * Punt or field goal -- the two kicks from scrimmage, on one form. Switching
   * starts the other form afresh; the kicker carries over through the
   * per-side defaults like any other play.
   */
  import type { ScrimmageKick } from '../../game/playForm';
  import ToggleButton from './ToggleButton.svelte';

  interface Props {
    value: ScrimmageKick;
    onchange: (kick: ScrimmageKick) => void;
  }
  let { value, onchange }: Props = $props();
</script>

<div class="toggles two">
  <ToggleButton label="Punt" variant="special" pressed={value === 'punt'}
                onpress={() => value !== 'punt' && onchange('punt')} />
  <ToggleButton label="Field Goal" variant="special" pressed={value === 'field_goal'}
                onpress={() => value !== 'field_goal' && onchange('field_goal')} />
</div>
