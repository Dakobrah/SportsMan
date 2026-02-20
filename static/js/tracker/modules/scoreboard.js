/**
 * scoreboard.js — Non-runtime reference module.
 * Extracted from tracker.js for documentation/migration purposes.
 * Exposes: window.TrackerModules.scoreboard
 *
 * In the runtime tracker.js these functions close over the module-scope `state`
 * and sibling functions. Here they accept explicit parameters so they can be
 * tested or composed independently.
 */
(function () {
    'use strict';

    // -------------------------------------------------------------------------
    // TOAST
    // -------------------------------------------------------------------------
    /**
     * showToast(message, type)
     *   Remove any existing .tracker-toast, build a new one, append to body,
     *   and auto-remove after 2200 ms.
     *   type: 'success' | 'error' | undefined
     */
    function showToast(message, type) {
        const existing = document.querySelector('.tracker-toast');
        if (existing) existing.remove();

        const icons = {
            success: '<i class="bi bi-check-circle-fill"></i>',
            error: '<i class="bi bi-exclamation-triangle-fill"></i>',
        };

        const toast = document.createElement('div');
        toast.className = 'tracker-toast' + (type ? ' ' + type : '');
        toast.innerHTML = (icons[type] || '') + ' ' + message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2200);
    }

    // -------------------------------------------------------------------------
    // SCOREBOARD
    // -------------------------------------------------------------------------
    /**
     * updateScoreboard(state, updateFieldViz)
     *   Sync #team-score, #opp-score, #quarter-display, #down-display,
     *   #distance-display, #down-distance-bar visibility, then call updateFieldViz.
     */
    function updateScoreboard(state, updateFieldViz) {
        document.getElementById('team-score').textContent = state.team_score;
        document.getElementById('opp-score').textContent = state.opponent_score;

        const qText = state.quarter <= 4 ? 'Q' + state.quarter : 'OT';
        document.getElementById('quarter-display').textContent = qText;

        const ddBar = document.getElementById('down-distance-bar');
        if (state.down) {
            const suffixes = { 1: 'st', 2: 'nd', 3: 'rd', 4: 'th' };
            document.getElementById('down-display').textContent =
                state.down + (suffixes[state.down] || 'th');
            document.getElementById('distance-display').textContent =
                state.distance || 10;
            ddBar.style.display = '';
        } else {
            ddBar.style.display = 'none';
        }

        if (updateFieldViz) updateFieldViz(state);
    }

    // -------------------------------------------------------------------------
    // POSSESSION DISPLAY
    // -------------------------------------------------------------------------
    /**
     * updatePossessionDisplay(state)
     *   Show #play-type-buttons-offense when possession_team === 'home',
     *   else show #play-type-buttons-defense.
     */
    function updatePossessionDisplay(state) {
        const isOnOffense = state.possession_team === 'home';
        const offenseButtons = document.getElementById('play-type-buttons-offense');
        const defenseButtons = document.getElementById('play-type-buttons-defense');

        if (offenseButtons) {
            offenseButtons.classList.toggle('hidden', !isOnOffense);
        }
        if (defenseButtons) {
            defenseButtons.classList.toggle('hidden', isOnOffense);
        }
    }

    // -------------------------------------------------------------------------
    // SCORE / QUARTER EDIT
    // -------------------------------------------------------------------------
    /**
     * promptScoreEdit(which, state, GAME_ID, TEAM_ABBR, OPPONENT,
     *                 getCSRFToken, updateScoreboard, showToast)
     *   Prompt user for new score, POST to /games/<GAME_ID>/tracker/update-score/,
     *   update state.team_score / state.opponent_score on success.
     *   which: 'team' | 'opponent'
     */
    function promptScoreEdit(which, state, GAME_ID, TEAM_ABBR, OPPONENT,
                             getCSRFToken, updateScoreboardFn, showToastFn) {
        const current = which === 'team' ? state.team_score : state.opponent_score;
        const label = which === 'team' ? TEAM_ABBR : OPPONENT;
        const newScore = prompt(`${label} score:`, current);
        if (newScore === null) return;
        const val = parseInt(newScore);
        if (isNaN(val) || val < 0) return;

        const payload = {};
        payload[which === 'team' ? 'team_score' : 'opponent_score'] = val;

        fetch(`/games/${GAME_ID}/tracker/update-score/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken(),
            },
            body: JSON.stringify(payload),
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                state.team_score = data.team_score;
                state.opponent_score = data.opponent_score;
                updateScoreboardFn(state);
                showToastFn('Score updated', 'success');
            }
        });
    }

    /**
     * promptQuarterChange(state, updateScoreboard, showToast)
     *   Prompt user for quarter (1–9), update state.quarter, refresh scoreboard.
     */
    function promptQuarterChange(state, updateScoreboardFn, showToastFn) {
        const q = prompt('Quarter (1-4, 5 for OT):', state.quarter);
        if (q === null) return;
        const val = parseInt(q);
        if (isNaN(val) || val < 1 || val > 9) return;
        state.quarter = val;
        updateScoreboardFn(state);
        showToastFn('Quarter updated', 'success');
    }

    // -------------------------------------------------------------------------
    // EXPORT
    // -------------------------------------------------------------------------
    window.TrackerModules = window.TrackerModules || {};
    window.TrackerModules.scoreboard = {
        showToast,
        updateScoreboard,
        updatePossessionDisplay,
        promptScoreEdit,
        promptQuarterChange,
    };
})();
