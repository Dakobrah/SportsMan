# 03 — REST API

← [02 — Data Models](02-data-models.md) | Next: [04 — Frontend Views](04-frontend-views.md)

---

## Overview

The REST API lives under `/api/` and is versioned at `/api/v1/`. All endpoints require JWT authentication except `/api/health/`, `/api/schema/`, and `/api/docs/`.

**Interactive docs:** `/api/docs/` (Swagger UI via drf-spectacular)
**OpenAPI schema:** `/api/schema/`

---

## Error Response Format — RFC 9457

All API errors are normalized by `apps.core.exceptions.custom_exception_handler` into RFC 9457 Problem Details format:

```json
{
    "type": "about:blank",
    "status": 400,
    "title": "Bad Request",
    "detail": "name: This field is required.",
    "instance": "/api/v1/teams/"
}
```

Validation errors additionally include an `errors` dict with per-field messages:

```json
{
    "type": "about:blank",
    "status": 400,
    "title": "Bad Request",
    "detail": "name: This field is required.",
    "instance": "/api/v1/teams/",
    "errors": {
        "name": ["This field is required."]
    }
}
```

```python
# Pseudocode — apps/core/exceptions.py
def custom_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response:
        response.data = {
            "type": "about:blank",
            "status": response.status_code,
            "title": STATUS_TEXT_MAP[response.status_code],
            "detail": extract_detail(exc, response),
            "instance": context['request'].path,
        }
        if isinstance(exc, ValidationError):
            response.data["errors"] = original_response_data
    return response

class BusinessLogicError(APIException):
    status_code = 422   # Unprocessable Entity — business rule violation
```

---

## Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/auth/token/` | POST | Obtain JWT (send `username`, `password`) |
| `/api/v1/auth/token/refresh/` | POST | Refresh JWT (send `refresh` token) |
| `/api/v1/auth/register/` | POST | Create new user account |
| `/api/v1/auth/profile/` | GET / PATCH | View or update user profile |
| `/api/v1/auth/change-password/` | POST | Change password |

```python
# Pseudocode — apps/accounts/views.py
class RegisterView(CreateAPIView):
    # POST: create User via UserCreateSerializer; validate password; return 201

class ProfileView(RetrieveUpdateAPIView):
    # GET: return current user's profile
    # PATCH: update username/email/team

class ChangePasswordView(UpdateAPIView):
    # POST: validate old_password; set new_password; return 200
```

---

## Health Check

```
GET /api/health/
→ 200: {"status": "healthy", "database": "ok"}
→ 503: {"status": "unhealthy", "database": "error message"}
```

No authentication required. Used by Docker health checks.

---

## Pagination

| Class | Items/page | Max | Used by |
|-------|-----------|-----|---------|
| `StandardPagination` | 25 | 100 | Teams, Players, Games, Reports |
| `MobilePagination` | 15 | 50 | (available for mobile clients) |
| `SnapCursorPagination` | 50 | — | All snap ViewSets |

Pass `?page_size=N` to override (up to max).

---

## Teams & Roster

### `TeamViewSet` — `/api/v1/teams/`

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/v1/teams/` | List all teams |
| POST | `/api/v1/teams/` | Create team |
| GET | `/api/v1/teams/{id}/` | Retrieve team |
| PUT/PATCH | `/api/v1/teams/{id}/` | Update team |
| DELETE | `/api/v1/teams/{id}/` | Delete team |
| GET | `/api/v1/teams/{id}/players/` | List players on this team |
| GET | `/api/v1/teams/{id}/seasons/` | List seasons for this team |

```python
# Pseudocode
class TeamViewSet(ModelViewSet):
    serializer_class = TeamSerializer
    filterset_class = TeamFilter  # search by name, abbreviation

    @action(detail=True, methods=['get'])
    def players(self, request, pk):
        team = self.get_object()
        return Response(PlayerSerializer(team.player_set.all(), many=True).data)

    @action(detail=True, methods=['get'])
    def seasons(self, request, pk):
        team = self.get_object()
        return Response(SeasonSerializer(team.season_set.all(), many=True).data)
