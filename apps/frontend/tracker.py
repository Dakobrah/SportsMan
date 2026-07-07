"""
Live Game Tracker views.

Provides a mobile-first single-page interface for coaches to record plays
during live football games, plus JSON endpoints for each play type.

The server is authoritative for game state: every play endpoint reads and
advances the game's ``GameState`` row (possession, down/distance, ball
position, phase) inside a transaction holding the Game row lock, ignoring
any situation fields the client submits. Clients stay in sync by polling
``tracker_state`` with their last-seen version. Play rules live in the
pure module :mod:`apps.frontend.tracker_logic`; snap serialization in
:mod:`apps.frontend.play_feed`. See docs/DESIGN-live-tracker.md.
"""
import json
import logging

from django.contrib.auth.decorators import login_required
from django.db import transaction, IntegrityError
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.http import require_POST, require_GET

logger = logging.getLogger(__name__)

from apps.games.models import Game, GameState
from apps.teams.models import Player
from apps.snaps.models import (
    RunPlay,
    PassPlay,
    DefenseSnap,
    PuntSnap,
    KickoffSnap,
    FieldGoalSnap,
    ExtraPointSnap,
)
from apps.snaps.models.offense import OffenseSnap
from apps.frontend import play_feed, tracker_logic


# =============================================================================
# Helpers
# =============================================================================

def _parse_request(request, pk):
    """Fetch game by pk and decode the JSON request body. Used by every tracker endpoint.

    Returns (None, error_response) on authorization failure or malformed JSON so callers
    can do: ``game, data = _parse_request(request, pk); if game is None: return data``.
    """
    game = get_object_or_404(Game, pk=pk)

    # Authorization: staff can access any game; coaches only their own team.
    if not request.user.is_staff:
        user_team_id = getattr(request.user, 'team_id', None)
        if not user_team_id or game.season.team_id != user_team_id:
            return None, JsonResponse({'error': 'Forbidden'}, status=403)

    body = request.body
    if not body:
        return game, {}
    try:
        data = json.loads(body)
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


def _conflict_response():
    """Return a 409 when a duplicate sequence_number IntegrityError is raised.

    This protects against the rare race where two concurrent requests (or a
    client double-submit) collide on the unique_together (game, sequence_number)
    constraint.  The client should treat 409 as "play already recorded; ignore".
    """
    return JsonResponse(
        {'error': 'Play already recorded — possible duplicate submission.'},
        status=409,
    )


def _tracker_response(play, summary, detail, next_state, game, gs):
    """Standard JSON response shape returned by every tracker_add_* endpoint.

    Keeps the legacy keys (next_state etc.) and adds the authoritative
    'state' + 'version' so clients can adopt the server's game state.
    """
    return JsonResponse({
        'success': True,
        'play_id': play.id,
        'play_summary': summary,
        'play_detail': detail,
        'next_state': next_state,
        'team_score': game.team_score,
        'opponent_score': game.opponent_score,
        'state': _serialize_state(gs),
        'version': gs.version,
    })


# =============================================================================
# GameState helpers — the server-authoritative live state
# =============================================================================

# Maps a play outcome situation to the persistent phase stored on GameState.
# Transient outcomes (turnover, opponent_ball, ...) all resolve to the
# 'normal' phase — the possession field records who has the ball.
_PHASE_MAP = {
    'normal': 'normal',
    'turnover': 'normal',
    'turnover_on_downs': 'normal',
    'opponent_ball': 'normal',
    'extra_point': 'extra_point',
    'kickoff': 'kickoff',
    'safety': 'free_kick_us',       # we conceded 2 → we free-kick
    'safety_kick': 'free_kick_opp',  # we scored 2 → opponent free-kicks
    'opponent_td': 'opponent_td',
}


def _get_game_state(game):
    """
    Fetch (or lazily create) the game's live state row.

    Writers MUST already hold the Game row lock (select_for_update on Game);
    GameState itself is never locked directly. For games recorded before
    GameState existed, defaults are derived from the last snap — possession
    then self-corrects on the next recorded play.
    """
    try:
        return game.live_state
    except GameState.DoesNotExist:
        last_snap = game.snaps.order_by('-sequence_number').first()
        gs, _created = GameState.objects.get_or_create(
            game=game,
            defaults={
                'quarter': last_snap.quarter if last_snap else 1,
                'down': last_snap.down if last_snap else None,
                'distance': last_snap.distance if last_snap else None,
                'ball_position': last_snap.ball_position if last_snap else None,
                'los_position': last_snap.ball_position if last_snap else None,
                'situation': 'normal' if last_snap else 'pregame',
                'last_sequence': last_snap.sequence_number if last_snap else 0,
            },
        )
        return gs


