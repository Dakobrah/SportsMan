# 05 — Live Game Tracker

← [04 — Frontend Views](04-frontend-views.md) | Next: [06 — Report Services](06-report-services.md)

The tracker is the most complex component in the project. It is a single-page-app experience inside a Django template, where all play recording happens via AJAX without page reloads.

---

## Architecture Overview

```
Browser (tracker.html)
│
│  On page load:
│  ├── game_state_data from {% json_script %} → state object
│  ├── players_data from {% json_script %} → player arrays
│  └── If is_new_game → show coin toss modal
│
│  Play recording flow:
│  1. Coach taps "Offense" or "Defense" or "Special Teams"
│  2. showPlayForm(type) → buildXxxForm() injects form HTML into #form-area
│  3. Coach fills in form (player selects, toggle buttons, yards)
│  4. Coach taps "Record Play"
│  5. submitXxx() → postPlay(endpoint, data) → fetch POST to Django
│  6. Django saves snap → returns {success, play_id, play_summary, play_detail, next_state, team_score, opponent_score}
│  7. JS: update state + scoreboard + addPlayToFeed + handle situation
│
Django AJAX endpoints (tracker.py):
  /games/<pk>/tracker/run/          → tracker_add_run
  /games/<pk>/tracker/pass/         → tracker_add_pass
  /games/<pk>/tracker/penalty/      → tracker_add_penalty
  /games/<pk>/tracker/kickoff/      → tracker_add_kickoff
  /games/<pk>/tracker/punt/         → tracker_add_punt
  /games/<pk>/tracker/field-goal/   → tracker_add_field_goal
  /games/<pk>/tracker/extra-point/  → tracker_add_extra_point
  /games/<pk>/tracker/defense/      → tracker_add_defense
  /games/<pk>/tracker/update-score/ → tracker_update_score
  /games/<pk>/tracker/undo/         → tracker_undo_play
  /games/<pk>/tracker/plays/        → tracker_recent_plays (GET)
  /games/<pk>/tracker/coin-toss/    → tracker_coin_toss
  /games/<pk>/tracker/defer/        → tracker_defer_decision
```

---

## Backend — `apps/frontend/tracker.py`

### Helper Functions

```python
# ── Utilities ──────────────────────────────────────────────────────────────
def _get_next_sequence(game):
    # last = game.snaps.order_by('-sequence_number').values_list('sequence_number').first()
    # return (last or 0) + 1

def _ball_pos_display(pos):
    # None → "—"
    # 0    → "50"
    # < 0  → f"OWN {50 + pos}"  (e.g. -25 → "OWN 25")
    # > 0  → f"OPP {50 - pos}"  (e.g. +30 → "OPP 20")

def _format_down(down):
    # 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th"

def _snap_to_dict(snap):
    # {id, sequence_number, quarter, down, distance, ball_position,
    #  ball_position_display, notes, type: type(snap).__name__}

# ── Shared endpoint helpers (eliminate boilerplate across 9 AJAX views) ────
def _parse_request(request, pk):
    # game = get_object_or_404(Game, pk=pk)
    # return game, json.loads(request.body)

def _player_name(player, fallback=''):
    # return f"#{player.number} {player.last_name}" if player else fallback

def _adjust_score(game, *, team_pts=0, opp_pts=0):
    # Increments team_score and/or opponent_score and calls game.save(update_fields=[...])
    # Only saves fields that were changed — no-op if both are 0.

def _current_state(data):
    # return {'down': data.get('down'), 'distance': data.get('distance'),
    #         'ball_position': data.get('ball_position')}

def _tracker_response(play, summary, detail, next_state, game):
    # return JsonResponse({'success': True, 'play_id': play.id, 'play_summary': summary,
    #     'play_detail': detail, 'next_state': next_state,
    #     'team_score': game.team_score, 'opponent_score': game.opponent_score})

def _defense_next_state(play, ball_pos, down, dist, tackle_yds, game):
    # Encapsulates the opponent-drive state machine for tracker_add_defense.
    # Turnover (INT/FREC) → {'down':1,'distance':10,'ball_position':ball_pos,'situation':'turnover'}
    # Opponent TD (ball crosses -50) → _adjust_score(game,opp_pts=6);
    #                                  {'situation':'opponent_td','down':None,'distance':None}
    # Normal advance → new_ball_pos = clamp(ball_pos - tackle_yds, -50, 50)
    #   if new_distance <= 0 → first down for opponent
    #   if new_down > 4      → turnover on downs (possession back to home)
    #   else                 → continue same opponent drive
```

