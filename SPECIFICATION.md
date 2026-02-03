# Sports-Man: Football Analytics Application Specification

## Overview

Build a Django REST API for tracking American football game statistics at the individual play level. The application captures play-by-play data for three team units (Offense, Defense, Special Teams) and generates analytics reports.

**Target Stack:**
- Django 5.x (latest LTS)
- Django REST Framework
- PostgreSQL (production) / SQLite (development/simple deployments)
- Python 3.12+
- Docker & Docker Compose for containerized deployment

**Deployment Target:**
- Local network (LAN) hosting
- Accessed via mobile devices and laptops within organization network
- Container running in VM with static IP/hostname

---

## Domain Context

### Football Basics for Implementation

**Game Structure:**
- A game has 4 quarters (plus potential overtime)
- Each play is called a "snap" or "down"
- Offense gets 4 attempts (downs) to advance 10 yards
- Three distinct units: Offense, Defense, Special Teams

**Offensive Plays:**
- **Run plays:** Ball carrier (usually RB) runs with the ball
- **Pass plays:** Quarterback throws to a receiver
- Tracked metrics: yards gained, touchdowns, fumbles, completions

**Defensive Plays:**
- **Tackles:** Stopping the ball carrier
- **Sacks:** Tackling the QB behind the line of scrimmage
- **Interceptions:** Catching a pass intended for offense
- **Fumble recoveries:** Recovering a dropped ball
- Tracked metrics: tackles, assists, pressures, turnovers

**Special Teams Plays:**
- **Punts:** Kicking ball to opponent on 4th down
- **Kickoffs:** Starting play after scores
- **Field Goals:** Kicking through uprights for 3 points
- **PAT (Point After Touchdown):** 1-point kick or 2-point conversion

---

## Deployment Architecture

### Local Network Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                    Organization Network                      │
│                                                              │
│   ┌──────────────┐         ┌─────────────────────────────┐  │
│   │   Laptop     │         │     VM Host (Lab Server)    │  │
│   │   Browser    │◄───────►│     IP: 192.168.1.100       │  │
│   └──────────────┘   HTTP  │                             │  │
│                            │  ┌───────────────────────┐  │  │
│   ┌──────────────┐         │  │   Docker Container    │  │  │
│   │   Mobile     │         │  │   ┌───────────────┐   │  │  │
│   │   Device     │◄───────►│  │   │  Django App   │   │  │  │
│   └──────────────┘         │  │   │  Port 8000    │   │  │  │
│                            │  │   └───────────────┘   │  │  │
│                            │  │   ┌───────────────┐   │  │  │
│                            │  │   │  PostgreSQL   │   │  │  │
│                            │  │   │  Port 5432    │   │  │  │
│                            │  │   └───────────────┘   │  │  │
│                            │  └───────────────────────┘  │  │
│                            └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Docker Configuration

```dockerfile
# Dockerfile
FROM python:3.12-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements/production.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Collect static files
RUN python manage.py collectstatic --noinput

# Run gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "3", "sportsman.wsgi:application"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups  # For backup scripts
    environment:
      POSTGRES_DB: sportsman
      POSTGRES_USER: sportsman
      POSTGRES_PASSWORD: ${DB_PASSWORD:-changeme}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sportsman"]
      interval: 10s
      timeout: 5s
      retries: 5

  web:
    build: .
    restart: unless-stopped
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
    environment:
      - DJANGO_SETTINGS_MODULE=sportsman.settings.local_network
      - DB_HOST=db
      - DB_NAME=sportsman
      - DB_USER=sportsman
      - DB_PASSWORD=${DB_PASSWORD:-changeme}
      - DJANGO_SECRET_KEY=${DJANGO_SECRET_KEY:-generate-a-secret-key}
      - ALLOWED_HOSTS=${ALLOWED_HOSTS:-localhost,127.0.0.1}
    volumes:
      - static_files:/app/staticfiles
      - media_files:/app/media
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health/"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Optional: nginx reverse proxy for better mobile performance
  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - static_files:/app/staticfiles:ro
    depends_on:
      - web

volumes:
  postgres_data:
  static_files:
  media_files:
```

```nginx
# nginx.conf - Optimized for mobile clients
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # Compression for mobile bandwidth savings
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript;

    # Timeouts for mobile connections (can be flaky)
    client_body_timeout 60s;
    client_header_timeout 60s;
    send_timeout 60s;

    upstream django {
        server web:8000;
    }

    server {
        listen 80;
        server_name _;

        # Static files
        location /static/ {
            alias /app/staticfiles/;
            expires 30d;
            add_header Cache-Control "public, immutable";
        }

        # API endpoints
        location /api/ {
            proxy_pass http://django;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Longer timeouts for report generation
            proxy_read_timeout 120s;
            proxy_connect_timeout 60s;
        }

        # Admin panel
        location /admin/ {
            proxy_pass http://django;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # Health check
        location /health/ {
            proxy_pass http://django/api/health/;
        }
    }
}
```

### Environment File

```bash
# .env.example - Copy to .env and configure
# Generate secret: python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
DJANGO_SECRET_KEY=your-secret-key-here

# Database
DB_PASSWORD=secure-password-here

# Network Access - Add your server's IP/hostname
# Example: ALLOWED_HOSTS=192.168.1.100,sportsman.local,localhost
ALLOWED_HOSTS=localhost,127.0.0.1

# Optional: Set specific CORS origins for tighter security
# CORS_ALLOWED_ORIGINS=http://192.168.1.100,http://sportsman.local
```

---

## Data Model Design

### Best Practice: Use Django's Multi-Table Inheritance with Polymorphic Queries

**Why:** The naive approach of putting all play types in one table creates a "God Object" with 50+ mostly-null columns. Instead, use polymorphic models where each play type has its own table with only relevant fields.

**Install:** `django-polymorphic` for efficient polymorphic queries

```python
# apps/core/models.py
from django.db import models


class TimeStampedModel(models.Model):
    """
    BEST PRACTICE: Abstract base class for audit fields.
    All models should track creation and modification times.
    """
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
```

### Team & Player Models

```python
# apps/teams/models.py
from django.db import models
from apps.core.models import TimeStampedModel


class Team(TimeStampedModel):
    """
    Represents a football team. Supports multi-team scenarios.
    """
    name = models.CharField(max_length=100)
    abbreviation = models.CharField(max_length=10, unique=True)

    class Meta:
        db_table = "teams"

    def __str__(self):
        return self.name


class Season(TimeStampedModel):
    """
    BEST PRACTICE: Separate season tracking allows year-over-year analysis.
    """
    year = models.PositiveSmallIntegerField()
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="seasons")

    class Meta:
        db_table = "seasons"
        unique_together = ["year", "team"]
        ordering = ["-year"]


class Player(TimeStampedModel):
    """
    Football player with position-based categorization.

    BEST PRACTICE: Use TextChoices for enumerated fields instead of
    plain strings. Provides validation and IDE autocomplete.
    """
    class Position(models.TextChoices):
        # Offense
        QB = "QB", "Quarterback"
        RB = "RB", "Running Back"
        FB = "FB", "Fullback"
        WR = "WR", "Wide Receiver"
        TE = "TE", "Tight End"
        OL = "OL", "Offensive Line"
        # Defense
        DL = "DL", "Defensive Line"
        LB = "LB", "Linebacker"
        CB = "CB", "Cornerback"
        S = "S", "Safety"
        # Special Teams
        K = "K", "Kicker"
        P = "P", "Punter"
        LS = "LS", "Long Snapper"

    first_name = models.CharField(max_length=50)
    last_name = models.CharField(max_length=50)
    position = models.CharField(max_length=3, choices=Position.choices)
    number = models.PositiveSmallIntegerField()
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="players")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "players"
        # BEST PRACTICE: Add indexes for common query patterns
        indexes = [
            models.Index(fields=["team", "is_active"]),
            models.Index(fields=["last_name", "first_name"]),
        ]
        ordering = ["number"]

    def __str__(self):
        return f"#{self.number} {self.first_name} {self.last_name}"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"
```

### Game Model