def _gs_state(gs):
    """GameState as the current_state dict the pure logic functions take."""
    return {'down': gs.down, 'distance': gs.distance, 'ball_position': gs.ball_position}


def _state_snapshot(gs):
    """Snapshot stored on each snap as prior_state (scores deliberately excluded)."""
    return {
        'quarter': gs.quarter,
        'down': gs.down,
        'distance': gs.distance,
        'ball_position': gs.ball_position,
        'los_position': gs.los_position,
        'possession': gs.possession,
        'situation': gs.situation,
    }


def _serialize_state(gs):
    """Full GameState payload sent to clients (page seed, play responses, polling)."""
    return {
        'quarter': gs.quarter,
        'down': gs.down,
        'distance': gs.distance,
        'ball_position': gs.ball_position,
        'los_position': gs.los_position,
        'possession': gs.possession or None,
        'situation': gs.situation,
        'coin_toss_winner': gs.coin_toss_winner or None,
        'coin_toss_choice': gs.coin_toss_choice or None,
        'version': gs.version,
        'last_sequence': gs.last_sequence,
    }


def _flip(team):
    return 'away' if team == 'home' else 'home'


def _possession_after(situation, current):
    """Who has the ball after an outcome — mirrors the client's resolvePossession."""
    if situation in ('turnover', 'turnover_on_downs'):
        return _flip(current) if current else 'home'
    if situation in ('opponent_ball', 'opponent_td', 'safety_kick'):
        return 'away'
    if situation in ('extra_point', 'safety'):
        return 'home'
    return current  # normal / kickoff — possession unchanged


def _begin_play(gs, kind):
    """
    Shared setup for every play endpoint (with the Game lock held): infer
    possession from the play kind — recording an offensive play means we have
    the ball, a defensive snap means the opponent does — then snapshot the
    pre-play state for undo. kind: 'offense' | 'defense' | 'neutral'.
    """
    if kind == 'offense':
        gs.possession = 'home'
    elif kind == 'defense':
        gs.possession = 'away'
    return _state_snapshot(gs)


def _apply_outcome(gs, outcome, *, possession=None):
    """Advance GameState by a play outcome and bump version/last_sequence."""
    # The line of scrimmage is where the ball is spotted for the NEXT snap —
    # it follows the ball after every play, offense or defense. The line
    # that stays fixed for a series is the first-down line (ball + distance,
    # computed client-side).
    gs.los_position = outcome.ball_position
    gs.down = outcome.down
    gs.distance = outcome.distance
    gs.ball_position = outcome.ball_position
    gs.situation = _PHASE_MAP.get(outcome.situation, 'normal')
    if possession is not None:
        gs.possession = possession
    else:
        gs.possession = _possession_after(outcome.situation, gs.possession)
    gs.last_sequence += 1
    gs.version += 1
    gs.save()


def _defense_next_state(play, ball_pos, down, dist, tackle_yds, game):
    """
    Compute next game state after a defensive snap.

    Thin wrapper over tracker_logic.next_state_defense that applies any
    scoring side effects (opponent TD, defensive safety) to the game.
    """
    outcome = tracker_logic.next_state_defense(
        {'down': down, 'distance': dist, 'ball_position': ball_pos},
        play.play_result,
        return_yards=play.interception_return_yards or play.fumble_return_yards or 0,
        tackle_yards=tackle_yds,
    )
    if outcome.team_pts or outcome.opp_pts:
        _adjust_score(game, team_pts=outcome.team_pts, opp_pts=outcome.opp_pts)
    return outcome.as_state()


def compute_next_state(current_state, play_type, play_data, result_data=None):
    """
    Calculate next down/distance/ball_position after a play.

    current_state: dict with quarter, down, distance, ball_position
    play_type: 'run', 'pass', 'penalty', 'kickoff', 'punt', 'field_goal', 'extra_point'
    play_data: dict of submitted play fields
    result_data: dict with extra result info (e.g. is_touchdown, yards_gained)
    """
    return tracker_logic.compute_outcome(current_state, play_type, play_data, result_data).as_state()


# =============================================================================
# Main page view
# =============================================================================

