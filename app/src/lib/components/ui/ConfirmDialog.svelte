<script lang="ts">
  import Modal from './Modal.svelte';

  interface Props {
    open: boolean;
    title: string;
    confirmLabel?: string;
    danger?: boolean;
    onconfirm: () => void;
    oncancel: () => void;
    children: import('svelte').Snippet;
  }
  let {
    open, title, confirmLabel = 'Confirm', danger = true,
    onconfirm, oncancel, children,
  }: Props = $props();
</script>

<Modal {open} {title} onclose={oncancel}>
  {@render children()}
  {#snippet footer()}
    <button class="btn" onclick={oncancel}>Cancel</button>
    <button class="btn" class:btn-danger={danger} class:btn-primary={!danger} onclick={onconfirm}>
      {confirmLabel}
    </button>
  {/snippet}
</Modal>