```python
# apps/games/models.py
from django.db import models
from apps.core.models import TimeStampedModel


class Game(TimeStampedModel):
    """
    Represents a single football game with conditions and final scores.
    """
    class Weather(models.TextChoices):
        CLEAR = "clear", "Clear"
        RAINY = "rainy", "Rainy"
        SNOWY = "snowy", "Snowy"
        WINDY = "windy", "Windy"
        HOT = "hot", "Hot (>85°F)"
        COLD = "cold", "Cold (<40°F)"

    class Location(models.TextChoices):
        HOME = "home", "Home"
        AWAY = "away", "Away"
        NEUTRAL = "neutral", "Neutral Site"

    class FieldCondition(models.TextChoices):
        TURF = "turf", "Artificial Turf"
        GRASS = "grass", "Natural Grass"
        WET = "wet", "Wet/Muddy"

    season = models.ForeignKey(
        "teams.Season", on_delete=models.CASCADE, related_name="games"
    )
    date = models.DateField()
    opponent = models.CharField(max_length=100)
    location = models.CharField(max_length=10, choices=Location.choices)
    weather = models.CharField(max_length=10, choices=Weather.choices)
    field_condition = models.CharField(max_length=10, choices=FieldCondition.choices)

    # Final scores
    team_score = models.PositiveSmallIntegerField(default=0)
    opponent_score = models.PositiveSmallIntegerField(default=0)

    notes = models.TextField(blank=True)

    class Meta:
        db_table = "games"
        ordering = ["-date"]
        indexes = [
            models.Index(fields=["season", "date"]),
        ]

    def __str__(self):
        return f"{self.season.team.abbreviation} vs {self.opponent} ({self.date})"

    @property
    def is_win(self):
        return self.team_score > self.opponent_score

    @property
    def is_loss(self):
        return self.team_score < self.opponent_score


class QuarterScore(models.Model):
    """
    BEST PRACTICE: Normalize quarter-by-quarter scoring instead of
    having quarter1_score, quarter2_score... columns on Game.
    """
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="quarter_scores")
    quarter = models.PositiveSmallIntegerField()  # 1-4, 5+ for overtime
    team_score = models.PositiveSmallIntegerField(default=0)
    opponent_score = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "quarter_scores"
        unique_together = ["game", "quarter"]
        ordering = ["quarter"]
```

### Snap Models (Polymorphic Hierarchy)

```python
# apps/snaps/models/base.py
from django.db import models
from polymorphic.models import PolymorphicModel
from apps.core.models import TimeStampedModel


class Play(TimeStampedModel):
    """
    Reference table for play/formation names.
    Examples: "I-Formation", "Shotgun", "4-3 Defense"
    """
    class UnitType(models.TextChoices):
        OFFENSE = "OFF", "Offense"
        DEFENSE = "DEF", "Defense"
        SPECIAL_TEAMS = "ST", "Special Teams"

    name = models.CharField(max_length=100)
    unit_type = models.CharField(max_length=3, choices=UnitType.choices)
    description = models.TextField(blank=True)

    class Meta:
        db_table = "plays"


class BaseSnap(PolymorphicModel, TimeStampedModel):
    """
    BEST PRACTICE: Use django-polymorphic for type-discriminated inheritance.

    This allows:
    - BaseSnap.objects.all() returns all snap types
    - RunPlay.objects.all() returns only run plays
    - Automatic downcasting to correct subclass

    Common fields shared by ALL snap types go here.
    Type-specific fields go in subclasses.
    """
    game = models.ForeignKey(
        "games.Game", on_delete=models.CASCADE, related_name="snaps"
    )

    # Play sequencing within the game
    sequence_number = models.PositiveIntegerField(
        help_text="Order of this play within the game (1, 2, 3...)"
    )
    quarter = models.PositiveSmallIntegerField()
    game_clock = models.DurationField(
        null=True, blank=True,
        help_text="Time remaining in quarter (e.g., 12:34)"
    )

    # Down and distance (null for kickoffs, PATs, etc.)
    down = models.PositiveSmallIntegerField(null=True, blank=True)
    distance = models.PositiveSmallIntegerField(
        null=True, blank=True,
        help_text="Yards needed for first down"
    )
    ball_position = models.SmallIntegerField(
        null=True, blank=True,
        help_text="Yard line (-50 to 50, negative = own territory)"
    )

    formation = models.CharField(max_length=50, blank=True)
    play_called = models.ForeignKey(
        Play, on_delete=models.SET_NULL, null=True, blank=True
    )
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "snaps"
        ordering = ["game", "sequence_number"]
        indexes = [
            models.Index(fields=["game", "quarter"]),
            models.Index(fields=["game", "sequence_number"]),
        ]
```

### Offensive Snap Models

```python
# apps/snaps/models/offense.py
from django.db import models
from .base import BaseSnap


class OffenseSnap(BaseSnap):
    """
    Base for offensive plays. Contains fields common to all offense.

    BEST PRACTICE: Create intermediate abstract classes when multiple
    subclasses share fields (e.g., both RunPlay and PassPlay can have penalties).
    """
    class PlayResult(models.TextChoices):
        RUN = "RUN", "Run"
        PASS = "PASS", "Pass"
        SACK = "SACK", "Sack"
        PENALTY = "PENALTY", "Penalty Only"
        KNEEL = "KNEEL", "Kneel"
        SPIKE = "SPIKE", "Spike"

    play_result = models.CharField(max_length=10, choices=PlayResult.choices)

    # Penalty tracking (null if no penalty)
    had_penalty = models.BooleanField(default=False)
    penalty_player = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="offense_penalties"
    )
    penalty_yards = models.SmallIntegerField(null=True, blank=True)
    penalty_description = models.CharField(max_length=100, blank=True)

    class Meta:
        db_table = "snaps_offense"


class RunPlay(OffenseSnap):
    """
    Rushing play details.

    BEST PRACTICE: Use related_name consistently and descriptively.
    This allows Player.rushing_attempts.all() to get all run plays.
    """
    ball_carrier = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        related_name="rushing_attempts"
    )
    yards_gained = models.SmallIntegerField(default=0)
    is_touchdown = models.BooleanField(default=False)
    is_first_down = models.BooleanField(default=False)

    # Fumble tracking
    fumbled = models.BooleanField(default=False)
    fumble_lost = models.BooleanField(
        default=False,
        help_text="True if opponent recovered"
    )
    fumble_recovered_by = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="rushing_fumble_recoveries"
    )

    class Meta:
        db_table = "snaps_offense_run"

    def save(self, *args, **kwargs):
        # BEST PRACTICE: Auto-set play_result based on model type
        self.play_result = OffenseSnap.PlayResult.RUN
        super().save(*args, **kwargs)


class PassPlay(OffenseSnap):
    """
    Passing play details with advanced metrics.
    """
    quarterback = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        related_name="pass_attempts"
    )

    # Target vs Receiver distinction:
    # - target: intended receiver (always set on pass attempts)
    # - receiver: actual catcher (only set if complete)
    target = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="targets"
    )
    receiver = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="receptions"
    )

    # Completion and yardage
    is_complete = models.BooleanField(default=False)
    yards_gained = models.SmallIntegerField(default=0)

    # Advanced passing metrics
    air_yards = models.SmallIntegerField(
        default=0,
        help_text="Yards traveled in the air before catch"
    )
    yards_after_catch = models.SmallIntegerField(
        default=0,
        help_text="YAC - yards gained after the catch"
    )

    # Outcome flags
    is_touchdown = models.BooleanField(default=False)
    is_first_down = models.BooleanField(default=False)
    is_interception = models.BooleanField(default=False)
    is_thrown_away = models.BooleanField(default=False)
    was_under_pressure = models.BooleanField(default=False)
    was_sacked = models.BooleanField(default=False)
    sack_yards = models.SmallIntegerField(
        default=0,
        help_text="Yards lost on sack (negative number)"
    )

    # Fumble tracking
    fumbled = models.BooleanField(default=False)
    fumble_lost = models.BooleanField(default=False)

    class Meta:
        db_table = "snaps_offense_pass"

    def save(self, *args, **kwargs):
        if self.was_sacked:
            self.play_result = OffenseSnap.PlayResult.SACK
        else:
            self.play_result = OffenseSnap.PlayResult.PASS
        super().save(*args, **kwargs)
```

### Defensive Snap Model

