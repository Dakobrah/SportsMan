/**
 * Play entry forms: builders, field collectors, submit handlers, and the
 * delegated form-area interaction handler.
 */
import { state, PLAYERS, PENALTIES, TEAM_ABBR, OPPONENT } from './state.js';
import { firstFocusable } from './ui.js';
import { updateFieldViz, ballPosDisplay } from './field.js';
import { recordPlay } from './flow.js';

// =========================================================================
// PLAY TYPE GRID / POSSESSION
// =========================================================================

export function updatePossessionDisplay() {
    const isOnOffense = state.possession_team !== 'away';
    const offenseButtons = document.getElementById('play-type-buttons-offense');
    const defenseButtons = document.getElementById('play-type-buttons-defense');

    if (offenseButtons) offenseButtons.classList.toggle('hidden', !isOnOffense);
    if (defenseButtons) defenseButtons.classList.toggle('hidden', isOnOffense);
}

export function showPlayForm(type) {
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
        case 'run': formArea.innerHTML = buildRunForm(); break;
        case 'pass': formArea.innerHTML = buildPassForm(); break;
        case 'penalty': formArea.innerHTML = buildPenaltyForm(); break;
        case 'kickoff':
            formArea.innerHTML = buildKickoffForm();
            presetReceivingTeam();
            break;
        case 'punt': formArea.innerHTML = buildPuntForm(); break;
        case 'field_goal': formArea.innerHTML = buildFieldGoalForm(); break;
        case 'extra_point': formArea.innerHTML = buildExtraPointForm(); break;
        case 'defense':
            formArea.innerHTML = buildDefenseForm();
            {
                const tyInput = document.getElementById('tackle_yards');
                const oppSection = document.getElementById('opponent-play-type-section');
                if (tyInput && oppSection) {
                    tyInput.addEventListener('input', () => {
                        oppSection.style.display = parseInt(tyInput.value) !== 0 ? '' : 'none';
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
    // Move keyboard focus into the form so assistive technology picks it up.
    requestAnimationFrame(() => { const f = firstFocusable(formArea); if (f) f.focus(); });
}

export function resetToPlayTypeSelection() {
    state.currentForm = null;
    const formArea = document.getElementById('play-form-area');
    formArea.classList.add('hidden');
    formArea.innerHTML = '';
    document.getElementById('st-submenu').classList.add('hidden');
    updatePossessionDisplay();
    updateFieldViz(); // Redraw first-down line with updated possession_team
    // Return focus to the active play-type button grid.
    const firstPlayBtn = document.querySelector(
        '#play-type-buttons-offense:not(.hidden) .play-btn, ' +
        '#play-type-buttons-defense:not(.hidden) .play-btn'
    );
    if (firstPlayBtn) firstPlayBtn.focus();
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

/** Returns true if `yards` is enough to earn a first down given the current distance. */
function autoFirstDown(yards) {
    return yards >= (state.distance || 10);
}

/** Renders the standard submit + cancel button pair used by every form. */
function buildFormFooter(action, label, btnClass = 'btn-primary') {
    return `
        <button type="button" class="btn ${btnClass} w-100 submit-play-btn" data-action="${action}">
            <i class="bi bi-check-lg me-1"></i>${label}
        </button>
        <button type="button" class="btn btn-outline-secondary w-100 mt-2 cancel-play-btn" data-action="cancel">Cancel</button>`;
}

function buildFumbleSection() {
    return `
        <div class="toggle-row hidden" id="fumble-lost-section">
            ${buildToggle('fumble_lost', 'Lost (opponent ball)', 'toggle-fumble')}
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
        ${buildFumbleSection()}
        <div class="mb-3">
            <label class="form-label">Notes</label>
            <input type="text" id="play_notes" class="form-control" placeholder="Optional notes...">
        </div>
        ${buildFormFooter('submit-run', 'Save Run Play', 'btn-success')}
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
        ${buildFumbleSection()}
        <div class="mb-3">
            <label class="form-label">Notes</label>
            <input type="text" id="play_notes" class="form-control" placeholder="Optional notes...">
        </div>
        ${buildFormFooter('submit-pass', 'Save Pass Play')}
    </div>`;
}

function buildPenaltyForm() {
    const penaltyItems = PENALTIES.map((p, i) =>
        `<div class="penalty-item" data-index="${i}" data-name="${p.name}" data-yards="${p.yards}" data-on-offense="${p.on_offense}" data-auto-first="${!!p.auto_first}" data-loss-of-down="${!!p.loss_of_down}">
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
            <input type="hidden" id="penalty_loss_of_down" value="false">
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
        ${buildFormFooter('submit-penalty', 'Save Penalty', 'btn-warning')}
    </div>`;
}

/** Preselect the kickoff receiver: the side NOT holding the ball (the
 *  kicking team holds possession through a kick phase). The operator can
 *  override it — e.g. the second-half kickoff after a deferral. */
function presetReceivingTeam() {
    const receiver = state.possession_team === 'home' ? 'away' : 'home';
    const el = document.getElementById('toggle-recv_' + receiver);
    if (el) {
        el.dataset.active = 'true';
        el.setAttribute('aria-pressed', 'true');
    }
}

function buildKickoffForm() {
    return `
    <div class="tracker-form">
        ${formHeader('arrow-up-right-circle-fill', '#7c3aed', 'Kickoff')}
        <div class="mb-3">
            <label class="form-label">Receiving Team</label>
            <div class="toggle-row">
                ${buildToggle('recv_home', TEAM_ABBR, 'toggle-complete')}
                ${buildToggle('recv_away', OPPONENT, 'toggle-miss')}
            </div>
        </div>
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
        <div class="toggle-row hidden" id="onside-recovered-section">
            ${buildToggle('onside_recovered', 'We Recovered', 'toggle-good')}
        </div>
        <div class="mb-3">
            <label class="form-label">Notes</label>
            <input type="text" id="play_notes" class="form-control" placeholder="Optional notes...">
        </div>
        ${buildFormFooter('submit-kickoff', 'Save Kickoff')}
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
        <div class="hidden" id="blocked-punt-section">
            <label class="form-label">Blocked — recovered by</label>
            <div class="toggle-row">
                ${buildToggle('blocked_us', 'US', 'toggle-good')}
                ${buildToggle('blocked_opp', 'OPPONENT', 'toggle-miss')}
            </div>
            <div class="toggle-row">
                ${buildToggle('blocked_td', 'Returned for TD', 'toggle-td')}
            </div>
        </div>
        <div class="mb-3">
            <label class="form-label">Notes</label>
            <input type="text" id="play_notes" class="form-control" placeholder="Optional notes...">
        </div>
        ${buildFormFooter('submit-punt', 'Save Punt')}
    </div>`;
}

function buildFieldGoalForm() {
    // Distance from current ball position to the goal line, plus 17 for the
    // end zone depth and holder placement.
    const currentPos = state.ball_position || 0;
    const distanceToEndzone = 50 - currentPos;
    const defaultDistance = Math.max(17, distanceToEndzone + 10);

    return `
    <div class="tracker-form">
        ${formHeader('bullseye', '#7c3aed', 'Field Goal')}
        ${buildPlayerSelect('kicker', ['K'], 'Kicker')}
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
        ${buildFormFooter('submit-field-goal', 'Save Field Goal')}
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
        ${buildFormFooter('submit-extra-point', 'Save')}
    </div>`;
}

function buildDefenseForm() {
    return `
    <div class="tracker-form">
        ${formHeader('shield-fill', '#991b1b', 'Defense Snap')}
        ${buildPlayerSelect('primary_player', null, 'Primary Defender')}
        <div class="mb-3">
            <label class="form-label">Result</label>
            <div class="toggle-row">
                ${buildToggle('def_tackle', 'Tackle', 'toggle-td')}
                ${buildToggle('def_sack', 'Sack', 'toggle-sack')}
                ${buildToggle('def_int', 'Interception', 'toggle-int')}
                ${buildToggle('def_frec', 'Fumble Rec', 'toggle-fumble')}
            </div>
            <div class="toggle-row">
                ${buildToggle('def_td', 'DEF TD (pick-six / return)', 'toggle-td')}
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
        ${buildFormFooter('submit-defense', 'Save Defense Snap', 'btn-danger')}
    </div>`;
}

// =========================================================================
// FIELD COLLECTORS + SUBMIT HANDLERS
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
    const yards = parseInt(getInputVal('yards_gained', '0')) || 0;
    const fumbled = getToggleState('fumbled');

    await recordPlay('run', {
        ball_carrier: getSelectVal('ball_carrier'),
        yards_gained: yards,
        is_touchdown: getToggleState('is_touchdown'),
        is_first_down: getToggleState('is_first_down') || autoFirstDown(yards),
        fumbled: fumbled,
        fumble_lost: fumbled && getToggleState('fumble_lost'),
        notes: getInputVal('play_notes', ''),
    });
}

async function submitPass() {
    const wasSacked = getToggleState('was_sacked');
    const yards = parseInt(getInputVal('yards_gained', '0'));
    const effectiveYards = wasSacked ? 0 : yards;
    const autoFirst = !wasSacked && autoFirstDown(effectiveYards);
    const fumbled = getToggleState('fumbled');

    await recordPlay('pass', {
        quarterback: getSelectVal('quarterback'),
        receiver: getSelectVal('receiver'),
        is_complete: getToggleState('is_complete'),
        yards_gained: effectiveYards,
        is_touchdown: getToggleState('is_touchdown'),
        is_first_down: getToggleState('is_first_down') || autoFirst,
        is_interception: getToggleState('is_interception'),
        was_sacked: wasSacked,
        sack_yards: wasSacked ? -Math.abs(yards) : 0,
        fumbled: fumbled,
        fumble_lost: fumbled && getToggleState('fumble_lost'),
        notes: getInputVal('play_notes', ''),
    });
}

async function submitPenalty() {
    const accepted = getToggleState('accepted');
    await recordPlay('penalty', {
        penalty_description: getInputVal('penalty_name', ''),
        penalty_yards: parseInt(getInputVal('penalty_yards_input', '5')),
        on_offense: document.getElementById('penalty_on_offense').value === 'true',
        accepted: accepted,
        declined: !accepted,
        repeat_down: getToggleState('repeat_down'),
        auto_first_down: getToggleState('auto_first_down'),
        loss_of_down: document.getElementById('penalty_loss_of_down').value === 'true',
        notes: getInputVal('play_notes', ''),
    });
}

async function submitDefense() {
    let playResult = 'TACKLE';
    if (getToggleState('def_sack')) playResult = 'SACK';
    else if (getToggleState('def_int')) playResult = 'INT';
    else if (getToggleState('def_frec')) playResult = 'FREC';

    let oppPlayType = '';
    if (getToggleState('opp_run'))          oppPlayType = 'RUN';
    else if (getToggleState('opp_pass'))     oppPlayType = 'PASS';
    else if (getToggleState('opp_punt'))     oppPlayType = 'PUNT';
    else if (getToggleState('opp_fg'))       oppPlayType = 'FG';
    else if (getToggleState('opp_kickoff'))  oppPlayType = 'KICKOFF';

    const yards = parseInt(getInputVal('tackle_yards', '0')) || 0;
    const payload = {
        primary_player: getSelectVal('primary_player'),
        play_result: playResult,
        tackle_yards: yards,
        opponent_play_type: oppPlayType,
        is_defensive_touchdown: getToggleState('def_td'),
        notes: getInputVal('play_notes', ''),
    };
    if (playResult === 'INT') payload.interception_return_yards = Math.abs(yards);
    if (playResult === 'FREC') payload.fumble_return_yards = Math.abs(yards);

    await recordPlay('defense', payload);
}

async function submitKickoff() {
    // Explicit receiver from the form (preset to the non-possessing side;
    // the operator overrides it for e.g. the second-half kickoff). If
    // somehow unset, the server derives it from possession.
    let receivingTeam;
    if (getToggleState('recv_home')) receivingTeam = 'home';
    else if (getToggleState('recv_away')) receivingTeam = 'away';

    await recordPlay('kickoff', {
        kicker: getSelectVal('kicker'),
        kick_yards: parseInt(getInputVal('kick_yards', '60')),
        is_touchback: getToggleState('is_touchback'),
        is_onside_kick: getToggleState('is_onside_kick'),
        onside_recovered: getToggleState('onside_recovered'),
        out_of_bounds: getToggleState('out_of_bounds'),
        receiving_team: receivingTeam,
        notes: getInputVal('play_notes', ''),
    });
}

async function submitPunt() {
    const isBlocked = getToggleState('is_blocked');
    await recordPlay('punt', {
        punter: getSelectVal('punter'),
        punt_yards: parseInt(getInputVal('punt_yards', '40')),
        is_touchback: getToggleState('is_touchback'),
        is_blocked: isBlocked,
        blocked_recovered_by: isBlocked
            ? (getToggleState('blocked_us') ? 'us' : 'opponent')
            : '',
        blocked_td: isBlocked && getToggleState('blocked_td'),
        out_of_bounds: getToggleState('out_of_bounds'),
        notes: getInputVal('play_notes', ''),
    });
}

async function submitFieldGoal() {
    let result = 'MISS';
    if (getToggleState('fg_good')) result = 'GOOD';
    else if (getToggleState('fg_block')) result = 'BLOCK';

    await recordPlay('field-goal', {
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

    await recordPlay('extra-point', {
        attempt_type: attemptType,
        result: getToggleState('ep_good') ? 'GOOD' : 'MISS',
        kicker: attemptType === 'KICK' ? getSelectVal('ep_kicker') : null,
        notes: getInputVal('play_notes', ''),
    });
}

// =========================================================================
// DELEGATED FORM INTERACTION
// =========================================================================

function autoCalculateTouchdownYardage() {
    const yardsInput = document.getElementById('yards_gained');
    if (!yardsInput) return;
    const currentPos = state.ball_position || 0;
    yardsInput.value = Math.max(1, 50 - currentPos);
}

export function handleFormInteraction(e) {
    const evTarget = e.target;
    const target = evTarget.closest('[data-action]') || evTarget.closest('.quick-yard-btn') || evTarget.closest('.toggle-btn') || evTarget.closest('.penalty-item');
    if (!target) return;

    // Quick yard buttons
    if (target.classList.contains('quick-yard-btn')) {
        const input = document.getElementById('yards_gained')
            || document.getElementById('kick_yards')
            || document.getElementById('punt_yards')
            || document.getElementById('kick_distance')
            || document.getElementById('tackle_yards');
        if (input) {
            input.value = target.dataset.yards;
            if (input.id === 'tackle_yards') {
                const oppSection = document.getElementById('opponent-play-type-section');
                if (oppSection) oppSection.style.display = parseInt(input.value) !== 0 ? '' : 'none';
            }
        }
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
            ['opp_run', 'opp_pass', 'opp_punt', 'opp_fg', 'opp_kickoff'],
            ['blocked_us', 'blocked_opp'],
            ['recv_home', 'recv_away'],
        ];

        let isRadio = false;
        for (const group of radioGroups) {
            if (group.includes(field)) {
                isRadio = true;
                group.forEach(f => {
                    const el = document.getElementById('toggle-' + f);
                    if (el) {
                        el.dataset.active = (f === field) ? 'true' : 'false';
                        el.setAttribute('aria-pressed', el.dataset.active);
                    }
                });
                break;
            }
        }

        if (!isRadio) {
            target.dataset.active = target.dataset.active === 'true' ? 'false' : 'true';
        }
        target.setAttribute('aria-pressed', target.dataset.active === 'true' ? 'true' : 'false');

        const isActive = target.dataset.active === 'true';

        // Auto-calculate yardage for offensive touchdowns.
        if (field === 'is_touchdown' && isActive) {
            autoCalculateTouchdownYardage();
        }

        // Fumble → reveal the "Lost?" sub-toggle, defaulting to lost.
        if (field === 'fumbled') {
            const section = document.getElementById('fumble-lost-section');
            if (section) {
                section.classList.toggle('hidden', !isActive);
                const lostEl = document.getElementById('toggle-fumble_lost');
                if (lostEl) {
                    lostEl.dataset.active = isActive ? 'true' : 'false';
                    lostEl.setAttribute('aria-pressed', lostEl.dataset.active);
                }
            }
        }

        // Blocked punt → reveal recovery/TD options.
        if (field === 'is_blocked') {
            const section = document.getElementById('blocked-punt-section');
            if (section) {
                section.classList.toggle('hidden', !isActive);
                if (isActive) {
                    const oppEl = document.getElementById('toggle-blocked_opp');
                    if (oppEl) oppEl.dataset.active = 'true'; // most common outcome
                }
            }
        }

        // Onside kick → reveal the recovery toggle.
        if (field === 'is_onside_kick') {
            const section = document.getElementById('onside-recovered-section');
            if (section) section.classList.toggle('hidden', !isActive);
        }

        // Auto-fill the defensive TD return distance.
        if (field === 'def_td' && isActive) {
            const defTdInput = document.getElementById('tackle_yards');
            if (defTdInput) {
                const currentPos = state.ball_position || 0;
                defTdInput.value = Math.max(1, 50 - currentPos);
            }
        }

        // Kickoff touchbacks travel the full field.
        if (field === 'is_touchback' && isActive) {
            const kickYardsInput = document.getElementById('kick_yards');
            if (kickYardsInput) kickYardsInput.value = 100;
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
        document.getElementById('penalty_loss_of_down').value = target.dataset.lossOfDown;

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
        case 'submit-defense': submitDefense(); break;
    }
}
