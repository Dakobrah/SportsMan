# 06 — Report Services

← [05 — Live Tracker](05-tracker.md) | Next: [07 — Testing](07-testing.md)

---

## Overview

The report service layer (`apps/reports/services/`) encapsulates all statistical aggregation. Services are reusable across both the Django HTML frontend views and the DRF API views — the same `OffenseReportService` call powers both.

```
OffenseReportService  ─────┬─────▶ /reports/offense/ (HTML view)
                           └─────▶ /api/v1/reports/offense/rushing/totals/ (API view)
```

All queries run at the database level via Django ORM `aggregate()` and `annotate()`. No Python-level loops over rows for aggregation.

---

## `BaseReportService` — `apps/reports/services/base.py`

```python
class BaseReportService:
    def __init__(
        self,
        game_ids: list[int] | None = None,
        season_id: int | None = None,
        team_id: int | None = None,
    ):
        self.filters = Q()
        if game_ids:
            self.filters &= Q(game_id__in=game_ids)
        if season_id:
            self.filters &= Q(game__season_id=season_id)
        if team_id:
            self.filters &= Q(game__season__team_id=team_id)

    @staticmethod
    def player_values(relation: str, include_position: bool = False) -> tuple:
        """Return the standard .values() field tuple for a player FK relation.

        Used in every per-player annotate() query to avoid repeating the same
        4-field (or 5-field) tuple literal across all three service files.
        """
        fields = (
            f"{relation}__id",
            f"{relation}__first_name",
            f"{relation}__last_name",
            f"{relation}__number",
        )
        if include_position:
            fields += (f"{relation}__position",)
        return fields
```

The `self.filters` Q object is passed to every subclass query as `.filter(self.filters)`.
`player_values(relation)` is used by all per-player `.values()` calls via `.values(*self.player_values("ball_carrier"))`.

**Usage:**
```python
# Season-level report
service = OffenseReportService(season_id=2025_season.pk)

# Game-level report (e.g. game_detail view)
service = OffenseReportService(game_ids=[game.pk])

# Team-level report across all seasons
service = OffenseReportService(team_id=team.pk)

# No filter → entire database
service = OffenseReportService()
```

✅ **Fixed:** The three frontend report views now correctly pass `kwargs['season_id'] = int(season_id)` (singular, int) matching the `__init__` parameter. Previously used `season_ids=` (plural, list) which raised `TypeError` whenever a season filter was applied.

---

## `helpers.py` — `apps/reports/services/helpers.py`

Aggregation expression shortcuts used by all three service files. Import once, use everywhere.

```python
from django.db.models import Count, Sum, Avg, Max, Q
from django.db.models.functions import Coalesce  # ← must be functions, NOT models

def Cnt(filter: Q | None = None):
    """Count('id') with optional filter — shorthand for the most common aggregation."""
    return Count("id", filter=filter) if filter is not None else Count("id")

def SumCoalesce(field: str, default=0, filter: Q | None = None):
    """Coalesced SUM — returns default (not NULL) when no rows match."""
    return Coalesce(Sum(field, filter=filter), default) if filter else Coalesce(Sum(field), default)

def AvgCoalesce(field: str, default=0.0, filter: Q | None = None):
    """Coalesced AVG."""
    return Coalesce(Avg(field, filter=filter), default) if filter else Coalesce(Avg(field), default)

def MaxCoalesce(field: str, default=0, filter: Q | None = None):
    """Coalesced MAX."""
    return Coalesce(Max(field, filter=filter), default) if filter else Coalesce(Max(field), default)

def fg_percentage(made: int, attempts: int) -> float:
    """Field goal / extra point percentage rounded to one decimal. Returns 0.0 if no attempts."""
    return round(made / attempts * 100, 1) if attempts > 0 else 0.0
```

`fg_percentage` is called in `SpecialTeamsReportService` in two places: once for team FG totals and once per kicker row.

---

## `OffenseReportService` — `apps/reports/services/offense.py`

### `get_rushing_totals() → dict`

