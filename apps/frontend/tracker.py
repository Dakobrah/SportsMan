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
import logging

logger = logging.getLogger(__name__)

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


def _parse_request(request, pk):
    """Fetch game by pk and decode the JSON request body. Used by every tracker endpoint.

    Returns (None, error_response) on authorization failure or malformed JSON so callers
    can do: ``game, data = _parse_request(request, pk); if game is None: return data``.
    """
    game = get_object_or_404(Game, pk=pk)

    # Authorization: only members of the game's team may record plays.
    user_team_id = getattr(request.user, 'team_id', None)
    if user_team_id and game.season.team_id != user_team_id:
        return None, JsonResponse({'error': 'Forbidden'}, status=403)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        logger.warning('tracker: malformed JSON body from user %s on game %s', request.user, pk)
        return None, JsonResponse({'error': 'Invalid request body'}, status=400)

    return game, data


def _player_name(player, fallback=''):
    """Return '#12 Smith' format, or fallback if player is None."""
    return f"#{player.number} {player.last_name}" if player else fallback


def _adjust_score(game, *, team_pts=0, opp_pts=0):
    """Add points to team and/or opponent score and persist only the changed fields."""
    if team_pts:
        game.team_score += team_pts
    if opp_pts:
        game.opponent_score += opp_pts
    fields = [f for f, v in (('team_score', team_pts), ('opponent_score', opp_pts)) if v]
    if fields:
        game.save(update_fields=fields)


def _current_state(data):
    """Extract down/distance/ball_position from a request data dict."""
    return {
        'down': data.get('down'),
        'distance': data.get('distance'),
        'ball_position': data.get('ball_position'),
    }


def _tracker_response(play, summary, detail, next_state, game):
    """Standard JSON response shape returned by every tracker_add_* endpoint."""
    return JsonResponse({
        'success': True,
        'play_id': play.id,
        'play_summary': summary,
        'play_detail': detail,
        'next_state': next_state,
        'team_score': game.team_score,
        'opponent_score': game.opponent_score,
    })


