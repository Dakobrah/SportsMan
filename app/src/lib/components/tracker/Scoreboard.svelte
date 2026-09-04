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
    onback: () => void;
    oneditTeamScore: () => void;
    oneditOpponentScore: () => void;
    oneditQuarter: () => void;
  }
  let {
    teamAbbr, opponent, teamScore, opponentScore, cursor, savedLabel,
    onback, oneditTeamScore, oneditOpponentScore, oneditQuarter,
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
    <span class="saved">{savedLabel}</span>
  </div>

  <div class="main">
    <button class="side" onclick={oneditTeamScore}>
      <span class="abbr">{teamAbbr}</span>
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
      <span class="abbr">{opponent}</span>
      <span class="score tabular">{opponentScore}</span>
    </button>
  </div>

  <FieldView ballPosition={cursor.ballPosition} />
</header>

<style>
  .scoreboard {
    position: sticky; top: 0; z-index: 100;
    background: linear-gradient(180deg, #0d0f18 0%, #141625 100%);
    color: #fff;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    padding-top: env(safe-area-inset-top);
  }
  .topbar {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 4px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .back {
    background: none; border: none; color: #fff;
    font-size: 1.8rem; line-height: 1;
    min-width: var(--tap); min-height: var(--tap); cursor: pointer;
  }
  .live {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 0.65rem; font-weight: 800; letter-spacing: 0.1em;
    color: var(--t-red);
  }
  .dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--t-red); animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
  @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
  .saved {
    margin-left: auto; font-size: 0.7rem; color: var(--t-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .main { display: flex; align-items: center; justify-content: space-between; padding: 2px 8px 8px; }
  .side {
    background: none; border: none; color: #fff; cursor: pointer;
    display: grid; justify-items: center; gap: 0;
    min-width: 5.5rem; min-height: var(--tap);
  }
  .abbr { font-size: 0.75rem; font-weight: 700; color: var(--t-text-muted); letter-spacing: 0.06em; }
  .score { font-size: 2.4rem; font-weight: 800; line-height: 1; }
  .middle { display: grid; justify-items: center; gap: 4px; }
  .quarter {
    background: rgba(255, 255, 255, 0.08); border: none; color: #fff;
    border-radius: 999px; padding: 4px 12px; font-weight: 800; font-size: 0.8rem;
    min-height: 34px; cursor: pointer;
  }
  .down { font-size: 1rem; font-weight: 700; }
  .down.situation { color: var(--t-amber); font-size: 0.85rem; letter-spacing: 0.06em; }
</style>