```python
def get_rushing_totals(self):
    return RunPlay.objects.filter(self.filters).aggregate(
        attempts    = Count('id'),
        yards       = Coalesce(Sum('yards_gained'), 0),
        touchdowns  = Count('id', filter=Q(is_touchdown=True)),
        first_downs = Count('id', filter=Q(is_first_down=True)),
        fumbles     = Count('id', filter=Q(fumbled=True)),
        longest     = Max('yards_gained'),
        avg         = Coalesce(Avg('yards_gained'), 0.0),
    )
# Returns: {attempts, yards, touchdowns, first_downs, fumbles, longest, avg}
```

### `get_rushing_by_player() → list[dict]`

```python
def get_rushing_by_player(self):
    return list(
        RunPlay.objects.filter(self.filters, ball_carrier__isnull=False)
        .values(*self.player_values("ball_carrier"))          # → (ball_carrier__id, __first_name, __last_name, __number)
        .annotate(
            attempts    = Count('id'),
            yards       = Coalesce(Sum('yards_gained'), 0),
            touchdowns  = Count('id', filter=Q(is_touchdown=True)),
            first_downs = Count('id', filter=Q(is_first_down=True)),
            fumbles     = Count('id', filter=Q(fumbled=True)),
            longest     = Max('yards_gained'),
            avg         = Coalesce(Avg('yards_gained'), 0.0),
            short_runs  = Count('id', filter=Q(yards_gained__lte=0)),      # 0 or negative
            long_runs   = Count('id', filter=Q(yards_gained__gte=10)),     # 10+ yards
            explosive   = Count('id', filter=Q(yards_gained__gte=20)),     # 20+ yards
        )
        .order_by('-yards')
    )
```

### `get_passing_totals() → dict`

```python
def get_passing_totals(self):
    return PassPlay.objects.filter(self.filters).aggregate(
        attempts      = Count('id'),
        completions   = Count('id', filter=Q(is_complete=True)),
        yards         = Coalesce(Sum('yards_gained'), 0),
        touchdowns    = Count('id', filter=Q(is_touchdown=True)),
        interceptions = Count('id', filter=Q(is_interception=True)),
        sacks         = Count('id', filter=Q(was_sacked=True)),
        air_yards     = Coalesce(Sum('air_yards'), 0),
        yac           = Coalesce(Sum('yards_after_catch'), 0),
    )
```

### `get_passing_by_quarterback() → list[dict]`

```python
def get_passing_by_quarterback(self):
    qbs = list(
        PassPlay.objects.filter(self.filters, quarterback__isnull=False)
        .values(*self.player_values("quarterback"))
        .annotate(attempts, completions, yards, touchdowns, interceptions, sacks, ...)
        .order_by('-yards')
    )
    # Attach NFL passer rating to each QB
    for qb in qbs:
        qb['passer_rating'] = self._calculate_passer_rating(
            qb['attempts'], qb['completions'], qb['yards'], qb['touchdowns'], qb['interceptions']
        )
    return qbs
```

### `_calculate_passer_rating(stats: dict) → float`

NFL passer rating formula. Receives the annotated dict for one QB row. Output range: 0.0 – 158.3.

```python
def _calculate_passer_rating(self, stats: dict) -> float:
    if stats['attempts'] == 0: return 0.0
    # Four components, each clamped 0..2.375:
    a = max(0, min(2.375, (stats['completion_pct'] - 30) / 20))
    b = max(0, min(2.375, (stats['yards_per_attempt'] - 3) / 4))
    c = max(0, min(2.375, (stats['touchdowns'] / stats['attempts']) * 20))
    d = max(0, min(2.375, 2.375 - (stats['interceptions'] / stats['attempts'] * 25)))
    return round(((a + b + c + d) / 6) * 100, 1)
# completion_pct and yards_per_attempt are computed in Python before calling this
```

### `get_receiving_by_player() → list[dict]`

```python
def get_receiving_by_player(self):
    return list(
        PassPlay.objects.filter(self.filters, receiver__isnull=False, is_complete=True)
        .values(*self.player_values("receiver", include_position=True))
        .annotate(
            receptions = Count('id'),
            yards      = Coalesce(Sum('yards_gained'), 0),
            touchdowns = Count('id', filter=Q(is_touchdown=True)),
            yac        = Coalesce(Sum('yards_after_catch'), 0),
            targets    = Count('id'),  # only completions here; targets include targets on incompletions
            longest    = Max('yards_gained'),
            avg        = Coalesce(Avg('yards_gained'), 0.0),
        )
        .order_by('-yards')
    )
```

