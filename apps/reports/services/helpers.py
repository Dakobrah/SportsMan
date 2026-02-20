"""
Aggregation helper helpers for report services.

Keep helpers minimal and explicit — they return aggregation expressions
that can be used inside `.aggregate()` and `.annotate()` calls.
"""
from django.db.models import Count, Sum, Avg, Max, Q
from django.db.models.functions import Coalesce


def Cnt(filter: Q | None = None):
    """Count of rows (shorthand for Count('id', filter=...))."""
    if filter is not None:
        return Count("id", filter=filter)
    return Count("id")


def SumCoalesce(field: str, default=0, filter: Q | None = None):
    """Coalesced SUM expression for `field` with optional filter."""
    if filter is not None:
        return Coalesce(Sum(field, filter=filter), default)
    return Coalesce(Sum(field), default)


def AvgCoalesce(field: str, default=0.0, filter: Q | None = None):
    """Coalesced AVG expression for `field` with optional filter."""
    if filter is not None:
        return Coalesce(Avg(field, filter=filter), default)
    return Coalesce(Avg(field), default)


def MaxCoalesce(field: str, default=0, filter: Q | None = None):
    """Coalesced MAX expression for `field` with optional filter."""
    if filter is not None:
        return Coalesce(Max(field, filter=filter), default)
    return Coalesce(Max(field), default)


def fg_percentage(made: int, attempts: int) -> float:
    """Field goal / extra point percentage rounded to one decimal place."""
    return round(made / attempts * 100, 1) if attempts > 0 else 0.0
