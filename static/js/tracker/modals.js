/**
 * Modal flows: the coin-toss recorder, our-TD continue, and the
 * opponent-TD / PAT dialog.
 *
 * The coin toss is a real coin flipped on the field — the modal RECORDS
 * who won and what they elected, then persists it so a page reload never
 * loses possession again.
 */
import { state, adoptServerState, TEAM_ABBR, OPPONENT } from './state.js';
import { postJSON } from './api.js';
import { updateScoreboard } from './field.js';
import { showToast, openModal } from './ui.js';
import { showPlayForm } from './forms.js';

export function showCoinTossModal() {
    const modal = document.getElementById('coin-toss-modal');
    openModal(modal);

    const winnerStep = document.getElementById('coin-winner-step');
    const choiceStep = document.getElementById('coin-choice-step');
    winnerStep.classList.remove('hidden');
    choiceStep.classList.add('hidden');

    let winner = null;

    winnerStep.querySelectorAll('button[data-team]').forEach(btn => {
        btn.onclick = () => {
            winner = btn.dataset.team;
            document.getElementById('coin-choice-team').textContent =
                winner === 'home' ? TEAM_ABBR : OPPONENT;
            winnerStep.classList.add('hidden');
            choiceStep.classList.remove('hidden');
        };
    });

    choiceStep.querySelectorAll('button[data-choice]').forEach(btn => {
        btn.onclick = async () => {
            try {
                const { body } = await postJSON('coin-toss', {
                    winner: winner,
                    choice: btn.dataset.choice,
                });
                if (!body.success) {
                    showToast(body.error || 'Could not record coin toss', 'error');
                    return;
                }
                adoptServerState(body.state);
                modal.classList.add('hidden');
                const receiverName = body.receiving_team === 'home' ? TEAM_ABBR : OPPONENT;
                showToast(`${receiverName} receives the kickoff`, 'success');
                updateScoreboard();
                setTimeout(() => showPlayForm('kickoff'), 300);
            } catch (err) {
                showToast('Network error — coin toss not saved', 'error');
            }
        };
    });
}

export function showTeamTdModal() {
    const modal = document.getElementById('team-td-modal');
    openModal(modal);

    document.getElementById('team-td-continue').onclick = () => {
        modal.classList.add('hidden');
        showPlayForm('extra_point');
    };
}

export function showOpponentTdModal() {
    const modal = document.getElementById('opponent-td-modal');
    openModal(modal);

    async function recordConversion(points) {
        modal.classList.add('hidden');
        try {
            const { body } = await postJSON('update-score', {
                opponent_score: state.opponent_score + points,
            });
            if (body.success) {
                adoptServerState(body.state);
                state.team_score = body.team_score;
                state.opponent_score = body.opponent_score;
                updateScoreboard();
            } else {
                showToast('Score sync failed — tap the score to fix', 'error');
            }
        } catch (err) {
            showToast('Score sync failed — tap the score to fix', 'error');
        }
        proceedToOpponentKickoff();
    }

    document.getElementById('opp-ep-good').onclick = () => recordConversion(1);
    document.getElementById('opp-ep-two').onclick = () => recordConversion(2);
    document.getElementById('opp-ep-miss').onclick = () => {
        modal.classList.add('hidden');
        proceedToOpponentKickoff();
    };
}

function proceedToOpponentKickoff() {
    // Opponent kicks off to us. The server knows possession is 'away'
    // (opponent_td phase) so it derives the receiving team on its own.
    showPlayForm('kickoff');
}
