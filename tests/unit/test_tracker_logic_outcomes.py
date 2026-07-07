"""
Unit tests for the pure tracker_logic outcome functions — specifically the
scoring-as-data contract (team_pts/opp_pts feed both the live score and the
per-snap undo deltas).
"""
from apps.frontend.tracker_logic import (
    Outcome,
    compute_outcome,
    next_state_defense,
    next_state_extra_point,
    next_state_field_goal,
    next_state_kickoff,
    next_state_penalty,
    next_state_punt,
    next_state_run_pass,
)


def _state(down=1, distance=10, ball_pos=0):
    return {'down': down, 'distance': distance, 'ball_position': ball_pos}


class TestScoringAsData:

    def test_touchdown_scores_six(self):
        out = next_state_run_pass(_state(1, 5, 45), {'yards_gained': 5, 'is_touchdown': True})
        assert (out.team_pts, out.opp_pts) == (6, 0)
        assert out.situation == 'extra_point'

    def test_safety_scores_two_for_opponent(self):
        out = next_state_run_pass(_state(2, 10, -45), {'yards_gained': -5, 'is_safety': True})
        assert (out.team_pts, out.opp_pts) == (0, 2)
        assert out.ball_position == -30

    def test_normal_play_scores_nothing(self):
        out = next_state_run_pass(_state(1, 10, 0), {'yards_gained': 4})
        assert (out.team_pts, out.opp_pts) == (0, 0)

    def test_field_goal_good_scores_three(self):
        out = next_state_field_goal(_state(4, 3, 20), {'result': 'GOOD'})
        assert out.team_pts == 3
        assert out.situation == 'kickoff'

    def test_field_goal_miss_scores_nothing(self):
        out = next_state_field_goal(_state(4, 3, 20), {'result': 'MISS'})
        assert out.team_pts == 0
        assert out.situation == 'opponent_ball'

    def test_extra_point_kick_scores_one(self):
        out = next_state_extra_point({'attempt_type': 'KICK', 'result': 'GOOD'})
        assert out.team_pts == 1

    def test_two_point_conversion_scores_two(self):
        out = next_state_extra_point({'attempt_type': '2PT_RUN', 'result': 'GOOD'})
        assert out.team_pts == 2

    def test_missed_extra_point_scores_nothing(self):
        out = next_state_extra_point({'attempt_type': 'KICK', 'result': 'MISS'})
        assert out.team_pts == 0
        assert out.situation == 'kickoff'

    def test_blocked_punt_td_scores_six(self):
        out = next_state_punt(_state(4, 8, -20), {'is_blocked': True, 'blocked_td': True})
        assert out.team_pts == 6
        assert out.situation == 'extra_point'

    def test_blocked_punt_recovered_by_us_keeps_ball(self):
        out = next_state_punt(_state(4, 8, -20), {'is_blocked': True, 'blocked_recovered_by': 'us'})
        assert out.team_pts == 0
        assert out.situation == 'normal'
        assert out.ball_position == -20

    def test_defensive_touchdown_scores_six(self):
        out = next_state_defense(_state(1, 10, 20), 'INT',
                                 return_yards=30, is_defensive_touchdown=True)
        assert out.team_pts == 6
        assert out.situation == 'extra_point'

    def test_opponent_td_scores_six_for_opponent(self):
        out = next_state_defense(_state(1, 10, -45), 'TACKLE', tackle_yards=10)
        assert out.opp_pts == 6
        assert out.situation == 'opponent_td'

    def test_defensive_safety_scores_two(self):
        out = next_state_defense(_state(1, 10, 45), 'TACKLE', tackle_yards=-6)
        assert out.team_pts == 2
        assert out.situation == 'safety_kick'
        assert out.ball_position == 30  # opponent free-kicks from their 20


class TestFootballSemantics:
    """NFHS rules added in the semantics audit — see docs/FOOTBALL-SEMANTICS.md."""

    def test_first_and_goal_inside_the_ten(self):
        """A first down inside the opponent 10 is 1st & Goal, not 1st & 10."""
        out = next_state_run_pass(_state(2, 8, 35), {'yards_gained': 8})
        assert out.down == 1
        assert out.distance == 7  # ball at +43 → 7 to the goal line

    def test_turnover_gives_opponent_goal_to_go_near_our_goal(self):
        out = next_state_run_pass(_state(1, 10, -45), {'yards_gained': 0, 'fumble_lost': True})
        assert out.situation == 'turnover'
        assert out.distance == 5  # they take over at our 5 → 1st & Goal 5

    def test_defensive_takeaway_goal_to_go(self):
        out = next_state_defense(_state(1, 10, 40), 'INT', return_yards=4)
        assert out.situation == 'turnover'
        assert out.distance == 6  # our ball at +44 → 1st & Goal 6

    def test_penalty_half_the_distance_to_our_goal(self):
        """10-yard holding at our own 4 is enforced half the distance — the
        ball must never be spotted in the endzone."""
        out = next_state_penalty(_state(1, 10, -46), {
            'penalty_yards': 10, 'on_offense': True, 'accepted': True,
        })
        assert out.ball_position == -48  # our 2, not our goal line
        assert out.distance == 12

    def test_penalty_half_the_distance_to_their_goal(self):
        out = next_state_penalty(_state(1, 10, 44), {
            'penalty_yards': 15, 'on_offense': False, 'accepted': True,
        })
        assert out.ball_position == 47  # half of the 6 to goal, not +15

    def test_loss_of_down_penalty_consumes_the_down(self):
        """Intentional grounding: yardage plus the down."""
        out = next_state_penalty(_state(2, 10, 0), {
            'penalty_yards': 10, 'on_offense': True, 'accepted': True,
            'loss_of_down': True,
        })
        assert out.down == 3
        assert out.ball_position == -10
        assert out.distance == 20

    def test_loss_of_down_on_fourth_is_turnover_on_downs(self):
        out = next_state_penalty(_state(4, 5, 0), {
            'penalty_yards': 10, 'on_offense': True, 'accepted': True,
            'loss_of_down': True,
        })
        assert out.situation == 'turnover_on_downs'

    def test_missed_fg_from_inside_their_twenty_is_touchback(self):
        """NFHS: a short miss reaches the endzone — opponent out to their 20."""
        out = next_state_field_goal(_state(4, 3, 40), {'result': 'MISS'})
        assert out.ball_position == 30  # their 20
        assert out.situation == 'opponent_ball'

    def test_missed_fg_from_long_range_is_spot_of_kick(self):
        out = next_state_field_goal(_state(4, 8, 10), {'result': 'MISS'})
        assert out.ball_position == 10


class TestOutcomeShape:

    def test_as_state_matches_legacy_next_state_dict(self):
        out = Outcome(down=2, distance=6, ball_position=-21, situation='normal')
        assert out.as_state() == {
            'down': 2, 'distance': 6, 'ball_position': -21, 'situation': 'normal',
        }

    def test_compute_outcome_dispatches_by_play_type(self):
        assert compute_outcome(_state(), 'kickoff', {'ball_pos_after': -25}).situation == 'normal'
        assert compute_outcome(_state(4, 5, -25), 'punt', {'punt_yards': 40}).situation == 'opponent_ball'
        assert compute_outcome(_state(), 'penalty', {'penalty_yards': 5, 'accepted': False}).situation == 'normal'

    def test_result_flags_take_precedence_over_play_type(self):
        """Historical ordering: TD/turnover/safety outcomes win the dispatch."""
        out = compute_outcome(_state(1, 5, 45), 'run', {}, {'yards_gained': 5, 'is_touchdown': True})
        assert out.situation == 'extra_point'
