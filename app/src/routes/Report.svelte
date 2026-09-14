<script lang="ts">
  import { getDb } from '../lib/db/context';
  import { templateById } from '../lib/reports/templates';
  import { scopeFromQuery } from '../lib/reports/scope';
  import type { TemplateId } from '../lib/reports/model';
  import { resource } from '../lib/data.svelte';
  import { href } from '../lib/router';
  import { router } from '../lib/router.svelte';
  import Loader from '../lib/components/ui/Loader.svelte';
  import Block from '../lib/components/reports/Block.svelte';

  const id = $derived(router.params.templateId as TemplateId | undefined);

  const view = resource(async () => {
    const template = id ? templateById(id) : undefined;
    if (!template) return null;
    const scope = scopeFromQuery(template.id, router.query);
    if (!scope) return null;
    return { template, model: await template.build(getDb(), scope) };
  });
</script>

<Loader
  loading={view.loading} error={view.error} empty={view.data === null}
  emptyText="That report does not exist, or its link is missing something."
>
  {#snippet emptyAction()}
    <a class="btn btn-primary" href={href('/reports')}>Back to reports</a>
  {/snippet}

  {#if view.data}
    {@const model = view.data.model}
    <header class="head">
      <div>
        <h1>{model.title}</h1>
        <p class="muted">{model.subtitle} · {view.data.template.name}</p>
      </div>
      {#if model.headline}
        <div class="headline">
          <span class="muted">{model.headline.label}</span>
          <strong class="tabular">{model.headline.value}</strong>
        </div>
      {/if}
    </header>

    {#each model.sections as section (section.id)}
      <section>
        <h2>{section.title}</h2>
        <div class="stack">
          {#each section.blocks as block, i (i)}
            <Block {block} />
          {/each}
        </div>
      </section>
    {/each}

    <p class="muted small">
      Generated {new Date(model.generatedAt).toLocaleString()} on this device.
      Nothing here left it.
    </p>
  {/if}
</Loader>

<style>
  .head {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: var(--gap); flex-wrap: wrap; margin-bottom: var(--gap);
  }
  .head h1 { margin: 0; }
  .head p { margin: 0.2rem 0 0; }
  .headline { display: grid; justify-items: end; }
  .headline strong { font-size: 2.2rem; line-height: 1; }
  section { margin-bottom: 1.75rem; }
  section h2 {
    font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px;
    color: var(--t-text-muted); border-bottom: 1px solid var(--t-border);
    padding-bottom: 0.35rem; margin-bottom: var(--gap);
  }
  .small { font-size: 0.8rem; }

  /* A printed report shows everything, and none of the app around it. */
  @media print {
    section { break-inside: avoid; }
  }
</style>