### `compute_next_state(current_state, play_type, play_data, result_data)`

The state engine. Returns a dict with `down`, `distance`, `ball_position`, `situation`.

```python
def compute_next_state(current_state, play_type, play_data, result_data):
    # current_state is a plain dict — access via .get(), not attributes
    down     = current_state.get('down') or 1
    distance = current_state.get('distance') or 10
    ball_pos = current_state.get('ball_position') or 0
    yards    = result_data.get('yards_gained', 0)

    # Touchdown (any play type)
    if result_data.get('is_touchdown'):
        return {'down': None, 'distance': None,
                'ball_position': min(ball_pos + yards, 50),  # capped at 50 only (not -50)
                'situation': 'extra_point'}

    # Offensive turnover (INT or fumble lost)
    if result_data.get('is_interception') or result_data.get('fumble_lost'):
        return {'down': 1, 'distance': 10, 'ball_position': max(min(-(ball_pos + yards), 50), -50),
                'situation': 'turnover'}

    # Kickoff
    if play_type == 'kickoff':
        if play_data.get('is_touchback'):
            return {'down': 1, 'distance': 10, 'ball_position': -25, 'situation': 'normal'}
        # Live return — default to opponent 20-yard line (return yards not tracked)
        return {'down': 1, 'distance': 10, 'ball_position': -20, 'situation': 'normal'}

    # Punt
    if play_type == 'punt':
        punt_yards = play_data.get('punt_yards', 0)
        if play_data.get('is_touchback'):
            return {'down': 1, 'distance': 10, 'ball_position': -20, 'situation': 'opponent_ball'}
        return {'down': 1, 'distance': 10,
                'ball_position': max(min(-(ball_pos + punt_yards), 50), -50),
                'situation': 'opponent_ball'}

    # Field goal
    if play_type == 'field_goal':
        if play_data.get('result') == 'GOOD':
            return {'down': None, 'distance': None, 'ball_position': 35, 'situation': 'kickoff'}
        return {'down': 1, 'distance': 10, 'ball_position': -ball_pos, 'situation': 'opponent_ball'}

    # Extra point / 2pt conversion
    if play_type == 'extra_point':
        return {'down': None, 'distance': None, 'ball_position': 35, 'situation': 'kickoff'}

    # Penalty
    if play_type == 'penalty':
        pen_yards = play_data.get('penalty_yards', 0)
        on_us     = play_data.get('on_offense', True)
        accepted  = play_data.get('accepted', True)
        if not accepted:
            return {'down': down + 1, 'distance': distance, 'ball_position': ball_pos,
                    'situation': 'normal'}
        new_pos  = ball_pos - pen_yards if on_us else ball_pos + pen_yards
        new_dist = distance + pen_yards if on_us else distance - pen_yards
        if play_data.get('auto_first_down') or new_dist <= 0:
            return {'down': 1, 'distance': 10, 'ball_position': new_pos, 'situation': 'normal'}
        # NOTE: repeat_down flag is read but repeat_down_num = down either way (bug in code)
        return {'down': down, 'distance': new_dist, 'ball_position': new_pos, 'situation': 'normal'}

    # Normal run/pass
    new_pos  = ball_pos + yards
    new_dist = distance - yards
    if result_data.get('is_first_down') or new_dist <= 0:
        return {'down': 1, 'distance': 10, 'ball_position': max(min(new_pos, 50), -50),
                'situation': 'normal'}
    new_down = down + 1
    if new_down > 4:
        return {'down': 1, 'distance': 10, 'ball_position': max(min(-new_pos, 50), -50),
                'situation': 'turnover_on_downs'}
    return {'down': new_down, 'distance': max(new_dist, 1),
            'ball_position': max(min(new_pos, 50), -50),
            'situation': 'normal'}
```

