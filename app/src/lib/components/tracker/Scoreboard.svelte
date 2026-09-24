<script lang="ts">
  import FieldView from './FieldView.svelte';
  import type { GameCursor } from '../../game/cursor';

  interface Props {
    teamAbbr: string;
    opponent: string;
    teamScore: number;
    opponentScore: number;
    cursor: GameCursor;
    savedLabel: string;
    sidesSwapped: boolean;
    onback: () => void;
    onswapsides: () => void;
    oneditTeamScore: () => void;
    oneditOpponentScore: () => void;
    oneditQuarter: () => void;
  }
  let {
    teamAbbr, opponent, teamScore, opponentScore, cursor, savedLabel, sidesSwapped,
    onback, onswapsides, oneditTeamScore, oneditOpponentScore, oneditQuarter,
  }: Props = $props();

  const ordinal = (down: number) => ['', '1st', '2nd', '3rd', '4th'][down] ?? String(down);
  const situationLabel: Record<string, string> = {
    extra_point: 'EXTRA POINT',
    kickoff: 'KICKOFF',
    turnover: 'TURNOVER',
    turnover_on_downs: 'ON DOWNS',
    opponent_ball: 'THEIR BALL',
  };
</script>

<header class="scoreboard">
  <div class="topbar">
    <button class="back" onclick={onback} aria-label="Back to game">‹</button>
    <span class="live"><span class="dot"></span>LIVE</span>
    <button class="swap" onclick={onswapsides} title="Swap ends (halftime)">⇄ Ends</button>
    <span class="saved">{savedLabel}</span>
  </div>

  <div class="main">
    <button class="side" onclick={oneditTeamScore}>
      <span class="abbr">
        {teamAbbr}
        <span class="pip" class:on={cursor.possession === 'us'} aria-label={cursor.possession === 'us' ? 'has the ball' : ''}></span>
      </span>
      <span class="score tabular">{teamScore}</span>
    </button>

    <div class="middle">
      <button class="quarter" onclick={oneditQuarter}>Q{cursor.quarter}</button>
      {#if cursor.down !== null && cursor.distance !== null}
        <span class="down tabular">{ordinal(cursor.down)} &amp; {cursor.distance}</span>
      {:else}
        <span class="down situation">{situationLabel[cursor.situation] ?? ''}</span>
      {/if}
    </div>

    <button class="side" onclick={oneditOpponentScore}>
      <span class="abbr">
        {opponent}
        <span class="pip" class:on={cursor.possession === 'them'} aria-label={cursor.possession === 'them' ? 'has the ball' : ''}></span>
      </span>
      <span class="score tabular">{opponentScore}</span>
    </button>
  </div>

  <FieldView
    ballPosition={cursor.ballPosition}
    possession={cursor.possession}
    {teamAbbr} {opponent}
    swapped={sidesSwapped}
  />
</header>

<style>
  .scoreboard {
    position: sticky; top: 0; z-index: 100;
    background: linear-gradient(180deg, var(--c-scoreboard-top) 0%, var(--c-scoreboard-bottom) 100%);
    color: var(--c-ink-light);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    padding-top: env(safe-area-inset-top);
  }
  .topbar {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 4px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .back {
    background: none; border: none; color: var(--c-ink-light);
    font-size: 1.8rem; line-height: 1;
    min-width: var(--tap); min-height: var(--tap); cursor: pointer;
  }
  .live {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 0.65rem; font-weight: 800; letter-spacing: 0.1em;
    color: var(--c-negative);
  }
  .dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--c-negative); animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
  @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
  .saved {
    font-size: 0.7rem; color: var(--t-text-muted);
    font-variant-numeric: tabular-nums;
  }
  .swap {
    margin-left: auto;
    background: rgba(255, 255, 255, 0.08); border: none; color: var(--c-ink-light);
    border-radius: 999px; padding: 0 10px; margin-right: 8px;
    font-size: 0.65rem; font-weight: 700; letter-spacing: 0.04em;
    min-height: 32px; cursor: pointer;
  }
  .pip {
    display: inline-block; width: 6px; height: 6px; border-radius: 50%;
    background: transparent; margin-left: 3px; vertical-align: middle;
  }
  .pip.on { background: var(--c-ball); box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.5); }

  .main { display: flex; align-items: center; justify-content: space-between; padding: 2px 8px 8px; }
  .side {
    background: none; border: none; color: var(--c-ink-light); cursor: pointer;
    display: grid; justify-items: center; gap: 0;
    min-width: 5.5rem; min-height: var(--tap);
  }
  .abbr { font-size: 0.75rem; font-weight: 700; color: var(--t-text-muted); letter-spacing: 0.06em; }
  .score { font-size: 2.4rem; font-weight: 800; line-height: 1; }
  .middle { display: grid; justify-items: center; gap: 4px; }
  .quarter {
    background: rgba(255, 255, 255, 0.08); border: none; color: var(--c-ink-light);
    border-radius: 999px; padding: 4px 12px; font-weight: 800; font-size: 0.8rem;
    min-height: 34px; cursor: pointer;
  }
  .down { font-size: 1rem; font-weight: 700; }
  .down.situation { color: var(--c-caution); font-size: 0.85rem; letter-spacing: 0.06em; }
</style>
