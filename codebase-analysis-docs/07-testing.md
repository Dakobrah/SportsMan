# 07 — Testing

← [06 — Report Services](06-report-services.md) | Next: [08 — Deployment](08-deployment.md)

---

## Configuration

### `pytest.ini`

```ini
[pytest]
DJANGO_SETTINGS_MODULE = sportsman.settings.test
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = --tb=short
```

### `sportsman/settings/test.py`

Optimizations for fast test runs:

```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',   # in-memory — no disk I/O, destroyed after run
    }
}

PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']  # ~10x faster than PBKDF2

REST_FRAMEWORK = {
    'DEFAULT_THROTTLE_CLASSES': [],  # no rate limiting during tests
    'DEFAULT_THROTTLE_RATES': {},
}

LOGGING = {}  # suppress all logging output for clean test output

STORAGES = {
    'staticfiles': {
        'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
    }
}
```

### Run Tests

```bash
pytest                          # run all tests
pytest tests/unit/              # unit tests only
pytest tests/integration/       # integration tests only
pytest -k "test_rushing"        # filter by name
pytest --cov=apps               # with coverage
```

---

## `tests/conftest.py` — Shared Fixtures

```python
@pytest.fixture
def api_client():
    """Unauthenticated DRF test client."""
    return APIClient()

@pytest.fixture
def user(db):
    """Create a plain test user (no team)."""
    return UserFactory()

@pytest.fixture
def authenticated_client(api_client, user):
    """DRF client force-authenticated as test user."""
    api_client.force_authenticate(user=user)
    return api_client

@pytest.fixture
def team(db):
    return TeamFactory()

@pytest.fixture
def season(team):
    return SeasonFactory(team=team)

@pytest.fixture
def player(team):
    return PlayerFactory(team=team)

@pytest.fixture
def game(season):
    return GameFactory(season=season)

@pytest.fixture
def team_with_players(db):
    """Full 22-player roster: QB, 2 RB, 4 WR, 2 TE, 5 OL, 4 DL, 3 LB, 2 CB, 2 S, K, P."""
    team = TeamFactory()
    PlayerFactory(team=team, position='QB')
    PlayerFactory.create_batch(2, team=team, position='RB')
    PlayerFactory.create_batch(4, team=team, position='WR')
    # ... etc
    return team

@pytest.fixture
def run_play(game, player):
    return RunPlayFactory(game=game, ball_carrier=player)

@pytest.fixture
def pass_play(game):
    qb = PlayerFactory(team=game.season.team, position='QB')
    wr = PlayerFactory(team=game.season.team, position='WR')
    return PassPlayFactory(game=game, quarterback=qb, receiver=wr)
```

---

## Factory Boy Factories — `tests/factories/`

### `accounts.py`

```python
class UserFactory(DjangoModelFactory):
    class Meta:
        model = User
    username = Sequence(lambda n: f'user{n}')
    email    = LazyAttribute(lambda o: f'{o.username}@example.com')
    password = PostGenerationMethodCall('set_password', 'testpass123')
```

### `teams.py`

```python
class TeamFactory(DjangoModelFactory):
    class Meta:
        model = Team
    name         = Faker('company')
    abbreviation = Sequence(lambda n: f'TM{n}')

class SeasonFactory(DjangoModelFactory):
    class Meta:
        model = Season
    year = 2025
    team = SubFactory(TeamFactory)

class PlayerFactory(DjangoModelFactory):
    class Meta:
        model = Player
    first_name = Faker('first_name')
    last_name  = Faker('last_name')
    position   = 'RB'
    number     = Sequence(lambda n: n + 1)
    team       = SubFactory(TeamFactory)
    is_active  = True
```

### `games.py`

```python
class GameFactory(DjangoModelFactory):
    class Meta:
        model = Game
    season          = SubFactory(SeasonFactory)
    date            = Faker('date_this_year')
    opponent        = Faker('company')
    location        = 'home'
    weather         = 'clear'
    field_condition = 'turf'
    team_score      = 0
    opponent_score  = 0
```

### `snaps.py`

