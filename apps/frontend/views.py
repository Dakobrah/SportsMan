"""
Frontend views for Sports-Man.
"""
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import AuthenticationForm
from django.contrib import messages
from django.core.paginator import Paginator
from django.db.models import Sum, Count, F, Q

from apps.teams.models import Team, Player, Season
from apps.games.models import Game, QuarterScore
from apps.snaps.models import BaseSnap, RunPlay, PassPlay, DefenseSnap
from apps.reports.services import OffenseReportService, DefenseReportService, SpecialTeamsReportService


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
            next_url = request.GET.get('next', 'dashboard:home')
            return redirect(next_url)
    else:
        form = AuthenticationForm()

    return render(request, 'accounts/login.html', {'form': form})


def logout_view(request):
    """User logout."""
    logout(request)
    messages.info(request, 'You have been logged out.')
    return redirect('frontend:login')


def register_view(request):
    """User registration."""
    from apps.accounts.models import User

    if request.user.is_authenticated:
        return redirect('dashboard:home')

    if request.method == 'POST':
        username = request.POST.get('username')
        email = request.POST.get('email')
        password1 = request.POST.get('password1')
        password2 = request.POST.get('password2')

        errors = {}
        if User.objects.filter(username=username).exists():
            errors['username'] = 'Username already exists'
        if password1 != password2:
            errors['password2'] = 'Passwords do not match'
        if len(password1) < 8:
            errors['password1'] = 'Password must be at least 8 characters'

        if not errors:
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password1,
                first_name=request.POST.get('first_name', ''),
                last_name=request.POST.get('last_name', ''),
            )
            if request.POST.get('team'):
                user.team_id = request.POST.get('team')
                user.save()

            login(request, user)
            messages.success(request, 'Account created successfully!')
            return redirect('dashboard:home')

        return render(request, 'accounts/register.html', {
            'form': request.POST,
            'errors': errors,
            'teams': Team.objects.all(),
        })

    return render(request, 'accounts/register.html', {
        'teams': Team.objects.all(),
    })


