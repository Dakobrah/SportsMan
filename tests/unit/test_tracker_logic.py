"""
Unit tests for the tracker state machine logic.

compute_next_state is a pure function — no DB needed for most cases.
_defense_next_state is also mostly pure except for the opponent-TD path,
which calls _adjust_score/game.save().
"""
import types
import pytest
from apps.frontend.tracker import compute_next_state, _defense_next_state
from apps.snaps.models import DefenseSnap
from tests.factories import GameFactory


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _state(down=1, distance=10, ball_pos=0):
    """Shorthand for a current_state dict."""
    return {'down': down, 'distance': distance, 'ball_position': ball_pos}


def _result(**kwargs):
    """Shorthand for a result_data dict."""
    return kwargs


def _defense_play(play_result, *, int_return=None, fumble_return=None):
    """Return a SimpleNamespace acting as a DefenseSnap with minimal fields set."""
    return types.SimpleNamespace(
        play_result=play_result,
        interception_return_yards=int_return,
        fumble_return_yards=fumble_return,
    )


# ---------------------------------------------------------------------------
# compute_next_state — run/pass normal plays
# ---------------------------------------------------------------------------

class TestComputeNextStateRunPass:
    """State transitions for run and pass plays without special outcomes."""

    def test_normal_gain_increments_down(self):
        state = compute_next_state(_state(1, 10, -25), 'run', {}, _result(yards_gained=4))
        assert state == {'down': 2, 'distance': 6, 'ball_position': -21, 'situation': 'normal'}

    def test_gain_exceeding_distance_gives_first_down(self):
        state = compute_next_state(_state(2, 5, -20), 'run', {}, _result(yards_gained=7))
        assert state['down'] == 1
        assert state['distance'] == 10
        assert state['situation'] == 'normal'

    def test_is_first_down_flag_forces_first_down(self):
        """Even with yards < distance, is_first_down=True resets to 1st & 10."""
        state = compute_next_state(_state(3, 8, -30), 'run', {}, _result(yards_gained=5, is_first_down=True))
        assert state['down'] == 1
        assert state['distance'] == 10
        assert state['situation'] == 'normal'

    def test_fourth_down_no_first_down_is_turnover_on_downs(self):
        state = compute_next_state(_state(4, 5, -20), 'run', {}, _result(yards_gained=3))
        assert state['situation'] == 'turnover_on_downs'

    def test_touchdown_returns_extra_point_situation(self):
        state = compute_next_state(_state(1, 5, 45), 'run', {}, _result(yards_gained=5, is_touchdown=True))
        assert state['situation'] == 'extra_point'
        assert state['down'] is None
        assert state['distance'] is None

    def test_interception_returns_turnover_situation(self):
        state = compute_next_state(_state(2, 8, -10), 'pass', {}, _result(yards_gained=0, is_interception=True))
        assert state['situation'] == 'turnover'
        assert state['down'] == 1
        assert state['distance'] == 10

    def test_fumble_lost_returns_turnover_situation(self):
        state = compute_next_state(_state(1, 10, -15), 'run', {}, _result(yards_gained=5, fumble_lost=True))
        assert state['situation'] == 'turnover'

    def test_safety_returns_safety_situation(self):
        state = compute_next_state(_state(2, 10, -45), 'run', {}, _result(yards_gained=-5, is_safety=True))
        assert state['situation'] == 'safety'
        assert state['ball_position'] == -20

    def test_ball_position_advances_correctly(self):
        state = compute_next_state(_state(1, 10, -30), 'run', {}, _result(yards_gained=8))
        assert state['ball_position'] == -22

    def test_ball_position_capped_at_field_boundary(self):
        """Gain past midfield is capped at 50."""
        state = compute_next_state(_state(1, 10, 45), 'run', {}, _result(yards_gained=20, is_touchdown=False))
        assert state['ball_position'] <= 50


# ---------------------------------------------------------------------------
# compute_next_state — special teams
# ---------------------------------------------------------------------------

class TestComputeNextStateSpecialTeams:

    def test_kickoff_normal_returns_normal(self):
        state = compute_next_state(_state(), 'kickoff', {'ball_pos_after': 25})
        assert state == {'down': 1, 'distance': 10, 'ball_position': 25, 'situation': 'normal'}

    def test_kickoff_onside_recovered_is_normal(self):
        state = compute_next_state(
            _state(), 'kickoff',
            {'is_onside_kick': True, 'onside_recovered': True, 'ball_pos_after': -15},
        )
        assert state['situation'] == 'normal'

    def test_kickoff_onside_not_recovered_is_opponent_ball(self):
        state = compute_next_state(
            _state(), 'kickoff',
            {'is_onside_kick': True, 'onside_recovered': False, 'ball_pos_after': -15},
        )
        assert state['situation'] == 'opponent_ball'

    def test_punt_normal(self):
        state = compute_next_state(_state(4, 5, -25), 'punt', {'punt_yards': 40})
        assert state['situation'] == 'opponent_ball'
        assert state['ball_position'] == 15   # -25 + 40

    def test_punt_touchback(self):
        state = compute_next_state(_state(4, 10, -5), 'punt', {'punt_yards': 60, 'is_touchback': True})
        assert state['situation'] == 'opponent_ball'
        assert state['ball_position'] == 30   # opponent OWN 20 = +30 from our frame

    def test_field_goal_good_triggers_kickoff(self):
        state = compute_next_state(_state(4, 3, 20), 'field_goal', {'result': 'GOOD'})
        assert state['situation'] == 'kickoff'
        assert state['ball_position'] == -15  # our OWN 35

    def test_field_goal_miss_gives_opponent_ball(self):
        state = compute_next_state(_state(4, 5, 20), 'field_goal', {'result': 'MISS'})
        assert state['situation'] == 'opponent_ball'

    def test_extra_point_triggers_kickoff(self):
        state = compute_next_state({'down': None, 'distance': None, 'ball_position': 3}, 'extra_point', {})
        assert state['situation'] == 'kickoff'
        assert state['ball_position'] == -15


