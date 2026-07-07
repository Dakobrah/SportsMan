"""
Frontend views for Sports-Man.
"""
from django.conf import settings
from django.core.cache import cache
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth.password_validation import validate_password
from django.contrib import messages
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.paginator import Paginator
from django.db.models import Sum, Count, F, Q, Max
from django.forms.models import model_to_dict
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST

from apps.teams.models import Team, Player, Season
from apps.games.models import Game, QuarterScore
from apps.snaps.models import BaseSnap, RunPlay, PassPlay, DefenseSnap
from apps.reports.services import OffenseReportService, DefenseReportService, SpecialTeamsReportService
from apps.core import cache as core_cache
from apps.frontend import play_feed


# ---------------------------------------------------------------------------
# Authorization helpers
# ---------------------------------------------------------------------------

def _require_staff_or_own_team(request, team):
    """
    Raise PermissionDenied if the requesting user is not staff and does not
    belong to `team`.  Used to guard write operations on team-owned resources.
    """
    if request.user.is_staff:
        return
    user_team = getattr(request.user, "team", None)
    if user_team != team:
        raise PermissionDenied("You do not have permission to modify this team's data.")


def _report_service_kwargs(request):
    """
    Build filter kwargs for report service constructors from GET params.
    Always scopes to the user's team for non-staff to prevent cross-team data leakage.
    """
    kwargs = {}
    if season_id := request.GET.get('season'):
        kwargs['season_id'] = int(season_id)
    if game_id := request.GET.get('game'):
        kwargs['game_ids'] = [int(game_id)]
    # Scope non-staff users to their own team's data.
    if not request.user.is_staff:
        team_id = getattr(request.user, 'team_id', None)
        if team_id:
            kwargs['team_id'] = team_id
    return kwargs


def _report_filter_context(request):
    """Return the filter-dropdown context shared by all three report views."""
    season_id = request.GET.get('season')
    # Non-staff users only see their own team's seasons/games.
    if request.user.is_staff:
        seasons_qs = Season.objects.all()
        games_qs = Game.objects.order_by('-date')[:50]
    else:
        user_team = getattr(request.user, 'team', None)
        seasons_qs = Season.objects.filter(team=user_team) if user_team else Season.objects.none()
        games_qs = Game.objects.filter(season__team=user_team).order_by('-date')[:50] if user_team else Game.objects.none()
    return {
        'seasons': seasons_qs,
        'games': games_qs,
        'season': Season.objects.filter(pk=season_id).first() if season_id else None,
    }


# =============================================================================
# Authentication Views
# =============================================================================

def login_view(request):
    """User login."""
    if request.user.is_authenticated:
        return redirect('dashboard:home')

    if request.method == 'POST':
        form = AuthenticationForm(request, data=request.POST)
        if form.is_valid():
            user = form.get_user()
            login(request, user)
            messages.success(request, f'Welcome back, {user.username}!')
            next_url = request.GET.get('next') or ''
            if not url_has_allowed_host_and_scheme(next_url, allowed_hosts={request.get_host()}):
                next_url = 'dashboard:home'
            return redirect(next_url)
    else:
        form = AuthenticationForm()

    return render(request, 'accounts/login.html', {'form': form})


@require_POST
def logout_view(request):
    """User logout."""
    logout(request)
    messages.info(request, 'You have been logged out.')
    return redirect('frontend:login')


