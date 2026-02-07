"""
Unit tests for serializers.
"""
import pytest
from rest_framework.exceptions import ValidationError
from apps.teams.serializers import TeamSerializer, PlayerSerializer, SeasonSerializer
from apps.games.serializers import GameWriteSerializer, GameReadSerializer
from apps.snaps.serializers import (
    RunPlayWriteSerializer,
    PassPlayWriteSerializer,
    FieldGoalSnapWriteSerializer,
    ExtraPointSnapWriteSerializer,
)
from tests.factories import TeamFactory, PlayerFactory, SeasonFactory, GameFactory


@pytest.mark.django_db
class TestTeamSerializer:
    """Tests for Team serializer."""

    def test_create_team(self):
        """Valid data creates a team."""
        data = {"name": "Test Team", "abbreviation": "TST"}
        serializer = TeamSerializer(data=data)

        assert serializer.is_valid()
        team = serializer.save()
        assert team.name == "Test Team"
        assert team.abbreviation == "TST"

    def test_create_team_missing_name(self):
        """Missing name fails validation."""
        data = {"abbreviation": "TST"}
        serializer = TeamSerializer(data=data)

        assert serializer.is_valid() is False
        assert "name" in serializer.errors

    def test_duplicate_abbreviation(self):
        """Duplicate abbreviation fails validation."""
        TeamFactory(abbreviation="TST")

        data = {"name": "Another Team", "abbreviation": "TST"}
        serializer = TeamSerializer(data=data)

        assert serializer.is_valid() is False
        assert "abbreviation" in serializer.errors


@pytest.mark.django_db
class TestPlayerSerializer:
    """Tests for Player serializer."""

    def test_create_player(self):
        """Valid data creates a player."""
        team = TeamFactory()
        data = {
            "first_name": "John",
            "last_name": "Doe",
            "position": "QB",
            "number": 12,
            "team_id": team.id,
            "is_active": True,
        }
        serializer = PlayerSerializer(data=data)

        assert serializer.is_valid(), serializer.errors
        player = serializer.save()
        assert player.full_name == "John Doe"
        assert player.position == "QB"

    def test_invalid_position(self):
        """Invalid position fails validation."""
        team = TeamFactory()
        data = {
            "first_name": "John",
            "last_name": "Doe",
            "position": "INVALID",
            "number": 12,
            "team_id": team.id,
        }
        serializer = PlayerSerializer(data=data)

        assert serializer.is_valid() is False
        assert "position" in serializer.errors

    def test_read_serializer_includes_full_name(self):
        """Read serializer includes computed full_name."""
        player = PlayerFactory(first_name="John", last_name="Doe")
        serializer = PlayerSerializer(player)

        assert serializer.data["full_name"] == "John Doe"


@pytest.mark.django_db
class TestGameSerializer:
    """Tests for Game serializer."""

    def test_create_game(self):
        """Valid data creates a game."""
        season = SeasonFactory()
        data = {
            "season_id": season.id,
            "date": "2024-09-15",
            "opponent": "Rival Team",
            "location": "home",
            "weather": "clear",
            "field_condition": "grass",
            "team_score": 21,
            "opponent_score": 14,
        }
        serializer = GameWriteSerializer(data=data)

        assert serializer.is_valid(), serializer.errors
        game = serializer.save()
        assert game.opponent == "Rival Team"
        assert game.is_win is True

    def test_read_serializer_includes_result(self):
        """Read serializer includes computed result."""
        game = GameFactory(team_score=28, opponent_score=21)
        serializer = GameReadSerializer(game)

        assert serializer.data["result"] == "W"
        assert serializer.data["is_win"] is True

    def test_invalid_location(self):
        """Invalid location choice fails validation."""
        season = SeasonFactory()
        data = {
            "season_id": season.id,
            "date": "2024-09-15",
            "opponent": "Test",
            "location": "invalid_location",
            "weather": "clear",
            "field_condition": "grass",
        }
        serializer = GameWriteSerializer(data=data)

        assert serializer.is_valid() is False
        assert "location" in serializer.errors


@pytest.mark.django_db
class TestRunPlaySerializer:
    """Tests for RunPlay serializer."""

    def test_create_run_play(self):
        """Valid data creates a run play."""
        game = GameFactory()
        rb = PlayerFactory(team=game.season.team, position="RB")

        data = {
            "game_id": game.id,
            "sequence_number": 1,
            "quarter": 1,
            "down": 1,
            "distance": 10,
            "ball_carrier_id": rb.id,
            "yards_gained": 5,
            "is_touchdown": False,
            "is_first_down": False,
        }
        serializer = RunPlayWriteSerializer(data=data)

        assert serializer.is_valid(), serializer.errors
        run = serializer.save()
        assert run.yards_gained == 5

    def test_fumble_lost_without_fumble_fails(self):
        """fumble_lost=True without fumbled=True fails validation."""
        game = GameFactory()
        rb = PlayerFactory(position="RB")

        data = {
            "game_id": game.id,
            "sequence_number": 1,
            "quarter": 1,
            "ball_carrier_id": rb.id,
            "yards_gained": 5,
            "fumbled": False,
            "fumble_lost": True,  # Invalid without fumbled=True
        }
        serializer = RunPlayWriteSerializer(data=data)

        assert serializer.is_valid() is False
        assert "fumble_lost" in serializer.errors


