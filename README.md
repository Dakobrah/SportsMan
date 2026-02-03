# Sports-Man: Football Analytics API

A Django REST API for tracking American football game statistics at the individual play level.

## Features

- **Play-by-play tracking** for Offense, Defense, and Special Teams
- **Polymorphic models** for different play types (Run, Pass, Defense, Punt, Kickoff, Field Goal)
- **Analytics reports** with database-level aggregation
- **JWT authentication** with team-based access control
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
4. Access from any device: `http://192.168.1.100/api/docs/`

## API Endpoints

### Authentication
- `POST /api/v1/auth/token/` - Get JWT token
- `POST /api/v1/auth/token/refresh/` - Refresh token
- `POST /api/v1/auth/register/` - Register new user

### Teams
- `GET/POST /api/v1/teams/` - List/Create teams
- `GET/PUT/DELETE /api/v1/teams/{id}/` - Team details
- `GET/POST /api/v1/players/` - List/Create players
- `GET/POST /api/v1/seasons/` - List/Create seasons

### Games
- `GET/POST /api/v1/games/` - List/Create games
- `GET/PUT/DELETE /api/v1/games/{id}/` - Game details

### Snaps (Play-by-Play)
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

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=apps --cov-report=html

# Run specific test file
pytest tests/unit/test_snap_models.py

# Run with verbose output
pytest -v

# Run only integration tests
pytest tests/integration/

# Run only unit tests
pytest tests/unit/
```

## Test Suite

The project includes comprehensive tests organized into unit and integration tests.

### Unit Tests

- **[test_snap_models.py](tests/unit/test_snap_models.py)** - Tests for all play-by-play models
  - Run plays (basic, touchdown, fumble, penalty)
  - Pass plays (complete, incomplete, sack, interception, thrown away)
  - Defense snaps (tackle, TFL, sack, INT return, fumble recovery, assists)
  - Special teams (punt, kickoff, field goal, extra point, 2PT conversions)

- **[test_serializers.py](tests/unit/test_serializers.py)** - Serializer validation tests
  - Team/Player/Season creation and validation
  - Game serializers with computed fields
  - Play serializers with cross-field validation (e.g., fumble_lost requires fumbled)

- **[test_report_services.py](tests/unit/test_report_services.py)** - Analytics service tests
  - Offense reports (rushing totals, passing stats, passer rating calculation)
  - Defense reports (tackles, sacks, turnovers by player)
  - Special teams reports (punting averages, FG percentages)

### Integration Tests

- **[test_api.py](tests/integration/test_api.py)** - API endpoint tests
  - Authentication requirements
  - CRUD operations for teams, players, games
  - Report endpoint filtering

- **[test_game_simulation.py](tests/integration/test_game_simulation.py)** - Full game simulation
  - Simulates a complete football game with 40+ plays across 4 quarters
  - Q1: Opening kickoff, 8-play TD drive, opponent scores (7-7)
  - Q2: Defensive stand, FG drive, halftime (10-7)
  - Q3: Big play TD, defensive INT (17-7)
  - Q4: Two-minute drill TD by opponent, victory formation (17-14 WIN)
  - Validates all report services with real aggregated statistics

### Test Factories

Test data is generated using Factory Boy. Available factories in [tests/factories.py](tests/factories.py):

```python
from tests.factories import (
    TeamFactory,
    PlayerFactory,
    SeasonFactory,
    GameFactory,
    RunPlayFactory,
    PassPlayFactory,
)

# Create a player on a specific team
team = TeamFactory(name="Test Team")
qb = PlayerFactory(team=team, position="QB")

# Create a game with default season/team
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
│   ├── core/            # Shared utilities, pagination, permissions
│   ├── games/           # Game & QuarterScore models
│   ├── reports/         # Analytics service layer
│   │   └── services/    # Offense, Defense, Special Teams reports
│   ├── snaps/           # Play-by-play tracking
│   │   └── models/      # Polymorphic models (Run, Pass, Defense, etc.)
│   └── teams/           # Team, Player, Season models
├── api/
│   └── v1/              # API v1 endpoints & URL routing
├── sportsman/
│   └── settings/        # Environment-specific configs
│       ├── base.py      # Shared settings
│       ├── development.py
│       ├── local_network.py  # LAN deployment
│       ├── production.py
│       └── test.py
├── tests/
│   ├── integration/     # API & full system tests
│   │   ├── test_api.py
│   │   └── test_game_simulation.py
│   ├── unit/            # Model & service tests
│   │   ├── test_report_services.py
│   │   ├── test_serializers.py
│   │   └── test_snap_models.py
│   ├── conftest.py      # Pytest fixtures
│   └── factories.py     # Factory Boy test data
├── scripts/             # Backup & deployment scripts
├── docker-compose.yml
├── Dockerfile
└── nginx.conf           # Reverse proxy config
```

## License

MIT
