"""
Pure state-machine logic for the live game tracker.

No Django imports — every function takes plain values and returns an
``Outcome``.  Scoring is expressed as data (``team_pts`` / ``opp_pts``)
rather than side effects so callers can both adjust the live score and
record per-snap score deltas for undo.

Coordinate frame: ball_position runs -50 (our endzone) .. 0 (midfield)
.. +50 (opponent endzone).

Rules follow the NFHS (high school) ruleset — free kicks from the 40,
all touchbacks to the 20. The authoritative rules ledger, including
documented simplifications, is docs/FOOTBALL-SEMANTICS.md.
"""
from dataclasses import dataclass

# DefenseSnap.PlayResult values, mirrored as plain strings so this module
# stays importable without Django.
INTERCEPTION = "INT"
FUMBLE_RECOVERY = "FREC"

# NFHS field-position constants, in the -50..+50 frame.
FREE_KICK_SPOT = -10        # our kickoff / free-kick spot: OWN 40
TOUCHBACK_SPOT = -30        # ball comes out to the receiving team's 20
SAFETY_FREE_KICK_SPOT = -30  # after conceding a safety we kick from OWN 20


@dataclass
class Outcome:
    """
    The result of applying one play: the next down/distance/ball position,
    a transient situation label (e.g. 'turnover', 'safety_kick'), and any
    points scored. Callers persist the points as per-snap undo deltas and
    apply them to the live score.
    """
    down: int | None
    distance: int | None
    ball_position: int
    situation: str
    team_pts: int = 0
    opp_pts: int = 0

    def as_state(self):
        """The next_state dict shape the tracker endpoints/JS consume."""
        return {
            'down': self.down,
            'distance': self.distance,
            'ball_position': self.ball_position,
            'situation': self.situation,
        }


def _clamp(pos):
    return max(-50, min(50, pos))


def first_down_distance(pos, attacking_positive):
    """
    Yards to gain on a fresh set of downs: 10, or the distance to the goal
    line when inside the 10 ("1st & Goal").
    """
    to_goal = (50 - pos) if attacking_positive else (pos + 50)
    return min(10, max(to_goal, 1))


def next_state_run_pass(state, result_data):
    """Run/pass plays, including TD, turnover, and safety outcomes."""
    down = state.get('down') or 1
    distance = state.get('distance') or 10
    ball_pos = state.get('ball_position') or 0
    yards = result_data.get('yards_gained', 0)

    # Touchdown → cap ball at endzone, then extra_point situation.
    if result_data.get('is_touchdown'):
        return Outcome(None, None, min(ball_pos + yards, 50), 'extra_point', team_pts=6)

    # Turnovers (interception, fumble lost) — the opponent takes over at
    # the spot, attacking toward our endzone.
    if result_data.get('is_interception') or result_data.get('fumble_lost'):
        new_pos = _clamp(ball_pos + yards)
        return Outcome(1, first_down_distance(new_pos, False), new_pos, 'turnover')

    # Safety: our ball carrier downed in our own endzone (opponent scores 2,
    # then we free-kick from our OWN 20 = -30 in our coordinate frame).
    if result_data.get('is_safety'):
        return Outcome(None, None, SAFETY_FREE_KICK_SPOT, 'safety', opp_pts=2)

    new_pos = _clamp(ball_pos + yards)
    new_distance = distance - yards

    if result_data.get('is_first_down') or new_distance <= 0:
        return Outcome(1, first_down_distance(new_pos, True), new_pos, 'normal')

    new_down = down + 1
    if new_down > 4:
        # Turnover on downs — opponent takes over at the spot.
        return Outcome(1, first_down_distance(new_pos, False), new_pos, 'turnover_on_downs')

    return Outcome(new_down, max(new_distance, 1), new_pos, 'normal')


def next_state_kickoff(play_data):
    """Kickoff: landing spot is pre-computed by the endpoint as ball_pos_after."""
    ball_pos_after = play_data.get('ball_pos_after', -25)
    if play_data.get('is_onside_kick'):
        sit = 'normal' if play_data.get('onside_recovered') else 'opponent_ball'
    else:
        # Possession from ball location:
        #   ball_pos_after < 0  → ball in our territory  → we received → 'normal'
        #   ball_pos_after >= 0 → ball in their territory → they received → 'opponent_ball'
        sit = 'normal' if ball_pos_after < 0 else 'opponent_ball'
    return Outcome(1, first_down_distance(ball_pos_after, sit == 'normal'),
                   ball_pos_after, sit)


def next_state_punt(state, play_data):
    """Punts, including blocked-punt recoveries and return touchdowns."""
    ball_pos = state.get('ball_position') or 0

    if play_data.get('is_blocked'):
        # Blocked punt: ball is live at/near the line of scrimmage.
        if play_data.get('blocked_td'):
            return Outcome(None, None, 50, 'extra_point', team_pts=6)
        if play_data.get('blocked_recovered_by', 'opponent') == 'us':
            return Outcome(1, first_down_distance(ball_pos, True), ball_pos, 'normal')
        return Outcome(1, first_down_distance(ball_pos, False), ball_pos, 'opponent_ball')

    if play_data.get('is_touchback'):
        # Touchback: opponent gets the ball at their own 20.
        return Outcome(1, 10, -TOUCHBACK_SPOT, 'opponent_ball')
    new_pos = _clamp(ball_pos + play_data.get('punt_yards', 0))
    return Outcome(1, first_down_distance(new_pos, False), new_pos, 'opponent_ball')


