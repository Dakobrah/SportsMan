<script lang="ts">
  /**
   * A <dialog>-based modal.
   *
   * Django's tracker used window.prompt() and window.confirm()
   * (tracker.js:657, :739, :767). Both are unreliable to absent in WebView2
   * and Android WebView, which is why everything modal in this app goes
   * through here instead.
   */
  interface Props {
    open: boolean;
    title: string;
    onclose?: () => void;
    children: import('svelte').Snippet;
    footer?: import('svelte').Snippet;
  }
  let { open, title, onclose, children, footer }: Props = $props();

  let dialog = $state<HTMLDialogElement | null>(null);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} oncancel={(e) => { e.preventDefault(); onclose?.(); }}>
  <h2>{title}</h2>
  <div class="body">{@render children()}</div>
  {#if footer}<div class="footer">{@render footer()}</div>{/if}
</dialog>

<style>
  dialog {
    border: 1px solid var(--t-border);
    border-radius: var(--radius);
    background: var(--t-surface);
    color: var(--t-text);
    padding: var(--gap);
    max-width: min(30rem, calc(100vw - 2rem));
    width: 100%;
  }
  dialog::backdrop { background: rgba(0, 0, 0, 0.6); }
  .body { display: grid; gap: 0.5rem; }
  .footer { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: var(--gap); }
  h2 { margin-top: 0; }
</style>
