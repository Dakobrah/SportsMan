/**
 * Live Game Tracker — Client-side state machine and UI controller.
 */
(function () {
    'use strict';

    // Toggle verbose logging for debugging. Set to `true` temporarily when troubleshooting.
    const DEBUG = false;
    if (!DEBUG) {
        console.log = function () {};
        console.debug = function () {};
    }

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
    console.log('Initial game state:', state);

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

        console.log('📤 postPlay:', endpoint, payload);

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

            console.log('📥 Response:', result);

            if (result.success) {
                if (result.next_state) {
                    state.down = result.next_state.down;
                    state.distance = result.next_state.distance;
                    state.ball_position = result.next_state.ball_position;
                }
                state.team_score = result.team_score;
                state.opponent_score = result.opponent_score;
                state.next_sequence++;

                // Resolve possession before drawing so first-down line direction is correct
                const sit = result.next_state && result.next_state.situation;
                resolvePossession(sit);

                updateScoreboard();
                addPlayToFeed(result.play_summary, result.play_detail);
                showToast('Play saved', 'success');
                triggerNextPhase(sit);

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
        if (!marker) {
            console.error('ball-marker element not found in DOM');
            return;
        }
        
        const pos = state.ball_position;
        if (pos === null || pos === undefined) {
            console.warn('ball_position is null/undefined, state:', state);
            return;
        }
        
        // Calculate percentage: -50 to +50 maps to 0% to 100%
        const pct = ((pos + 50) / 100) * 100;
        // Clamp to 2–98% so the football emoji stays fully inside the green track
        // (at exactly 0% or 100% the element overflows into the endzones due to translate(-50%))
        const clampedPct = Math.max(2, Math.min(98, pct));
        console.log('🏈 BALL MARKER:', { ball_position: pos, pct: pct + '%', clamped: clampedPct + '%' });

        marker.style.left = clampedPct + '%';
        
        if (label) {
            label.textContent = ballPosDisplay(pos);
            console.log('✓ Updated label to:', label.textContent);
        }
        
        // Update hash marks (render on first call or if DOM is empty)
        renderFieldHashMarks();
        
        // Update first-down line position
        updateFirstDownLine();
    }
    
    function renderFieldHashMarks() {
        const hashContainer = document.getElementById('field-hash-marks');
        if (!hashContainer || hashContainer.children.length > 0) return; // Already rendered
        
        // Field spans from -50 to +50 (100-yard range)
        // Create marks at every yard line (1-100 yards)
        for (let y = 0; y <= 100; y++) {
            // Determine mark type based on yard line
            let markClass = 'mark-1yd'; // Default: 1-yard mark
            if (y % 10 === 0) {
                markClass = 'mark-10yd'; // 10-yard mark
            } else if (y % 5 === 0) {
                markClass = 'mark-5yd'; // 5-yard mark
            }
            
            // Convert yard position to percentage
            const pct = y;
            
            // Create mark element
            const mark = document.createElement('div');
            mark.className = `field-hash-mark ${markClass}`;
            mark.style.left = pct + '%';
            hashContainer.appendChild(mark);
        }
    }
    
    function updateFirstDownLine() {
        const line = document.getElementById('first-down-line');
        if (!line) {
            console.error('first-down-line element not found');
            return;
        }

        // Hide during kickoffs and extra points — no meaningful down/distance
        if (!state.down) {
            line.style.opacity = '0';
            return;
        }
        line.style.opacity = '1';

        const pos = state.ball_position || 0;
        const distance = state.distance || 10;

        // First-down line direction depends on who's on offense.
        // Home (us) advance toward +50; away (opponent) advance toward -50.
        const firstDownPos = state.possession_team === 'away'
            ? pos - distance
            : pos + distance;
        const pct = ((firstDownPos + 50) / 100) * 100;
        
        console.log('🟨 First Down Line:', {
            ball_position: pos,
            distance: distance,
            firstDownPos: firstDownPos,
            calculatedPct: pct + '%',
            clampedPct: Math.max(0, Math.min(100, pct)) + '%'
        });
        
        // Clamp to field bounds (0% to 100%)
        const clampedPct = Math.max(0, Math.min(100, pct));
        line.style.left = clampedPct + '%';
        console.log('Set first-down-line.style.left =', clampedPct + '%');
        
        // Make invisible if beyond field bounds
        if (pct < 0 || pct > 100) {
            line.style.opacity = '0.3';
        } else {
            line.style.opacity = '1';
        }
    }

    // =========================================================================
    // COIN TOSS & GAME SETUP
    // =========================================================================
    function showCoinTossModal() {
        const modal = document.getElementById('coin-toss-modal');
        modal.classList.remove('hidden');
        
        const teamChoiceButtons = document.getElementById('team-choice-buttons');
        const callSelection = document.getElementById('call-selection');
        const coinResult = document.getElementById('coin-result');
        
        // Reset to team selection step
        if (teamChoiceButtons) teamChoiceButtons.classList.remove('hidden');
        if (callSelection) callSelection.classList.add('hidden');
        if (coinResult) coinResult.classList.add('hidden');
        
        // Team selection handlers
        const teamButtons = teamChoiceButtons.querySelectorAll('button');
        teamButtons.forEach(btn => {
            btn.addEventListener('click', (e) => handleTeamSelection(e, callSelection, teamChoiceButtons));
        });
    }
    
    function handleTeamSelection(e, callSelection, teamChoiceButtons) {
        const selectedTeam = e.target.dataset.team;
        const teamName = selectedTeam === 'home' ? TEAM_ABBR : OPPONENT;
        
        console.log(`👥 Team selected: ${selectedTeam} (${teamName})`);
        
        // Hide team buttons, show call selection
        teamChoiceButtons.classList.add('hidden');
        callSelection.classList.remove('hidden');
        
        // Update the team name display in call selection
        const callingTeamName = document.getElementById('calling-team-name');
        if (callingTeamName) {
            callingTeamName.textContent = teamName;
        }
        
        // Store selected team in state
        window.coinTossState = { selectedTeam };
        
        // Add call selection handlers
        const headsBtn = document.getElementById('coin-heads');
        const tailsBtn = document.getElementById('coin-tails');
        
        if (headsBtn && tailsBtn) {
            headsBtn.removeEventListener('click', handleCoinToss);
            tailsBtn.removeEventListener('click', handleCoinToss);
            
            headsBtn.addEventListener('click', (e) => handleCoinCall(e, callSelection));
            tailsBtn.addEventListener('click', (e) => handleCoinCall(e, callSelection));
        }
    }
    
    function handleCoinCall(e, callSelection) {
        const call = e.target.dataset.result;
        const { selectedTeam } = window.coinTossState;
        const teamName = selectedTeam === 'home' ? TEAM_ABBR : OPPONENT;
        
        console.log(`🪙 Call: ${call.toUpperCase()} by ${teamName}`);
        
        // Randomly determine actual coin result
        const actualResult = Math.random() > 0.5 ? 'heads' : 'tails';
        const callWins = (call === actualResult);
        const winningTeam = callWins ? selectedTeam : (selectedTeam === 'home' ? 'away' : 'home');
        const winnerName = winningTeam === 'home' ? TEAM_ABBR : OPPONENT;
        
        console.log(`🎲 Actual result: ${actualResult.toUpperCase()} → ${winnerName} wins`);
        
        // Hide call selection, show result
        callSelection.classList.add('hidden');
        const coinResult = document.getElementById('coin-result');
        if (coinResult) {
            coinResult.classList.remove('hidden');
            
            const resultValue = document.getElementById('coin-result-value');
            const resultWinner = document.getElementById('coin-winner');
            const continueBtn = document.getElementById('coin-continue');
            
            if (resultValue) resultValue.textContent = actualResult.toUpperCase();
            if (resultWinner) resultWinner.textContent = `${winnerName} won the coin toss`;
            
            if (continueBtn) {
                continueBtn.addEventListener('click', () => {
                    const modal = document.getElementById('coin-toss-modal');
                    modal.classList.add('hidden');
                    setTimeout(() => showDeferModal(winningTeam), 300);
                });
            }
        }
    }
    
    function handleCoinToss(e) {
        // Legacy handler for direct heads/tails (not used in new flow)
        const result = e.target.closest('button').dataset.result;
        const modal = document.getElementById('coin-toss-modal');
        modal.classList.add('hidden');
        
        const actualResult = Math.random() > 0.5 ? 'heads' : 'tails';
        const home_wins = (result === actualResult);
        
        showToast(`Coin came up ${actualResult}. ${home_wins ? TEAM_ABBR : OPPONENT} wins!`, 'info');
        setTimeout(() => showDeferModal(home_wins ? 'home' : 'away'), 500);
    }
    
    function showDeferModal(winning_team) {
        const modal = document.getElementById('defer-modal');
        const msg = document.getElementById('defer-team-msg');
        msg.textContent = `${winning_team === 'home' ? TEAM_ABBR : OPPONENT} won the coin toss`;
        modal.classList.remove('hidden');
        
        document.getElementById('btn-defer').addEventListener('click', () => handleDeferDecision('defer', winning_team));
        document.getElementById('btn-play').addEventListener('click', () => handleDeferDecision('play', winning_team));
    }
    
    function handleDeferDecision(choice, winning_team) {
        const modal = document.getElementById('defer-modal');
        modal.classList.add('hidden');
        
        // Determine receiving team
        const receiving_team = winning_team === 'home' 
            ? (choice === 'defer' ? 'away' : 'home')
            : (choice === 'defer' ? 'home' : 'away');
        
        // Set possession: home team is offense, away team is defense
        state.coin_toss_complete = true;
        state.possession_team = receiving_team === 'home' ? 'home' : 'away';
        
        console.log('📍 Initial possession set to:', state.possession_team);
        
        showToast(`${receiving_team === 'home' ? TEAM_ABBR : OPPONENT} receives kickoff`, 'success');
        
        // Show play type buttons and kickoff form
        setTimeout(() => {
            updatePossessionDisplay();
            showPlayForm('kickoff');
        }, 300);
    }

    // =========================================================================
    // TOUCHDOWN FLOWS
    // =========================================================================
    function showTeamTdModal() {
        const modal = document.getElementById('team-td-modal');
        modal.classList.remove('hidden');

        document.getElementById('team-td-continue').onclick = () => {
            modal.classList.add('hidden');
            showPlayForm('extra_point');
        };
    }

    function showOpponentTdModal() {
        const modal = document.getElementById('opponent-td-modal');
        modal.classList.remove('hidden');

        document.getElementById('opp-ep-good').onclick = () => {
            modal.classList.add('hidden');
            state.opponent_score += 1;
            updateScoreboard();
            // Sync to server
            fetch(`/games/${GAME_ID}/tracker/update-score/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                body: JSON.stringify({ opponent_score: state.opponent_score }),
            });
            proceedToOpponentKickoff();
        };

        document.getElementById('opp-ep-miss').onclick = () => {
            modal.classList.add('hidden');
            proceedToOpponentKickoff();
        };
    }

    function proceedToOpponentKickoff() {
        // Opponent kicks off to us; after kickoff is recorded, flip possession to home
        state.pendingPossession = 'home';
        state.possession_team = 'away'; // opponent is kicking
        showPlayForm('kickoff');
    }

    // =========================================================================
    // PHASE HELPERS — called by postPlay after every successful snap
    // =========================================================================

    /** Apply any pending possession change and handle situation-based possession flips. */
    function resolvePossession(sit) {
        if (state.pendingPossession) {
            state.possession_team = state.pendingPossession;
            state.pendingPossession = null;
            console.log('📍 Possession resolved to:', state.possession_team);
        }
        if (sit === 'turnover' || sit === 'turnover_on_downs') {
            state.possession_team = state.possession_team === 'home' ? 'away' : 'home';
            console.log('🔄 Possession flipped to:', state.possession_team, '(' + sit + ')');
        } else if (sit === 'opponent_ball') {
            state.possession_team = 'away';
        } else if (sit === 'kickoff') {
            // Our team just scored and will kick off — receiver gets ball after kickoff
            state.pendingPossession = 'away';
        }
    }

    /** Trigger the appropriate UI transition based on the play situation. */
    function triggerNextPhase(sit) {
        if (sit === 'turnover' || sit === 'turnover_on_downs' || sit === 'opponent_ball') {
            setTimeout(() => resetToPlayTypeSelection(), 300);
        } else if (sit === 'extra_point') {
            setTimeout(() => showTeamTdModal(), 300);
        } else if (sit === 'kickoff') {
            setTimeout(() => showPlayForm('kickoff'), 300);
        } else if (sit === 'opponent_td') {
            showToast('Opponent TOUCHDOWN! +6', 'error');
            setTimeout(() => showOpponentTdModal(), 600);
        } else {
            resetToPlayTypeSelection();
        }
    }

    // =========================================================================
    // PLAY FORM MANAGEMENT
    // =========================================================================
    
    function updatePossessionDisplay() {
        const isOnOffense = state.possession_team === 'home';
        const offenseButtons = document.getElementById('play-type-buttons-offense');
        const defenseButtons = document.getElementById('play-type-buttons-defense');
        
        if (offenseButtons) {
            if (isOnOffense) {
                offenseButtons.classList.remove('hidden');
            } else {
                offenseButtons.classList.add('hidden');
            }
        }
        
        if (defenseButtons) {
            if (!isOnOffense) {
                defenseButtons.classList.remove('hidden');
            } else {
                defenseButtons.classList.add('hidden');
            }
        }
        
        console.log('📍 Possession:', isOnOffense ? 'HOME (Offense)' : 'AWAY (Defense)');
    }
    
    function showPlayForm(type) {
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
            case 'kickoff': formArea.innerHTML = buildKickoffForm(); break;
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
    }

    function resetToPlayTypeSelection() {
        state.currentForm = null;
        const formArea = document.getElementById('play-form-area');
        formArea.classList.add('hidden');
        formArea.innerHTML = '';
        document.getElementById('st-submenu').classList.add('hidden');
        updatePossessionDisplay();
        updateFieldViz(); // Redraw first-down line with updated possession_team
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
            <div class="mb-3">
                <label class="form-label">Notes</label>
                <input type="text" id="play_notes" class="form-control" placeholder="Optional notes...">
            </div>
            ${buildFormFooter('submit-pass', 'Save Pass Play')}
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
            ${buildFormFooter('submit-penalty', 'Save Penalty', 'btn-warning')}
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
            <div class="mb-3">
                <label class="form-label">Notes</label>
                <input type="text" id="play_notes" class="form-control" placeholder="Optional notes...">
            </div>
            ${buildFormFooter('submit-punt', 'Save Punt')}
        </div>`;
    }

    function buildFieldGoalForm() {
        // Calculate distance from current ball position to opponent's endzone (50)
        const currentPos = state.ball_position || 0;
        const distanceToEndzone = 50 - currentPos;
        const defaultDistance = Math.max(17, distanceToEndzone + 10); // Add 10 yards for the end zone depth plus long snapper distance
        
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
        const yards = parseInt(getInputVal('yards_gained', '0')) || 0;
        const autoFirst = autoFirstDown(yards);

        await postPlay('run', {
            ball_carrier: getSelectVal('ball_carrier'),
            yards_gained: yards,
            is_touchdown: getToggleState('is_touchdown'),
            is_first_down: getToggleState('is_first_down') || autoFirst,
            fumbled: getToggleState('fumbled'),
            fumble_lost: getToggleState('fumbled'),
            notes: getInputVal('play_notes', ''),
        });
    }

    async function submitPass() {
        const wasSacked = getToggleState('was_sacked');
        const yards = parseInt(getInputVal('yards_gained', '0'));
        const effectiveYards = wasSacked ? 0 : yards;
        const autoFirst = !wasSacked && autoFirstDown(effectiveYards);

        await postPlay('pass', {
            quarterback: getSelectVal('quarterback'),
            receiver: getSelectVal('receiver'),
            is_complete: getToggleState('is_complete'),
            yards_gained: effectiveYards,
            is_touchdown: getToggleState('is_touchdown'),
            is_first_down: getToggleState('is_first_down') || autoFirst,
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

    async function submitDefense() {
        // Determine selected play_result
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

        await postPlay('defense', {
            primary_player: getSelectVal('primary_player'),
            play_result: playResult,
            tackle_yards: parseInt(getInputVal('tackle_yards', '0')) || 0,
            opponent_play_type: oppPlayType,
            is_defensive_touchdown: getToggleState('def_td') || false,
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
            // Tell backend WHO RECEIVES (not who kicks) for correct ball_pos_after calculation.
            // pendingPossession is set to the receiver before showPlayForm('kickoff') in all flows.
            receiving_team: state.pendingPossession || (state.possession_team === 'home' ? 'away' : 'home'),
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
        if (detail && detail.is_defensive_touchdown) badges += ' <span class="feed-badge-td">DEF TD</span>';
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
    // Accessibility helpers: enlarge hit-area support and keyboard handlers
    function _isNativeInteractive(el) {
        return ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
    }

    function makeInteractive(el) {
        if (!el) return;
        if (!_isNativeInteractive(el)) {
            el.setAttribute('role', 'button');
            el.setAttribute('tabindex', '0');
        }

        // Toggle aria-pressed when relevant
        if (el.classList.contains('toggle-btn')) {
            el.setAttribute('aria-pressed', el.dataset.active === 'true' ? 'true' : 'false');
        }

        // Keyboard activation (Enter / Space)
        el.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                el.click();
            }
        });

        // Touch: map touchstart to click to increase hit responsiveness
        el.addEventListener('touchstart', function () {
            // allow native scrolling if this is within a scrollable area and user is swiping
            el.click();
        }, { passive: true });
    }

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

    // Undo button
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
        undoBtn.addEventListener('click', undoLastPlay);
        makeInteractive(undoBtn);
    }

    // Score taps
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

    // Delegated events on form area (support click + touchstart)
    const playFormArea = document.getElementById('play-form-area');

    function autoCalculateTouchdownYardage(isTouchdown) {
        if (!isTouchdown) return;
        
        const yardsInput = document.getElementById('yards_gained');
        if (!yardsInput) return;
        
        // Calculate distance to endzone from current ball position
        const currentPos = state.ball_position || 0;
        const yardsNeeded = 50 - currentPos;
        
        // Set yards to minimum distance to reach endzone
        yardsInput.value = Math.max(1, yardsNeeded);
        console.log(`📍 Auto-calculated TD yardage: ${yardsInput.value} yards (from ${ballPosDisplay(currentPos)} to endzone)`);
    }

    function handleFormInteraction(e) {
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

            // Reflect aria-pressed
            if (target.classList.contains('toggle-btn')) {
                target.setAttribute('aria-pressed', target.dataset.active === 'true' ? 'true' : 'false');
            }

            // Auto-calculate yardage for offensive touchdowns (run or pass)
            if (field === 'is_touchdown' && target.dataset.active === 'true') {
                autoCalculateTouchdownYardage(true);
            }
            
            // Auto-calculate yardage for defensive touchdowns
            if (field === 'def_td' && target.dataset.active === 'true') {
                const defTdInput = document.getElementById('tackle_yards');
                if (defTdInput) {
                    const currentPos = state.ball_position || 0;
                    const yardsReturned = 50 - currentPos; // Distance to opposite endzone
                    defTdInput.value = Math.max(1, yardsReturned);
                    console.log(`🏈 Auto-calculated Defensive TD return: ${defTdInput.value} yards`);
                }
            }
            
            // Auto-calculate yardage for kickoff touchbacks (ball goes to 20-yard line)
            if (field === 'is_touchback' && target.dataset.active === 'true') {
                const kickYardsInput = document.getElementById('kick_yards');
                if (kickYardsInput) {
                    // Touchback = returned to 20-yard line (ball_position = -25 from owner's perspective)
                    // Calculate kick distance as the full field (100 yards to get to far endzone)
                    kickYardsInput.value = 100;
                    console.log('📍 Auto-calculated Touchback: 100-yard field touchback (returned to 20-yard line)');
                }
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
            case 'submit-defense': submitDefense(); break;
        }
    }

    if (playFormArea) {
        playFormArea.addEventListener('click', handleFormInteraction);
        playFormArea.addEventListener('touchstart', handleFormInteraction, { passive: true });
    }

    // =========================================================================
    // INITIAL RENDER
    // =========================================================================
    updateScoreboard();
    updateFieldViz();
    updatePossessionDisplay();
    
    // If game hasn't had coin toss yet, show coin toss modal
    if (!state.coin_toss_complete) {
        showCoinTossModal();
    }

})();