### `game_tracker(request, pk)` — Page View

```python
@login_required
def game_tracker(request, pk):
    game = get_object_or_404(Game.objects.select_related('season', 'season__team'), pk=pk)
    team = game.season.team
    players = Player.objects.filter(team=team, is_active=True).order_by('number')
    last_snap = game.snaps.order_by('-sequence_number').first()
    is_new_game = not last_snap

    game_state = {
        'quarter': last_snap.quarter if last_snap else 1,
        'down': last_snap.down if last_snap else 1,
        'distance': last_snap.distance if last_snap else 10,
        'ball_position': last_snap.ball_position if last_snap else -25,
        'next_sequence': (last_snap.sequence_number + 1) if last_snap else 1,
        'team_score': game.team_score,
        'opponent_score': game.opponent_score,
        'coin_toss_complete': not is_new_game,
        'possession_team': None,
    }
    players_list = list(players.values('id','number','first_name','last_name','position'))
    return render(request, 'games/tracker.html', {
        'game': game, 'team': team, 'players': players,
        'game_state_data': game_state, 'players_data': players_list,
        'recent_plays': game.snaps.order_by('-sequence_number')[:10],
    })
```

### AJAX Endpoint Response Shape

All play-recording endpoints return:

```json
{
    "success": true,
    "play_id": 42,
    "play_summary": "#12 Smith run for 5 yds",
    "play_detail": {
        "type": "Run",
        "sequence": 7,
        "quarter": 2,
        "yards": 5,
        "is_touchdown": false,
        "is_first_down": false
    },
    "next_state": {
        "down": 2,
        "distance": 5,
        "ball_position": 5,
        "situation": "normal"
    },
    "team_score": 7,
    "opponent_score": 0
}
```

`situation` values:
| Value | Meaning |
|-------|---------|
| `normal` | Continue same drive, next down |
| `extra_point` | Our TD scored — show PAT/2pt form |
| `kickoff` | After our score — show kickoff form |
| `turnover` | INT or fumble lost — flip possession |
| `turnover_on_downs` | 4th down failure — flip possession |
| `opponent_ball` | Punt or missed FG — opponent takes over |
| `opponent_td` | Opponent crossed our goal line on a defensive snap — +6 opp, show opponent TD modal |

### `tracker_add_run` — Run Play

```python
@login_required @require_POST
def tracker_add_run(request, pk):
    game = get_object_or_404(Game, pk=pk)
    data = json.loads(request.body)
    yards_gained = data.get('yards_gained', 0)
    ball_pos = data.get('ball_position', 0)
    fumble_lost = data.get('fumble_lost', False)
    is_touchdown = data.get('is_touchdown', False)

    # Auto-detect TD if ball crosses endzone
    if not fumble_lost and ball_pos + yards_gained >= 50:
        is_touchdown = True

    play = RunPlay.objects.create(
        game=game, sequence_number=_get_next_sequence(game),
        quarter=data['quarter'], down=data['down'], distance=data['distance'],
        ball_position=data['ball_position'],
        ball_carrier_id=data.get('ball_carrier') or None,
        yards_gained=yards_gained, is_touchdown=is_touchdown,
        is_first_down=data.get('is_first_down', False),
        fumble_lost=fumble_lost,
    )

    if is_touchdown:
        game.team_score += 6
        game.save(update_fields=['team_score'])

    summary = f"RUN: {yards_gained} yds"
    if play.ball_carrier:
        summary = f"#{play.ball_carrier.number} {play.ball_carrier.last_name} - {summary}"

    next_state = compute_next_state(
        current_state=data,
        play_type='run',
        play_data=data,
        result_data={'yards_gained': yards_gained, 'is_touchdown': is_touchdown,
                     'fumble_lost': fumble_lost, 'is_first_down': play.is_first_down}
    )
    return JsonResponse({'success': True, 'play_id': play.id, 'play_summary': play_summary,
                         'play_detail': {...}, 'next_state': next_state,
                         'team_score': game.team_score, 'opponent_score': game.opponent_score})
```

