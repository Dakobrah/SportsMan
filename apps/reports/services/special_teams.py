"""
Special teams statistics report service.
"""
from django.db.models import Count, Sum, Avg, Max, Coalesce, Q
from apps.snaps.models import PuntSnap, KickoffSnap, FieldGoalSnap, ExtraPointSnap
from .base import BaseReportService


class SpecialTeamsReportService(BaseReportService):
    """Special teams statistics."""

    def get_punt_totals(self) -> dict:
        """Team punting totals."""
        return PuntSnap.objects.filter(self.filters).aggregate(
            punts=Count("id"),
            total_yards=Coalesce(Sum("punt_yards"), 0),
            avg_yards=Coalesce(Avg("punt_yards"), 0.0),
            longest=Coalesce(Max("punt_yards"), 0),
            touchbacks=Count("id", filter=Q(is_touchback=True)),
            blocked=Count("id", filter=Q(is_blocked=True)),
            out_of_bounds=Count("id", filter=Q(out_of_bounds=True)),
        )

    def get_punt_by_punter(self) -> list[dict]:
        """Per-punter statistics."""
        return list(
            PuntSnap.objects.filter(self.filters, punter__isnull=False)
            .values(
                "punter__id",
                "punter__first_name",
                "punter__last_name",
                "punter__number",
            )
            .annotate(
                punts=Count("id"),
                total_yards=Coalesce(Sum("punt_yards"), 0),
                avg_yards=Coalesce(Avg("punt_yards"), 0.0),
                longest=Coalesce(Max("punt_yards"), 0),
                touchbacks=Count("id", filter=Q(is_touchback=True)),
                blocked=Count("id", filter=Q(is_blocked=True)),
            )
            .order_by("-total_yards")
        )

    def get_kickoff_totals(self) -> dict:
        """Team kickoff totals."""
        return KickoffSnap.objects.filter(self.filters).aggregate(
            kickoffs=Count("id"),
            total_yards=Coalesce(Sum("kick_yards"), 0),
            avg_yards=Coalesce(Avg("kick_yards"), 0.0),
            touchbacks=Count("id", filter=Q(is_touchback=True)),
            onside_attempts=Count("id", filter=Q(is_onside_kick=True)),
            onside_recovered=Count("id", filter=Q(onside_recovered=True)),
            out_of_bounds=Count("id", filter=Q(out_of_bounds=True)),
        )

    def get_field_goal_totals(self) -> dict:
        """Team field goal totals."""
        totals = FieldGoalSnap.objects.filter(self.filters).aggregate(
            attempts=Count("id"),
            made=Count("id", filter=Q(result=FieldGoalSnap.Result.GOOD)),
            missed=Count("id", filter=Q(result=FieldGoalSnap.Result.MISSED)),
            blocked=Count("id", filter=Q(result=FieldGoalSnap.Result.BLOCKED)),
            longest=Max("distance", filter=Q(result=FieldGoalSnap.Result.GOOD)),
        )

        # Calculate percentage
        totals["percentage"] = (
            round(totals["made"] / totals["attempts"] * 100, 1)
            if totals["attempts"] > 0
            else 0.0
        )

        return totals

    def get_field_goal_by_kicker(self) -> list[dict]:
        """Per-kicker field goal statistics."""
        stats = list(
            FieldGoalSnap.objects.filter(self.filters, kicker__isnull=False)
            .values(
                "kicker__id",
                "kicker__first_name",
                "kicker__last_name",
                "kicker__number",
            )
            .annotate(
                attempts=Count("id"),
                made=Count("id", filter=Q(result=FieldGoalSnap.Result.GOOD)),
                missed=Count("id", filter=Q(result=FieldGoalSnap.Result.MISSED)),
                blocked=Count("id", filter=Q(result=FieldGoalSnap.Result.BLOCKED)),
                longest=Max("distance", filter=Q(result=FieldGoalSnap.Result.GOOD)),
            )
            .order_by("-made")
        )

        for stat in stats:
            stat["percentage"] = (
                round(stat["made"] / stat["attempts"] * 100, 1)
                if stat["attempts"] > 0
                else 0.0
            )

        return stats

    def get_extra_point_totals(self) -> dict:
        """Team extra point totals."""
        totals = ExtraPointSnap.objects.filter(self.filters).aggregate(
            # PAT kicks
            pat_attempts=Count(
                "id", filter=Q(attempt_type=ExtraPointSnap.AttemptType.KICK)
            ),
            pat_made=Count(
                "id",
                filter=Q(
                    attempt_type=ExtraPointSnap.AttemptType.KICK,
                    result=ExtraPointSnap.Result.GOOD,
                ),
            ),
            # 2-point conversions
            two_pt_attempts=Count(
                "id",
                filter=Q(attempt_type__in=["2PT_RUN", "2PT_PASS"]),
            ),
            two_pt_made=Count(
                "id",
                filter=Q(
                    attempt_type__in=["2PT_RUN", "2PT_PASS"],
                    result=ExtraPointSnap.Result.GOOD,
                ),
            ),
        )

        return totals
