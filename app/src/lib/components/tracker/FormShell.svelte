<script lang="ts">
  import { PLAY_FORM_META, type PlayFormType } from '../../game/playForm';

  interface Props {
    type: PlayFormType;
    busy: boolean;
    valid?: boolean;
    onsave: () => void;
    oncancel: () => void;
    children: import('svelte').Snippet;
  }
  let { type, busy, valid = true, onsave, oncancel, children }: Props = $props();
  const meta = $derived(PLAY_FORM_META[type]);
</script>

<section class="form" style="--accent: {meta.accent}">
  <h2>{meta.title}</h2>
  <div class="body">{@render children()}</div>
  <div class="actions">
    <button class="cancel" onclick={oncancel} disabled={busy}>Cancel</button>
    <button class="save" onclick={onsave} disabled={busy || !valid}>
      {busy ? 'Saving…' : `Save ${meta.title}`}
    </button>
  </div>
</section>

<style>
  .form { padding: 12px; display: grid; gap: 14px; }
  h2 {
    margin: 0; font-size: 0.75rem; font-weight: 800;
    text-transform: uppercase; letter-spacing: 1px; color: var(--accent);
  }
  .body { display: grid; gap: 14px; }
  .actions { display: grid; grid-template-columns: 1fr 2fr; gap: 10px; }
  .cancel, .save {
    min-height: 60px; border-radius: 12px; font-size: 1rem; font-weight: 800; cursor: pointer;
  }
  .cancel { background: var(--t-surface-2); border: 1.5px solid var(--t-border); color: var(--t-text-muted); }
  .save { background: var(--accent); border: none; color: #0b0d14; }
  .save:disabled, .cancel:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