def register_view(request):
    """
    User registration.

    Disabled by default (REGISTRATION_ENABLED=False in settings).
    When disabled, coaches must be created by a Django admin user.
    Team assignment is always done by an admin — not during registration.
    """
    if getattr(settings, 'REGISTRATION_ENABLED', False) is False:
        messages.error(
            request,
            'Self-registration is disabled. Please contact an administrator to create your account.',
        )
        return redirect('frontend:login')

    from apps.accounts.models import User

    if request.user.is_authenticated:
        return redirect('dashboard:home')

    if request.method == 'POST':
        username = request.POST.get('username', '').strip()
        email = request.POST.get('email', '').strip()
        password1 = request.POST.get('password1', '')
        password2 = request.POST.get('password2', '')

        errors = {}
        if not username:
            errors['username'] = 'Username is required'
        elif User.objects.filter(username=username).exists():
            errors['username'] = 'Username already exists'
        if password1 != password2:
            errors['password2'] = 'Passwords do not match'
        elif password1:
            try:
                validate_password(password1)
            except ValidationError as e:
                errors['password1'] = ' '.join(e.messages)

        if not errors:
            # No team assignment at registration — admin sets this via Django admin.
            User.objects.create_user(
                username=username,
                email=email,
                password=password1,
                first_name=request.POST.get('first_name', ''),
                last_name=request.POST.get('last_name', ''),
            )
            messages.success(request, 'Account created. Please log in.')
            return redirect('frontend:login')

        return render(request, 'accounts/register.html', {
            'form': request.POST,
            'errors': errors,
        })

    return render(request, 'accounts/register.html', {})


@login_required
def profile_view(request):
    """User profile."""
    if request.method == 'POST':
        user = request.user
        user.first_name = request.POST.get('first_name', '')
        user.last_name = request.POST.get('last_name', '')
        user.email = request.POST.get('email', '')
        team_id = request.POST.get('team')
        if team_id:
            team = Team.objects.filter(pk=team_id).first()
            user.team = team  # None if not found
        else:
            user.team = None
        user.save()
        messages.success(request, 'Profile updated successfully!')
        return redirect('frontend:profile')

    return render(request, 'accounts/profile.html', {
        'teams': Team.objects.all(),
    })


@login_required
def password_change_view(request):
    """Change password."""
    if request.method == 'POST':
        old_password = request.POST.get('old_password')
        new_password1 = request.POST.get('new_password1')
        new_password2 = request.POST.get('new_password2')

        if not request.user.check_password(old_password):
            messages.error(request, 'Current password is incorrect.')
        elif new_password1 != new_password2:
            messages.error(request, 'New passwords do not match.')
        else:
            try:
                validate_password(new_password1, request.user)
            except ValidationError as e:
                messages.error(request, ' '.join(e.messages))
            else:
                request.user.set_password(new_password1)
                request.user.save()
                messages.success(request, 'Password changed successfully!')
                return redirect('frontend:login')

    return redirect('frontend:profile')


# =============================================================================
# Team Views
# =============================================================================

@login_required
def team_list(request):
    """List all teams."""
    teams = Team.objects.annotate(player_count=Count('players')).order_by('name')
    return render(request, 'teams/list.html', {'teams': teams})


@login_required
def team_detail(request, pk):
    """Team detail with roster."""
    team = get_object_or_404(Team, pk=pk)
    players = team.players.all().order_by('position', 'number')
    position_counts = players.values('position').annotate(count=Count('id')).order_by('-count')

    return render(request, 'teams/detail.html', {
        'team': team,
        'players': players,
        'position_counts': position_counts,
    })


@login_required
def team_create(request):
    """Create a new team. Staff only."""
    if not request.user.is_staff:
        raise PermissionDenied("Only administrators can create teams.")
    if request.method == 'POST':
        team = Team.objects.create(
            name=request.POST['name'],
            abbreviation=request.POST['abbreviation'],
        )
        messages.success(request, f'Team "{team.name}" created!')
        return redirect('frontend:team_detail', pk=team.pk)

    return render(request, 'teams/form.html', {'form': {}})


@login_required
def team_edit(request, pk):
    """Edit a team. Staff only."""
    team = get_object_or_404(Team, pk=pk)
    if not request.user.is_staff:
        raise PermissionDenied("Only administrators can edit teams.")

    if request.method == 'POST':
        team.name = request.POST['name']
        team.abbreviation = request.POST['abbreviation']
        team.save()
        messages.success(request, f'Team "{team.name}" updated!')
        return redirect('frontend:team_detail', pk=team.pk)

    return render(request, 'teams/form.html', {'team': team, 'form': team.__dict__})


