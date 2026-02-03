"""
Unit tests for report services.
"""
import pytest
from apps.reports.services import OffenseReportService, DefenseReportService
from tests.factories import GameFactory, RunPlayFactory, PassPlayFactory, DefenseSnapFactory


@pytest.mark.django_db
class TestOffenseReportService:
    """Tests for OffenseReportService."""

    def test_rushing_totals_empty_database(self):
        """Service returns zeros when no data exists."""
        service = OffenseReportService()
        totals = service.get_rushing_totals()

        assert totals["attempts"] == 0
        assert totals["yards"] == 0
        assert totals["touchdowns"] == 0

    def test_rushing_totals_with_data(self):
        """Service correctly aggregates rushing data."""
        game = GameFactory()
        RunPlayFactory(game=game, yards_gained=10, is_touchdown=False)
        RunPlayFactory(game=game, yards_gained=5, is_touchdown=False)
        RunPlayFactory(game=game, yards_gained=25, is_touchdown=True)

        service = OffenseReportService()
        totals = service.get_rushing_totals()

        assert totals["attempts"] == 3
        assert totals["yards"] == 40
        assert totals["touchdowns"] == 1
        assert totals["longest"] == 25

    def test_rushing_filtered_by_game(self):
        """Service filters by game_ids correctly."""
        game1 = GameFactory()
        game2 = GameFactory()

        RunPlayFactory(game=game1, yards_gained=10)
        RunPlayFactory(game=game2, yards_gained=20)

        service = OffenseReportService(game_ids=[game1.id])
        totals = service.get_rushing_totals()

        assert totals["yards"] == 10

    def test_passing_totals_empty_database(self):
        """Service returns zeros for passing when no data exists."""
        service = OffenseReportService()
        totals = service.get_passing_totals()

        assert totals["attempts"] == 0
        assert totals["completions"] == 0
        assert totals["yards"] == 0

    def test_passing_totals_with_data(self):
        """Service correctly aggregates passing data."""
        game = GameFactory()
        PassPlayFactory(game=game, is_complete=True, yards_gained=15)
        PassPlayFactory(game=game, is_complete=True, yards_gained=25, is_touchdown=True)
        PassPlayFactory(game=game, is_complete=False, yards_gained=0)

        service = OffenseReportService()
        totals = service.get_passing_totals()

        assert totals["attempts"] == 3
        assert totals["completions"] == 2
        assert totals["yards"] == 40
        assert totals["touchdowns"] == 1


@pytest.mark.django_db
class TestDefenseReportService:
    """Tests for DefenseReportService."""

    def test_team_totals_empty_database(self):
        """Service returns zeros when no data exists."""
        service = DefenseReportService()
        totals = service.get_team_totals()

        assert totals["total_tackles"] == 0
        assert totals["total_sacks"] == 0
        assert totals["total_interceptions"] == 0

    def test_team_totals_with_data(self):
        """Service correctly aggregates defense data."""
        game = GameFactory()
        DefenseSnapFactory(game=game, play_result="TACKLE")
        DefenseSnapFactory(game=game, play_result="TACKLE")
        DefenseSnapFactory(game=game, play_result="SACK")
        DefenseSnapFactory(game=game, play_result="INT")

        service = DefenseReportService()
        totals = service.get_team_totals()

        assert totals["total_tackles"] == 2
        assert totals["total_sacks"] == 1
        assert totals["total_interceptions"] == 1
