# 02 — Data Models

← [01 — Architecture](01-architecture.md) | Next: [03 — API](03-api.md)

---

## Entity Relationship Diagram

```
┌─────────────┐
│    User     │  (accounts.User, extends AbstractUser)
│─────────────│
│ username    │
│ email       │
│ team ───────────────────────┐
└─────────────┘               │
                              ▼
┌─────────────┐        ┌─────────────┐        ┌────────────┐
│   Season    │───────▶│    Team     │◀───────│  Player    │
│─────────────│        │─────────────│        │────────────│
│ year        │        │ name        │        │ first_name │
│ team (FK)   │        │ abbreviation│        │ last_name  │
└──────┬──────┘        └─────────────┘        │ position   │
       │                                      │ number     │
       ▼                                      │ team (FK)  │
┌─────────────┐                               │ is_active  │
│    Game     │                               └────────────┘
│─────────────│                                     │
│ season (FK) │        (NO direct team FK!)          │ referenced by
│ date        │        access via game.season.team   │ snap FK fields
│ opponent    │                                      │
│ location    │                                      ▼
│ weather     │◀──────────────────────  ┌─────────────────────┐
│ field_cond  │                         │    BaseSnap          │ (polymorphic)
│ team_score  │                         │─────────────────────│
│ opp_score   │                         │ game (FK)           │
│ notes       │                         │ sequence_number     │
└──────┬──────┘                         │ quarter             │
       │                                │ game_clock          │
       ▼                                │ down, distance      │
┌─────────────┐                         │ ball_position       │
│QuarterScore │                         │ formation           │
│─────────────│                         │ play_called (FK)    │
│ game (FK)   │                         │ notes               │
│ quarter     │                         └────────┬────────────┘
│ team_score  │                                  │
│ opp_score   │                     ┌────────────┼────────────┐
└─────────────┘                     ▼            ▼            ▼
                            ┌──────────┐  ┌──────────┐  ┌──────────────┐
                            │Offense   │  │Defense   │  │SpecialTeams  │
                            │Snap      │  │Snap      │  │Snap          │
                            └────┬─────┘  └──────────┘  └──────┬───────┘
                                 │                              │
                         ┌───────┴───┐          ┌─────┬────────┼───────┐
                         ▼           ▼           ▼     ▼        ▼       ▼
                      RunPlay    PassPlay      Punt  Kickoff   FG     ExtraPt
```

---

## Database Tables

| Table | Model | App |
|-------|-------|-----|
| `users` | `accounts.User` | accounts |
| `teams` | `teams.Team` | teams |
| `seasons` | `teams.Season` | teams |
| `players` | `teams.Player` | teams |
| `games` | `games.Game` | games |
| `quarter_scores` | `games.QuarterScore` | games |
| `plays` | `snaps.Play` | snaps |
| `snaps` | `snaps.BaseSnap` (polymorphic base) | snaps |
| `snaps_offense` | `snaps.OffenseSnap` | snaps |
| `snaps_offense_run` | `snaps.RunPlay` | snaps |
| `snaps_offense_pass` | `snaps.PassPlay` | snaps |
| `snaps_defense` | `snaps.DefenseSnap` | snaps |
| `snaps_defense_assists` | `snaps.DefenseSnapAssist` | snaps |
| `snaps_special_teams` | `snaps.SpecialTeamsSnap` | snaps |
| `snaps_st_punt` | `snaps.PuntSnap` | snaps |
| `snaps_st_punt_return` | `snaps.PuntReturnSnap` | snaps |
| `snaps_st_kickoff` | `snaps.KickoffSnap` | snaps |
| `snaps_st_kickoff_return` | `snaps.KickoffReturnSnap` | snaps |
| `snaps_st_field_goal` | `snaps.FieldGoalSnap` | snaps |
| `snaps_st_extra_point` | `snaps.ExtraPointSnap` | snaps |

---

## Model Definitions

### `User` — `apps/accounts/models.py`

Extends `AbstractUser` (username, email, password, first_name, last_name, is_staff, etc.).

| Field | Type | Notes |
|-------|------|-------|
| `team` | FK → Team | `SET_NULL`, `null=True`, `blank=True` |

```python
# Pseudocode
class User(AbstractUser):
    team = FK(Team, SET_NULL, null=True, blank=True)
```

---

### `Team` — `apps/teams/models.py`

| Field | Type | Constraints |
|-------|------|-------------|
| `name` | CharField(100) | |
| `abbreviation` | CharField(10) | **unique** |
| `created_at` | DateTimeField | auto (TimeStampedModel) |
| `updated_at` | DateTimeField | auto |

No `city`, `state`, or any other fields. Only `name` and `abbreviation`.

