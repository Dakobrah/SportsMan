# 04 — Frontend Views & Templates

← [03 — API](03-api.md) | Next: [05 — Live Tracker](05-tracker.md)

---

## Overview

The frontend is server-rendered Django templates using Bootstrap 5 dark theme. All views require session login (`@login_required`), redirecting unauthenticated users to `/accounts/login/`.

Three URL modules, three namespaces:

| Module | `app_name` | Handles |
|--------|------------|---------|
| `apps.frontend.tracker_urls` | `tracker` | Live game tracker + AJAX endpoints |
| `apps.frontend.dashboard_urls` | `dashboard` | Dashboard home (`/`) |
| `apps.frontend.urls` | `frontend` | All other CRUD + auth + reports |

---

## URL → View → Template Map

### Authentication

| URL | View | Template | Notes |
|-----|------|----------|-------|
| `/accounts/login/` | `login_view` | `accounts/login.html` | `AuthenticationForm`; redirect to `dashboard:home` on success |
| `/accounts/logout/` | `logout_view` | — | No method restriction; redirects to login |
| `/accounts/register/` | `register_view` | `accounts/register.html` | Creates User; logs in automatically |
| `/accounts/profile/` | `profile_view` | `accounts/profile.html` | Shows username, email, team |
| `/accounts/change-password/` | `password_change_view` | — | POST; on success → login; on failure/GET → profile |

### Dashboard

| URL | View | Template |
|-----|------|----------|
| `/` | `dashboard.home` | `dashboard/home.html` |

### Teams

| URL | Name | View | Template |
|-----|------|------|----------|
| `/teams/` | `team_list` | `team_list` | `teams/list.html` |
| `/teams/<pk>/` | `team_detail` | `team_detail` | `teams/detail.html` |
| `/teams/add/` | `team_create` | `team_create` | `teams/form.html` |
| `/teams/<pk>/edit/` | `team_edit` | `team_edit` | `teams/form.html` |
| `/seasons/` | `season_list` | `season_list` | `teams/seasons.html` |

### Players

| URL | Name | View | Template |
|-----|------|------|----------|
| `/players/` | `player_list` | `player_list` | `players/list.html` |
| `/players/<pk>/` | `player_detail` | `player_detail` | `players/detail.html` |
| `/players/add/` | `player_create` | `player_create` | `players/form.html` |
| `/players/<pk>/edit/` | `player_edit` | `player_edit` | `players/form.html` |

### Games

| URL | Name | View | Template |
|-----|------|------|----------|
| `/games/` | `game_list` | `game_list` | `games/list.html` |
| `/games/<pk>/` | `game_detail` | `game_detail` | `games/detail.html` |
| `/games/add/` | `game_create` | `game_create` | `games/form.html` |
| `/games/<pk>/edit/` | `game_edit` | `game_edit` | `games/form.html` |
| `/games/<pk>/plays/` | `game_plays` | `game_plays` | `games/plays.html` |
| `/games/<pk>/tracker/` | `game_tracker` | `tracker.game_tracker` | `games/tracker.html` |

### Reports

| URL | Name | View | Template |
|-----|------|------|----------|
| `/reports/offense/` | `report_offense` | `report_offense` | `reports/offense.html` |
| `/reports/defense/` | `report_defense` | `report_defense` | `reports/defense.html` |
| `/reports/special-teams/` | `report_special_teams` | `report_special_teams` | `reports/special_teams.html` |

---

## View Pseudocode — `apps/frontend/views.py`

### Module-Level Helper

```python
# Shared by all three report views — avoids 8-line repeated GET-param parsing block
def _report_service_kwargs(request) -> dict:
    """Build filter kwargs for BaseReportService constructors from GET params."""
    kwargs = {}
    if season_id := request.GET.get('season'):
        kwargs['season_id'] = int(season_id)
    if game_id := request.GET.get('game'):
        kwargs['game_ids'] = [int(game_id)]
    return kwargs
```

### Auth Views

```python
def login_view(request):
    if POST: form = AuthenticationForm(data=request.POST)
             if form.is_valid(): login(request, user); redirect('dashboard:home')
    return render('accounts/login.html', {'form': form})

def logout_view(request):
    # No method restriction — logs out on GET or POST
    logout(request); redirect('frontend:login')

def register_view(request):
    # Manual validation (no UserCreationForm) — checks username uniqueness,
    # password match, min length; creates User via create_user(); optional team assignment
    if POST and valid: login(request, user); redirect('dashboard:home')
    return render('accounts/register.html', {'teams': Team.objects.all()})
    return render('accounts/register.html', {'form': form})
```

