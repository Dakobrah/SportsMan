"""
Report page rendering + auth guards.

Regression tests for the cached report views: every report page must
require login (a decorator once slipped onto the cache helper instead of
the view), and must render successfully for a logged-in team member.
"""
import pytest

from tests.factories import UserFactory, GameFactory, RunPlayFactory

REPORT_PATHS = [
    "/reports/offense/",
    "/reports/defense/",
    "/reports/special-teams/",
]


@pytest.mark.django_db
class TestReportPageAuth:

    @pytest.mark.parametrize("path", REPORT_PATHS)
    def test_anonymous_redirected_to_login(self, client, path):
        response = client.get(path)
        assert response.status_code == 302
        assert "login" in response["Location"]


@pytest.mark.django_db
class TestReportPagesRender:
    """Direct view calls via RequestFactory (the test client's template
    capture crashes under Python 3.14 + Django 5.0)."""

    def _get(self, rf, view, path, user):
        request = rf.get(path)
        request.user = user
        return view(request)

    def test_report_pages_render_for_team_member(self, rf):
        from apps.frontend.views import (
            report_offense, report_defense, report_special_teams,
        )

        game = GameFactory()
        RunPlayFactory(game=game, sequence_number=1)
        coach = UserFactory(team=game.season.team)

        for view, path in [
            (report_offense, "/reports/offense/"),
            (report_defense, "/reports/defense/"),
            (report_special_teams, "/reports/special-teams/"),
        ]:
            response = self._get(rf, view, path, coach)
            assert response.status_code == 200, f"{path} did not render"
