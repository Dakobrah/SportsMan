"""
Live Game Tracker views.

Provides a mobile-first single-page interface for coaches to record
plays during live football games, plus AJAX endpoints for each play type.
"""
import json

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.http import require_POST, require_GET

from apps.games.models import Game
from apps.teams.models import Player
from apps.snaps.models import (
    BaseSnap,
    RunPlay,
    PassPlay,
    DefenseSnap,
    PuntSnap,
    KickoffSnap,
    FieldGoalSnap,
    ExtraPointSnap,
)
from apps.snaps.models.offense import OffenseSnap


# =============================================================================
# Helpers
# =============================================================================

def _get_next_sequence(game):
    last = game.snaps.order_by('-sequence_number').values_list('sequence_number', flat=True).first()
    return (last or 0) + 1


def _format_down(down):
    suffixes = {1: 'st', 2: 'nd', 3: 'rd', 4: 'th'}
    return f"{down}{suffixes.get(down, 'th')}"


def _ball_pos_display(pos):
    """Convert -50..+50 to 'OWN 25' / 'OPP 40' / '50' format."""
    if pos is None:
        return "—"
    if pos == 0:
        return "50"
    if pos < 0:
        return f"OWN {50 + pos}"
    return f"OPP {50 - pos}"


def compute_next_state(current_state, play_type, play_data, result_data=None):
    """
    Calculate next down/distance/ball_position after a play.

    current_state: dict with quarter, down, distance, ball_position
    play_type: 'run', 'pass', 'penalty', 'kickoff', 'punt', 'field_goal', 'extra_point'
    play_data: dict of submitted play fields
    result_data: dict with extra result info (e.g. is_touchdown, yards_gained)
    """
    result_data = result_data or {}
    down = current_state.get('down') or 1
    distance = current_state.get('distance') or 10
    ball_pos = current_state.get('ball_position') or 0
    yards = result_data.get('yards_gained', 0)

    # Touchdowns → kickoff state
    if result_data.get('is_touchdown'):
        return {
            'down': None,
            'distance': None,
            'ball_position': 35,
            'situation': 'extra_point',
        }

    # Turnovers (interception, fumble lost)
    if result_data.get('is_interception') or result_data.get('fumble_lost'):
        new_pos = ball_pos + yards
        return {
            'down': 1,
            'distance': 10,
            'ball_position': -new_pos,
            'situation': 'turnover',
        }

    # Special teams - kickoff
    if play_type == 'kickoff':
        if play_data.get('is_touchback'):
            return {'down': 1, 'distance': 10, 'ball_position': -25, 'situation': 'normal'}
        return {'down': 1, 'distance': 10, 'ball_position': -25, 'situation': 'normal'}

    # Special teams - punt
    if play_type == 'punt':
        punt_yards = play_data.get('punt_yards', 0)
        if play_data.get('is_touchback'):
            return {'down': 1, 'distance': 10, 'ball_position': -20, 'situation': 'opponent_ball'}
        new_pos = ball_pos + punt_yards
        return {'down': 1, 'distance': 10, 'ball_position': -new_pos, 'situation': 'opponent_ball'}

    # Field goal
    if play_type == 'field_goal':
        fg_result = play_data.get('result', 'MISS')
        if fg_result == 'GOOD':
            return {'down': None, 'distance': None, 'ball_position': 35, 'situation': 'kickoff'}
        # Miss/block → opponent ball at spot
        return {'down': 1, 'distance': 10, 'ball_position': -ball_pos, 'situation': 'opponent_ball'}

    # Extra point / 2pt
    if play_type == 'extra_point':
        return {'down': None, 'distance': None, 'ball_position': 35, 'situation': 'kickoff'}

    # Penalty
    if play_type == 'penalty':
        pen_yards = play_data.get('penalty_yards', 0)
        on_us = play_data.get('on_offense', True)
        accepted = play_data.get('accepted', True)
        if not accepted:
            # Declined penalty — same as no play, advance down
            return {'down': down + 1, 'distance': distance, 'ball_position': ball_pos, 'situation': 'normal'}
        if on_us:
            new_pos = ball_pos - pen_yards
            new_distance = distance + pen_yards
        else:
            new_pos = ball_pos + pen_yards
            new_distance = distance - pen_yards
        # Automatic first down penalties
        auto_first = play_data.get('auto_first_down', False)
        repeat = play_data.get('repeat_down', False)
        if auto_first or new_distance <= 0:
            return {'down': 1, 'distance': 10, 'ball_position': new_pos, 'situation': 'normal'}
        if repeat:
            return {'down': down, 'distance': new_distance, 'ball_position': new_pos, 'situation': 'normal'}
        return {'down': down, 'distance': new_distance, 'ball_position': new_pos, 'situation': 'normal'}

    # Normal run/pass plays
    new_pos = ball_pos + yards
    new_distance = distance - yards
    is_first_down = result_data.get('is_first_down', False)

    if is_first_down or new_distance <= 0:
        return {'down': 1, 'distance': 10, 'ball_position': new_pos, 'situation': 'normal'}

    new_down = down + 1
    if new_down > 4:
        return {'down': 1, 'distance': 10, 'ball_position': -new_pos, 'situation': 'turnover_on_downs'}

    return {
        'down': new_down,
        'distance': max(new_distance, 1),
        'ball_position': max(min(new_pos, 50), -50),
        'situation': 'normal',
    }