### Team Views

```python
def team_list(request):
    teams = Team.objects.all().order_by('name')
    return render('teams/list.html', {'teams': paginator(teams, 25)})

def team_detail(request, pk):
    team = get_object_or_404(Team, pk=pk)
    players = Player.objects.filter(team=team, is_active=True).order_by('position', 'number')
    # Group players by position for display
    return render('teams/detail.html', {'team': team, 'players_by_position': grouped})

def team_create(request):
    if POST: form = TeamForm(request.POST)
             if valid: team = form.save(); redirect('frontend:team_detail', pk=team.pk)
    return render('teams/form.html', {'form': form})

def team_edit(request, pk):
    team = get_object_or_404(Team, pk=pk)
    if POST: form = TeamForm(request.POST, instance=team); if valid: form.save()
    return render('teams/form.html', {'form': form, 'team': team})
```

### Player Views

```python
def player_list(request):
    qs = Player.objects.select_related('team').filter(is_active=True)
    # Apply filters from query params: team, position, search
    if request.GET.get('team'): qs = qs.filter(team_id=request.GET['team'])
    if request.GET.get('position'): qs = qs.filter(position=request.GET['position'])
    if request.GET.get('search'): qs = qs.filter(Q(first_name__icontains=q) | Q(last_name__icontains=q))
    return render('players/list.html', {'players': paginator(qs, 25)})

def player_detail(request, pk):
    player = get_object_or_404(Player, pk=pk)
    # Compute inline stats using ORM aggregation
    rushing = RunPlay.objects.filter(ball_carrier=player).aggregate(...)
    passing = PassPlay.objects.filter(quarterback=player).aggregate(...)
    # Defensive stats use PlayResult enum constants (not raw strings) to match actual DB values
    PR = DefenseSnap.PlayResult
    defense = DefenseSnap.objects.filter(primary_player=player).aggregate(
        tackles=Count('id', filter=Q(play_result=PR.TACKLE)),
        tfl=Count('id', filter=Q(play_result=PR.TACKLE_FOR_LOSS)),
        sacks=Count('id', filter=Q(play_result=PR.SACK)),
        interceptions=Count('id', filter=Q(play_result=PR.INTERCEPTION)),
        fumble_recoveries=Count('id', filter=Q(play_result=PR.FUMBLE_RECOVERY)),
        pass_defended=Count('id', filter=Q(play_result=PR.PASS_DEFENDED)),
    )
    return render('players/detail.html', {'player': player, 'rushing': rushing, ...})
```

### Game Views

```python
def game_detail(request, pk):
    game = get_object_or_404(Game.objects.select_related('season', 'season__team'), pk=pk)
    # Use OffenseReportService scoped to this game
    service = OffenseReportService(game_ids=[game.pk])
    rushing = service.get_rushing_totals()
    passing = service.get_passing_totals()
    # Top performers
    top_rusher = service.get_rushing_by_player()[:1]
    top_passer = service.get_passing_by_quarterback()[:1]
    top_receiver = service.get_receiving_by_player()[:1]
    quarter_scores = game.quarter_scores.order_by('quarter')
    return render('games/detail.html', {game, rushing, passing, quarter_scores, leaders})

def game_plays(request, pk):
    game = get_object_or_404(Game, pk=pk)
    plays_qs = game.snaps.order_by('sequence_number')
    if quarter := request.GET.get('quarter'):
        plays_qs = plays_qs.filter(quarter=quarter)
    # Summary box uses shared service instead of inline aggregation
    offense_service = OffenseReportService(game_ids=[game.id])
    rushing = offense_service.get_rushing_totals()
    passing = offense_service.get_passing_totals()
    summary = {
        'rushing_yards': rushing.get('yards') or 0,
        'passing_yards': passing.get('yards') or 0,
        'touchdowns': (rushing.get('touchdowns') or 0) + (passing.get('touchdowns') or 0),
    }
    return render('games/plays.html', {'game': game, 'plays': plays_qs, 'summary': summary})
```

### Report Views