# =============================================================================
# Player Views
# =============================================================================

@login_required
def player_list(request):
    """List all players with filtering."""
    players = Player.objects.select_related('team').order_by('last_name', 'first_name')

    # Apply filters
    team_id = request.GET.get('team')
    position = request.GET.get('position')
    search = request.GET.get('search')

    if team_id:
        players = players.filter(team_id=team_id)
    if position:
        players = players.filter(position=position)
    if search:
        players = players.filter(
            Q(first_name__icontains=search) |
            Q(last_name__icontains=search) |
            Q(number__icontains=search)
        )

    paginator = Paginator(players, 25)
    page = request.GET.get('page')
    players = paginator.get_page(page)

    # Get filter options
    teams = Team.objects.all()
    positions = Player.objects.values_list('position', flat=True).distinct().order_by('position')

    return render(request, 'players/list.html', {
        'players': players,
        'page_obj': players,
        'teams': teams,
        'positions': positions,
    })


@login_required
def player_detail(request, pk):
    """Player detail with stats."""
    player = get_object_or_404(Player.objects.select_related('team'), pk=pk)

    # Get offensive stats
    offensive_stats = {}

    # Rushing
    rushing = RunPlay.objects.filter(ball_carrier=player).aggregate(
        attempts=Count('id'),
        yards=Sum('yards_gained'),
        touchdowns=Count('id', filter=Q(is_touchdown=True)),
        longest=Max('yards_gained'),
    )
    if rushing['attempts']:
        rushing['avg'] = rushing['yards'] / rushing['attempts'] if rushing['yards'] else 0
        offensive_stats['rushing'] = rushing

    # Passing
    passing = PassPlay.objects.filter(quarterback=player).aggregate(
        attempts=Count('id'),
        completions=Count('id', filter=Q(is_complete=True)),
        yards=Sum('yards_gained', filter=Q(is_complete=True)),
        touchdowns=Count('id', filter=Q(is_touchdown=True)),
        interceptions=Count('id', filter=Q(is_interception=True)),
    )
    if passing['attempts']:
        offensive_stats['passing'] = passing

    # Receiving
    receiving = PassPlay.objects.filter(receiver=player, is_complete=True).aggregate(
        receptions=Count('id'),
        yards=Sum('yards_gained'),
        touchdowns=Count('id', filter=Q(is_touchdown=True)),
        longest=Max('yards_gained'),
    )
    if receiving['receptions']:
        receiving['avg'] = receiving['yards'] / receiving['receptions'] if receiving['yards'] else 0
        offensive_stats['receiving'] = receiving

    # Get defensive stats
    PR = DefenseSnap.PlayResult
    defensive_stats = DefenseSnap.objects.filter(primary_player=player).aggregate(
        tackles=Count('id', filter=Q(play_result=PR.TACKLE)),
        tfl=Count('id', filter=Q(play_result=PR.TACKLE_FOR_LOSS)),
        sacks=Count('id', filter=Q(play_result=PR.SACK)),
        interceptions=Count('id', filter=Q(play_result=PR.INTERCEPTION)),
        fumble_recoveries=Count('id', filter=Q(play_result=PR.FUMBLE_RECOVERY)),
        pass_defended=Count('id', filter=Q(play_result=PR.PASS_DEFENDED)),
    )

    # Only include if has stats
    if not any(defensive_stats.values()):
        defensive_stats = None

    return render(request, 'players/detail.html', {
        'player': player,
        'offensive_stats': offensive_stats if offensive_stats else None,
        'defensive_stats': defensive_stats,
    })


