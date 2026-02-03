"""
Defensive statistics report service.
"""
from django.db.models import Count, Sum, Coalesce, Q
from apps.snaps.models import DefenseSnap, DefenseSnapAssist
from .base import BaseReportService


class DefenseReportService(BaseReportService):
    """Defense statistics and analytics."""

    def get_team_totals(self) -> dict:
        """Team-wide defensive totals."""
        return DefenseSnap.objects.filter(self.filters).aggregate(
            total_tackles=Count(
                "id", filter=Q(play_result=DefenseSnap.PlayResult.TACKLE)
            ),
            total_tfl=Count(
                "id", filter=Q(play_result=DefenseSnap.PlayResult.TACKLE_FOR_LOSS)
            ),
            total_sacks=Count("id", filter=Q(play_result=DefenseSnap.PlayResult.SACK)),
            total_interceptions=Count(
                "id", filter=Q(play_result=DefenseSnap.PlayResult.INTERCEPTION)
            ),
            total_fumble_recoveries=Count(
                "id", filter=Q(play_result=DefenseSnap.PlayResult.FUMBLE_RECOVERY)
            ),
            total_pass_defended=Count(
                "id", filter=Q(play_result=DefenseSnap.PlayResult.PASS_DEFENDED)
            ),
            total_pressures=Count("id", filter=Q(applied_pressure=True)),
            total_forced_incompletions=Count("id", filter=Q(forced_incompletion=True)),
            defensive_touchdowns=Count("id", filter=Q(is_defensive_touchdown=True)),
            int_return_yards=Coalesce(Sum("interception_return_yards"), 0),
            fumble_return_yards=Coalesce(Sum("fumble_return_yards"), 0),
        )

    def get_player_summary(self) -> list[dict]:
        """Per-player defensive statistics."""
        return list(
            DefenseSnap.objects.filter(self.filters, primary_player__isnull=False)
            .values(
                "primary_player__id",
                "primary_player__first_name",
                "primary_player__last_name",
                "primary_player__number",
                "primary_player__position",
            )
            .annotate(
                tackles=Count(
                    "id", filter=Q(play_result=DefenseSnap.PlayResult.TACKLE)
                ),
                tfl=Count(
                    "id", filter=Q(play_result=DefenseSnap.PlayResult.TACKLE_FOR_LOSS)
                ),
                sacks=Count("id", filter=Q(play_result=DefenseSnap.PlayResult.SACK)),
                interceptions=Count(
                    "id", filter=Q(play_result=DefenseSnap.PlayResult.INTERCEPTION)
                ),
                fumble_recoveries=Count(
                    "id", filter=Q(play_result=DefenseSnap.PlayResult.FUMBLE_RECOVERY)
                ),
                pass_defended=Count(
                    "id", filter=Q(play_result=DefenseSnap.PlayResult.PASS_DEFENDED)
                ),
                pressures=Count("id", filter=Q(applied_pressure=True)),
                def_tds=Count("id", filter=Q(is_defensive_touchdown=True)),
            )
            .order_by("-tackles")
        )

    def get_player_assists(self) -> list[dict]:
        """Get assist counts by player."""
        return list(
            DefenseSnapAssist.objects.filter(
                snap__in=DefenseSnap.objects.filter(self.filters)
            )
            .values(
                "player__id",
                "player__first_name",
                "player__last_name",
                "player__number",
            )
            .annotate(
                tackle_assists=Count(
                    "id", filter=Q(assist_type=DefenseSnapAssist.AssistType.TACKLE)
                ),
                sack_assists=Count(
                    "id", filter=Q(assist_type=DefenseSnapAssist.AssistType.SACK)
                ),
                coverage_assists=Count(
                    "id", filter=Q(assist_type=DefenseSnapAssist.AssistType.COVERAGE)
                ),
            )
            .order_by("-tackle_assists")
        )