---

## `DefenseReportService` — `apps/reports/services/defense.py`

### `get_team_totals() → dict`

```python
def get_team_totals(self):
    return DefenseSnap.objects.filter(self.filters).aggregate(
        total_tackles            = Count('id', filter=Q(play_result='TACKLE')),
        total_tfl                = Count('id', filter=Q(play_result='TFL')),
        total_sacks              = Count('id', filter=Q(play_result='SACK')),
        total_interceptions      = Count('id', filter=Q(play_result='INT')),
        total_fumble_recoveries  = Count('id', filter=Q(play_result='FREC')),
        total_pass_defended      = Count('id', filter=Q(play_result='PD')),
        total_pressures          = Count('id', filter=Q(applied_pressure=True)),
        total_forced_incompletions = Count('id', filter=Q(forced_incompletion=True)),
        defensive_touchdowns     = Count('id', filter=Q(is_defensive_touchdown=True)),
        int_return_yards         = Coalesce(Sum('interception_return_yards'), 0),
        fumble_return_yards      = Coalesce(Sum('fumble_return_yards'), 0),
    )
```

### `get_player_summary() → list[dict]`

```python
def get_player_summary(self):
    return list(
        DefenseSnap.objects.filter(self.filters, primary_player__isnull=False)
        .values(*self.player_values("primary_player", include_position=True))
        .annotate(
            tackles, tfl, sacks, interceptions, fumble_recoveries,
            pass_defended, pressures, def_tds
        )
        .order_by('-tackles')
    )
```

### `get_player_assists() → list[dict]`

```python
def get_player_assists(self):
    # Join through DefenseSnapAssist (not DefenseSnap)
    return list(
        DefenseSnapAssist.objects
        .filter(snap__in=DefenseSnap.objects.filter(self.filters))
        .values(*self.player_values("player"))
        .annotate(
            tackle_assists   = Count('id', filter=Q(assist_type='TACKLE')),
            sack_assists     = Count('id', filter=Q(assist_type='SACK')),
            coverage_assists = Count('id', filter=Q(assist_type='COV')),
        )
        .order_by('-tackle_assists')
    )
```

---

## `SpecialTeamsReportService` — `apps/reports/services/special_teams.py`

### `get_punt_totals() → dict`

```python
def get_punt_totals(self):
    return PuntSnap.objects.filter(self.filters).aggregate(
        punts      = Count('id'),
        yards      = Coalesce(Sum('punt_yards'), 0),
        avg        = Coalesce(Avg('punt_yards'), 0.0),
        longest    = Max('punt_yards'),
        touchbacks = Count('id', filter=Q(is_touchback=True)),
        blocked    = Count('id', filter=Q(is_blocked=True)),
    )
```

### `get_punt_by_punter() → list[dict]`

```python
def get_punt_by_punter(self):
    return list(
        PuntSnap.objects.filter(self.filters, punter__isnull=False)
        .values(*self.player_values("punter"))
        .annotate(punts, yards, avg, longest, touchbacks, blocked)
        .order_by('-yards')
    )
```

### `get_kickoff_totals() → dict`

```python
def get_kickoff_totals(self):
    return KickoffSnap.objects.filter(self.filters).aggregate(
        kickoffs           = Count('id'),
        yards              = Coalesce(Sum('kick_yards'), 0),
        avg                = Coalesce(Avg('kick_yards'), 0.0),
        touchbacks         = Count('id', filter=Q(is_touchback=True)),
        onside_attempts    = Count('id', filter=Q(is_onside_kick=True)),
        onside_recovered   = Count('id', filter=Q(onside_recovered=True)),
    )
```

### `get_field_goal_totals() → dict`

```python
def get_field_goal_totals(self):
    return FieldGoalSnap.objects.filter(self.filters).aggregate(
        attempts = Count('id'),
        made     = Count('id', filter=Q(result='GOOD')),
        missed   = Count('id', filter=Q(result='MISS')),
        blocked  = Count('id', filter=Q(result='BLOCK')),
        longest  = Max('kick_distance', filter=Q(result='GOOD')),
        # pct computed in Python: made / attempts * 100
    )
    # Note: kick_distance is used, NOT distance (which is BaseSnap.distance = yards to first down)
```

