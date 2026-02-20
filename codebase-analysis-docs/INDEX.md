# SportsMan — Codebase Index

> **Last Updated:** 2026-02-17
> **Branch:** `live-tracker-fix`
> **Status:** 95+ tests passing, 85–90% feature complete

This is the master reference for the SportsMan codebase. Every project file is listed below with an inline pseudocode annotation. Topic-specific docs are in this same folder.

---

## Documentation Map

| File | Contents |
|------|----------|
| **INDEX.md** ← *you are here* | Full annotated file tree |
| [01-architecture.md](01-architecture.md) | System design, request flow, auth, settings |
| [02-data-models.md](02-data-models.md) | All models, fields, constraints, ERD |
| [03-api.md](03-api.md) | REST API endpoints, ViewSets, serializers |
| [04-frontend-views.md](04-frontend-views.md) | Django HTML views, templates, URL namespaces |
| [05-tracker.md](05-tracker.md) | Live tracker deep dive (backend + JS state machine) |
| [06-report-services.md](06-report-services.md) | Report service layer, aggregation patterns |
| [07-testing.md](07-testing.md) | Test structure, fixtures, factories, coverage |
| [08-deployment.md](08-deployment.md) | Docker, Nginx, settings hierarchy, env vars |
| [09-gotchas.md](09-gotchas.md) | Known pitfalls, naming warnings, quirks |
| [ARCHITECT_REVIEW_2026-02-17.md](ARCHITECT_REVIEW_2026-02-17.md) | Production readiness assessment |

---

## Annotated File Tree

