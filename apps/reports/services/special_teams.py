"""
Special teams statistics report service.
"""
from django.db.models import Q
from apps.snaps.models import PuntSnap, KickoffSnap, FieldGoalSnap, ExtraPointSnap
from .base import BaseReportService
from .helpers import Cnt, SumCoalesce, AvgCoalesce, MaxCoalesce, fg_percentage


class SpecialTeamsReportService(BaseReportService):
    """Special teams statistics."""

    def get_punt_totals(self) -> dict:
        """Team punting totals."""
        return PuntSnap.objects.filter(self.filters).aggregate(
            punts=Cnt(),
            total_yards=SumCoalesce("punt_yards", 0),
            avg_yards=AvgCoalesce("punt_yards", 0.0),
            longest=MaxCoalesce("punt_yards", 0),
            touchbacks=Cnt(Q(is_touchback=True)),
            blocked=Cnt(Q(is_blocked=True)),
            out_of_bounds=Cnt(Q(out_of_bounds=True)),
        )

    def get_punt_by_punter(self) -> list[dict]:
        """Per-punter statistics."""
        return list(
            PuntSnap.objects.filter(self.filters, punter__isnull=False)
            .values(*self.player_values("punter"))
            .annotate(
                punts=Cnt(),
                total_yards=SumCoalesce("punt_yards", 0),
                avg_yards=AvgCoalesce("punt_yards", 0.0),
                longest=MaxCoalesce("punt_yards", 0),
                touchbacks=Cnt(Q(is_touchback=True)),
                blocked=Cnt(Q(is_blocked=True)),
            )
            .order_by("-total_yards")
        )

    def get_kickoff_totals(self) -> dict:
        """Team kickoff totals."""
        return KickoffSnap.objects.filter(self.filters).aggregate(
            kickoffs=Cnt(),
            total_yards=SumCoalesce("kick_yards", 0),
            avg_yards=AvgCoalesce("kick_yards", 0.0),
            touchbacks=Cnt(Q(is_touchback=True)),
            onside_attempts=Cnt(Q(is_onside_kick=True)),
            onside_recovered=Cnt(Q(onside_recovered=True)),
            out_of_bounds=Cnt(Q(out_of_bounds=True)),
        )

    def get_field_goal_totals(self) -> dict:
        """Team field goal totals."""
        totals = FieldGoalSnap.objects.filter(self.filters).aggregate(
            attempts=Cnt(),
            made=Cnt(Q(result=FieldGoalSnap.Result.GOOD)),
            missed=Cnt(Q(result=FieldGoalSnap.Result.MISSED)),
            blocked=Cnt(Q(result=FieldGoalSnap.Result.BLOCKED)),
            longest=MaxCoalesce("kick_distance", 0, q=Q(result=FieldGoalSnap.Result.GOOD)),
        )

        totals["percentage"] = fg_percentage(totals["made"], totals["attempts"])
        return totals

    def get_field_goal_by_kicker(self) -> list[dict]:
        """Per-kicker field goal statistics."""
        stats = list(
            FieldGoalSnap.objects.filter(self.filters, kicker__isnull=False)
            .values(*self.player_values("kicker"))
            .annotate(
                attempts=Cnt(),
                made=Cnt(Q(result=FieldGoalSnap.Result.GOOD)),
                missed=Cnt(Q(result=FieldGoalSnap.Result.MISSED)),
                blocked=Cnt(Q(result=FieldGoalSnap.Result.BLOCKED)),
                longest=MaxCoalesce("kick_distance", 0, q=Q(result=FieldGoalSnap.Result.GOOD)),
            )
            .order_by("-made")
        )

        for stat in stats:
            stat["percentage"] = fg_percentage(stat["made"], stat["attempts"])
        return stats

    def get_extra_point_totals(self) -> dict:
        """Team extra point totals."""
        totals = ExtraPointSnap.objects.filter(self.filters).aggregate(
            # PAT kicks
            pat_attempts=Cnt(Q(attempt_type=ExtraPointSnap.AttemptType.KICK)),
            pat_made=Cnt(Q(attempt_type=ExtraPointSnap.AttemptType.KICK, result=ExtraPointSnap.Result.GOOD)),
            # 2-point conversions
            two_pt_attempts=Cnt(Q(attempt_type__in=["2PT_RUN", "2PT_PASS"])),
            two_pt_made=Cnt(Q(attempt_type__in=["2PT_RUN", "2PT_PASS"], result=ExtraPointSnap.Result.GOOD)),
        )

        return totals