# ---------------------------------------------------------------------------
# compute_next_state — penalties
# ---------------------------------------------------------------------------

class TestComputeNextStatePenalty:

    def test_penalty_on_offense_pushes_back(self):
        state = compute_next_state(
            _state(1, 10, -20), 'penalty',
            {'penalty_yards': 10, 'on_offense': True, 'accepted': True},
        )
        assert state['ball_position'] == -30
        assert state['distance'] == 20
        assert state['situation'] == 'normal'

    def test_penalty_on_defense_advances_ball(self):
        """15-yard penalty on defense with 10 to go: new_distance=-5 triggers auto-first."""
        state = compute_next_state(
            _state(2, 10, -20), 'penalty',
            {'penalty_yards': 15, 'on_offense': False, 'accepted': True},
        )
        assert state['ball_position'] == -5
        assert state['down'] == 1
        assert state['distance'] == 10  # auto-first fired because new_distance went negative

    def test_auto_first_down_penalty(self):
        state = compute_next_state(
            _state(3, 8, -30), 'penalty',
            {'penalty_yards': 5, 'on_offense': False, 'accepted': True, 'auto_first_down': True},
        )
        assert state['down'] == 1
        assert state['distance'] == 10

    def test_declined_penalty_keeps_state(self):
        state = compute_next_state(
            _state(2, 7, -15), 'penalty',
            {'penalty_yards': 10, 'on_offense': True, 'accepted': False},
        )
        assert state == {'down': 2, 'distance': 7, 'ball_position': -15, 'situation': 'normal'}


# ---------------------------------------------------------------------------
# _defense_next_state
# ---------------------------------------------------------------------------

class TestDefenseNextState:
    """State transitions after a defensive snap."""

    def test_interception_applies_return_yards(self):
        play = _defense_play(DefenseSnap.PlayResult.INTERCEPTION, int_return=8)
        state = _defense_next_state(play, ball_pos=25, down=2, dist=7, tackle_yds=0, game=None)
        assert state == {'down': 1, 'distance': 10, 'ball_position': 33, 'situation': 'turnover'}

    def test_interception_no_return_ball_stays(self):
        play = _defense_play(DefenseSnap.PlayResult.INTERCEPTION, int_return=None)
        state = _defense_next_state(play, ball_pos=15, down=1, dist=10, tackle_yds=0, game=None)
        assert state['ball_position'] == 15
        assert state['situation'] == 'turnover'

    def test_fumble_recovery_applies_return_yards(self):
        play = _defense_play(DefenseSnap.PlayResult.FUMBLE_RECOVERY, fumble_return=15)
        state = _defense_next_state(play, ball_pos=10, down=3, dist=5, tackle_yds=0, game=None)
        assert state['ball_position'] == 25
        assert state['situation'] == 'turnover'

    def test_tackle_advances_opponent_ball(self):
        """Opponent ran 5 yards toward our endzone (ball_pos decreases)."""
        play = _defense_play(DefenseSnap.PlayResult.TACKLE)
        state = _defense_next_state(play, ball_pos=20, down=1, dist=10, tackle_yds=5, game=None)
        assert state['ball_position'] == 15   # 20 - 5
        assert state['down'] == 2
        assert state['distance'] == 5

    def test_opponent_gains_first_down_resets(self):
        play = _defense_play(DefenseSnap.PlayResult.TACKLE)
        state = _defense_next_state(play, ball_pos=20, down=2, dist=5, tackle_yds=7, game=None)
        assert state['down'] == 1
        assert state['distance'] == 10
        assert state['situation'] == 'normal'

    def test_turnover_on_downs(self):
        play = _defense_play(DefenseSnap.PlayResult.TACKLE)
        state = _defense_next_state(play, ball_pos=30, down=4, dist=5, tackle_yds=3, game=None)
        assert state['situation'] == 'turnover_on_downs'

    @pytest.mark.django_db
    def test_opponent_td_adjusts_score(self):
        """Ball crossing our goal line (ball_pos - tackle_yds <= -50) fires opponent TD."""
        game = GameFactory(team_score=7, opponent_score=0)
        play = _defense_play(DefenseSnap.PlayResult.TACKLE)
        state = _defense_next_state(play, ball_pos=-45, down=1, dist=10, tackle_yds=10, game=game)
        game.refresh_from_db()
        assert state['situation'] == 'opponent_td'
        assert game.opponent_score == 6