@login_required
def game_tracker(request, pk):
    """Serve the live game tracker page."""
    from django.core.exceptions import PermissionDenied
    game = get_object_or_404(
        Game.objects.select_related('season', 'season__team'), pk=pk
    )
    if not request.user.is_staff:
        user_team_id = getattr(request.user, 'team_id', None)
        if not user_team_id or game.season.team_id != user_team_id:
            raise PermissionDenied
    team = game.season.team
    players = Player.objects.filter(team=team, is_active=True).order_by('number')

    # Seed the client from the server-authoritative live state.
    gs = _get_game_state(game)
    game_state = {
        **_serialize_state(gs),
        'next_sequence': gs.last_sequence + 1,
        'team_score': game.team_score,
        'opponent_score': game.opponent_score,
        'coin_toss_complete': gs.situation != 'pregame',
        'possession_team': gs.possession or None,
        'viewer_mode': request.GET.get('view') == '1',
    }

    # Recent plays, pre-serialized to the same shape the JS feed renders.
    recent_plays = play_feed.serialize_recent_plays(game, limit=10)

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
# COIN TOSS & GAME-STATE SETUP
# =============================================================================

@login_required
@require_POST
def tracker_coin_toss(request, pk):
    """
    Record the result of the on-field coin toss.

    POST {winner: 'home'|'away', choice: 'receive'|'defer'} — the winner and
    what they elected. Persists the toss and moves the game into the kickoff
    phase; possession is set to the KICKING team until the kickoff resolves it.
    """
    game, data = _parse_request(request, pk)
    if game is None:
        return data

    winner = data.get('winner')
    choice = data.get('choice')
    if winner not in ('home', 'away') or choice not in ('receive', 'defer'):
        return JsonResponse({'error': 'Invalid coin toss data'}, status=400)

    receiving_team = winner if choice == 'receive' else _flip(winner)

    with transaction.atomic():
        game = Game.objects.select_for_update().get(pk=game.pk)
        gs = _get_game_state(game)
        gs.coin_toss_winner = winner
        gs.coin_toss_choice = choice
        gs.possession = _flip(receiving_team)  # kicking team holds the ball to kick
        gs.situation = 'kickoff'
        gs.version += 1
        gs.save()

    return JsonResponse({
        'success': True,
        'receiving_team': receiving_team,
        'state': _serialize_state(gs),
        'version': gs.version,
    })


