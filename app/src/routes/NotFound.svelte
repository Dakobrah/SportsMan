<script lang="ts">
  import { href } from '../lib/router';
  import { router } from '../lib/router.svelte';
</script>

<h1>Not found</h1>
<p class="muted">Nothing lives at <code>{router.path}</code>.</p>
<p><a class="btn" href={href('/')}>Go home</a></p>