def _defense_next_state(play, ball_pos, down, dist, tackle_yds, game):
    """
    Compute next game state after a defensive snap.

    Turnovers (INT/FREC) return possession to us at the same spot.
    Opponent TDs trigger a score update and return the opponent_td situation.
    Normal plays advance the opponent's ball toward our endzone.
    """
    if play.play_result in (DefenseSnap.PlayResult.INTERCEPTION, DefenseSnap.PlayResult.FUMBLE_RECOVERY):
        return {'down': 1, 'distance': 10, 'ball_position': ball_pos, 'situation': 'turnover'}

    new_ball_pos = max(-50, min(50, ball_pos - tackle_yds))

    # Opponent crossed our goal line
    if ball_pos > -50 and ball_pos - tackle_yds <= -50 and tackle_yds > 0:
        _adjust_score(game, opp_pts=6)
        return {'down': None, 'distance': None, 'ball_position': -50, 'situation': 'opponent_td'}

    new_distance = dist - tackle_yds
    new_down = down + 1

    if new_distance <= 0:
        return {'down': 1, 'distance': 10, 'ball_position': new_ball_pos, 'situation': 'normal'}
    if new_down > 4:
        return {'down': 1, 'distance': 10, 'ball_position': new_ball_pos, 'situation': 'turnover_on_downs'}
    return {'down': new_down, 'distance': max(new_distance, 1), 'ball_position': new_ball_pos, 'situation': 'normal'}


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

    # Touchdowns → cap ball at endzone, then extra_point situation
    if result_data.get('is_touchdown'):
        new_pos = min(ball_pos + yards, 50)
        return {
            'down': None,
            'distance': None,
            'ball_position': new_pos,
            'situation': 'extra_point',
        }

    # Turnovers (interception, fumble lost) — ball stays at same spot, possession flips in JS
    if result_data.get('is_interception') or result_data.get('fumble_lost'):
        new_pos = max(-50, min(50, ball_pos + yards))
        return {
            'down': 1,
            'distance': 10,
            'ball_position': new_pos,
            'situation': 'turnover',
        }

    # Special teams — kickoff ball position computed in the endpoint, not here
    if play_type == 'kickoff':
        return {
            'down': 1,
            'distance': 10,
            'ball_position': play_data.get('ball_pos_after', -25),
            'situation': 'normal',
        }

    # Special teams — punt: ball lands at ball_pos + punt_yards; opponent gets it there
    if play_type == 'punt':
        punt_yards = play_data.get('punt_yards', 0)
        if play_data.get('is_touchback'):
            # Touchback: opponent gets ball at their OWN 20 (= OPP 20 from our frame = +30)
            return {'down': 1, 'distance': 10, 'ball_position': 30, 'situation': 'opponent_ball'}
        new_pos = max(-50, min(50, ball_pos + punt_yards))
        return {'down': 1, 'distance': 10, 'ball_position': new_pos, 'situation': 'opponent_ball'}

    # Field goal
    if play_type == 'field_goal':
        fg_result = play_data.get('result', 'MISS')
        if fg_result == 'GOOD':
            # We kick off from our own 35 (OWN 35 = -15)
            return {'down': None, 'distance': None, 'ball_position': -15, 'situation': 'kickoff'}
        # Miss/block → opponent ball at the spot of the kick (no sign flip)
        return {'down': 1, 'distance': 10, 'ball_position': ball_pos, 'situation': 'opponent_ball'}

    # Extra point / 2pt → we kick off from our own 35
    if play_type == 'extra_point':
        return {'down': None, 'distance': None, 'ball_position': -15, 'situation': 'kickoff'}

    # Penalty
    if play_type == 'penalty':
        pen_yards = play_data.get('penalty_yards', 0)
        on_us = play_data.get('on_offense', True)
        accepted = play_data.get('accepted', True)
        if not accepted:
            # Declined: yardage not applied, no play occurred, repeat the same down
            return {'down': down, 'distance': distance, 'ball_position': ball_pos, 'situation': 'normal'}
        if on_us:
            new_pos = max(-50, ball_pos - pen_yards)
            new_distance = distance + pen_yards
        else:
            new_pos = min(50, ball_pos + pen_yards)
            new_distance = distance - pen_yards
        # Automatic first down penalties
        auto_first = play_data.get('auto_first_down', False)
        repeat = play_data.get('repeat_down', False)
        if auto_first or new_distance <= 0:
            return {'down': 1, 'distance': 10, 'ball_position': new_pos, 'situation': 'normal'}
        if repeat:
            return {'down': down, 'distance': max(new_distance, 1), 'ball_position': new_pos, 'situation': 'normal'}
        return {'down': down, 'distance': max(new_distance, 1), 'ball_position': new_pos, 'situation': 'normal'}

    # Normal run/pass plays — cap ball position within field bounds
    new_pos = max(-50, min(50, ball_pos + yards))
    new_distance = distance - yards
    is_first_down = result_data.get('is_first_down', False)

    if is_first_down or new_distance <= 0:
        return {'down': 1, 'distance': 10, 'ball_position': new_pos, 'situation': 'normal'}

    new_down = down + 1
    if new_down > 4:
        # Turnover on downs — ball stays at same spot, possession flips in JS
        return {'down': 1, 'distance': 10, 'ball_position': new_pos, 'situation': 'turnover_on_downs'}

    return {
        'down': new_down,
        'distance': max(new_distance, 1),
        'ball_position': new_pos,
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
    is_new_game = not last_snap  # No snaps = game hasn't started
    
    game_state = {
        'quarter': last_snap.quarter if last_snap else 1,
        'down': last_snap.down if last_snap else 1,
        'distance': last_snap.distance if last_snap else 10,
        'ball_position': last_snap.ball_position if last_snap else -25,
        'next_sequence': (last_snap.sequence_number + 1) if last_snap else 1,
        'team_score': game.team_score,
        'opponent_score': game.opponent_score,
        'coin_toss_complete': not is_new_game,  # Only skip coin toss if game has started
        'possession_team': None,  # Will be set after coin toss decision
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
# COIN TOSS & KICKOFF SETUP
# =============================================================================

@login_required
@require_POST
def tracker_coin_toss(request, pk):
    """Handle coin toss result."""
    game = get_object_or_404(Game, pk=pk)
    data = json.loads(request.body)
    
    # result: 'heads' or 'tails'
    result = data.get('result', 'heads')
    
    return JsonResponse({
        'success': True,
        'coin_result': result,
        'message': f'Coin toss result: {result.upper()}',
    })


@login_required
@require_POST
def tracker_defer_decision(request, pk):
    """Handle defer/play decision from winning team."""
    game = get_object_or_404(Game, pk=pk)
    data = json.loads(request.body)
    
    # choice: 'defer' or 'play'
    choice = data.get('choice', 'defer')
    winning_team = data.get('winning_team')  # 'home' or 'away'
    
    # Determine possession for kickoff
    # If home team wins coin toss and defers, away team gets ball first
    if winning_team == 'home':
        receiving_team = 'away' if choice == 'defer' else 'home'
    else:
        receiving_team = 'home' if choice == 'defer' else 'away'
    
    return JsonResponse({
        'success': True,
        'choice': choice,
        'receiving_team': receiving_team,
        'message': f'{"Receiving" if receiving_team == "away" else "Kicking off"} first',
    })


# =============================================================================
# AJAX endpoints
# =============================================================================

@login_required
@require_POST
def tracker_add_run(request, pk):
    """Add a run play."""
    game, data = _parse_request(request, pk)
    if game is None:
        return data

    ball_pos = data.get('ball_position', 0)
    yards_gained = max(-50 - ball_pos, min(50 - ball_pos, data.get('yards_gained', 0)))
    fumble_lost = data.get('fumble_lost', False)
    is_touchdown = data.get('is_touchdown', False) or (
        not fumble_lost and ball_pos + yards_gained >= 50
    )

    play = RunPlay.objects.create(
        game=game,
        sequence_number=_get_next_sequence(game),
        quarter=data.get('quarter', 1),
        down=data.get('down'),
        distance=data.get('distance'),
        ball_position=ball_pos,
        formation=data.get('formation', ''),
        ball_carrier_id=data.get('ball_carrier') or None,
        yards_gained=yards_gained,
        is_touchdown=is_touchdown,
        is_first_down=data.get('is_first_down', False),
        fumbled=data.get('fumbled', False),
        fumble_lost=fumble_lost,
        notes=data.get('notes', ''),
    )

    if play.is_touchdown:
        _adjust_score(game, team_pts=6)

    result_data = {
        'yards_gained': play.yards_gained,
        'is_touchdown': play.is_touchdown,
        'is_first_down': play.is_first_down,
        'fumble_lost': play.fumble_lost,
    }
    next_state = compute_next_state(_current_state(data), 'run', data, result_data)
    summary = f"{_player_name(play.ball_carrier)} run for {play.yards_gained} yds"
    detail = {
        'type': 'Run',
        'sequence': play.sequence_number,
        'quarter': play.quarter,
        'yards': play.yards_gained,
        'is_touchdown': play.is_touchdown,
        'is_first_down': play.is_first_down,
    }
    return _tracker_response(play, summary, detail, next_state, game)


@login_required
@require_POST
def tracker_add_pass(request, pk):
    """Add a pass play."""
    game, data = _parse_request(request, pk)
    if game is None:
        return data

    ball_pos = data.get('ball_position', 0)
    is_interception = data.get('is_interception', False)
    fumble_lost = data.get('fumble_lost', False)
    yards_gained = max(-50 - ball_pos, min(50 - ball_pos, data.get('yards_gained', 0)))
    is_touchdown = data.get('is_touchdown', False) or (
        not is_interception and not fumble_lost and ball_pos + yards_gained >= 50
    )

    play = PassPlay.objects.create(
        game=game,
        sequence_number=_get_next_sequence(game),
        quarter=data.get('quarter', 1),
        down=data.get('down'),
        distance=data.get('distance'),
        ball_position=ball_pos,
        formation=data.get('formation', ''),
        quarterback_id=data.get('quarterback') or None,
        receiver_id=data.get('receiver') or None,
        target_id=data.get('receiver') or None,
        is_complete=data.get('is_complete', False),
        yards_gained=yards_gained,
        is_touchdown=is_touchdown,
        is_first_down=data.get('is_first_down', False),
        is_interception=is_interception,
        was_sacked=data.get('was_sacked', False),
        sack_yards=data.get('sack_yards', 0),
        fumbled=data.get('fumbled', False),
        fumble_lost=fumble_lost,
        notes=data.get('notes', ''),
    )

    if play.is_touchdown:
        _adjust_score(game, team_pts=6)

    qb_name = _player_name(play.quarterback)
    yards = play.yards_gained
    if play.was_sacked:
        summary = f"{qb_name} sacked for {play.sack_yards} yds"
        yards = play.sack_yards
    elif play.is_complete:
        rec = f" to {_player_name(play.receiver)}" if play.receiver else ''
        summary = f"{qb_name}{rec} for {play.yards_gained} yds"
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
    next_state = compute_next_state(_current_state(data), 'pass', data, result_data)
    detail = {
        'type': 'Pass',
        'sequence': play.sequence_number,
        'quarter': play.quarter,
        'yards': yards,
        'is_complete': play.is_complete,
        'is_touchdown': play.is_touchdown,
        'is_interception': play.is_interception,
    }
    return _tracker_response(play, summary, detail, next_state, game)


@login_required
@require_POST
def tracker_add_penalty(request, pk):
    """Add a penalty play."""
    game, data = _parse_request(request, pk)
    if game is None:
        return data

    on_offense = data.get('on_offense', True)
    accepted = data.get('accepted', True)
    pen_yards = data.get('penalty_yards', 0)
    description = data.get('penalty_description', '')
    common = dict(
        game=game,
        sequence_number=_get_next_sequence(game),
        quarter=data.get('quarter', 1),
        down=data.get('down'),
        distance=data.get('distance'),
        ball_position=data.get('ball_position'),
        formation=data.get('formation', ''),
        penalty_yards=pen_yards if accepted else 0,
        penalty_description=description,
        notes=data.get('notes', ''),
    )

    if on_offense:
        play = OffenseSnap.objects.create(
            **common,
            play_result=OffenseSnap.PlayResult.PENALTY,
            had_penalty=True,
        )
    else:
        play = DefenseSnap.objects.create(
            **common,
            play_result=DefenseSnap.PlayResult.PENALTY,
        )

    status = "accepted" if accepted else "declined"
    summary = f"PENALTY: {description} ({pen_yards} yds, {status})"
    next_state = compute_next_state(_current_state(data), 'penalty', data)
    detail = {
        'type': 'Penalty',
        'sequence': play.sequence_number,
        'quarter': play.quarter,
        'penalty': description,
        'yards': pen_yards,
        'accepted': accepted,
    }
    return _tracker_response(play, summary, detail, next_state, game)


@login_required
@require_POST
def tracker_add_kickoff(request, pk):
    """Add a kickoff play."""
    game, data = _parse_request(request, pk)
    if game is None:
        return data

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

    summary = f"Kickoff for {play.kick_yards} yds" + (" (touchback)" if play.is_touchback else "")

    # Coordinate frame: home endzone = -50, away endzone = +50.
    receiving_team = data.get('receiving_team', 'home')
    home_receives = receiving_team == 'home'
    if play.is_touchback:
        ball_pos_after = -25 if home_receives else 25
    elif play.out_of_bounds:
        ball_pos_after = -10 if home_receives else 10
    else:
        ball_pos_after = -30 if home_receives else 30

    next_state = compute_next_state(
        {'down': None, 'distance': None, 'ball_position': None},
        'kickoff', {**data, 'ball_pos_after': ball_pos_after},
    )
    detail = {'type': 'Kickoff', 'sequence': play.sequence_number, 'quarter': play.quarter}
    return _tracker_response(play, summary, detail, next_state, game)


@login_required
@require_POST
def tracker_add_punt(request, pk):
    """Add a punt play."""
    game, data = _parse_request(request, pk)
    if game is None:
        return data

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

    if play.is_blocked:
        summary = "BLOCKED punt"
    else:
        summary = f"Punt for {play.punt_yards} yds" + (" (touchback)" if play.is_touchback else "")

    next_state = compute_next_state(_current_state(data), 'punt', data)
    detail = {'type': 'Punt', 'sequence': play.sequence_number, 'quarter': play.quarter}
    return _tracker_response(play, summary, detail, next_state, game)


@login_required
@require_POST
def tracker_add_field_goal(request, pk):
    """Add a field goal attempt."""
    game, data = _parse_request(request, pk)
    if game is None:
        return data

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
        _adjust_score(game, team_pts=3)

    labels = {'GOOD': 'GOOD', 'BLOCK': 'BLOCKED', 'MISS': 'MISSED'}
    summary = f"FG {labels.get(play.result, play.result)} ({play.kick_distance} yds)"
    next_state = compute_next_state(_current_state(data), 'field_goal', {'result': play.result})
    detail = {'type': 'Field Goal', 'sequence': play.sequence_number, 'quarter': play.quarter, 'result': play.result}
    return _tracker_response(play, summary, detail, next_state, game)


@login_required
@require_POST
def tracker_add_extra_point(request, pk):
    """Add an extra point / 2-point conversion attempt."""
    game, data = _parse_request(request, pk)
    if game is None:
        return data

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

    if result == 'GOOD':
        _adjust_score(game, team_pts=1 if attempt_type == 'KICK' else 2)

    is_kick = attempt_type == 'KICK'
    summary = f"{'PAT' if is_kick else '2-PT'} {'GOOD' if result == 'GOOD' else ('MISSED' if is_kick else 'FAILED')}"
    next_state = compute_next_state({'down': None, 'distance': None, 'ball_position': 3}, 'extra_point', data)
    detail = {'type': 'Extra Point', 'sequence': play.sequence_number, 'quarter': play.quarter}
    return _tracker_response(play, summary, detail, next_state, game)



@login_required
@require_POST
def tracker_add_defense(request, pk):
    """Add a defensive snap (tackle, sack, interception, fumble recovery)."""
    game, data = _parse_request(request, pk)
    if game is None:
        return data

    play = DefenseSnap.objects.create(
        game=game,
        sequence_number=_get_next_sequence(game),
        quarter=data.get('quarter', 1),
        down=data.get('down'),
        distance=data.get('distance'),
        ball_position=data.get('ball_position'),
        formation=data.get('formation', ''),
        play_result=data.get('play_result', DefenseSnap.PlayResult.TACKLE),
        primary_player_id=data.get('primary_player') or None,
        tackle_yards=data.get('tackle_yards') or None,
        opponent_play_type=data.get('opponent_play_type', ''),
        applied_pressure=data.get('applied_pressure', False),
        forced_incompletion=data.get('forced_incompletion', False),
        interception_return_yards=data.get('interception_return_yards') or None,
        fumble_return_yards=data.get('fumble_return_yards') or None,
        is_defensive_touchdown=data.get('is_defensive_touchdown', False),
        notes=data.get('notes', ''),
    )

    tackle_yds = play.tackle_yards or 0
    summary = f"DEF: {play.get_play_result_display()}"
    if play.opponent_play_type:
        summary += f" ({play.get_opponent_play_type_display()})"
    if play.primary_player:
        summary = f"{_player_name(play.primary_player)} - {summary}"

    # Defensive TD = our team scored (pick-six, fumble return, etc.).
    # Handle before _defense_next_state so opponent-TD detection doesn't also fire.
    if play.is_defensive_touchdown:
        _adjust_score(game, team_pts=6)
        next_state = {
            'down': None,
            'distance': None,
            'ball_position': data.get('ball_position') or 0,
            'situation': 'extra_point',
        }
    else:
        next_state = _defense_next_state(
            play,
            ball_pos=data.get('ball_position') or 0,
            down=data.get('down') or 1,
            dist=data.get('distance') or 10,
            tackle_yds=tackle_yds,
            game=game,
        )
    detail = {
        'type': 'Defense',
        'sequence': play.sequence_number,
        'quarter': play.quarter,
        'yards': tackle_yds,
        'result': play.play_result,
        'opponent_play_type': play.opponent_play_type,
        'is_defensive_touchdown': play.is_defensive_touchdown,
    }
    return _tracker_response(play, summary, detail, next_state, game)


@login_required
@require_POST
def tracker_update_score(request, pk):
    """Manually update the game score."""
    game, data = _parse_request(request, pk)
    if game is None:
        return data

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
    """Delete the most recent play and reverse its score impact."""
    game = get_object_or_404(Game, pk=pk)
    last_snap = game.snaps.order_by('-sequence_number').first()

    if not last_snap:
        return JsonResponse({'success': False, 'error': 'No plays to undo'})

    snap_info = {'id': last_snap.id, 'sequence_number': last_snap.sequence_number}

    actual = last_snap.get_real_instance()
    if isinstance(actual, (RunPlay, PassPlay)) and actual.is_touchdown:
        game.team_score = max(0, game.team_score - 6)
        game.save(update_fields=['team_score'])
    elif isinstance(actual, DefenseSnap) and actual.is_defensive_touchdown:
        game.team_score = max(0, game.team_score - 6)
        game.save(update_fields=['team_score'])
    elif isinstance(actual, DefenseSnap) and not actual.is_defensive_touchdown:
        # Reverse an opponent TD if one was scored on this snap (mirrors _defense_next_state logic)
        tackle_yds = actual.tackle_yards or 0
        ball_pos = actual.ball_position or 0
        if ball_pos > -50 and ball_pos - tackle_yds <= -50 and tackle_yds > 0:
            game.opponent_score = max(0, game.opponent_score - 6)
            game.save(update_fields=['opponent_score'])
    elif isinstance(actual, FieldGoalSnap) and actual.result == 'GOOD':
        game.team_score = max(0, game.team_score - 3)
        game.save(update_fields=['team_score'])
    elif isinstance(actual, ExtraPointSnap) and actual.result == 'GOOD':
        pts = 1 if actual.attempt_type == 'KICK' else 2
        game.team_score = max(0, game.team_score - pts)
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
    limit = min(int(request.GET.get('limit', 10)), 50)
    snaps = game.snaps.order_by('-sequence_number')[:limit]

    plays = []
    for snap in snaps:
        actual = snap.get_real_instance()
        info = _snap_to_dict(snap)

        # Add type-specific summary
        tb = lambda snap: '(TB)' if snap.is_touchback else ''
        if isinstance(actual, RunPlay):
            info['summary'] = f"{_player_name(actual.ball_carrier, 'Unknown')} run for {actual.yards_gained} yds"
            info['yards'] = actual.yards_gained
            info['is_touchdown'] = actual.is_touchdown
        elif isinstance(actual, PassPlay):
            complete = 'complete' if actual.is_complete else 'incomplete'
            info['summary'] = f"{_player_name(actual.quarterback, 'Unknown')} pass {complete} for {actual.yards_gained} yds"
            info['yards'] = actual.yards_gained
            info['is_touchdown'] = actual.is_touchdown
        elif isinstance(actual, FieldGoalSnap):
            info['summary'] = f"FG {actual.result} ({actual.kick_distance} yds)"
            info['yards'] = 0
        elif isinstance(actual, ExtraPointSnap):
            info['summary'] = f"{'PAT' if actual.attempt_type == 'KICK' else '2PT'} {actual.result}"
            info['yards'] = 0
        elif isinstance(actual, KickoffSnap):
            info['summary'] = f"Kickoff {actual.kick_yards} yds{tb(actual)}"
            info['yards'] = 0
        elif isinstance(actual, PuntSnap):
            info['summary'] = f"Punt {actual.punt_yards} yds{tb(actual)}"
            info['yards'] = 0
        else:
            info['summary'] = str(actual)
            info['yards'] = 0

        plays.append(info)

    return JsonResponse({'success': True, 'plays': plays})