### `tracker_add_defense` — Defense Play

```python
@login_required @require_POST
def tracker_add_defense(request, pk):
    game, data = _parse_request(request, pk)
    tackle_yds = data.get('tackle_yards') or 0

    play = DefenseSnap.objects.create(
        game=game, sequence_number=_get_next_sequence(game),
        **_current_state(data), quarter=data['quarter'],
        play_result=data.get('play_result', 'TACKLE'),
        primary_player_id=data.get('primary_player') or None,
        tackle_yards=tackle_yds or None,
        opponent_play_type=data.get('opponent_play_type', ''),
        is_defensive_touchdown=data.get('is_defensive_touchdown', False),
    )

    summary = f"{_player_name(play.primary_player)} DEF: {play.get_play_result_display()}"
    next_state = _defense_next_state(
        play, data.get('ball_position') or 0,
        data.get('down') or 1, data.get('distance') or 10, tackle_yds, game
    )
    return _tracker_response(play, summary,
        {'type': 'Defense', 'sequence': play.sequence_number, 'quarter': play.quarter,
         'yards': tackle_yds, 'result': play.play_result,
         'opponent_play_type': play.opponent_play_type,
         'is_defensive_touchdown': play.is_defensive_touchdown},
        next_state, game)
```

### `tracker_undo_play`

```python
@login_required @require_POST
def tracker_undo_play(request, pk):
    game, _ = _parse_request(request, pk)
    last_snap = game.snaps.order_by('-sequence_number').first()
    if not last_snap:
        return JsonResponse({'success': False, 'error': 'No plays to undo'}, status=400)

    # Reverse score changes
    real_snap = last_snap.get_real_instance()
    if isinstance(real_snap, (RunPlay, PassPlay)) and real_snap.is_touchdown:
        game.team_score = max(0, game.team_score - 6)
        game.save(update_fields=['team_score'])
    elif isinstance(real_snap, FieldGoalSnap) and real_snap.result == 'GOOD':
        game.team_score = max(0, game.team_score - 3)
        game.save(update_fields=['team_score'])
    elif isinstance(real_snap, ExtraPointSnap) and real_snap.result == 'GOOD':
        pts = 1 if real_snap.attempt_type == 'KICK' else 2
        game.team_score = max(0, game.team_score - pts)
        game.save(update_fields=['team_score'])

    last_snap.delete()
    return JsonResponse({
        'success': True,
        'deleted': {'id': last_snap.id, 'sequence_number': last_snap.sequence_number},
        'team_score': game.team_score,
        'opponent_score': game.opponent_score,
    })
```

### Score Auto-Update Rules

| Play | Auto-Score Change |
|------|------------------|
| Run/Pass TD | `team_score += 6` |
| FG Good | `team_score += 3` |
| PAT Kick Good | `team_score += 1` |
| 2-Point Good | `team_score += 2` |
| Undo of any above | Reverses the change |

Score saved with `game.save(update_fields=['team_score'])` for efficiency.

---

## Frontend — `static/js/tracker.js`

IIFE (Immediately Invoked Function Expression) — entire tracker lives in a self-contained scope.

### State Object

```javascript
const state = {
    quarter: 1,
    down: 1,
    distance: 10,
    ball_position: -25,        // -50..+50 coordinate system
    next_sequence: 1,
    team_score: 0,
    opponent_score: 0,
    possession_team: 'home',   // 'home' | 'away' — set after coin toss
    currentForm: null,         // currently active form type string
    submitting: false,         // prevents double-submit
};
```

