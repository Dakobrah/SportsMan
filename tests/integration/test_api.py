"""
Integration tests for API endpoints.
"""
import pytest
from rest_framework import status
from apps.teams.models import Team
from tests.factories import TeamFactory, PlayerFactory, GameFactory, RunPlayFactory


@pytest.mark.django_db
class TestHealthEndpoint:
    """Tests for health check endpoint."""

    def test_health_check_returns_ok(self, api_client):
        """Health endpoint returns 200 when healthy."""
        response = api_client.get("/api/health/")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["status"] == "healthy"
        assert response.json()["database"] == "ok"


@pytest.mark.django_db
class TestTeamEndpoints:
    """Tests for team API endpoints."""

    def test_list_teams_requires_auth(self, api_client):
        """Unauthenticated requests are rejected."""
        response = api_client.get("/api/v1/teams/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_teams_success(self, authenticated_client):
        """Authenticated request returns teams."""
        existing = Team.objects.count()
        TeamFactory.create_batch(3)

        response = authenticated_client.get("/api/v1/teams/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == existing + 3

    def test_create_team_success(self, authenticated_client):
        """Create team with valid data."""
        response = authenticated_client.post(
            "/api/v1/teams/",
            {"name": "New Team", "abbreviation": "NT"},
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "New Team"


@pytest.mark.django_db
class TestPlayerEndpoints:
    """Tests for player API endpoints."""

    def test_list_players_success(self, authenticated_client):
        """List players returns paginated results."""
        team = TeamFactory()
        PlayerFactory.create_batch(5, team=team)

        response = authenticated_client.get("/api/v1/players/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 5

    def test_filter_players_by_position(self, authenticated_client):
        """Filter players by position."""
        team = TeamFactory()
        PlayerFactory.create_batch(2, team=team, position="QB")
        PlayerFactory.create_batch(3, team=team, position="RB")

        response = authenticated_client.get("/api/v1/players/?position=QB")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 2


@pytest.mark.django_db
class TestReportEndpoints:
    """Tests for report API endpoints."""

    def test_rushing_totals_requires_auth(self, api_client):
        """Report endpoints require authentication."""
        response = api_client.get("/api/v1/reports/offense/rushing/totals/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_rushing_totals_success(self, authenticated_client):
        """Rushing totals returns aggregated stats."""
        game = GameFactory()
        RunPlayFactory(game=game, yards_gained=15)
        RunPlayFactory(game=game, yards_gained=10)

        response = authenticated_client.get("/api/v1/reports/offense/rushing/totals/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["attempts"] == 2
        assert response.data["yards"] == 25

    def test_rushing_totals_filtered_by_game(self, authenticated_client):
        """Report can be filtered by game_ids."""
        game1 = GameFactory()
        game2 = GameFactory()
        RunPlayFactory(game=game1, yards_gained=10)
        RunPlayFactory(game=game2, yards_gained=20)

        response = authenticated_client.get(
            f"/api/v1/reports/offense/rushing/totals/?game_ids={game1.id}"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["yards"] == 10
