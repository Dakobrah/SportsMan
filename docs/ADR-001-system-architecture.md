# ADR-001: SportsMan System Architecture Evaluation

**Status:** Accepted (existing system — retrospective evaluation)
**Date:** 2026-04-04
**Deciders:** Infrastructure Architect / IT Operations Director
**Scope:** Full application — data model, API surface, auth, deployment, tracker state machine

---

## Context

SportsMan is a football analytics platform targeting K–12 schools, designed to be operated
by coaching staff on mobile devices during live games. Core requirements:

- **Live play entry** under field conditions (low connectivity tolerance, mobile-first UX)
- **Multi-team isolation** — each school's staff can only see their own data
- **FERPA-adjacent concern** — student-athlete data requires controlled access
- **Deployment target** — school network (on-prem Docker) or simple VPS; no cloud-native mandate
- **Operator profile** — coaches, not engineers; admin accounts managed by IT staff

The system is currently in active development with an initial K–12 rollout scope before
expanding to wider higher-education use.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        nginx (reverse proxy)                    │
│              static files served directly from volume           │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                    Django 5.0 / Gunicorn (WSGI)                 │
│                                                                 │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐ │
│  │  HTML Frontend           │  │  REST API  /api/v1/          │ │
│  │  /  (Django templates)   │  │  (DRF ViewSets + JWT)        │ │
│  │  Session-auth            │  │  Token-auth                  │ │
│  │  ├── dashboard.py        │  │  ├── teams, seasons, players │ │
│  │  ├── tracker.py          │  │  ├── games, quarter_scores   │ │
│  │  └── views.py            │  │  ├── snaps/* (7 types)       │ │
│  └──────────────────────────┘  │  └── reports/                │ │
│                                └──────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     Domain Apps                          │   │
│  │  accounts · teams · games · snaps · reports · core      │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│              PostgreSQL 16 (prod) / SQLite (dev)                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture Decisions

### 1. Polymorphic Snap Hierarchy (django-polymorphic / CTI)

**Decision:** All play types share a single `BaseSnap` table via concrete table inheritance.
Each subtype has its own table (`snaps_offense_run`, `snaps_offense_pass`, `snaps_defense`, etc.)
linked via Django-polymorphic's `PolymorphicModel`.

```
BaseSnap (snaps table — sequence, quarter, down, distance, ball_position)
├── OffenseSnap (snaps_offense)
│   ├── RunPlay  (snaps_offense_run)
│   └── PassPlay (snaps_offense_pass)
├── DefenseSnap  (snaps_defense)
└── SpecialTeamsSnap (snaps_special_teams)
    ├── PuntSnap · KickoffSnap · FieldGoalSnap · ExtraPointSnap
    └── PuntReturnSnap · KickoffReturnSnap
```

**Rationale:** Avoids the single-table alternative's sparse column explosion (PassPlay alone
carries 15 fields, most irrelevant to a RunPlay). Each subtype is independently queryable
with full type safety. The `unique_together = [("game", "sequence_number")]` constraint on
`BaseSnap` enforces play ordering integrity at the DB level.

**Risk — N+1 on BaseSnap queries:** `BaseSnap.objects.all()` performs one query per row to
downcast. Mitigated in `tracker_recent_plays` via explicit `get_real_instances()` batching:
```python
real_map = {s.pk: s for s in BaseSnap.objects.filter(pk__in=snap_pks).get_real_instances()}
```
Any new code that iterates over `BaseSnap` querysets must follow this pattern or use
type-specific managers (e.g., `RunPlay.objects.filter(...)`) to avoid silent N+1 regressions.

**Risk — Schema migration overhead:** Adding a field to any snap subtype requires a migration
touching only that table, which is acceptable. Adding a field to `BaseSnap` touches the
shared `snaps` table and requires coordinated deployment.

---

### 2. Dual Interface: REST API + Django Template Frontend

**Decision:** The system exposes two completely separate interface layers over the same domain
models:

| Layer | Path | Auth | Use Case |
|---|---|---|---|
| Django templates + vanilla JS | `/` | Session (cookie) | Coaches, live tracker, dashboard |
| DRF ViewSets | `/api/v1/` | JWT (Bearer) | External integration, mobile apps, tooling |

**Rationale:** Session auth is the right default for a browser UI — no token management
complexity for end users, CSRF protection is automatic via Django middleware, and
the browsable API (dev only) is accessible without client tooling. JWT is preserved for
programmatic API access (future integrations, potential mobile app, data exports).

**Note:** The tracker AJAX endpoints (`/games/<pk>/tracker/*/`) use Django's `@login_required`
decorator and CSRF tokens, not JWT. This is intentional and correct — they are part of the
HTML surface, not the API surface.

**Risk — Two auth surfaces to maintain:** Any new permission must be implemented in both
`apps.core.permissions` (for DRF) and the `_parse_request` / `_require_staff_or_own_team`
helpers in the frontend views. The current staff bypass pattern (`if not request.user.is_staff`)
is consistent but not centralized; drift risk exists as the system grows.

---

### 3. Identity Model and RBAC

**Decision:** A simple two-tier identity model:

- `User.is_staff = True` → full admin access across all teams
- `User.team FK` → scoped to that team's data only
- `REGISTRATION_ENABLED = False` (default) → no self-registration; accounts provisioned by IT

Three DRF permission classes implement object-level authorization:

| Class | Behavior |
|---|---|
| `IsTeamMember` | Staff bypass; walks `obj.team / obj.season.team / obj.game.season.team` FK chains |
| `IsTeamMemberOrStaff` | Read-any, write-own-team |
| `IsAdminOrReadOnly` | Read-any, write-staff-only |

**Strengths:**
- `REGISTRATION_ENABLED = False` is the correct default for K–12. Coaches do not self-provision.
- Staff bypass is explicit (`is_staff`) rather than a separate role FK, avoiding role-table complexity appropriate at this scale.
- JWT settings are reasonably hardened: 60-minute access tokens (reduced from original 8 hours), 30-day refresh with rotation + blacklist.

**Gaps:**
- No per-season or per-game granularity — a user assigned to Team A can access all seasons and all games for that team. For a K–12 rollout this is likely acceptable; for multi-staff scenarios (varsity vs. JV coaches on the same team) it would need a role field on User.
- The `User.team` FK uses `SET_NULL` on delete. If a team is deleted, users lose their team assignment silently. An `on_delete=models.PROTECT` guard should be evaluated.
- No audit log beyond `created_at`/`updated_at`. For FERPA-adjacent data, who-changed-what is a reasonable operational requirement even at K–12 scale.

---

### 4. Tracker State Machine

> **⚠ Superseded (July 2026):** this section describes the pre-rebuild, client-authoritative
> design. The tracker is now server-authoritative with a `GameState` model, polling-based
> multi-viewer sync, and delta/snapshot undo — see [DESIGN-live-tracker.md](DESIGN-live-tracker.md).

**Decision:** Game state (down, distance, ball position, possession, situation) is managed
as a pure Python dictionary, computed synchronously per play by `compute_next_state()` and
`_defense_next_state()`. State is:

1. **Persisted per snap** — each `BaseSnap` record stores `down`, `distance`, `ball_position` at snap time
2. **Transmitted to browser** — `game_tracker` view embeds current state as a JSON blob in the page
3. **Client-maintained** — `tracker.js` holds an in-memory `state` object updated after each successful AJAX response
4. **Not stored as a separate entity** — there is no `GameState` model; state can always be reconstructed by replaying snaps

**Coordinate system:** `ball_position` ranges -50 (our endzone) to +50 (opponent endzone). This is
internally consistent and correctly handled for all situations (kickoffs, touchbacks, defensive
scenarios). The sign convention maps directly to possession context.

**Situation enum:** `normal | opponent_ball | turnover | turnover_on_downs | extra_point |
kickoff | safety | safety_kick | opponent_td` drives UI and next-play routing.

**Strengths:**
- `compute_next_state` is a pure function — fully unit-testable without DB, and the test suite
  (`test_tracker_logic.py`) covers 25+ edge cases including blocked punts, safeties, onside kicks,
  defensive TDs, and interception touchbacks.
- Transactional writes — every play endpoint wraps DB writes in `@transaction.atomic`, preventing
  partial state corruption on exception.
- Undo support — `tracker_undo_play` deletes the last snap and reverses score adjustments,
  using `select_for_update` to prevent concurrent undo races.

**Risks:**
- **No server-side game state persistence** — the browser's `state` object is authoritative for
  the current drive. On page reload, state is re-embedded from the last snap's stored fields.
  If the stored fields on a snap are wrong (e.g., a bug in `compute_next_state`), the state
  embedded on reload will be wrong with no easy reconciliation path.
- **No WebSocket / real-time sync** — the tracker is single-user by design. Two coaches on the
  same game simultaneously would produce conflicting `sequence_number` values, caught only by
  the DB `unique_together` constraint (which returns a 500 rather than a user-friendly conflict).
- **1,037-line tracker.py** — the tracker module has grown to handle coin toss, defer decision,
  9 play types, undo, score update, and recent plays in a single file. Refactoring into a
  `tracker/` package with `handlers/`, `state.py`, and `serializers.py` modules is warranted.

---

### 5. Reports / Analytics Layer

**Decision:** Analytics are computed on-demand via a service-layer pattern. `BaseReportService`
accepts `game_ids`, `season_id`, `team_id` filters and produces aggregated statistics using
Django ORM `annotate()` / `aggregate()` — single queries pushed to the database, not Python loops.

**Strengths:**
- NFL passer rating formula implemented correctly.
- `air_yards`, `yards_after_catch`, `target`/`receiver` distinction in `PassPlay` enable
  advanced receiver and QB analytics beyond what most K–12 systems offer.
- Service layer is Django-independent — testable without HTTP, reusable by management commands.

**Risks:**
- **No caching** — every report page hit runs aggregate queries against the full snap table.
  For a single-team K–12 installation (< 500 snaps per season) this is fine. Scaling to
  multi-team requires at minimum query result caching (Django cache framework or Postgres
  materialized views).
- **Dashboard queries are unoptimized** — `dashboard.py` issues multiple separate queries
  (wins, losses, totals, total_plays, leaders) where a single CTE or window query would suffice.
  Acceptable at current scale; becomes a latency issue above ~50 concurrent users.

---

### 6. Deployment Architecture

**Decision:** Docker Compose with three services: `db` (PostgreSQL 16), `web` (Gunicorn + Django),
`nginx` (reverse proxy + static file serving).

```
Internet → nginx:80 → web:8000 (Gunicorn)
                    ↘ /static/ (volume, served directly by nginx)
                      /media/  (volume, served directly by nginx)
