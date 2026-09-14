<script lang="ts">
  /**
   * A labelled whole-number input at the tracker's touch size.
   *
   * The same six lines of markup appeared in four of the play forms. This is
   * not `YardsInput`: that one carries the quick-yard chips because gains are
   * tapped far more often than typed, whereas a kick distance is typed once.
   */
  interface Props {
    label: string;
    value: number;
    min?: number;
    max?: number;
    onchange: (value: number) => void;
  }
  let { label, value, min, max, onchange }: Props = $props();
</script>

<label class="field">
  <span>{label}</span>
  <input
    type="number" inputmode="numeric" {min} {max} value={value}
    oninput={(e) => onchange(Number((e.currentTarget as HTMLInputElement).value) || 0)}
  />
</label>

<style>
  input { min-height: 52px; }
</style>
