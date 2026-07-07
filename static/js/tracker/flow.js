/**
 * Play-recording flow: submits plays, adopts the server's authoritative
 * state from every response, and drives the next UI phase.
 *
 * Phase handlers (form/modal display) are injected by main.js via initFlow
 * so this module never imports forms.js/modals.js (keeps imports acyclic).
 */
import { state, adoptServerState } from './state.js';
import { postJSON } from './api.js';
import { updateScoreboard } from './field.js';
import { addLocalPlay, removeNewest } from './feed.js';
import { showToast } from './ui.js';

let phases = {
    showPlayForm: () => {},
    resetToPlayTypeSelection: () => {},
    showTeamTdModal: () => {},
    showOpponentTdModal: () => {},
};
let pollNow = () => {};

export function initFlow(handlers) {
    phases = { ...phases, ...handlers };
}

export function setPollTrigger(fn) {
    pollNow = fn;
}

/** Trigger the appropriate UI transition based on the play outcome. */
export function triggerNextPhase(sit) {
    if (sit === 'turnover' || sit === 'turnover_on_downs' || sit === 'opponent_ball') {
        setTimeout(() => phases.resetToPlayTypeSelection(), 300);
    } else if (sit === 'extra_point') {
        setTimeout(() => phases.showTeamTdModal(), 300);
    } else if (sit === 'kickoff') {
        setTimeout(() => phases.showPlayForm('kickoff'), 300);
    } else if (sit === 'safety') {
        // We were tackled in our own endzone: opponent +2, we free-kick.
        showToast('SAFETY — opponent +2. Free kick.', 'error');
        setTimeout(() => phases.showPlayForm('kickoff'), 600);
    } else if (sit === 'safety_kick') {
        // We pinned them in their endzone: +2 us, they free-kick to us.
        showToast('SAFETY! +2', 'success');
        setTimeout(() => phases.showPlayForm('kickoff'), 600);
    } else if (sit === 'opponent_td') {
        showToast('Opponent TOUCHDOWN! +6', 'error');
        setTimeout(() => phases.showOpponentTdModal(), 600);
    } else {
        phases.resetToPlayTypeSelection();
    }
}

/** Resume the UI phase recorded in GameState — used on page load so a
 *  mid-game reload lands back where the operator left off. */
export function resumePhase() {
    switch (state.situation) {
        case 'kickoff':
        case 'free_kick_us':
        case 'free_kick_opp':
            phases.showPlayForm('kickoff');
            break;
        case 'extra_point':
            phases.showPlayForm('extra_point');
            break;
        case 'opponent_td':
            phases.showOpponentTdModal();
            break;
        default:
            phases.resetToPlayTypeSelection();
    }
}

/**
 * POST a play to a tracker_add_* endpoint. The server computes the play
 * from ITS state — we only send what the operator entered.
 */
export async function recordPlay(endpoint, data) {
    if (state.submitting) return null;
    state.submitting = true;

    const formArea = document.getElementById('play-form-area');
    if (formArea) formArea.classList.add('form-loading');

    try {
        const { status, body } = await postJSON(endpoint, data);

        if (status === 409) {
            // Another operator recorded a play first (or a double-submit).
            showToast('Play already recorded — refreshing', 'error');
            pollNow();
            return null;
        }
        if (!body.success) {
            showToast(body.error || 'Failed to save play', 'error');
            return null;
        }

        adoptServerState(body.state);
        state.team_score = body.team_score;
        state.opponent_score = body.opponent_score;

        updateScoreboard();
        addLocalPlay(
            body.state.last_sequence,
            body.play_detail ? body.play_detail.quarter : state.quarter,
            body.play_summary,
            body.play_detail,
        );
        showToast('Play saved', 'success');
        triggerNextPhase(body.next_state && body.next_state.situation);
        return body;
    } catch (err) {
        showToast('Network error — play not saved', 'error');
        return null;
    } finally {
        state.submitting = false;
        if (formArea) formArea.classList.remove('form-loading');
    }
}

export async function undoLastPlay() {
    if (state.submitting) return;
    if (!confirm('Undo last play?')) return;
    state.submitting = true;

    try {
        const { body } = await postJSON('undo', {});
        if (body.success) {
            adoptServerState(body.state);
            state.team_score = body.team_score;
            state.opponent_score = body.opponent_score;
            updateScoreboard();
            removeNewest();
            showToast('Play undone', 'success');
            phases.resetToPlayTypeSelection();
        } else {
            showToast(body.error || 'Nothing to undo', 'error');
        }
    } catch (err) {
        showToast('Network error', 'error');
    } finally {
        state.submitting = false;
    }
}
