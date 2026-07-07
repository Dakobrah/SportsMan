/**
 * Scoreboard and field visualization — pure rendering from state.
 */
import { state } from './state.js';

export function ballPosDisplay(pos) {
    if (pos == null) return '--';
    if (pos === 0) return '50';
    if (pos < 0) return 'OWN ' + (50 + pos);
    return 'OPP ' + (50 - pos);
}

export function updateScoreboard() {
    document.getElementById('team-score').textContent = state.team_score;
    document.getElementById('opp-score').textContent = state.opponent_score;

    const qText = state.quarter <= 4 ? 'Q' + state.quarter : 'OT';
    document.getElementById('quarter-display').textContent = qText;

    const ddBar = document.getElementById('down-distance-bar');
    if (state.down) {
        const suffixes = { 1: 'st', 2: 'nd', 3: 'rd', 4: 'th' };
        document.getElementById('down-display').textContent = state.down + (suffixes[state.down] || 'th');
        // "& Goal" when the line to gain is the goal line.
        const pos = state.ball_position || 0;
        const distance = state.distance || 10;
        const goalToGo = state.possession_team === 'away'
            ? pos - distance <= -50
            : pos + distance >= 50;
        document.getElementById('distance-display').textContent = goalToGo ? 'Goal' : distance;
        ddBar.style.display = '';
    } else {
        ddBar.style.display = 'none';
    }

    // Possession indicators next to each score.
    const teamPoss = document.getElementById('team-poss');
    const oppPoss = document.getElementById('opp-poss');
    if (teamPoss) teamPoss.classList.toggle('active', state.possession_team === 'home');
    if (oppPoss) oppPoss.classList.toggle('active', state.possession_team === 'away');

    updateFieldViz();
}

export function updateFieldViz() {
    const marker = document.getElementById('ball-marker');
    const label = document.getElementById('ball-position-display');
    if (!marker) return;

    const pos = state.ball_position;
    if (pos === null || pos === undefined) return;

    // -50..+50 maps to 0%..100%; clamp to 2–98% so the marker stays inside
    // the green track (at the extremes it would overflow into the endzones).
    const pct = ((pos + 50) / 100) * 100;
    marker.style.left = Math.max(2, Math.min(98, pct)) + '%';

    if (label) label.textContent = ballPosDisplay(pos);

    // Line of scrimmage — where the next snap occurs; the server moves it
    // with the ball after every play.
    const losLine = document.getElementById('los-line');
    if (losLine) {
        const losPos = state.los_position;
        if (losPos !== null && losPos !== undefined) {
            const losPct = Math.max(2, Math.min(98, ((losPos + 50) / 100) * 100));
            losLine.style.left = losPct + '%';
            losLine.style.opacity = '1';
        } else {
            losLine.style.opacity = '0';
        }
    }

    renderFieldHashMarks();
    updateFirstDownLine();
}

function renderFieldHashMarks() {
    const hashContainer = document.getElementById('field-hash-marks');
    if (!hashContainer || hashContainer.children.length > 0) return; // Already rendered

    // Field spans -50..+50 (100-yard range); marks at every yard.
    for (let y = 0; y <= 100; y++) {
        let markClass = 'mark-1yd';
        if (y % 10 === 0) {
            markClass = 'mark-10yd';
        } else if (y % 5 === 0) {
            markClass = 'mark-5yd';
        }
        const mark = document.createElement('div');
        mark.className = `field-hash-mark ${markClass}`;
        mark.style.left = y + '%';
        hashContainer.appendChild(mark);
    }
}

function updateFirstDownLine() {
    const line = document.getElementById('first-down-line');
    if (!line) return;

    // Hide during kickoffs and extra points — no meaningful down/distance.
    if (!state.down) {
        line.style.opacity = '0';
        return;
    }

    const pos = state.ball_position || 0;
    const distance = state.distance || 10;

    // Home (us) advance toward +50; away (opponent) advance toward -50.
    const firstDownPos = state.possession_team === 'away'
        ? pos - distance
        : pos + distance;
    const pct = ((firstDownPos + 50) / 100) * 100;

    line.style.left = Math.max(0, Math.min(100, pct)) + '%';
    line.style.opacity = (pct < 0 || pct > 100) ? '0.3' : '1';
}