---

### `Season` — `apps/teams/models.py`

| Field | Type | Constraints |
|-------|------|-------------|
| `year` | PositiveSmallIntegerField | |
| `team` | FK → Team | CASCADE |
| `created_at` / `updated_at` | DateTimeField | auto |

- `unique_together = [["year", "team"]]`
- Default ordering: `["-year"]` (most recent first)
- **No** `is_current`, `start_date`, `end_date`, or `name` fields

---

### `Player` — `apps/teams/models.py`

| Field | Type | Constraints / Notes |
|-------|------|---------------------|
| `first_name` | CharField(50) | |
| `last_name` | CharField(50) | |
| `position` | CharField(3) | TextChoices (see below) |
| `number` | PositiveSmallIntegerField | |
| `team` | FK → Team | CASCADE |
| `is_active` | BooleanField | default=True |

**Position choices:** `QB`, `RB`, `FB`, `WR`, `TE`, `OL`, `DL`, `LB`, `CB`, `S`, `K`, `P`, `LS`

**Indexes:**
- `[team, is_active]`
- `[last_name, first_name]`

**No** `class_year`, `height`, `weight`, `jersey_color`, or any other physical attributes.

---

### `Game` — `apps/games/models.py`

| Field | Type | Constraints / Notes |
|-------|------|---------------------|
| `season` | FK → Season | CASCADE — **no direct team FK** |
| `date` | DateField | |
| `opponent` | CharField(100) | |
| `location` | CharField(10) | Choices: `home`, `away`, `neutral` |
| `weather` | CharField(10) | Choices: `clear`, `rainy`, `snowy`, `windy`, `hot`, `cold` |
| `field_condition` | CharField(10) | Choices: `turf`, `grass`, `wet` |
| `team_score` | PositiveSmallIntegerField | default=0; updated by tracker |
| `opponent_score` | PositiveSmallIntegerField | default=0 |
| `notes` | TextField | blank |

**Properties:**

```python
# Pseudocode
@property
def result(self):
    if team_score > opponent_score: return 'W'
    if team_score < opponent_score: return 'L'
    return 'T'

@property def is_win(self): return team_score > opponent_score
@property def is_loss(self): return team_score < opponent_score
@property def is_tie(self): return team_score == opponent_score
```

**Critical:** Access team via `game.season.team`. `Game.objects.filter(season__team=team)` — not `filter(team=team)`.

---

### `QuarterScore` — `apps/games/models.py`

| Field | Type | Notes |
|-------|------|-------|
| `game` | FK → Game | CASCADE, `related_name='quarter_scores'` |
| `quarter` | PositiveSmallIntegerField | 1–4, 5+ for OT |
| `team_score` | PositiveSmallIntegerField | Points scored this quarter |
| `opponent_score` | PositiveSmallIntegerField | |

---

### `Play` — `apps/snaps/models/base.py`

Reference table for named play/formation names (e.g., "I-Formation", "4-3 Defense").

| Field | Type | Notes |
|-------|------|-------|
| `name` | CharField(100) | |
| `unit_type` | CharField(3) | Choices: `OFF`, `DEF`, `ST` |
| `description` | TextField | blank |

---

### `BaseSnap` — `apps/snaps/models/base.py`

Polymorphic base for all snap types. `db_table = "snaps"`.

| Field | Type | Notes |
|-------|------|-------|
| `game` | FK → Game | CASCADE, `related_name='snaps'` |
| `sequence_number` | PositiveIntegerField | Play order within game (1, 2, 3…) |
| `quarter` | PositiveSmallIntegerField | |
| `game_clock` | DurationField | nullable — time remaining in quarter |
| `down` | PositiveSmallIntegerField | nullable (kickoffs, PATs have no down) |
| `distance` | PositiveSmallIntegerField | nullable — yards to first down |
| `ball_position` | SmallIntegerField | nullable — see coordinate system below |
| `formation` | CharField(50) | blank |
| `play_called` | FK → Play | SET_NULL, nullable |
| `notes` | TextField | blank |

**Ordering:** `["game", "sequence_number"]`

**Indexes:** `[game, quarter]`, `[game, sequence_number]`

**Ball position coordinate system:**
```
-50        -25         0         +25        +50
 |          |          |          |          |
Own        Own        50yd      Opp        Opp
goal       25yd       line      25yd       goal
line
```
- Negative = own territory
- Positive = opponent territory
- `0` = 50-yard line
- Display: `_ball_pos_display(-25)` → `"OWN 25"`, `_ball_pos_display(30)` → `"OPP 20"`, `_ball_pos_display(0)` → `"50"`

---

### `OffenseSnap` — `apps/snaps/models/offense.py`

