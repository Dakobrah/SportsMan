<script lang="ts">
  /** A one-number prompt. Replaces window.prompt() for the scoreboard edits. */
  import Modal from './Modal.svelte';

  interface Props {
    open: boolean;
    title: string;
    value: number;
    min?: number;
    max?: number;
    onsubmit: (value: number) => void;
    oncancel: () => void;
  }
  let { open, title, value, min = 0, max = 199, onsubmit, oncancel }: Props = $props();

  // Seeded by the effect below rather than inline, so reopening the dialog
  // always shows the current value instead of the one it first mounted with.
  let draft = $state('');

  $effect(() => {
    if (open) draft = String(value);
  });

  const parsed = $derived(Number(draft));
  const valid = $derived(Number.isInteger(parsed) && parsed >= min && parsed <= max);
</script>

<Modal {open} {title} onclose={oncancel}>
  <label class="field">
    <span>Value ({min}–{max})</span>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      type="number" bind:value={draft} {min} {max} autofocus inputmode="numeric"
      onkeydown={(e) => { if (e.key === 'Enter' && valid) onsubmit(parsed); }}
    />
  </label>
  {#snippet footer()}
    <button class="btn" onclick={oncancel}>Cancel</button>
    <button class="btn btn-primary" disabled={!valid} onclick={() => onsubmit(parsed)}>Set</button>
  {/snippet}
</Modal>