def _snap_to_dict(snap):
    """Serialize a snap to a dict for JSON responses."""
    return {
        'id': snap.id,
        'sequence_number': snap.sequence_number,
        'quarter': snap.quarter,
        'down': snap.down,
        'distance': snap.distance,
        'ball_position': snap.ball_position,
        'ball_position_display': _ball_pos_display(snap.ball_position),
        'notes': snap.notes or '',
        'type': type(snap).__name__,
    }


# =============================================================================
# Main page view
# =============================================================================

@login_required
def game_tracker(request, pk):
    """Serve the live game tracker page."""
    game = get_object_or_404(
        Game.objects.select_related('season', 'season__team'), pk=pk
    )
    team = game.season.team
    players = Player.objects.filter(team=team, is_active=True).order_by('number')

    # Derive current game state from last snap
    last_snap = game.snaps.order_by('-sequence_number').first()
    game_state = {
        'quarter': last_snap.quarter if last_snap else 1,
        'down': 1,
        'distance': 10,
        'ball_position': 25,
        'next_sequence': (last_snap.sequence_number + 1) if last_snap else 1,
        'team_score': game.team_score,
        'opponent_score': game.opponent_score,
    }

    # Recent plays
    recent_plays = game.snaps.order_by('-sequence_number')[:10]

    # Player data as JSON for JS
    players_list = list(players.values('id', 'number', 'first_name', 'last_name', 'position'))

    context = {
        'game': game,
        'team': team,
        'players': players,
        'game_state_data': game_state,
        'players_data': players_list,
        'recent_plays': recent_plays,
    }
    return render(request, 'games/tracker.html', context)


# =============================================================================
# AJAX endpoints
# =============================================================================

@login_required
@require_POST
def tracker_add_run(request, pk):
    """Add a run play."""
    game = get_object_or_404(Game, pk=pk)
    data = json.loads(request.body)

    play = RunPlay.objects.create(
        game=game,
        sequence_number=_get_next_sequence(game),
        quarter=data.get('quarter', 1),
        down=data.get('down'),
        distance=data.get('distance'),
        ball_position=data.get('ball_position'),
        formation=data.get('formation', ''),
        ball_carrier_id=data.get('ball_carrier') or None,
        yards_gained=data.get('yards_gained', 0),
        is_touchdown=data.get('is_touchdown', False),
        is_first_down=data.get('is_first_down', False),
        fumbled=data.get('fumbled', False),
        fumble_lost=data.get('fumble_lost', False),
        notes=data.get('notes', ''),
    )

    # Auto-update score on TD
    if play.is_touchdown:
        game.team_score += 6
        game.save(update_fields=['team_score'])

    carrier_name = ''
    if play.ball_carrier:
        carrier_name = f"#{play.ball_carrier.number} {play.ball_carrier.last_name}"

    result_data = {
        'yards_gained': play.yards_gained,
        'is_touchdown': play.is_touchdown,
        'is_first_down': play.is_first_down,
        'fumble_lost': play.fumble_lost,
    }
    next_state = compute_next_state(
        {'down': data.get('down'), 'distance': data.get('distance'), 'ball_position': data.get('ball_position')},
        'run', data, result_data
    )

    return JsonResponse({
        'success': True,
        'play_id': play.id,
        'play_summary': f"{carrier_name} run for {play.yards_gained} yds",
        'play_detail': {
            'type': 'Run',
            'sequence': play.sequence_number,
            'quarter': play.quarter,
            'yards': play.yards_gained,
            'is_touchdown': play.is_touchdown,
            'is_first_down': play.is_first_down,
        },
        'next_state': next_state,
        'team_score': game.team_score,
        'opponent_score': game.opponent_score,
    })