```python
# apps/snaps/models/defense.py
from django.db import models
from .base import BaseSnap


class DefenseSnap(BaseSnap):
    """
    Defensive play tracking.

    Note: In football, the defense reacts to the offense. We track
    the defensive player(s) who made the key play on each snap.
    """
    class PlayResult(models.TextChoices):
        TACKLE = "TACKLE", "Tackle"
        TACKLE_FOR_LOSS = "TFL", "Tackle for Loss"
        SACK = "SACK", "Sack"
        INTERCEPTION = "INT", "Interception"
        FUMBLE_RECOVERY = "FREC", "Fumble Recovery"
        PASS_DEFENDED = "PD", "Pass Defended"
        PENALTY = "PENALTY", "Penalty"

    play_result = models.CharField(max_length=10, choices=PlayResult.choices)
    secondary_formation = models.CharField(
        max_length=50, blank=True,
        help_text="Defensive backfield alignment (e.g., Cover 2, Cover 3)"
    )

    # Primary defender who made the play
    primary_player = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="defense_primary_plays"
    )

    # Tackle details
    tackle_yards = models.SmallIntegerField(
        null=True, blank=True,
        help_text="Yards gained by offense on this play"
    )
    tackle_for_loss = models.BooleanField(default=False)

    # Pressure and coverage
    applied_pressure = models.BooleanField(default=False)
    forced_incompletion = models.BooleanField(default=False)

    # Turnover details
    interception_return_yards = models.SmallIntegerField(null=True, blank=True)
    fumble_return_yards = models.SmallIntegerField(null=True, blank=True)
    is_defensive_touchdown = models.BooleanField(default=False)

    # Penalty
    penalty_player = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="defense_penalties"
    )
    penalty_yards = models.SmallIntegerField(null=True, blank=True)
    penalty_description = models.CharField(max_length=100, blank=True)

    class Meta:
        db_table = "snaps_defense"


class DefenseSnapAssist(models.Model):
    """
    BEST PRACTICE: Use explicit through models for M2M when you need
    extra fields on the relationship (like assist_type).

    Tracks defensive assists (e.g., shared tackles, sack assists).
    """
    class AssistType(models.TextChoices):
        TACKLE = "TACKLE", "Tackle Assist"
        SACK = "SACK", "Sack Assist"
        COVERAGE = "COV", "Coverage Assist"

    snap = models.ForeignKey(
        DefenseSnap, on_delete=models.CASCADE, related_name="assists"
    )
    player = models.ForeignKey(
        "teams.Player", on_delete=models.CASCADE, related_name="defense_assists"
    )
    assist_type = models.CharField(max_length=10, choices=AssistType.choices)

    class Meta:
        db_table = "snaps_defense_assists"
        unique_together = ["snap", "player", "assist_type"]
```

### Special Teams Snap Models

```python
# apps/snaps/models/special_teams.py
from django.db import models
from .base import BaseSnap


class SpecialTeamsSnap(BaseSnap):
    """
    Base for all special teams plays.
    """
    penalty_player = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="st_penalties"
    )
    penalty_yards = models.SmallIntegerField(null=True, blank=True)
    penalty_description = models.CharField(max_length=100, blank=True)

    class Meta:
        db_table = "snaps_special_teams"


class PuntSnap(SpecialTeamsSnap):
    """Punt play from the punting team's perspective."""
    punter = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        related_name="punts"
    )
    punt_yards = models.PositiveSmallIntegerField(default=0)
    hang_time = models.DurationField(
        null=True, blank=True,
        help_text="Ball hang time in seconds"
    )
    is_blocked = models.BooleanField(default=False)
    is_touchback = models.BooleanField(default=False)
    out_of_bounds = models.BooleanField(default=False)
    downed_at_yard_line = models.SmallIntegerField(null=True, blank=True)

    class Meta:
        db_table = "snaps_st_punt"


class PuntReturnSnap(SpecialTeamsSnap):
    """Punt return from the receiving team's perspective."""
    returner = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        related_name="punt_returns"
    )
    return_yards = models.SmallIntegerField(default=0)
    is_fair_catch = models.BooleanField(default=False)
    is_touchdown = models.BooleanField(default=False)
    fumbled = models.BooleanField(default=False)
    fumble_lost = models.BooleanField(default=False)

    # Coverage tackle
    tackler = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="punt_return_tackles"
    )

    class Meta:
        db_table = "snaps_st_punt_return"


class KickoffSnap(SpecialTeamsSnap):
    """Kickoff from the kicking team's perspective."""
    kicker = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        related_name="kickoffs"
    )
    kick_yards = models.PositiveSmallIntegerField(default=0)
    is_touchback = models.BooleanField(default=False)
    is_onside_kick = models.BooleanField(default=False)
    onside_recovered = models.BooleanField(default=False)
    out_of_bounds = models.BooleanField(default=False)

    class Meta:
        db_table = "snaps_st_kickoff"


class KickoffReturnSnap(SpecialTeamsSnap):
    """Kickoff return from the receiving team's perspective."""
    returner = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        related_name="kickoff_returns"
    )
    return_yards = models.SmallIntegerField(default=0)
    is_touchdown = models.BooleanField(default=False)
    fumbled = models.BooleanField(default=False)
    fumble_lost = models.BooleanField(default=False)

    tackler = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="kickoff_return_tackles"
    )

    class Meta:
        db_table = "snaps_st_kickoff_return"


class FieldGoalSnap(SpecialTeamsSnap):
    """Field goal attempt."""
    class Result(models.TextChoices):
        GOOD = "GOOD", "Good"
        MISSED = "MISS", "Missed"
        BLOCKED = "BLOCK", "Blocked"

    kicker = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        related_name="field_goal_attempts"
    )
    holder = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="field_goal_holds"
    )
    distance = models.PositiveSmallIntegerField(
        help_text="Attempt distance in yards"
    )
    result = models.CharField(max_length=10, choices=Result.choices)

    class Meta:
        db_table = "snaps_st_field_goal"


class ExtraPointSnap(SpecialTeamsSnap):
    """
    Point After Touchdown (PAT) or 2-point conversion.

    PAT kick = 1 point
    2-point conversion (run or pass) = 2 points
    """
    class AttemptType(models.TextChoices):
        KICK = "KICK", "PAT Kick"
        TWO_PT_RUN = "2PT_RUN", "2-Point Run"
        TWO_PT_PASS = "2PT_PASS", "2-Point Pass"

    class Result(models.TextChoices):
        GOOD = "GOOD", "Good"
        MISSED = "MISS", "Missed"
        BLOCKED = "BLOCK", "Blocked"
        FAILED = "FAIL", "Failed (2pt)"

    attempt_type = models.CharField(max_length=10, choices=AttemptType.choices)
    result = models.CharField(max_length=10, choices=Result.choices)

    # For kicks
    kicker = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="extra_point_kicks"
    )

    # For 2-point conversions
    ball_carrier = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="two_point_carries"
    )
    passer = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="two_point_passes"
    )
    receiver = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="two_point_receptions"
    )

    class Meta:
        db_table = "snaps_st_extra_point"
```

---

## API Design

### Project Structure

```
sportsman/
├── manage.py
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── .env.example
├── sportsman/                    # Project config
│   ├── __init__.py
│   ├── settings/
│   │   ├── __init__.py
│   │   ├── base.py              # Shared settings
│   │   ├── development.py       # DEBUG=True, SQLite
│   │   ├── local_network.py     # LAN deployment (NEW)
│   │   ├── production.py        # Cloud/Internet deployment
│   │   └── test.py              # Fast test settings
│   ├── urls.py
│   ├── wsgi.py
│   └── asgi.py
├── apps/
│   ├── __init__.py
│   ├── core/                    # Shared utilities
│   │   ├── models.py            # TimeStampedModel
│   │   ├── pagination.py
│   │   ├── permissions.py
│   │   ├── throttling.py
│   │   ├── exceptions.py
│   │   └── health.py            # Health check endpoint (NEW)
│   ├── accounts/                # User management
│   │   ├── models.py            # Custom User if needed
│   │   ├── serializers.py
│   │   ├── views.py
│   │   └── urls.py
│   ├── teams/                   # Team/Season/Player
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   ├── filters.py
│   │   └── urls.py
│   ├── games/                   # Game management
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   ├── filters.py
│   │   └── urls.py
│   ├── snaps/                   # All snap types
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── base.py
│   │   │   ├── offense.py
│   │   │   ├── defense.py
│   │   │   └── special_teams.py
│   │   ├── serializers/
│   │   │   ├── __init__.py
│   │   │   ├── offense.py
│   │   │   ├── defense.py
│   │   │   └── special_teams.py
│   │   ├── views.py
│   │   ├── filters.py
│   │   └── urls.py
│   └── reports/                 # Analytics
│       ├── services/            # Business logic layer
│       │   ├── __init__.py
│       │   ├── base.py
│       │   ├── offense.py
│       │   ├── defense.py
│       │   └── special_teams.py
│       ├── serializers.py
│       ├── views.py
│       └── urls.py
├── api/
│   ├── __init__.py
│   ├── urls.py                  # /api/ -> versioned routes
│   └── v1/
│       ├── __init__.py
│       └── urls.py              # /api/v1/ endpoints
├── scripts/
│   ├── backup.sh                # Database backup script (NEW)
│   ├── restore.sh               # Database restore script (NEW)
│   └── start.sh                 # Container startup script (NEW)
└── tests/
    ├── __init__.py
    ├── conftest.py              # Pytest fixtures
    ├── factories/               # factory_boy factories
    │   ├── __init__.py
    │   ├── teams.py
    │   ├── games.py
    │   └── snaps.py
    ├── unit/
    └── integration/
```

