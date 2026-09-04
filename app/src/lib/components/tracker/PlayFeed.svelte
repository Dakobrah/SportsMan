<script lang="ts">
  import type { FeedEntry } from '../../game/recordPlay';

  interface Props {
    entries: FeedEntry[];
    busy: boolean;
    onundo: () => void;
  }
  let { entries, busy, onundo }: Props = $props();
</script>

<section class="feed">
  <div class="header">
    <h2>Recent plays</h2>
    <!-- The recovery path; it is deliberately a large target. -->
    <button class="undo" disabled={busy || entries.length === 0} onclick={onundo}>↶ Undo</button>
  </div>

  {#if entries.length === 0}
    <p class="empty">No plays yet. Pick a play type above.</p>
  {:else}
    <ol>
      {#each entries as entry (entry.id)}
        <li>
          <span class="seq tabular">#{entry.sequenceNumber}</span>
          <span class="q">Q{entry.quarter}</span>
          <span class="what">{entry.summary}</span>
          {#if entry.isTouchdown}<span class="tag td">TD</span>{/if}
          {#if entry.isInterception}<span class="tag int">INT</span>{/if}
          <span class="yards tabular" class:gain={entry.yards > 0} class:loss={entry.yards < 0}>
            {entry.yards > 0 ? '+' : ''}{entry.yards}
          </span>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .feed { padding: 0 12px 12px; }
  .header { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; }
  h2 {
    margin: 0; font-size: 0.7rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 1px; color: var(--t-text-muted);
  }
  .undo {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    min-height: 44px; min-width: 88px; padding: 8px 14px;
    border: 1.5px solid rgba(239, 68, 68, 0.3);
    background: var(--t-surface); color: var(--t-red);
    border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer;
  }
  .undo:disabled { opacity: 0.4; cursor: not-allowed; }
  ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  li {
    display: flex; align-items: baseline; gap: 8px;
    padding: 8px 0; border-bottom: 1px solid var(--t-border);
  }
  .seq { color: var(--t-text-muted); min-width: 2.6rem; font-size: 0.8rem; }
  .q { color: var(--t-text-muted); font-size: 0.7rem; }
  .what { flex: 1; }
  .yards { font-weight: 700; }
  .gain { color: var(--t-green); }
  .loss { color: var(--t-red); }
  .tag { font-size: 0.65rem; font-weight: 800; padding: 1px 5px; border-radius: 4px; }
  .td { background: var(--t-green); color: #06240f; }
  .int { background: var(--t-red); color: #fff; }
  .empty { color: var(--t-text-muted); }
</style>