@login_required
@require_POST
def tracker_add_pass(request, pk):
    """Add a pass play."""
    game = get_object_or_404(Game, pk=pk)
    data = json.loads(request.body)

    play = PassPlay.objects.create(
        game=game,
        sequence_number=_get_next_sequence(game),
        quarter=data.get('quarter', 1),
        down=data.get('down'),
        distance=data.get('distance'),
        ball_position=data.get('ball_position'),
        formation=data.get('formation', ''),
        quarterback_id=data.get('quarterback') or None,
        receiver_id=data.get('receiver') or None,
        target_id=data.get('receiver') or None,
        is_complete=data.get('is_complete', False),
        yards_gained=data.get('yards_gained', 0),
        is_touchdown=data.get('is_touchdown', False),
        is_first_down=data.get('is_first_down', False),
        is_interception=data.get('is_interception', False),
        was_sacked=data.get('was_sacked', False),
        sack_yards=data.get('sack_yards', 0),
        fumbled=data.get('fumbled', False),
        fumble_lost=data.get('fumble_lost', False),
        notes=data.get('notes', ''),
    )

    if play.is_touchdown:
        game.team_score += 6
        game.save(update_fields=['team_score'])

    qb_name = ''
    if play.quarterback:
        qb_name = f"#{play.quarterback.number} {play.quarterback.last_name}"
    rec_name = ''
    if play.receiver and play.is_complete:
        rec_name = f" to #{play.receiver.number} {play.receiver.last_name}"

    yards = play.yards_gained
    if play.was_sacked:
        summary = f"{qb_name} sacked for {play.sack_yards} yds"
        yards = play.sack_yards
    elif play.is_complete:
        summary = f"{qb_name}{rec_name} for {play.yards_gained} yds"
    elif play.is_interception:
        summary = f"{qb_name} INTERCEPTED"
    else:
        summary = f"{qb_name} pass incomplete"

    result_data = {
        'yards_gained': yards,
        'is_touchdown': play.is_touchdown,
        'is_first_down': play.is_first_down,
        'is_interception': play.is_interception,
        'fumble_lost': play.fumble_lost,
    }
    next_state = compute_next_state(
        {'down': data.get('down'), 'distance': data.get('distance'), 'ball_position': data.get('ball_position')},
        'pass', data, result_data
    )

    return JsonResponse({
        'success': True,
        'play_id': play.id,
        'play_summary': summary,
        'play_detail': {
            'type': 'Pass',
            'sequence': play.sequence_number,
            'quarter': play.quarter,
            'yards': yards,
            'is_complete': play.is_complete,
            'is_touchdown': play.is_touchdown,
            'is_interception': play.is_interception,
        },
        'next_state': next_state,
        'team_score': game.team_score,
        'opponent_score': game.opponent_score,
    })


