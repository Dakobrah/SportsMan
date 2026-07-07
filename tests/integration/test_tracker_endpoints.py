"""
HTTP-layer tests for the live tracker endpoints.

Covers the server-authoritative GameState contract:
- auth (anonymous redirect, wrong-team 403, no-team 403, staff bypass)
- snaps are stamped from SERVER state — client-submitted down/distance/
  ball_position/quarter are ignored
- GameState transitions (possession, situation, version, last_sequence)
- score deltas + prior_state snapshots on every snap
- undo: delta-based score restore, snapshot-based state rewind, manual
  score edits surviving undo, zero-snap undo, legacy NULL-prior_state fallback
- coin toss and quarter persistence
"""
import json

import pytest

from apps.games.models import GameState
from apps.snaps.models import BaseSnap, DefenseSnap
from tests.factories import (
    UserFactory,
    GameFactory,
    TeamFactory,
    RunPlayFactory,
)


def post_json(client, url, payload=None):
    return client.post(url, json.dumps(payload or {}), content_type='application/json')


@pytest.fixture
def game(db):
    return GameFactory(team_score=0, opponent_score=0)


@pytest.fixture
def coach(game):
    """A logged-in-able user on the game's team."""
    return UserFactory(team=game.season.team)


def make_state(game, **overrides):
    """Seed a known GameState mid-drive."""
    defaults = dict(
        quarter=2, down=2, distance=7, ball_position=-20, los_position=-20,
        possession='home', situation='normal', version=5, last_sequence=0,
    )
    defaults.update(overrides)
    return GameState.objects.create(game=game, **defaults)


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestTrackerAuth:

    def test_anonymous_redirected_to_login(self, client, game):
        response = post_json(client, f"/games/{game.pk}/tracker/run/", {'yards_gained': 5})
        assert response.status_code == 302
        assert 'login' in response['Location']

    def test_user_without_team_forbidden(self, client, game):
        client.force_login(UserFactory(team=None))
        response = post_json(client, f"/games/{game.pk}/tracker/run/", {'yards_gained': 5})
        assert response.status_code == 403

    def test_wrong_team_forbidden(self, client, game):
        client.force_login(UserFactory(team=TeamFactory()))
        response = post_json(client, f"/games/{game.pk}/tracker/run/", {'yards_gained': 5})
        assert response.status_code == 403

    def test_team_member_allowed(self, client, game, coach):
        client.force_login(coach)
        response = post_json(client, f"/games/{game.pk}/tracker/run/", {'yards_gained': 5})
        assert response.status_code == 200

    def test_staff_bypass(self, client, game):
        client.force_login(UserFactory(is_staff=True, team=None))
        response = post_json(client, f"/games/{game.pk}/tracker/run/", {'yards_gained': 5})
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# Server-authoritative state
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestServerAuthoritativeState:

    def test_client_submitted_state_is_ignored(self, client, game, coach):
        """Bogus down/distance/ball_position/quarter in the payload must not
        leak into the snap — it is stamped from GameState."""
        make_state(game)  # Q2, 2nd & 7 at OWN 30 (-20)
        client.force_login(coach)

        response = post_json(client, f"/games/{game.pk}/tracker/run/", {
            'yards_gained': 3,
            'down': 4, 'distance': 99, 'ball_position': 45, 'quarter': 4,
        })
        assert response.status_code == 200

        snap = BaseSnap.objects.get(game=game)
        assert snap.quarter == 2
        assert snap.down == 2
        assert snap.distance == 7
        assert snap.ball_position == -20

        data = response.json()
        assert data['next_state'] == {
            'down': 3, 'distance': 4, 'ball_position': -17, 'situation': 'normal',
        }

    def test_play_advances_game_state_and_version(self, client, game, coach):
        gs = make_state(game)
        client.force_login(coach)

        post_json(client, f"/games/{game.pk}/tracker/run/", {'yards_gained': 3})

        gs.refresh_from_db()
        assert gs.down == 3
        assert gs.distance == 4
        assert gs.ball_position == -17
        assert gs.los_position == -17  # LOS follows the ball: next snap spot
        assert gs.version == 6
        assert gs.last_sequence == 1

    def test_los_moves_when_line_to_gain_reached_exactly(self, client, game, coach):
        """Gaining exactly the needed yards starts a new series — the LOS
        must sit at the ball, not lag at the previous snap spot."""
        gs = make_state(game, down=2, distance=7, ball_position=-20, los_position=-25)
        client.force_login(coach)

        post_json(client, f"/games/{game.pk}/tracker/run/", {'yards_gained': 7})

        gs.refresh_from_db()
        assert gs.down == 1 and gs.distance == 10
        assert gs.ball_position == -13
        assert gs.los_position == -13

    def test_los_moves_when_line_to_gain_passed(self, client, game, coach):
        gs = make_state(game, down=2, distance=7, ball_position=-20, los_position=-25)
        client.force_login(coach)

        post_json(client, f"/games/{game.pk}/tracker/run/", {'yards_gained': 12})

        gs.refresh_from_db()
        assert gs.down == 1
        assert gs.ball_position == -8
        assert gs.los_position == -8

    def test_los_follows_ball_on_defensive_plays(self, client, game, coach):
        """The LOS tracks the ball on every play, including defensive snaps
        that do NOT give the opponent a first down."""
        gs = make_state(game, possession='away', down=1, distance=10,
                        ball_position=20, los_position=20)
        client.force_login(coach)

        post_json(client, f"/games/{game.pk}/tracker/defense/",
                  {'play_result': 'TACKLE', 'tackle_yards': 5})
        gs.refresh_from_db()
        assert (gs.down, gs.ball_position, gs.los_position) == (2, 15, 15)

        post_json(client, f"/games/{game.pk}/tracker/defense/",
                  {'play_result': 'TACKLE', 'tackle_yards': 4})
        gs.refresh_from_db()
        assert (gs.down, gs.ball_position, gs.los_position) == (3, 11, 11)

    def test_response_keeps_legacy_keys_and_adds_state(self, client, game, coach):
        make_state(game)
        client.force_login(coach)

        data = post_json(client, f"/games/{game.pk}/tracker/run/", {'yards_gained': 3}).json()
        for key in ('success', 'play_id', 'play_summary', 'play_detail',
                    'next_state', 'team_score', 'opponent_score'):
            assert key in data
        assert data['version'] == 6
        assert data['state']['down'] == 3
        assert data['state']['possession'] == 'home'

    def test_lazy_gamestate_created_from_last_snap(self, client, game, coach):
        """Games recorded before GameState existed get a state derived from
        their last snap on first use."""
        RunPlayFactory(game=game, sequence_number=1, quarter=3, down=2,
                       distance=4, ball_position=10)
        client.force_login(coach)

        post_json(client, f"/games/{game.pk}/tracker/run/", {'yards_gained': 4})

        gs = game.live_state
        assert gs.quarter == 3
        assert gs.last_sequence == 2  # derived 1, then advanced by the new play
        # New snap stamped from the derived state, not client data
        snap = game.snaps.get(sequence_number=2)
        assert snap.quarter == 3
        assert snap.down == 2
        assert snap.ball_position == 10


