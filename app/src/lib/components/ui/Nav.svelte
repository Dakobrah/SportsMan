<script lang="ts">
  import { href } from '../../router';
  import { router } from '../../router.svelte';

  const links = [
    { path: '/', label: 'Home' },
    { path: '/games', label: 'Games' },
    { path: '/teams', label: 'Teams' },
    { path: '/seasons', label: 'Seasons' },
    { path: '/playbook', label: 'Playbook' },
    { path: '/backup', label: 'Backup' },
  ];

  const isActive = (path: string) =>
    path === '/' ? router.path === '/' : router.path.startsWith(path);
</script>

<nav>
  <span class="brand">Sportsman</span>
  <ul>
    {#each links as link (link.path)}
      <li>
        <a href={href(link.path)} class:active={isActive(link.path)}>{link.label}</a>
      </li>
    {/each}
  </ul>
</nav>

<style>
  nav {
    display: flex;
    align-items: center;
    gap: var(--gap);
    padding: 0 var(--gap);
    background: var(--t-surface);
    border-bottom: 1px solid var(--t-border);
    position: sticky;
    top: 0;
    z-index: 50;
  }
  .brand {
    font-weight: 700;
    letter-spacing: 0.02em;
    padding: 0.75rem 0;
    color: var(--t-text);
  }
  ul {
    display: flex;
    gap: 2px;
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-x: auto;
  }
  a {
    display: block;
    padding: 0.85rem 0.75rem;
    color: var(--t-text-muted);
    white-space: nowrap;
    border-bottom: 2px solid transparent;
  }
  a:hover { color: var(--t-text); text-decoration: none; }
  a.active { color: var(--t-text); border-bottom-color: var(--t-blue); }
</style>
