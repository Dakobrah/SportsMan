<script lang="ts">
  import { onMount } from 'svelte';
  import type { Database } from './lib/db/driver';
  import { setDb } from './lib/db/context';
  import { start } from './lib/router.svelte';
  import { router } from './lib/router.svelte';
  import { routes } from './routes/routes';
  import Nav from './lib/components/ui/Nav.svelte';

  interface Props {
    /** Opens and prepares the database. Supplied by the entry point, so the
     *  desktop build never references the browser driver and vice versa. */
    boot: () => Promise<Database>;
  }
  let { boot }: Props = $props();

  type Phase = 'opening' | 'ready' | 'failed';

  let phase = $state<Phase>('opening');
  let failure = $state('');

  onMount(() => {
    let stop: (() => void) | undefined;

    // Routing starts immediately so a deep link is not lost while the
    // database opens.
    stop = start(routes);

    boot()
      .then((db) => {
        setDb(db);
        phase = 'ready';
      })
      .catch((error: unknown) => {
        failure = error instanceof Error ? error.message : String(error);
        phase = 'failed';
      });

    return () => stop?.();
  });

  const chrome = $derived(router.match?.route.chrome !== false);
  const Route = $derived(router.match?.route.component);
</script>

{#if phase === 'opening'}
  <div class="boot"><p>Opening database…</p></div>
{:else if phase === 'failed'}
  <div class="boot">
    <h1>Sportsman could not start</h1>
    <p class="detail">{failure}</p>
    <p class="detail">Your games are still on this device. Restarting the app is safe.</p>
  </div>
{:else}
  {#if chrome}<Nav />{/if}
  <main class:chrome>
    {#if Route}
      <Route />
    {:else}
      <p>No route matched {router.path}.</p>
    {/if}
  </main>
{/if}

<style>
  .boot {
    display: grid;
    place-content: center;
    gap: 0.5rem;
    min-height: 100dvh;
    padding: 2rem;
    text-align: center;
  }
  .detail { color: var(--t-text-muted); max-width: 32rem; margin: 0; }

  main.chrome {
    padding: var(--gap);
    max-width: 60rem;
    margin: 0 auto;
  }
</style>