# ---------------------------------------------------------------------------
# Scoring plays: deltas, possession, situations
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestScoringPlays:

    def test_touchdown_run(self, client, game, coach):
        gs = make_state(game, down=1, distance=5, ball_position=45, los_position=45)
        client.force_login(coach)

        data = post_json(client, f"/games/{game.pk}/tracker/run/", {'yards_gained': 10}).json()

        game.refresh_from_db()
        gs.refresh_from_db()
        assert game.team_score == 6
        assert data['next_state']['situation'] == 'extra_point'
        assert gs.situation == 'extra_point'
        assert gs.possession == 'home'
        snap = BaseSnap.objects.get(game=game)
        assert snap.score_delta_team == 6
        assert snap.score_delta_opponent == 0
        assert snap.prior_state['down'] == 1
        assert snap.prior_state['ball_position'] == 45

    def test_offensive_safety(self, client, game, coach):
        gs = make_state(game, ball_position=-45, los_position=-45)
        client.force_login(coach)

        data = post_json(client, f"/games/{game.pk}/tracker/run/", {'yards_gained': -6}).json()

        game.refresh_from_db()
        gs.refresh_from_db()
        assert game.opponent_score == 2
        assert data['next_state']['situation'] == 'safety'
        assert gs.situation == 'free_kick_us'
        assert gs.ball_position == -30  # our OWN 20 free-kick spot
        snap = BaseSnap.objects.get(game=game)
        assert snap.score_delta_opponent == 2

    def test_turnover_on_downs_flips_possession(self, client, game, coach):
        gs = make_state(game, down=4, distance=5)
        client.force_login(coach)

        data = post_json(client, f"/games/{game.pk}/tracker/run/", {'yards_gained': 2}).json()

        gs.refresh_from_db()
        assert data['next_state']['situation'] == 'turnover_on_downs'
        assert gs.possession == 'away'
        assert gs.situation == 'normal'

    def test_defensive_touchdown(self, client, game, coach):
        gs = make_state(game, possession='away')
        client.force_login(coach)

        data = post_json(client, f"/games/{game.pk}/tracker/defense/", {
            'play_result': 'INT',
            'is_defensive_touchdown': True,
            'interception_return_yards': 30,
        }).json()

        game.refresh_from_db()
        gs.refresh_from_db()
        assert game.team_score == 6
        assert data['next_state']['situation'] == 'extra_point'
        assert gs.situation == 'extra_point'
        assert gs.possession == 'home'
        snap = DefenseSnap.objects.get(game=game)
        assert snap.score_delta_team == 6

    def test_defensive_safety(self, client, game, coach):
        gs = make_state(game, possession='away', ball_position=45, los_position=45)
        client.force_login(coach)

        data = post_json(client, f"/games/{game.pk}/tracker/defense/", {
            'play_result': 'TACKLE',
            'tackle_yards': -6,
        }).json()

        game.refresh_from_db()
        gs.refresh_from_db()
        assert game.team_score == 2
        assert data['next_state']['situation'] == 'safety_kick'
        assert gs.situation == 'free_kick_opp'
        assert gs.possession == 'away'  # opponent free-kicks to us
        snap = DefenseSnap.objects.get(game=game)
        assert snap.score_delta_team == 2

    def test_defense_infers_away_possession(self, client, game, coach):
        """Recording a defensive snap self-corrects possession to away."""
        gs = make_state(game, possession='home')
        client.force_login(coach)

        post_json(client, f"/games/{game.pk}/tracker/defense/", {
            'play_result': 'TACKLE', 'tackle_yards': 3,
        })

        gs.refresh_from_db()
        assert gs.possession == 'away'


