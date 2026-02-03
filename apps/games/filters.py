"""
Filters for Game model.
"""
import django_filters
from .models import Game


class GameFilter(django_filters.FilterSet):
    """Filter for Game model."""

    date_from = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="date", lookup_expr="lte")
    opponent = django_filters.CharFilter(lookup_expr="icontains")
    is_win = django_filters.BooleanFilter(method="filter_is_win")

    class Meta:
        model = Game
        fields = ["season", "location", "weather", "field_condition"]

    def filter_is_win(self, queryset, name, value):
        """Filter by win/loss."""
        if value:
            return queryset.filter(team_score__gt=models.F("opponent_score"))
        return queryset.filter(team_score__lte=models.F("opponent_score"))