### Settings Configuration

```python
# sportsman/settings/base.py
"""
BEST PRACTICE: Split settings into base/dev/local_network/prod/test.
This prevents DEBUG=True or dev secrets in production.
"""
from pathlib import Path
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# SECURITY: Never hardcode - use environment variables
SECRET_KEY = None  # Must be set in environment-specific settings

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "django_filters",
    "corsheaders",
    "drf_spectacular",
    "polymorphic",
    # Local apps
    "apps.core",
    "apps.accounts",
    "apps.teams",
    "apps.games",
    "apps.snaps",
    "apps.reports",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",  # CORS before CommonMiddleware
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "sportsman.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "sportsman.wsgi.application"

# REST Framework
REST_FRAMEWORK = {
    # BEST PRACTICE: Always paginate list endpoints
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 25,

    # BEST PRACTICE: Rate limiting prevents abuse
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/hour",
        "user": "1000/hour",
    },

    # BEST PRACTICE: Use django-filter for clean query params
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],

    # BEST PRACTICE: Auto-generate OpenAPI docs
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",

    # BEST PRACTICE: JWT for stateless auth
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],

    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],

    # BEST PRACTICE: JSON only (no browsable API in prod)
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
}

# JWT Settings
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=8),  # Longer for local use
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
}

# OpenAPI Documentation
SPECTACULAR_SETTINGS = {
    "TITLE": "Sports-Man API",
    "DESCRIPTION": "Football game statistics and analytics API",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# Static files
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Media files (uploads)
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# sportsman/settings/development.py
from .base import *

DEBUG = True
SECRET_KEY = "django-insecure-dev-only-not-for-production"

ALLOWED_HOSTS = ["localhost", "127.0.0.1"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

# Allow browsable API in development
REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = [
    "rest_framework.renderers.JSONRenderer",
    "rest_framework.renderers.BrowsableAPIRenderer",
]

CORS_ALLOW_ALL_ORIGINS = True  # Dev only!


# sportsman/settings/local_network.py
"""
LOCAL NETWORK DEPLOYMENT SETTINGS

For hosting on a LAN where the app is accessed via IP or local hostname.
Optimized for trusted network environments (lab, home, small office).

Key differences from cloud production:
- HTTP allowed (HTTPS optional based on network security requirements)
- More permissive CORS for LAN access
- Longer session timeouts (users on trusted devices)
- Browsable API enabled for easier debugging
"""
import os
from .base import *

DEBUG = os.environ.get("DEBUG", "False").lower() == "true"

SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]

# Accept connections from any host on the network
# Configure via ALLOWED_HOSTS env var: "192.168.1.100,sportsman.local,localhost"
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost").split(",")

# PostgreSQL configuration
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME", "sportsman"),
        "USER": os.environ.get("DB_USER", "sportsman"),
        "PASSWORD": os.environ["DB_PASSWORD"],
        "HOST": os.environ.get("DB_HOST", "db"),
        "PORT": os.environ.get("DB_PORT", "5432"),
        "CONN_MAX_AGE": 60,  # Persistent connections for performance
    }
}

# CORS - Allow all origins on local network (or specify)
# For tighter security, set CORS_ALLOWED_ORIGINS env var
if os.environ.get("CORS_ALLOWED_ORIGINS"):
    CORS_ALLOWED_ORIGINS = os.environ["CORS_ALLOWED_ORIGINS"].split(",")
else:
    # Allow any origin on local network - suitable for trusted LAN
    CORS_ALLOW_ALL_ORIGINS = True

CORS_ALLOW_CREDENTIALS = True

# Enable browsable API for easier debugging on LAN
REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = [
    "rest_framework.renderers.JSONRenderer",
    "rest_framework.renderers.BrowsableAPIRenderer",
]

# More generous rate limits for trusted local network
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    "anon": "500/hour",
    "user": "5000/hour",
}

# Longer token lifetimes for local use (less annoying re-auth)
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=12),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
}

# Security settings for HTTP on trusted LAN
# (Enable these if you add HTTPS via nginx or reverse proxy)
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

# Trust the nginx proxy
USE_X_FORWARDED_HOST = True
SECURE_PROXY_SSL_HEADER = None  # Set if using HTTPS

# Logging for debugging
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO"),
            "propagate": False,
        },
    },
}


# sportsman/settings/production.py
"""
CLOUD/INTERNET PRODUCTION SETTINGS

For deployments exposed to the public internet.
Full security hardening enabled.
"""
import os
from .base import *

DEBUG = False

SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "").split(",")

# PostgreSQL in production
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ["DB_NAME"],
        "USER": os.environ["DB_USER"],
        "PASSWORD": os.environ["DB_PASSWORD"],
        "HOST": os.environ["DB_HOST"],
        "PORT": os.environ.get("DB_PORT", "5432"),
        "CONN_MAX_AGE": 60,
        "OPTIONS": {"sslmode": "require"},
    }
}

# HTTPS Security - Full hardening
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True

# CORS - Explicit origins only
CORS_ALLOWED_ORIGINS = os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",")
CORS_ALLOW_CREDENTIALS = True
```

### Health Check Endpoint

```python
# apps/core/health.py
"""
Health check endpoint for container orchestration and monitoring.
"""
from django.http import JsonResponse
from django.db import connection
from django.db.utils import OperationalError


def health_check(request):
    """
    Returns 200 if the app is healthy, 503 if not.
    Used by Docker health checks, load balancers, monitoring.
    """
    health_status = {
        "status": "healthy",
        "database": "ok",
    }

    # Check database connection
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except OperationalError:
        health_status["status"] = "unhealthy"
        health_status["database"] = "error"
        return JsonResponse(health_status, status=503)

    return JsonResponse(health_status)


# apps/core/urls.py
from django.urls import path
from .health import health_check

urlpatterns = [
    path("health/", health_check, name="health_check"),
]
```

### Mobile-Optimized Pagination

```python
# apps/core/pagination.py
"""
Pagination optimized for mobile clients.
"""
from rest_framework.pagination import PageNumberPagination, CursorPagination


class StandardPagination(PageNumberPagination):
    """
    Standard pagination for desktop clients.
    """
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class MobilePagination(PageNumberPagination):
    """
    Smaller page sizes for mobile clients to reduce payload size
    and improve perceived performance on slower connections.
    """
    page_size = 15
    page_size_query_param = "page_size"
    max_page_size = 50


class SnapCursorPagination(CursorPagination):
    """
    Cursor-based pagination for snap lists.

    BEST PRACTICE: Use cursor pagination for:
    - Large datasets with frequent inserts
    - Infinite scroll UIs (mobile-friendly)
    - Consistent ordering without offset drift
    """
    page_size = 20
    ordering = "-sequence_number"
    cursor_query_param = "cursor"
```

### Serializers with Read/Write Separation