Initialized from `JSON.parse(document.getElementById('game-state-data').textContent)`.

### `postPlay(endpoint, data)`

Core AJAX function called by all `submitXxx()` functions.

```javascript
async function postPlay(endpoint, data) {
    if (state.submitting) return;
    state.submitting = true;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'X-CSRFToken': csrfToken},
        body: JSON.stringify({...data, ...currentStateFields()})
    });
    const result = await response.json();

    if (!result.success) {
        showError(result.error);
        state.submitting = false;
        return;
    }

    // 1. Update state from next_state
    if (result.next_state) {
        state.down          = result.next_state.down;
        state.distance      = result.next_state.distance;
        state.ball_position = result.next_state.ball_position;
    }
    state.team_score     = result.team_score;
    state.opponent_score = result.opponent_score;
    state.next_sequence++;

    // 2. Resolve possession BEFORE redrawing so first-down line direction is correct
    const sit = result.next_state?.situation;
    resolvePossession(sit);

    // 3. Redraw scoreboard (calls updateFieldViz internally)
    updateScoreboard();

    // 4. Update feed and trigger UI phase transition
    addPlayToFeed(result.play_summary, result.play_detail);
    showToast('Play saved', 'success');
    triggerNextPhase(sit);
}
```

### Phase Helpers

```javascript
// Called once per play, BEFORE updateScoreboard(), so field viz draws correctly.
function resolvePossession(sit) {
    // Apply pendingPossession first (e.g. receiver of a kickoff)
    if (state.pendingPossession) {
        state.possession_team = state.pendingPossession;
        state.pendingPossession = null;
    }
    // Then apply situation-specific flip
    if (sit === 'turnover' || sit === 'turnover_on_downs')
        state.possession_team = state.possession_team === 'home' ? 'away' : 'home';
    else if (sit === 'opponent_ball')
        state.possession_team = 'away';
    else if (sit === 'kickoff')
        state.pendingPossession = 'away'; // receiver after our kickoff
}

// Drives the UI transition after a play is saved.
function triggerNextPhase(sit) {
    if (['turnover', 'turnover_on_downs', 'opponent_ball'].includes(sit))
        setTimeout(() => resetToPlayTypeSelection(), 300);
    else if (sit === 'extra_point')
        setTimeout(() => showTeamTdModal(), 300);
    else if (sit === 'kickoff')
        setTimeout(() => showPlayForm('kickoff'), 300);
    else if (sit === 'opponent_td') {
        showToast('Opponent TOUCHDOWN! +6', 'error');
        setTimeout(() => showOpponentTdModal(), 600);
    } else
        resetToPlayTypeSelection();
}
```

### `showPlayForm(type)`

```javascript
function showPlayForm(type) {
    state.currentForm = type;
    const formArea = document.getElementById('form-area');

    switch(type) {
        case 'run':
            formArea.innerHTML = buildRunForm();
            break;
        case 'pass':
            formArea.innerHTML = buildPassForm();
            break;
        case 'defense':
            formArea.innerHTML = buildDefenseForm();
            // Attach input listener for opponent play type visibility
            const tyInput = document.getElementById('tackle_yards');
            if (tyInput) {
                const oppSection = document.getElementById('opponent-play-type-section');
                tyInput.addEventListener('input', () => {
                    oppSection.style.display = parseInt(tyInput.value) !== 0 ? '' : 'none';
                });
            }
            break;
        case 'penalty':     formArea.innerHTML = buildPenaltyForm(); break;
        case 'kickoff':     formArea.innerHTML = buildKickoffForm(); break;
        case 'punt':        formArea.innerHTML = buildPuntForm(); break;
        case 'field_goal':  formArea.innerHTML = buildFieldGoalForm(); break;
        case 'extra_point': formArea.innerHTML = buildExtraPointForm(); break;
    }

    // Show submit button, hide play-type grid
    document.getElementById('play-type-buttons').style.display = 'none';
    document.getElementById('form-area-container').style.display = '';
}
```

