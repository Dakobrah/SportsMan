"""
Tests for the tracker_state polling endpoint.

The polling contract: clients poll GET /games/<pk>/tracker/state/?since=<v>
&after_seq=<n>. When nothing changed, the server answers from a single
indexed query with a tiny {'changed': false} payload. Any mutation (play,
undo, score edit, quarter change, coin toss) bumps GameState.version and
the next poll returns the full state plus only the plays newer than
after_seq.
"""
import json

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.games.models import GameState
from tests.factories import UserFactory, GameFactory, TeamFactory


def post_json(client, url, payload=None):
    return client.post(url, json.dumps(payload or {}), content_type='application/json')


@pytest.fixture
def game(db):
    return GameFactory(team_score=0, opponent_score=0)


@pytest.fixture
def coach(game):
    return UserFactory(team=game.season.team)


def make_state(game, **overrides):
    defaults = dict(
        quarter=1, down=1, distance=10, ball_position=-25, los_position=-25,
        possession='home', situation='normal', version=3, last_sequence=0,
    )
    defaults.update(overrides)
    return GameState.objects.create(game=game, **defaults)


def poll(client, game, since=None, after_seq=None):
    params = {}
    if since is not None:
        params['since'] = since
    if after_seq is not None:
        params['after_seq'] = after_seq
    return client.get(f"/games/{game.pk}/tracker/state/", params)


@pytest.mark.django_db
class TestTrackerStatePolling:

    def test_unchanged_returns_tiny_payload(self, client, game, coach):
        make_state(game, version=3)
        client.force_login(coach)

        data = poll(client, game, since=3).json()
        assert data == {'changed': False, 'version': 3}

    def test_first_poll_without_since_returns_full_state(self, client, game, coach):
        make_state(game, version=3)
        client.force_login(coach)

        data = poll(client, game).json()
        assert data['changed'] is True
        assert data['version'] == 3
        assert data['state']['possession'] == 'home'
        assert data['team_score'] == 0
        assert data['plays'] == []

    def test_play_bumps_version_and_returns_delta(self, client, game, coach):
        make_state(game, version=3)
        client.force_login(coach)

        post_json(client, f"/games/{game.pk}/tracker/run/", {'yards_gained': 4})
        post_json(client, f"/games/{game.pk}/tracker/run/", {'yards_gained': 3})

        # Viewer last saw version 3 and play seq 1 → gets only seq 2.
        data = poll(client, game, since=3, after_seq=1).json()
        assert data['changed'] is True
        assert data['version'] == 5
        assert [p['sequence_number'] for p in data['plays']] == [2]
        assert data['state']['last_sequence'] == 2

    def test_score_edit_bumps_version(self, client, game, coach):
        make_state(game, version=3)
        client.force_login(coach)

        post_json(client, f"/games/{game.pk}/tracker/update-score/", {'opponent_score': 7})

        data = poll(client, game, since=3, after_seq=0).json()
        assert data['changed'] is True
        assert data['version'] == 4
        assert data['opponent_score'] == 7
        assert data['plays'] == []

    def test_undo_visible_to_pollers(self, client, game, coach):
        make_state(game, version=3)
        client.force_login(coach)
        post_json(client, f"/games/{game.pk}/tracker/run/", {'yards_gained': 4})
        post_json(client, f"/games/{game.pk}/tracker/undo/")

        data = poll(client, game, since=4, after_seq=1).json()
        assert data['changed'] is True
        # last_sequence rewound below the viewer's rendered seq → feed truncation signal
        assert data['state']['last_sequence'] == 0
        assert data['plays'] == []

    def test_wrong_team_forbidden(self, client, game):
        make_state(game)
        client.force_login(UserFactory(team=TeamFactory()))
        assert poll(client, game, since=0).status_code == 403

    def test_unchanged_path_query_budget(self, client, game, coach):
        """The idle poll — by far the most frequent request — must stay tiny:
        session + user + game + gamestate lookup and nothing else."""
        make_state(game, version=3)
        client.force_login(coach)

        with CaptureQueriesContext(connection) as qctx:
            response = poll(client, game, since=3)

        assert response.status_code == 200
        assert len(qctx.captured_queries) <= 4, (
            f"Idle poll issued {len(qctx.captured_queries)} queries — "
            f"expected ≤4 (session, user, game, gamestate)."
        )

    def test_bad_since_param_treated_as_full_request(self, client, game, coach):
        make_state(game, version=3)
        client.force_login(coach)
        data = poll(client, game, since='garbage').json()
        assert data['changed'] is True
        assert data['version'] == 3