```python
# apps/snaps/serializers/offense.py
"""
BEST PRACTICE: Separate read and write serializers.

Read serializers: Include nested objects for display (PlayerSerializer)
Write serializers: Accept IDs only (player_id) for creation

This improves:
- Performance (read doesn't need DB lookups for IDs)
- Client experience (read returns full objects)
- Validation (write validates FKs exist)
"""
from rest_framework import serializers
from apps.snaps.models import RunPlay, PassPlay
from apps.teams.serializers import PlayerMinimalSerializer
from apps.games.serializers import GameMinimalSerializer
from apps.teams.models import Player
from apps.games.models import Game


class RunPlayReadSerializer(serializers.ModelSerializer):
    """For GET requests - includes nested player/game data."""
    ball_carrier = PlayerMinimalSerializer(read_only=True)
    game = GameMinimalSerializer(read_only=True)
    fumble_recovered_by = PlayerMinimalSerializer(read_only=True)

    class Meta:
        model = RunPlay
        fields = [
            "id", "game", "sequence_number", "quarter", "game_clock",
            "down", "distance", "ball_position", "formation",
            "play_result", "ball_carrier", "yards_gained",
            "is_touchdown", "is_first_down", "fumbled", "fumble_lost",
            "fumble_recovered_by", "had_penalty", "penalty_description",
            "notes", "created_at",
        ]


class RunPlayWriteSerializer(serializers.ModelSerializer):
    """For POST/PUT requests - accepts IDs."""
    game_id = serializers.PrimaryKeyRelatedField(
        queryset=Game.objects.all(),
        source="game",
        write_only=True
    )
    ball_carrier_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(),
        source="ball_carrier",
        write_only=True
    )
    fumble_recovered_by_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(),
        source="fumble_recovered_by",
        required=False,
        allow_null=True,
        write_only=True
    )

    class Meta:
        model = RunPlay
        fields = [
            "game_id", "sequence_number", "quarter", "game_clock",
            "down", "distance", "ball_position", "formation",
            "ball_carrier_id", "yards_gained", "is_touchdown",
            "is_first_down", "fumbled", "fumble_lost",
            "fumble_recovered_by_id", "had_penalty", "penalty_player",
            "penalty_yards", "penalty_description", "notes",
        ]

    def validate(self, attrs):
        """
        BEST PRACTICE: Cross-field validation in validate() method.
        """
        if attrs.get("fumble_lost") and not attrs.get("fumbled"):
            raise serializers.ValidationError(
                {"fumble_lost": "Cannot lose fumble without fumbling"}
            )
        return attrs


class PassPlayReadSerializer(serializers.ModelSerializer):
    quarterback = PlayerMinimalSerializer(read_only=True)
    target = PlayerMinimalSerializer(read_only=True)
    receiver = PlayerMinimalSerializer(read_only=True)
    game = GameMinimalSerializer(read_only=True)

    # Computed fields
    passer_rating = serializers.SerializerMethodField()

    class Meta:
        model = PassPlay
        fields = [
            "id", "game", "sequence_number", "quarter", "game_clock",
            "down", "distance", "ball_position", "formation",
            "play_result", "quarterback", "target", "receiver",
            "is_complete", "yards_gained", "air_yards", "yards_after_catch",
            "is_touchdown", "is_first_down", "is_interception",
            "is_thrown_away", "was_under_pressure", "was_sacked",
            "sack_yards", "fumbled", "fumble_lost",
            "had_penalty", "penalty_description", "notes",
            "passer_rating", "created_at",
        ]

    def get_passer_rating(self, obj):
        """Calculate NFL passer rating for this play."""
        # Simplified single-play rating
        if obj.is_complete:
            return 100 + (obj.yards_gained * 2)
        elif obj.is_interception:
            return 0
        return 39.6  # Incomplete pass baseline


class PassPlayWriteSerializer(serializers.ModelSerializer):
    """For POST/PUT requests - accepts IDs."""
    game_id = serializers.PrimaryKeyRelatedField(
        queryset=Game.objects.all(),
        source="game",
        write_only=True
    )
    quarterback_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(),
        source="quarterback",
        write_only=True
    )
    target_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(),
        source="target",
        required=False,
        allow_null=True,
        write_only=True
    )
    receiver_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(),
        source="receiver",
        required=False,
        allow_null=True,
        write_only=True
    )

    class Meta:
        model = PassPlay
        fields = [
            "game_id", "sequence_number", "quarter", "game_clock",
            "down", "distance", "ball_position", "formation",
            "quarterback_id", "target_id", "receiver_id",
            "is_complete", "yards_gained", "air_yards", "yards_after_catch",
            "is_touchdown", "is_first_down", "is_interception",
            "is_thrown_away", "was_under_pressure", "was_sacked",
            "sack_yards", "fumbled", "fumble_lost",
            "had_penalty", "penalty_player", "penalty_yards",
            "penalty_description", "notes",
        ]

    def validate(self, attrs):
        if attrs.get("is_complete") and not attrs.get("receiver"):
            raise serializers.ValidationError(
                {"receiver_id": "Receiver required for completed passes"}
            )
        return attrs
```

### ViewSets

```python
# apps/snaps/views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from apps.core.pagination import SnapCursorPagination
from .models import RunPlay, PassPlay, DefenseSnap
from .serializers.offense import (
    RunPlayReadSerializer, RunPlayWriteSerializer,
    PassPlayReadSerializer, PassPlayWriteSerializer,
)
from .filters import RunPlayFilter, PassPlayFilter


class RunPlayViewSet(viewsets.ModelViewSet):
    """
    BEST PRACTICE: Use get_serializer_class() to switch between
    read and write serializers based on action.
    """
    queryset = RunPlay.objects.select_related(
        "game", "game__season", "game__season__team",
        "ball_carrier", "fumble_recovered_by", "penalty_player"
    )
    filterset_class = RunPlayFilter

    def get_serializer_class(self):
        if self.action in ["list", "retrieve"]:
            return RunPlayReadSerializer
        return RunPlayWriteSerializer

    def get_queryset(self):
        """
        BEST PRACTICE: Filter queryset to user's team.
        Prevents accessing other teams' data.
        """
        qs = super().get_queryset()
        if hasattr(self.request.user, "team"):
            qs = qs.filter(game__season__team=self.request.user.team)
        return qs


class PassPlayViewSet(viewsets.ModelViewSet):
    queryset = PassPlay.objects.select_related(
        "game", "quarterback", "target", "receiver"
    )
    filterset_class = PassPlayFilter

    def get_serializer_class(self):
        if self.action in ["list", "retrieve"]:
            return PassPlayReadSerializer
        return PassPlayWriteSerializer

    @action(detail=False, methods=["get"])
    def by_quarterback(self, request):
        """
        BEST PRACTICE: Custom actions for specialized queries.
        GET /api/v1/snaps/pass/by_quarterback/?qb_id=5
        """
        qb_id = request.query_params.get("qb_id")
        if not qb_id:
            return Response(
                {"error": "qb_id parameter required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        passes = self.get_queryset().filter(quarterback_id=qb_id)
        page = self.paginate_queryset(passes)
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)
```

### URL Configuration

```python
# api/v1/urls.py
"""
BEST PRACTICE: Version your API from the start.
/api/v1/ allows future /api/v2/ without breaking clients.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.teams.views import TeamViewSet, PlayerViewSet
from apps.games.views import GameViewSet
from apps.snaps.views import (
    RunPlayViewSet, PassPlayViewSet, DefenseSnapViewSet,
    PuntSnapViewSet, KickoffSnapViewSet, FieldGoalSnapViewSet,
)

router = DefaultRouter()

# Team management
router.register(r"teams", TeamViewSet, basename="team")
router.register(r"players", PlayerViewSet, basename="player")

# Games
router.register(r"games", GameViewSet, basename="game")

# Snaps by type
router.register(r"snaps/run", RunPlayViewSet, basename="run-play")
router.register(r"snaps/pass", PassPlayViewSet, basename="pass-play")
router.register(r"snaps/defense", DefenseSnapViewSet, basename="defense-snap")
router.register(r"snaps/punt", PuntSnapViewSet, basename="punt")
router.register(r"snaps/kickoff", KickoffSnapViewSet, basename="kickoff")
router.register(r"snaps/field-goal", FieldGoalSnapViewSet, basename="field-goal")

urlpatterns = [
    path("", include(router.urls)),
    path("reports/", include("apps.reports.urls")),
    path("auth/", include("apps.accounts.urls")),
]


# api/urls.py
from django.urls import path, include
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
)

urlpatterns = [
    path("v1/", include("api.v1.urls")),

    # Health check (unauthenticated for monitoring)
    path("", include("apps.core.urls")),

    # BEST PRACTICE: Auto-generated API documentation
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]


# sportsman/urls.py
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
]
```

---

## Report Service Layer

### Best Practice: Service Layer Pattern