@login_required
@require_POST
def tracker_add_penalty(request, pk):
    """Add a penalty play."""
    game = get_object_or_404(Game, pk=pk)
    data = json.loads(request.body)

    on_offense = data.get('on_offense', True)
    accepted = data.get('accepted', True)
    pen_yards = data.get('penalty_yards', 0)
    description = data.get('penalty_description', '')

    if on_offense:
        # Penalty on our offense — record as OffenseSnap
        play = OffenseSnap.objects.create(
            game=game,
            sequence_number=_get_next_sequence(game),
            quarter=data.get('quarter', 1),
            down=data.get('down'),
            distance=data.get('distance'),
            ball_position=data.get('ball_position'),
            formation=data.get('formation', ''),
            play_result=OffenseSnap.PlayResult.PENALTY,
            had_penalty=True,
            penalty_yards=pen_yards if accepted else 0,
            penalty_description=description,
            notes=data.get('notes', ''),
        )
    else:
        # Penalty on defense
        play = DefenseSnap.objects.create(
            game=game,
            sequence_number=_get_next_sequence(game),
            quarter=data.get('quarter', 1),
            down=data.get('down'),
            distance=data.get('distance'),
            ball_position=data.get('ball_position'),
            formation=data.get('formation', ''),
            play_result=DefenseSnap.PlayResult.PENALTY,
            penalty_yards=pen_yards if accepted else 0,
            penalty_description=description,
            notes=data.get('notes', ''),
        )

    status = "accepted" if accepted else "declined"
    summary = f"PENALTY: {description} ({pen_yards} yds, {status})"

    next_state = compute_next_state(
        {'down': data.get('down'), 'distance': data.get('distance'), 'ball_position': data.get('ball_position')},
        'penalty', data
    )

    return JsonResponse({
        'success': True,
        'play_id': play.id,
        'play_summary': summary,
        'play_detail': {
            'type': 'Penalty',
            'sequence': play.sequence_number,
            'quarter': play.quarter,
            'penalty': description,
            'yards': pen_yards,
            'accepted': accepted,
        },
        'next_state': next_state,
        'team_score': game.team_score,
        'opponent_score': game.opponent_score,
    })


@login_required
@require_POST
def tracker_add_kickoff(request, pk):
    """Add a kickoff play."""
    game = get_object_or_404(Game, pk=pk)
    data = json.loads(request.body)

    play = KickoffSnap.objects.create(
        game=game,
        sequence_number=_get_next_sequence(game),
        quarter=data.get('quarter', 1),
        down=None,
        distance=None,
        ball_position=data.get('ball_position', 35),
        formation=data.get('formation', ''),
        kicker_id=data.get('kicker') or None,
        kick_yards=data.get('kick_yards', 0),
        is_touchback=data.get('is_touchback', False),
        is_onside_kick=data.get('is_onside_kick', False),
        onside_recovered=data.get('onside_recovered', False),
        out_of_bounds=data.get('out_of_bounds', False),
        notes=data.get('notes', ''),
    )

    summary = f"Kickoff for {play.kick_yards} yds"
    if play.is_touchback:
        summary += " (touchback)"

    next_state = compute_next_state(
        {'down': None, 'distance': None, 'ball_position': 35},
        'kickoff', data
    )

    return JsonResponse({
        'success': True,
        'play_id': play.id,
        'play_summary': summary,
        'play_detail': {'type': 'Kickoff', 'sequence': play.sequence_number, 'quarter': play.quarter},
        'next_state': next_state,
        'team_score': game.team_score,
        'opponent_score': game.opponent_score,
    })


@login_required
@require_POST
def tracker_add_punt(request, pk):
    """Add a punt play."""
    game = get_object_or_404(Game, pk=pk)
    data = json.loads(request.body)

    play = PuntSnap.objects.create(
        game=game,
        sequence_number=_get_next_sequence(game),
        quarter=data.get('quarter', 1),
        down=data.get('down'),
        distance=data.get('distance'),
        ball_position=data.get('ball_position'),
        formation=data.get('formation', ''),
        punter_id=data.get('punter') or None,
        punt_yards=data.get('punt_yards', 0),
        is_blocked=data.get('is_blocked', False),
        is_touchback=data.get('is_touchback', False),
        out_of_bounds=data.get('out_of_bounds', False),
        notes=data.get('notes', ''),
    )

    summary = f"Punt for {play.punt_yards} yds"
    if play.is_touchback:
        summary += " (touchback)"
    if play.is_blocked:
        summary = "BLOCKED punt"

    next_state = compute_next_state(
        {'down': data.get('down'), 'distance': data.get('distance'), 'ball_position': data.get('ball_position')},
        'punt', data
    )

    return JsonResponse({
        'success': True,
        'play_id': play.id,
        'play_summary': summary,
        'play_detail': {'type': 'Punt', 'sequence': play.sequence_number, 'quarter': play.quarter},
        'next_state': next_state,
        'team_score': game.team_score,
        'opponent_score': game.opponent_score,
    })