@login_required
def player_create(request):
    """Create a new player."""
    if request.method == 'POST':
        # Determine target team and enforce ownership.
        team_id = request.POST.get('team') or None
        target_team = Team.objects.filter(pk=team_id).first() if team_id else None
        if target_team:
            _require_staff_or_own_team(request, target_team)
        elif not request.user.is_staff:
            # Non-staff must assign a team.
            messages.error(request, 'Please select a team for this player.')
            return render(request, 'players/form.html', {
                'teams': Team.objects.all(),
                'form': request.POST,
            })

        player = Player.objects.create(
            first_name=request.POST['first_name'],
            last_name=request.POST['last_name'],
            number=request.POST['number'],
            position=request.POST['position'],
            team=target_team,
        )
        messages.success(request, f'Player "{player.full_name}" added!')
        return redirect('frontend:player_detail', pk=player.pk)

    return render(request, 'players/form.html', {
        'teams': Team.objects.all(),
        'form': {'team': request.GET.get('team')},
    })


@login_required
def player_edit(request, pk):
    """Edit a player."""
    player = get_object_or_404(Player.objects.select_related('team'), pk=pk)
    # Verify the requesting user owns this player's team.
    _require_staff_or_own_team(request, player.team)

    if request.method == 'POST':
        player.first_name = request.POST['first_name']
        player.last_name = request.POST['last_name']
        player.number = request.POST['number']
        player.position = request.POST['position']
        # Staff can re-assign a player to any team; coaches cannot.
        if request.user.is_staff:
            player.team_id = request.POST.get('team') or None
        player.save()
        messages.success(request, f'Player "{player.full_name}" updated!')
        return redirect('frontend:player_detail', pk=player.pk)

    return render(request, 'players/form.html', {
        'player': player,
        'teams': Team.objects.all() if request.user.is_staff else Team.objects.filter(pk=player.team_id),
        'form': model_to_dict(player),
    })


# =============================================================================
# Season Views
# =============================================================================

@login_required
def season_list(request):
    """List all seasons."""
    seasons = Season.objects.annotate(game_count=Count('games')).order_by('-year')
    return render(request, 'teams/seasons.html', {'seasons': seasons})


# =============================================================================
# Game Views
# =============================================================================

def _scoped_games_qs(request):
    """Return a Game queryset scoped to the user's team (staff see all)."""
    qs = Game.objects.select_related('season', 'season__team').order_by('-date')
    if not request.user.is_staff:
        user_team = getattr(request.user, 'team', None)
        if user_team:
            qs = qs.filter(season__team=user_team)
        else:
            qs = qs.none()
    return qs


@login_required
def game_list(request):
    """List games, scoped to the requesting user's team."""
    games = _scoped_games_qs(request)

    # Apply filters
    season_id = request.GET.get('season')
    result = request.GET.get('result')
    location = request.GET.get('location')

    if season_id:
        games = games.filter(season_id=season_id)
    if result == 'W':
        games = games.filter(team_score__gt=F('opponent_score'))
    elif result == 'L':
        games = games.filter(team_score__lt=F('opponent_score'))
    if location:
        games = games.filter(location=location)

    paginator = Paginator(games, 20)
    page = request.GET.get('page')
    games = paginator.get_page(page)

    user_team = getattr(request.user, 'team', None)
    seasons_qs = Season.objects.filter(team=user_team) if (user_team and not request.user.is_staff) else Season.objects.all()

    return render(request, 'games/list.html', {
        'games': games,
        'page_obj': games,
        'seasons': seasons_qs,
        'current_season': Season.objects.order_by('-year').first(),
    })