web → db:5432 (PostgreSQL, SSL required in production)
```

**Production security posture:**
- `SECURE_SSL_REDIRECT`, HSTS with `preload`, `SECURE_CONTENT_TYPE_NOSNIFF`, `X_FRAME_OPTIONS=DENY`
- PostgreSQL `sslmode=require` — enforces encrypted connections to DB
- CORS explicitly scoped (no wildcard in production)
- Sentry integration for error tracking + performance sampling
- All secrets sourced from environment variables; `SECRET_KEY = None` in base settings prevents
  accidental production run with a dev key

**Risks:**
- **Single-node, no HA** — the Compose stack has no replica for `web` or `db`. For a school
  where games are tracked live, a process crash during a game is a service outage. A basic
  `restart: unless-stopped` policy is present and mitigates transient crashes, but hardware
  failure or OOM kill is unrecovered without manual intervention.
- **No backup automation** — `./backups` volume is mounted on `db` but no `pg_dump` cron is
  configured in the Compose file. Backups must be implemented at the host level.
- **WhiteNoise for static files** — used correctly (production-grade, compressed manifests).
  No S3 dependency is appropriate for on-prem school deployments.
- **WSGI only, no ASGI** — the `asgi.py` exists but is unused. The tracker has no real-time
  requirements today; if multi-coach simultaneous entry or live audience dashboards are added,
  migrating to ASGI (Daphne/Uvicorn) + Django Channels is the path forward.

---

### 7. Static Asset Pipeline

**Decision:** Vanilla JS + Bootstrap + CSS — no build step, no bundler, no framework.

**Rationale:** Correct choice for current scale and team. Zero build tooling overhead,
no npm dependency surface area, instant iteration. Tracker UI is mobile-first, dark-themed,
and performs well on modern mobile browsers.

**Risk:** `tracker.js` is currently 1,400+ lines in a single file with no module system.
As the tracker feature set grows (WebSocket, offline support, play diagrams), the absence
of a module system will become a maintenance burden. ES modules (`type="module"`) or a
lightweight bundler (Vite) should be considered before adding significant new tracker features.

---

## Risk Register

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| N+1 on BaseSnap iteration | High | Medium | Use `get_real_instances()` pattern; add linting guard |
| Single-node deployment (no HA) | High | Low | Document SLA; implement systemd restart policy; consider Postgres streaming replica |
| No backup automation | High | Medium | Add `pg_dump` cron to host or extend Compose with a backup sidecar |
| 1,037-line tracker.py | Medium | High | Refactor into `tracker/` package before next major feature |
| No audit log | Medium | Low | Implement `django-simple-history` or append-only audit table |
| User.team SET_NULL on delete | Medium | Low | Change to PROTECT; add admin warning before team deletion |
| No conflict detection on concurrent tracker use | Medium | Low | Return 409 on `unique_together` IntegrityError instead of 500 |
| CORS_ALLOW_ALL_ORIGINS in development | Low | Medium | Enforce in CI that dev settings are never used in production |
| Dashboard unoptimized multi-query | Low | Low | Consolidate with CTEs; add caching when team count > 5 |
| Tracker state not DB-persisted | Low | Medium | Document "single browser session" constraint; consider `GameState` snapshot model |

---

## Action Items

1. [ ] **Add `pg_dump` backup automation** — cron job or Compose backup sidecar writing to `./backups/` with daily retention. Highest operational risk item.
2. [ ] **Refactor `tracker.py` into a package** — split into `tracker/handlers/`, `tracker/state.py`, `tracker/serializers.py`. Prerequisite for any new tracker feature development.
3. [ ] **Change `User.team` to `on_delete=PROTECT`** — prevents silent coach lockout on team deletion.
4. [ ] **Return 409 on duplicate sequence_number** — wrap `tracker_add_*` endpoints in `IntegrityError` catch and return a user-friendly conflict error rather than 500.
5. [ ] **Add N+1 guard to test suite** — assert query count in `tracker_recent_plays` integration test to prevent regression of the `get_real_instances()` fix.
6. [ ] **Document single-session constraint** — update `README` to note that simultaneous tracker use on the same game by two browsers is unsupported.
7. [ ] **Evaluate Postgres streaming replica** — for live game availability. A read replica doubles as a hot standby; failover can be manual for K–12 scale.
8. [ ] **Audit log spike** — evaluate `django-simple-history` vs. custom append-only `AuditEvent` model for FERPA compliance readiness.

---

## Director-Level Notes

**Budget / vendor lock-in:** No SaaS dependencies in the critical path. The PostgreSQL + Docker
stack runs on any hardware from a $40/month VPS to on-prem school servers. Total vendor exposure
is Sentry (optional, swappable) and PyPI packages. Low lock-in risk.

**FERPA posture:** Student-athlete stats are not directory information but are personally identifiable
when linked to a named player. Current controls (team-scoped access, `REGISTRATION_ENABLED=False`,
no public endpoints) satisfy a reasonable K–12 posture. Audit logging (Action Item 8) and a
documented data retention policy are the gaps to close before a formal FERPA review.

**Scalability path:** The monolith is appropriate through ~50 teams. Beyond that, the report
service layer is already architecturally cleanly separated and can be extracted to an async
worker (Celery + Redis) with minimal coupling changes. The tracker AJAX endpoints would benefit
from WebSocket migration (Django Channels) if simultaneous multi-user or spectator features
are added.

**Team skill burden:** The stack (Django, DRF, vanilla JS, Docker Compose, PostgreSQL) is
mainstream and hireable. No exotic choices that create a single point of knowledge failure.
