/**
 * submit_handlers.js — Non-runtime reference module.
 * Extracted from tracker.js for documentation/migration purposes.
 * Exposes: window.TrackerModules.submitHandlers
 *
 * In the runtime tracker.js these functions close over the module-scope `state`,
 * `GAME_ID`, and sibling functions. Here they accept those as explicit parameters.
 */
(function () {
    'use strict';

    // -------------------------------------------------------------------------
    // DOM VALUE HELPERS
    // -------------------------------------------------------------------------

    /** getToggleState(id) → boolean — reads data-active on #toggle-<id> */
    function getToggleState(id) {
        const el = document.getElementById('toggle-' + id);
        return el ? el.dataset.active === 'true' : false;
    }

    /** getSelectVal(id) → string | null */
    function getSelectVal(id) {
        const el = document.getElementById(id);
        return el ? (el.value || null) : null;
    }

    /** getInputVal(id, fallback) → string */
    function getInputVal(id, fallback) {
        const el = document.getElementById(id);
        return el ? (el.value || fallback) : fallback;
    }

    // -------------------------------------------------------------------------
    // PLAY SUBMISSION
    // Each submit function collects form values and calls postPlay(endpoint, data).
    // postPlay signature (from ajax.js):
    //   postPlay(endpoint, data, GAME_ID, state, showToast, updateScoreboard,
    //            addPlayToFeed, resetToPlayTypeSelection, showPlayForm)
    // -------------------------------------------------------------------------

    /** submitRun(state, postPlay) */
    async function submitRun(state, postPlay) {
        const yards = parseInt(getInputVal('yards_gained', '0')) || 0;
        const autoFirst = (yards >= (state.distance || 10));

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

    /** submitPass(state, postPlay) */
    async function submitPass(state, postPlay) {
        const wasSacked = getToggleState('was_sacked');
        const yards = parseInt(getInputVal('yards_gained', '0'));
        const effectiveYards = wasSacked ? 0 : yards;
        const autoFirst = (!wasSacked && effectiveYards >= (state.distance || 10));

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

    /** submitPenalty(postPlay) */
    async function submitPenalty(postPlay) {
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

    /** submitDefense(postPlay) */
    async function submitDefense(postPlay) {
        let playResult = 'TACKLE';
        if (getToggleState('def_sack'))       playResult = 'SACK';
        else if (getToggleState('def_int'))   playResult = 'INT';
        else if (getToggleState('def_frec'))  playResult = 'FREC';

        let oppPlayType = '';
        if (getToggleState('opp_run'))          oppPlayType = 'RUN';
        else if (getToggleState('opp_pass'))    oppPlayType = 'PASS';
        else if (getToggleState('opp_punt'))    oppPlayType = 'PUNT';
        else if (getToggleState('opp_fg'))      oppPlayType = 'FG';
        else if (getToggleState('opp_kickoff')) oppPlayType = 'KICKOFF';

        await postPlay('defense', {
            primary_player: getSelectVal('primary_player'),
            play_result: playResult,
            tackle_yards: parseInt(getInputVal('tackle_yards', '0')) || 0,
            opponent_play_type: oppPlayType,
            is_defensive_touchdown: getToggleState('def_td') || false,
            notes: getInputVal('play_notes', ''),
        });
    }

    /** submitKickoff(postPlay) */
    async function submitKickoff(postPlay) {
        await postPlay('kickoff', {
            kicker: getSelectVal('kicker'),
            kick_yards: parseInt(getInputVal('kick_yards', '60')),
            is_touchback: getToggleState('is_touchback'),
            is_onside_kick: getToggleState('is_onside_kick'),
            out_of_bounds: getToggleState('out_of_bounds'),
            notes: getInputVal('play_notes', ''),
        });
    }

    /** submitPunt(postPlay) */
    async function submitPunt(postPlay) {
        await postPlay('punt', {
            punter: getSelectVal('punter'),
            punt_yards: parseInt(getInputVal('punt_yards', '40')),
            is_touchback: getToggleState('is_touchback'),
            is_blocked: getToggleState('is_blocked'),
            out_of_bounds: getToggleState('out_of_bounds'),
            notes: getInputVal('play_notes', ''),
        });
    }

    /** submitFieldGoal(postPlay) */
    async function submitFieldGoal(postPlay) {
        let result = 'MISS';
        if (getToggleState('fg_good'))       result = 'GOOD';
        else if (getToggleState('fg_block')) result = 'BLOCK';

        await postPlay('field-goal', {
            kicker: getSelectVal('kicker'),
            kick_distance: parseInt(getInputVal('kick_distance', '30')),
            result: result,
            notes: getInputVal('play_notes', ''),
        });
    }

    /** submitExtraPoint(postPlay) */
    async function submitExtraPoint(postPlay) {
        let attemptType = 'KICK';
        if (getToggleState('two_pt_run'))       attemptType = '2PT_RUN';
        else if (getToggleState('two_pt_pass')) attemptType = '2PT_PASS';

        const result = getToggleState('ep_good') ? 'GOOD' : 'MISS';

        await postPlay('extra-point', {
            attempt_type: attemptType,
            result: result,
            kicker: attemptType === 'KICK' ? getSelectVal('ep_kicker') : null,
            notes: getInputVal('play_notes', ''),
        });
    }

    // -------------------------------------------------------------------------
    // UNDO
    // -------------------------------------------------------------------------

    /**
     * undoLastPlay(state, GAME_ID, getCSRFToken, updateScoreboard, showToast)
     *   Confirms with user, POSTs to /games/<GAME_ID>/tracker/undo/,
     *   updates state scores, removes the first item from #plays-feed.
     */
    async function undoLastPlay(state, GAME_ID, getCSRFToken, updateScoreboard, showToast) {
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
                updateScoreboard(state);
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

    // -------------------------------------------------------------------------
    // PLAY FEED
    // -------------------------------------------------------------------------

    /**
     * addPlayToFeed(summary, detail, state)
     *   Prepend a new .feed-item to #plays-feed (the correct runtime DOM ID).
     *   Removes any .feed-empty placeholder. Trims feed to 15 items.
     *   detail may include: { yards, is_touchdown, is_defensive_touchdown, is_interception }
     *
     *   NOTE: The earlier ui_helpers.js stub used '#recent-plays' which is
     *   incorrect. The runtime tracker.js and this module both use '#plays-feed'.
     */
    function addPlayToFeed(summary, detail, state) {
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
        if (detail && detail.is_touchdown)           badges += ' <span class="feed-badge-td">TD</span>';
        if (detail && detail.is_defensive_touchdown) badges += ' <span class="feed-badge-td">DEF TD</span>';
        if (detail && detail.is_interception)        badges += ' <span class="feed-badge-int">INT</span>';

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

    // -------------------------------------------------------------------------
    // ACCESSIBILITY
    // -------------------------------------------------------------------------

    function _isNativeInteractive(el) {
        return ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
    }

    /**
     * makeInteractive(el)
     *   Adds role/tabindex for non-native elements, aria-pressed for toggle-btns,
     *   Enter/Space keyboard activation, and touchstart→click mapping.
     */
    function makeInteractive(el) {
        if (!el) return;
        if (!_isNativeInteractive(el)) {
            el.setAttribute('role', 'button');
            el.setAttribute('tabindex', '0');
        }

        if (el.classList.contains('toggle-btn')) {
            el.setAttribute('aria-pressed', el.dataset.active === 'true' ? 'true' : 'false');
        }

        el.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                el.click();
            }
        });

        el.addEventListener('touchstart', function () {
            el.click();
        }, { passive: true });
    }

    // -------------------------------------------------------------------------
    // TD AUTO-YARDAGE
    // -------------------------------------------------------------------------

    /**
     * autoCalculateTouchdownYardage(state)
     *   When TD toggle activates, set #yards_gained to the distance from current
     *   ball position to the opponent's endzone.
     */
    function autoCalculateTouchdownYardage(state) {
        const yardsInput = document.getElementById('yards_gained');
        if (!yardsInput) return;
        const currentPos = state.ball_position || 0;
        const yardsNeeded = 50 - currentPos;
        yardsInput.value = Math.max(1, yardsNeeded);
    }

    // -------------------------------------------------------------------------
    // DELEGATED FORM INTERACTION
    // -------------------------------------------------------------------------

    /**
     * handleFormInteraction(e, state, deps)
     *   Single click/touchstart handler delegated from #play-form-area.
     *   Handles: quick-yard buttons, toggle buttons (including radio groups),
     *   penalty item selection, and submit/cancel actions.
     *
     *   deps: {
     *     submitRun, submitPass, submitPenalty, submitDefense, submitKickoff,
     *     submitPunt, submitFieldGoal, submitExtraPoint,
     *     resetToPlayTypeSelection,
     *     autoCalculateTouchdownYardage,
     *     postPlay,   // passed through to submit fns
     *   }
     */
    function handleFormInteraction(e, state, deps) {
        const evTarget = e.target;
        const target = evTarget.closest('[data-action]')
            || evTarget.closest('.quick-yard-btn')
            || evTarget.closest('.toggle-btn')
            || evTarget.closest('.penalty-item');
        if (!target) return;

        // -- Quick yard buttons --
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
                    if (oppSection) {
                        oppSection.style.display = parseInt(input.value) !== 0 ? '' : 'none';
                    }
                }
            }
            return;
        }

        // -- Toggle buttons --
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

            target.setAttribute('aria-pressed', target.dataset.active === 'true' ? 'true' : 'false');

            // Auto-calculate yardage for offensive touchdowns
            if (field === 'is_touchdown' && target.dataset.active === 'true') {
                deps.autoCalculateTouchdownYardage(state);
            }

            // Auto-calculate yardage for defensive touchdowns
            if (field === 'def_td' && target.dataset.active === 'true') {
                const defTdInput = document.getElementById('tackle_yards');
                if (defTdInput) {
                    const currentPos = state.ball_position || 0;
                    defTdInput.value = Math.max(1, 50 - currentPos);
                }
            }

            // Auto-set kick distance for touchback
            if (field === 'is_touchback' && target.dataset.active === 'true') {
                const kickYardsInput = document.getElementById('kick_yards');
                if (kickYardsInput) {
                    kickYardsInput.value = 100;
                }
            }

            return;
        }

        // -- Penalty item selection --
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

        // -- Submit / cancel actions --
        const action = target.dataset.action;
        if (!action) return;

        switch (action) {
            case 'cancel':              deps.resetToPlayTypeSelection(state); break;
            case 'submit-run':          deps.submitRun(state, deps.postPlay); break;
            case 'submit-pass':         deps.submitPass(state, deps.postPlay); break;
            case 'submit-penalty':      deps.submitPenalty(deps.postPlay); break;
            case 'submit-kickoff':      deps.submitKickoff(deps.postPlay); break;
            case 'submit-punt':         deps.submitPunt(deps.postPlay); break;
            case 'submit-field-goal':   deps.submitFieldGoal(deps.postPlay); break;
            case 'submit-extra-point':  deps.submitExtraPoint(deps.postPlay); break;
            case 'submit-defense':      deps.submitDefense(deps.postPlay); break;
        }
    }

    // -------------------------------------------------------------------------
    // EXPORT
    // -------------------------------------------------------------------------
    window.TrackerModules = window.TrackerModules || {};
    window.TrackerModules.submitHandlers = {
        getToggleState,
        getSelectVal,
        getInputVal,
        submitRun,
        submitPass,
        submitPenalty,
        submitDefense,
        submitKickoff,
        submitPunt,
        submitFieldGoal,
        submitExtraPoint,
        undoLastPlay,
        addPlayToFeed,
        makeInteractive,
        autoCalculateTouchdownYardage,
        handleFormInteraction,
    };
})();