@login_required
def game_detail(request, pk):
    """Game detail with stats summary."""
    game = get_object_or_404(Game.objects.select_related('season', 'season__team'), pk=pk)
    _require_staff_or_own_team(request, game.season.team)

    # Get quarter scores
    quarter_scores_qs = QuarterScore.objects.filter(game=game).order_by('quarter')
    quarter_scores = None
    if quarter_scores_qs.exists():
        quarter_scores = {
            'team': [qs.team_score for qs in quarter_scores_qs],
            'opponent': [qs.opponent_score for qs in quarter_scores_qs],
        }

    # Get game stats using services
    offense_service = OffenseReportService(game_ids=[game.id])
    stats = {
        'rushing': offense_service.get_rushing_totals(),
        'passing': offense_service.get_passing_totals(),
    }
    stats['total_yards'] = (stats['rushing'].get('yards', 0) or 0) + (stats['passing'].get('yards', 0) or 0)
    stats['turnovers'] = (
        (stats['rushing'].get('fumbles_lost', 0) or 0) +
        (stats['passing'].get('interceptions', 0) or 0)
    )

    # Get top performers — sliced to one row at the database
    rushing_leaders = offense_service.get_rushing_by_player(limit=1)
    passing_leaders = offense_service.get_passing_by_quarterback(limit=1)
    receiving_leaders = offense_service.get_receiving_by_player(limit=1)

    top_rusher = rushing_leaders[0] if rushing_leaders else None
    top_passer = passing_leaders[0] if passing_leaders else None
    top_receiver = receiving_leaders[0] if receiving_leaders else None

    return render(request, 'games/detail.html', {
        'game': game,
        'quarter_scores': quarter_scores,
        'stats': stats,
        'top_rusher': {'name': f"{top_rusher['ball_carrier__first_name']} {top_rusher['ball_carrier__last_name']}", 'yards': top_rusher['yards']} if top_rusher else None,
        'top_passer': {'name': f"{top_passer['quarterback__first_name']} {top_passer['quarterback__last_name']}", 'yards': top_passer['yards']} if top_passer else None,
        'top_receiver': {'name': f"{top_receiver['receiver__first_name']} {top_receiver['receiver__last_name']}", 'yards': top_receiver['yards']} if top_receiver else None,
    })


@login_required
def game_plays(request, pk):
    """Play-by-play view for a game."""
    game = get_object_or_404(Game.objects.select_related('season', 'season__team'), pk=pk)
    _require_staff_or_own_team(request, game.season.team)

    # Serialized dicts (batched downcast + players) instead of model instances.
    quarter = request.GET.get('quarter')
    plays = play_feed.serialize_game_plays(game, quarter=quarter)

    # Calculate summary using the shared report service
    offense_service = OffenseReportService(game_ids=[game.id])
    rushing = offense_service.get_rushing_totals()
    passing = offense_service.get_passing_totals()
    summary = {
        'rushing_yards': rushing.get('yards') or 0,
        'passing_yards': passing.get('yards') or 0,
        'touchdowns': (rushing.get('touchdowns') or 0) + (passing.get('touchdowns') or 0),
    }

    return render(request, 'games/plays.html', {
        'game': game,
        'plays': plays,
        'current_quarter': quarter,
        'summary': summary,
    })


@login_required
def game_create(request):
    """Create a new game."""
    user_team = getattr(request.user, 'team', None)
    if request.user.is_staff:
        available_seasons = Season.objects.all()
    else:
        available_seasons = Season.objects.filter(team=user_team) if user_team else Season.objects.none()

    if request.method == 'POST':
        season = get_object_or_404(Season.objects.select_related('team'), pk=request.POST['season'])
        # Verify ownership of the target season.
        _require_staff_or_own_team(request, season.team)

        game = Game.objects.create(
            season=season,
            date=request.POST['date'],
            opponent=request.POST['opponent'],
            location=request.POST['location'],
            weather=request.POST.get('weather', 'clear'),
            field_condition=request.POST.get('field_condition', 'turf'),
            team_score=request.POST.get('team_score', 0) or 0,
            opponent_score=request.POST.get('opponent_score', 0) or 0,
            notes=request.POST.get('notes', ''),
        )
        messages.success(request, f'Game vs {game.opponent} created!')
        return redirect('frontend:game_detail', pk=game.pk)

    return render(request, 'games/form.html', {
        'seasons': available_seasons,
        'form': {},
    })


