"""
Tests for the version-keyed cache helpers.

The whole invalidation strategy rests on data_version changing whenever
snaps or games change — these tests pin that contract.
"""
import pytest

from apps.core.cache import data_version, cache_key
from tests.factories import GameFactory, RunPlayFactory


@pytest.mark.django_db
class TestDataVersion:

    def test_stable_when_nothing_changes(self):
        game = GameFactory()
        RunPlayFactory(game=game, sequence_number=1)
        assert data_version() == data_version()

    def test_changes_when_snap_added(self):
        game = GameFactory()
        before = data_version()
        RunPlayFactory(game=game, sequence_number=1)
        assert data_version() != before

    def test_changes_when_snap_deleted(self):
        game = GameFactory()
        snap = RunPlayFactory(game=game, sequence_number=1)
        before = data_version()
        snap.delete()
        assert data_version() != before

    def test_changes_when_snap_edited(self):
        game = GameFactory()
        snap = RunPlayFactory(game=game, sequence_number=1, yards_gained=3)
        before = data_version()
        snap.yards_gained = 8
        snap.save()
        assert data_version() != before

    def test_changes_when_game_edited(self):
        game = GameFactory(team_score=0)
        before = data_version()
        game.team_score = 7
        game.save()
        assert data_version() != before

    def test_scoping_isolates_other_teams(self):
        """A change to team B's data must not shift team A's version."""
        game_a = GameFactory()
        game_b = GameFactory()
        team_a = game_a.season.team_id
        before = data_version(team_id=team_a)
        RunPlayFactory(game=game_b, sequence_number=1)
        assert data_version(team_id=team_a) == before

    def test_cache_key_is_deterministic(self):
        assert (
            cache_key('report', {'b': 2, 'a': 1}, 'v1')
            == cache_key('report', {'a': 1, 'b': 2}, 'v1')
        )
        assert cache_key('report', {'a': 1}, 'v1') != cache_key('report', {'a': 1}, 'v2')
