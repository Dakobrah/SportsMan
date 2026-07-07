"""
Offensive statistics report service.
"""
from django.db.models import Q
from apps.snaps.models import RunPlay, PassPlay
from .base import BaseReportService
from .helpers import Cnt, SumCoalesce, AvgCoalesce, MaxCoalesce


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
            attempts=Cnt(),
            yards=SumCoalesce("yards_gained", 0),
            touchdowns=Cnt(Q(is_touchdown=True)),
            first_downs=Cnt(Q(is_first_down=True)),
            fumbles=Cnt(Q(fumbled=True)),
            fumbles_lost=Cnt(Q(fumble_lost=True)),
            longest=MaxCoalesce("yards_gained", 0),
            avg_yards=AvgCoalesce("yards_gained", 0.0),
        )

    def get_rushing_by_player(self, limit: int | None = None) -> list[dict]:
        """Per-player rushing statistics. limit slices at the database."""
        qs = (
            RunPlay.objects.filter(self.filters, ball_carrier__isnull=False)
            .values(*self.player_values("ball_carrier"))
            .annotate(
                attempts=Cnt(),
                yards=SumCoalesce("yards_gained", 0),
                touchdowns=Cnt(Q(is_touchdown=True)),
                first_downs=Cnt(Q(is_first_down=True)),
                fumbles=Cnt(Q(fumbled=True)),
                fumbles_lost=Cnt(Q(fumble_lost=True)),
                longest=MaxCoalesce("yards_gained", 0),
                avg_yards=AvgCoalesce("yards_gained", 0.0),
                short_runs=Cnt(Q(yards_gained__lte=5)),
                long_runs=Cnt(Q(yards_gained__gt=5)),
                explosive_runs=Cnt(Q(yards_gained__gte=10)),
            )
            .order_by("-yards")
        )
        if limit is not None:
            qs = qs[:limit]
        return list(qs)

    def get_passing_totals(self) -> dict:
        """Team passing totals."""
        return PassPlay.objects.filter(self.filters).aggregate(
            attempts=Cnt(),
            completions=Cnt(Q(is_complete=True)),
            yards=SumCoalesce("yards_gained", 0, q=Q(is_complete=True)),
            touchdowns=Cnt(Q(is_touchdown=True)),
            interceptions=Cnt(Q(is_interception=True)),
            sacks=Cnt(Q(was_sacked=True)),
            sack_yards=SumCoalesce("sack_yards", 0, q=Q(was_sacked=True)),
            air_yards=SumCoalesce("air_yards", 0),
            yac=SumCoalesce("yards_after_catch", 0, q=Q(is_complete=True)),
            longest=MaxCoalesce("yards_gained", 0, q=Q(is_complete=True)),
        )

    def get_passing_by_quarterback(self, limit: int | None = None) -> list[dict]:
        """Per-QB passing statistics with passer rating. limit slices at the database."""
        qs = (
            PassPlay.objects.filter(self.filters, quarterback__isnull=False)
            .values(*self.player_values("quarterback"))
            .annotate(
                attempts=Cnt(),
                completions=Cnt(Q(is_complete=True)),
                yards=SumCoalesce("yards_gained", 0, q=Q(is_complete=True)),
                touchdowns=Cnt(Q(is_touchdown=True)),
                interceptions=Cnt(Q(is_interception=True)),
                sacks=Cnt(Q(was_sacked=True)),
                air_yards=SumCoalesce("air_yards", 0),
                yac=SumCoalesce("yards_after_catch", 0, q=Q(is_complete=True)),
                longest=MaxCoalesce("yards_gained", 0, q=Q(is_complete=True)),
                thrown_away=Cnt(Q(is_thrown_away=True)),
                under_pressure=Cnt(Q(was_under_pressure=True)),
            )
            .order_by("-yards")
        )
        if limit is not None:
            qs = qs[:limit]
        qb_stats = list(qs)

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

    def get_receiving_by_player(self, limit: int | None = None) -> list[dict]:
        """Per-receiver statistics. limit slices at the database."""
        qs = (
            PassPlay.objects.filter(
                self.filters, receiver__isnull=False, is_complete=True
            )
            .values(*self.player_values("receiver", include_position=True))
            .annotate(
                receptions=Cnt(),
                yards=SumCoalesce("yards_gained", 0),
                touchdowns=Cnt(Q(is_touchdown=True)),
                first_downs=Cnt(Q(is_first_down=True)),
                longest=MaxCoalesce("yards_gained", 0),
                yac=SumCoalesce("yards_after_catch", 0),
                fumbles=Cnt(Q(fumbled=True)),
                avg_yards=AvgCoalesce("yards_gained", 0.0),
            )
            .order_by("-yards")
        )
        if limit is not None:
            qs = qs[:limit]
        return list(qs)