### `resetToPlayTypeSelection()`

```javascript
function resetToPlayTypeSelection() {
    state.currentForm = null;
    document.getElementById('form-area').innerHTML = '';
    document.getElementById('form-area-container').style.display = 'none';
    document.getElementById('play-type-buttons').style.display = '';
    updatePossessionDisplay();   // ← shows correct offense/defense buttons for possession_team
}
```

### `updatePossessionDisplay()`

```javascript
function updatePossessionDisplay() {
    const isHome     = state.possession_team === 'home';
    const offenseBtn = document.getElementById('btn-offense');
    const defenseBtn = document.getElementById('btn-defense');

    if (isHome) {
        offenseBtn.style.display = '';
        defenseBtn.style.display = 'none';
    } else {
        offenseBtn.style.display = 'none';
        defenseBtn.style.display = '';
    }
    // Update possession indicator label
}
```

### `handleFormInteraction(event)`

Delegated event listener on the form area. Handles:

**Toggle buttons:**
```javascript
if (target.classList.contains('toggle-btn')) {
    const id = target.dataset.toggleId;

    // Check if this toggle belongs to a radio group (mutually exclusive)
    const radioGroup = radioGroups.find(group => group.includes(id));
    if (radioGroup) {
        // Deactivate all others in the group, activate this one
        radioGroup.forEach(gid => setToggleState(gid, false));
        setToggleState(id, true);
    } else {
        // Simple boolean toggle
        setToggleState(id, !getToggleState(id));
    }
}
```

**Quick-yard buttons:**
```javascript
if (target.classList.contains('quick-yard-btn')) {
    const yards = target.dataset.yards;
    const inputId = target.dataset.inputTarget;
    const input = document.getElementById(inputId)
               || document.getElementById('yards_gained')
               || document.getElementById('tackle_yards');
    if (input) {
        input.value = yards;
        // For defense form: show/hide opponent play type section
        if (input.id === 'tackle_yards') {
            const oppSection = document.getElementById('opponent-play-type-section');
            if (oppSection) {
                oppSection.style.display = parseInt(yards) !== 0 ? '' : 'none';
            }
        }
    }
}
```

### Radio Groups

Mutually exclusive toggle sets. Only one button in each group can be active at a time.

```javascript
const radioGroups = [
    ['fg_good', 'fg_miss', 'fg_block'],              // FG result
    ['ep_good', 'ep_miss', 'ep_block', 'ep_fail'],   // Extra point result
    ['def_tackle', 'def_sack', 'def_int', 'def_frec'], // Defense play result
    ['opp_run', 'opp_pass', 'opp_punt', 'opp_fg', 'opp_kickoff'], // Opponent play type
    ['pen_accepted', 'pen_declined'],                 // Penalty accepted/declined
];
```

### Shared Form Helpers

```javascript
// Returns true when yards earned satisfy current distance-to-gain
function autoFirstDown(yards) { return yards >= (state.distance || 10); }

// Renders a standard submit + cancel button pair — used by every form builder.
// btnClass defaults to 'btn-primary'; override for colour-coded forms (run→success, defense→danger).
function buildFormFooter(action, label, btnClass = 'btn-primary') { ... }
```

### Form Builders (Pseudocode)

All 8 form builders call `buildFormFooter(action, label, btnClass)` for their submit/cancel pair.