Extends `BaseSnap`. `db_table = "snaps_offense"`.

| Field | Type | Notes |
|-------|------|-------|
| `play_result` | CharField(10) | Choices: `RUN`, `PASS`, `SACK`, `PENALTY`, `KNEEL`, `SPIKE` |
| `had_penalty` | BooleanField | default=False |
| `penalty_player` | FK → Player | SET_NULL, nullable |
| `penalty_yards` | SmallIntegerField | nullable |
| `penalty_description` | CharField(100) | blank |

---

### `RunPlay` — `apps/snaps/models/offense.py`

Extends `OffenseSnap`. `db_table = "snaps_offense_run"`.

| Field | Type | Notes |
|-------|------|-------|
| `ball_carrier` | FK → Player | SET_NULL, `related_name='rushing_attempts'` |
| `yards_gained` | SmallIntegerField | default=0 |
| `is_touchdown` | BooleanField | default=False |
| `is_first_down` | BooleanField | default=False |
| `fumbled` | BooleanField | default=False |
| `fumble_lost` | BooleanField | default=False — True if opponent recovered |
| `fumble_recovered_by` | FK → Player | SET_NULL, nullable |

```python
# Pseudocode
def save(self):
    self.play_result = OffenseSnap.PlayResult.RUN  # always forced
    super().save()
```

---

### `PassPlay` — `apps/snaps/models/offense.py`

Extends `OffenseSnap`. `db_table = "snaps_offense_pass"`.

| Field | Type | Notes |
|-------|------|-------|
| `quarterback` | FK → Player | SET_NULL, `related_name='pass_attempts'` |
| `target` | FK → Player | SET_NULL, nullable — intended receiver (incomplete) |
| `receiver` | FK → Player | SET_NULL, nullable — actual catcher |
| `is_complete` | BooleanField | default=False |
| `yards_gained` | SmallIntegerField | default=0 |
| `air_yards` | SmallIntegerField | default=0 — distance ball traveled in air |
| `yards_after_catch` | SmallIntegerField | default=0 — YAC |
| `is_touchdown` | BooleanField | default=False |
| `is_first_down` | BooleanField | default=False |
| `is_interception` | BooleanField | default=False |
| `is_thrown_away` | BooleanField | default=False |
| `was_under_pressure` | BooleanField | default=False |
| `was_sacked` | BooleanField | default=False |
| `sack_yards` | SmallIntegerField | default=0 — yards lost (negative number) |
| `fumbled` | BooleanField | default=False |
| `fumble_lost` | BooleanField | default=False |

```python
# Pseudocode
def save(self):
    self.play_result = SACK if self.was_sacked else PASS
    super().save()
```

---

### `DefenseSnap` — `apps/snaps/models/defense.py`

Extends `BaseSnap`. `db_table = "snaps_defense"`.

| Field | Type | Notes |
|-------|------|-------|
| `play_result` | CharField(10) | Choices (see below) |
| `secondary_formation` | CharField(50) | blank — defensive backfield alignment |
| `primary_player` | FK → Player | SET_NULL, nullable, `related_name='defense_primary_plays'` |
| `tackle_yards` | SmallIntegerField | nullable — yards gained by offense |
| `tackle_for_loss` | BooleanField | default=False |
| `opponent_play_type` | CharField(10) | blank, default='' — choices: RUN/PASS/PUNT/FG/KICKOFF |
| `applied_pressure` | BooleanField | default=False |
| `forced_incompletion` | BooleanField | default=False |
| `interception_return_yards` | SmallIntegerField | nullable |
| `fumble_return_yards` | SmallIntegerField | nullable |
| `is_defensive_touchdown` | BooleanField | default=False |
| `penalty_player` | FK → Player | SET_NULL, nullable, `related_name='defense_penalties'` |
| `penalty_yards` | SmallIntegerField | nullable |
| `penalty_description` | CharField(100) | blank |

**`PlayResult` choices:**

| Value | Display |
|-------|---------|
| `TACKLE` | Tackle |
| `TFL` | Tackle for Loss |
| `SACK` | Sack |
| `INT` | Interception |
| `FREC` | Fumble Recovery |
| `PD` | Pass Defended |
| `PENALTY` | Penalty |

**`OpponentPlayType` choices** *(added in migration 0002)*:

| Value | Display |
|-------|---------|
| `RUN` | Run |
| `PASS` | Pass |
| `PUNT` | Punt |
| `FG` | Field Goal |
| `KICKOFF` | Kickoff |

---

### `DefenseSnapAssist` — `apps/snaps/models/defense.py`

Tracks shared tackles, sack assists, etc. `db_table = "snaps_defense_assists"`.

