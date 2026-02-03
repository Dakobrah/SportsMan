"""
Filters for snap models.
"""
import django_filters
from .models import RunPlay, PassPlay, DefenseSnap, PuntSnap, KickoffSnap, FieldGoalSnap


class RunPlayFilter(django_filters.FilterSet):
    """Filter for RunPlay model."""

    min_yards = django_filters.NumberFilter(field_name="yards_gained", lookup_expr="gte")
    max_yards = django_filters.NumberFilter(field_name="yards_gained", lookup_expr="lte")

    class Meta:
        model = RunPlay
        fields = [
            "game",
            "quarter",
            "ball_carrier",
            "is_touchdown",
            "is_first_down",
            "fumbled",
        ]


class PassPlayFilter(django_filters.FilterSet):
    """Filter for PassPlay model."""

    min_yards = django_filters.NumberFilter(field_name="yards_gained", lookup_expr="gte")
    max_yards = django_filters.NumberFilter(field_name="yards_gained", lookup_expr="lte")

    class Meta:
        model = PassPlay
        fields = [
            "game",
            "quarter",
            "quarterback",
            "target",
            "receiver",
            "is_complete",
            "is_touchdown",
            "is_interception",
            "was_sacked",
        ]


class DefenseSnapFilter(django_filters.FilterSet):
    """Filter for DefenseSnap model."""

    class Meta:
        model = DefenseSnap
        fields = [
            "game",
            "quarter",
            "play_result",
            "primary_player",
            "tackle_for_loss",
            "is_defensive_touchdown",
        ]


class PuntSnapFilter(django_filters.FilterSet):
    """Filter for PuntSnap model."""

    class Meta:
        model = PuntSnap
        fields = ["game", "quarter", "punter", "is_blocked", "is_touchback"]


class KickoffSnapFilter(django_filters.FilterSet):
    """Filter for KickoffSnap model."""

    class Meta:
        model = KickoffSnap
        fields = ["game", "quarter", "kicker", "is_touchback", "is_onside_kick"]


class FieldGoalSnapFilter(django_filters.FilterSet):
    """Filter for FieldGoalSnap model."""

    min_distance = django_filters.NumberFilter(field_name="distance", lookup_expr="gte")
    max_distance = django_filters.NumberFilter(field_name="distance", lookup_expr="lte")

    class Meta:
        model = FieldGoalSnap
        fields = ["game", "quarter", "kicker", "result"]
