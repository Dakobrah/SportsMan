# Sports-Man: Football Analytics Platform

A Django application for tracking American football at the individual play level: a live game-day tracker, a server-rendered coaching frontend, and a REST API with database-level analytics.

## Features

- **Live game tracker** — mobile-first play entry with a real-time field visualization. Server-authoritative game state (possession, down & distance, ball position, coin toss, quarter) survives reloads and crashes; every open tracker page syncs within ~4 seconds via lightweight polling; `?view=1` gives coaches and the press box a read-only live view. One-tap undo with exact score/state rewind.
- **Play-by-play tracking** for Offense, Defense, and Special Teams
- **Polymorphic models** for different play types (Run, Pass, Defense, Punt, Kickoff, Field Goal, Extra Point)
- **Analytics reports** with database-level aggregation and version-keyed caching
- **Dual interface** — session-authenticated web frontend and JWT-authenticated REST API, both team-scoped
- **Docker deployment** optimized for local network access

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Git

### Setup

1. Clone the repository:
   ```bash
   git clone <repo-url> sportsman
   cd sportsman
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. Start the application:
   ```bash
   docker compose up -d
   ```

4. Create admin user:
   ```bash
   docker compose exec web python manage.py createsuperuser
   ```

5. Access the application:
   - Web app: http://localhost/
   - API Docs: http://localhost/api/docs/
   - Admin: http://localhost/admin/
   - Health: http://localhost/api/health/

### Local Network Access

To access from other devices on your network:

1. Find your server's IP address
2. Add it to `ALLOWED_HOSTS` in `.env`:
   ```
   ALLOWED_HOSTS=192.168.1.100,localhost,127.0.0.1
   ```
3. Restart: `docker compose restart`
4. Access from any device: `http://192.168.1.100/`

## Live Game Tracker

Open a game and tap **Live Tracker**, or go directly to `/games/<id>/tracker/`.

- **Operator flow:** record the coin toss (who won, receive/defer), then enter plays as they happen. The tracker advances down & distance, ball position, and possession automatically, handles touchdowns → extra points, safeties → free kicks, and turnovers, and keeps the score in sync.
- **Multi-device:** any team member who opens the same tracker sees new plays and score changes within a few seconds. Append `?view=1` for a read-only viewer (press box, assistant coaches).
- **Durable:** all live state is stored server-side (`GameState`); reloading a device mid-drive restores exactly where the game left off. Undo removes the last play and rewinds score and situation precisely — manual score corrections survive.
- **Concurrency-safe:** play writes are serialized per game with row locking and a unique sequence constraint; duplicate submissions get an idempotent 409.

Architecture, sync protocol, and query budgets are documented in [docs/DESIGN-live-tracker.md](docs/DESIGN-live-tracker.md).

## API Endpoints

### Authentication
- `POST /api/v1/auth/token/` - Get JWT token
- `POST /api/v1/auth/token/refresh/` - Refresh token
- `POST /api/v1/auth/register/` - Register new user

### Teams
- `GET/POST /api/v1/teams/` - List/Create teams (creation is staff-only)
- `GET/PUT/DELETE /api/v1/teams/{id}/` - Team details
- `GET/POST /api/v1/players/` - List/Create players
- `GET/POST /api/v1/seasons/` - List/Create seasons

### Games
- `GET/POST /api/v1/games/` - List/Create games
- `GET/PUT/DELETE /api/v1/games/{id}/` - Game details

### Snaps (Play-by-Play)

Snap list endpoints use **cursor pagination** (`?cursor=`), not page numbers.

- `GET/POST /api/v1/snaps/run/` - Rushing plays
- `GET/POST /api/v1/snaps/pass/` - Passing plays
- `GET/POST /api/v1/snaps/defense/` - Defensive plays
- `GET/POST /api/v1/snaps/punt/` - Punts
- `GET/POST /api/v1/snaps/kickoff/` - Kickoffs
- `GET/POST /api/v1/snaps/field-goal/` - Field goals
- `GET/POST /api/v1/snaps/extra-point/` - Extra points/2PT

### Reports
- `GET /api/v1/reports/offense/rushing/totals/` - Team rushing stats
- `GET /api/v1/reports/offense/rushing/players/` - Player rushing stats
- `GET /api/v1/reports/offense/passing/totals/` - Team passing stats
- `GET /api/v1/reports/offense/passing/quarterbacks/` - QB stats
- `GET /api/v1/reports/offense/receiving/players/` - Receiver stats
- `GET /api/v1/reports/defense/totals/` - Team defense stats
- `GET /api/v1/reports/defense/players/` - Player defense stats
- `GET /api/v1/reports/special-teams/punting/totals/` - Punt stats
- `GET /api/v1/reports/special-teams/kicking/totals/` - FG stats

### Tracker (session auth, used by the live tracker page)

- `POST /games/{id}/tracker/<play-type>/` - Record a play (run, pass, penalty, kickoff, punt, field-goal, extra-point, defense)
- `POST /games/{id}/tracker/coin-toss/ · update-score/ · update-quarter/ · undo/` - Game-state management
- `GET /games/{id}/tracker/state/?since=<version>&after_seq=<n>` - Polling endpoint for live sync
- `GET /games/{id}/tracker/plays/` - Recent-plays feed

## Development

### Local Development (without Docker)