```python
# apps/reports/services/base.py
"""
BEST PRACTICE: Service layer separates business logic from views.

Benefits:
- Reusable across views, management commands, Celery tasks
- Testable in isolation (no HTTP layer)
- Single place for complex queries
"""
from django.db.models import Q


class BaseReportService:
    """Base class for report services with common filtering."""

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


# apps/reports/services/offense.py
from django.db.models import Count, Sum, Avg, Max, F, Q, Case, When
from django.db.models.functions import Coalesce
from apps.snaps.models import RunPlay, PassPlay
from .base import BaseReportService


class OffenseReportService(BaseReportService):
    """
    BEST PRACTICE: Use Django ORM aggregation instead of Python loops.

    BAD (old approach):
        snaps = Snap.objects.filter(type="OFF")
        total_yards = 0
        for snap in snaps:
            total_yards += snap.run_yards or 0

    GOOD (new approach):
        RunPlay.objects.aggregate(total_yards=Sum("yards_gained"))

    Benefits:
    - Database does the math (faster)
    - No memory issues with large datasets
    - Single query instead of N+1
    """

    def get_rushing_totals(self) -> dict:
        """Team rushing totals."""
        return RunPlay.objects.filter(self.filters).aggregate(
            attempts=Count("id"),
            yards=Coalesce(Sum("yards_gained"), 0),
            touchdowns=Count("id", filter=Q(is_touchdown=True)),
            first_downs=Count("id", filter=Q(is_first_down=True)),
            fumbles=Count("id", filter=Q(fumbled=True)),
            fumbles_lost=Count("id", filter=Q(fumble_lost=True)),
            longest=Coalesce(Max("yards_gained"), 0),
            avg_yards=Coalesce(Avg("yards_gained"), 0.0),
        )

    def get_rushing_by_player(self) -> list[dict]:
        """Per-player rushing statistics."""
        return list(
            RunPlay.objects.filter(
                self.filters,
                ball_carrier__isnull=False
            ).values(
                "ball_carrier__id",
                "ball_carrier__first_name",
                "ball_carrier__last_name",
                "ball_carrier__number",
            ).annotate(
                attempts=Count("id"),
                yards=Coalesce(Sum("yards_gained"), 0),
                touchdowns=Count("id", filter=Q(is_touchdown=True)),
                first_downs=Count("id", filter=Q(is_first_down=True)),
                fumbles=Count("id", filter=Q(fumbled=True)),
                fumbles_lost=Count("id", filter=Q(fumble_lost=True)),
                longest=Coalesce(Max("yards_gained"), 0),
                avg_yards=Coalesce(Avg("yards_gained"), 0.0),
                # Breakdown by distance
                short_runs=Count("id", filter=Q(yards_gained__lte=5)),
                long_runs=Count("id", filter=Q(yards_gained__gt=5)),
                explosive_runs=Count("id", filter=Q(yards_gained__gte=10)),
            ).order_by("-yards")
        )

    def get_passing_totals(self) -> dict:
        """Team passing totals."""
        return PassPlay.objects.filter(self.filters).aggregate(
            attempts=Count("id"),
            completions=Count("id", filter=Q(is_complete=True)),
            yards=Coalesce(Sum("yards_gained", filter=Q(is_complete=True)), 0),
            touchdowns=Count("id", filter=Q(is_touchdown=True)),
            interceptions=Count("id", filter=Q(is_interception=True)),
            sacks=Count("id", filter=Q(was_sacked=True)),
            sack_yards=Coalesce(Sum("sack_yards", filter=Q(was_sacked=True)), 0),
            air_yards=Coalesce(Sum("air_yards"), 0),
            yac=Coalesce(Sum("yards_after_catch", filter=Q(is_complete=True)), 0),
            longest=Coalesce(Max("yards_gained", filter=Q(is_complete=True)), 0),
        )

    def get_passing_by_quarterback(self) -> list[dict]:
        """Per-QB passing statistics with passer rating."""
        qb_stats = list(
            PassPlay.objects.filter(
                self.filters,
                quarterback__isnull=False
            ).values(
                "quarterback__id",
                "quarterback__first_name",
                "quarterback__last_name",
                "quarterback__number",
            ).annotate(
                attempts=Count("id"),
                completions=Count("id", filter=Q(is_complete=True)),
                yards=Coalesce(Sum("yards_gained", filter=Q(is_complete=True)), 0),
                touchdowns=Count("id", filter=Q(is_touchdown=True)),
                interceptions=Count("id", filter=Q(is_interception=True)),
                sacks=Count("id", filter=Q(was_sacked=True)),
                air_yards=Coalesce(Sum("air_yards"), 0),
                yac=Coalesce(Sum("yards_after_catch", filter=Q(is_complete=True)), 0),
                longest=Coalesce(Max("yards_gained", filter=Q(is_complete=True)), 0),
                thrown_away=Count("id", filter=Q(is_thrown_away=True)),
                under_pressure=Count("id", filter=Q(was_under_pressure=True)),
            ).order_by("-yards")
        )

        # Calculate passer rating (requires post-processing)
        for stat in qb_stats:
            stat["completion_pct"] = (
                (stat["completions"] / stat["attempts"] * 100)
                if stat["attempts"] > 0 else 0.0
            )
            stat["yards_per_attempt"] = (
                stat["yards"] / stat["attempts"]
                if stat["attempts"] > 0 else 0.0
            )
            stat["passer_rating"] = self._calculate_passer_rating(stat)

        return qb_stats

    def _calculate_passer_rating(self, stats: dict) -> float:
        """
        Calculate NFL passer rating.
        Formula: https://en.wikipedia.org/wiki/Passer_rating
        """
        if stats["attempts"] == 0:
            return 0.0

        # Component calculations (capped at 2.375)
        a = max(0, min(2.375, (stats["completion_pct"] - 30) / 20))
        b = max(0, min(2.375, (stats["yards_per_attempt"] - 3) / 4))
        c = max(0, min(2.375, (stats["touchdowns"] / stats["attempts"]) * 20))
        d = max(0, min(2.375, 2.375 - (stats["interceptions"] / stats["attempts"] * 25)))

        return round(((a + b + c + d) / 6) * 100, 1)

    def get_receiving_by_player(self) -> list[dict]:
        """Per-receiver statistics."""
        return list(
            PassPlay.objects.filter(
                self.filters,
                receiver__isnull=False,
                is_complete=True
            ).values(
                "receiver__id",
                "receiver__first_name",
                "receiver__last_name",
                "receiver__number",
                "receiver__position",
            ).annotate(
                receptions=Count("id"),
                yards=Coalesce(Sum("yards_gained"), 0),
                touchdowns=Count("id", filter=Q(is_touchdown=True)),
                first_downs=Count("id", filter=Q(is_first_down=True)),
                longest=Coalesce(Max("yards_gained"), 0),
                yac=Coalesce(Sum("yards_after_catch"), 0),
                fumbles=Count("id", filter=Q(fumbled=True)),
                avg_yards=Coalesce(Avg("yards_gained"), 0.0),
            ).order_by("-yards")
        )


# apps/reports/services/defense.py
from django.db.models import Count, Sum, Coalesce, Q
from apps.snaps.models import DefenseSnap, DefenseSnapAssist
from .base import BaseReportService


class DefenseReportService(BaseReportService):
    """Defense statistics and analytics."""

    def get_team_totals(self) -> dict:
        """Team-wide defensive totals."""
        return DefenseSnap.objects.filter(self.filters).aggregate(
            total_tackles=Count(
                "id", filter=Q(play_result=DefenseSnap.PlayResult.TACKLE)
            ),
            total_tfl=Count(
                "id", filter=Q(play_result=DefenseSnap.PlayResult.TACKLE_FOR_LOSS)
            ),
            total_sacks=Count(
                "id", filter=Q(play_result=DefenseSnap.PlayResult.SACK)
            ),
            total_interceptions=Count(
                "id", filter=Q(play_result=DefenseSnap.PlayResult.INTERCEPTION)
            ),
            total_fumble_recoveries=Count(
                "id", filter=Q(play_result=DefenseSnap.PlayResult.FUMBLE_RECOVERY)
            ),
            total_pass_defended=Count(
                "id", filter=Q(play_result=DefenseSnap.PlayResult.PASS_DEFENDED)
            ),
            total_pressures=Count("id", filter=Q(applied_pressure=True)),
            total_forced_incompletions=Count("id", filter=Q(forced_incompletion=True)),
            defensive_touchdowns=Count("id", filter=Q(is_defensive_touchdown=True)),
            int_return_yards=Coalesce(Sum("interception_return_yards"), 0),
            fumble_return_yards=Coalesce(Sum("fumble_return_yards"), 0),
        )

    def get_player_summary(self) -> list[dict]:
        """Per-player defensive statistics with assists."""
        # Primary stats
        primary_stats = list(
            DefenseSnap.objects.filter(
                self.filters,
                primary_player__isnull=False
            ).values(
                "primary_player__id",
                "primary_player__first_name",
                "primary_player__last_name",
                "primary_player__number",
                "primary_player__position",
            ).annotate(
                tackles=Count("id", filter=Q(play_result=DefenseSnap.PlayResult.TACKLE)),
                tfl=Count("id", filter=Q(play_result=DefenseSnap.PlayResult.TACKLE_FOR_LOSS)),
                sacks=Count("id", filter=Q(play_result=DefenseSnap.PlayResult.SACK)),
                interceptions=Count("id", filter=Q(play_result=DefenseSnap.PlayResult.INTERCEPTION)),
                fumble_recoveries=Count("id", filter=Q(play_result=DefenseSnap.PlayResult.FUMBLE_RECOVERY)),
                pass_defended=Count("id", filter=Q(play_result=DefenseSnap.PlayResult.PASS_DEFENDED)),
                pressures=Count("id", filter=Q(applied_pressure=True)),
                def_tds=Count("id", filter=Q(is_defensive_touchdown=True)),
            ).order_by("-tackles")
        )

        return primary_stats


# apps/reports/services/special_teams.py
from django.db.models import Count, Sum, Avg, Max, Min, Coalesce, Q
from apps.snaps.models import (
    PuntSnap, PuntReturnSnap, KickoffSnap, KickoffReturnSnap,
    FieldGoalSnap, ExtraPointSnap
)
from .base import BaseReportService


class SpecialTeamsReportService(BaseReportService):
    """Special teams statistics."""

    def get_punt_totals(self) -> dict:
        return PuntSnap.objects.filter(self.filters).aggregate(
            punts=Count("id"),
            total_yards=Coalesce(Sum("punt_yards"), 0),
            avg_yards=Coalesce(Avg("punt_yards"), 0.0),
            longest=Coalesce(Max("punt_yards"), 0),
            touchbacks=Count("id", filter=Q(is_touchback=True)),
            blocked=Count("id", filter=Q(is_blocked=True)),
        )

    def get_field_goal_totals(self) -> dict:
        return FieldGoalSnap.objects.filter(self.filters).aggregate(
            attempts=Count("id"),
            made=Count("id", filter=Q(result=FieldGoalSnap.Result.GOOD)),
            missed=Count("id", filter=Q(result=FieldGoalSnap.Result.MISSED)),
            blocked=Count("id", filter=Q(result=FieldGoalSnap.Result.BLOCKED)),
            longest=Max("distance", filter=Q(result=FieldGoalSnap.Result.GOOD)),
        )

    def get_field_goal_by_kicker(self) -> list[dict]:
        stats = list(
            FieldGoalSnap.objects.filter(
                self.filters,
                kicker__isnull=False
            ).values(
                "kicker__id",
                "kicker__first_name",
                "kicker__last_name",
                "kicker__number",
            ).annotate(
                attempts=Count("id"),
                made=Count("id", filter=Q(result=FieldGoalSnap.Result.GOOD)),
                missed=Count("id", filter=Q(result=FieldGoalSnap.Result.MISSED)),
                blocked=Count("id", filter=Q(result=FieldGoalSnap.Result.BLOCKED)),
                longest=Max("distance", filter=Q(result=FieldGoalSnap.Result.GOOD)),
            ).order_by("-made")
        )

        for stat in stats:
            stat["percentage"] = (
                round(stat["made"] / stat["attempts"] * 100, 1)
                if stat["attempts"] > 0 else 0.0
            )

        return stats
```