@pytest.mark.django_db
class TestPassPlaySerializer:
    """Tests for PassPlay serializer."""

    def test_create_complete_pass(self):
        """Valid data creates a complete pass."""
        game = GameFactory()
        qb = PlayerFactory(position="QB")
        wr = PlayerFactory(position="WR")

        data = {
            "game_id": game.id,
            "sequence_number": 1,
            "quarter": 1,
            "down": 2,
            "distance": 8,
            "quarterback_id": qb.id,
            "target_id": wr.id,
            "receiver_id": wr.id,
            "is_complete": True,
            "yards_gained": 15,
            "air_yards": 10,
            "yards_after_catch": 5,
        }
        serializer = PassPlayWriteSerializer(data=data)

        assert serializer.is_valid(), serializer.errors
        pass_play = serializer.save()
        assert pass_play.is_complete is True

    def test_complete_pass_requires_receiver(self):
        """Complete pass requires receiver_id."""
        game = GameFactory()
        qb = PlayerFactory(position="QB")
        wr = PlayerFactory(position="WR")

        data = {
            "game_id": game.id,
            "sequence_number": 1,
            "quarter": 1,
            "quarterback_id": qb.id,
            "target_id": wr.id,
            # receiver_id is missing
            "is_complete": True,
            "yards_gained": 10,
        }
        serializer = PassPlayWriteSerializer(data=data)

        assert serializer.is_valid() is False
        assert "receiver_id" in serializer.errors

    def test_incomplete_pass_no_receiver_ok(self):
        """Incomplete pass doesn't require receiver."""
        game = GameFactory()
        qb = PlayerFactory(position="QB")
        wr = PlayerFactory(position="WR")

        data = {
            "game_id": game.id,
            "sequence_number": 1,
            "quarter": 1,
            "quarterback_id": qb.id,
            "target_id": wr.id,
            "is_complete": False,
            "yards_gained": 0,
        }
        serializer = PassPlayWriteSerializer(data=data)

        assert serializer.is_valid(), serializer.errors


@pytest.mark.django_db
class TestFieldGoalSerializer:
    """Tests for FieldGoal serializer."""

    def test_create_field_goal(self):
        """Valid data creates a field goal."""
        game = GameFactory()
        k = PlayerFactory(position="K")

        data = {
            "game_id": game.id,
            "sequence_number": 1,
            "quarter": 2,
            "kicker_id": k.id,
            "kick_distance": 45,
            "result": "GOOD",
        }
        serializer = FieldGoalSnapWriteSerializer(data=data)

        assert serializer.is_valid(), serializer.errors
        fg = serializer.save()
        assert fg.result == "GOOD"
        assert fg.kick_distance == 45

    def test_invalid_result(self):
        """Invalid result choice fails validation."""
        game = GameFactory()
        k = PlayerFactory(position="K")

        data = {
            "game_id": game.id,
            "sequence_number": 1,
            "quarter": 2,
            "kicker_id": k.id,
            "kick_distance": 45,
            "result": "INVALID",
        }
        serializer = FieldGoalSnapWriteSerializer(data=data)

        assert serializer.is_valid() is False
        assert "result" in serializer.errors


@pytest.mark.django_db
class TestExtraPointSerializer:
    """Tests for ExtraPoint serializer."""

    def test_create_pat_kick(self):
        """Valid data creates a PAT kick."""
        game = GameFactory()
        k = PlayerFactory(position="K")

        data = {
            "game_id": game.id,
            "sequence_number": 1,
            "quarter": 1,
            "attempt_type": "KICK",
            "result": "GOOD",
            "kicker_id": k.id,
        }
        serializer = ExtraPointSnapWriteSerializer(data=data)

        assert serializer.is_valid(), serializer.errors
        xp = serializer.save()
        assert xp.attempt_type == "KICK"

    def test_pat_kick_requires_kicker(self):
        """PAT kick requires kicker_id."""
        game = GameFactory()

        data = {
            "game_id": game.id,
            "sequence_number": 1,
            "quarter": 1,
            "attempt_type": "KICK",
            "result": "GOOD",
            # kicker_id missing
        }
        serializer = ExtraPointSnapWriteSerializer(data=data)

        assert serializer.is_valid() is False
        assert "kicker_id" in serializer.errors

    def test_two_point_conversion(self):
        """2-point conversion doesn't require kicker."""
        game = GameFactory()
        rb = PlayerFactory(position="RB")

        data = {
            "game_id": game.id,
            "sequence_number": 1,
            "quarter": 2,
            "attempt_type": "2PT_RUN",
            "result": "GOOD",
            "ball_carrier_id": rb.id,
        }
        serializer = ExtraPointSnapWriteSerializer(data=data)

        assert serializer.is_valid(), serializer.errors
