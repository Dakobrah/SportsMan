<script lang="ts">
  /** The loading / error / empty shell every list screen shares. */
  interface Props {
    loading: boolean;
    error: string;
    empty?: boolean;
    emptyText?: string;
    children: import('svelte').Snippet;
    emptyAction?: import('svelte').Snippet;
  }
  let { loading, error, empty = false, emptyText = 'Nothing here yet.', children, emptyAction }: Props = $props();
</script>

{#if loading}
  <p class="muted">Loading…</p>
{:else if error}
  <p class="error" role="alert">{error}</p>
{:else if empty}
  <div class="empty">
    <p class="muted">{emptyText}</p>
    {@render emptyAction?.()}
  </div>
{:else}
  {@render children()}
{/if}

<style>
  .muted { color: var(--t-text-muted); }
  .error {
    color: var(--c-negative);
    background: color-mix(in srgb, var(--c-negative) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--c-negative) 35%, transparent);
    border-radius: var(--radius);
    padding: 0.75rem;
  }
  .empty {
    display: grid;
    gap: 0.75rem;
    justify-items: start;
    padding: 1.5rem 0;
  }
</style>
