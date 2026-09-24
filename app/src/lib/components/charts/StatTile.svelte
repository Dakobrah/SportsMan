<script lang="ts">
  /**
   * A single number with its label.
   *
   * What stops a row of key figures becoming eight one-bar charts. A bar
   * whose only job is to show one value is a worse way to read that value
   * than the value itself.
   */
  interface Props {
    label: string;
    value: string | number;
    hint?: string;
    tone?: 'neutral' | 'good' | 'bad';
  }
  let { label, value, hint, tone = 'neutral' }: Props = $props();
</script>

<div class="tile {tone}">
  <span class="label">{label}</span>
  <strong class="value">{value}</strong>
  {#if hint}<span class="hint">{hint}</span>{/if}
</div>

<style>
  .tile {
    display: grid; gap: 0.15rem;
    background: var(--t-surface); border: 1px solid var(--t-border);
    border-radius: var(--radius); padding: var(--gap);
  }
  .label { font-size: 0.8rem; color: var(--t-text-muted); }
  /* Proportional, not tabular: a headline figure is read, not compared
     column-wise against the one below it. */
  .value { font-size: 1.7rem; line-height: 1.1; }
  .hint { font-size: 0.78rem; color: var(--t-text-muted); }
  .good .value { color: var(--c-positive); }
  .bad .value { color: var(--c-negative); }
</style>
