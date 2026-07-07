/**
 * Polling loop — keeps every open tracker page (operator or viewer) in
 * sync with the server within a few seconds.
 *
 * The idle poll is a single tiny query server-side; the payload only
 * grows when GameState.version moved past what this client has.
 */
import { state, adoptServerState } from './state.js';
import { getJSON } from './api.js';
import { updateScoreboard } from './field.js';
import { mergeServerPlays, truncateAbove, topSequence } from './feed.js';
import { updatePossessionDisplay } from './forms.js';
import { showToast } from './ui.js';

const POLL_INTERVAL_MS = 4000;
let timer = null;
let polling = false;

export async function pollOnce() {
    if (polling || state.submitting || document.hidden) return;
    polling = true;
    try {
        const data = await getJSON('state', {
            since: state.version,
            after_seq: topSequence(),
        });
        applyPollResponse(data);
    } catch (err) {
        // Transient network failure — the next tick will retry.
    } finally {
        polling = false;
    }
}

export function applyPollResponse(data) {
    if (!data || !data.changed) return;

    const prevSituation = state.situation;
    if (!adoptServerState(data.state)) return; // stale or already adopted

    state.team_score = data.team_score;
    state.opponent_score = data.opponent_score;

    // Another device undid plays we have rendered — drop them.
    truncateAbove(state.last_sequence);
    mergeServerPlays(data.plays);

    updateScoreboard();

    // Never clobber a form the operator is filling in; otherwise refresh
    // the play-type grid to match the server's possession.
    if (!state.currentForm) {
        updatePossessionDisplay();
    }

    if (state.situation !== prevSituation) {
        showToast('Updated from another device', 'info');
    }
}

export function startPolling() {
    if (timer) return;
    timer = setInterval(pollOnce, POLL_INTERVAL_MS);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            pollOnce(); // catch up immediately when the tab comes back
        }
    });
}