```python
# All three views use _report_service_kwargs() to parse ?season=N or ?game=N from GET params.

def report_offense(request):
    kwargs = _report_service_kwargs(request)   # e.g. {'season_id': 3} or {'game_ids': [7]}
    service = OffenseReportService(**kwargs)
    return render('reports/offense.html', {
        'rushing_totals':    service.get_rushing_totals(),
        'rushing_by_player': service.get_rushing_by_player(),
        'passing_totals':    service.get_passing_totals(),
        'passing_by_qb':     service.get_passing_by_quarterback(),
        'receiving_by_player': service.get_receiving_by_player(),
        'seasons': Season.objects.all(),
        'games': Game.objects.order_by('-date')[:50],
    })

def report_defense(request):
    kwargs = _report_service_kwargs(request)
    service = DefenseReportService(**kwargs)
    return render('reports/defense.html', {
        'team_totals':  service.get_team_totals(),
        'player_stats': service.get_player_summary(),
        ...
    })

def report_special_teams(request):
    kwargs = _report_service_kwargs(request)
    service = SpecialTeamsReportService(**kwargs)
    return render('reports/special_teams.html', {
        'punt_totals':    service.get_punt_totals(),
        'kickoff_totals': service.get_kickoff_totals(),
        'fg_totals':      service.get_field_goal_totals(),
        'pat_totals':     service.get_extra_point_totals(),
        'kickers':        service.get_field_goal_by_kicker(),
        ...
    })
```

---

## View Pseudocode — `apps/frontend/dashboard.py`

The dashboard home view is in its own module to keep it separate from the large `views.py`.

```python
# Module-level helper — shared by every query in this file
def _season_team_filter(team, season):
    return {'game__season': season, 'game__season__team': team}

@login_required
def home(request):
    # 1. Get current season (most recent by year)
    current_season = Season.objects.order_by('-year').first()
    games_qs = Game.objects.filter(season=current_season).order_by('-date')

    # 2. Basic stats
    wins   = games_qs.filter(team_score__gt=F('opponent_score')).count()
    losses = games_qs.filter(team_score__lt=F('opponent_score')).count()
    totals = games_qs.aggregate(points_for=Sum('team_score'), points_against=Sum('opponent_score'))
    total_plays = BaseSnap.objects.count()

    # 3. Determine team (user.team or season.team)
    team = getattr(request.user, 'team', None) or (current_season.team if current_season else None)

    # 4. Quarter scoring trends
    f = _season_team_filter(team, current_season)
    quarter_trends = QuarterScore.objects.filter(**f)
        .values('quarter')
        .annotate(avg_for=Avg('team_score'), avg_against=Avg('opponent_score'), games=Count('game'))
        .order_by('quarter')

    # 5. Win/loss streak
    streak_type, streak_len = None, 0
    for game in games_qs.order_by('-date'):
        if streak_type is None: streak_type = game.result; streak_len = 1
        elif game.result == streak_type: streak_len += 1
        else: break
    current_streak = {'type': streak_type, 'length': streak_len}

    # 6. Third-down conversion rate
    f = _season_team_filter(team, current_season)
    run_3rd  = RunPlay.objects.filter(**f, down=3)
    pass_3rd = PassPlay.objects.filter(**f, down=3)
    third_down_attempts    = run_3rd.count() + pass_3rd.count()
    third_down_conversions = run_3rd.filter(is_first_down=True).count() + \
                             pass_3rd.filter(is_first_down=True).count()
    third_down_pct = int(conversions * 100 / attempts) if attempts else None

    # 7. Red zone efficiency (ball_position >= 30 = inside opp 20-yard line)
    f = _season_team_filter(team, current_season)
    red_zone_plays = BaseSnap.objects.filter(**f, ball_position__gte=30).count()
    red_zone_tds   = RunPlay.objects.filter(**f, ball_position__gte=30, is_touchdown=True).count() + \
                     PassPlay.objects.filter(**f, ball_position__gte=30, is_touchdown=True).count()
    red_zone_pct   = int(tds * 100 / plays) if plays else None

    # 8. Player alerts (notable performers: ≥2 sacks or ≥2 fumble recoveries)
    alerts = []
    f = _season_team_filter(team, current_season)
    player_fields = ('primary_player__id', 'primary_player__first_name', 'primary_player__last_name')
    for result_type, alert_type in [(DefenseSnap.PlayResult.SACK, 'sacks'),
                                    (DefenseSnap.PlayResult.FUMBLE_RECOVERY, 'fumble_recoveries')]:
        qs = (DefenseSnap.objects.filter(**f, play_result=result_type)
              .values(*player_fields).annotate(count=Count('id')).filter(count__gte=2))
        for p in qs:
            alerts.append({'type': alert_type, 'player_name': ..., 'count': p['count']})

    metrics = {
        'quarter_trends': list(quarter_trends),
        'current_streak': current_streak,
        'third_down_attempts': ..., 'third_down_conversions': ..., 'third_down_pct': ...,
        'red_zone_plays': ..., 'red_zone_tds': ..., 'red_zone_pct': ...,
        'alerts': alerts,
    }

    return TemplateResponse(request, 'dashboard/home.html', {
        'current_season': current_season,
        'stats': stats,
        'recent_games': list(games_qs[:5]),
        'metrics': metrics,
    })
```

