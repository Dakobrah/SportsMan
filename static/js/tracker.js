/**
 * Live Game Tracker — Client-side state machine and UI controller.
 */
(function () {
    'use strict';

    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    const app = document.getElementById('tracker-app');
    if (!app) return;

    const GAME_ID = app.dataset.gameId;
    const PLAYERS = JSON.parse(document.getElementById('players-data').textContent);
    const TEAM_ABBR = app.dataset.teamAbbr;
    const OPPONENT = app.dataset.opponent;

    const state = {
        ...JSON.parse(document.getElementById('game-state-data').textContent),
        currentForm: null,
        submitting: false,
    };

    // Penalties reference
    const PENALTIES = [
        { name: 'False Start', yards: 5, on_offense: true },
        { name: 'Holding (Offense)', yards: 10, on_offense: true },
        { name: 'Holding (Defense)', yards: 5, on_offense: false, auto_first: true },
        { name: 'Pass Interference (Off)', yards: 10, on_offense: true },
        { name: 'Pass Interference (Def)', yards: 0, on_offense: false, auto_first: true, spot_foul: true },
        { name: 'Delay of Game', yards: 5, on_offense: true },
        { name: 'Encroachment', yards: 5, on_offense: false },
        { name: 'Offsides', yards: 5, on_offense: false },
        { name: 'Illegal Formation', yards: 5, on_offense: true },
        { name: 'Illegal Motion', yards: 5, on_offense: true },
        { name: 'Illegal Shift', yards: 5, on_offense: true },
        { name: 'Illegal Block in Back', yards: 10, on_offense: true },
        { name: 'Clipping', yards: 15, on_offense: true },
        { name: 'Chop Block', yards: 15, on_offense: true },
        { name: 'Facemask', yards: 15, on_offense: false, auto_first: true },
        { name: 'Roughing the Passer', yards: 15, on_offense: false, auto_first: true },
        { name: 'Roughing the Kicker', yards: 15, on_offense: false, auto_first: true },
        { name: 'Unnecessary Roughness', yards: 15, on_offense: false, auto_first: true },
        { name: 'Unsportsmanlike Conduct', yards: 15, on_offense: false },
        { name: 'Personal Foul', yards: 15, on_offense: false, auto_first: true },
        { name: 'Horse Collar Tackle', yards: 15, on_offense: false, auto_first: true },
        { name: 'Intentional Grounding', yards: 0, on_offense: true, loss_of_down: true },
        { name: 'Ineligible Receiver', yards: 5, on_offense: true },
        { name: 'Illegal Contact', yards: 5, on_offense: false, auto_first: true },
        { name: 'Neutral Zone Infraction', yards: 5, on_offense: false },
        { name: 'Too Many Men on Field', yards: 5, on_offense: true },
        { name: 'Targeting', yards: 15, on_offense: false, auto_first: true },
    ];

    // =========================================================================
    // CSRF & AJAX
    // =========================================================================
    function getCSRFToken() {
        const el = document.querySelector('[name=csrfmiddlewaretoken]');
        if (el) return el.value;
        const match = document.cookie.match(/csrftoken=([^;]+)/);
        return match ? match[1] : '';
    }

    async function postPlay(endpoint, data) {
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

                if (result.next_state && result.next_state.situation === 'extra_point') {
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

    // =========================================================================
    // SCOREBOARD
    // =========================================================================
    function updateScoreboard() {
        document.getElementById('team-score').textContent = state.team_score;
        document.getElementById('opp-score').textContent = state.opponent_score;

        const qText = state.quarter <= 4 ? 'Q' + state.quarter : 'OT';
        document.getElementById('quarter-display').textContent = qText;

        const ddBar = document.getElementById('down-distance-bar');
        if (state.down) {
            const suffixes = { 1: 'st', 2: 'nd', 3: 'rd', 4: 'th' };
            document.getElementById('down-display').textContent = state.down + (suffixes[state.down] || 'th');
            document.getElementById('distance-display').textContent = state.distance || 10;
            ddBar.style.display = '';
        } else {
            ddBar.style.display = 'none';
        }

        updateFieldViz();
    }

    function ballPosDisplay(pos) {
        if (pos == null) return '--';
        if (pos === 0) return '50';
        if (pos < 0) return 'OWN ' + (50 + pos);
        return 'OPP ' + (50 - pos);
    }

    function updateFieldViz() {
        const marker = document.getElementById('ball-marker');
        const label = document.getElementById('ball-position-display');
        if (!marker) return;
        const pos = state.ball_position || 0;
        const pct = ((pos + 50) / 100) * 100;
        marker.style.left = pct + '%';
        if (label) label.textContent = ballPosDisplay(pos);
    }

    // =========================================================================
    // PLAY FORM MANAGEMENT
    // =========================================================================
    function showPlayForm(type) {
        state.currentForm = type;
        const formArea = document.getElementById('play-form-area');
        const buttons = document.getElementById('play-type-buttons');
        const stMenu = document.getElementById('st-submenu');

        buttons.classList.add('hidden');
        stMenu.classList.add('hidden');
        formArea.classList.remove('hidden');

        switch (type) {
            case 'run': formArea.innerHTML = buildRunForm(); break;
            case 'pass': formArea.innerHTML = buildPassForm(); break;
            case 'penalty': formArea.innerHTML = buildPenaltyForm(); break;
            case 'kickoff': formArea.innerHTML = buildKickoffForm(); break;
            case 'punt': formArea.innerHTML = buildPuntForm(); break;
            case 'field_goal': formArea.innerHTML = buildFieldGoalForm(); break;
            case 'extra_point': formArea.innerHTML = buildExtraPointForm(); break;
            case 'special_teams':
                formArea.classList.add('hidden');
                buttons.classList.add('hidden');
                stMenu.classList.remove('hidden');
                return;
        }

        formArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function resetToPlayTypeSelection() {
        state.currentForm = null;
        const formArea = document.getElementById('play-form-area');
        formArea.classList.add('hidden');
        formArea.innerHTML = '';
        document.getElementById('st-submenu').classList.add('hidden');
        document.getElementById('play-type-buttons').classList.remove('hidden');
    }

    // =========================================================================
    // SHARED FORM BUILDERS
    // =========================================================================
    function buildPlayerSelect(fieldId, positions, label) {
        const filtered = positions
            ? PLAYERS.filter(p => positions.includes(p.position))
            : PLAYERS;
        const opts = filtered.map(p =>
            `<option value="${p.id}">#${p.number} ${p.first_name} ${p.last_name} (${p.position})</option>`
        ).join('');
        return `
        <div class="mb-3">
            <label class="form-label">${label || 'Player'}</label>
            <select id="${fieldId}" class="form-select">
                <option value="">-- Select --</option>${opts}
            </select>
        </div>`;
    }

    function buildQuickYards() {
        const values = [-10, -5, -2, -1, 0, 1, 2, 3, 4, 5, 7, 10, 15, 20, 30, 40, 50];
        return `<div class="quick-yards">${values.map(v =>
            `<button type="button" class="quick-yard-btn ${v < 0 ? 'negative' : ''}" data-yards="${v}">${v > 0 ? '+' : ''}${v}</button>`
        ).join('')}</div>`;
    }

    function buildToggle(id, label, cssClass) {
        return `<button type="button" class="toggle-btn ${cssClass}" id="toggle-${id}" data-field="${id}" data-active="false">${label}</button>`;
    }

    function formHeader(icon, iconBg, title) {
        return `
        <div class="form-header">
            <div class="form-header-icon" style="background:${iconBg}">
                <i class="bi bi-${icon}"></i>
            </div>
            <h5>${title}</h5>
        </div>`;
    }

    // =========================================================================
    // FORM BUILDERS
    // =========================================================================
    function buildRunForm() {
        return `
        <div class="tracker-form">
            ${formHeader('person-walking', '#16a34a', 'Run Play')}
            ${buildPlayerSelect('ball_carrier', ['RB', 'FB', 'QB', 'WR', 'TE'], 'Ball Carrier')}
            <div class="mb-3 yards-group">
                <label class="form-label">Yards Gained</label>
                <input type="number" id="yards_gained" class="form-control yards-input" value="0" inputmode="numeric">
                ${buildQuickYards()}
            </div>
            <div class="toggle-row">
                ${buildToggle('is_touchdown', 'TD', 'toggle-td')}
                ${buildToggle('is_first_down', '1st Down', 'toggle-1st')}
                ${buildToggle('fumbled', 'Fumble', 'toggle-fumble')}
            </div>
            <div class="mb-3">
                <label class="form-label">Notes</label>
                <input type="text" id="play_notes" class="form-control" placeholder="Optional notes...">
            </div>
            <button type="button" class="btn btn-success w-100 submit-play-btn" data-action="submit-run">
                <i class="bi bi-check-lg me-1"></i>Save Run Play
            </button>
            <button type="button" class="btn btn-outline-secondary w-100 mt-2 cancel-play-btn" data-action="cancel">Cancel</button>
        </div>`;
    }

    function buildPassForm() {
        return `
        <div class="tracker-form">
            ${formHeader('send-fill', '#2563eb', 'Pass Play')}
            ${buildPlayerSelect('quarterback', ['QB'], 'Quarterback')}
            ${buildPlayerSelect('receiver', ['WR', 'TE', 'RB', 'FB'], 'Receiver')}
            <div class="toggle-row">
                ${buildToggle('is_complete', 'Complete', 'toggle-complete')}
                ${buildToggle('was_sacked', 'Sack', 'toggle-sack')}
            </div>
            <div class="mb-3 yards-group">
                <label class="form-label">Yards</label>
                <input type="number" id="yards_gained" class="form-control yards-input" value="0" inputmode="numeric">
                ${buildQuickYards()}
            </div>
            <div class="toggle-row">
                ${buildToggle('is_touchdown', 'TD', 'toggle-td')}
                ${buildToggle('is_first_down', '1st Down', 'toggle-1st')}
                ${buildToggle('is_interception', 'INT', 'toggle-int')}
                ${buildToggle('fumbled', 'Fumble', 'toggle-fumble')}
            </div>
            <div class="mb-3">
                <label class="form-label">Notes</label>
                <input type="text" id="play_notes" class="form-control" placeholder="Optional notes...">
            </div>
            <button type="button" class="btn btn-primary w-100 submit-play-btn" data-action="submit-pass">
                <i class="bi bi-check-lg me-1"></i>Save Pass Play
            </button>
            <button type="button" class="btn btn-outline-secondary w-100 mt-2 cancel-play-btn" data-action="cancel">Cancel</button>
        </div>`;
    }

    function buildPenaltyForm() {
        const penaltyItems = PENALTIES.map((p, i) =>
            `<div class="penalty-item" data-index="${i}" data-name="${p.name}" data-yards="${p.yards}" data-on-offense="${p.on_offense}" data-auto-first="${!!p.auto_first}">
                <span>${p.name}</span> <span class="penalty-yards">${p.yards} yds</span>
            </div>`
        ).join('');

        return `
        <div class="tracker-form">
            ${formHeader('flag-fill', '#f59e0b', 'Penalty')}
            <div class="mb-3">
                <label class="form-label">Select Penalty</label>
                <div class="penalty-list">${penaltyItems}</div>
                <input type="hidden" id="penalty_name" value="">
                <input type="hidden" id="penalty_yards_val" value="0">
                <input type="hidden" id="penalty_on_offense" value="true">
                <input type="hidden" id="penalty_auto_first" value="false">
            </div>
            <div class="mb-3">
                <label class="form-label">Yards</label>
                <input type="number" id="penalty_yards_input" class="form-control" value="5" inputmode="numeric">
            </div>
            <div class="toggle-row">
                ${buildToggle('accepted', 'Accepted', 'toggle-accepted')}
                ${buildToggle('declined', 'Declined', 'toggle-declined')}
            </div>
            <div class="toggle-row">
                ${buildToggle('repeat_down', 'Repeat Down', 'toggle-1st')}
                ${buildToggle('auto_first_down', 'Auto 1st Down', 'toggle-td')}
            </div>
            <div class="mb-3">
                <label class="form-label">Notes</label>
                <input type="text" id="play_notes" class="form-control" placeholder="Optional notes...">
            </div>
            <button type="button" class="btn btn-warning w-100 submit-play-btn" data-action="submit-penalty">
                <i class="bi bi-check-lg me-1"></i>Save Penalty
            </button>
            <button type="button" class="btn btn-outline-secondary w-100 mt-2 cancel-play-btn" data-action="cancel">Cancel</button>
        </div>`;
    }

    function buildKickoffForm() {
        return `
        <div class="tracker-form">
            ${formHeader('arrow-up-right-circle-fill', '#7c3aed', 'Kickoff')}
            ${buildPlayerSelect('kicker', ['K'], 'Kicker')}
            <div class="mb-3 yards-group">
                <label class="form-label">Kick Distance (yards)</label>
                <input type="number" id="kick_yards" class="form-control yards-input" value="60" inputmode="numeric">
            </div>
            <div class="toggle-row">
                ${buildToggle('is_touchback', 'Touchback', 'toggle-1st')}
                ${buildToggle('is_onside_kick', 'Onside', 'toggle-fumble')}
                ${buildToggle('out_of_bounds', 'Out of Bounds', 'toggle-miss')}
            </div>
            <div class="mb-3">
                <label class="form-label">Notes</label>
                <input type="text" id="play_notes" class="form-control" placeholder="Optional notes...">
            </div>
            <button type="button" class="btn btn-primary w-100 submit-play-btn" data-action="submit-kickoff">
                <i class="bi bi-check-lg me-1"></i>Save Kickoff
            </button>
            <button type="button" class="btn btn-outline-secondary w-100 mt-2 cancel-play-btn" data-action="cancel">Cancel</button>
        </div>`;
    }

    function buildPuntForm() {
        return `
        <div class="tracker-form">
            ${formHeader('arrow-bar-up', '#7c3aed', 'Punt')}
            ${buildPlayerSelect('punter', ['P'], 'Punter')}
            <div class="mb-3 yards-group">
                <label class="form-label">Punt Distance (yards)</label>
                <input type="number" id="punt_yards" class="form-control yards-input" value="40" inputmode="numeric">
            </div>
            <div class="toggle-row">
                ${buildToggle('is_touchback', 'Touchback', 'toggle-1st')}
                ${buildToggle('is_blocked', 'Blocked', 'toggle-fumble')}
                ${buildToggle('out_of_bounds', 'Out of Bounds', 'toggle-miss')}
            </div>
            <div class="mb-3">
                <label class="form-label">Notes</label>
                <input type="text" id="play_notes" class="form-control" placeholder="Optional notes...">
            </div>
            <button type="button" class="btn btn-primary w-100 submit-play-btn" data-action="submit-punt">
                <i class="bi bi-check-lg me-1"></i>Save Punt
            </button>
            <button type="button" class="btn btn-outline-secondary w-100 mt-2 cancel-play-btn" data-action="cancel">Cancel</button>
        </div>`;
    }

    function buildFieldGoalForm() {
        return `
        <div class="tracker-form">
            ${formHeader('bullseye', '#7c3aed', 'Field Goal')}
            ${buildPlayerSelect('kicker', ['K'], 'Kicker')}
            <div class="mb-3 yards-group">
                <label class="form-label">Kick Distance (yards)</label>
                <input type="number" id="kick_distance" class="form-control yards-input" value="30" inputmode="numeric">
            </div>
            <div class="mb-3">
                <label class="form-label">Result</label>
                <div class="toggle-row">
                    ${buildToggle('fg_good', 'GOOD', 'toggle-good')}
                    ${buildToggle('fg_miss', 'MISSED', 'toggle-miss')}
                    ${buildToggle('fg_block', 'BLOCKED', 'toggle-block')}
                </div>
            </div>
            <div class="mb-3">
                <label class="form-label">Notes</label>
                <input type="text" id="play_notes" class="form-control" placeholder="Optional notes...">
            </div>
            <button type="button" class="btn btn-primary w-100 submit-play-btn" data-action="submit-field-goal">
                <i class="bi bi-check-lg me-1"></i>Save Field Goal
            </button>
            <button type="button" class="btn btn-outline-secondary w-100 mt-2 cancel-play-btn" data-action="cancel">Cancel</button>
        </div>`;
    }

    function buildExtraPointForm() {
        return `
        <div class="tracker-form">
            ${formHeader('plus-circle-fill', '#7c3aed', 'Extra Point / 2-Point')}
            <div class="mb-3">
                <label class="form-label">Attempt Type</label>
                <div class="toggle-row">
                    ${buildToggle('pat_kick', 'PAT Kick', 'toggle-1st')}
                    ${buildToggle('two_pt_run', '2pt Run', 'toggle-td')}
                    ${buildToggle('two_pt_pass', '2pt Pass', 'toggle-td')}
                </div>
            </div>
            ${buildPlayerSelect('ep_kicker', ['K'], 'Kicker (PAT)')}
            <div class="mb-3">
                <label class="form-label">Result</label>
                <div class="toggle-row">
                    ${buildToggle('ep_good', 'GOOD', 'toggle-good')}
                    ${buildToggle('ep_miss', 'NO GOOD', 'toggle-miss')}
                </div>
            </div>
            <div class="mb-3">
                <label class="form-label">Notes</label>
                <input type="text" id="play_notes" class="form-control" placeholder="Optional notes...">
            </div>
            <button type="button" class="btn btn-primary w-100 submit-play-btn" data-action="submit-extra-point">
                <i class="bi bi-check-lg me-1"></i>Save
            </button>
            <button type="button" class="btn btn-outline-secondary w-100 mt-2 cancel-play-btn" data-action="cancel">Cancel</button>
        </div>`;
    }

    // =========================================================================
    // FORM SUBMISSION HANDLERS
    // =========================================================================
    function getToggleState(id) {
        const el = document.getElementById('toggle-' + id);
        return el ? el.dataset.active === 'true' : false;
    }

    function getSelectVal(id) {
        const el = document.getElementById(id);
        return el ? (el.value || null) : null;
    }

    function getInputVal(id, fallback) {
        const el = document.getElementById(id);
        return el ? (el.value || fallback) : fallback;
    }

    async function submitRun() {
        await postPlay('run', {
            ball_carrier: getSelectVal('ball_carrier'),
            yards_gained: parseInt(getInputVal('yards_gained', '0')),
            is_touchdown: getToggleState('is_touchdown'),
            is_first_down: getToggleState('is_first_down'),
            fumbled: getToggleState('fumbled'),
            fumble_lost: getToggleState('fumbled'),
            notes: getInputVal('play_notes', ''),
        });
    }

    async function submitPass() {
        const wasSacked = getToggleState('was_sacked');
        const yards = parseInt(getInputVal('yards_gained', '0'));
        await postPlay('pass', {
            quarterback: getSelectVal('quarterback'),
            receiver: getSelectVal('receiver'),
            is_complete: getToggleState('is_complete'),
            yards_gained: wasSacked ? 0 : yards,
            is_touchdown: getToggleState('is_touchdown'),
            is_first_down: getToggleState('is_first_down'),
            is_interception: getToggleState('is_interception'),
            was_sacked: wasSacked,
            sack_yards: wasSacked ? -Math.abs(yards) : 0,
            fumbled: getToggleState('fumbled'),
            fumble_lost: getToggleState('fumbled'),
            notes: getInputVal('play_notes', ''),
        });
    }

    async function submitPenalty() {
        const accepted = getToggleState('accepted');
        await postPlay('penalty', {
            penalty_description: getInputVal('penalty_name', ''),
            penalty_yards: parseInt(getInputVal('penalty_yards_input', '5')),
            on_offense: document.getElementById('penalty_on_offense').value === 'true',
            accepted: accepted,
            declined: !accepted,
            repeat_down: getToggleState('repeat_down'),
            auto_first_down: getToggleState('auto_first_down'),
            notes: getInputVal('play_notes', ''),
        });
    }

    async function submitKickoff() {
        await postPlay('kickoff', {
            kicker: getSelectVal('kicker'),
            kick_yards: parseInt(getInputVal('kick_yards', '60')),
            is_touchback: getToggleState('is_touchback'),
            is_onside_kick: getToggleState('is_onside_kick'),
            out_of_bounds: getToggleState('out_of_bounds'),
            notes: getInputVal('play_notes', ''),
        });
    }

    async function submitPunt() {
        await postPlay('punt', {
            punter: getSelectVal('punter'),
            punt_yards: parseInt(getInputVal('punt_yards', '40')),
            is_touchback: getToggleState('is_touchback'),
            is_blocked: getToggleState('is_blocked'),
            out_of_bounds: getToggleState('out_of_bounds'),
            notes: getInputVal('play_notes', ''),
        });
    }

    async function submitFieldGoal() {
        let result = 'MISS';
        if (getToggleState('fg_good')) result = 'GOOD';
        else if (getToggleState('fg_block')) result = 'BLOCK';

        await postPlay('field-goal', {
            kicker: getSelectVal('kicker'),
            kick_distance: parseInt(getInputVal('kick_distance', '30')),
            result: result,
            notes: getInputVal('play_notes', ''),
        });
    }

    async function submitExtraPoint() {
        let attemptType = 'KICK';
        if (getToggleState('two_pt_run')) attemptType = '2PT_RUN';
        else if (getToggleState('two_pt_pass')) attemptType = '2PT_PASS';

        let result = getToggleState('ep_good') ? 'GOOD' : 'MISS';

        await postPlay('extra-point', {
            attempt_type: attemptType,
            result: result,
            kicker: attemptType === 'KICK' ? getSelectVal('ep_kicker') : null,
            notes: getInputVal('play_notes', ''),
        });
    }

    // =========================================================================
    // UNDO
    // =========================================================================
    async function undoLastPlay() {
        if (state.submitting) return;
        if (!confirm('Undo last play?')) return;
        state.submitting = true;

        try {
            const resp = await fetch(`/games/${GAME_ID}/tracker/undo/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCSRFToken(),
                },
                body: JSON.stringify({}),
            });
            const result = await resp.json();
            if (result.success) {
                state.team_score = result.team_score;
                state.opponent_score = result.opponent_score;
                updateScoreboard();
                const feed = document.getElementById('plays-feed');
                if (feed && feed.firstElementChild) {
                    feed.removeChild(feed.firstElementChild);
                }
                showToast('Play undone', 'success');
            } else {
                showToast(result.error || 'Nothing to undo', 'error');
            }
        } catch (err) {
            showToast('Network error', 'error');
        } finally {
            state.submitting = false;
        }
    }

    // =========================================================================
    // PLAY FEED
    // =========================================================================
    function addPlayToFeed(summary, detail) {
        const feed = document.getElementById('plays-feed');
        if (!feed) return;

        const empty = feed.querySelector('.feed-empty');
        if (empty) empty.remove();

        const item = document.createElement('div');
        item.className = 'feed-item';

        const seq = state.next_sequence - 1;
        let yardsHtml = '';
        if (detail && detail.yards !== undefined) {
            const cls = detail.yards > 0 ? 'positive' : (detail.yards < 0 ? 'negative' : 'neutral');
            yardsHtml = `<span class="feed-yards ${cls}">${detail.yards > 0 ? '+' : ''}${detail.yards}</span>`;
        }

        let badges = '';
        if (detail && detail.is_touchdown) badges += ' <span class="feed-badge-td">TD</span>';
        if (detail && detail.is_interception) badges += ' <span class="feed-badge-int">INT</span>';

        item.innerHTML = `
            <span class="feed-seq">#${seq}</span>
            <span class="feed-qtr">Q${state.quarter}</span>
            <span class="feed-desc">${summary}${badges}</span>
            ${yardsHtml}
        `;

        feed.insertBefore(item, feed.firstChild);

        while (feed.children.length > 15) {
            feed.removeChild(feed.lastChild);
        }
    }

    // =========================================================================
    // SCORE / QUARTER EDIT
    // =========================================================================
    function promptScoreEdit(which) {
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
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            body: JSON.stringify(payload),
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                state.team_score = data.team_score;
                state.opponent_score = data.opponent_score;
                updateScoreboard();
                showToast('Score updated', 'success');
            }
        });
    }

    function promptQuarterChange() {
        const q = prompt('Quarter (1-4, 5 for OT):', state.quarter);
        if (q === null) return;
        const val = parseInt(q);
        if (isNaN(val) || val < 1 || val > 9) return;
        state.quarter = val;
        updateScoreboard();
        showToast('Quarter updated', 'success');
    }

    // =========================================================================
    // TOAST
    // =========================================================================
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

    // =========================================================================
    // EVENT LISTENERS
    // =========================================================================

    // Play type buttons
    document.querySelectorAll('.play-btn').forEach(btn => {
        btn.addEventListener('click', () => showPlayForm(btn.dataset.type));
    });

    // Special teams submenu
    document.querySelectorAll('.st-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.st === 'back') { resetToPlayTypeSelection(); return; }
            showPlayForm(btn.dataset.st);
        });
    });

    // Undo button
    document.getElementById('undo-btn').addEventListener('click', undoLastPlay);

    // Score taps
    document.getElementById('team-score').addEventListener('click', () => promptScoreEdit('team'));
    document.getElementById('opp-score').addEventListener('click', () => promptScoreEdit('opponent'));
    document.getElementById('quarter-display').addEventListener('click', promptQuarterChange);

    // Delegated events on form area
    document.getElementById('play-form-area').addEventListener('click', function (e) {
        const target = e.target.closest('[data-action]') || e.target.closest('.quick-yard-btn') || e.target.closest('.toggle-btn') || e.target.closest('.penalty-item');

        if (!target) return;

        // Quick yard buttons
        if (target.classList.contains('quick-yard-btn')) {
            const input = document.getElementById('yards_gained')
                || document.getElementById('kick_yards')
                || document.getElementById('punt_yards')
                || document.getElementById('kick_distance');
            if (input) input.value = target.dataset.yards;
            return;
        }

        // Toggle buttons
        if (target.classList.contains('toggle-btn')) {
            const field = target.dataset.field;

            const radioGroups = [
                ['fg_good', 'fg_miss', 'fg_block'],
                ['ep_good', 'ep_miss'],
                ['pat_kick', 'two_pt_run', 'two_pt_pass'],
                ['accepted', 'declined'],
            ];

            let isRadio = false;
            for (const group of radioGroups) {
                if (group.includes(field)) {
                    isRadio = true;
                    group.forEach(f => {
                        const el = document.getElementById('toggle-' + f);
                        if (el) el.dataset.active = (f === field) ? 'true' : 'false';
                    });
                    break;
                }
            }

            if (!isRadio) {
                target.dataset.active = target.dataset.active === 'true' ? 'false' : 'true';
            }
            return;
        }

        // Penalty item selection
        if (target.classList.contains('penalty-item')) {
            document.querySelectorAll('.penalty-item').forEach(p => p.classList.remove('selected'));
            target.classList.add('selected');
            document.getElementById('penalty_name').value = target.dataset.name;
            document.getElementById('penalty_yards_input').value = target.dataset.yards;
            document.getElementById('penalty_on_offense').value = target.dataset.onOffense;
            document.getElementById('penalty_auto_first').value = target.dataset.autoFirst;

            const acceptedEl = document.getElementById('toggle-accepted');
            if (acceptedEl) acceptedEl.dataset.active = 'true';
            const declinedEl = document.getElementById('toggle-declined');
            if (declinedEl) declinedEl.dataset.active = 'false';

            if (target.dataset.autoFirst === 'true') {
                const afEl = document.getElementById('toggle-auto_first_down');
                if (afEl) afEl.dataset.active = 'true';
            }
            return;
        }

        // Submit / cancel actions
        const action = target.dataset.action;
        if (!action) return;

        switch (action) {
            case 'cancel': resetToPlayTypeSelection(); break;
            case 'submit-run': submitRun(); break;
            case 'submit-pass': submitPass(); break;
            case 'submit-penalty': submitPenalty(); break;
            case 'submit-kickoff': submitKickoff(); break;
            case 'submit-punt': submitPunt(); break;
            case 'submit-field-goal': submitFieldGoal(); break;
            case 'submit-extra-point': submitExtraPoint(); break;
        }
    });

    // =========================================================================
    // INITIAL RENDER
    // =========================================================================
    updateScoreboard();

})();
