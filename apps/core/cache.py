"""
Version-keyed caching helpers.

With multiple gunicorn workers, LocMem caches are per-process, so
signal-based invalidation would not propagate across workers. Instead,
cache keys embed a cheap "data version" derived from the data itself:
when snaps or games change (create, edit, undo/delete), the version
changes, stale entries become unaddressable, and TTL/LRU evicts them.
No invalidation code needed.
"""
from django.db.models import Count, Max

from apps.games.models import Game
from apps.snaps.models import BaseSnap


def data_version(*, team_id=None, season_id=None, game_ids=None):
    """
    Two cheap aggregates over the requested scope. Count catches
    creates/deletes; Max(updated_at) catches edits.
    """
    snap_qs = BaseSnap.objects.all()
    game_qs = Game.objects.all()
    if team_id:
        snap_qs = snap_qs.filter(game__season__team_id=team_id)
        game_qs = game_qs.filter(season__team_id=team_id)
    if season_id:
        snap_qs = snap_qs.filter(game__season_id=season_id)
        game_qs = game_qs.filter(season_id=season_id)
    if game_ids:
        snap_qs = snap_qs.filter(game_id__in=game_ids)
        game_qs = game_qs.filter(id__in=game_ids)

    snaps = snap_qs.aggregate(n=Count('id'), m=Max('updated_at'))
    games = game_qs.aggregate(n=Count('id'), m=Max('updated_at'))

    def _ts(value):
        return value.isoformat() if value else '0'

    return f"s{snaps['n']}-{_ts(snaps['m'])}:g{games['n']}-{_ts(games['m'])}"


def cache_key(prefix, params, version):
    """Deterministic key from a prefix, a params dict, and a data version."""
    param_str = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    return f"{prefix}:{param_str}:{version}"