```python
class RunPlayFactory(DjangoModelFactory):
    class Meta:
        model = RunPlay
    game            = SubFactory(GameFactory)
    sequence_number = Sequence(lambda n: n + 1)
    quarter         = 1
    down            = 1
    distance        = 10
    ball_position   = 0
    yards_gained    = 5

class PassPlayFactory(DjangoModelFactory):
    class Meta:
        model = PassPlay
    game            = SubFactory(GameFactory)
    sequence_number = Sequence(lambda n: n + 1)
    quarter         = 1
    is_complete     = True
    yards_gained    = 10

# Also: DefenseSnapFactory, PuntSnapFactory, KickoffSnapFactory,
#        FieldGoalSnapFactory, ExtraPointSnapFactory
```

---

## Unit Tests — `tests/unit/`

### `test_models.py`

```python
# Team.__str__ returns "Name (ABBR)"
# Season.__str__ returns "2025 Season"
# Player.__str__ returns "#12 John Smith (RB)"
# Game.result property: team_score 21 vs 14 → 'W'; 14 vs 21 → 'L'; 0 vs 0 → 'T'
# Game.is_win, is_loss, is_tie boolean properties
# Player ordered by number by default
```

### `test_services.py`

```python
# Empty DB → OffenseReportService returns zeros for all aggregates
# With one RunPlay → get_rushing_totals() returns correct yards/attempts
# Filter by game_ids → excludes plays from other games
# Filter by team_id → excludes other teams' plays
```

### `test_report_services.py`

Extended service tests:

```python
# Rushing:
#   - attempts count matches RunPlay count
#   - yards total matches sum of yards_gained
#   - short/long/explosive run classification thresholds
#   - per-player sorted by yards descending

# Passing:
#   - completion rate matches is_complete count / total
#   - passer_rating is float in 0..158.3 range
#   - sack count matches was_sacked flag

# Defense:
#   - team totals: sack count matches DefenseSnap(play_result=SACK) count
#   - player summary: sorted by tackles descending
#   - assists: DefenseSnapAssist counts by assist_type

# Special teams:
#   - FG percentage: made/attempts * 100
#   - punt average matches sum/count
#   - extra point totals split by attempt_type
```

### `test_snap_models.py`

Tests all 13 snap types:

```python
# RunPlay:   create with ball_carrier → check play_result auto-set to RUN
# PassPlay:  create with was_sacked=True → play_result = SACK
# DefenseSnap: PlayResult choices; opponent_play_type blank by default
# PuntSnap:  is_blocked, is_touchback flags
# KickoffSnap: is_onside_kick, onside_recovered
# FieldGoalSnap: kick_distance field (not distance)
# ExtraPointSnap: attempt_type KICK/2PT_RUN/2PT_PASS; result GOOD/MISS/BLOCK/FAIL
# DefenseSnapAssist: unique_together (snap, player, assist_type)
```

### `test_serializers.py`

```python
# RunPlayWriteSerializer:
#   - ball_carrier required for non-penalty plays
#   - yards_gained must be integer

# PassPlayWriteSerializer:
#   - quarterback required
#   - was_sacked and is_interception mutually exclusive validation

# GameWriteSerializer:
#   - season, opponent, date all required
#   - location must be in valid choices

# DefenseSnapWriteSerializer:
#   - play_result required
#   - opponent_play_type optional, blank allowed
```

### `test_dashboard_metrics.py` *(added 2026-02-17)*

```python
@pytest.mark.django_db
def test_dashboard_metrics(client):
    # Setup: team, season, user with team, game, quarter scores
    # Create plays:
    #   - 2 x 3rd-down run/pass with is_first_down=True
    #   - 1 x red zone run with is_touchdown=True (ball_position=30)
    #   - 2 x DefenseSnap(play_result=SACK, primary_player=defender)

    # Call home() view directly via RequestFactory

    # Assertions:
    assert metrics['third_down_attempts'] == 2
    assert metrics['third_down_conversions'] == 2
    assert metrics['third_down_pct'] == 100
    assert metrics['red_zone_plays'] >= 1
    assert metrics['red_zone_tds'] >= 1
    assert metrics['red_zone_pct'] is not None
    assert 'sacks' in {a['type'] for a in metrics['alerts']}
```