def next_state_field_goal(state, play_data):
    """Field goals: GOOD scores 3 and kicks off; miss/block is opponent ball."""
    ball_pos = state.get('ball_position') or 0
    if play_data.get('result', 'MISS') == 'GOOD':
        # We kick off from our own 40 (NFHS free-kick spot).
        return Outcome(None, None, FREE_KICK_SPOT, 'kickoff', team_pts=3)
    # Miss/block → opponent ball at the spot, or their 20 when the attempt
    # came from inside it (NFHS touchback: most short misses reach the endzone).
    new_pos = min(ball_pos, -TOUCHBACK_SPOT)
    return Outcome(1, first_down_distance(new_pos, False), new_pos, 'opponent_ball')


def next_state_extra_point(play_data):
    """Extra point / 2-pt conversion → we kick off from our own 40."""
    pts = 0
    if play_data.get('result') == 'GOOD':
        pts = 1 if play_data.get('attempt_type', 'KICK') == 'KICK' else 2
    return Outcome(None, None, FREE_KICK_SPOT, 'kickoff', team_pts=pts)


def next_state_penalty(state, play_data):
    """
    Penalties in our-offense frame. Enforcement is capped at half the
    distance to the penalized team's goal line; declined penalties replay
    the down; loss-of-down penalties (intentional grounding) consume it.
    """
    down = state.get('down') or 1
    distance = state.get('distance') or 10
    ball_pos = state.get('ball_position') or 0

    if not play_data.get('accepted', True):
        # Declined: yardage not applied, no play occurred, repeat the same down.
        return Outcome(down, distance, ball_pos, 'normal')

    pen_yards = play_data.get('penalty_yards', 0)
    if play_data.get('on_offense', True):
        # Against us: enforced toward our goal, half-the-distance capped.
        enforced = min(pen_yards, (ball_pos + 50) // 2)
        new_pos = ball_pos - enforced
        new_distance = distance + enforced
    else:
        # Against their defense: enforced toward their goal.
        enforced = min(pen_yards, (50 - ball_pos) // 2)
        new_pos = ball_pos + enforced
        new_distance = distance - enforced

    if play_data.get('auto_first_down', False) or new_distance <= 0:
        return Outcome(1, first_down_distance(new_pos, True), new_pos, 'normal')

    if play_data.get('loss_of_down', False):
        # e.g. intentional grounding: yardage plus the down.
        new_down = down + 1
        if new_down > 4:
            return Outcome(1, first_down_distance(new_pos, False), new_pos,
                           'turnover_on_downs')
        return Outcome(new_down, max(new_distance, 1), new_pos, 'normal')

    # Ordinary accepted penalties replay the down.
    return Outcome(down, max(new_distance, 1), new_pos, 'normal')


def next_state_defense(state, play_result, *, return_yards=0, tackle_yards=0,
                       is_defensive_touchdown=False):
    """
    Defensive snaps. Positive tackle_yards = opponent gained; negative = we
    pushed them back. Turnovers (INT/FREC) give us the ball at the return spot.
    """
    ball_pos = state.get('ball_position') or 0
    down = state.get('down') or 1
    dist = state.get('distance') or 10

    # Defensive TD = our team scored (pick-six, fumble return, etc.).
    if is_defensive_touchdown:
        return Outcome(None, None, ball_pos, 'extra_point', team_pts=6)

    if play_result in (INTERCEPTION, FUMBLE_RECOVERY):
        new_pos = ball_pos + return_yards
        if new_pos <= -50:
            # Returner downed in our own endzone — touchback, ball to our 20.
            return Outcome(1, 10, TOUCHBACK_SPOT, 'turnover')
        new_pos = _clamp(new_pos)
        return Outcome(1, first_down_distance(new_pos, True), new_pos, 'turnover')

    # Opponent crossed our goal line → opponent TD.
    if ball_pos > -50 and ball_pos - tackle_yards <= -50 and tackle_yards > 0:
        return Outcome(None, None, -50, 'opponent_td', opp_pts=6)

    # Defensive safety: we pushed the opponent into their own endzone.
    if tackle_yards < 0 and ball_pos - tackle_yards >= 50:
        # Opponent free-kicks to us from their own 20 (= +30 in our frame).
        return Outcome(None, None, -SAFETY_FREE_KICK_SPOT, 'safety_kick', team_pts=2)

    new_ball_pos = _clamp(ball_pos - tackle_yards)
    new_distance = dist - tackle_yards
    new_down = down + 1

    if new_distance <= 0:
        # Opponent earned a fresh set, attacking toward our endzone.
        return Outcome(1, first_down_distance(new_ball_pos, False), new_ball_pos, 'normal')
    if new_down > 4:
        # They failed on downs — our ball, attacking their endzone.
        return Outcome(1, first_down_distance(new_ball_pos, True), new_ball_pos,
                       'turnover_on_downs')
    return Outcome(new_down, max(new_distance, 1), new_ball_pos, 'normal')


def compute_outcome(current_state, play_type, play_data, result_data=None):
    """
    Dispatch to the per-play-type function. Mirrors the historical
    compute_next_state ordering: touchdown/turnover/safety outcomes take
    precedence over the play_type branch.
    """
    result_data = result_data or {}
    state = current_state or {}

    if (result_data.get('is_touchdown') or result_data.get('is_interception')
            or result_data.get('fumble_lost') or result_data.get('is_safety')):
        return next_state_run_pass(state, result_data)

    if play_type == 'kickoff':
        return next_state_kickoff(play_data)
    if play_type == 'punt':
        return next_state_punt(state, play_data)
    if play_type == 'field_goal':
        return next_state_field_goal(state, play_data)
    if play_type == 'extra_point':
        return next_state_extra_point(play_data)
    if play_type == 'penalty':
        return next_state_penalty(state, play_data)

    return next_state_run_pass(state, result_data)
