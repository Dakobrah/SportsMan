<script lang="ts">
  import { getDb } from '../lib/db/context';
  import { buildBackup, restoreBackup } from '../lib/backup/backup';
  import { openBackup, saveBackup } from '../lib/backup/files';
  import { BACKUP_TABLES, BackupFormatError, type BackupDocument } from '../lib/backup/format';
  import { describeError, resource } from '../lib/data.svelte';
  import { push } from '../lib/ui/toasts.svelte';
  import Loader from '../lib/components/ui/Loader.svelte';
  import ConfirmDialog from '../lib/components/ui/ConfirmDialog.svelte';

  const APP_VERSION = '0.1.0';

  /** What is in the database right now. */
  const view = resource(async () => buildBackup(getDb(), APP_VERSION));

  let busy = $state(false);
  let pending = $state<BackupDocument | null>(null);

  const LABELS: Record<string, string> = {
    teams: 'Teams', seasons: 'Seasons', players: 'Players', games: 'Games',
    quarter_scores: 'Quarter scores', plays: 'Plays', snaps: 'Recorded plays',
    defense_assists: 'Defensive assists',
  };

  async function run(work: () => Promise<string>) {
    busy = true;
    try {
      push(await work());
      await view.reload();
    } catch (error) {
      const message = error instanceof BackupFormatError && error.detail
        ? `${error.message} ${error.detail}`
        : describeError(error);
      push(message, 'error');
    } finally {
      busy = false;
    }
  }

  const exportNow = () =>
    run(async () => {
      const { path } = await saveBackup(getDb(), APP_VERSION);
      return path ? `Saved to ${path}` : 'Export cancelled.';
    });

  const chooseFile = () =>
    run(async () => {
      const doc = await openBackup();
      if (!doc) return 'Restore cancelled.';
      pending = doc;
      return `Read ${doc.counts.snaps} recorded plays. Confirm to restore.`;
    });

  const confirmRestore = () => {
    const doc = pending;
    pending = null;
    if (!doc) return;
    return run(async () => {
      const report = await restoreBackup(getDb(), doc);
      return `Restored ${report.total} rows.`;
    });
  };

  const rows = $derived(
    view.data
      ? BACKUP_TABLES.map((t) => ({ table: t, label: LABELS[t] ?? t, count: view.data!.counts[t] }))
      : [],
  );
  const total = $derived(rows.reduce((sum, r) => sum + r.count, 0));
</script>

<h1>Backup</h1>

<p class="muted lead">
  Everything you record lives in one file on this device. Nothing is sent
  anywhere, which also means nothing is kept anywhere else — so a backup is
  the only copy of a season that survives a lost or replaced phone.
</p>

<Loader loading={view.loading} error={view.error}>
  <div class="card">
    <h2>In this database</h2>
    <div class="scroll-x">
      <table class="data">
        <tbody>
          {#each rows as row (row.table)}
            <tr><td>{row.label}</td><td class="tabular right">{row.count}</td></tr>
          {/each}
          <tr class="total"><td>Total rows</td><td class="tabular right">{total}</td></tr>
        </tbody>
      </table>
    </div>
    {#if view.data}
      <p class="muted small">Schema version {view.data.schemaVersion}</p>
    {/if}
  </div>

  <div class="grid-2">
    <div class="card stack">
      <h2>Save a backup</h2>
      <p class="muted small">
        Writes a single JSON file you can keep anywhere — another device, a
        drive, an email to yourself.
      </p>
      <button class="btn btn-primary" onclick={exportNow} disabled={busy || total === 0}>
        Save backup…
      </button>
    </div>

    <div class="card stack">
      <h2>Restore</h2>
      <p class="muted small">
        <strong>Replaces everything</strong> in this database with the
        backup's contents. Use it on a new device, or to undo a bad import.
      </p>
      <button class="btn btn-danger" onclick={chooseFile} disabled={busy}>
        Choose a backup…
      </button>
    </div>
  </div>
</Loader>

<ConfirmDialog
  open={pending !== null}
  title="Restore this backup"
  confirmLabel="Replace everything"
  onconfirm={confirmRestore}
  oncancel={() => (pending = null)}
>
  {#if pending}
    <p>
      Replace all {total} rows in this database with {
        BACKUP_TABLES.reduce((sum, t) => sum + pending!.counts[t], 0)
      } from the backup?
    </p>
    <p class="muted">
      Taken {pending.exportedAt ? new Date(pending.exportedAt).toLocaleString() : 'at an unknown time'},
      containing {pending.counts.games} games and {pending.counts.snaps} recorded plays.
    </p>
    <p class="muted">This cannot be undone. Save a backup first if you are unsure.</p>
  {/if}
</ConfirmDialog>

<style>
  .lead { max-width: 44rem; }
  .small { font-size: 0.85rem; }
  .right { text-align: right; }
  .total td { font-weight: 700; border-top: 2px solid var(--t-border); }
  h2 { margin-top: 0; }
</style>