### Report Views

```python
# apps/reports/views.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema, OpenApiParameter
from .services.offense import OffenseReportService
from .services.defense import DefenseReportService
from .services.special_teams import SpecialTeamsReportService
from .serializers import (
    RushingTotalsSerializer, RushingPlayerSerializer,
    PassingTotalsSerializer, PassingPlayerSerializer,
    DefenseTotalsSerializer, DefensePlayerSerializer,
)


class RushingTotalsView(APIView):
    """
    BEST PRACTICE: API views are thin - delegate to services.
    Views handle HTTP concerns (params, response format).
    Services handle business logic (queries, calculations).
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary="Team rushing totals",
        parameters=[
            OpenApiParameter(
                name="game_ids",
                type=str,
                description="Comma-separated game IDs to filter"
            ),
            OpenApiParameter(
                name="season_id",
                type=int,
                description="Filter by season"
            ),
        ],
        responses={200: RushingTotalsSerializer},
    )
    def get(self, request):
        # Parse filter params
        game_ids = None
        if request.query_params.get("game_ids"):
            game_ids = [
                int(x) for x in request.query_params["game_ids"].split(",")
            ]
        season_id = request.query_params.get("season_id")

        # Get team from authenticated user
        team_id = getattr(request.user, "team_id", None)

        # Delegate to service
        service = OffenseReportService(
            game_ids=game_ids,
            season_id=season_id,
            team_id=team_id
        )
        data = service.get_rushing_totals()

        serializer = RushingTotalsSerializer(data)
        return Response(serializer.data)


class RushingByPlayerView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary="Rushing stats by player",
        responses={200: RushingPlayerSerializer(many=True)},
    )
    def get(self, request):
        game_ids = self._parse_game_ids(request)
        season_id = request.query_params.get("season_id")
        team_id = getattr(request.user, "team_id", None)

        service = OffenseReportService(
            game_ids=game_ids,
            season_id=season_id,
            team_id=team_id
        )
        data = service.get_rushing_by_player()

        serializer = RushingPlayerSerializer(data, many=True)
        return Response(serializer.data)

    def _parse_game_ids(self, request):
        game_ids_param = request.query_params.get("game_ids")
        if game_ids_param:
            return [int(x) for x in game_ids_param.split(",")]
        return None


# apps/reports/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # Offense
    path("offense/rushing/totals/", views.RushingTotalsView.as_view()),
    path("offense/rushing/players/", views.RushingByPlayerView.as_view()),
    path("offense/passing/totals/", views.PassingTotalsView.as_view()),
    path("offense/passing/quarterbacks/", views.PassingByQBView.as_view()),
    path("offense/receiving/players/", views.ReceivingByPlayerView.as_view()),

    # Defense
    path("defense/totals/", views.DefenseTotalsView.as_view()),
    path("defense/players/", views.DefenseByPlayerView.as_view()),

    # Special Teams
    path("special-teams/punting/totals/", views.PuntTotalsView.as_view()),
    path("special-teams/kicking/totals/", views.FieldGoalTotalsView.as_view()),
    path("special-teams/kicking/kickers/", views.FieldGoalByKickerView.as_view()),
]
```

---

## Local Network Deployment

### Deployment Scripts

```bash
#!/bin/bash
# scripts/backup.sh - Database backup script
# Run manually or via cron for scheduled backups

set -e

BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/sportsman_${TIMESTAMP}.sql.gz"

echo "Starting backup at $(date)"

# Create backup using pg_dump inside the container
docker compose exec -T db pg_dump -U sportsman sportsman | gzip > "${BACKUP_FILE}"

# Keep only last 7 days of backups
find "${BACKUP_DIR}" -name "sportsman_*.sql.gz" -mtime +7 -delete

echo "Backup completed: ${BACKUP_FILE}"
echo "Backup size: $(du -h ${BACKUP_FILE} | cut -f1)"
```

```bash
#!/bin/bash
# scripts/restore.sh - Database restore script
# Usage: ./restore.sh backup_file.sql.gz

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    echo "Available backups:"
    ls -la backups/*.sql.gz 2>/dev/null || echo "No backups found"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "WARNING: This will overwrite the current database!"
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Restore cancelled"
    exit 0
fi

echo "Restoring from: $BACKUP_FILE"

# Stop web container to prevent connections
docker compose stop web

# Drop and recreate database
docker compose exec -T db psql -U sportsman -c "DROP DATABASE IF EXISTS sportsman;"
docker compose exec -T db psql -U sportsman -c "CREATE DATABASE sportsman;"

# Restore backup
gunzip -c "$BACKUP_FILE" | docker compose exec -T db psql -U sportsman sportsman

# Start web container
docker compose start web

echo "Restore completed successfully"
```

```bash
#!/bin/bash
# scripts/start.sh - Container startup script with migrations

set -e

echo "Waiting for database..."
while ! nc -z db 5432; do
    sleep 1
done
echo "Database is ready"

echo "Running migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Starting Gunicorn..."
exec gunicorn --bind 0.0.0.0:8000 --workers 3 --access-logfile - sportsman.wsgi:application
```

### Quick Start Guide

```markdown
# Quick Start: Local Network Deployment

## Prerequisites
- Docker and Docker Compose installed
- Network access to the host machine

## 1. Clone and Configure

```bash
# Clone the repository
git clone <repo-url> sportsman
cd sportsman

# Copy and edit environment file
cp .env.example .env

# Edit .env with your settings:
# - Generate a secret key
# - Set your server's IP/hostname in ALLOWED_HOSTS
# - Set a secure database password
```

## 2. Start the Application

```bash
# Build and start containers
docker compose up -d

# Check logs
docker compose logs -f web

# Verify health
curl http://localhost:8000/api/health/
```

## 3. Create Admin User

```bash
docker compose exec web python manage.py createsuperuser
```

## 4. Access the Application

From any device on your network:
- API: `http://<server-ip>/api/v1/`
- Admin: `http://<server-ip>/admin/`
- API Docs: `http://<server-ip>/api/docs/`

## 5. Configure Mobile Access

Add the server's IP address to your mobile device:
1. Ensure device is on same network
2. Open browser to `http://<server-ip>/api/docs/`
3. Authenticate and start using the API

## Common Operations