```

**Filters:** `?search=name_or_abbr`

### `SeasonViewSet` — `/api/v1/seasons/`

Standard CRUD. **Filters:** `?team=<id>`, `?year=<year>`

### `PlayerViewSet` — `/api/v1/players/`

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/v1/players/` | List players |
| POST | `/api/v1/players/` | Create player |
| GET/PUT/PATCH/DELETE | `/api/v1/players/{id}/` | Standard CRUD |
| GET | `/api/v1/players/by_position/?position=QB` | Filter by position for current user's team |

**Filters:** `?team=<id>`, `?position=QB`, `?is_active=true`, `?search=name_or_number`

---

## Games

### `GameViewSet` — `/api/v1/games/`

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/v1/games/` | List games |
| POST | `/api/v1/games/` | Create game |
| GET/PUT/PATCH/DELETE | `/api/v1/games/{id}/` | Standard CRUD |
| GET/POST | `/api/v1/games/{id}/quarter_scores/` | List or add quarter scores |
| GET | `/api/v1/games/{id}/summary/` | Game summary with record |

```python
# Pseudocode
class GameViewSet(ModelViewSet):
    def get_serializer_class(self):
        if self.request.method in ('POST', 'PUT', 'PATCH'):
            return GameWriteSerializer   # accepts season_id (int)
        return GameReadSerializer        # nests team and season objects

    @action(detail=True, methods=['get', 'post'])
    def quarter_scores(self, request, pk):
        # GET → list QuarterScores for game
        # POST → create QuarterScore for game

    @action(detail=True, methods=['get'])
    def summary(self, request, pk):
        game = self.get_object()
        return Response({game data, quarter_scores, record})
```

**Filters:** `?season=<id>`, `?location=home|away|neutral`, `?date_after=YYYY-MM-DD`, `?date_before=YYYY-MM-DD`

### `QuarterScoreViewSet` — `/api/v1/quarter-scores/`

Standard CRUD for QuarterScore objects.

---

## Snaps (Play-by-Play)

All snap endpoints use cursor-based pagination (`SnapCursorPagination`, 50/page).

### `RunPlayViewSet` — `/api/v1/snaps/run/`

| Method | URL | Description |
|--------|-----|-------------|
| GET/POST | `/api/v1/snaps/run/` | List / create |
| GET/PUT/PATCH/DELETE | `/api/v1/snaps/run/{id}/` | Detail |
| GET | `/api/v1/snaps/run/by_carrier/?carrier_id=<id>` | Filter by ball carrier |

**Filters:** `?game=<id>`, `?quarter=<1-4>`, `?ball_carrier=<id>`, `?is_touchdown=true`

### `PassPlayViewSet` — `/api/v1/snaps/pass/`

| Custom Action | URL |
|---------------|-----|
| `by_quarterback` | `?qb_id=<id>` |
| `by_receiver` | `?receiver_id=<id>` |

**Filters:** `?game=<id>`, `?quarter=<1-4>`, `?quarterback=<id>`, `?receiver=<id>`, `?is_complete=true`, `?is_interception=true`

### `DefenseSnapViewSet` — `/api/v1/snaps/defense/`

| Custom Action | URL | Method | Description |
|---------------|-----|--------|-------------|
| `add_assist` | `/api/v1/snaps/defense/{id}/add_assist/` | POST | Add `DefenseSnapAssist` to a snap |

```python
# Pseudocode
@action(detail=True, methods=['post'])
def add_assist(self, request, pk):
    snap = self.get_object()
    serializer = DefenseSnapAssistSerializer(data={
        'snap': snap.id,
        **request.data
    })
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data, status=201)
```

**Filters:** `?game=<id>`, `?quarter=<1-4>`, `?primary_player=<id>`, `?play_result=SACK`

### `PuntSnapViewSet` — `/api/v1/snaps/punt/`
### `KickoffSnapViewSet` — `/api/v1/snaps/kickoff/`
### `FieldGoalSnapViewSet` — `/api/v1/snaps/field-goal/`
### `ExtraPointSnapViewSet` — `/api/v1/snaps/extra-point/`

All four: standard CRUD only. **Filter:** `?game=<id>`, `?quarter=<1-4>`.

---

## Report Endpoints

All report endpoints: **GET only**, `IsAuthenticated`, no pagination (return full data).

Pass optional query params to filter: `?season_id=<id>`, `?team_id=<id>`, `?game_id=<id>` (or `?game_ids=1,2,3`).

### Offense Reports

```
GET /api/v1/reports/offense/rushing/totals/
→ {attempts, yards, tds, first_downs, fumbles, longest, avg}

