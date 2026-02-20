"""
Defensive statistics report service.
"""
from django.db.models import Q
from apps.snaps.models import DefenseSnap, DefenseSnapAssist
from .base import BaseReportService
from .helpers import Cnt, SumCoalesce


class DefenseReportService(BaseReportService):
    """Defense statistics and analytics."""

    def get_team_totals(self) -> dict:
        """Team-wide defensive totals."""
        return DefenseSnap.objects.filter(self.filters).aggregate(
            total_tackles=Cnt(Q(play_result=DefenseSnap.PlayResult.TACKLE)),
            total_tfl=Cnt(Q(play_result=DefenseSnap.PlayResult.TACKLE_FOR_LOSS)),
            total_sacks=Cnt(Q(play_result=DefenseSnap.PlayResult.SACK)),
            total_interceptions=Cnt(Q(play_result=DefenseSnap.PlayResult.INTERCEPTION)),
            total_fumble_recoveries=Cnt(Q(play_result=DefenseSnap.PlayResult.FUMBLE_RECOVERY)),
            total_pass_defended=Cnt(Q(play_result=DefenseSnap.PlayResult.PASS_DEFENDED)),
            total_pressures=Cnt(Q(applied_pressure=True)),
            total_forced_incompletions=Cnt(Q(forced_incompletion=True)),
            defensive_touchdowns=Cnt(Q(is_defensive_touchdown=True)),
            int_return_yards=SumCoalesce("interception_return_yards", 0),
            fumble_return_yards=SumCoalesce("fumble_return_yards", 0),
        )

    def get_player_summary(self) -> list[dict]:
        """Per-player defensive statistics."""
        return list(
            DefenseSnap.objects.filter(self.filters, primary_player__isnull=False)
            .values(*self.player_values("primary_player", include_position=True))
            .annotate(
                tackles=Cnt(Q(play_result=DefenseSnap.PlayResult.TACKLE)),
                tfl=Cnt(Q(play_result=DefenseSnap.PlayResult.TACKLE_FOR_LOSS)),
                sacks=Cnt(Q(play_result=DefenseSnap.PlayResult.SACK)),
                interceptions=Cnt(Q(play_result=DefenseSnap.PlayResult.INTERCEPTION)),
                fumble_recoveries=Cnt(Q(play_result=DefenseSnap.PlayResult.FUMBLE_RECOVERY)),
                pass_defended=Cnt(Q(play_result=DefenseSnap.PlayResult.PASS_DEFENDED)),
                pressures=Cnt(Q(applied_pressure=True)),
                def_tds=Cnt(Q(is_defensive_touchdown=True)),
            )
            .order_by("-tackles")
        )

    def get_player_assists(self) -> list[dict]:
        """Get assist counts by player."""
        return list(
            DefenseSnapAssist.objects.filter(
                snap__in=DefenseSnap.objects.filter(self.filters)
            )
            .values(*self.player_values("player"))
            .annotate(
                tackle_assists=Cnt(Q(assist_type=DefenseSnapAssist.AssistType.TACKLE)),
                sack_assists=Cnt(Q(assist_type=DefenseSnapAssist.AssistType.SACK)),
                coverage_assists=Cnt(Q(assist_type=DefenseSnapAssist.AssistType.COVERAGE)),
            )
            .order_by("-tackle_assists")
        )
