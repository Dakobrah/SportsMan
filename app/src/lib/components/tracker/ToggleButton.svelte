<script lang="ts">
  /**
   * A press-to-set flag. Django tracked these with data-active attributes and
   * four hardcoded arrays to keep radio-style groups exclusive; here the
   * bound value is a boolean or an enum, so exclusivity is the caller's type.
   */
  interface Props {
    label: string;
    pressed: boolean;
    variant?: 'green' | 'blue' | 'amber' | 'red' | 'purple';
    onpress: () => void;
  }
  let { label, pressed, variant = 'blue', onpress }: Props = $props();
</script>

<button type="button" class="toggle {variant}" class:on={pressed} aria-pressed={pressed} onclick={onpress}>
  {label}
</button>

<style>
  .toggle {
    min-height: 52px;
    padding: 0 0.75rem;
    border: 1.5px solid var(--t-border);
    border-radius: 8px;
    background: var(--t-surface-2);
    color: var(--t-text-muted);
    font-weight: 700;
    cursor: pointer;
  }
  .toggle.on { color: #fff; }
  .toggle.green.on { background: var(--t-green); border-color: var(--t-green); color: #06240f; }
  .toggle.blue.on { background: var(--t-blue); border-color: var(--t-blue); }
  .toggle.amber.on { background: var(--t-amber); border-color: var(--t-amber); color: #2a1a00; }
  .toggle.red.on { background: var(--t-red); border-color: var(--t-red); }
  .toggle.purple.on { background: var(--t-purple); border-color: var(--t-purple); }
</style>
