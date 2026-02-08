# SportsMan Codebase Knowledge Document

> **Generated:** 2026-02-07
> **Repository Root:** `c:\Users\Dakota\SportsMan`
> **95 tests passing** at time of analysis.

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Tech Stack & Dependencies](#2-tech-stack--dependencies)
3. [Directory Structure](#3-directory-structure)
4. [System Architecture](#4-system-architecture)
5. [Data Model & Database Schema](#5-data-model--database-schema)
6. [Feature-by-Feature Analysis](#6-feature-by-feature-analysis)
7. [URL Routing Map](#7-url-routing-map)
8. [Infrastructure & Deployment](#8-infrastructure--deployment)
9. [Testing](#9-testing)
10. [Cross-Cutting Concerns](#10-cross-cutting-concerns)
11. [Gotchas, Nuances & Warnings](#11-gotchas-nuances--warnings)
12. [Glossary](#12-glossary)

---

## 1. High-Level Overview

### What It Is
SportsMan is a **football analytics platform** for tracking play-by-play game statistics in real time and generating aggregated reports. It targets **coaches and team staff** who need to record plays during live games from a mobile device, then review offensive, defensive, and special-teams statistics afterward.

### What It Does
1. **Team/Player/Season Management** — CRUD for teams, rosters, and seasons.
2. **Game Management** — Create games, record scores, weather, field conditions.
3. **Live Game Tracker** — Mobile-first single-page interface for real-time play-by-play recording (runs, passes, penalties, kickoffs, punts, field goals, extra points).
4. **Play-by-Play Storage** — Polymorphic snap model hierarchy stores every play with detailed attributes.
5. **Statistical Reports** — Aggregated rushing, passing, receiving, defensive, and special-teams reports using Django ORM aggregation.
6. **REST API** — Full CRUD API with JWT authentication, OpenAPI documentation, filtering, pagination.
7. **Dashboard** — Summary view with season record, points totals, recent games.

### How Features Interact

```
User (mobile/desktop browser)
    |
    |--- Frontend (Django templates + Bootstrap 5 dark theme)
    |       |--- Dashboard (season overview, record, recent games)
    |       |--- Team/Player/Game CRUD forms
    |       |--- Live Game Tracker (AJAX-driven play recording)
    |       |--- Reports pages (offense/defense/special teams)
    |
    |--- REST API (/api/v1/)
    |       |--- JWT Auth (token/refresh)
    |       |--- Teams/Seasons/Players ViewSets
    |       |--- Games/QuarterScores ViewSets
    |       |--- Snaps ViewSets (7 play types)
    |       |--- Reports endpoints (aggregated stats)
    |       |--- OpenAPI docs at /api/docs/
    |
    |--- Report Services (shared by frontend views + API views)
    |       |--- OffenseReportService
    |       |--- DefenseReportService
    |       |--- SpecialTeamsReportService
    |
    |--- Polymorphic Snap Models (django-polymorphic)
            |--- BaseSnap → OffenseSnap → RunPlay, PassPlay
            |--- BaseSnap → DefenseSnap (+ DefenseSnapAssist)
            |--- BaseSnap → SpecialTeamsSnap → Punt, Kickoff, FG, PAT, etc.
```

---

## 2. Tech Stack & Dependencies

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | Python | 3.12 (Docker), 3.14 (local dev) |
| Framework | Django | 5.0.x |
| API | Django REST Framework | 3.14+ |
| Auth | SimpleJWT | 5.3+ |
| Database | PostgreSQL (Docker) / SQLite (dev/test) | 16 |
| ORM Extension | django-polymorphic | 3.1+ |
| Filtering | django-filter | 23.5+ |
| API Docs | drf-spectacular (OpenAPI 3) | 0.27+ |
| CORS | django-cors-headers | 4.3+ |
| Static Files | WhiteNoise | 6.6+ |
| WSGI Server | Gunicorn | 21.2+ |
| Reverse Proxy | Nginx | Alpine |
| Frontend CSS | Bootstrap 5.3.2 (CDN, dark theme) | - |
| Frontend Icons | Bootstrap Icons 1.11.1 (CDN) | - |
| Frontend JS | Vanilla JavaScript (IIFE pattern) | - |
| Containerization | Docker + Docker Compose | v3.8 |

### `requirements/base.txt` (all environments)
```
Django>=5.0,<5.1
djangorestframework>=3.14
psycopg[binary]>=3.1
djangorestframework-simplejwt>=5.3
django-filter>=23.5
drf-spectacular>=0.27
django-cors-headers>=4.3
django-polymorphic>=3.1
gunicorn>=21.2
whitenoise>=6.6
```

---

## 3. Directory Structure

```
SportsMan/
├── api/                          # API URL routing
│   ├── urls.py                   # /api/ root: v1/, health, schema, docs
│   └── v1/
│       └── urls.py               # DRF router registrations + reports + auth
│
├── apps/
│   ├── core/                     # Shared base classes & utilities
│   │   ├── models.py             # TimeStampedModel (abstract: created_at, updated_at)
│   │   ├── pagination.py         # StandardPagination, MobilePagination, SnapCursorPagination
│   │   ├── health.py             # /api/health/ endpoint (DB connectivity check)
│   │   └── urls.py               # health_check path
│   │
│   ├── accounts/                 # User management
│   │   ├── models.py             # Custom User (AbstractUser + team FK)
│   │   ├── serializers.py        # UserSerializer, UserCreateSerializer, ChangePasswordSerializer
│   │   ├── views.py              # RegisterView, ProfileView, ChangePasswordView (DRF)
│   │   ├── urls.py               # JWT token endpoints + user management
│   │   └── admin.py
│   │
│   ├── teams/                    # Teams, seasons, players
│   │   ├── models.py             # Team, Season, Player
│   │   ├── serializers.py        # Full + Minimal serializers for each
│   │   ├── views.py              # TeamViewSet, SeasonViewSet, PlayerViewSet
│   │   ├── filters.py            # DjangoFilterBackend filter classes
│   │   ├── urls.py               # (registered via DRF router in api/v1/urls.py)
│   │   ├── admin.py
│   │   └── migrations/
│   │       ├── 0001_initial.py
│   │       └── 0002_seed_default_season.py  # Seeds a default 2025 season
│   │
│   ├── games/                    # Games & quarter scores
│   │   ├── models.py             # Game, QuarterScore
│   │   ├── serializers.py        # GameReadSerializer, GameWriteSerializer, QuarterScoreSerializer
│   │   ├── views.py              # GameViewSet, QuarterScoreViewSet
│   │   ├── filters.py
│   │   ├── urls.py               # (registered via DRF router)
│   │   ├── admin.py
│   │   └── migrations/
│   │
│   ├── snaps/                    # Play-by-play recording (polymorphic)
│   │   ├── models/
│   │   │   ├── __init__.py       # Re-exports all snap classes
│   │   │   ├── base.py           # Play (formation ref), BaseSnap (PolymorphicModel)
│   │   │   ├── offense.py        # OffenseSnap, RunPlay, PassPlay
│   │   │   ├── defense.py        # DefenseSnap, DefenseSnapAssist
│   │   │   └── special_teams.py  # SpecialTeamsSnap, PuntSnap, PuntReturnSnap,
│   │   │                         # KickoffSnap, KickoffReturnSnap, FieldGoalSnap,
│   │   │                         # ExtraPointSnap
│   │   ├── serializers/
│   │   │   ├── __init__.py       # Re-exports all serializer classes
│   │   │   ├── offense.py        # Read/Write serializers for run/pass
│   │   │   ├── defense.py        # Read/Write serializers for defense
│   │   │   └── special_teams.py  # Read/Write serializers for ST
│   │   ├── views.py              # 7 ModelViewSets (one per snap type)
│   │   ├── filters.py            # FilterSets for each snap type
│   │   ├── admin.py
│   │   └── migrations/
│   │
│   ├── reports/                  # Statistical aggregation
│   │   ├── services/
│   │   │   ├── __init__.py       # Re-exports service classes
│   │   │   ├── base.py           # BaseReportService (Q filter builder)
│   │   │   ├── offense.py        # OffenseReportService (rushing/passing/receiving)
│   │   │   ├── defense.py        # DefenseReportService (tackles/sacks/turnovers)
│   │   │   └── special_teams.py  # SpecialTeamsReportService (FG/PAT/punt/kickoff)
│   │   ├── serializers.py        # Output serializers for report data
│   │   ├── views.py              # DRF APIViews wrapping services
│   │   └── urls.py               # Report API endpoints
│   │
│   └── frontend/                 # Server-side rendered UI
│       ├── urls.py               # app_name='frontend' — all CRUD + auth + report pages
│       ├── dashboard_urls.py     # app_name='dashboard' — home view
│       ├── tracker_urls.py       # app_name='tracker' — live tracker + AJAX endpoints
│       ├── views.py              # All frontend views (auth, teams, players, games, reports)
│       ├── dashboard.py          # Dashboard home view
│       ├── tracker.py            # Live tracker view + 10 AJAX endpoints
│       └── apps.py
│
├── sportsman/                    # Django project config
│   ├── urls.py                   # Root URL conf
│   ├── settings/
│   │   ├── base.py               # Shared settings (installed apps, middleware, DRF, JWT)
│   │   ├── development.py        # DEBUG=True, SQLite, browsable API
│   │   ├── local_network.py      # Docker/LAN: PostgreSQL, DEBUG=False, whitenoise
│   │   ├── production.py         # Cloud production settings
│   │   └── test.py               # In-memory SQLite, MD5 hasher, no throttling
│   └── wsgi.py
│
├── templates/                    # Django templates
│   ├── base.html                 # Master layout (Bootstrap 5 dark, navbar, footer)
│   ├── includes/
│   │   ├── navbar.html
│   │   ├── footer.html
│   │   └── pagination.html
│   ├── dashboard/home.html
│   ├── accounts/ (login, register, profile)
│   ├── teams/ (list, detail, form, seasons)
│   ├── players/ (list, detail, form)
│   ├── games/ (list, detail, form, plays, tracker)
│   └── reports/ (offense, defense, special_teams)
│
├── static/
│   ├── css/
│   │   ├── style.css             # Global dark theme styles
│   │   └── tracker.css           # Tracker-specific styles
│   └── js/
│       ├── app.js                # Global JS (touch feedback, loading buttons)
│       └── tracker.js            # Tracker IIFE (state machine, form builders, AJAX)
│
├── tests/
│   ├── conftest.py               # Pytest fixtures
│   ├── factories/                # Factory Boy factories (accounts, teams, games, snaps)
│   ├── unit/                     # Unit tests (models, services, serializers, snap models)
│   └── integration/              # Integration tests (API endpoints, game simulation)
│
├── Dockerfile                    # Python 3.12-slim, installs base.txt
├── docker-compose.yml            # PostgreSQL + Django + Nginx
├── docker-entrypoint.sh          # migrate + collectstatic + gunicorn
├── nginx.conf                    # Reverse proxy with gzip, static file serving
├── pytest.ini                    # Test configuration
├── manage.py
└── requirements/
    ├── base.txt                  # Core dependencies (used by Dockerfile)
    └── production.txt            # Additional production dependencies
```

---

## 4. System Architecture

### Architecture Pattern
- **Monolithic Django application** with clear internal module boundaries
- **Dual interface**: Server-rendered HTML frontend + RESTful JSON API
- **Service layer** for reports (reused by both frontend and API views)
- **Polymorphic models** for the snap hierarchy (django-polymorphic)

### Request Flow

```
                    ┌─────────────┐
                    │   Browser   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │ Port 80    │            │ Port 8000
              ▼            │            ▼
        ┌──────────┐       │      ┌──────────┐
        │  Nginx   │       │      │ Gunicorn  │  (direct access)
        │ (static) │       │      │ (Django)  │
        └────┬─────┘       │      └──────────┘
             │ proxy_pass  │            ▲
             ▼             │            │
        ┌──────────┐       │      ┌─────────────┐
        │ Gunicorn  │──────┘      │  WhiteNoise  │ (serves static
        │  (3 wkrs) │             │  Middleware   │  when no Nginx)
        └────┬─────┘              └─────────────┘
             │
      ┌──────┴──────┐
      │              │
   ┌──┴───┐    ┌─────┴──────┐
   │Django │    │ Django REST │
   │Views  │    │ Framework   │
   │(HTML) │    │ (JSON API)  │
   └──┬───┘    └─────┬──────┘
      │              │
      └──────┬───────┘
             │
      ┌──────┴──────┐
      │   Report    │
      │  Services   │
      └──────┬──────┘
             │
      ┌──────┴──────┐
      │  Django ORM │
      │ (Polymorphic│
      │   Models)   │
      └──────┬──────┘
             │
      ┌──────┴──────┐
      │ PostgreSQL  │ (Docker)
      │  / SQLite   │ (dev/test)
      └─────────────┘
```

### Authentication (Two Systems)

| Interface | Auth Method | Implementation |
|-----------|-------------|----------------|
| Frontend (HTML) | Session-based (Django default) | `@login_required` decorator, `AuthenticationForm` |
| REST API | JWT (Bearer token) | `JWTAuthentication` in DRF, `/api/v1/auth/token/` |

### Settings Hierarchy

```
base.py (shared)
  ├── development.py   (DEBUG=True, SQLite, browsable API, CORS allow all)
  ├── local_network.py (DEBUG=False default, PostgreSQL, whitenoise, LAN settings)
  ├── production.py    (cloud production)
  └── test.py          (in-memory SQLite, MD5 hasher, no throttle, no logging)
```

---

## 5. Data Model & Database Schema

### Entity Relationship Diagram

```
┌─────────────┐
│    User      │ (accounts.User, extends AbstractUser)
│─────────────│
│ username     │
│ email        │
│ team (FK) ──────────────┐
└─────────────┘            │
                           ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Season     │────▶│    Team      │◀────│   Player     │
│─────────────│     │─────────────│     │─────────────│
│ year         │     │ name         │     │ first_name   │
│ team (FK)    │     │ abbreviation │     │ last_name    │
└──────┬──────┘     └─────────────┘     │ position     │
       │                                 │ number       │
       ▼                                 │ team (FK)    │
┌─────────────┐                         │ is_active    │
│    Game      │                         └─────────────┘
│─────────────│                               │
│ season (FK)  │                    referenced by many
│ date         │                    snap FK fields
│ opponent     │                               │
│ location     │                               ▼
│ weather      │◀───────────────── ┌─────────────────────┐
│ field_cond.  │                   │    BaseSnap          │ (polymorphic)
│ team_score   │                   │─────────────────────│
│ opp_score    │                   │ game (FK)            │
│ notes        │                   │ sequence_number      │
└──────┬──────┘                   │ quarter              │
       │                           │ game_clock           │
       ▼                           │ down, distance       │
┌─────────────┐                   │ ball_position        │
│QuarterScore  │                   │ formation            │
│─────────────│                   │ play_called (FK→Play)│
│ game (FK)    │                   │ notes                │
│ quarter      │                   └────────┬────────────┘
│ team_score   │                            │ (inheritance)
│ opp_score    │                   ┌────────┼────────────┐
└─────────────┘                   ▼        ▼            ▼
                          ┌──────────┐ ┌──────────┐ ┌───────────────┐
                          │OffenseSnap│ │DefenseSnap│ │SpecialTeamsSnap│
                          │──────────│ │──────────│ │───────────────│
                          │play_result│ │play_result│ │penalty fields │
                          │penalty... │ │primary_   │ └───┬───────────┘
                          └────┬─────┘ │ player    │     │
                               │       │tackle_*   │  ┌──┴──┬──────┬───────┬────────┐
                         ┌─────┴────┐  │turnover_* │  │Punt │Kickoff│  FG   │  PAT   │
                         ▼          ▼  │is_def_td  │  │Snap │ Snap  │ Snap  │ Snap   │
                    ┌────────┐┌────────┐└──────────┘  └─────┘└──────┘└──────┘└───────┘
                    │RunPlay  ││PassPlay│      │
                    │────────││────────│      ▼
                    │carrier  ││qb      │ ┌───────────────┐
                    │yards    ││receiver │ │DefenseSnapAssist│
                    │td/1st   ││is_comp  │ │player, type   │
                    │fumble   ││air_yards│ └───────────────┘
                    └────────┘│yac,int  │
                              │sack,td  │
                              │fumble   │
                              └────────┘
```

### Key Model Details

#### `Team` (`teams` table)
| Field | Type | Notes |
|-------|------|-------|
| `name` | CharField(100) | |
| `abbreviation` | CharField(10) | **unique** |

#### `Season` (`seasons` table)
| Field | Type | Notes |
|-------|------|-------|
| `year` | PositiveSmallIntegerField | |
| `team` | FK → Team | |
| | | **unique_together**: `[year, team]`, ordered by `-year` |

#### `Player` (`players` table)
| Field | Type | Notes |
|-------|------|-------|
| `first_name` | CharField(50) | |
| `last_name` | CharField(50) | |
| `position` | CharField(3) | TextChoices: QB, RB, FB, WR, TE, OL, DL, LB, CB, S, K, P, LS |
| `number` | PositiveSmallIntegerField | |
| `team` | FK → Team | |
| `is_active` | BooleanField | default=True |
| | | Indexes: `[team, is_active]`, `[last_name, first_name]` |

#### `Game` (`games` table)
| Field | Type | Notes |
|-------|------|-------|
| `season` | FK → Season | **No direct team FK** — access via `game.season.team` |
| `date` | DateField | |
| `opponent` | CharField(100) | |
| `location` | CharField(10) | Choices: home, away, neutral |
| `weather` | CharField(10) | Choices: clear, rainy, snowy, windy, hot, cold |
| `field_condition` | CharField(10) | Choices: turf, grass, wet |
| `team_score` | PositiveSmallIntegerField | default=0, updated by tracker |
| `opponent_score` | PositiveSmallIntegerField | default=0 |
| `notes` | TextField | |
| | | Properties: `is_win`, `is_loss`, `is_tie`, `result` (W/L/T) |

#### `BaseSnap` (`snaps` table, polymorphic)
| Field | Type | Notes |
|-------|------|-------|
| `game` | FK → Game | related_name='snaps' |
| `sequence_number` | PositiveIntegerField | Ordering within game |
| `quarter` | PositiveSmallIntegerField | |
| `game_clock` | DurationField | nullable |
| `down` | PositiveSmallIntegerField | nullable (kickoffs, PATs) |
| `distance` | PositiveSmallIntegerField | Yards to first down, nullable |
| `ball_position` | SmallIntegerField | -50 to +50 (negative = own territory) |
| `formation` | CharField(50) | |
| `play_called` | FK → Play | nullable |
| `notes` | TextField | |

#### `FieldGoalSnap` (`snaps_st_field_goal`)
Uses `kick_distance` (NOT `distance`) to avoid shadowing `BaseSnap.distance`.

### All Database Tables

| Table | Model |
|-------|-------|
| `users` | accounts.User |
| `teams` | teams.Team |
| `seasons` | teams.Season |
| `players` | teams.Player |
| `games` | games.Game |
| `quarter_scores` | games.QuarterScore |
| `plays` | snaps.Play |
| `snaps` | snaps.BaseSnap (polymorphic base) |
| `snaps_offense` | snaps.OffenseSnap |
| `snaps_offense_run` | snaps.RunPlay |
| `snaps_offense_pass` | snaps.PassPlay |
| `snaps_defense` | snaps.DefenseSnap |
| `snaps_defense_assists` | snaps.DefenseSnapAssist |
| `snaps_special_teams` | snaps.SpecialTeamsSnap |
| `snaps_st_punt` | snaps.PuntSnap |
| `snaps_st_punt_return` | snaps.PuntReturnSnap |
| `snaps_st_kickoff` | snaps.KickoffSnap |
| `snaps_st_kickoff_return` | snaps.KickoffReturnSnap |
| `snaps_st_field_goal` | snaps.FieldGoalSnap |
| `snaps_st_extra_point` | snaps.ExtraPointSnap |

---

## 6. Feature-by-Feature Analysis

### 6.1 Authentication & User Management

**Business Purpose:** Control access to the platform. Users are associated with a team.

**Frontend (session-based):**
- `apps/frontend/views.py` — `login_view`, `logout_view`, `register_view`, `profile_view`, `password_change_view`
- Templates: `templates/accounts/login.html`, `register.html`, `profile.html`
- All non-auth frontend views use `@login_required`
- Login redirects to `dashboard:home`

**API (JWT-based):**
- `apps/accounts/views.py` — `RegisterView`, `ProfileView`, `ChangePasswordView`
- `apps/accounts/urls.py` — Token obtain/refresh via SimpleJWT
- Endpoints: `/api/v1/auth/token/`, `/api/v1/auth/token/refresh/`, `/api/v1/auth/register/`, `/api/v1/auth/profile/`

**User Model** (`apps/accounts/models.py`):
- Extends `AbstractUser` — inherits username, email, password, etc.
- Adds `team` FK (optional, SET_NULL)
- `AUTH_USER_MODEL = "accounts.User"` in settings

### 6.2 Team, Season & Player Management

**Business Purpose:** Manage rosters. Seasons enable year-over-year analysis. Multi-team support.

**Frontend CRUD:**
| URL | View | Template |
|-----|------|----------|
| `/teams/` | `team_list` | `teams/list.html` |
| `/teams/<pk>/` | `team_detail` | `teams/detail.html` (shows roster by position) |
| `/teams/add/` | `team_create` | `teams/form.html` |
| `/teams/<pk>/edit/` | `team_edit` | `teams/form.html` |
| `/players/` | `player_list` | `players/list.html` (filters: team, position, search) |
| `/players/<pk>/` | `player_detail` | `players/detail.html` (shows stats) |
| `/players/add/` | `player_create` | `players/form.html` |
| `/players/<pk>/edit/` | `player_edit` | `players/form.html` |
| `/seasons/` | `season_list` | `teams/seasons.html` |

**API ViewSets** (registered in `api/v1/urls.py` via DRF router):
- `TeamViewSet` — `/api/v1/teams/` + custom actions: `players`, `seasons`
- `SeasonViewSet` — `/api/v1/seasons/`
- `PlayerViewSet` — `/api/v1/players/` + custom action: `by_position`

**Key Behavior:**
- `player_detail` view computes per-player rushing/passing/receiving/defensive stats inline using ORM aggregation
- Players are ordered by `number` by default
- Seasons ordered by `-year` (most recent first)
- Default season seeded by migration `0002_seed_default_season.py` (2025 season)

### 6.3 Game Management

**Business Purpose:** Record game metadata (opponent, date, weather, scores).

**Frontend CRUD:**
| URL | View | Template |
|-----|------|----------|
| `/games/` | `game_list` | `games/list.html` (filters: season, result, location) |
| `/games/<pk>/` | `game_detail` | `games/detail.html` (quarter scores, stats, leaders) |
| `/games/add/` | `game_create` | `games/form.html` |
| `/games/<pk>/edit/` | `game_edit` | `games/form.html` |
| `/games/<pk>/plays/` | `game_plays` | `games/plays.html` (play-by-play, filter by quarter) |
| `/games/<pk>/plays/add/` | `game_add_play` | Redirects to tracker |

**Game Detail View (`game_detail`):**
- Uses `OffenseReportService` to compute rushing/passing totals and leaders for that specific game
- Displays top rusher, passer, receiver
- Shows quarter-by-quarter scoring if QuarterScore records exist

**API:**
- `GameViewSet` — `/api/v1/games/` with read/write serializer split
- Custom actions: `quarter_scores` (GET/POST), `summary`
- `QuarterScoreViewSet` — `/api/v1/quarter-scores/`

**Important:** Game has no direct `team` FK. The team is accessed via `game.season.team`. This is a frequent source of confusion.

### 6.4 Live Game Tracker

**Business Purpose:** Enable coaches to record plays in real-time during live games using a mobile device. This is the primary data-entry mechanism for the platform.

**Architecture:** Single-page-app-like experience within a Django template. The page loads once; all play recording happens via AJAX (fetch API) to Django view endpoints that return JSON.

**Entry Point:** `/games/<pk>/tracker/` → `tracker.game_tracker` view

**Backend** (`apps/frontend/tracker.py`):

| Endpoint | View Function | HTTP | Purpose |
|----------|--------------|------|---------|
| `/games/<pk>/tracker/` | `game_tracker` | GET | Render tracker page |
| `/games/<pk>/tracker/run/` | `tracker_add_run` | POST | Record run play |
| `/games/<pk>/tracker/pass/` | `tracker_add_pass` | POST | Record pass play |
| `/games/<pk>/tracker/penalty/` | `tracker_add_penalty` | POST | Record penalty |
| `/games/<pk>/tracker/kickoff/` | `tracker_add_kickoff` | POST | Record kickoff |
| `/games/<pk>/tracker/punt/` | `tracker_add_punt` | POST | Record punt |
| `/games/<pk>/tracker/field-goal/` | `tracker_add_field_goal` | POST | Record FG |
| `/games/<pk>/tracker/extra-point/` | `tracker_add_extra_point` | POST | Record PAT/2pt |
| `/games/<pk>/tracker/update-score/` | `tracker_update_score` | POST | Manual score edit |
| `/games/<pk>/tracker/undo/` | `tracker_undo_play` | POST | Delete last play |
| `/games/<pk>/tracker/plays/` | `tracker_recent_plays` | GET | Recent plays feed |

**Frontend** (`static/js/tracker.js`):
- IIFE pattern — runs immediately when DOM is ready (script at bottom of body)
- State machine tracks: `quarter`, `down`, `distance`, `ball_position`, `next_sequence`, `team_score`, `opponent_score`, `currentForm`, `submitting`
- Player data and game state injected via `json_script` template tag (XSS-safe)
- CSRF token extracted from hidden form field
- Form builders dynamically create HTML forms for each play type
- Toggle buttons use `data-active` attribute for radio-group and toggle behavior
- Quick-yard buttons for rapid yardage entry
- 28 built-in penalty definitions with auto-populated yards and flags

**Game State Engine** (`compute_next_state` in `tracker.py`):
- Calculates next down/distance/ball_position after each play
- Handles: touchdowns → extra point situation, turnovers, turnover on downs, first downs, kickoffs, punts, field goals, penalties (with accepted/declined/auto-first-down logic)
- Ball position uses -50 to +50 coordinate system (negative = own territory)

**Score Auto-Update:**
- Touchdown: +6 points automatically
- FG Good: +3 points
- PAT Good: +1 point
- 2pt Good: +2 points
- Undo reverses these score changes

**Template** (`templates/games/tracker.html`):
- Extends `base.html` (inherits dark theme, navbar)
- Scoreboard with field position visualization
- Play type buttons grid (Run, Pass, Special Teams, Penalty)
- Special teams submenu (Kickoff, Punt, FG, PAT/2pt, Back)
- Dynamic form area (populated by JS)
- Recent plays feed
- Footer hidden on tracker page via CSS

### 6.5 Statistical Reports

**Business Purpose:** Aggregate play data into meaningful statistics for coaches to analyze performance.

**Service Layer** (`apps/reports/services/`):

All services extend `BaseReportService` which builds a `Q` filter from optional `game_ids`, `season_id`, and `team_id` parameters.

**OffenseReportService:**
| Method | Returns | Description |
|--------|---------|-------------|
| `get_rushing_totals()` | dict | Team rushing: attempts, yards, TDs, 1st downs, fumbles, longest, avg |
| `get_rushing_by_player()` | list[dict] | Per-player rushing with short/long/explosive run counts |
| `get_passing_totals()` | dict | Team passing: attempts, completions, yards, TDs, INTs, sacks, air yards, YAC |
| `get_passing_by_quarterback()` | list[dict] | Per-QB stats with **NFL passer rating calculation** |
| `get_receiving_by_player()` | list[dict] | Per-receiver: receptions, yards, TDs, YAC |

**DefenseReportService:**
| Method | Returns | Description |
|--------|---------|-------------|
| `get_team_totals()` | dict | Tackles, TFL, sacks, INTs, fumble recoveries, PDs, pressures, def TDs |
| `get_player_summary()` | list[dict] | Per-player defensive stats |
| `get_player_assists()` | list[dict] | Assist counts by player and type |

**SpecialTeamsReportService:**
| Method | Returns | Description |
|--------|---------|-------------|
| `get_punt_totals()` | dict | Punts, yards, avg, longest, touchbacks, blocked |
| `get_punt_by_punter()` | list[dict] | Per-punter stats |
| `get_kickoff_totals()` | dict | Kickoffs, yards, touchbacks, onside attempts |
| `get_field_goal_totals()` | dict | FG attempts, made, missed, blocked, percentage, longest |
| `get_field_goal_by_kicker()` | list[dict] | Per-kicker FG stats |
| `get_extra_point_totals()` | dict | PAT and 2pt attempts/made |

**Frontend Report Pages:**
| URL | View | Template |
|-----|------|----------|
| `/reports/offense/` | `report_offense` | `reports/offense.html` |
| `/reports/defense/` | `report_defense` | `reports/defense.html` |
| `/reports/special-teams/` | `report_special_teams` | `reports/special_teams.html` |

**API Report Endpoints** (under `/api/v1/reports/`):
| Endpoint | View |
|----------|------|
| `offense/rushing/totals/` | `RushingTotalsView` |
| `offense/rushing/players/` | `RushingByPlayerView` |
| `offense/passing/totals/` | `PassingTotalsView` |
| `offense/passing/quarterbacks/` | `PassingByQBView` |
| `offense/receiving/players/` | `ReceivingByPlayerView` |
| `defense/totals/` | `DefenseTotalsView` |
| `defense/players/` | `DefenseByPlayerView` |
| `special-teams/punting/totals/` | `PuntTotalsView` |
| `special-teams/kicking/totals/` | `FieldGoalTotalsView` |
| `special-teams/kicking/kickers/` | `FieldGoalByKickerView` |

**Key Design:** Services perform all aggregation at the database level using Django ORM `aggregate()` and `annotate()` with `Count`, `Sum`, `Avg`, `Max`, `Q`, and `Coalesce`. No Python-level loops for aggregation.

### 6.6 Dashboard

**Business Purpose:** Landing page showing season overview at a glance.

- **View:** `apps/frontend/dashboard.py` → `home()`
- **Template:** `templates/dashboard/home.html`
- **URL:** `/` (root)
- **Data:** Current season record (W-L), points for/against, total plays, recent 5 games

---

## 7. URL Routing Map

### Root URLs (`sportsman/urls.py`)
```
/admin/               → Django admin
/api/                 → API router
/games/<pk>/tracker/  → Tracker (matched first due to include order)
/                     → Dashboard (matched via dashboard_urls)
/*                    → Frontend CRUD (matched via frontend urls)
```

**Include order matters**: `tracker_urls` before `dashboard_urls` before `urls` ensures `/games/<pk>/tracker/` is matched by the tracker namespace, not the frontend namespace.

### API URLs (`/api/`)
```
/api/health/                     → Health check (unauthenticated)
/api/schema/                     → OpenAPI schema
/api/docs/                       → Swagger UI

/api/v1/teams/                   → TeamViewSet (CRUD + players, seasons actions)
/api/v1/seasons/                 → SeasonViewSet
/api/v1/players/                 → PlayerViewSet (+ by_position action)

/api/v1/games/                   → GameViewSet (+ quarter_scores, summary)
/api/v1/quarter-scores/          → QuarterScoreViewSet

/api/v1/snaps/run/               → RunPlayViewSet (+ by_carrier)
/api/v1/snaps/pass/              → PassPlayViewSet (+ by_quarterback, by_receiver)
/api/v1/snaps/defense/           → DefenseSnapViewSet (+ add_assist)
/api/v1/snaps/punt/              → PuntSnapViewSet
/api/v1/snaps/kickoff/           → KickoffSnapViewSet
/api/v1/snaps/field-goal/        → FieldGoalSnapViewSet
/api/v1/snaps/extra-point/       → ExtraPointSnapViewSet

/api/v1/reports/offense/...      → Offense report endpoints
/api/v1/reports/defense/...      → Defense report endpoints
/api/v1/reports/special-teams/...→ ST report endpoints

/api/v1/auth/token/              → JWT obtain
/api/v1/auth/token/refresh/      → JWT refresh
/api/v1/auth/register/           → User registration
/api/v1/auth/profile/            → User profile
/api/v1/auth/change-password/    → Password change
```

### URL Namespaces

| Namespace | Module | App Name |
|-----------|--------|----------|
| `frontend` | `apps.frontend.urls` | `frontend` |
| `dashboard` | `apps.frontend.dashboard_urls` | `dashboard` |
| `tracker` | `apps.frontend.tracker_urls` | `tracker` |

**Usage examples:** `{% url 'frontend:team_detail' team.pk %}`, `{% url 'dashboard:home' %}`, `{% url 'tracker:game_tracker' game.id %}`

---

## 8. Infrastructure & Deployment

### Docker Compose Stack

```yaml
services:
  db:       PostgreSQL 16 Alpine (healthcheck: pg_isready)
  web:      Django/Gunicorn (depends_on db healthy, 3 workers)
  nginx:    Nginx Alpine (port 80, serves static/media, proxies to web)
```

### Key Docker Configuration

- **Dockerfile** uses `python:3.12-slim`, installs from `requirements/base.txt`
- **Entrypoint** (`docker-entrypoint.sh`): `migrate --noinput` → `collectstatic --noinput` → `gunicorn`
- **Settings:** `DJANGO_SETTINGS_MODULE=sportsman.settings.local_network`
- **DEBUG=False** by default in Docker (env var override available)
- **Volumes:** `postgres_data`, `static_files`, `media_files` (shared between web and nginx)

### Static File Serving Chain

1. `collectstatic` copies from `static/` to `staticfiles/`
2. **WhiteNoise middleware** serves compressed/hashed static files from `staticfiles/` via Gunicorn (works on port 8000 directly)
3. **Nginx** also serves `staticfiles/` at `/static/` with 30-day cache headers (works on port 80)

### Environment Variables

| Variable | Default | Used In |
|----------|---------|---------|
| `DJANGO_SETTINGS_MODULE` | (none) | docker-compose.yml |
| `DJANGO_SECRET_KEY` | (required) | local_network.py |
| `DB_HOST` | `db` | local_network.py |
| `DB_NAME` | `sportsman` | local_network.py |
| `DB_USER` | `sportsman` | local_network.py |
| `DB_PASSWORD` | (required) | local_network.py, docker-compose.yml |
| `ALLOWED_HOSTS` | `localhost` | local_network.py |
| `DEBUG` | `False` | local_network.py |
| `CORS_ALLOWED_ORIGINS` | (all if unset) | local_network.py |

### Nginx Configuration

- Gzip compression for text/css/json/js/xml
- 60s timeouts (mobile-friendly)
- 10MB max upload
- Static files: 30-day expiry, `Cache-Control: public, immutable`
- Media files: 7-day expiry
- Proxy headers: `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`

---

## 9. Testing

### Test Configuration (`pytest.ini`)
```ini
[pytest]
DJANGO_SETTINGS_MODULE = sportsman.settings.test
python_files = test_*.py
python_classes = Test*
python_functions = test_*
```

### Test Settings (`sportsman/settings/test.py`)
- **In-memory SQLite** for speed
- **MD5 password hasher** (faster than PBKDF2)
- **No throttling** (prevents rate limit failures)
- **No logging** (clean test output)

### Test Structure
```
tests/
├── conftest.py           # Shared pytest fixtures
├── factories/            # Factory Boy factories
│   ├── accounts.py       # UserFactory
│   ├── teams.py          # TeamFactory, SeasonFactory, PlayerFactory
│   ├── games.py          # GameFactory
│   └── snaps.py          # RunPlayFactory, PassPlayFactory, etc.
├── unit/
│   ├── test_models.py        # Player, Game, Team model tests
│   ├── test_services.py      # Offense/Defense report service tests
│   ├── test_report_services.py # Extended report service tests
│   ├── test_snap_models.py   # All 13 snap types tested
│   └── test_serializers.py   # DRF serializer validation tests
└── integration/
    ├── test_api.py           # API endpoint tests (auth, CRUD, reports)
    └── test_game_simulation.py # Full game drive simulations
```

### Coverage (95 tests)
- Model properties and __str__
- Serializer validation (required fields, cross-field validation)
- Report service aggregation (empty DB, with data, filtered)
- API endpoints (auth required, CRUD, filtering)
- Full game simulation (TD drives, turnovers, blocked kicks)

---

## 10. Cross-Cutting Concerns

### Security
- **JWT tokens:** 8-hour access, 30-day refresh (12h/30d on LAN), rotation with blacklisting
- **CSRF:** Django CSRF middleware active, tracker uses `X-CSRFToken` header for AJAX
- **Password validation:** 4 validators (similarity, min length, common, numeric)
- **Rate limiting:** 100/hr anon, 1000/hr authenticated (500/5000 on LAN)
- **CORS:** Permissive in dev/LAN, configurable via env var
- **XSS prevention:** `json_script` template tag for safe JSON embedding (not `{{ var|safe }}`)
- **SQL injection:** All queries via Django ORM, no raw SQL

### Pagination
- **Standard:** 25 items/page (configurable via `page_size` query param, max 100)
- **Mobile:** 15 items/page (max 50)
- **Cursor:** For snap lists (consistent ordering with frequent inserts)
- **Frontend:** Django `Paginator` with 20-25 items/page

### API Documentation
- **drf-spectacular** generates OpenAPI 3.0 schema
- Swagger UI at `/api/docs/`
- Schema download at `/api/schema/`
- Report views have `@extend_schema` decorators with parameter and response documentation

### Filtering
- **django-filter** `FilterSet` classes for all models
- Standard filter backends: `DjangoFilterBackend`, `SearchFilter`, `OrderingFilter`
- Frontend views implement manual filtering via query params

---

## 11. Gotchas, Nuances & Warnings

### Critical: Field Name Conflicts
- `FieldGoalSnap` uses `kick_distance`, NOT `distance`. The base class `BaseSnap` already has a `distance` field (yards to first down). Using `distance` on `FieldGoalSnap` would shadow it. See `apps/snaps/models/special_teams.py:142`.

### Critical: No Direct Team FK on Game
- `Game` has `season` FK, not `team` FK. To get the team: `game.season.team`. Filtering games by team requires: `Game.objects.filter(season__team=team)`. This trips up new developers constantly.

### Critical: Coalesce Import
- `Coalesce` must be imported from `django.db.models.functions`, NOT `django.db.models`. Django doesn't error on wrong import — it silently produces wrong results.

### Critical: Static Files in Docker
- The Dockerfile installs from `requirements/base.txt`. WhiteNoise must be in `base.txt` (not just `production.txt`) or static files won't be served in Docker when `DEBUG=False`.
- Without WhiteNoise, accessing port 8000 directly yields unstyled pages.
- Nginx serves static files on port 80, but only from the `staticfiles` Docker volume (populated by `collectstatic`).

### Important: Template Silent Failures
- Django templates silently swallow missing attributes (`{{ game.team }}` returns empty string instead of erroring, even though Game has no `team` field)
- Python code (`Game.objects.filter(team=...)`) crashes with `FieldError`
- With `DEBUG=False`, template errors produce bare 500 responses — check container logs

### Important: Polymorphic Query Behavior
- `BaseSnap.objects.all()` returns all snap types, automatically downcasted to the correct subclass
- `RunPlay.objects.all()` returns only run plays
- `snap.get_real_instance()` returns the most-derived class (used in undo and feed serialization)
- Polymorphic queries join multiple tables — can be slower on large datasets

### Important: URL Include Order
- In `sportsman/urls.py`, `tracker_urls` is included BEFORE `frontend.urls`. Both define patterns under `/games/<pk>/...`. The tracker's `/games/<pk>/tracker/` must match before the frontend's `/games/<pk>/` catch-all.

### Important: Tracker Score Auto-Update
- The tracker automatically updates `game.team_score` when TDs, FGs, and PATs are recorded
- Undo reverses these score changes
- Manual score editing is also available (tap on score in scoreboard)
- Score changes are saved with `update_fields=['team_score']` (or both fields for manual edit)

### Moderate: Two Auth Systems
- Frontend uses Django session auth (`@login_required`)
- API uses JWT (`IsAuthenticated` with `JWTAuthentication`)
- They do not share auth state — a logged-in frontend user cannot automatically use the API without obtaining a JWT token

### Moderate: Report Service Filter Bug
- `BaseReportService.__init__` accepts `game_ids`, `season_id`, `team_id`
- But `report_offense` in `views.py` passes `season_ids` (plural) — this is likely a latent bug that only works because the kwarg is ignored by `__init__`

### Moderate: Player Position Choices
- 13 positions defined: QB, RB, FB, WR, TE, OL, DL, LB, CB, S, K, P, LS
- Tracker form builders filter players by position (e.g., only QBs for quarterback select)
- Adding new positions requires updating the `Player.Position` TextChoices

### Minor: Tracker Form Radio Groups
- Toggle buttons use JS radio-group logic for mutually exclusive choices (FG result, EP result, attempt type, accepted/declined)
- Other toggles are independent booleans
- Radio groups are defined in the `radioGroups` array in `tracker.js:750-755`

### Minor: Ball Position Coordinate System
- Range: -50 (own goal line) to +50 (opponent goal line)
- 0 = 50-yard line
- Display format: "OWN 25", "OPP 40", "50"
- Functions: `_ball_pos_display()` (Python), `ballPosDisplay()` (JS)

### Minor: Season Migration Seed
- `0002_seed_default_season.py` creates a default 2025 season for the first team (if any exist)
- This runs during `migrate` — if no teams exist yet, it's a no-op

---

## 12. Glossary

| Term | Definition |
|------|-----------|
| **Snap** | A single play in a football game. The base unit of play-by-play data. |
| **BaseSnap** | Polymorphic base model for all play types. |
| **Sequence Number** | Integer ordering of plays within a game (1, 2, 3...). |
| **Down** | Current down (1st through 4th). Null for kickoffs and PATs. |
| **Distance** | Yards needed for a first down. |
| **Ball Position** | Yard line represented as -50 to +50 (-=own territory, +=opponent territory). |
| **Play** | Reference table for named formations/plays (e.g., "Shotgun", "I-Formation"). Not to be confused with snap. |
| **Quarter** | Game period (1-4, 5+ for overtime). |
| **TD** | Touchdown — worth 6 points. |
| **PAT** | Point After Touchdown — kick worth 1 point. |
| **2pt** | Two-point conversion — run or pass worth 2 points. |
| **FG** | Field Goal — kick worth 3 points. |
| **TFL** | Tackle for Loss. |
| **INT** | Interception. |
| **YAC** | Yards After Catch. |
| **Air Yards** | Distance the ball traveled in the air before the catch point. |
| **Passer Rating** | NFL passer rating formula (0-158.3 scale), calculated in `OffenseReportService._calculate_passer_rating()`. |
| **Polymorphic Model** | Django model using `django-polymorphic` that automatically downcasts query results to the correct subclass. |
| **WhiteNoise** | Middleware that serves static files directly from Django/Gunicorn, required when `DEBUG=False`. |
| **IIFE** | Immediately Invoked Function Expression — the pattern used in `tracker.js` to avoid polluting global scope. |
| **Tracker** | The live game recording interface at `/games/<pk>/tracker/`. |
| **Service Layer** | Python classes in `apps/reports/services/` that encapsulate complex ORM queries, reusable across views. |

---

## Key Classes & Functions Reference

### Models (by import path)
| Import | Description |
|--------|-------------|
| `apps.core.models.TimeStampedModel` | Abstract base: `created_at`, `updated_at` |
| `apps.accounts.models.User` | Custom user with `team` FK |
| `apps.teams.models.Team` | `name`, `abbreviation` |
| `apps.teams.models.Season` | `year`, `team` FK |
| `apps.teams.models.Player` | `first_name`, `last_name`, `position`, `number`, `team`, `is_active` |
| `apps.games.models.Game` | `season`, `date`, `opponent`, `location`, `weather`, `field_condition`, `team_score`, `opponent_score` |
| `apps.games.models.QuarterScore` | `game`, `quarter`, `team_score`, `opponent_score` |
| `apps.snaps.models.Play` | Formation/play name reference table |
| `apps.snaps.models.BaseSnap` | Polymorphic base for all snaps |
| `apps.snaps.models.RunPlay` | Run with `ball_carrier`, `yards_gained`, TD/fumble flags |
| `apps.snaps.models.PassPlay` | Pass with QB/receiver, completion, `air_yards`/`yac`, sack/INT flags |
| `apps.snaps.models.DefenseSnap` | Defense play with tackle/sack/INT/fumble recovery tracking |
| `apps.snaps.models.DefenseSnapAssist` | M2M-like assists (tackle/sack/coverage) |
| `apps.snaps.models.PuntSnap` | `punter`, `punt_yards`, blocked/touchback flags |
| `apps.snaps.models.KickoffSnap` | `kicker`, `kick_yards`, touchback/onside flags |
| `apps.snaps.models.FieldGoalSnap` | `kicker`, `kick_distance` (not `distance`!), `result` |
| `apps.snaps.models.ExtraPointSnap` | `attempt_type` (KICK/2PT_RUN/2PT_PASS), `result`, player FKs |

### Services
| Import | Key Methods |
|--------|-------------|
| `apps.reports.services.OffenseReportService` | `get_rushing_totals()`, `get_rushing_by_player()`, `get_passing_totals()`, `get_passing_by_quarterback()`, `get_receiving_by_player()` |
| `apps.reports.services.DefenseReportService` | `get_team_totals()`, `get_player_summary()`, `get_player_assists()` |
| `apps.reports.services.SpecialTeamsReportService` | `get_punt_totals()`, `get_kickoff_totals()`, `get_field_goal_totals()`, `get_field_goal_by_kicker()`, `get_extra_point_totals()` |

### Tracker Functions (Python — `apps/frontend/tracker.py`)
| Function | Purpose |
|----------|---------|
| `compute_next_state(current_state, play_type, play_data, result_data)` | State engine: calculates next down/distance/position |
| `_get_next_sequence(game)` | Returns next sequence number for a game |
| `_ball_pos_display(pos)` | Converts -50..+50 to human-readable format |
| `tracker_undo_play(request, pk)` | Deletes last snap, reverses score changes |

### Tracker Functions (JavaScript — `static/js/tracker.js`)
| Function | Purpose |
|----------|---------|
| `postPlay(endpoint, data)` | AJAX POST to tracker endpoint, updates state |
| `showPlayForm(type)` | Shows the form for a specific play type |
| `resetToPlayTypeSelection()` | Returns to play type button grid |
| `buildRunForm()` / `buildPassForm()` / etc. | Generate form HTML for each play type |
| `submitRun()` / `submitPass()` / etc. | Collect form data and call `postPlay()` |
| `updateScoreboard()` | Sync DOM with current state |
| `addPlayToFeed(summary, detail)` | Prepend play to recent plays list |
| `undoLastPlay()` | AJAX undo with confirmation |

---

*End of document. This file is self-contained and can be used by any developer or LLM to understand, modify, or extend the SportsMan codebase.*