@pytest.mark.django_db
class TestBlockedPunt:

    def _punt(self, client, game, payload):
        return post_json(client, f"/games/{game.pk}/tracker/punt/", payload).json()

    def test_blocked_recovered_by_us(self, client, game, coach):
        gs = make_state(game, down=4)
        client.force_login(coach)
        data = self._punt(client, game, {'is_blocked': True, 'blocked_recovered_by': 'us'})
        gs.refresh_from_db()
        assert data['next_state']['situation'] == 'normal'
        assert gs.possession == 'home'
        assert gs.down == 1 and gs.distance == 10

    def test_blocked_recovered_by_opponent(self, client, game, coach):
        gs = make_state(game, down=4)
        client.force_login(coach)
        data = self._punt(client, game, {'is_blocked': True, 'blocked_recovered_by': 'opponent'})
        gs.refresh_from_db()
        assert data['next_state']['situation'] == 'opponent_ball'
        assert gs.possession == 'away'

    def test_blocked_returned_for_td(self, client, game, coach):
        gs = make_state(game, down=4)
        client.force_login(coach)
        data = self._punt(client, game, {
            'is_blocked': True, 'blocked_recovered_by': 'us', 'blocked_td': True,
        })
        game.refresh_from_db()
        gs.refresh_from_db()
        assert game.team_score == 6
        assert data['next_state']['situation'] == 'extra_point'
        assert gs.possession == 'home'
        snap = BaseSnap.objects.get(game=game)
        assert snap.score_delta_team == 6