```javascript
function buildRunForm() {
    return `
        <select id="ball_carrier">       <!-- filtered to RB/WR/QB/FB -->
        ${buildQuickYards()}             <!-- -5 / 0 / +2 / +4 / +7 / +10 / +20 buttons -->
        <input id="yards_gained" type="number">
        ${buildToggle('is_touchdown', 'TD')}
        ${buildToggle('fumble_lost', 'Fumble Lost')}
        <input id="play_notes" placeholder="Notes">
        ${buildFormFooter('submit-run', 'Save Run Play', 'btn-success')}
    `;
}

function buildPassForm() {
    return `
        <select id="quarterback">        <!-- filtered to QB position -->
        <select id="receiver">           <!-- all players -->
        ${buildQuickYards()}
        <input id="yards_gained">
        ${buildToggle('is_complete', 'Complete')}
        ${buildToggle('is_touchdown', 'TD')}
        ${buildToggle('is_interception', 'INT')}
        ${buildToggle('was_sacked', 'Sack')}
        <button onclick="submitPass()">Record Play</button>
    `;
}

function buildDefenseForm() {
    return `
        <select id="primary_player">     <!-- all players -->
        <!-- Play result radio group: Tackle / Sack / INT / Fumble Rec -->
        ${buildToggle('def_sack', 'Sack', 'toggle-sack')}
        ${buildToggle('def_int', 'INT', 'toggle-int')}
        ${buildToggle('def_frec', 'FREC', 'toggle-frec')}
        <!-- Yards gained (labeled "Yards Gained by opponent") -->
        ${buildQuickYards()}
        <input id="tackle_yards" type="number">
        <!-- Opponent play type (hidden until yards > 0) -->
        <div id="opponent-play-type-section" style="display:none">
            ${buildToggle('opp_run', 'Run')}
            ${buildToggle('opp_pass', 'Pass')}
            ${buildToggle('opp_punt', 'Punt')}
            ${buildToggle('opp_fg', 'Field Goal')}
            ${buildToggle('opp_kickoff', 'Kickoff')}
        </div>
        ${buildToggle('def_td', 'DEF TD')}
        ${buildToggle('applied_pressure', 'Pressure')}
        <button onclick="submitDefense()">Record Play</button>
    `;
}

function buildPenaltyForm() {
    // 28 built-in penalty definitions with auto-populated yards and flag type
    // penalty_name select → auto-fills penalty_yards, on_offense
    // accepted/declined radio group
    // auto_first_down and repeat_down toggles
}

function buildFieldGoalForm() {
    // kicker select, kick_distance input
    // Result radio: Good / Miss / Blocked
}

function buildExtraPointForm() {
    // attempt_type radio: PAT Kick / 2pt Run / 2pt Pass
    // result radio: Good / Miss / Blocked / Failed
    // conditional player selects based on attempt_type
}
```

### `submitDefense()`

```javascript
async function submitDefense() {
    let playResult = 'TACKLE';
    if (getToggleState('def_sack'))  playResult = 'SACK';
    if (getToggleState('def_int'))   playResult = 'INT';
    if (getToggleState('def_frec'))  playResult = 'FREC';

    let oppPlayType = '';
    if (getToggleState('opp_run'))     oppPlayType = 'RUN';
    if (getToggleState('opp_pass'))    oppPlayType = 'PASS';
    if (getToggleState('opp_punt'))    oppPlayType = 'PUNT';
    if (getToggleState('opp_fg'))      oppPlayType = 'FG';
    if (getToggleState('opp_kickoff')) oppPlayType = 'KICKOFF';

    await postPlay('defense', {
        primary_player: getSelectVal('primary_player'),
        play_result: playResult,
        tackle_yards: parseInt(getInputVal('tackle_yards', '0')) || 0,
        opponent_play_type: oppPlayType,
        is_defensive_touchdown: getToggleState('def_td') || false,
        notes: getInputVal('play_notes', ''),
    });
}
```

### `addPlayToFeed(summary, detail)`

