"""
Pytest configuration and fixtures.
"""
import pytest
from rest_framework.test import APIClient
from tests.factories import (
    UserFactory,
    TeamFactory,
    SeasonFactory,
    PlayerFactory,
    GameFactory,
    RunPlayFactory,
    PassPlayFactory,
)


@pytest.fixture
def api_client():
    """Unauthenticated API client."""
    return APIClient()


@pytest.fixture
def user(db):
    """Create a test user."""
    return UserFactory()


@pytest.fixture
def authenticated_client(api_client, user):
    """API client authenticated with test user."""
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def team(db):
    """Create a test team."""
    return TeamFactory()


@pytest.fixture
def season(team):
    """Create a test season."""
    return SeasonFactory(team=team)


@pytest.fixture
def player(team):
    """Create a test player."""
    return PlayerFactory(team=team)


@pytest.fixture
def game(season):
    """Create a test game."""
    return GameFactory(season=season)


@pytest.fixture
def team_with_players(db):
    """Create a team with a full roster."""
    team = TeamFactory()

    # Offense
    PlayerFactory(team=team, position="QB")
    PlayerFactory.create_batch(2, team=team, position="RB")
    PlayerFactory.create_batch(4, team=team, position="WR")
    PlayerFactory.create_batch(2, team=team, position="TE")
    PlayerFactory.create_batch(5, team=team, position="OL")

    # Defense
    PlayerFactory.create_batch(4, team=team, position="DL")
    PlayerFactory.create_batch(3, team=team, position="LB")
    PlayerFactory.create_batch(2, team=team, position="CB")
    PlayerFactory.create_batch(2, team=team, position="S")

    # Special Teams
    PlayerFactory(team=team, position="K")
    PlayerFactory(team=team, position="P")

    return team


@pytest.fixture
def run_play(game, player):
    """Create a test run play."""
    return RunPlayFactory(game=game, ball_carrier=player)


@pytest.fixture
def pass_play(game):
    """Create a test pass play."""
    qb = PlayerFactory(team=game.season.team, position="QB")
    wr = PlayerFactory(team=game.season.team, position="WR")
    return PassPlayFactory(game=game, quarterback=qb, receiver=wr)