# ---------------------------------------------------------------------------
# Coin toss, quarter, kickoff fallback
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestGameSetup:

    def test_coin_toss_persisted(self, client, game, coach):
        client.force_login(coach)
        data = post_json(client, f"/games/{game.pk}/tracker/coin-toss/", {
            'winner': 'away', 'choice': 'defer',
        }).json()

        gs = game.live_state
        assert data['receiving_team'] == 'home'
        assert gs.coin_toss_winner == 'away'
        assert gs.coin_toss_choice == 'defer'
        assert gs.possession == 'away'  # kicking team holds the ball to kick
        assert gs.situation == 'kickoff'

    def test_coin_toss_invalid_data(self, client, game, coach):
        client.force_login(coach)
        response = post_json(client, f"/games/{game.pk}/tracker/coin-toss/", {
            'winner': 'heads', 'choice': 'defer',
        })
        assert response.status_code == 400

    def test_quarter_persisted(self, client, game, coach):
        gs = make_state(game)
        client.force_login(coach)
        post_json(client, f"/games/{game.pk}/tracker/update-quarter/", {'quarter': 3})
        gs.refresh_from_db()
        assert gs.quarter == 3
        assert gs.version == 6

    def test_quarter_invalid(self, client, game, coach):
        make_state(game)
        client.force_login(coach)
        assert post_json(client, f"/games/{game.pk}/tracker/update-quarter/",
                         {'quarter': 'x'}).status_code == 400
        assert post_json(client, f"/games/{game.pk}/tracker/update-quarter/",
                         {'quarter': 0}).status_code == 400

    def test_kickoff_receiving_team_falls_back_to_state(self, client, game, coach):
        """After the coin toss the kickoff derives the receiving team from
        possession (the kicking side) when the client omits it."""
        client.force_login(coach)
        post_json(client, f"/games/{game.pk}/tracker/coin-toss/", {
            'winner': 'home', 'choice': 'receive',
        })

        data = post_json(client, f"/games/{game.pk}/tracker/kickoff/", {
            'kick_yards': 40,
        }).json()

        gs = game.live_state
        gs.refresh_from_db()
        # Home receives → ball at our 20 (-30), we're on offense.
        assert data['next_state'] == {
            'down': 1, 'distance': 10, 'ball_position': -30, 'situation': 'normal',
        }
        assert gs.possession == 'home'
        assert gs.situation == 'normal'

    def test_reload_seed_survives_restart(self, client, game, coach):
        """The tracker page seeds possession/quarter/coin-toss from GameState —
        the original 'reload loses everything' defect."""
        client.force_login(coach)
        post_json(client, f"/games/{game.pk}/tracker/coin-toss/", {
            'winner': 'home', 'choice': 'receive',
        })
        post_json(client, f"/games/{game.pk}/tracker/kickoff/", {'kick_yards': 40})
        post_json(client, f"/games/{game.pk}/tracker/update-quarter/", {'quarter': 2})

        state = game.live_state
        state.refresh_from_db()
        assert state.possession == 'home'
        assert state.quarter == 2
        assert state.coin_toss_winner == 'home'
        # situation not pregame → the page will report coin_toss_complete=True


# ---------------------------------------------------------------------------
# Undo
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestUndo:

    def test_undo_restores_state_and_score(self, client, game, coach):
        gs = make_state(game, down=1, distance=5, ball_position=45, los_position=45)
        client.force_login(coach)

        post_json(client, f"/games/{game.pk}/tracker/run/", {'yards_gained': 10})
        game.refresh_from_db()
        assert game.team_score == 6

        data = post_json(client, f"/games/{game.pk}/tracker/undo/").json()

        game.refresh_from_db()
        gs.refresh_from_db()
        assert data['success'] is True
        assert game.team_score == 0
        assert game.snaps.count() == 0
        assert gs.down == 1
        assert gs.distance == 5
        assert gs.ball_position == 45
        assert gs.possession == 'home'
        assert gs.situation == 'normal'
        assert gs.last_sequence == 0
        assert gs.version == 7  # play bump + undo bump

    def test_manual_score_edit_survives_undo(self, client, game, coach):
        """Scores rewind via deltas, not the snapshot, so a manual correction
        made after the play is preserved."""
        make_state(game, down=1, distance=5, ball_position=45, los_position=45)
        client.force_login(coach)

        post_json(client, f"/games/{game.pk}/tracker/run/", {'yards_gained': 10})  # +6
        post_json(client, f"/games/{game.pk}/tracker/update-score/", {'team_score': 7})

        post_json(client, f"/games/{game.pk}/tracker/undo/")

        game.refresh_from_db()
        assert game.team_score == 1  # 7 manual - 6 delta

    def test_undo_with_no_plays(self, client, game, coach):
        make_state(game)
        client.force_login(coach)
        data = post_json(client, f"/games/{game.pk}/tracker/undo/").json()
        assert data['success'] is False
        assert 'No plays' in data['error']

    def test_undo_legacy_snap_without_snapshot(self, client, game, coach):
        """Snaps recorded before prior_state existed fall back to re-deriving
        state from the previous snap."""
        RunPlayFactory(game=game, sequence_number=1, quarter=1, down=1,
                       distance=10, ball_position=-25, prior_state=None)
        RunPlayFactory(game=game, sequence_number=2, quarter=2, down=3,
                       distance=2, ball_position=15, prior_state=None)
        gs = make_state(game, quarter=2, down=4, distance=1, ball_position=18,
                        last_sequence=2)
        client.force_login(coach)

        data = post_json(client, f"/games/{game.pk}/tracker/undo/").json()

        gs.refresh_from_db()
        assert data['success'] is True
        assert game.snaps.count() == 1
        # State re-derived from snap #1's stamped pre-play fields
        assert gs.quarter == 1
        assert gs.down == 1
        assert gs.distance == 10
        assert gs.ball_position == -25
        assert gs.last_sequence == 1