```
SportsMan/
│
│  # ── Project root ──────────────────────────────────────────────────────────
│
├── manage.py                    # $ python manage.py <cmd> — Django CLI entry point
├── Dockerfile                   # FROM python:3.12-slim → COPY requirements/ → pip install base.txt
│                                # → COPY . → ENTRYPOINT docker-entrypoint.sh
├── docker-compose.yml           # services: db (postgres:16-alpine) + web (gunicorn)
│                                #           + nginx (port 80, proxy_pass web:8000)
├── docker-entrypoint.sh         # python manage.py migrate --noinput
│                                # python manage.py collectstatic --noinput
│                                # exec gunicorn sportsman.wsgi --bind 0.0.0.0:8000 --workers 3
├── nginx.conf                   # upstream web { server web:8000 }
│                                # /static/ → alias /static/; expires 30d; immutable
│                                # /media/  → alias /media/;  expires 7d
│                                # /        → proxy_pass http://web; gzip on; 60s timeout
├── pytest.ini                   # [pytest] DJANGO_SETTINGS_MODULE=sportsman.settings.test
│                                # python_files=test_*.py; addopts=--tb=short
├── .env.example                 # Template: SECRET_KEY, DB_HOST/NAME/USER/PASSWORD,
│                                #   ALLOWED_HOSTS, DEBUG, CORS_ALLOWED_ORIGINS
├── .gitignore                   # venv/, __pycache__/, *.pyc, .env, staticfiles/, db.sqlite3
├── nul                          # Windows artifact (accidental NUL device redirect) — safe to ignore
│
├── requirements/
│   ├── base.txt                 # Django>=5.0 | djangorestframework>=3.14 | psycopg[binary]>=3.1
│   │                            # simplejwt>=5.3 | django-filter>=23.5 | drf-spectacular>=0.27
│   │                            # django-cors-headers>=4.3 | django-polymorphic>=3.1
│   │                            # gunicorn>=21.2 | whitenoise>=6.6
│   └── production.txt           # Additional production-only deps (extend base.txt)
│
│  # ── Apps ─────────────────────────────────────────────────────────────────
│
├── apps/
│   │
│   ├── core/                    # Shared utilities used by all other apps
│   │   ├── __init__.py
│   │   ├── apps.py              # CoreConfig(AppConfig)
│   │   ├── models.py            # class TimeStampedModel(models.Model):
│   │   │                        #   created_at = AutoField; updated_at = AutoField; Meta: abstract=True
│   │   ├── pagination.py        # class StandardPagination(PageNumberPagination):
│   │   │                        #   page_size=25; max_page_size=100; page_size_query_param='page_size'
│   │   │                        # class MobilePagination: page_size=15; max=50
│   │   │                        # class SnapCursorPagination(CursorPagination):
│   │   │                        #   ordering='-sequence_number'; page_size=50
│   │   ├── health.py            # def health_check(request):
│   │   │                        #   try: db.cursor().execute("SELECT 1") → {status: healthy, db: ok}
│   │   │                        #   except: → HTTP 503 {status: unhealthy, db: error_msg}
│   │   ├── exceptions.py        # def custom_exception_handler(exc, context):
│   │   │                        #   → call DRF exception_handler → wrap in RFC 9457 Problem Details:
│   │   │                        #     {type: "about:blank", status, title, detail, instance: path}
│   │   │                        #   ValidationError → also include `errors` dict with field messages
│   │   │                        #   500+ → logger.error; 400+ → logger.warning
│   │   │                        # class BusinessLogicError(APIException): status_code=422
│   │   ├── permissions.py       # class IsTeamMember(BasePermission):
│   │   │                        #   has_object_permission → check obj.team / obj.season.team / obj.game.season.team
│   │   │                        #   == request.user.team
│   │   │                        # class IsAdminOrReadOnly: SAFE_METHODS → is_authenticated; else is_staff
│   │   └── urls.py              # path('health/', health_check, name='health_check')
│   │
│   ├── accounts/                # User management (custom User model + JWT auth endpoints)
│   │   ├── __init__.py
│   │   ├── apps.py              # AccountsConfig
│   │   ├── models.py            # class User(AbstractUser):
│   │   │                        #   team = FK(Team, SET_NULL, null=True, blank=True)
│   │   │                        # AUTH_USER_MODEL = "accounts.User"
│   │   ├── serializers.py       # UserSerializer(fields: id,username,email,team)
│   │   │                        # UserCreateSerializer(+ password, validate_password())
│   │   │                        # ChangePasswordSerializer(old_password, new_password, validate)
│   │   ├── views.py             # RegisterView(CreateAPIView): POST /auth/register/
│   │   │                        # ProfileView(RetrieveUpdateAPIView): GET/PATCH /auth/profile/
│   │   │                        # ChangePasswordView(UpdateAPIView): POST /auth/change-password/
│   │   ├── urls.py              # token/ → TokenObtainPairView (JWT obtain)
│   │   │                        # token/refresh/ → TokenRefreshView
│   │   │                        # register/ → RegisterView
│   │   │                        # profile/ → ProfileView
│   │   │                        # change-password/ → ChangePasswordView
│   │   └── admin.py             # admin.site.register(User, UserAdmin)
│   │
│   ├── teams/                   # Teams, seasons, and player roster management
│   │   ├── __init__.py
│   │   ├── apps.py              # TeamsConfig
│   │   ├── models.py            # class Team(TimeStampedModel): name, abbreviation(unique)
│   │   │                        # class Season(TimeStampedModel): year, team(FK); unique(year,team)
│   │   │                        # class Player(TimeStampedModel):
│   │   │                        #   first_name, last_name, position(TextChoices: QB/RB/FB/WR/TE/OL/DL/LB/CB/S/K/P/LS)
│   │   │                        #   number, team(FK), is_active; indexes: [team,active], [last,first]
│   │   ├── serializers.py       # TeamSerializer, TeamMinimalSerializer
│   │   │                        # SeasonSerializer
│   │   │                        # PlayerSerializer, PlayerMinimalSerializer
│   │   ├── views.py             # TeamViewSet(ModelViewSet):
│   │   │                        #   @action players(pk) → Player.objects.filter(team=team)
│   │   │                        #   @action seasons(pk) → Season.objects.filter(team=team)
│   │   │                        # SeasonViewSet(ModelViewSet)
│   │   │                        # PlayerViewSet(ModelViewSet):
│   │   │                        #   @action by_position(position) → filter(team=user.team, position=pos)
│   │   ├── filters.py           # TeamFilter: search name/abbr
│   │   │                        # SeasonFilter: team, year
│   │   │                        # PlayerFilter: team, position, is_active, search(name/number)
│   │   ├── urls.py              # (empty — registered via DRF router in api/v1/urls.py)
│   │   ├── admin.py             # Team, Season, Player admin registrations
│   │   └── migrations/
│   │       ├── 0001_initial.py              # CREATE TABLE teams, seasons, players
│   │       └── 0002_seed_default_season.py  # RunPython: if Team.exists() → Season(year=2025, team=first_team)
│   │
│   ├── games/                   # Game and quarter score management
│   │   ├── __init__.py
│   │   ├── apps.py              # GamesConfig
│   │   ├── models.py            # class Game(TimeStampedModel):
│   │   │                        #   season(FK), date, opponent, location(home/away/neutral),
│   │   │                        #   weather(clear/rainy/snowy/windy/hot/cold),
│   │   │                        #   field_condition(turf/grass/wet),
│   │   │                        #   team_score=0, opponent_score=0, notes
│   │   │                        #   @property result → 'W'/'L'/'T'
│   │   │                        #   @property is_win/is_loss/is_tie → bool
│   │   │                        # class QuarterScore(models.Model):
│   │   │                        #   game(FK), quarter, team_score, opponent_score
│   │   ├── serializers.py       # GameReadSerializer(nested team/season)
│   │   │                        # GameWriteSerializer(accepts season_id directly)
│   │   │                        # QuarterScoreSerializer
│   │   ├── views.py             # GameViewSet(ModelViewSet):
│   │   │                        #   get_serializer_class → Read vs Write based on method
│   │   │                        #   @action quarter_scores(pk) → list/create QuarterScore
│   │   │                        #   @action summary(pk) → {game, scores, record}
│   │   │                        # QuarterScoreViewSet(ModelViewSet)
│   │   ├── filters.py           # GameFilter: season, location, date_range
│   │   │                        #   result filter → annotate win/loss then filter
│   │   ├── urls.py              # (empty — registered via DRF router)
│   │   ├── admin.py             # GameAdmin with QuarterScoreInline
│   │   └── migrations/
│   │       └── 0001_initial.py  # CREATE TABLE games, quarter_scores
│   │
│   ├── snaps/                   # Play-by-play recording (polymorphic model hierarchy)
│   │   ├── __init__.py
│   │   ├── apps.py              # SnapsConfig
│   │   ├── models/
│   │   │   ├── __init__.py      # from .base import Play, BaseSnap
│   │   │   │                    # from .offense import OffenseSnap, RunPlay, PassPlay
│   │   │   │                    # from .defense import DefenseSnap, DefenseSnapAssist
│   │   │   │                    # from .special_teams import SpecialTeamsSnap, PuntSnap,
│   │   │   │                    #   PuntReturnSnap, KickoffSnap, KickoffReturnSnap,
│   │   │   │                    #   FieldGoalSnap, ExtraPointSnap
│   │   │   ├── base.py          # class Play(TimeStampedModel):
│   │   │   │                    #   name, unit_type(OFF/DEF/ST), description
│   │   │   │                    # class BaseSnap(PolymorphicModel, TimeStampedModel):
│   │   │   │                    #   game(FK→Game), sequence_number, quarter, game_clock(Duration)
│   │   │   │                    #   down(nullable), distance(nullable), ball_position(-50..+50)
│   │   │   │                    #   formation, play_called(FK→Play), notes
│   │   │   │                    #   db_table="snaps"; ordering=[game,sequence_number]
│   │   │   │                    #   indexes: [game,quarter], [game,sequence_number]
│   │   │   ├── offense.py       # class OffenseSnap(BaseSnap):
│   │   │   │                    #   play_result(RUN/PASS/SACK/PENALTY/KNEEL/SPIKE)
│   │   │   │                    #   had_penalty, penalty_player(FK), penalty_yards, penalty_description
│   │   │   │                    # class RunPlay(OffenseSnap):  db_table="snaps_offense_run"
│   │   │   │                    #   ball_carrier(FK), yards_gained, is_touchdown, is_first_down
│   │   │   │                    #   fumbled, fumble_lost, fumble_recovered_by(FK)
│   │   │   │                    #   save() → forces play_result=RUN
│   │   │   │                    # class PassPlay(OffenseSnap):  db_table="snaps_offense_pass"
│   │   │   │                    #   quarterback(FK), target(FK), receiver(FK)
│   │   │   │                    #   is_complete, yards_gained, air_yards, yards_after_catch
│   │   │   │                    #   is_touchdown, is_first_down, is_interception, is_thrown_away
│   │   │   │                    #   was_under_pressure, was_sacked, sack_yards, fumbled, fumble_lost
│   │   │   │                    #   save() → was_sacked? SACK : PASS
│   │   │   ├── defense.py       # class DefenseSnap(BaseSnap):  db_table="snaps_defense"
│   │   │   │                    #   PlayResult TextChoices: TACKLE/TFL/SACK/INT/FREC/PD/PENALTY
│   │   │   │                    #   OpponentPlayType TextChoices: RUN/PASS/PUNT/FG/KICKOFF
│   │   │   │                    #   play_result, secondary_formation
│   │   │   │                    #   primary_player(FK→Player), tackle_yards, tackle_for_loss
│   │   │   │                    #   opponent_play_type(blank, default='')
│   │   │   │                    #   applied_pressure, forced_incompletion
│   │   │   │                    #   interception_return_yards, fumble_return_yards, is_defensive_touchdown
│   │   │   │                    #   penalty_player(FK), penalty_yards, penalty_description
│   │   │   │                    # class DefenseSnapAssist(models.Model):
│   │   │   │                    #   snap(FK→DefenseSnap), player(FK→Player)
│   │   │   │                    #   assist_type(TACKLE/SACK/COV); unique(snap,player,assist_type)
│   │   │   └── special_teams.py # class SpecialTeamsSnap(BaseSnap):  db_table="snaps_special_teams"
│   │   │                        #   penalty_player(FK), penalty_yards, penalty_description
│   │   │                        # class PuntSnap(SpecialTeamsSnap):  db_table="snaps_st_punt"
│   │   │                        #   punter(FK), punt_yards, hang_time, is_blocked, is_touchback,
│   │   │                        #   out_of_bounds, downed_at_yard_line
│   │   │                        # class PuntReturnSnap(SpecialTeamsSnap):  db_table="snaps_st_punt_return"
│   │   │                        #   returner(FK), return_yards, is_fair_catch, is_touchdown,
│   │   │                        #   fumbled, fumble_lost, tackler(FK)
│   │   │                        # class KickoffSnap(SpecialTeamsSnap):  db_table="snaps_st_kickoff"
│   │   │                        #   kicker(FK), kick_yards, is_touchback, is_onside_kick,
│   │   │                        #   onside_recovered, out_of_bounds
│   │   │                        # class KickoffReturnSnap(SpecialTeamsSnap):  db_table="snaps_st_kickoff_return"
│   │   │                        #   returner(FK), return_yards, is_touchdown, fumbled, fumble_lost, tackler(FK)
│   │   │                        # class FieldGoalSnap(SpecialTeamsSnap):  db_table="snaps_st_field_goal"
│   │   │                        #   kicker(FK), holder(FK), kick_distance (NOT distance!), result(GOOD/MISS/BLOCK)
│   │   │                        # class ExtraPointSnap(SpecialTeamsSnap):  db_table="snaps_st_extra_point"
│   │   │                        #   attempt_type(KICK/2PT_RUN/2PT_PASS), result(GOOD/MISS/BLOCK/FAIL)
│   │   │                        #   kicker(FK), ball_carrier(FK), passer(FK), receiver(FK)
│   │   ├── serializers/
│   │   │   ├── __init__.py      # Re-exports all snap serializer classes
│   │   │   ├── offense.py       # RunPlayReadSerializer(nested player fields)
│   │   │   │                    # RunPlayWriteSerializer(accepts player IDs)
│   │   │   │                    # PassPlayReadSerializer, PassPlayWriteSerializer
│   │   │   ├── defense.py       # DefenseSnapReadSerializer, DefenseSnapWriteSerializer
│   │   │   │                    # DefenseSnapAssistSerializer(snap_id, player_id, assist_type)
│   │   │   └── special_teams.py # Read/Write serializer pairs for:
│   │   │                        #   PuntSnap, PuntReturnSnap, KickoffSnap, KickoffReturnSnap,
│   │   │                        #   FieldGoalSnap, ExtraPointSnap
│   │   ├── views.py             # RunPlayViewSet(ModelViewSet):
│   │   │                        #   @action by_carrier(carrier_id) → filter by ball_carrier
│   │   │                        # PassPlayViewSet:
│   │   │                        #   @action by_quarterback(qb_id), by_receiver(receiver_id)
│   │   │                        # DefenseSnapViewSet:
│   │   │                        #   @action add_assist(pk) → POST DefenseSnapAssist
│   │   │                        # PuntSnapViewSet, KickoffSnapViewSet,
│   │   │                        # FieldGoalSnapViewSet, ExtraPointSnapViewSet (standard CRUD)
│   │   ├── filters.py           # RunPlayFilter: game, quarter, ball_carrier, is_touchdown
│   │   │                        # PassPlayFilter: game, quarter, quarterback, receiver, is_complete
│   │   │                        # DefenseSnapFilter: game, quarter, primary_player, play_result
│   │   │                        # ST filters per snap type
│   │   ├── urls.py              # (empty — registered via DRF router)
│   │   ├── admin.py             # Inline and standalone admin for all snap types
│   │   └── migrations/
│   │       ├── 0001_initial.py                         # CREATE TABLE snaps, snaps_offense,
│   │       │                                           #   snaps_offense_run, snaps_offense_pass,
│   │       │                                           #   snaps_defense, snaps_defense_assists,
│   │       │                                           #   snaps_special_teams, snaps_st_*
│   │       └── 0002_defensesnap_opponent_play_type.py  # AddField DefenseSnap.opponent_play_type
│   │                                                   #   CharField(max_length=10, blank=True, default='')
│   │
│   ├── reports/                 # Statistical aggregation service layer + API views
│   │   ├── __init__.py
│   │   ├── apps.py              # ReportsConfig
│   │   ├── services/
│   │   │   ├── __init__.py      # from .offense import OffenseReportService
│   │   │   │                    # from .defense import DefenseReportService
│   │   │   │                    # from .special_teams import SpecialTeamsReportService
│   │   │   ├── base.py          # class BaseReportService:
│   │   │   │                    #   __init__(game_ids, season_id, team_id):
│   │   │   │                    #     self.filters = Q()
│   │   │   │                    #     if game_ids: filters &= Q(game_id__in=game_ids)
│   │   │   │                    #     if season_id: filters &= Q(game__season_id=season_id)
│   │   │   │                    #     if team_id: filters &= Q(game__season__team_id=team_id)
│   │   │   ├── offense.py       # class OffenseReportService(BaseReportService):
│   │   │   │                    #   get_rushing_totals() → aggregate(attempts, yards, tds, 1sts,
│   │   │   │                    #     fumbles, longest, avg) from RunPlay.filter(filters)
│   │   │   │                    #   get_rushing_by_player() → values(player).annotate(above) + short/long/explosive
│   │   │   │                    #   get_passing_totals() → aggregate(attempts, completions, yards,
│   │   │   │                    #     tds, ints, sacks, air_yards, yac) from PassPlay.filter(filters)
│   │   │   │                    #   get_passing_by_quarterback() → per-QB with passer_rating calc
│   │   │   │                    #   get_receiving_by_player() → values(receiver).annotate(rec, yards, tds, yac)
│   │   │   │                    #   _calculate_passer_rating(a,c,y,td,int) → NFL formula (0–158.3)
│   │   │   ├── defense.py       # class DefenseReportService(BaseReportService):
│   │   │   │                    #   get_team_totals() → aggregate tackles, tfl, sacks, ints, frec,
│   │   │   │                    #     pd, pressures, forced_incompletions, def_tds, return yards
│   │   │   │                    #   get_player_summary() → values(player).annotate(per-play-result counts)
│   │   │   │                    #   get_player_assists() → DefenseSnapAssist values(player).annotate(by type)
│   │   │   └── special_teams.py # class SpecialTeamsReportService(BaseReportService):
│   │   │                        #   get_punt_totals() → aggregate yards, avg, longest, touchbacks, blocked
│   │   │                        #   get_punt_by_punter() → values(punter).annotate(above)
│   │   │                        #   get_kickoff_totals() → aggregate yards, touchbacks, onside attempts
│   │   │                        #   get_field_goal_totals() → aggregate attempts, made, missed, blocked, %, longest
│   │   │                        #   get_field_goal_by_kicker() → values(kicker).annotate(above)
│   │   │                        #   get_extra_point_totals() → aggregate by attempt_type and result
│   │   ├── serializers.py       # Output-only serializers for each report data shape
│   │   │                        #   (not DRF model serializers — just field declarations for docs)
│   │   ├── views.py             # RushingTotalsView, RushingByPlayerView
│   │   │                        # PassingTotalsView, PassingByQBView, ReceivingByPlayerView
│   │   │                        # DefenseTotalsView, DefenseByPlayerView
│   │   │                        # PuntTotalsView, FieldGoalTotalsView, FieldGoalByKickerView
│   │   │                        # Each: GET → init service → call method → Response(data)
│   │   └── urls.py              # offense/rushing/totals/, offense/rushing/players/
│   │                            # offense/passing/totals/, offense/passing/quarterbacks/
│   │                            # offense/receiving/players/
│   │                            # defense/totals/, defense/players/
│   │                            # special-teams/punting/totals/
│   │                            # special-teams/kicking/totals/, special-teams/kicking/kickers/
│   │
│   └── frontend/                # Server-rendered HTML interface (templates + views)
│       ├── __init__.py
│       ├── apps.py              # FrontendConfig
│       ├── views.py             # @login_required CRUD views:
│       │                        #   team_list, team_detail, team_create, team_edit
│       │                        #   player_list, player_detail, player_create, player_edit
│       │                        #   game_list, game_detail, game_create, game_edit
│       │                        #   game_plays (play-by-play log)
│       │                        #   season_list
│       │                        #   report_offense, report_defense, report_special_teams
│       │                        #   login_view, logout_view, register_view, profile_view, password_change_view
│       ├── dashboard.py         # @login_required def home(request):
│       │                        #   current_season = Season.order_by('-year').first()
│       │                        #   games_qs = Game.filter(season=current_season)
│       │                        #   stats: wins(team_score>opp_score.count), losses, points_for/against, total_plays
│       │                        #   quarter_trends: QuarterScore.values(quarter).annotate(avg_for,avg_against).order(quarter)
│       │                        #   current_streak: iterate team_games order(-date), count contiguous same result
│       │                        #   third_down_pct: RunPlay+PassPlay.filter(down=3) → conversions/attempts * 100
│       │                        #   red_zone_pct: snaps.filter(ball_position>=30) → tds/plays * 100
│       │                        #   alerts: sack_players with count>=2 | fumble_recovery_players count>=2
│       │                        #   → TemplateResponse('dashboard/home.html', context)
│       ├── tracker.py           # Live game tracker — see 05-tracker.md for full detail
│       │                        # def game_tracker(request, pk): render tracker page with game_state_data JSON
│       │                        # def compute_next_state(current_state, play_type, play_data, result_data):
│       │                        #   TD → {situation:extra_point}
│       │                        #   INT/fumble_lost → flip ball_pos, {situation:turnover}
│       │                        #   kickoff → {down:1,distance:10,ball_position:-25}
│       │                        #   punt → flip ball_pos by punt_yards
│       │                        #   field_goal GOOD → {situation:kickoff}; MISS → opponent ball
│       │                        #   extra_point → {situation:kickoff}
│       │                        #   penalty: apply yards, check auto_first_down / repeat_down
│       │                        #   normal: advance ball_pos, decrement distance, next down or 1st
│       │                        # AJAX endpoints (all @login_required @require_POST):
│       │                        #   tracker_add_run → RunPlay.create + update score if TD + compute_next_state
│       │                        #   tracker_add_pass → PassPlay.create + handle INT/TD/sack + score
│       │                        #   tracker_add_penalty → OffenseSnap.create (penalty only) + compute_next_state
│       │                        #   tracker_add_kickoff → KickoffSnap.create + compute_next_state
│       │                        #   tracker_add_punt → PuntSnap.create + compute_next_state
│       │                        #   tracker_add_field_goal → FieldGoalSnap.create + score if GOOD + state
│       │                        #   tracker_add_extra_point → ExtraPointSnap.create + score + kickoff state
│       │                        #   tracker_add_defense → DefenseSnap.create + advance ball for opponent
│       │                        #   tracker_update_score → Game.update_fields(['team_score','opponent_score'])
│       │                        #   tracker_undo_play → last snap.delete() + reverse score changes
│       │                        #   tracker_recent_plays → GET last 10 snaps as JSON
│       │                        #   tracker_coin_toss → return coin result
│       │                        #   tracker_defer_decision → determine possession from defer/play choice
│       ├── urls.py              # app_name='frontend'
│       │                        # teams/: team_list, team_detail, team_create, team_edit
│       │                        # players/: player_list, player_detail, player_create, player_edit
│       │                        # games/: game_list, game_detail, game_create, game_edit, game_plays
│       │                        # seasons/: season_list
│       │                        # reports/offense|defense|special-teams/
│       │                        # accounts/: login, logout, register, profile, change-password
│       ├── dashboard_urls.py    # app_name='dashboard'
│       │                        # path('', home, name='home')
│       ├── tracker_urls.py      # app_name='tracker'
│       │                        # games/<pk>/tracker/ → game_tracker (name='game_tracker')
│       │                        # games/<pk>/tracker/run/ → tracker_add_run
│       │                        # games/<pk>/tracker/pass/ → tracker_add_pass
│       │                        # games/<pk>/tracker/penalty/ → tracker_add_penalty
│       │                        # games/<pk>/tracker/kickoff/ → tracker_add_kickoff
│       │                        # games/<pk>/tracker/punt/ → tracker_add_punt
│       │                        # games/<pk>/tracker/field-goal/ → tracker_add_field_goal
│       │                        # games/<pk>/tracker/extra-point/ → tracker_add_extra_point
│       │                        # games/<pk>/tracker/defense/ → tracker_add_defense
│       │                        # games/<pk>/tracker/update-score/ → tracker_update_score
│       │                        # games/<pk>/tracker/undo/ → tracker_undo_play
│       │                        # games/<pk>/tracker/plays/ → tracker_recent_plays
│       │                        # games/<pk>/tracker/coin-toss/ → tracker_coin_toss
│       │                        # games/<pk>/tracker/defer/ → tracker_defer_decision
│       └── apps.py              # FrontendConfig(AppConfig)
│
│  # ── API routing ─────────────────────────────────────────────────────────
│
├── api/
│   ├── __init__.py
│   ├── urls.py                  # path('v1/', include('api.v1.urls'))
│   │                            # path('health/', include('apps.core.urls'))
│   │                            # path('schema/', SpectacularAPIView)
│   │                            # path('docs/', SpectacularSwaggerView)
│   └── v1/
│       ├── __init__.py
│       └── urls.py              # DefaultRouter → register:
│                                #   teams, seasons, players
│                                #   games, quarter-scores
│                                #   snaps/run, snaps/pass, snaps/defense
│                                #   snaps/punt, snaps/kickoff, snaps/field-goal, snaps/extra-point
│                                # path('reports/', include('apps.reports.urls'))
│                                # path('auth/', include('apps.accounts.urls'))
│
│  # ── Django project config ─────────────────────────────────────────────
│
├── sportsman/
│   ├── __init__.py
│   ├── urls.py                  # urlpatterns = [
│   │                            #   admin/ → admin.site.urls
│   │                            #   api/  → api.urls
│   │                            #   ""    → tracker_urls  (must be first! catches /games/<pk>/tracker/)
│   │                            #   ""    → dashboard_urls
│   │                            #   ""    → frontend.urls
│   │                            # ]  + DEBUG static file serving
│   ├── wsgi.py                  # application = get_wsgi_application() — used by gunicorn
│   ├── asgi.py                  # application = get_asgi_application() — future async support
│   └── settings/
│       ├── __init__.py
│       ├── base.py              # INSTALLED_APPS: django.*, rest_framework, jwt, filter, spectacular,
│       │                        #   corsheaders, polymorphic, whitenoise, core, accounts, teams,
│       │                        #   games, snaps, reports, frontend
│       │                        # MIDDLEWARE: WhiteNoise → Security → SessionMiddleware → CORS → ...
│       │                        # TEMPLATES: Django template engine, dirs=[BASE_DIR/templates]
│       │                        # STATIC_URL, STATICFILES_DIRS, STATIC_ROOT
│       │                        # REST_FRAMEWORK: default_authentication=[Session,JWT],
│       │                        #   EXCEPTION_HANDLER=apps.core.exceptions.custom_exception_handler
│       │                        #   DEFAULT_THROTTLE_CLASSES + rates: 100/hr anon, 1000/hr user
│       │                        # SIMPLE_JWT: ACCESS_TOKEN_LIFETIME=8h, REFRESH=30d, ROTATE=True
│       │                        # SPECTACULAR_SETTINGS: title/version/schema path
│       ├── development.py       # DEBUG=True; DATABASES=sqlite3; CORS_ALLOW_ALL=True
│       │                        # REST_FRAMEWORK browsable API renderer enabled
│       ├── local_network.py     # DEBUG=False (env override); DATABASES=PostgreSQL(env vars)
│       │                        # ALLOWED_HOSTS from env; SIMPLE_JWT tokens: 12h/30d
│       │                        # Throttle rates: 500/hr anon, 5000/hr user
│       ├── production.py        # Production cloud settings (extends local_network pattern)
│       └── test.py              # DATABASES=in-memory SQLite; PASSWORD_HASHERS=[MD5]
│                                # no throttling; no logging; STORAGES: StaticFilesStorage
│
│  # ── Templates ─────────────────────────────────────────────────────────
│
├── templates/
│   ├── base.html                # Bootstrap 5.3.2 dark theme master layout
│   │                            # {% block head_extra %} | {% block content %} | {% block scripts %}
│   │                            # flash messages (Django messages framework)
│   │                            # conditional footer hide on tracker page
│   ├── includes/
│   │   ├── navbar.html          # Responsive Bootstrap navbar: logo, nav-links, user dropdown
│   │   │                        # {% url 'frontend:team_list' %} etc.
│   │   ├── footer.html          # Minimal footer with project name and year
│   │   └── pagination.html      # Bootstrap pagination: prev/next + page numbers
│   ├── accounts/
│   │   ├── login.html           # Username+password form → POST → session login → redirect dashboard:home
│   │   ├── register.html        # Register form: username, email, password1, password2
│   │   └── profile.html         # Show user info (username, email, team) + link to change-password
│   ├── teams/
│   │   ├── list.html            # Paginated team card grid with abbreviation badge and player count
│   │   ├── detail.html          # Team name/abbr + roster grouped by position group (OFF/DEF/ST)
│   │   ├── form.html            # Create/edit team: name(required), abbreviation(required, max 10)
│   │   └── seasons.html         # Season list table for a team: year | W-L-T | Points For | Points Against
│   ├── players/
│   │   ├── list.html            # Player table with filter sidebar (team, position, name search)
│   │   ├── detail.html          # Player card (#number, position) + season rushing/passing/defense stats
│   │   └── form.html            # Create/edit player: first/last name, position select, number, team, active
│   ├── games/
│   │   ├── list.html            # Game schedule: date, opponent, location badge, W/L/T result badge
│   │   │                        # filter bar: season select, result filter, location filter
│   │   ├── detail.html          # Scoreboard: team_score vs opp_score + quarter score table
│   │   │                        # Leaders: top rusher/passer/receiver | link to tracker
│   │   ├── form.html            # Create/edit game: season(required), opponent, date, location, weather, field
│   │   ├── plays.html           # Play-by-play table for a game; filter by quarter tab
│   │   └── tracker.html         # Live game tracker SPA (extends base.html):
│   │                            #   scoreboard div, field visualization (#field-container),
│   │                            #   play type buttons (#play-type-buttons),
│   │                            #   special teams submenu, #form-area (dynamic form injection),
│   │                            #   #plays-feed (recent plays), coin toss modal on first load
│   │                            #   {% json_script game_state_data 'game-state-data' %} (XSS-safe)
│   │                            #   {% json_script players_data 'players-data' %}
│   ├── reports/
│   │   ├── offense.html         # Season filter → Rushing totals card + per-player table
│   │   │                        # Passing totals card + QB table + Receiving table
│   │   ├── defense.html         # Team defensive totals card + per-player table + assist breakdown
│   │   └── special_teams.html   # Punt totals | Kickoff totals | FG totals + kicker table | PAT totals
│   └── dashboard/
│       └── home.html            # Season stats bar (W-L, points, plays)
│                                # Recent games table
│                                # Coaching metrics section:
│                                #   Quarter scoring chart (Chart.js line chart via quarter_trends)
│                                #   Win/loss streak badge
│                                #   3rd-down conversion % | Red zone efficiency %
│                                #   Player alert cards (sacks, fumble recoveries ≥2)
│
│  # ── Static files ──────────────────────────────────────────────────────
│
├── static/
│   ├── css/
│   │   ├── style.css            # Global: custom dark theme variables, card styles, badge overrides,
│   │   │                        #   table row hover, form control dark variant, button touch targets
│   │   └── tracker.css          # Tracker-specific: #field-container (grid lines, hash marks, ball marker),
│   │                            #   .toggle-btn (active/inactive states), .scoreboard layout,
│   │                            #   .play-type-grid (button grid), .quick-yard-btn, .play-feed-item
│   └── js/
│       ├── app.js               # DOMContentLoaded:
│       │                        #   Touch feedback: click → .active for 150ms on .btn-touch elements
│       │                        #   Loading state: form submit → btn.disabled + "Loading..." text
│       └── tracker.js           # See 05-tracker.md for full detail (~1200 lines, IIFE)
│                                # State: {quarter, down, distance, ball_position, next_sequence,
│                                #   team_score, opponent_score, possession_team, currentForm, submitting}
│                                # postPlay(endpoint,data) → fetch POST → parse JSON →
│                                #   update state + scoreboard + addPlayToFeed + handle situations
│                                # showPlayForm(type) → buildXxxForm() → inject into #form-area
│                                # resetToPlayTypeSelection() → clear form + updatePossessionDisplay()
│                                # updatePossessionDisplay() → show offense or defense buttons based on possession_team
│                                # handleFormInteraction(e): toggle-btn click → toggle/radio logic
│                                #   quick-yard-btn → set input value + show/hide opponent-play-type-section
│                                # radioGroups: [fg_good/fg_miss/fg_block], [ep_good/ep_miss/ep_block],
│                                #   [def_tackle/def_sack/def_int/def_frec],
│                                #   [opp_run/opp_pass/opp_punt/opp_fg/opp_kickoff],
│                                #   [pen_accepted/pen_declined]
│                                # addPlayToFeed(summary,detail): prepend card to #plays-feed
│                                #   show +/- yards badge, TD badge, INT badge, FREC badge, DEF TD badge
│                                # undoLastPlay(): confirm → POST /undo/ → remove last feed item
│
│  # ── Tests ─────────────────────────────────────────────────────────────
│
├── tests/
│   ├── __init__.py
│   ├── conftest.py              # pytest fixtures:
│   │                            #   api_client() → APIClient()
│   │                            #   user(db) → UserFactory()
│   │                            #   authenticated_client(api_client,user) → force_authenticate
│   │                            #   team(db), season(team), player(team), game(season)
│   │                            #   team_with_players(db) → full 22-player roster (QB/RB/WR/TE/OL/DL/LB/CB/S/K/P)
│   │                            #   run_play(game,player), pass_play(game)
│   ├── factories/
│   │   ├── __init__.py          # Re-exports all factories
│   │   ├── accounts.py          # UserFactory(DjangoModelFactory): username=Sequence, password=make_password
│   │   ├── teams.py             # TeamFactory: name=Faker company, abbreviation=Sequence
│   │   │                        # SeasonFactory: year=2025, team=SubFactory(TeamFactory)
│   │   │                        # PlayerFactory: first/last=Faker, position='RB', number=Sequence
│   │   ├── games.py             # GameFactory: date=today, opponent=Faker, location='home',
│   │   │                        #   weather='clear', field_condition='turf'
│   │   └── snaps.py             # RunPlayFactory: sequence_number=1, quarter=1, down=1, distance=10
│   │                            #   ball_position=0, yards_gained=5
│   │                            # PassPlayFactory: is_complete=True, yards_gained=10
│   │                            # DefenseSnapFactory, PuntSnapFactory, KickoffSnapFactory,
│   │                            # FieldGoalSnapFactory, ExtraPointSnapFactory
│   ├── unit/
│   │   ├── test_models.py           # Team.__str__ | Season.__str__ | Player.__str__
│   │   │                            # Game.result(W/L/T) | Game.is_win/is_loss/is_tie
│   │   │                            # Player ordering by number
│   │   ├── test_services.py         # OffenseReportService: empty DB returns zeros
│   │   │                            # filtered by game_id returns correct player
│   │   ├── test_report_services.py  # Extended:
│   │   │                            #   rushing: totals, per-player, short/long/explosive
│   │   │                            #   passing: totals, per-QB passer_rating
│   │   │                            #   receiving: per-player
│   │   │                            #   defense: team totals, player summary, assists
│   │   │                            #   special_teams: FG %, punt avg, extra point totals
│   │   ├── test_snap_models.py      # All 13 snap types: create with required fields, __str__, defaults
│   │   ├── test_serializers.py      # RunPlayWriteSerializer: required ball_carrier, yards_gained
│   │   │                            # PassPlayWriteSerializer: required quarterback
│   │   │                            # GameWriteSerializer: required season, opponent, date
│   │   ├── test_dashboard_metrics.py# home() context has correct metrics:
│   │   │                            #   third_down_attempts=2, conversions=2, pct=100
│   │   │                            #   red_zone_plays>=1, red_zone_tds>=1
│   │   │                            #   alerts contains {type:'sacks'} for player with 2 sacks
│   │   └── test_exceptions.py       # custom_exception_handler(ValidationError) → RFC 9457 type,status=400,errors
│   │                                # BusinessLogicError → response.status_code=422
│   └── integration/
│       ├── test_api.py              # JWT auth: obtain token, use token for CRUD
│       │                            # Teams API: list, create, retrieve, update, delete
│       │                            # Players API: list, filter by position, by_position action
│       │                            # Games API: create, quarter_scores action
│       │                            # Snaps API: create run/pass/defense plays, filter
│       │                            # Reports API: rushing/passing/defense totals + player breakdowns
│       └── test_game_simulation.py  # Full drive simulations:
│                                    #   TD drive: 4-play run drive ending in touchdown → score +6
│                                    #   Turnover: interception → ball flipped, opponent possession
│                                    #   Blocked kick → opponent ball at spot
│                                    #   FG drive: 3rd-and-long → FG good → score +3
```

---

*For detailed documentation on any topic, see the linked files in the Documentation Map above.*
