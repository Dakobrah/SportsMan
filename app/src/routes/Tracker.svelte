<script lang="ts">
  // Chunk 9. The write path it will drive (recordPlay/undoLastPlay/
  // loadTracker) is already complete and tested.
  import { href, numericParam } from '../lib/router';
  import { router } from '../lib/router.svelte';
  const id = $derived(numericParam(router.params, 'id'));
</script>

<div class="placeholder">
  <h1>Tracker</h1>
  <p class="muted">Not built yet.</p>
  {#if id !== null}<a class="btn" href={href(`/games/${id}`)}>Back to game</a>{/if}
</div>

<style>
  .placeholder { display: grid; gap: 0.6rem; justify-items: center; padding: 3rem 1rem; }
</style>
