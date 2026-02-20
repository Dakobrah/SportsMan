/**
 * form_builders.js — Non-runtime reference module.
 * Extracted from tracker.js for documentation/migration purposes.
 * Exposes: window.TrackerModules.formBuilders
 *
 * In the runtime tracker.js these functions close over module-scope `state`,
 * `PLAYERS`, `PENALTIES`, and sibling builder functions.  Here they accept
 * those as explicit parameters.
 */
(function () {
    'use strict';

    // -------------------------------------------------------------------------
    // SHARED HELPERS
    // -------------------------------------------------------------------------

    /**
     * buildPlayerSelect(fieldId, positions, label, players)
     *   Returns HTML string for a <select> populated from the players array.
     *   positions: string[] | null — if null, include all players.
     */
    function buildPlayerSelect(fieldId, positions, label, players) {
        const filtered = positions
            ? players.filter(p => positions.includes(p.position))
            : players;
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

    /**
     * buildQuickYards()
     *   Returns HTML for a row of quick-select yard buttons.
     */
    function buildQuickYards() {
        const values = [-10, -5, -2, -1, 0, 1, 2, 3, 4, 5, 7, 10, 15, 20, 30, 40, 50];
        return `<div class="quick-yards">${values.map(v =>
            `<button type="button" class="quick-yard-btn ${v < 0 ? 'negative' : ''}" data-yards="${v}">${v > 0 ? '+' : ''}${v}</button>`
        ).join('')}</div>`;
    }

    /**
     * buildToggle(id, label, cssClass)
     *   Returns HTML for a single toggle button (data-active starts as 'false').
     */
    function buildToggle(id, label, cssClass) {
        return `<button type="button" class="toggle-btn ${cssClass}" id="toggle-${id}" data-field="${id}" data-active="false">${label}</button>`;
    }

    /**
     * formHeader(icon, iconBg, title)
     *   Returns HTML for the coloured icon + title header shown at the top of
     *   each play form.
     */
    function formHeader(icon, iconBg, title) {
        return `
        <div class="form-header">
            <div class="form-header-icon" style="background:${iconBg}">
                <i class="bi bi-${icon}"></i>
            </div>
            <h5>${title}</h5>
        </div>`;
    }

    // -------------------------------------------------------------------------
    // FORM BUILDERS
    // -------------------------------------------------------------------------

    /** buildRunForm(players) */
    function buildRunForm(players) {
        return `
        <div class="tracker-form">
            ${formHeader('person-walking', '#16a34a', 'Run Play')}
            ${buildPlayerSelect('ball_carrier', ['RB', 'FB', 'QB', 'WR', 'TE'], 'Ball Carrier', players)}
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

    /** buildPassForm(players) */
    function buildPassForm(players) {
        return `
        <div class="tracker-form">
            ${formHeader('send-fill', '#2563eb', 'Pass Play')}
            ${buildPlayerSelect('quarterback', ['QB'], 'Quarterback', players)}
            ${buildPlayerSelect('receiver', ['WR', 'TE', 'RB', 'FB'], 'Receiver', players)}
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

    /** buildPenaltyForm(penalties) */
    function buildPenaltyForm(penalties) {
        const penaltyItems = penalties.map((p, i) =>
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

    /** buildKickoffForm(players) */
    function buildKickoffForm(players) {
        return `
        <div class="tracker-form">
            ${formHeader('arrow-up-right-circle-fill', '#7c3aed', 'Kickoff')}
            ${buildPlayerSelect('kicker', ['K'], 'Kicker', players)}
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

    /** buildPuntForm(players) */
    function buildPuntForm(players) {
        return `
        <div class="tracker-form">
            ${formHeader('arrow-bar-up', '#7c3aed', 'Punt')}
            ${buildPlayerSelect('punter', ['P'], 'Punter', players)}
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

    /**
     * buildFieldGoalForm(state, players, ballPosDisplay)
     *   Calculates default kick distance from state.ball_position.
     */
    function buildFieldGoalForm(state, players, ballPosDisplay) {
        const currentPos = state.ball_position || 0;
        const distanceToEndzone = 50 - currentPos;
        const defaultDistance = Math.max(17, distanceToEndzone + 10);

        return `
        <div class="tracker-form">
            ${formHeader('bullseye', '#7c3aed', 'Field Goal')}
            ${buildPlayerSelect('kicker', ['K'], 'Kicker', players)}
            <div class="mb-3 yards-group">
                <label class="form-label">Kick Distance (yards)</label>
                <input type="number" id="kick_distance" class="form-control yards-input" value="${defaultDistance}" inputmode="numeric">
                <small class="text-muted">From ball position at ${ballPosDisplay(currentPos)} (${distanceToEndzone} yards to goal line)</small>
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

    /** buildExtraPointForm(players) */
    function buildExtraPointForm(players) {
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
            ${buildPlayerSelect('ep_kicker', ['K'], 'Kicker (PAT)', players)}
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

    /** buildDefenseForm(players) */
    function buildDefenseForm(players) {
        return `
        <div class="tracker-form">
            ${formHeader('shield-fill', '#991b1b', 'Defense Snap')}
            ${buildPlayerSelect('primary_player', null, 'Primary Defender', players)}
            <div class="mb-3">
                <label class="form-label">Result</label>
                <div class="toggle-row">
                    ${buildToggle('def_tackle', 'Tackle', 'toggle-td')}
                    ${buildToggle('def_sack', 'Sack', 'toggle-sack')}
                    ${buildToggle('def_int', 'Interception', 'toggle-int')}
                    ${buildToggle('def_frec', 'Fumble Rec', 'toggle-fumble')}
                </div>
            </div>
            <div class="mb-3 yards-group">
                <label class="form-label">Yards Gained (by opponent)</label>
                <input type="number" id="tackle_yards" class="form-control yards-input" value="0" inputmode="numeric">
                ${buildQuickYards()}
            </div>
            <div class="mb-3" id="opponent-play-type-section" style="display:none">
                <label class="form-label">Opponent's Play Type</label>
                <div class="toggle-row">
                    ${buildToggle('opp_run',     'Run',        'toggle-td')}
                    ${buildToggle('opp_pass',    'Pass',       'toggle-complete')}
                    ${buildToggle('opp_punt',    'Punt',       'toggle-1st')}
                    ${buildToggle('opp_fg',      'Field Goal', 'toggle-miss')}
                    ${buildToggle('opp_kickoff', 'Kickoff',    'toggle-fumble')}
                </div>
            </div>
            <div class="mb-3">
                <label class="form-label">Notes</label>
                <input type="text" id="play_notes" class="form-control" placeholder="Optional notes...">
            </div>
            <button type="button" class="btn btn-danger w-100 submit-play-btn" data-action="submit-defense">
                <i class="bi bi-check-lg me-1"></i>Save Defense Snap
            </button>
            <button type="button" class="btn btn-outline-secondary w-100 mt-2 cancel-play-btn" data-action="cancel">Cancel</button>
        </div>`;
    }

    // -------------------------------------------------------------------------
    // PLAY FORM ORCHESTRATION
    // -------------------------------------------------------------------------

    /**
     * showPlayForm(type, state, players, penalties, deps)
     *   Hide play-type button groups, inject the appropriate form HTML into
     *   #play-form-area, and for the defense form attach the tackle_yards
     *   input listener that shows/hides the opponent-play-type section.
     *
     *   deps.ballPosDisplay: function(pos) → string (required for field goal form)
     *   deps.updatePossessionDisplay: function(state) (called indirectly via reset)
     */
    function showPlayForm(type, state, players, penalties, deps) {
        state.currentForm = type;
        const formArea = document.getElementById('play-form-area');
        const offenseButtons = document.getElementById('play-type-buttons-offense');
        const defenseButtons = document.getElementById('play-type-buttons-defense');
        const stMenu = document.getElementById('st-submenu');

        offenseButtons.classList.add('hidden');
        defenseButtons.classList.add('hidden');
        stMenu.classList.add('hidden');
        formArea.classList.remove('hidden');

        switch (type) {
            case 'run':         formArea.innerHTML = buildRunForm(players); break;
            case 'pass':        formArea.innerHTML = buildPassForm(players); break;
            case 'penalty':     formArea.innerHTML = buildPenaltyForm(penalties); break;
            case 'kickoff':     formArea.innerHTML = buildKickoffForm(players); break;
            case 'punt':        formArea.innerHTML = buildPuntForm(players); break;
            case 'field_goal':  formArea.innerHTML = buildFieldGoalForm(state, players, deps.ballPosDisplay); break;
            case 'extra_point': formArea.innerHTML = buildExtraPointForm(players); break;
            case 'defense':
                formArea.innerHTML = buildDefenseForm(players);
                {
                    const tyInput = document.getElementById('tackle_yards');
                    const oppSection = document.getElementById('opponent-play-type-section');
                    if (tyInput && oppSection) {
                        tyInput.addEventListener('input', () => {
                            oppSection.style.display =
                                parseInt(tyInput.value) !== 0 ? '' : 'none';
                        });
                    }
                }
                break;
            case 'special_teams':
                formArea.classList.add('hidden');
                offenseButtons.classList.add('hidden');
                defenseButtons.classList.add('hidden');
                stMenu.classList.remove('hidden');
                return;
        }

        formArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * resetToPlayTypeSelection(state, updatePossessionDisplay)
     *   Hide and clear #play-form-area and #st-submenu, restore play-type
     *   button visibility via updatePossessionDisplay.
     */
    function resetToPlayTypeSelection(state, updatePossessionDisplay) {
        state.currentForm = null;
        const formArea = document.getElementById('play-form-area');
        formArea.classList.add('hidden');
        formArea.innerHTML = '';
        document.getElementById('st-submenu').classList.add('hidden');
        updatePossessionDisplay(state);
    }

    // -------------------------------------------------------------------------
    // EXPORT
    // -------------------------------------------------------------------------
    window.TrackerModules = window.TrackerModules || {};
    window.TrackerModules.formBuilders = {
        buildPlayerSelect,
        buildQuickYards,
        buildToggle,
        formHeader,
        buildRunForm,
        buildPassForm,
        buildPenaltyForm,
        buildKickoffForm,
        buildPuntForm,
        buildFieldGoalForm,
        buildExtraPointForm,
        buildDefenseForm,
        showPlayForm,
        resetToPlayTypeSelection,
    };
})();