GET /api/v1/reports/offense/rushing/players/
→ [{player, attempts, yards, tds, short_runs, long_runs, explosive_runs}, ...]

GET /api/v1/reports/offense/passing/totals/
→ {attempts, completions, yards, tds, interceptions, sacks, air_yards, yac}

GET /api/v1/reports/offense/passing/quarterbacks/
→ [{player, attempts, completions, yards, tds, interceptions, passer_rating}, ...]

GET /api/v1/reports/offense/receiving/players/
→ [{player, receptions, yards, tds, yac, targets}, ...]
```

### Defense Reports

```
GET /api/v1/reports/defense/totals/
→ {tackles, tfl, sacks, interceptions, fumble_recoveries, pass_defended,
   pressures, forced_incompletions, def_tds, int_return_yards, fumble_return_yards}

GET /api/v1/reports/defense/players/
→ [{player, tackles, tfl, sacks, interceptions, fumble_recoveries,
   pass_defended, pressures, def_tds}, ...]
```

### Special Teams Reports

```
GET /api/v1/reports/special-teams/punting/totals/
→ {punts, yards, avg, longest, touchbacks, blocked}

GET /api/v1/reports/special-teams/kicking/totals/
→ {attempts, made, missed, blocked, pct, longest, kickoffs, kick_yards, touchbacks}

GET /api/v1/reports/special-teams/kicking/kickers/
→ [{player, attempts, made, missed, blocked, pct, longest}, ...]
```

---

## Serializers

### Read vs Write Split

Complex models use separate read/write serializers:

```python
# Pseudocode pattern used for Game, RunPlay, PassPlay, DefenseSnap

class GameReadSerializer(ModelSerializer):
    # Nested: season={year, team={name, abbreviation}}
    # Properties: result, is_win

class GameWriteSerializer(ModelSerializer):
    # Flat: season=<int id>, opponent, date, location, weather, field_condition
```

```python
class RunPlayReadSerializer(ModelSerializer):
    # Nested: ball_carrier={id, number, first_name, last_name, position}
    # Includes all BaseSnap fields

class RunPlayWriteSerializer(ModelSerializer):
    # Flat: ball_carrier=<int id>, yards_gained, is_touchdown, etc.
    # Validates: ball_carrier required for non-penalty plays
```

### Permissions

```python
# apps/core/permissions.py

class IsTeamMember(BasePermission):
    # has_object_permission:
    # obj.team == request.user.team  OR
    # obj.season.team == request.user.team  OR
    # obj.game.season.team == request.user.team

class IsAdminOrReadOnly(BasePermission):
    # SAFE_METHODS (GET, HEAD, OPTIONS) → is_authenticated
    # Otherwise → is_staff
```

---

## Throttling

| Client | Rate (base) | Rate (LAN/prod) |
|--------|-------------|-----------------|
| Anonymous | 100/hour | 500/hour |
| Authenticated | 1000/hour | 5000/hour |

Throttling is **disabled** in `sportsman/settings/test.py` to prevent rate-limit failures during test runs.

---

→ Next: [04 — Frontend Views](04-frontend-views.md)
