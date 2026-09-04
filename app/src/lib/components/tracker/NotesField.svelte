<script lang="ts">
  interface Props {
    value: string;
    onchange: (value: string) => void;
  }
  let { value, onchange }: Props = $props();
  let open = $state(false);
</script>

{#if open}
  <label class="field">
    <span>Note</span>
    <textarea
      value={value} rows="2"
      oninput={(e) => onchange((e.currentTarget as HTMLTextAreaElement).value)}
    ></textarea>
  </label>
{:else}
  <button type="button" class="add" onclick={() => (open = true)}>+ Add note</button>
{/if}

<style>
  .add {
    background: none; border: none; color: var(--t-text-muted);
    text-align: left; padding: 0.5rem 0; min-height: var(--tap); cursor: pointer;
  }
  .add:hover { color: var(--t-text); }
</style>