@login_required
@require_POST
def tracker_update_quarter(request, pk):
    """Persist a quarter change. POST {quarter: 1..9}."""
    game, data = _parse_request(request, pk)
    if game is None:
        return data

    try:
        quarter = int(data.get('quarter'))
    except (TypeError, ValueError):
        return JsonResponse({'error': 'Quarter must be a number'}, status=400)
    if not 1 <= quarter <= 9:
        return JsonResponse({'error': 'Invalid quarter'}, status=400)

    with transaction.atomic():
        game = Game.objects.select_for_update().get(pk=game.pk)
        gs = _get_game_state(game)
        gs.quarter = quarter
        gs.version += 1
        gs.save()

    return JsonResponse({
        'success': True,
        'state': _serialize_state(gs),
        'version': gs.version,
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

    try:
        with transaction.atomic():
            game = Game.objects.select_for_update().get(pk=game.pk)
            gs = _get_game_state(game)
            prior = _begin_play(gs, 'offense')

            ball_pos = gs.ball_position if gs.ball_position is not None else 0
            raw_yards = data.get('yards_gained', 0)
            yards_gained = max(-50 - ball_pos, min(50 - ball_pos, raw_yards))
            fumble_lost = data.get('fumble_lost', False)
            is_touchdown = data.get('is_touchdown', False) or (
                not fumble_lost and ball_pos + yards_gained >= 50
            )
            is_safety = not is_touchdown and not fumble_lost and ball_pos + raw_yards <= -50

            result_data = {
                'yards_gained': yards_gained,
                'is_touchdown': is_touchdown,
                'is_first_down': data.get('is_first_down', False),
                'fumble_lost': fumble_lost,
                'is_safety': is_safety,
            }
            outcome = tracker_logic.next_state_run_pass(_gs_state(gs), result_data)

            play = RunPlay.objects.create(
                game=game,
                sequence_number=gs.last_sequence + 1,
                quarter=gs.quarter,
                down=gs.down,
                distance=gs.distance,
                ball_position=gs.ball_position,
                formation=data.get('formation', ''),
                ball_carrier_id=data.get('ball_carrier') or None,
                yards_gained=yards_gained,
                is_touchdown=is_touchdown,
                is_first_down=data.get('is_first_down', False),
                fumbled=data.get('fumbled', False),
                fumble_lost=fumble_lost,
                notes=data.get('notes', ''),
                score_delta_team=outcome.team_pts,
                score_delta_opponent=outcome.opp_pts,
                prior_state=prior,
            )
            _adjust_score(game, team_pts=outcome.team_pts, opp_pts=outcome.opp_pts)
            _apply_outcome(gs, outcome)
    except IntegrityError:
        logger.warning('tracker_add_run: duplicate sequence for game %s by user %s', pk, request.user)
        return _conflict_response()

    summary = f"{_player_name(play.ball_carrier)} run for {play.yards_gained} yds"
    detail = {
        'type': 'Run',
        'sequence': play.sequence_number,
        'quarter': play.quarter,
        'yards': play.yards_gained,
        'is_touchdown': play.is_touchdown,
        'is_first_down': play.is_first_down,
    }
    return _tracker_response(play, summary, detail, outcome.as_state(), game, gs)


@login_required
@require_POST
def tracker_add_pass(request, pk):
    """Add a pass play."""
    game, data = _parse_request(request, pk)
    if game is None:
        return data

    try:
        with transaction.atomic():
            game = Game.objects.select_for_update().get(pk=game.pk)
            gs = _get_game_state(game)
            prior = _begin_play(gs, 'offense')

            ball_pos = gs.ball_position if gs.ball_position is not None else 0
            is_complete = data.get('is_complete', False)
            is_interception = data.get('is_interception', False)
            was_sacked = data.get('was_sacked', False)
            fumble_lost = data.get('fumble_lost', False)

            # Incomplete passes return the ball to the line of scrimmage — zero yards.
            # Sacks and interceptions are exempt (they have their own yardage semantics).
            raw_yards = data.get('yards_gained', 0)
            if not is_complete and not is_interception and not was_sacked:
                raw_yards = 0
            yards_gained = max(-50 - ball_pos, min(50 - ball_pos, raw_yards))
            is_touchdown = data.get('is_touchdown', False) or (
                not is_interception and not fumble_lost and ball_pos + yards_gained >= 50
            )
            raw_end = ball_pos + (data.get('sack_yards', 0) if was_sacked else data.get('yards_gained', 0))
            is_safety = not is_touchdown and not is_interception and not fumble_lost and raw_end <= -50

            effective_yards = data.get('sack_yards', 0) if was_sacked else yards_gained
            result_data = {
                'yards_gained': effective_yards,
                'is_touchdown': is_touchdown,
                'is_first_down': data.get('is_first_down', False),
                'is_interception': is_interception,
                'fumble_lost': fumble_lost,
                'is_safety': is_safety,
            }
            outcome = tracker_logic.next_state_run_pass(_gs_state(gs), result_data)

            play = PassPlay.objects.create(
                game=game,
                sequence_number=gs.last_sequence + 1,
                quarter=gs.quarter,
                down=gs.down,
                distance=gs.distance,
                ball_position=gs.ball_position,
                formation=data.get('formation', ''),
                quarterback_id=data.get('quarterback') or None,
                receiver_id=data.get('receiver') or None,
                target_id=data.get('target') or None,
                is_complete=is_complete,
                yards_gained=yards_gained,
                is_touchdown=is_touchdown,
                is_first_down=data.get('is_first_down', False),
                is_interception=is_interception,
                was_sacked=was_sacked,
                sack_yards=data.get('sack_yards', 0),
                fumbled=data.get('fumbled', False),
                fumble_lost=fumble_lost,
                notes=data.get('notes', ''),
                score_delta_team=outcome.team_pts,
                score_delta_opponent=outcome.opp_pts,
                prior_state=prior,
            )
            _adjust_score(game, team_pts=outcome.team_pts, opp_pts=outcome.opp_pts)
            _apply_outcome(gs, outcome)
    except IntegrityError:
        logger.warning('tracker_add_pass: duplicate sequence for game %s by user %s', pk, request.user)
        return _conflict_response()

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

    detail = {
        'type': 'Pass',
        'sequence': play.sequence_number,
        'quarter': play.quarter,
        'yards': yards,
        'is_complete': play.is_complete,
        'is_touchdown': play.is_touchdown,
        'is_interception': play.is_interception,
    }
    return _tracker_response(play, summary, detail, outcome.as_state(), game, gs)


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

    try:
        with transaction.atomic():
            game = Game.objects.select_for_update().get(pk=game.pk)
            gs = _get_game_state(game)
            # The penalty state machine works in our-offense frame.
            prior = _begin_play(gs, 'offense')
            outcome = tracker_logic.next_state_penalty(_gs_state(gs), data)

            common = dict(
                game=game,
                sequence_number=gs.last_sequence + 1,
                quarter=gs.quarter,
                down=gs.down,
                distance=gs.distance,
                ball_position=gs.ball_position,
                formation=data.get('formation', ''),
                penalty_yards=pen_yards if accepted else 0,
                penalty_description=description,
                notes=data.get('notes', ''),
                score_delta_team=outcome.team_pts,
                score_delta_opponent=outcome.opp_pts,
                prior_state=prior,
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
            _apply_outcome(gs, outcome)
    except IntegrityError:
        logger.warning('tracker_add_penalty: duplicate sequence for game %s by user %s', pk, request.user)
        return _conflict_response()

    status = "accepted" if accepted else "declined"
    summary = f"PENALTY: {description} ({pen_yards} yds, {status})"
    detail = {
        'type': 'Penalty',
        'sequence': play.sequence_number,
        'quarter': play.quarter,
        'penalty': description,
        'yards': pen_yards,
        'accepted': accepted,
    }
    return _tracker_response(play, summary, detail, outcome.as_state(), game, gs)


@login_required
@require_POST
def tracker_add_kickoff(request, pk):
    """Add a kickoff play."""
    game, data = _parse_request(request, pk)
    if game is None:
        return data

    try:
        with transaction.atomic():
            game = Game.objects.select_for_update().get(pk=game.pk)
            gs = _get_game_state(game)
            # Kickoffs don't imply possession; the kicking team is whoever
            # holds the ball going into this phase.
            prior = _begin_play(gs, 'neutral')

            # Coordinate frame: home endzone = -50, away endzone = +50.
            # NFHS spots: touchback → receiver's 20; kick out of bounds →
            # receiver's 35; otherwise assume a return out to the 20.
            receiving_team = data.get('receiving_team') or (
                _flip(gs.possession) if gs.possession else 'home'
            )
            home_receives = receiving_team == 'home'
            is_touchback = data.get('is_touchback', False)
            out_of_bounds = data.get('out_of_bounds', False)
            if is_touchback:
                ball_pos_after = -30 if home_receives else 30
            elif out_of_bounds:
                ball_pos_after = -15 if home_receives else 15
            else:
                ball_pos_after = -30 if home_receives else 30

            outcome = tracker_logic.next_state_kickoff({**data, 'ball_pos_after': ball_pos_after})

            play = KickoffSnap.objects.create(
                game=game,
                sequence_number=gs.last_sequence + 1,
                quarter=gs.quarter,
                down=None,
                distance=None,
                ball_position=gs.ball_position,
                formation=data.get('formation', ''),
                kicker_id=data.get('kicker') or None,
                kick_yards=data.get('kick_yards', 0),
                is_touchback=is_touchback,
                is_onside_kick=data.get('is_onside_kick', False),
                onside_recovered=data.get('onside_recovered', False),
                out_of_bounds=out_of_bounds,
                notes=data.get('notes', ''),
                score_delta_team=outcome.team_pts,
                score_delta_opponent=outcome.opp_pts,
                prior_state=prior,
            )
            # The kickoff resolves possession directly: 'normal' = we received.
            _apply_outcome(gs, outcome,
                           possession='home' if outcome.situation == 'normal' else 'away')
    except IntegrityError:
        logger.warning('tracker_add_kickoff: duplicate sequence for game %s by user %s', pk, request.user)
        return _conflict_response()

    summary = f"Kickoff for {play.kick_yards} yds" + (" (touchback)" if play.is_touchback else "")
    detail = {'type': 'Kickoff', 'sequence': play.sequence_number, 'quarter': play.quarter}
    return _tracker_response(play, summary, detail, outcome.as_state(), game, gs)


@login_required
@require_POST
def tracker_add_punt(request, pk):
    """Add a punt play."""
    game, data = _parse_request(request, pk)
    if game is None:
        return data

    is_blocked = data.get('is_blocked', False)
    blocked_td = is_blocked and data.get('blocked_td', False)
    blocked_recovered_by = data.get('blocked_recovered_by', 'opponent') if is_blocked else ''

    try:
        with transaction.atomic():
            game = Game.objects.select_for_update().get(pk=game.pk)
            gs = _get_game_state(game)
            prior = _begin_play(gs, 'offense')
            outcome = tracker_logic.next_state_punt(_gs_state(gs), data)

            play = PuntSnap.objects.create(
                game=game,
                sequence_number=gs.last_sequence + 1,
                quarter=gs.quarter,
                down=gs.down,
                distance=gs.distance,
                ball_position=gs.ball_position,
                formation=data.get('formation', ''),
                punter_id=data.get('punter') or None,
                punt_yards=data.get('punt_yards', 0),
                is_blocked=is_blocked,
                blocked_recovered_by=blocked_recovered_by,
                blocked_td=blocked_td,
                is_touchback=data.get('is_touchback', False),
                out_of_bounds=data.get('out_of_bounds', False),
                notes=data.get('notes', ''),
                score_delta_team=outcome.team_pts,
                score_delta_opponent=outcome.opp_pts,
                prior_state=prior,
            )
            _adjust_score(game, team_pts=outcome.team_pts, opp_pts=outcome.opp_pts)
            _apply_outcome(gs, outcome)
    except IntegrityError:
        logger.warning('tracker_add_punt: duplicate sequence for game %s by user %s', pk, request.user)
        return _conflict_response()

    if is_blocked:
        if blocked_td:
            summary = "BLOCKED punt — returned for TD!"
        elif blocked_recovered_by == 'us':
            summary = "BLOCKED punt — recovered by us"
        else:
            summary = "BLOCKED punt — opponent ball"
    else:
        summary = f"Punt for {play.punt_yards} yds" + (" (touchback)" if play.is_touchback else "")

    detail = {
        'type': 'Punt',
        'sequence': play.sequence_number,
        'quarter': play.quarter,
        'is_blocked': is_blocked,
        'blocked_td': blocked_td,
    }
    return _tracker_response(play, summary, detail, outcome.as_state(), game, gs)


@login_required
@require_POST
def tracker_add_field_goal(request, pk):
    """Add a field goal attempt."""
    game, data = _parse_request(request, pk)
    if game is None:
        return data

    try:
        with transaction.atomic():
            game = Game.objects.select_for_update().get(pk=game.pk)
            gs = _get_game_state(game)
            prior = _begin_play(gs, 'offense')
            result = data.get('result', 'MISS')
            outcome = tracker_logic.next_state_field_goal(_gs_state(gs), {'result': result})

            play = FieldGoalSnap.objects.create(
                game=game,
                sequence_number=gs.last_sequence + 1,
                quarter=gs.quarter,
                down=gs.down,
                distance=gs.distance,
                ball_position=gs.ball_position,
                formation=data.get('formation', ''),
                kicker_id=data.get('kicker') or None,
                kick_distance=data.get('kick_distance', 0),
                result=result,
                notes=data.get('notes', ''),
                score_delta_team=outcome.team_pts,
                score_delta_opponent=outcome.opp_pts,
                prior_state=prior,
            )
            _adjust_score(game, team_pts=outcome.team_pts, opp_pts=outcome.opp_pts)
            _apply_outcome(gs, outcome)
    except IntegrityError:
        logger.warning('tracker_add_field_goal: duplicate sequence for game %s by user %s', pk, request.user)
        return _conflict_response()

    labels = {'GOOD': 'GOOD', 'BLOCK': 'BLOCKED', 'MISS': 'MISSED'}
    summary = f"FG {labels.get(play.result, play.result)} ({play.kick_distance} yds)"
    detail = {'type': 'Field Goal', 'sequence': play.sequence_number, 'quarter': play.quarter, 'result': play.result}
    return _tracker_response(play, summary, detail, outcome.as_state(), game, gs)


@login_required
@require_POST
def tracker_add_extra_point(request, pk):
    """Add an extra point / 2-point conversion attempt."""
    game, data = _parse_request(request, pk)
    if game is None:
        return data

    attempt_type = data.get('attempt_type', 'KICK')
    result = data.get('result', 'MISS')

    try:
        with transaction.atomic():
            game = Game.objects.select_for_update().get(pk=game.pk)
            gs = _get_game_state(game)
            prior = _begin_play(gs, 'offense')
            outcome = tracker_logic.next_state_extra_point(
                {'attempt_type': attempt_type, 'result': result}
            )

            play = ExtraPointSnap.objects.create(
                game=game,
                sequence_number=gs.last_sequence + 1,
                quarter=gs.quarter,
                down=None,
                distance=None,
                ball_position=gs.ball_position,
                formation=data.get('formation', ''),
                attempt_type=attempt_type,
                result=result,
                kicker_id=data.get('kicker') or None,
                ball_carrier_id=data.get('ball_carrier') or None,
                passer_id=data.get('passer') or None,
                receiver_id=data.get('receiver') or None,
                notes=data.get('notes', ''),
                score_delta_team=outcome.team_pts,
                score_delta_opponent=outcome.opp_pts,
                prior_state=prior,
            )
            _adjust_score(game, team_pts=outcome.team_pts, opp_pts=outcome.opp_pts)
            _apply_outcome(gs, outcome)
    except IntegrityError:
        logger.warning('tracker_add_extra_point: duplicate sequence for game %s by user %s', pk, request.user)
        return _conflict_response()

    is_kick = attempt_type == 'KICK'
    summary = f"{'PAT' if is_kick else '2-PT'} {'GOOD' if result == 'GOOD' else ('MISSED' if is_kick else 'FAILED')}"
    detail = {'type': 'Extra Point', 'sequence': play.sequence_number, 'quarter': play.quarter}
    return _tracker_response(play, summary, detail, outcome.as_state(), game, gs)



@login_required
@require_POST
def tracker_add_defense(request, pk):
    """Add a defensive snap (tackle, sack, interception, fumble recovery)."""
    game, data = _parse_request(request, pk)
    if game is None:
        return data

    try:
        with transaction.atomic():
            game = Game.objects.select_for_update().get(pk=game.pk)
            gs = _get_game_state(game)
            prior = _begin_play(gs, 'defense')

            play_result = data.get('play_result', DefenseSnap.PlayResult.TACKLE)
            tackle_yds = data.get('tackle_yards') or 0
            return_yds = (
                data.get('interception_return_yards')
                or data.get('fumble_return_yards')
                or 0
            )
            outcome = tracker_logic.next_state_defense(
                _gs_state(gs),
                play_result,
                return_yards=return_yds,
                tackle_yards=tackle_yds,
                is_defensive_touchdown=data.get('is_defensive_touchdown', False),
            )

            play = DefenseSnap.objects.create(
                game=game,
                sequence_number=gs.last_sequence + 1,
                quarter=gs.quarter,
                down=gs.down,
                distance=gs.distance,
                ball_position=gs.ball_position,
                formation=data.get('formation', ''),
                play_result=play_result,
                primary_player_id=data.get('primary_player') or None,
                tackle_yards=data.get('tackle_yards') or None,
                opponent_play_type=data.get('opponent_play_type', ''),
                applied_pressure=data.get('applied_pressure', False),
                forced_incompletion=data.get('forced_incompletion', False),
                interception_return_yards=data.get('interception_return_yards') or None,
                fumble_return_yards=data.get('fumble_return_yards') or None,
                is_defensive_touchdown=data.get('is_defensive_touchdown', False),
                notes=data.get('notes', ''),
                score_delta_team=outcome.team_pts,
                score_delta_opponent=outcome.opp_pts,
                prior_state=prior,
            )
            _adjust_score(game, team_pts=outcome.team_pts, opp_pts=outcome.opp_pts)
            _apply_outcome(gs, outcome)
    except IntegrityError:
        logger.warning('tracker_add_defense: duplicate sequence for game %s by user %s', pk, request.user)
        return _conflict_response()

    summary = f"DEF: {play.get_play_result_display()}"
    if play.opponent_play_type:
        summary += f" ({play.get_opponent_play_type_display()})"
    if play.primary_player:
        summary = f"{_player_name(play.primary_player)} - {summary}"
    detail = {
        'type': 'Defense',
        'sequence': play.sequence_number,
        'quarter': play.quarter,
        'yards': tackle_yds,
        'result': play.play_result,
        'opponent_play_type': play.opponent_play_type,
        'is_defensive_touchdown': play.is_defensive_touchdown,
    }
    return _tracker_response(play, summary, detail, outcome.as_state(), game, gs)


@login_required
@require_POST
def tracker_update_score(request, pk):
    """Manually update the game score."""
    game, data = _parse_request(request, pk)
    if game is None:
        return data

    try:
        with transaction.atomic():
            game = Game.objects.select_for_update().get(pk=game.pk)
            gs = _get_game_state(game)
            fields = []
            if 'team_score' in data:
                val = int(data['team_score'])
                if val < 0 or val > 999:
                    return JsonResponse({'error': 'Invalid score'}, status=400)
                game.team_score = val
                fields.append('team_score')
            if 'opponent_score' in data:
                val = int(data['opponent_score'])
                if val < 0 or val > 999:
                    return JsonResponse({'error': 'Invalid score'}, status=400)
                game.opponent_score = val
                fields.append('opponent_score')
            if fields:
                game.save(update_fields=fields)
                # Bump the version so pollers pick up the score change.
                gs.version += 1
                gs.save(update_fields=['version', 'updated_at'])
    except (ValueError, TypeError):
        return JsonResponse({'error': 'Score must be a number'}, status=400)

    return JsonResponse({
        'success': True,
        'team_score': game.team_score,
        'opponent_score': game.opponent_score,
        'state': _serialize_state(gs),
        'version': gs.version,
    })


@login_required
@require_POST
def tracker_undo_play(request, pk):
    """
    Delete the most recent play, reverse its score impact via the stored
    deltas, and rewind GameState to the snapshot taken before the play.
    """
    game, _data = _parse_request(request, pk)
    if game is None:
        return _data

    with transaction.atomic():
        game = Game.objects.select_for_update().get(pk=game.pk)
        gs = _get_game_state(game)
        last_snap = game.snaps.order_by('-sequence_number').first()

        if not last_snap:
            return JsonResponse({'success': False, 'error': 'No plays to undo'})

        snap_info = {'id': last_snap.id, 'sequence_number': last_snap.sequence_number}

        # Scores are restored via deltas (not the snapshot) so manual score
        # edits made after the snap survive the undo.
        if last_snap.score_delta_team or last_snap.score_delta_opponent:
            game.team_score = max(0, game.team_score - last_snap.score_delta_team)
            game.opponent_score = max(0, game.opponent_score - last_snap.score_delta_opponent)
            game.save(update_fields=['team_score', 'opponent_score'])

        if last_snap.prior_state:
            for field in ('quarter', 'down', 'distance', 'ball_position',
                          'los_position', 'possession', 'situation'):
                if field in last_snap.prior_state:
                    setattr(gs, field, last_snap.prior_state[field])
        else:
            # Legacy snap recorded before snapshots existed — re-derive the
            # state from the previous snap (same derivation as page load).
            prev = game.snaps.exclude(pk=last_snap.pk).order_by('-sequence_number').first()
            gs.quarter = prev.quarter if prev else 1
            gs.down = prev.down if prev else None
            gs.distance = prev.distance if prev else None
            gs.ball_position = prev.ball_position if prev else None
            gs.los_position = prev.ball_position if prev else None
            gs.situation = 'normal' if prev else 'pregame'
            gs.possession = ''

        gs.last_sequence = max(0, last_snap.sequence_number - 1)
        gs.version += 1
        gs.save()
        last_snap.delete()

    return JsonResponse({
        'success': True,
        'deleted': snap_info,
        'team_score': game.team_score,
        'opponent_score': game.opponent_score,
        'state': _serialize_state(gs),
        'version': gs.version,
    })


@login_required
@require_GET
def tracker_recent_plays(request, pk):
    """Get recent plays for the feed."""
    game = get_object_or_404(Game.objects.select_related('season'), pk=pk)
    # Authorization: staff bypass; coaches restricted to their own team.
    if not request.user.is_staff:
        user_team_id = getattr(request.user, 'team_id', None)
        if not user_team_id or game.season.team_id != user_team_id:
            return JsonResponse({'error': 'Forbidden'}, status=403)
    try:
        limit = min(int(request.GET.get('limit', 10)), 50)
    except (ValueError, TypeError):
        limit = 10

    plays = play_feed.serialize_recent_plays(game, limit=limit)
    return JsonResponse({'success': True, 'plays': plays})


@login_required
@require_GET
def tracker_state(request, pk):
    """
    Polling endpoint: GET ?since=<version>&after_seq=<n>.

    When the client's version matches the server's, returns a tiny
    {'changed': false} payload from a single indexed query. Otherwise
    returns the full state, scores, and any plays newer than after_seq.
    """
    game = get_object_or_404(Game.objects.select_related('season'), pk=pk)
    if not request.user.is_staff:
        user_team_id = getattr(request.user, 'team_id', None)
        if not user_team_id or game.season.team_id != user_team_id:
            return JsonResponse({'error': 'Forbidden'}, status=403)

    def _int_param(name, default):
        try:
            return int(request.GET.get(name, default))
        except (TypeError, ValueError):
            return default

    since = _int_param('since', -1)
    after_seq = _int_param('after_seq', -1)

    current = GameState.objects.filter(game=game).values('version').first()
    if current is not None and since == current['version']:
        return JsonResponse({'changed': False, 'version': since})

    gs = _get_game_state(game)
    plays = play_feed.serialize_recent_plays(
        game, limit=20, after_seq=after_seq if after_seq >= 0 else None,
    )
    return JsonResponse({
        'changed': True,
        'version': gs.version,
        'state': _serialize_state(gs),
        'team_score': game.team_score,
        'opponent_score': game.opponent_score,
        'plays': plays,
    })
