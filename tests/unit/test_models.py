"""
Unit tests for models.
"""
import pytest
from tests.factories import TeamFactory, PlayerFactory, GameFactory


@pytest.mark.django_db
class TestPlayerModel:
    """Tests for Player model."""

    def test_full_name_property(self):
        """Player full_name returns first and last name."""
        player = PlayerFactory(first_name="John", last_name="Doe")
        assert player.full_name == "John Doe"

    def test_str_representation(self):
        """Player string representation includes number and name."""
        player = PlayerFactory(first_name="John", last_name="Doe", number=12)
        assert str(player) == "#12 John Doe"


@pytest.mark.django_db
class TestGameModel:
    """Tests for Game model."""

    def test_is_win_property(self):
        """Game is_win returns True when team score is higher."""
        game = GameFactory(team_score=21, opponent_score=14)
        assert game.is_win is True
        assert game.is_loss is False

    def test_is_loss_property(self):
        """Game is_loss returns True when opponent score is higher."""
        game = GameFactory(team_score=14, opponent_score=21)
        assert game.is_win is False
        assert game.is_loss is True

    def test_result_property(self):
        """Game result returns W, L, or T."""
        win = GameFactory(team_score=21, opponent_score=14)
        loss = GameFactory(team_score=14, opponent_score=21)
        tie = GameFactory(team_score=14, opponent_score=14)

        assert win.result == "W"
        assert loss.result == "L"
        assert tie.result == "T"


@pytest.mark.django_db
class TestTeamModel:
    """Tests for Team model."""

    def test_str_representation(self):
        """Team string representation is the name."""
        team = TeamFactory(name="Test Team")
        assert str(team) == "Test Team"