| Field | Type | Notes |
|-------|------|-------|
| `snap` | FK → DefenseSnap | CASCADE, `related_name='assists'` |
| `player` | FK → Player | CASCADE, `related_name='defense_assists'` |
| `assist_type` | CharField(10) | Choices: `TACKLE`, `SACK`, `COV` |

`unique_together = [["snap", "player", "assist_type"]]`

---

### `SpecialTeamsSnap` — `apps/snaps/models/special_teams.py`

Extends `BaseSnap`. `db_table = "snaps_special_teams"`. Adds shared penalty fields only:

| Field | Type |
|-------|------|
| `penalty_player` | FK → Player, SET_NULL |
| `penalty_yards` | SmallIntegerField, nullable |
| `penalty_description` | CharField(100), blank |

---

### `PuntSnap` — `db_table = "snaps_st_punt"`

| Field | Type | Notes |
|-------|------|-------|
| `punter` | FK → Player | SET_NULL |
| `punt_yards` | PositiveSmallIntegerField | default=0 |
| `hang_time` | DurationField | nullable |
| `is_blocked` | BooleanField | default=False |
| `is_touchback` | BooleanField | default=False |
| `out_of_bounds` | BooleanField | default=False |
| `downed_at_yard_line` | SmallIntegerField | nullable |

---

### `PuntReturnSnap` — `db_table = "snaps_st_punt_return"`

| Field | Type | Notes |
|-------|------|-------|
| `returner` | FK → Player | SET_NULL |
| `return_yards` | SmallIntegerField | default=0 |
| `is_fair_catch` | BooleanField | default=False |
| `is_touchdown` | BooleanField | default=False |
| `fumbled` / `fumble_lost` | BooleanField | |
| `tackler` | FK → Player | SET_NULL, nullable |

---

### `KickoffSnap` — `db_table = "snaps_st_kickoff"`

| Field | Type | Notes |
|-------|------|-------|
| `kicker` | FK → Player | SET_NULL |
| `kick_yards` | PositiveSmallIntegerField | default=0 |
| `is_touchback` | BooleanField | default=False |
| `is_onside_kick` | BooleanField | default=False |
| `onside_recovered` | BooleanField | default=False |
| `out_of_bounds` | BooleanField | default=False |

---

### `KickoffReturnSnap` — `db_table = "snaps_st_kickoff_return"`

| Field | Type | Notes |
|-------|------|-------|
| `returner` | FK → Player | SET_NULL |
| `return_yards` | SmallIntegerField | default=0 |
| `is_touchdown` | BooleanField | default=False |
| `fumbled` / `fumble_lost` | BooleanField | |
| `tackler` | FK → Player | SET_NULL, nullable |

---

### `FieldGoalSnap` — `db_table = "snaps_st_field_goal"`

| Field | Type | Notes |
|-------|------|-------|
| `kicker` | FK → Player | SET_NULL |
| `holder` | FK → Player | SET_NULL, nullable |
| `kick_distance` | PositiveSmallIntegerField | **NOT** `distance` — avoids shadowing `BaseSnap.distance` |
| `result` | CharField(10) | Choices: `GOOD`, `MISS`, `BLOCK` |

---

### `ExtraPointSnap` — `db_table = "snaps_st_extra_point"`

| Field | Type | Notes |
|-------|------|-------|
| `attempt_type` | CharField(10) | Choices: `KICK`, `2PT_RUN`, `2PT_PASS` |
| `result` | CharField(10) | Choices: `GOOD`, `MISS`, `BLOCK`, `FAIL` |
| `kicker` | FK → Player | SET_NULL, nullable (for KICK attempts) |
| `ball_carrier` | FK → Player | SET_NULL, nullable (for 2PT_RUN) |
| `passer` | FK → Player | SET_NULL, nullable (for 2PT_PASS) |
| `receiver` | FK → Player | SET_NULL, nullable (for 2PT_PASS) |

---

## Migrations

| App | Migration | Description |
|-----|-----------|-------------|
| accounts | 0001_initial | Create users table |
| teams | 0001_initial | Create teams, seasons, players tables |
| teams | 0002_seed_default_season | RunPython: create Season(year=2025) for first team if exists |
| games | 0001_initial | Create games, quarter_scores tables |
| snaps | 0001_initial | Create all snap tables (snaps, snaps_offense, snaps_offense_run, snaps_offense_pass, snaps_defense, snaps_defense_assists, snaps_special_teams, snaps_st_*) |
| snaps | 0002_defensesnap_opponent_play_type | AddField: `DefenseSnap.opponent_play_type` CharField(10, blank, default='') |

---

→ Next: [03 — API](03-api.md)