```javascript
function addPlayToFeed(summary, detail) {
    const feed = document.getElementById('plays-feed');
    const card = document.createElement('div');
    card.className = 'play-feed-item';

    let badges = '';
    if (detail.yards !== undefined) {
        const yardVal = detail.yards;
        const cls = yardVal > 0 ? 'badge-success' : (yardVal < 0 ? 'badge-danger' : 'badge-secondary');
        badges += `<span class="badge ${cls}">${yardVal > 0 ? '+' : ''}${yardVal} yds</span>`;
    }
    if (detail.is_touchdown)          badges += `<span class="badge badge-td">TD</span>`;
    if (detail.result === 'INT')      badges += `<span class="badge badge-int">INT</span>`;
    if (detail.result === 'FREC')     badges += `<span class="badge badge-frec">FREC</span>`;
    if (detail.is_defensive_touchdown) badges += `<span class="badge badge-def-td">DEF TD</span>`;

    card.innerHTML = `
        <div class="play-summary">${summary}</div>
        <div class="play-badges">${badges}</div>
        <div class="play-meta">Q${detail.quarter} | Play #${detail.sequence}</div>
    `;
    feed.prepend(card);  // Most recent at top
}
```

### `undoLastPlay()`

```javascript
async function undoLastPlay() {
    if (!confirm('Undo last play?')) return;
    const response = await fetch('/games/.../undo/', {method:'POST', headers:{...csrfToken}});
    const result = await response.json();
    if (result.success) {
        // Remove last item from feed
        const feed = document.getElementById('plays-feed');
        if (feed.firstChild) feed.removeChild(feed.firstChild);
        // Update score if returned
        if (result.score) { state.team_score = result.score.team_score; updateScoreboard(); }
    }
}
```

### Coin Toss Flow

```javascript
// On page load, if game_state.coin_toss_complete === false:
showCoinTossModal();

// Coach selects heads/tails → POST /coin-toss/ → returns coin_result
// Coach selects defer/play → POST /defer/ → returns receiving_team
// state.possession_team = receiving_team
// hideCoinTossModal()
// resetToPlayTypeSelection()  ← shows correct offense/defense buttons
```

---

## Template — `templates/games/tracker.html`

```html
{% extends "base.html" %}
{% block content %}
    <!-- Scoreboard -->
    <div id="scoreboard">
        <span id="team-score">{{ game.team_score }}</span>
        vs
        <span id="opp-score">{{ game.opponent_score }}</span>
        <span id="down-distance">{{ game_state.down }}&amp; {{ game_state.distance }}</span>
        <span id="ball-position">...</span>
        <span id="quarter">Q{{ game_state.quarter }}</span>
    </div>

    <!-- Field visualization (hash marks, ball marker) -->
    <div id="field-container">
        <div id="ball-marker"></div>
    </div>

    <!-- Play type buttons (shown when not in a form) -->
    <div id="play-type-buttons">
        <button id="btn-offense" onclick="showPlayForm('run')">Offense</button>
        <button id="btn-defense" onclick="showPlayForm('defense')">Defense</button>
        <button onclick="showSpecialTeamsMenu()">Special Teams</button>
        <button onclick="showPlayForm('penalty')">Penalty</button>
    </div>

    <!-- Special teams submenu -->
    <div id="st-submenu" style="display:none">
        <button onclick="showPlayForm('kickoff')">Kickoff</button>
        <button onclick="showPlayForm('punt')">Punt</button>
        <button onclick="showPlayForm('field_goal')">Field Goal</button>
        <button onclick="showPlayForm('extra_point')">PAT / 2pt</button>
        <button onclick="hideSpecialTeamsMenu()">Back</button>
    </div>

    <!-- Dynamic form area -->
    <div id="form-area-container" style="display:none">
        <div id="form-area"></div>
        <button onclick="resetToPlayTypeSelection()">Cancel</button>
    </div>

    <!-- Recent plays feed -->
    <div id="plays-feed">
        {% for snap in recent_plays %}...{% endfor %}
    </div>

    <!-- Score edit modal (tap on scoreboard to open) -->
    <div id="score-modal" class="modal">...</div>

    <!-- XSS-safe JSON embedding -->
    {{ game_state_data|json_script:"game-state-data" }}
    {{ players_data|json_script:"players-data" }}
{% endblock %}
{% block scripts %}
    <script src="{% static 'js/tracker.js' %}"></script>
{% endblock %}
```

---

→ Next: [06 — Report Services](06-report-services.md)