@login_required
def profile_view(request):
    """User profile."""
    if request.method == 'POST':
        user = request.user
        user.first_name = request.POST.get('first_name', '')
        user.last_name = request.POST.get('last_name', '')
        user.email = request.POST.get('email', '')
        team_id = request.POST.get('team')
        user.team_id = team_id if team_id else None
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
        elif len(new_password1) < 8:
            messages.error(request, 'Password must be at least 8 characters.')
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
    """Create a new team."""
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
    """Edit a team."""
    team = get_object_or_404(Team, pk=pk)

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
        longest=Sum('yards_gained'),
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
        longest=Sum('yards_gained'),
    )
    if receiving['receptions']:
        receiving['avg'] = receiving['yards'] / receiving['receptions'] if receiving['yards'] else 0
        offensive_stats['receiving'] = receiving

    # Get defensive stats
    defensive_stats = DefenseSnap.objects.filter(primary_player=player).aggregate(
        tackles=Count('id', filter=Q(play_result='TACKLE')),
        tfl=Count('id', filter=Q(play_result='TFL')),
        sacks=Count('id', filter=Q(play_result='SACK')),
        interceptions=Count('id', filter=Q(play_result='INT')),
        fumble_recoveries=Count('id', filter=Q(play_result='FR')),
        pass_defended=Count('id', filter=Q(play_result='PD')),
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
        player = Player.objects.create(
            first_name=request.POST['first_name'],
            last_name=request.POST['last_name'],
            number=request.POST['number'],
            position=request.POST['position'],
            team_id=request.POST.get('team') or None,
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
    player = get_object_or_404(Player, pk=pk)

    if request.method == 'POST':
        player.first_name = request.POST['first_name']
        player.last_name = request.POST['last_name']
        player.number = request.POST['number']
        player.position = request.POST['position']
        player.team_id = request.POST.get('team') or None
        player.save()
        messages.success(request, f'Player "{player.full_name}" updated!')
        return redirect('frontend:player_detail', pk=player.pk)

    return render(request, 'players/form.html', {
        'player': player,
        'teams': Team.objects.all(),
        'form': player.__dict__,
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

@login_required
def game_list(request):
    """List all games with filtering."""
    games = Game.objects.select_related('season', 'season__team').order_by('-date')

    # Apply filters
    season_id = request.GET.get('season')
    result = request.GET.get('result')
    location = request.GET.get('location')

    if season_id:
        games = games.filter(season_id=season_id)
    if result:
        if result == 'W':
            games = games.filter(team_score__gt=F('opponent_score'))
        elif result == 'L':
            games = games.filter(team_score__lt=F('opponent_score'))
    if location:
        games = games.filter(location=location)

    paginator = Paginator(games, 20)
    page = request.GET.get('page')
    games = paginator.get_page(page)

    return render(request, 'games/list.html', {
        'games': games,
        'page_obj': games,
        'seasons': Season.objects.all(),
        'current_season': Season.objects.order_by('-year').first(),
    })


@login_required
def game_detail(request, pk):
    """Game detail with stats summary."""
    game = get_object_or_404(Game.objects.select_related('season', 'season__team'), pk=pk)

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

    # Get top performers
    rushing_leaders = offense_service.get_rushing_by_player()
    passing_leaders = offense_service.get_passing_by_quarterback()
    receiving_leaders = offense_service.get_receiving_by_player()

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
    game = get_object_or_404(Game, pk=pk)
    plays = game.snaps.all().order_by('sequence_number')

    # Filter by quarter
    quarter = request.GET.get('quarter')
    if quarter:
        plays = plays.filter(quarter=quarter)

    # Calculate summary
    summary = {
        'rushing_yards': RunPlay.objects.filter(game=game).aggregate(total=Sum('yards_gained'))['total'] or 0,
        'passing_yards': PassPlay.objects.filter(game=game, is_complete=True).aggregate(total=Sum('yards_gained'))['total'] or 0,
        'touchdowns': (
            RunPlay.objects.filter(game=game, is_touchdown=True).count() +
            PassPlay.objects.filter(game=game, is_touchdown=True).count()
        ),
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
    if request.method == 'POST':
        game = Game.objects.create(
            season_id=request.POST['season'],
            date=request.POST['date'],
            opponent=request.POST['opponent'],
            location=request.POST['location'],
            weather=request.POST.get('weather', 'clear'),
            field_condition=request.POST.get('field_condition', 'turf'),
            team_score=request.POST['team_score'],
            opponent_score=request.POST['opponent_score'],
            notes=request.POST.get('notes', ''),
        )
        messages.success(request, f'Game vs {game.opponent} created!')
        return redirect('frontend:game_detail', pk=game.pk)

    return render(request, 'games/form.html', {
        'seasons': Season.objects.all(),
        'form': {},
    })


@login_required
def game_edit(request, pk):
    """Edit a game."""
    game = get_object_or_404(Game, pk=pk)

    if request.method == 'POST':
        game.season_id = request.POST['season']
        game.date = request.POST['date']
        game.opponent = request.POST['opponent']
        game.location = request.POST['location']
        game.weather = request.POST.get('weather', game.weather)
        game.field_condition = request.POST.get('field_condition', game.field_condition)
        game.team_score = request.POST['team_score']
        game.opponent_score = request.POST['opponent_score']
        game.notes = request.POST.get('notes', '')
        game.save()
        messages.success(request, f'Game vs {game.opponent} updated!')
        return redirect('frontend:game_detail', pk=game.pk)

    return render(request, 'games/form.html', {
        'game': game,
        'seasons': Season.objects.all(),
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

@login_required
def report_offense(request):
    """Offensive statistics report."""
    # Build filters
    season_id = request.GET.get('season')
    game_id = request.GET.get('game')

    kwargs = {}
    if season_id:
        kwargs['season_ids'] = [int(season_id)]
    if game_id:
        kwargs['game_ids'] = [int(game_id)]

    service = OffenseReportService(**kwargs)

    return render(request, 'reports/offense.html', {
        'rushing_totals': service.get_rushing_totals(),
        'passing_totals': service.get_passing_totals(),
        'rushing_by_player': service.get_rushing_by_player(),
        'passing_by_qb': service.get_passing_by_quarterback(),
        'receiving_by_player': service.get_receiving_by_player(),
        'seasons': Season.objects.all(),
        'games': Game.objects.order_by('-date')[:50],
        'season': Season.objects.filter(pk=season_id).first() if season_id else None,
    })


@login_required
def report_defense(request):
    """Defensive statistics report."""
    season_id = request.GET.get('season')
    game_id = request.GET.get('game')

    kwargs = {}
    if season_id:
        kwargs['season_ids'] = [int(season_id)]
    if game_id:
        kwargs['game_ids'] = [int(game_id)]

    service = DefenseReportService(**kwargs)

    return render(request, 'reports/defense.html', {
        'team_totals': service.get_team_totals(),
        'player_stats': service.get_player_summary(),
        'seasons': Season.objects.all(),
        'games': Game.objects.order_by('-date')[:50],
        'season': Season.objects.filter(pk=season_id).first() if season_id else None,
    })


@login_required
def report_special_teams(request):
    """Special teams statistics report."""
    season_id = request.GET.get('season')
    game_id = request.GET.get('game')

    kwargs = {}
    if season_id:
        kwargs['season_ids'] = [int(season_id)]
    if game_id:
        kwargs['game_ids'] = [int(game_id)]

    service = SpecialTeamsReportService(**kwargs)

    return render(request, 'reports/special_teams.html', {
        'fg_totals': service.get_field_goal_totals(),
        'pat_totals': service.get_extra_point_totals(),
        'punt_totals': service.get_punt_totals(),
        'kickoff_totals': service.get_kickoff_totals(),
        'kickers': service.get_field_goal_by_kicker(),
        'seasons': Season.objects.all(),
        'games': Game.objects.order_by('-date')[:50],
        'season': Season.objects.filter(pk=season_id).first() if season_id else None,
    })