```bash
# View logs
docker compose logs -f

# Restart services
docker compose restart

# Stop everything
docker compose down

# Backup database
./scripts/backup.sh

# Restore database
./scripts/restore.sh backups/sportsman_20240101_120000.sql.gz

# Update application
git pull
docker compose build
docker compose up -d
```

## Troubleshooting

### Can't connect from mobile
- Check firewall allows port 80/8000
- Verify ALLOWED_HOSTS includes server IP
- Test with `curl` from another machine

### Database connection errors
- Check `docker compose ps` for container status
- View logs: `docker compose logs db`

### Slow performance
- Increase worker count in docker-compose.yml
- Check database indexes with Django Debug Toolbar
```

---

## Testing Strategy

### Test Configuration

```python
# tests/conftest.py
"""
BEST PRACTICE: Use pytest with factory_boy for clean test data.
"""
import pytest
from rest_framework.test import APIClient


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def authenticated_client(api_client, user_factory):
    user = user_factory()
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def team_with_players(team_factory, player_factory):
    """Create a team with a full roster."""
    team = team_factory()

    # Create players by position
    player_factory(team=team, position="QB")
    player_factory.create_batch(2, team=team, position="RB")
    player_factory.create_batch(4, team=team, position="WR")
    player_factory.create_batch(2, team=team, position="TE")

    return team
```

### Factories

```python
# tests/factories/teams.py
import factory
from factory.django import DjangoModelFactory
from apps.teams.models import Team, Season, Player


class TeamFactory(DjangoModelFactory):
    class Meta:
        model = Team

    name = factory.Sequence(lambda n: f"Team {n}")
    abbreviation = factory.Sequence(lambda n: f"TM{n}")


class SeasonFactory(DjangoModelFactory):
    class Meta:
        model = Season

    year = factory.Sequence(lambda n: 2020 + n)
    team = factory.SubFactory(TeamFactory)


class PlayerFactory(DjangoModelFactory):
    class Meta:
        model = Player

    first_name = factory.Faker("first_name")
    last_name = factory.Faker("last_name")
    position = factory.Iterator(["QB", "RB", "WR", "TE", "OL"])
    number = factory.Sequence(lambda n: (n % 99) + 1)
    team = factory.SubFactory(TeamFactory)
    is_active = True


# tests/factories/games.py
import factory
from factory.django import DjangoModelFactory
from apps.games.models import Game


class GameFactory(DjangoModelFactory):
    class Meta:
        model = Game

    season = factory.SubFactory(SeasonFactory)
    date = factory.Faker("date_object")
    opponent = factory.Faker("city")
    location = "home"
    weather = "clear"
    field_condition = "grass"


# tests/factories/snaps.py
class RunPlayFactory(DjangoModelFactory):
    class Meta:
        model = RunPlay

    game = factory.SubFactory(GameFactory)
    sequence_number = factory.Sequence(lambda n: n)
    quarter = factory.Iterator([1, 2, 3, 4])
    down = factory.Iterator([1, 2, 3, 4])
    distance = 10
    ball_carrier = factory.SubFactory(PlayerFactory, position="RB")
    yards_gained = factory.Faker("pyint", min_value=-3, max_value=15)
    play_result = "RUN"
```

### Unit Tests

```python
# tests/unit/test_services/test_offense_report_service.py
"""
BEST PRACTICE: Test services in isolation from views.
"""
import pytest
from apps.reports.services.offense import OffenseReportService


@pytest.mark.django_db
class TestOffenseReportService:

    def test_rushing_totals_empty_database(self):
        """Service returns zeros when no data exists."""
        service = OffenseReportService()
        totals = service.get_rushing_totals()

        assert totals["attempts"] == 0
        assert totals["yards"] == 0
        assert totals["touchdowns"] == 0

    def test_rushing_totals_with_data(self, run_play_factory):
        """Service correctly aggregates rushing data."""
        # Create test data
        run_play_factory(yards_gained=10, is_touchdown=False)
        run_play_factory(yards_gained=5, is_touchdown=False)
        run_play_factory(yards_gained=25, is_touchdown=True)

        service = OffenseReportService()
        totals = service.get_rushing_totals()

        assert totals["attempts"] == 3
        assert totals["yards"] == 40
        assert totals["touchdowns"] == 1
        assert totals["longest"] == 25
        assert totals["avg_yards"] == pytest.approx(13.33, rel=0.01)

    def test_rushing_filtered_by_game(self, game_factory, run_play_factory):
        """Service filters by game_ids correctly."""
        game1 = game_factory()
        game2 = game_factory()

        run_play_factory(game=game1, yards_gained=10)
        run_play_factory(game=game2, yards_gained=20)

        service = OffenseReportService(game_ids=[game1.id])
        totals = service.get_rushing_totals()

        assert totals["yards"] == 10  # Only game1 data


# tests/unit/test_models/test_player.py
@pytest.mark.django_db
class TestPlayerModel:

    def test_full_name_property(self, player_factory):
        player = player_factory(first_name="John", last_name="Doe")
        assert player.full_name == "John Doe"

    def test_str_representation(self, player_factory):
        player = player_factory(first_name="John", last_name="Doe", number=12)
        assert str(player) == "#12 John Doe"
```

### Integration Tests

```python
# tests/integration/test_api/test_reports.py
"""
BEST PRACTICE: Integration tests verify full request/response cycle.
"""
import pytest
from rest_framework import status


@pytest.mark.django_db
class TestRushingReportEndpoints:

    def test_rushing_totals_requires_auth(self, api_client):
        """Unauthenticated requests are rejected."""
        response = api_client.get("/api/v1/reports/offense/rushing/totals/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_rushing_totals_success(self, authenticated_client, run_play_factory):
        """Authenticated request returns rushing totals."""
        run_play_factory(yards_gained=15)

        response = authenticated_client.get(
            "/api/v1/reports/offense/rushing/totals/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["attempts"] == 1
        assert response.data["yards"] == 15

    def test_rushing_totals_filtered_by_game(
        self, authenticated_client, game_factory, run_play_factory
    ):
        """game_ids parameter filters results correctly."""
        game1 = game_factory()
        game2 = game_factory()
        run_play_factory(game=game1, yards_gained=10)
        run_play_factory(game=game2, yards_gained=20)

        response = authenticated_client.get(
            f"/api/v1/reports/offense/rushing/totals/?game_ids={game1.id}"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["yards"] == 10


# tests/integration/test_api/test_health.py
@pytest.mark.django_db
class TestHealthEndpoint:

    def test_health_check_returns_ok(self, api_client):
        """Health endpoint returns 200 when healthy."""
        response = api_client.get("/api/health/")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["status"] == "healthy"
        assert response.json()["database"] == "ok"
```

---

## Dependencies

```
# requirements/base.txt
Django>=5.0,<5.1
djangorestframework>=3.14
psycopg[binary]>=3.1
djangorestframework-simplejwt>=5.3
django-filter>=23.5
drf-spectacular>=0.27
django-cors-headers>=4.3
django-polymorphic>=3.1
gunicorn>=21.2

# requirements/development.txt
-r base.txt
pytest>=8.0
pytest-django>=4.7
pytest-cov>=4.1
factory-boy>=3.3
ruff>=0.2
mypy>=1.8
django-stubs>=4.2

# requirements/production.txt
-r base.txt
whitenoise>=6.6
sentry-sdk>=1.39
```

---

## Summary

This specification provides everything needed to build the Sports-Man football analytics application with modern Django best practices, optimized for **local network deployment**:

### Core Features
1. **Polymorphic Models** - Clean inheritance hierarchy instead of God Object
2. **Service Layer** - Business logic separated from views, using ORM aggregation
3. **Read/Write Serializers** - Optimized for each operation type
4. **API Versioning** - Future-proof with `/api/v1/`
5. **JWT Authentication** - Stateless, secure auth with longer local timeouts
6. **Comprehensive Testing** - Factories, unit tests, integration tests

### Local Network Optimizations
1. **Docker Compose** - Single-command deployment with PostgreSQL
2. **Local Network Settings** - Dedicated `local_network.py` with appropriate CORS/security
3. **Health Check Endpoint** - For container orchestration and monitoring
4. **Nginx Reverse Proxy** - Gzip compression and static file serving for mobile
5. **Backup/Restore Scripts** - Easy database management
6. **Mobile-Optimized Pagination** - Smaller page sizes, cursor pagination

### Deployment Model
- Container running in VM with static IP
- Access from any device on organization network
- No cloud dependencies - fully self-hosted
- HTTP by default (HTTPS optional via nginx)

The domain model captures all aspects of football statistics: rushing, passing, receiving, defensive plays, and special teams. Reports use Django ORM aggregation for efficient database-level calculations instead of Python loops.
