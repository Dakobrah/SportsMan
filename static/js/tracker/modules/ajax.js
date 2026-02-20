(function () {
    'use strict';

    function getCSRFToken() {
        const el = document.querySelector('[name=csrfmiddlewaretoken]');
        if (el) return el.value;
        const match = document.cookie.match(/csrftoken=([^;]+)/);
        return match ? match[1] : '';
    }

    async function postPlay(endpoint, data, GAME_ID, state, showToast, updateScoreboard, addPlayToFeed, resetToPlayTypeSelection, showPlayForm) {
        if (state.submitting) return null;
        state.submitting = true;

        const formArea = document.getElementById('play-form-area');
        if (formArea) formArea.classList.add('form-loading');

        const payload = {
            quarter: state.quarter,
            down: state.down,
            distance: state.distance,
            ball_position: state.ball_position,
            ...data,
        };

        try {
            const resp = await fetch(`/games/${GAME_ID}/tracker/${endpoint}/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCSRFToken(),
                },
                body: JSON.stringify(payload),
            });
            const result = await resp.json();

            if (result.success) {
                if (result.next_state) {
                    state.down = result.next_state.down;
                    state.distance = result.next_state.distance;
                    state.ball_position = result.next_state.ball_position;
                }
                state.team_score = result.team_score;
                state.opponent_score = result.opponent_score;
                state.next_sequence++;

                updateScoreboard();
                addPlayToFeed(result.play_summary, result.play_detail);
                showToast('Play saved', 'success');

                if (result.next_state && result.next_state.situation === 'turnover') {
                    state.possession_team = state.possession_team === 'home' ? 'away' : 'home';
                    setTimeout(() => {
                        resetToPlayTypeSelection();
                    }, 300);
                } else if (result.next_state && result.next_state.situation === 'extra_point') {
                    setTimeout(() => showPlayForm('extra_point'), 300);
                } else if (result.next_state && result.next_state.situation === 'kickoff') {
                    setTimeout(() => showPlayForm('kickoff'), 300);
                } else {
                    resetToPlayTypeSelection();
                }

                return result;
            } else {
                showToast(result.error || 'Failed to save play', 'error');
                return null;
            }
        } catch (err) {
            showToast('Network error — play not saved', 'error');
            return null;
        } finally {
            state.submitting = false;
            if (formArea) formArea.classList.remove('form-loading');
        }
    }

    window.TrackerModules = window.TrackerModules || {};
    window.TrackerModules.ajax = { getCSRFToken, postPlay };
})();