### `get_field_goal_by_kicker() → list[dict]`

Per-kicker FG stats with make percentage. Uses `*self.player_values("kicker")` and attaches `fg_percentage(stat["made"], stat["attempts"])` to each row in a Python loop after the DB query.

### `get_extra_point_totals() → dict`

```python
def get_extra_point_totals(self):
    return ExtraPointSnap.objects.filter(self.filters).aggregate(
        pat_attempts  = Count('id', filter=Q(attempt_type='KICK')),
        pat_made      = Count('id', filter=Q(attempt_type='KICK', result='GOOD')),
        pat_blocked   = Count('id', filter=Q(attempt_type='KICK', result='BLOCK')),
        two_pt_run_attempts  = Count('id', filter=Q(attempt_type='2PT_RUN')),
        two_pt_run_made      = Count('id', filter=Q(attempt_type='2PT_RUN', result='GOOD')),
        two_pt_pass_attempts = Count('id', filter=Q(attempt_type='2PT_PASS')),
        two_pt_pass_made     = Count('id', filter=Q(attempt_type='2PT_PASS', result='GOOD')),
    )
```

---

## API Views — `apps/reports/views.py`

Each API view is a simple wrapper around a service call:

```python
class RushingTotalsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(parameters=[season_id_param, team_id_param, game_id_param])
    def get(self, request):
        season_id = request.query_params.get('season_id')
        team_id   = request.query_params.get('team_id')
        game_id   = request.query_params.get('game_id')
        service   = OffenseReportService(
            season_id=season_id,
            team_id=team_id,
            game_ids=[game_id] if game_id else None,
        )
        return Response(service.get_rushing_totals())
```

---

## Frontend Views — `apps/frontend/views.py`

```python
@login_required
def report_offense(request):
    # kwargs['season_id'] = int(season_id) — singular, matches BaseReportService.__init__
    service = OffenseReportService(**kwargs)
    context = {
        'rushing_totals':   service.get_rushing_totals(),
        'rushing_by_player': service.get_rushing_by_player(),
        'passing_totals':   service.get_passing_totals(),
        'passing_by_qb':    service.get_passing_by_quarterback(),
        'receiving_by_player': service.get_receiving_by_player(),
    }
    return render(request, 'reports/offense.html', context)
```

---

## Key Design Patterns

**1. All aggregation at the DB level:**
```python
# GOOD — single SQL query
RunPlay.objects.filter(self.filters).aggregate(yards=Sum('yards_gained'))

# BAD — would loop in Python
total = sum(p.yards_gained for p in RunPlay.objects.filter(...))
```

**2. Conditional `Count` with `filter=Q(...)`:**
```python
# Count only sacks within a larger queryset
Count('id', filter=Q(play_result='SACK'))
# Equivalent SQL: COUNT(CASE WHEN play_result='SACK' THEN 1 END)
```

**3. `Coalesce` for null-safe aggregation:**
```python
from django.db.models.functions import Coalesce  # ← import from functions, NOT from models
Coalesce(Sum('yards_gained'), 0)  # returns 0 when Sum is NULL (no rows match)
```

**4. `values(...).annotate(...)` for per-entity aggregation:**
```python
RunPlay.objects
    .values(*self.player_values("ball_carrier"))     # expands to 4-field tuple
    .annotate(yards=Sum('yards_gained'))
# SQL: SELECT ball_carrier_id, ..., SUM(yards_gained) FROM ... GROUP BY ball_carrier_id
```

**5. `helpers.py` shorthand functions:**
```python
# Instead of Count("id", filter=Q(is_touchdown=True)):
Cnt(Q(is_touchdown=True))

# Instead of Coalesce(Sum("yards_gained"), 0):
SumCoalesce("yards_gained", 0)

# Instead of round(made / attempts * 100, 1) if attempts else 0.0:
fg_percentage(made, attempts)
```

**6. `BaseReportService.player_values(relation, include_position=False)` static method:**
Eliminates the repeated 4-field (or 5-field with position) tuple literal across all three service files. Always call it as `.values(*self.player_values("relation_name"))` or `*BaseReportService.player_values("relation_name")`.

---

→ Next: [07 — Testing](07-testing.md)
