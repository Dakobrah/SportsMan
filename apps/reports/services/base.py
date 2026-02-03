"""
Base report service with common filtering logic.
"""
from django.db.models import Q


class BaseReportService:
    """
    Base class for report services with common filtering.

    Benefits of service layer:
    - Reusable across views, management commands, Celery tasks
    - Testable in isolation (no HTTP layer)
    - Single place for complex queries
    """

    def __init__(
        self,
        game_ids: list[int] | None = None,
        season_id: int | None = None,
        team_id: int | None = None,
    ):
        self.filters = Q()

        if game_ids:
            self.filters &= Q(game_id__in=game_ids)
        if season_id:
            self.filters &= Q(game__season_id=season_id)
        if team_id:
            self.filters &= Q(game__season__team_id=team_id)
