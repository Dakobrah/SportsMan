<script lang="ts">
  import { onMount } from 'svelte';
  import { getDb } from '../lib/db/context';
  import { setScores, setSidesSwapped, writeGameCursor } from '../lib/db/repositories/games';
  import type { Player } from '../lib/db/repositories/types';
  import {
    loadTracker, recentPlayers, recordPlay, undoLastPlay,
    type FeedEntry, type TrackerSnapshot,
  } from '../lib/game/recordPlay';
  import type { GameCursor } from '../lib/game/cursor';
  import {
    applyDefaults, blankForm, emptyDefaults, rememberPlayers,
    type DefaultsByTeam, type PlayForm, type PlayFormType,
  } from '../lib/game/playForm';
  import { FEED_LIMIT } from '../lib/game/recordPlay';
  import { describeError } from '../lib/data.svelte';
  import { push } from '../lib/ui/toasts.svelte';
  import { numericParam } from '../lib/router';
  import { navigate, router } from '../lib/router.svelte';

  import Scoreboard from '../lib/components/tracker/Scoreboard.svelte';
  import PlayTypeGrid from '../lib/components/tracker/PlayTypeGrid.svelte';
  import SpecialTeamsMenu from '../lib/components/tracker/SpecialTeamsMenu.svelte';
  import PlayFeed from '../lib/components/tracker/PlayFeed.svelte';
  import Toast from '../lib/components/ui/Toast.svelte';
  import ConfirmDialog from '../lib/components/ui/ConfirmDialog.svelte';
  import PromptDialog from '../lib/components/ui/PromptDialog.svelte';

  import RunFormView from '../lib/components/tracker/forms/RunForm.svelte';
  import PassFormView from '../lib/components/tracker/forms/PassForm.svelte';
  import PenaltyFormView from '../lib/components/tracker/forms/PenaltyForm.svelte';
  import KickoffFormView from '../lib/components/tracker/forms/KickoffForm.svelte';
  import PuntFormView from '../lib/components/tracker/forms/PuntForm.svelte';
  import FieldGoalFormView from '../lib/components/tracker/forms/FieldGoalForm.svelte';
  import ExtraPointFormView from '../lib/components/tracker/forms/ExtraPointForm.svelte';

  const gameId = $derived(numericParam(router.params, 'id'));

  type Panel = 'grid' | 'special-teams' | 'form';

  let ready = $state(false);
  let loadError = $state('');
  let snapshot = $state<TrackerSnapshot | null>(null);

  // A mirror of the durable state, updated from recordPlay's return value.
  // The database stays the truth; this exists so a play does not cost a
  // re-query on the sideline.
  let cursor = $state<GameCursor | null>(null);
  let teamScore = $state(0);
  let opponentScore = $state(0);
  let feed = $state<FeedEntry[]>([]);
  let roster = $state<Player[]>([]);
  let sidesSwapped = $state(false);
  // Who last filled each role, per side, so the quarterback and kicker do not
  // have to be re-entered every play. Loaded from the plays already recorded,
  // so it survives a reload like everything else here.
  let defaults = $state<DefaultsByTeam>(emptyDefaults());

  let panel = $state<Panel>('grid');
  let form = $state<PlayForm | null>(null);
  let busy = $state(false);
  let savedLabel = $state('');

  let confirmUndo = $state(false);
  let editing = $state<'team' | 'opponent' | 'quarter' | null>(null);

  onMount(async () => {
    if (gameId === null) {
      loadError = 'That game does not exist.';
      ready = true;
      return;
    }
    try {
      const loaded = await loadTracker(getDb(), gameId);
      snapshot = loaded;
      cursor = loaded.cursor;
      teamScore = loaded.game.teamScore;
      opponentScore = loaded.game.opponentScore;
      sidesSwapped = loaded.game.sidesSwapped;
      defaults = loaded.defaults;
      feed = loaded.feed;
      roster = loaded.roster;
      openChainedForm(loaded.cursor);
    } catch (error) {
      loadError = describeError(error);
    } finally {
      ready = true;
    }
  });

  /**
   * The auto-chain. Django reacted to next_state.situation off the response
   * and used a 300ms setTimeout; here the situation is durable, so a reload
   * mid-chain reopens the same form instead of dropping the coach on the grid.
   */
  function openChainedForm(next: GameCursor) {
    if (next.situation === 'extra_point') openForm('extra_point');
    else if (next.situation === 'kickoff') openForm('kickoff');
    else panel = 'grid';
  }

  function openForm(type: PlayFormType) {
    const side = cursor?.possession ?? 'us';
    form = applyDefaults(blankForm(type), defaults[side]);
    panel = 'form';
  }

  function cancelForm() {
    form = null;
    panel = 'grid';
  }

  async function save() {
    if (!form || cursor === null || gameId === null || busy) return;
    busy = true;
    try {
      const outcome = await recordPlay(getDb(), gameId, cursor, form, roster);

      // Remember the players against the side that ran the play, not the
      // side that has the ball afterwards -- a turnover changes that.
      const side = cursor.possession;
      defaults = { ...defaults, [side]: rememberPlayers(defaults[side], form) };

      cursor = outcome.cursor;
      teamScore = outcome.teamScore;
      opponentScore = outcome.opponentScore;
      feed = [outcome.entry, ...feed].slice(0, FEED_LIMIT);
      savedLabel = `#${outcome.sequenceNumber} saved ${clock()}`;

      push('Play saved');
      form = null;
      openChainedForm(outcome.cursor);
    } catch (error) {
      // Errors persist until dismissed; a bad run should all stay readable.
      push(describeError(error), 'error');
    } finally {
      busy = false;
    }
  }

  async function undo() {
    confirmUndo = false;
    if (gameId === null || busy) return;
    busy = true;
    try {
      const outcome = await undoLastPlay(getDb(), gameId);
      defaults = await recentPlayers(getDb(), gameId);
      cursor = outcome.cursor;
      teamScore = outcome.teamScore;
      opponentScore = outcome.opponentScore;
      feed = feed.filter((entry) => entry.id !== outcome.removed.id);
      savedLabel = `#${outcome.removed.sequenceNumber} undone ${clock()}`;
      push('Play undone');
      form = null;
      panel = 'grid';
    } catch (error) {
      push(describeError(error), 'error');
    } finally {
      busy = false;
    }
  }

  async function applyEdit(value: number) {
    if (gameId === null || cursor === null) return;
    const which = editing;
    editing = null;
    try {
      if (which === 'quarter') {
        // Persisted immediately. Django kept this client-side only, so a
        // reload before the next play lost it.
        cursor = { ...cursor, quarter: value };
        await writeGameCursor(getDb(), gameId, cursor);
      } else if (which === 'team') {
        await setScores(getDb(), gameId, { teamScore: value });
        teamScore = value;
      } else if (which === 'opponent') {
        await setScores(getDb(), gameId, { opponentScore: value });
        opponentScore = value;
      }
    } catch (error) {
      push(describeError(error), 'error');
    }
  }

  /** Teams change ends at halftime. Presentation only -- no coordinate moves. */
  async function swapSides() {
    if (gameId === null) return;
    sidesSwapped = !sidesSwapped;
    try {
      await setSidesSwapped(getDb(), gameId, sidesSwapped);
      push(sidesSwapped ? 'Ends swapped' : 'Ends restored');
    } catch (error) {
      sidesSwapped = !sidesSwapped;
      push(describeError(error), 'error');
    }
  }

  const clock = () =>
    new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const editValue = $derived(
    editing === 'quarter' ? (cursor?.quarter ?? 1)
      : editing === 'team' ? teamScore
      : opponentScore,
  );
