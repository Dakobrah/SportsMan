"""
Dashboard views.
"""
from django.core.cache import cache
from django.shortcuts import render
from django.template.response import TemplateResponse
from django.contrib.auth.decorators import login_required
from django.db.models import Sum, Count, Q, F, Avg

from apps.core import cache as core_cache
from apps.teams.models import Team, Season
from apps.games.models import Game
from apps.snaps.models import BaseSnap
from apps.snaps.models.offense import RunPlay, PassPlay
from apps.snaps.models.defense import DefenseSnap
from apps.games.models import QuarterScore


def _season_team_filter(team, season):
    """Return common filter kwargs for queries scoped to a team + season."""
    return {'game__season': season, 'game__season__team': team}


def _compute_dashboard(current_season, team):
    """
    Compute the dashboard stats + metrics blocks.

    Uses conditional aggregation so each table is scanned once: one Game
    aggregate for the record, one BaseSnap aggregate for play counts, one
    aggregate each for RunPlay/PassPlay covering third downs AND red-zone
    TDs, and a values_list streak scan — ~10 queries total.
    """
    games_qs = Game.objects.select_related('season', 'season__team').order_by('-date')
    if current_season:
        games_qs = games_qs.filter(season=current_season)

    # Record + points in a single aggregate.
    game_agg = games_qs.aggregate(
        wins=Count('id', filter=Q(team_score__gt=F('opponent_score'))),
        losses=Count('id', filter=Q(team_score__lt=F('opponent_score'))),
        points_for=Sum('team_score'),
        points_against=Sum('opponent_score'),
    )

    # Play counts: season total + team red-zone plays in one scan.
    total_plays = 0
    red_zone_plays = 0
    if current_season:
        rz_filter = (
            Q(ball_position__gte=30, game__season__team=team)
            if team else Q(pk__in=[])
        )
        snap_agg = BaseSnap.objects.filter(game__season=current_season).aggregate(
            total=Count('id'),
            red_zone=Count('id', filter=rz_filter),
        )
        total_plays = snap_agg['total']
        red_zone_plays = snap_agg['red_zone']

    stats = {
        'wins': game_agg['wins'],
        'losses': game_agg['losses'],
        'points_for': game_agg['points_for'] or 0,
        'points_against': game_agg['points_against'] or 0,
        'total_plays': total_plays,
    }

    # Recent games (list so the cached value is stable and template-safe)
    recent_games = list(games_qs[:5])

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

    # Current win/loss streak — scan scores without hydrating Game instances.
    current_streak = {'type': None, 'length': 0}
    if team:
        score_rows = (
            games_qs.filter(season__team=team)
            .order_by('-date')
            .values_list('team_score', 'opponent_score')
        )
        streak_type = None
        streak_len = 0
        for team_score, opp_score in score_rows:
            res = 'W' if team_score > opp_score else ('L' if team_score < opp_score else 'T')
            if streak_type is None:
                streak_type = res
                streak_len = 1
            elif res == streak_type:
                streak_len += 1
            else:
                break
        if streak_type:
            current_streak = {'type': streak_type, 'length': streak_len}

    # Third-down conversions + red-zone TDs: one aggregate per snap subtype
    # (Run and Pass live in separate child tables, so two is the floor).
    third_down_attempts = 0
    third_down_conversions = 0
    red_zone_tds = 0
    if team:
        f = _season_team_filter(team, current_season)
        for model in (RunPlay, PassPlay):
            agg = model.objects.filter(**f).aggregate(
                third_att=Count('id', filter=Q(down=3)),
                third_conv=Count('id', filter=Q(down=3, is_first_down=True)),
                rz_tds=Count('id', filter=Q(ball_position__gte=30, is_touchdown=True)),
            )
            third_down_attempts += agg['third_att']
            third_down_conversions += agg['third_conv']
            red_zone_tds += agg['rz_tds']

    third_down_pct = (int(third_down_conversions * 100 / third_down_attempts)
                     if third_down_attempts else None)
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

    return stats, recent_games, metrics


@login_required
def home(request):
    """Main dashboard view."""
    current_season = Season.objects.order_by('-year').first()

    # Use the user's team when available, otherwise fall back to the season's team
    team = getattr(request.user, 'team', None) or (current_season.team if current_season else None)

    # Version-keyed cache: any snap/game change produces a new key, so a
    # short TTL only bounds memory, not staleness.
    season_id = current_season.pk if current_season else None
    version = core_cache.data_version(season_id=season_id)
    key = core_cache.cache_key(
        'dashboard', {'season': season_id, 'team': team.pk if team else None}, version,
    )
    stats, recent_games, metrics = cache.get_or_set(
        key, lambda: _compute_dashboard(current_season, team), 60,
    )

    context = {
        'current_season': current_season,
        'stats': stats,
        'recent_games': recent_games,
        'leaders': {},
        'metrics': metrics,
    }

    # Use TemplateResponse so tests can inspect context without forcing immediate render
    return TemplateResponse(request, 'dashboard/home.html', context)
