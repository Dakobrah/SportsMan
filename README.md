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
pytest
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
│   ├── accounts/    # User authentication
│   ├── core/        # Shared utilities
│   ├── games/       # Game management
│   ├── reports/     # Analytics services
│   ├── snaps/       # Play-by-play models
│   └── teams/       # Team/Player/Season
├── api/
│   └── v1/          # API v1 endpoints
├── sportsman/
│   └── settings/    # Environment configs
├── tests/           # Test suite
└── scripts/         # Deployment scripts
```

## License

MIT