</script>

{#if !ready}
  <p class="centre">Loading…</p>
{:else if loadError}
  <div class="centre stack">
    <p class="error">{loadError}</p>
    <button class="btn" onclick={() => navigate('/games')}>Back to games</button>
  </div>
{:else if snapshot && cursor}
  <!-- Captured so the narrowing survives into the event handlers below. -->
  {@const game = snapshot.game}
  {@const team = snapshot.team}
  <div class="tracker">
    <Scoreboard
      teamAbbr={team.abbreviation}
      opponent={game.opponent}
      {teamScore} {opponentScore} {cursor} {savedLabel} {sidesSwapped}
      onback={() => navigate(`/games/${game.id}`)}
      onswapsides={swapSides}
      oneditTeamScore={() => (editing = 'team')}
      oneditOpponentScore={() => (editing = 'opponent')}
      oneditQuarter={() => (editing = 'quarter')}
    />

    {#if roster.length === 0}
      <p class="warn">
        This team has no active players, so plays cannot be attributed.
        Add a roster first.
      </p>
    {/if}

    {#if panel === 'grid'}
      <PlayTypeGrid onselect={openForm} onspecialteams={() => (panel = 'special-teams')} />
    {:else if panel === 'special-teams'}
      <SpecialTeamsMenu onselect={openForm} onback={() => (panel = 'grid')} />
    {:else if form}
      {#if form.type === 'run'}
        <RunFormView bind:form {roster} possession={cursor.possession} {busy} onsave={save} oncancel={cancelForm} />
      {:else if form.type === 'pass'}
        <PassFormView bind:form {roster} possession={cursor.possession}
                       defaults={defaults[cursor.possession]} {busy} onsave={save} oncancel={cancelForm} />
      {:else if form.type === 'penalty'}
        <PenaltyFormView bind:form {busy} onsave={save} oncancel={cancelForm} />
      {:else if form.type === 'kickoff'}
        <KickoffFormView bind:form {roster} possession={cursor.possession}
                       defaults={defaults[cursor.possession]} {busy} onsave={save} oncancel={cancelForm} />
      {:else if form.type === 'punt'}
        <PuntFormView bind:form {roster} possession={cursor.possession}
                       defaults={defaults[cursor.possession]} {busy} onsave={save} oncancel={cancelForm} />
      {:else if form.type === 'field_goal'}
        <FieldGoalFormView bind:form {roster} possession={cursor.possession}
                       defaults={defaults[cursor.possession]} {busy} onsave={save} oncancel={cancelForm} />
      {:else if form.type === 'extra_point'}
        <ExtraPointFormView bind:form {roster} possession={cursor.possession}
                       defaults={defaults[cursor.possession]} {busy} onsave={save} oncancel={cancelForm} />
      {/if}
    {/if}

    <PlayFeed entries={feed} {busy} onundo={() => (confirmUndo = true)} />
  </div>

  <ConfirmDialog
    open={confirmUndo}
    title="Undo last play"
    confirmLabel="Undo"
    onconfirm={undo}
    oncancel={() => (confirmUndo = false)}
  >
    <p>Remove play #{feed[0]?.sequenceNumber} — {feed[0]?.summary}?</p>
    <p class="muted">Any points it scored come back off too.</p>
  </ConfirmDialog>

  <PromptDialog
    open={editing !== null}
    title={editing === 'quarter'
      ? 'Set quarter'
      : editing === 'team'
        ? `${team.abbreviation} score`
        : `${game.opponent} score`}
    value={editValue}
    min={editing === 'quarter' ? 1 : 0}
    max={editing === 'quarter' ? 9 : 199}
    onsubmit={applyEdit}
    oncancel={() => (editing = null)}
  />
{/if}

<Toast />

<style>
  .tracker { min-height: 100dvh; background: var(--t-bg); }
  .centre { display: grid; place-content: center; min-height: 60dvh; gap: 1rem; padding: 2rem; text-align: center; }
  .error { color: var(--t-red); }
  .warn {
    margin: 0; padding: 0.75rem 12px;
    background: color-mix(in srgb, var(--t-amber) 15%, transparent);
    color: var(--t-amber);
    border-bottom: 1px solid color-mix(in srgb, var(--t-amber) 35%, transparent);
  }
</style>
