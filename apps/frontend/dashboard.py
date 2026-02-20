"""
Dashboard views.
"""
from django.shortcuts import render
from django.template.response import TemplateResponse
from django.contrib.auth.decorators import login_required
from django.db.models import Sum, Count, Q, F, Avg

from apps.teams.models import Team, Season
from apps.games.models import Game
from apps.snaps.models import BaseSnap
from apps.snaps.models.offense import RunPlay, PassPlay
from apps.snaps.models.defense import DefenseSnap
from apps.games.models import QuarterScore


def _season_team_filter(team, season):
    """Return common filter kwargs for queries scoped to a team + season."""
    return {'game__season': season, 'game__season__team': team}


@login_required
def home(request):
    """Main dashboard view."""
    # Get current season
    current_season = Season.objects.order_by('-year').first()

    # Get games queryset
    games_qs = Game.objects.select_related('season', 'season__team').order_by('-date')
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

    # Recent games (convert to list to avoid template context deep-copy issues in tests)
    recent_games = list(games_qs[:5])

    # Leaders (empty dict if no data)
    leaders = {}

    # Use the user's team when available, otherwise fall back to the season's team
    team = getattr(request.user, 'team', None) or (current_season.team if current_season else None)

    # Quarter-by-quarter scoring trends (avg points per quarter)
    quarter_trends = []
    if current_season and team:
        qs = QuarterScore.objects.filter(game__season=current_season, game__season__team=team)
        quarter_agg = qs.values('quarter').annotate(
            avg_for=Avg('team_score'),
            avg_against=Avg('opponent_score'),
            games=Count('game', distinct=True)
        ).order_by('quarter')

        for q in quarter_agg:
            quarter_trends.append({
                'quarter': q['quarter'],
                'avg_for': int(q['avg_for'] or 0),
                'avg_against': int(q['avg_against'] or 0),
                'games': q['games'],
            })

    # Current win/loss streak (most recent contiguous same-result sequence)
    current_streak = {'type': None, 'length': 0}
    if team:
        team_games = games_qs.filter(season__team=team).order_by('-date')
        streak_type = None
        streak_len = 0
        for g in team_games:
            res = g.result
            if streak_type is None:
                streak_type = res
                streak_len = 1
            elif res == streak_type:
                streak_len += 1
            else:
                break
        if streak_type:
            current_streak = {'type': streak_type, 'length': streak_len}

    # Third-down conversion rate
    third_down_attempts = 0
    third_down_conversions = 0
    if team:
        f = _season_team_filter(team, current_season)
        run_third = RunPlay.objects.filter(**f, down=3)
        pass_third = PassPlay.objects.filter(**f, down=3)
        third_down_attempts = run_third.count() + pass_third.count()
        third_down_conversions = (
            run_third.filter(is_first_down=True).count()
            + pass_third.filter(is_first_down=True).count()
        )

    third_down_pct = (int(third_down_conversions * 100 / third_down_attempts)
                     if third_down_attempts else None)

    # Red zone efficiency: touchdowns on plays starting inside opponent 20 (ball_position >= 30)
    red_zone_plays = 0
    red_zone_tds = 0
    if team:
        f = _season_team_filter(team, current_season)
        red_zone_plays = BaseSnap.objects.filter(**f, ball_position__gte=30).count()
        red_zone_tds = (
            RunPlay.objects.filter(**f, ball_position__gte=30, is_touchdown=True).count()
            + PassPlay.objects.filter(**f, ball_position__gte=30, is_touchdown=True).count()
        )

    red_zone_pct = (int(red_zone_tds * 100 / red_zone_plays) if red_zone_plays else None)

    # Key player alerts: players with >=2 sacks or >=2 fumble recoveries in season
    alerts = []
    if team:
        f = _season_team_filter(team, current_season)
        player_fields = ('primary_player__id', 'primary_player__first_name', 'primary_player__last_name')

        sack_players = (
            DefenseSnap.objects.filter(**f, play_result=DefenseSnap.PlayResult.SACK)
            .values(*player_fields).annotate(count=Count('id')).filter(count__gte=2)
        )
        for p in sack_players:
            alerts.append({
                'type': 'sacks',
                'player_id': p['primary_player__id'],
                'player_name': f"{p['primary_player__first_name']} {p['primary_player__last_name']}",
                'count': p['count'],
            })

        fr_players = (
            DefenseSnap.objects.filter(**f, play_result=DefenseSnap.PlayResult.FUMBLE_RECOVERY)
            .values(*player_fields).annotate(count=Count('id')).filter(count__gte=2)
        )
        for p in fr_players:
            alerts.append({
                'type': 'fumble_recoveries',
                'player_id': p['primary_player__id'],
                'player_name': f"{p['primary_player__first_name']} {p['primary_player__last_name']}",
                'count': p['count'],
            })

    # Attach computed metrics to context
    metrics = {
        'quarter_trends': quarter_trends,
        'current_streak': current_streak,
        'third_down_attempts': third_down_attempts,
        'third_down_conversions': third_down_conversions,
        'third_down_pct': third_down_pct,
        'red_zone_plays': red_zone_plays,
        'red_zone_tds': red_zone_tds,
        'red_zone_pct': red_zone_pct,
        'alerts': alerts,
    }

    context = {
        'current_season': current_season,
        'stats': stats,
        'recent_games': recent_games,
        'leaders': leaders,
        'metrics': metrics,
    }

    # Use TemplateResponse so tests can inspect context without forcing immediate render
    return TemplateResponse(request, 'dashboard/home.html', context)