@login_required
def game_edit(request, pk):
    """Edit a game."""
    game = get_object_or_404(Game.objects.select_related('season__team'), pk=pk)
    _require_staff_or_own_team(request, game.season.team)

    if request.user.is_staff:
        available_seasons = Season.objects.all()
    else:
        user_team = getattr(request.user, 'team', None)
        available_seasons = Season.objects.filter(team=user_team) if user_team else Season.objects.none()

    if request.method == 'POST':
        season = get_object_or_404(Season.objects.select_related('team'), pk=request.POST['season'])
        _require_staff_or_own_team(request, season.team)

        game.season = season
        game.date = request.POST['date']
        game.opponent = request.POST['opponent']
        game.location = request.POST['location']
        game.weather = request.POST.get('weather', game.weather)
        game.field_condition = request.POST.get('field_condition', game.field_condition)
        game.team_score = request.POST.get('team_score', game.team_score) or game.team_score
        game.opponent_score = request.POST.get('opponent_score', game.opponent_score) or game.opponent_score
        game.notes = request.POST.get('notes', '')
        game.save()
        messages.success(request, f'Game vs {game.opponent} updated!')
        return redirect('frontend:game_detail', pk=game.pk)

    return render(request, 'games/form.html', {
        'game': game,
        'seasons': available_seasons,
        'form': game.__dict__,
    })


@login_required
def game_add_play(request, pk):
    """Redirect to the live tracker for adding plays."""
    return redirect('tracker:game_tracker', pk=pk)


@login_required
def play_edit(request, pk):
    """Edit a play (placeholder)."""
    messages.info(request, 'Play editing coming soon!')
    return redirect('frontend:game_list')


# =============================================================================
# Report Views
# =============================================================================

def _cached_report(prefix, service_kwargs, compute):
    """
    Fetch a report context block from the cache, computing it on a miss.

    Keys embed apps.core.cache.data_version for the same scope, so any
    snap/game change makes a new key — no explicit invalidation.
    """
    version = core_cache.data_version(**service_kwargs)
    key = core_cache.cache_key(prefix, service_kwargs, version)
    return cache.get_or_set(key, compute, 300)


@login_required
def report_offense(request):
    """Offensive statistics report."""
    kwargs = _report_service_kwargs(request)

    def compute():
        service = OffenseReportService(**kwargs)
        return {
            'rushing_totals': service.get_rushing_totals(),
            'passing_totals': service.get_passing_totals(),
            'rushing_by_player': service.get_rushing_by_player(),
            'passing_by_qb': service.get_passing_by_quarterback(),
            'receiving_by_player': service.get_receiving_by_player(),
        }

    return render(request, 'reports/offense.html', {
        **_report_filter_context(request),
        **_cached_report('report:offense', kwargs, compute),
    })


@login_required
def report_defense(request):
    """Defensive statistics report."""
    kwargs = _report_service_kwargs(request)

    def compute():
        service = DefenseReportService(**kwargs)
        return {
            'team_totals': service.get_team_totals(),
            'player_stats': service.get_player_summary(),
        }

    return render(request, 'reports/defense.html', {
        **_report_filter_context(request),
        **_cached_report('report:defense', kwargs, compute),
    })


@login_required
def report_special_teams(request):
    """Special teams statistics report."""
    kwargs = _report_service_kwargs(request)

    def compute():
        service = SpecialTeamsReportService(**kwargs)
        return {
            'fg_totals': service.get_field_goal_totals(),
            'pat_totals': service.get_extra_point_totals(),
            'punt_totals': service.get_punt_totals(),
            'kickoff_totals': service.get_kickoff_totals(),
            'kickers': service.get_field_goal_by_kicker(),
        }

    return render(request, 'reports/special_teams.html', {
        **_report_filter_context(request),
        **_cached_report('report:special_teams', kwargs, compute),
    })