@login_required
@require_POST
def tracker_add_field_goal(request, pk):
    """Add a field goal attempt."""
    game = get_object_or_404(Game, pk=pk)
    data = json.loads(request.body)

    play = FieldGoalSnap.objects.create(
        game=game,
        sequence_number=_get_next_sequence(game),
        quarter=data.get('quarter', 1),
        down=data.get('down'),
        distance=data.get('distance'),
        ball_position=data.get('ball_position'),
        formation=data.get('formation', ''),
        kicker_id=data.get('kicker') or None,
        kick_distance=data.get('kick_distance', 0),
        result=data.get('result', 'MISS'),
        notes=data.get('notes', ''),
    )

    if play.result == 'GOOD':
        game.team_score += 3
        game.save(update_fields=['team_score'])
        summary = f"FG GOOD ({play.kick_distance} yds)"
    elif play.result == 'BLOCK':
        summary = f"FG BLOCKED ({play.kick_distance} yds)"
    else:
        summary = f"FG MISSED ({play.kick_distance} yds)"

    next_state = compute_next_state(
        {'down': data.get('down'), 'distance': data.get('distance'), 'ball_position': data.get('ball_position')},
        'field_goal', {'result': play.result}
    )

    return JsonResponse({
        'success': True,
        'play_id': play.id,
        'play_summary': summary,
        'play_detail': {'type': 'Field Goal', 'sequence': play.sequence_number, 'quarter': play.quarter, 'result': play.result},
        'next_state': next_state,
        'team_score': game.team_score,
        'opponent_score': game.opponent_score,
    })


@login_required
@require_POST
def tracker_add_extra_point(request, pk):
    """Add an extra point / 2-point conversion attempt."""
    game = get_object_or_404(Game, pk=pk)
    data = json.loads(request.body)

    attempt_type = data.get('attempt_type', 'KICK')
    result = data.get('result', 'MISS')

    play = ExtraPointSnap.objects.create(
        game=game,
        sequence_number=_get_next_sequence(game),
        quarter=data.get('quarter', 1),
        down=None,
        distance=None,
        ball_position=data.get('ball_position', 3),
        formation=data.get('formation', ''),
        attempt_type=attempt_type,
        result=result,
        kicker_id=data.get('kicker') or None,
        ball_carrier_id=data.get('ball_carrier') or None,
        passer_id=data.get('passer') or None,
        receiver_id=data.get('receiver') or None,
        notes=data.get('notes', ''),
    )

    # Score updates
    if result == 'GOOD':
        if attempt_type == 'KICK':
            game.team_score += 1
        else:
            game.team_score += 2
        game.save(update_fields=['team_score'])

    if attempt_type == 'KICK':
        summary = f"PAT {'GOOD' if result == 'GOOD' else result}"
    else:
        summary = f"2-PT {'GOOD' if result == 'GOOD' else 'FAILED'}"

    next_state = compute_next_state(
        {'down': None, 'distance': None, 'ball_position': 3},
        'extra_point', data
    )

    return JsonResponse({
        'success': True,
        'play_id': play.id,
        'play_summary': summary,
        'play_detail': {'type': 'Extra Point', 'sequence': play.sequence_number, 'quarter': play.quarter},
        'next_state': next_state,
        'team_score': game.team_score,
        'opponent_score': game.opponent_score,
    })