### `test_exceptions.py` *(added 2026-02-17)*

```python
def test_custom_exception_handler_validation_error():
    factory = APIRequestFactory()
    request = factory.post('/api/test/', {}, format='json')
    exc = ValidationError({'name': ['This field is required.']})
    response = custom_exception_handler(exc, {'request': request})

    assert response.data['type'] == 'about:blank'
    assert response.data['status'] == 400
    assert 'errors' in response.data
    assert 'name' in response.data['errors']

def test_business_logic_error_returns_422():
    exc = BusinessLogicError('Rule violated')
    response = custom_exception_handler(exc, {'request': factory.get('/')})
    assert response.status_code == 422
    assert response.data['status'] == 422
```

---

## Integration Tests — `tests/integration/`

### `test_api.py`

```python
# Auth flow:
#   POST /api/v1/auth/token/ with credentials → access token
#   GET /api/v1/teams/ with Authorization: Bearer <token> → 200
#   GET /api/v1/teams/ without token → 401

# Teams:
#   POST /api/v1/teams/ → 201 with id
#   GET /api/v1/teams/<id>/ → 200 with name, abbreviation
#   GET /api/v1/teams/<id>/players/ → 200 list
#   GET /api/v1/teams/<id>/seasons/ → 200 list

# Players:
#   POST /api/v1/players/ → 201
#   GET /api/v1/players/?position=QB → filter works
#   GET /api/v1/players/by_position/?position=QB → 200

# Games:
#   POST /api/v1/games/ with season_id → 201
#   POST /api/v1/games/<id>/quarter_scores/ → 201
#   GET /api/v1/games/<id>/summary/ → 200

# Snaps:
#   POST /api/v1/snaps/run/ → 201 with ball_carrier set
#   POST /api/v1/snaps/defense/ → 201
#   POST /api/v1/snaps/defense/<id>/add_assist/ → 201
#   GET /api/v1/snaps/run/?game=<id> → filter by game works

# Reports:
#   GET /api/v1/reports/offense/rushing/totals/ → {attempts, yards, ...}
#   GET /api/v1/reports/defense/totals/ → {tackles, sacks, ...}
#   GET /api/v1/reports/special-teams/kicking/totals/ → {attempts, made, pct, ...}
```

### `test_game_simulation.py`

Full drive simulations verify the game recording flow end-to-end:

```python
# TD drive:
#   Play 1: RunPlay(down=1, distance=10, ball_position=-25, yards=8) → 2nd & 2
#   Play 2: RunPlay(down=2, distance=2, ball_position=-17, yards=3) → 1st & 10
#   Play 3: PassPlay(is_complete=True, yards=40, ball_position=-14) → 1st & 10 at OPP 40
#   Play 4: RunPlay(yards=45, ball_position=26, is_touchdown=True) → TD
#   Verify: game.team_score == 6

# Turnover:
#   PassPlay(is_interception=True) → possession flip
#   Next snap's ball_position should be negated

# Blocked kick:
#   FieldGoalSnap(result='BLOCK') → opponent gets ball at spot
#   next_state.situation == 'opponent_ball'

# FG drive:
#   FieldGoalSnap(result='GOOD', kick_distance=42) → team_score += 3
#   next_state.situation == 'kickoff'
```

---

## Coverage Summary (95+ tests)

| Area | Tests | Key Assertions |
|------|-------|----------------|
| Model properties | ~15 | `result`, `is_win`, `__str__` |
| Report services | ~25 | empty DB zeros, filtered results, passer rating |
| Snap model creation | ~13 | one per snap type, field defaults, auto-set play_result |
| Serializer validation | ~12 | required fields, cross-field rules |
| Dashboard metrics | ~8 | 3rd-down %, red zone %, sack alerts |
| Exception handler | ~3 | RFC 9457 format, 422 status |
| API endpoints (integration) | ~15 | auth, CRUD, filter, custom actions |
| Game simulation | ~8 | TD, turnover, blocked kick, FG |

---

→ Next: [08 — Deployment](08-deployment.md)
