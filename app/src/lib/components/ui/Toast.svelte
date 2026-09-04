<script lang="ts">
  import { dismiss, toasts } from '../../ui/toasts.svelte';
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each toasts as toast (toast.id)}
    <div class="toast {toast.kind}">
      <span>{toast.message}</span>
      {#if toast.kind === 'error'}
        <button aria-label="Dismiss" onclick={() => dismiss(toast.id)}>×</button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: calc(1rem + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    display: grid;
    gap: 0.5rem;
    z-index: 200;
    width: min(28rem, calc(100vw - 2rem));
  }
  .toast {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.7rem 0.9rem;
    border-radius: var(--radius);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
    font-weight: 600;
  }
  .success { background: var(--t-green); color: #06240f; }
  .error { background: var(--t-red); color: #fff; }
  button {
    background: none; border: none; color: inherit;
    font-size: 1.3rem; line-height: 1; cursor: pointer;
    min-width: var(--tap); min-height: var(--tap);
  }
</style>