1. Create virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # or venv\Scripts\activate on Windows
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements/development.txt
   ```

3. Run migrations:
   ```bash
   python manage.py migrate
   ```

4. Start development server:
   ```bash
   python manage.py runserver
   ```

### Sample Data

```bash
# Roster, two seasons of games, and a ready-to-track live game
# (creates users: admin/admin1234, coach/coach1234 — DEBUG only)
python manage.py seed_dev_data          # add --reset to start clean

# Drive the live game with a scripted quarter of plays
python manage.py simulate_quarter
```

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=apps --cov-report=html

# Run specific test file
pytest tests/integration/test_tracker_endpoints.py

# Run only integration / unit tests
pytest tests/integration/
pytest tests/unit/
```

> **Note:** template-rendering tests use `RequestFactory` + direct view calls
> rather than the Django test client — the test client's template-context
> capture is incompatible with Python 3.14 + Django 5.0.

## Test Suite

Tests are organized into unit and integration suites.

### Unit Tests

- **[test_tracker_logic.py](tests/unit/test_tracker_logic.py)** / **[test_tracker_logic_outcomes.py](tests/unit/test_tracker_logic_outcomes.py)** — the pure play-rules state machine: down/distance/position math and scoring-as-data (TDs, safeties, blocked punts, defensive scores)
- **[test_snap_models.py](tests/unit/test_snap_models.py)** — play-by-play model behavior
- **[test_serializers.py](tests/unit/test_serializers.py)** — API serializer validation
- **[test_report_services.py](tests/unit/test_report_services.py)** — analytics aggregation (rushing/passing totals, passer rating, defense, special teams)
- **[test_cache_version.py](tests/unit/test_cache_version.py)** — the version-keyed cache contract (any snap/game change produces a new version)
- **[test_dashboard_metrics.py](tests/unit/test_dashboard_metrics.py)** — dashboard metric computation

### Integration Tests

- **[test_tracker_endpoints.py](tests/integration/test_tracker_endpoints.py)** — HTTP contract for every tracker endpoint: auth matrix, server-authoritative stamping, state transitions, score deltas, and all undo paths
- **[test_tracker_polling.py](tests/integration/test_tracker_polling.py)** — the live-sync protocol: delta payloads, version bumps, idle-poll query budget
- **[test_tracker_n_plus_one.py](tests/integration/test_tracker_n_plus_one.py)** — query-count regression guards for the feed and page load
- **[test_report_pages.py](tests/integration/test_report_pages.py)** — report page auth + rendering
- **[test_api.py](tests/integration/test_api.py)** — REST API CRUD and permissions
- **[test_game_simulation.py](tests/integration/test_game_simulation.py)** — a complete simulated game validated against the report services

### Test Factories

Test data is generated with Factory Boy — see [tests/factories/](tests/factories/). Factories are deterministic (fixed quarters/downs, 0–0 scores) so results never depend on creation order:

```python
from tests.factories import TeamFactory, PlayerFactory, GameFactory, RunPlayFactory

team = TeamFactory(name="Test Team")
qb = PlayerFactory(team=team, position="QB")
game = GameFactory(team_score=21, opponent_score=14)
```

### Database Operations

```bash
# Backup
./scripts/backup.sh

# Restore
./scripts/restore.sh backups/sportsman_20240101_120000.sql.gz
```

## Project Structure

```
sportsman/
├── apps/
│   ├── accounts/        # User authentication & JWT
│   ├── core/            # Shared utilities: cache, pagination, permissions, storage
│   ├── frontend/        # Web app: views, dashboard, live tracker
│   │   ├── tracker.py        # Tracker endpoints + GameState management
│   │   ├── tracker_logic.py  # Pure play-rules state machine
│   │   └── play_feed.py      # Batched snap serialization (shared by feed/poll/pages)
│   ├── games/           # Game, GameState & QuarterScore models
│   ├── reports/         # Analytics service layer
│   │   └── services/    # Offense, Defense, Special Teams reports
│   ├── snaps/           # Play-by-play tracking
│   │   └── models/      # Polymorphic models (Run, Pass, Defense, etc.)
│   └── teams/           # Team, Player, Season models
├── api/
│   └── v1/              # API v1 endpoints & URL routing
├── static/
│   └── js/tracker/      # Tracker client (ES modules: state, flow, forms, poll, ...)
├── templates/           # Server-rendered frontend templates
├── docs/                # Architecture docs (ADR-001, DESIGN-live-tracker)
├── sportsman/
│   └── settings/        # Environment-specific configs
│       ├── base.py      # Shared settings
│       ├── development.py
│       ├── local_network.py  # LAN deployment
│       ├── production.py
│       └── test.py
├── tests/
│   ├── integration/     # HTTP contract, polling, N+1 guards, full-game simulation
│   ├── unit/            # State machine, models, services, cache
│   ├── conftest.py      # Pytest fixtures
│   └── factories/       # Factory Boy test data
├── scripts/             # Backup & deployment scripts
├── docker-compose.yml
├── Dockerfile
└── nginx.conf           # Reverse proxy config
```

## Documentation

- [docs/DESIGN-live-tracker.md](docs/DESIGN-live-tracker.md) — as-built design of the live tracker (state model, sync protocol, undo, performance budgets) and the future-improvements roadmap
- [docs/FOOTBALL-SEMANTICS.md](docs/FOOTBALL-SEMANTICS.md) — the football rules ledger (NFHS): every rule the tracker enforces, simplifies, or does not model
- [docs/ADR-001-system-architecture.md](docs/ADR-001-system-architecture.md) — whole-application architecture record

## License

MIT
