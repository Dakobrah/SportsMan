# 01 — System Architecture

← [INDEX](INDEX.md) | Next: [02 — Data Models](02-data-models.md)

---

## What SportsMan Is

A **football analytics platform** for recording play-by-play statistics in real time and generating aggregated coaching reports. Primary users are coaches and team staff who need to:

1. Record every play during a live game on a mobile device
2. Review rushing, passing, defensive, and special-teams statistics afterward
3. Manage team rosters and multi-year season records

---

## Feature Summary

| Feature | Status | Notes |
|---------|--------|-------|
| Live game tracker | ✓ Working | Mobile AJAX; coin toss, possession tracking |
| Play-by-play storage | ✓ Complete | 13 polymorphic snap types |
| Offensive reports | ✓ Complete | Rushing, passing, receiving, passer rating |
| Defensive reports | ✓ Complete | Tackles, sacks, turnovers, pressures |
| Special teams reports | ✓ Complete | Punts, FGs, kickoffs, PATs |
| Dashboard coaching metrics | ✓ Complete | Quarter trends, streak, 3rd-down %, red zone % |
| Team/Player/Season CRUD | ✓ Complete | Full API + frontend |
| REST API | ✓ Complete | 35+ endpoints, JWT auth, OpenAPI docs |
| Authentication | ✓ Complete | Session (frontend) + JWT (API) |
| Docker deployment | ✓ Complete | PostgreSQL + Gunicorn + Nginx |

---

## Architecture Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│         (mobile-first Bootstrap 5 dark theme UI)                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP
              ┌──────────────┼──────────────┐
              │ Port 80      │              │ Port 8000 (direct)
              ▼              │              ▼
        ┌──────────┐         │        ┌──────────────┐
        │  Nginx   │         │        │  WhiteNoise  │ ← serves static files
        │ (proxy + │         │        │  Middleware  │   without Nginx
        │  static) │         │        └──────┬───────┘
        └─────┬────┘         │               │
              │ proxy_pass   │               │
              ▼              │               ▼
        ┌──────────────────────────────────────────┐
        │          Gunicorn (3 workers)             │
        │       Django WSGI Application             │
        └────────────────┬─────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          │                             │
   ┌──────┴───────┐             ┌───────┴──────────┐
   │  Django HTML  │             │   Django REST    │
   │  Views (SSR)  │             │   Framework API  │
   │  @login_req   │             │   JWT auth       │
   └──────┬───────┘             └───────┬──────────┘
          │                             │
          └──────────────┬──────────────┘
                         │
                  ┌──────┴──────┐
                  │   Service   │
                  │    Layer    │ ← OffenseReportService
                  │  (reports)  │   DefenseReportService
                  └──────┬──────┘   SpecialTeamsReportService
                         │
                  ┌──────┴──────┐
                  │  Django ORM │
                  │ (Polymorphic│
                  │   Models)   │
                  └──────┬──────┘
                         │
          ┌──────────────┼──────────────┐
          │                             │
   ┌──────┴───────┐             ┌───────┴──────┐
   │  PostgreSQL  │             │   SQLite     │
   │   (Docker)   │             │  (dev/test)  │
   └──────────────┘             └──────────────┘
```

---

## Dual Interface Design

The app exposes the same data through two distinct interfaces:

```
                        ┌───────────────────┐
                        │   Data / Models   │
                        └─────────┬─────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
          ┌─────────┴────────┐       ┌──────────┴────────┐
          │  Frontend (HTML)  │       │   REST API (JSON) │
          │                  │       │                   │
          │ Session auth      │       │ JWT auth          │
          │ @login_required   │       │ IsAuthenticated   │
          │ TemplateResponse  │       │ Response(data)    │
          │ Bootstrap 5       │       │ OpenAPI docs      │
          │ CSRF protected    │       │ DRF browsable API │
          └──────────────────┘       └───────────────────┘
