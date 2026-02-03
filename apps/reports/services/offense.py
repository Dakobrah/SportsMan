"""
Offensive statistics report service.
"""
from django.db.models import Count, Sum, Avg, Max, Q
from django.db.models.functions import Coalesce
from apps.snaps.models import RunPlay, PassPlay
from .base import BaseReportService


class OffenseReportService(BaseReportService):
    """
    Offensive statistics using Django ORM aggregation.

    Uses database-level calculations instead of Python loops for:
    - Better performance
    - No memory issues with large datasets
    - Single query instead of N+1
    """

    def get_rushing_totals(self) -> dict:
        """Team rushing totals."""
        return RunPlay.objects.filter(self.filters).aggregate(
            attempts=Count("id"),
            yards=Coalesce(Sum("yards_gained"), 0),
            touchdowns=Count("id", filter=Q(is_touchdown=True)),
            first_downs=Count("id", filter=Q(is_first_down=True)),
            fumbles=Count("id", filter=Q(fumbled=True)),
            fumbles_lost=Count("id", filter=Q(fumble_lost=True)),
            longest=Coalesce(Max("yards_gained"), 0),
            avg_yards=Coalesce(Avg("yards_gained"), 0.0),
        )

    def get_rushing_by_player(self) -> list[dict]:
        """Per-player rushing statistics."""
        return list(
            RunPlay.objects.filter(self.filters, ball_carrier__isnull=False)
            .values(
                "ball_carrier__id",
                "ball_carrier__first_name",
                "ball_carrier__last_name",
                "ball_carrier__number",
            )
            .annotate(
                attempts=Count("id"),
                yards=Coalesce(Sum("yards_gained"), 0),
                touchdowns=Count("id", filter=Q(is_touchdown=True)),
                first_downs=Count("id", filter=Q(is_first_down=True)),
                fumbles=Count("id", filter=Q(fumbled=True)),
                fumbles_lost=Count("id", filter=Q(fumble_lost=True)),
                longest=Coalesce(Max("yards_gained"), 0),
                avg_yards=Coalesce(Avg("yards_gained"), 0.0),
                short_runs=Count("id", filter=Q(yards_gained__lte=5)),
                long_runs=Count("id", filter=Q(yards_gained__gt=5)),
                explosive_runs=Count("id", filter=Q(yards_gained__gte=10)),
            )
            .order_by("-yards")
        )

    def get_passing_totals(self) -> dict:
        """Team passing totals."""
        return PassPlay.objects.filter(self.filters).aggregate(
            attempts=Count("id"),
            completions=Count("id", filter=Q(is_complete=True)),
            yards=Coalesce(Sum("yards_gained", filter=Q(is_complete=True)), 0),
            touchdowns=Count("id", filter=Q(is_touchdown=True)),
            interceptions=Count("id", filter=Q(is_interception=True)),
            sacks=Count("id", filter=Q(was_sacked=True)),
            sack_yards=Coalesce(Sum("sack_yards", filter=Q(was_sacked=True)), 0),
            air_yards=Coalesce(Sum("air_yards"), 0),
            yac=Coalesce(Sum("yards_after_catch", filter=Q(is_complete=True)), 0),
            longest=Coalesce(Max("yards_gained", filter=Q(is_complete=True)), 0),
        )

    def get_passing_by_quarterback(self) -> list[dict]:
        """Per-QB passing statistics with passer rating."""
        qb_stats = list(
            PassPlay.objects.filter(self.filters, quarterback__isnull=False)
            .values(
                "quarterback__id",
                "quarterback__first_name",
                "quarterback__last_name",
                "quarterback__number",
            )
            .annotate(
                attempts=Count("id"),
                completions=Count("id", filter=Q(is_complete=True)),
                yards=Coalesce(Sum("yards_gained", filter=Q(is_complete=True)), 0),
                touchdowns=Count("id", filter=Q(is_touchdown=True)),
                interceptions=Count("id", filter=Q(is_interception=True)),
                sacks=Count("id", filter=Q(was_sacked=True)),
                air_yards=Coalesce(Sum("air_yards"), 0),
                yac=Coalesce(Sum("yards_after_catch", filter=Q(is_complete=True)), 0),
                longest=Coalesce(Max("yards_gained", filter=Q(is_complete=True)), 0),
                thrown_away=Count("id", filter=Q(is_thrown_away=True)),
                under_pressure=Count("id", filter=Q(was_under_pressure=True)),
            )
            .order_by("-yards")
        )

        # Calculate passer rating
        for stat in qb_stats:
            stat["completion_pct"] = (
                (stat["completions"] / stat["attempts"] * 100)
                if stat["attempts"] > 0
                else 0.0
            )
            stat["yards_per_attempt"] = (
                stat["yards"] / stat["attempts"] if stat["attempts"] > 0 else 0.0
            )
            stat["passer_rating"] = self._calculate_passer_rating(stat)

        return qb_stats

    def _calculate_passer_rating(self, stats: dict) -> float:
        """
        Calculate NFL passer rating.
        Formula: https://en.wikipedia.org/wiki/Passer_rating
        """
        if stats["attempts"] == 0:
            return 0.0

        a = max(0, min(2.375, (stats["completion_pct"] - 30) / 20))
        b = max(0, min(2.375, (stats["yards_per_attempt"] - 3) / 4))
        c = max(0, min(2.375, (stats["touchdowns"] / stats["attempts"]) * 20))
        d = max(
            0, min(2.375, 2.375 - (stats["interceptions"] / stats["attempts"] * 25))
        )

        return round(((a + b + c + d) / 6) * 100, 1)

    def get_receiving_by_player(self) -> list[dict]:
        """Per-receiver statistics."""
        return list(
            PassPlay.objects.filter(
                self.filters, receiver__isnull=False, is_complete=True
            )
            .values(
                "receiver__id",
                "receiver__first_name",
                "receiver__last_name",
                "receiver__number",
                "receiver__position",
            )
            .annotate(
                receptions=Count("id"),
                yards=Coalesce(Sum("yards_gained"), 0),
                touchdowns=Count("id", filter=Q(is_touchdown=True)),
                first_downs=Count("id", filter=Q(is_first_down=True)),
                longest=Coalesce(Max("yards_gained"), 0),
                yac=Coalesce(Sum("yards_after_catch"), 0),
                fumbles=Count("id", filter=Q(fumbled=True)),
                avg_yards=Coalesce(Avg("yards_gained"), 0.0),
            )
            .order_by("-yards")
        )
