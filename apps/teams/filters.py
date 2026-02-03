"""
Filters for Team, Season, and Player models.
"""
import django_filters
from .models import Team, Season, Player


class TeamFilter(django_filters.FilterSet):
    """Filter for Team model."""

    name = django_filters.CharFilter(lookup_expr="icontains")

    class Meta:
        model = Team
        fields = ["name", "abbreviation"]


class SeasonFilter(django_filters.FilterSet):
    """Filter for Season model."""

    year_min = django_filters.NumberFilter(field_name="year", lookup_expr="gte")
    year_max = django_filters.NumberFilter(field_name="year", lookup_expr="lte")

    class Meta:
        model = Season
        fields = ["year", "team"]


class PlayerFilter(django_filters.FilterSet):
    """Filter for Player model."""

    name = django_filters.CharFilter(method="filter_by_name")
    position = django_filters.MultipleChoiceFilter(choices=Player.Position.choices)

    class Meta:
        model = Player
        fields = ["team", "position", "is_active", "number"]

    def filter_by_name(self, queryset, name, value):
        """Filter by first name or last name."""
        return queryset.filter(
            models.Q(first_name__icontains=value) | models.Q(last_name__icontains=value)
        )