```

**Key principle:** The report services (`apps/reports/services/`) are shared between both interfaces. The same `OffenseReportService.get_rushing_totals()` call powers both the frontend `/reports/offense/` page and the API `/api/v1/reports/offense/rushing/totals/` endpoint.

---

## Authentication — Two Systems

| Interface | Method | Token Lifetime | Implementation |
|-----------|--------|---------------|----------------|
| Frontend HTML | Django session cookie | Browser session | `@login_required`, `AuthenticationForm`, `login()` / `logout()` |
| REST API | JWT Bearer token | 8h access / 30d refresh (12h/30d on LAN) | `JWTAuthentication`, `/api/v1/auth/token/` |

The two systems do **not** share state. A logged-in frontend session does not automatically grant API access — a separate JWT token must be obtained.

---

## URL Include Order — Critical

In [sportsman/urls.py](../sportsman/urls.py):

```python
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
    path("", include("apps.frontend.tracker_urls")),   # ← FIRST
    path("", include("apps.frontend.dashboard_urls")), # ← SECOND
    path("", include("apps.frontend.urls")),           # ← THIRD
]
```

**Why order matters:** Both `tracker_urls` and `frontend.urls` define routes under `/games/<pk>/...`. The tracker's `/games/<pk>/tracker/` must be matched *before* the frontend's `/games/<pk>/` CRUD routes. If the includes were reversed, the tracker URL would be captured by the frontend's game detail view.

---

## URL Namespaces

| Namespace | Module | `app_name` | Example usage |
|-----------|--------|------------|---------------|
| `frontend` | `apps.frontend.urls` | `frontend` | `{% url 'frontend:team_detail' team.pk %}` |
| `dashboard` | `apps.frontend.dashboard_urls` | `dashboard` | `{% url 'dashboard:home' %}` |
| `tracker` | `apps.frontend.tracker_urls` | `tracker` | `{% url 'tracker:game_tracker' game.id %}` |

URL namespaces require `app_name` to be defined in the included `urls.py` module. Without it, `NoReverseMatch` errors occur.

---

## Settings Hierarchy

```
sportsman/settings/
├── base.py            # Shared: INSTALLED_APPS, MIDDLEWARE, DRF, JWT, logging
│                      #   EXCEPTION_HANDLER = 'apps.core.exceptions.custom_exception_handler'
├── development.py     # DEBUG=True, SQLite, CORS allow all, browsable DRF API
├── local_network.py   # DEBUG=False default, PostgreSQL (env vars), WhiteNoise,
│                      #   higher JWT lifetimes, higher throttle limits
├── production.py      # Cloud production (extends local_network pattern)
└── test.py            # In-memory SQLite, MD5 hasher, no throttle, no logging
```

**Set via:** `DJANGO_SETTINGS_MODULE` environment variable.

### Key Settings in `base.py`

| Setting | Value |
|---------|-------|
| `AUTH_USER_MODEL` | `"accounts.User"` |
| `EXCEPTION_HANDLER` | `apps.core.exceptions.custom_exception_handler` |
| `DEFAULT_AUTHENTICATION_CLASSES` | `[SessionAuthentication, JWTAuthentication]` |
| `DEFAULT_THROTTLE_RATES` | `anon: 100/hour`, `user: 1000/hour` |
| `ACCESS_TOKEN_LIFETIME` | `timedelta(hours=8)` |
| `REFRESH_TOKEN_LIFETIME` | `timedelta(days=30)` |
| `ROTATE_REFRESH_TOKENS` | `True` |

---

## Polymorphic Snap Model Hierarchy

All play types share a common base using `django-polymorphic`:

```
BaseSnap (db_table="snaps") — PolymorphicModel
│   game, sequence_number, quarter, game_clock, down, distance, ball_position,
│   formation, play_called, notes
│
├── OffenseSnap (db_table="snaps_offense")
│   │   play_result, had_penalty, penalty_player, penalty_yards, penalty_description
│   ├── RunPlay  (db_table="snaps_offense_run")
│   │     ball_carrier, yards_gained, is_touchdown, is_first_down, fumble fields
│   └── PassPlay (db_table="snaps_offense_pass")
│         quarterback, target, receiver, is_complete, yards_gained,
│         air_yards, yards_after_catch, is_touchdown, is_first_down,
│         is_interception, was_sacked, sack_yards, fumble fields
│
├── DefenseSnap (db_table="snaps_defense")
│   │   play_result, primary_player, tackle_yards, opponent_play_type,
│   │   applied_pressure, forced_incompletion, turnover return yards, is_defensive_touchdown,
│   │   penalty fields
│   └── DefenseSnapAssist (separate model, not polymorphic)
│         snap(FK→DefenseSnap), player, assist_type
│
└── SpecialTeamsSnap (db_table="snaps_special_teams")
      │   penalty fields
      ├── PuntSnap          (db_table="snaps_st_punt")
      ├── PuntReturnSnap    (db_table="snaps_st_punt_return")
      ├── KickoffSnap       (db_table="snaps_st_kickoff")
      ├── KickoffReturnSnap (db_table="snaps_st_kickoff_return")
      ├── FieldGoalSnap     (db_table="snaps_st_field_goal")  ← kick_distance ≠ distance
      └── ExtraPointSnap    (db_table="snaps_st_extra_point")
```

**Key behaviors:**
- `BaseSnap.objects.all()` returns all snap types, auto-downcast to correct subclass
- `RunPlay.objects.all()` returns only run plays
- `snap.get_real_instance()` returns the most-derived class instance (used in undo)
- Polymorphic queries JOIN multiple tables — can be slower with large datasets; use specific subclass managers when possible

---

## Static File Serving Chain

```
Development (DEBUG=True):
  $ python manage.py runserver
  → Django serves /static/ from STATICFILES_DIRS

Docker (DEBUG=False):
  $ python manage.py collectstatic
  → copies static/ → staticfiles/

  Port 8000 (direct Gunicorn):
  → WhiteNoise middleware serves /static/ from staticfiles/

  Port 80 (via Nginx):
  → Nginx serves /static/ from staticfiles/ volume (30d cache, immutable)
  → Everything else → proxy_pass to Gunicorn
```

**Critical:** WhiteNoise must be in `requirements/base.txt` (not `production.txt`) so it's available in the Docker image which only installs `base.txt`.

---

→ Next: [02 — Data Models](02-data-models.md)