@login_required
@require_POST
def tracker_update_score(request, pk):
    """Manually update the game score."""
    game = get_object_or_404(Game, pk=pk)
    data = json.loads(request.body)

    if 'team_score' in data:
        game.team_score = int(data['team_score'])
    if 'opponent_score' in data:
        game.opponent_score = int(data['opponent_score'])
    game.save(update_fields=['team_score', 'opponent_score'])

    return JsonResponse({
        'success': True,
        'team_score': game.team_score,
        'opponent_score': game.opponent_score,
    })


@login_required
@require_POST
def tracker_undo_play(request, pk):
    """Delete the most recent play."""
    game = get_object_or_404(Game, pk=pk)
    last_snap = game.snaps.order_by('-sequence_number').first()

    if not last_snap:
        return JsonResponse({'success': False, 'error': 'No plays to undo'})

    snap_info = {
        'id': last_snap.id,
        'sequence_number': last_snap.sequence_number,
    }

    # Check if we need to reverse score changes
    actual = last_snap.get_real_instance()
    if isinstance(actual, RunPlay) and actual.is_touchdown:
        game.team_score = max(0, game.team_score - 6)
        game.save(update_fields=['team_score'])
    elif isinstance(actual, PassPlay) and actual.is_touchdown:
        game.team_score = max(0, game.team_score - 6)
        game.save(update_fields=['team_score'])
    elif isinstance(actual, FieldGoalSnap) and actual.result == 'GOOD':
        game.team_score = max(0, game.team_score - 3)
        game.save(update_fields=['team_score'])
    elif isinstance(actual, ExtraPointSnap) and actual.result == 'GOOD':
        if actual.attempt_type == 'KICK':
            game.team_score = max(0, game.team_score - 1)
        else:
            game.team_score = max(0, game.team_score - 2)
        game.save(update_fields=['team_score'])

    last_snap.delete()

    # Get new last snap for state
    new_last = game.snaps.order_by('-sequence_number').first()

    return JsonResponse({
        'success': True,
        'deleted': snap_info,
        'team_score': game.team_score,
        'opponent_score': game.opponent_score,
    })


@login_required
@require_GET
def tracker_recent_plays(request, pk):
    """Get recent plays for the feed."""
    game = get_object_or_404(Game, pk=pk)
    limit = int(request.GET.get('limit', 10))
    snaps = game.snaps.order_by('-sequence_number')[:limit]

    plays = []
    for snap in snaps:
        actual = snap.get_real_instance()
        info = _snap_to_dict(snap)

        # Add type-specific summary
        if isinstance(actual, RunPlay):
            carrier = actual.ball_carrier
            info['summary'] = f"{'#' + str(carrier.number) + ' ' + carrier.last_name if carrier else 'Unknown'} run for {actual.yards_gained} yds"
            info['yards'] = actual.yards_gained
            info['is_touchdown'] = actual.is_touchdown
        elif isinstance(actual, PassPlay):
            qb = actual.quarterback
            info['summary'] = f"{'#' + str(qb.number) + ' ' + qb.last_name if qb else 'Unknown'} pass {'complete' if actual.is_complete else 'incomplete'} for {actual.yards_gained} yds"
            info['yards'] = actual.yards_gained
            info['is_touchdown'] = actual.is_touchdown
        elif isinstance(actual, FieldGoalSnap):
            info['summary'] = f"FG {actual.result} ({actual.kick_distance} yds)"
            info['yards'] = 0
        elif isinstance(actual, ExtraPointSnap):
            info['summary'] = f"{'PAT' if actual.attempt_type == 'KICK' else '2PT'} {actual.result}"
            info['yards'] = 0
        elif isinstance(actual, KickoffSnap):
            info['summary'] = f"Kickoff {actual.kick_yards} yds{'(TB)' if actual.is_touchback else ''}"
            info['yards'] = 0
        elif isinstance(actual, PuntSnap):
            info['summary'] = f"Punt {actual.punt_yards} yds{'(TB)' if actual.is_touchback else ''}"
            info['yards'] = 0
        else:
            info['summary'] = str(actual)
            info['yards'] = 0

        plays.append(info)

    return JsonResponse({'success': True, 'plays': plays})
