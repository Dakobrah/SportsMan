"""
Dashboard views.
"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.db.models import Sum, Count, Q, F

from apps.teams.models import Team, Season
from apps.games.models import Game
from apps.snaps.models import BaseSnap


@login_required
def home(request):
    """Main dashboard view."""
    # Get current season
    current_season = Season.objects.filter(is_current=True).first()

    # Get games queryset
    games_qs = Game.objects.select_related('season', 'team').order_by('-date')
    if current_season:
        games_qs = games_qs.filter(season=current_season)

    # Calculate record
    wins = games_qs.filter(team_score__gt=F('opponent_score')).count()
    losses = games_qs.filter(team_score__lt=F('opponent_score')).count()

    # Points totals
    totals = games_qs.aggregate(
        points_for=Sum('team_score'),
        points_against=Sum('opponent_score'),
    )

    # Total plays
    total_plays = BaseSnap.objects.count()

    stats = {
        'wins': wins,
        'losses': losses,
        'points_for': totals['points_for'] or 0,
        'points_against': totals['points_against'] or 0,
        'total_plays': total_plays,
    }

    # Recent games
    recent_games = games_qs[:5]

    # Leaders (empty dict if no data)
    leaders = {}

    return render(request, 'dashboard/home.html', {
        'current_season': current_season,
        'stats': stats,
        'recent_games': recent_games,
        'leaders': leaders,
    })
