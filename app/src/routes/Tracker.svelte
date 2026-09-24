<script lang="ts">
  import { onMount } from 'svelte';
  import { getDb } from '../lib/db/context';
  import { setScores, setSidesSwapped } from '../lib/db/repositories/games';
  import type { Play, Player } from '../lib/db/repositories/types';
  import { GameTracker, type FeedEntry, type TrackerSnapshot } from '../lib/game/recordPlay';
  import type { GameCursor } from '../lib/game/cursor';
  import {
    applyDefaults, blankFormAt, defaultScrimmageKick, emptyDefaults, rememberPlayers,
    type DefaultsByTeam, type PlayForm, type PlayFormProps, type PlayFormType,
  } from '../lib/game/playForm';
  import type { Component } from 'svelte';
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

  /**
   * One view per play type. The template used to pick among them with a
   * seven-branch if/else, one more place a new play type had to be added.
   * Typed loosely here because a lookup cannot narrow `form` to the view's
   * own variant; each view is still checked against its own props where it
   * is written.
   */
  const FORM_VIEWS: Record<PlayFormType, Component<PlayFormProps<any>>> = {
    run: RunFormView,
    pass: PassFormView,
    penalty: PenaltyFormView,
    kickoff: KickoffFormView,
    punt: PuntFormView,
    field_goal: FieldGoalFormView,
    extra_point: ExtraPointFormView,
  };

  const gameId = $derived(numericParam(router.params, 'id'));
  /** This game's tracker. Stateless over the database, so deriving it is free. */
  const tracker = $derived(gameId === null ? null : new GameTracker(getDb(), gameId));

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
  let playbook = $state<Play[]>([]);
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
    if (tracker === null) {
      loadError = 'That game does not exist.';
      ready = true;
      return;
    }
    try {
      const loaded = await tracker.load();
      snapshot = loaded;
      cursor = loaded.cursor;
      teamScore = loaded.game.teamScore;
      opponentScore = loaded.game.opponentScore;
      sidesSwapped = loaded.game.sidesSwapped;
      defaults = loaded.defaults;
      feed = loaded.feed;
      roster = loaded.roster;
      playbook = loaded.playbook;
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
    if (cursor === null) return;
    form = applyDefaults(blankFormAt(type, cursor), defaults[cursor.possession]);
    panel = 'form';
  }

  /** Punt or field goal: a field goal once it is makeable, a punt before that. */
  function openKick() {
    if (cursor === null) return;
    openForm(defaultScrimmageKick(cursor.ballPosition, cursor.possession));
  }

  function cancelForm() {
    form = null;
    panel = 'grid';
  }

  async function save() {
    if (!form || cursor === null || tracker === null || busy) return;
    busy = true;
    try {
      const outcome = await tracker.record(cursor, form, roster);

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
    if (tracker === null || busy) return;
    busy = true;
    try {
      const outcome = await tracker.undo();
      defaults = await tracker.recentPlayers();
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
    if (gameId === null || tracker === null || cursor === null) return;
    const which = editing;
    editing = null;
    try {
      if (which === 'quarter') {
        // Crossing halftime restarts play with a kickoff, which the chain
        // then opens like any other.
        cursor = await tracker.changeQuarter(cursor, value);
        form = null;
        openChainedForm(cursor);
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
      <SpecialTeamsMenu situation={cursor.situation} onselect={openForm} onkick={openKick}
                        onback={() => (panel = 'grid')} />
    {:else if form}
      {@const View = FORM_VIEWS[form.type]}
      <View bind:form {roster} {playbook} {busy}
            possession={cursor.possession}
            ballPosition={cursor.ballPosition}
            defaults={defaults[cursor.possession]}
            onsave={save} oncancel={cancelForm} onswitch={openForm} />
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
  .error { color: var(--c-negative); }
  .warn {
    margin: 0; padding: 0.75rem 12px;
    background: color-mix(in srgb, var(--c-caution) 15%, transparent);
    color: var(--c-caution);
    border-bottom: 1px solid color-mix(in srgb, var(--c-caution) 35%, transparent);
  }
</style>
