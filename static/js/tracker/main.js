/**
 * Live Game Tracker — entry point.
 *
 * Wires the modules together, binds top-level events, performs the initial
 * render from the server-seeded state, and starts the polling loop.
 * With ?view=1 the page runs as a read-only live viewer.
 */
import { app, state, adoptServerState, VIEWER_MODE, TEAM_ABBR, OPPONENT } from './state.js';
import { postJSON } from './api.js';
import { showToast, makeInteractive } from './ui.js';
import { updateScoreboard, updateFieldViz } from './field.js';
import {
    showPlayForm, resetToPlayTypeSelection, updatePossessionDisplay,
    handleFormInteraction,
} from './forms.js';
import { showCoinTossModal, showTeamTdModal, showOpponentTdModal } from './modals.js';
import { initFlow, setPollTrigger, resumePhase, undoLastPlay } from './flow.js';
import { startPolling, pollOnce } from './poll.js';

if (app) {
    init();
}

function init() {
    initFlow({ showPlayForm, resetToPlayTypeSelection, showTeamTdModal, showOpponentTdModal });
    setPollTrigger(pollOnce);

    if (VIEWER_MODE) {
        initViewer();
    } else {
        initOperator();
    }

    updateScoreboard();
    updateFieldViz();
    startPolling();
}

function initViewer() {
    // Read-only: no play entry, no undo, no score/quarter edits.
    document.getElementById('main-content').classList.add('hidden');
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) undoBtn.classList.add('hidden');

    const badge = document.getElementById('viewer-badge');
    if (badge) badge.classList.remove('hidden');

    // The feed still matters to a viewer — move it out of the hidden main area.
    const recent = document.querySelector('.recent-section');
    const scoreboard = document.getElementById('scoreboard');
    if (recent && scoreboard) {
        scoreboard.insertAdjacentElement('afterend', recent);
    }
}

function initOperator() {
    // Play type buttons
    document.querySelectorAll('.play-btn').forEach(btn => {
        btn.addEventListener('click', () => showPlayForm(btn.dataset.type));
        makeInteractive(btn);
    });

    // Special teams submenu
    document.querySelectorAll('.st-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.st === 'back') { resetToPlayTypeSelection(); return; }
            showPlayForm(btn.dataset.st);
        });
        makeInteractive(btn);
    });

    // Undo
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
        undoBtn.addEventListener('click', undoLastPlay);
        makeInteractive(undoBtn);
    }

    // Score / quarter taps
    const teamScoreEl = document.getElementById('team-score');
    const oppScoreEl = document.getElementById('opp-score');
    const quarterEl = document.getElementById('quarter-display');
    if (teamScoreEl) {
        teamScoreEl.addEventListener('click', () => promptScoreEdit('team'));
        makeInteractive(teamScoreEl);
    }
    if (oppScoreEl) {
        oppScoreEl.addEventListener('click', () => promptScoreEdit('opponent'));
        makeInteractive(oppScoreEl);
    }
    if (quarterEl) {
        quarterEl.addEventListener('click', promptQuarterChange);
        makeInteractive(quarterEl);
    }

    // Delegated form-area events (click only — touchstart would double-fire).
    const playFormArea = document.getElementById('play-form-area');
    if (playFormArea) {
        playFormArea.addEventListener('click', handleFormInteraction);
    }

    updatePossessionDisplay();

    // Land back in the right phase: coin toss for a fresh game, otherwise
    // whatever GameState says was in progress (kickoff, XP, opponent PAT...).
    if (!state.coin_toss_complete) {
        showCoinTossModal();
    } else {
        resumePhase();
    }
}

// =========================================================================
// SCORE / QUARTER EDIT PROMPTS
// =========================================================================

async function promptScoreEdit(which) {
    const current = which === 'team' ? state.team_score : state.opponent_score;
    const label = which === 'team' ? TEAM_ABBR : OPPONENT;
    const newScore = prompt(`${label} score:`, current);
    if (newScore === null) return;
    const val = parseInt(newScore);
    if (isNaN(val) || val < 0) return;

    const payload = {};
    payload[which === 'team' ? 'team_score' : 'opponent_score'] = val;

    try {
        const { body } = await postJSON('update-score', payload);
        if (body.success) {
            adoptServerState(body.state);
            state.team_score = body.team_score;
            state.opponent_score = body.opponent_score;
            updateScoreboard();
            showToast('Score updated', 'success');
        } else {
            showToast(body.error || 'Score update failed', 'error');
        }
    } catch (err) {
        showToast('Network error — score not saved', 'error');
    }
}

async function promptQuarterChange() {
    const q = prompt('Quarter (1-4, 5 for OT):', state.quarter);
    if (q === null) return;
    const val = parseInt(q);
    if (isNaN(val) || val < 1 || val > 9) return;

    try {
        const { body } = await postJSON('update-quarter', { quarter: val });
        if (body.success) {
            adoptServerState(body.state);
            updateScoreboard();
            showToast('Quarter updated', 'success');
        } else {
            showToast(body.error || 'Quarter update failed', 'error');
        }
    } catch (err) {
        showToast('Network error — quarter not saved', 'error');
    }
}