`TemplateResponse` (not `render`) is used so tests can inspect `context_data` without forcing an immediate render.

---

## Template Descriptions

### `templates/base.html`

Master layout. All other templates extend this. Provides:
- Bootstrap 5.3.2 CDN (dark theme) + Bootstrap Icons 1.11.1
- `{% block head_extra %}` for per-page CSS/JS
- Navbar include (`includes/navbar.html`)
- Django messages framework flash messages
- `{% block content %}` — main page area
- Footer include (`includes/footer.html`) — conditionally hidden on tracker page
- `{% block scripts %}` for per-page JavaScript

### `templates/includes/`

| File | Purpose |
|------|---------|
| `navbar.html` | Responsive Bootstrap navbar with team name, nav-links (Teams, Players, Games, Reports, Seasons), user dropdown (Profile, Logout) |
| `footer.html` | Minimal footer with project name; CSS class hides it on tracker page |
| `pagination.html` | Bootstrap pagination component; receives `page_obj` from paginator |

### `templates/accounts/`

| File | Content |
|------|---------|
| `login.html` | Login card with username/password form; links to register |
| `register.html` | Registration form with validation error display |
| `profile.html` | Read-only user info; link to change-password view |

### `templates/teams/`

| File | Content |
|------|---------|
| `list.html` | Card grid of teams; abbreviation badge; click → team_detail |
| `detail.html` | Team header (name, abbr); roster table grouped by position group |
| `form.html` | Create/edit form for `name` and `abbreviation` |
| `seasons.html` | Table of seasons: Year | W-L-T | Points For | Points Against |

### `templates/players/`

| File | Content |
|------|---------|
| `list.html` | Filterable player table (name, #, position, team); filter sidebar |
| `detail.html` | Player header (#number, full name, position); season stat cards (rushing/passing/defense) |
| `form.html` | Create/edit form: first/last name, position select, number, team, active checkbox |

### `templates/games/`

| File | Content |
|------|---------|
| `list.html` | Game schedule table: date, opponent, location badge, result badge (W/L/T); filter bar above |
| `detail.html` | Scoreboard card; quarter score table; leaders section; link to tracker |
| `form.html` | Create/edit game: season select, opponent, date picker, location/weather/field selects |
| `plays.html` | Play-by-play log table; quarter tabs filter; shows snap type, player, yards, result |
| `tracker.html` | Live game tracker SPA — see [05-tracker.md](05-tracker.md) |

### `templates/reports/`

| File | Content |
|------|---------|
| `offense.html` | Season filter at top; Rushing totals card + per-player table; Passing totals card + QB table; Receiving table |
| `defense.html` | Team defensive totals card; per-player table (tackles, sacks, TFLs, INTs, FRec, PDs); assists breakdown table |
| `special_teams.html` | Four sections: Punt totals, Kickoff totals, Field Goal totals + kicker table, Extra Point totals |

### `templates/dashboard/home.html`

Season banner (W-L record, points for/against, total plays).
Recent games table (last 5).
**Coaching Metrics section** (added Feb 17, 2026):
- Quarter scoring chart via Chart.js line chart (data from `metrics.quarter_trends`)
- Win/loss streak badge (`metrics.current_streak`)
- 3rd-down conversion rate card (`metrics.third_down_pct`)
- Red zone efficiency card (`metrics.red_zone_pct`)
- Player alert cards (players with ≥2 sacks or ≥2 fumble recoveries)

---

## Static JS/CSS

### `static/js/app.js`

```javascript
// DOMContentLoaded
// 1. Touch feedback: document.querySelectorAll('.btn-touch')
//    → click → add .active → setTimeout remove .active (150ms)
// 2. Loading state: document.querySelectorAll('form[data-loading]')
//    → submit → submitBtn.disabled = true; submitBtn.textContent = 'Loading...'
```

### `static/css/style.css`

Global dark theme overrides on top of Bootstrap 5:
- CSS custom properties: `--bs-body-bg`, `--bs-body-color`, card/border colors
- `.badge-*` color overrides for result badges (W=success, L=danger, T=secondary)
- Form control dark styling (`.form-control`, `.form-select`)
- Table row hover color
- Touch target minimum sizes for mobile

---

→ Next: [05 — Live Tracker](05-tracker.md)
