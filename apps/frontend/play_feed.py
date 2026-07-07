"""
Shared snap serialization for the tracker feed, polling payloads, and the
play-by-play page.

Batches the polymorphic downcast (get_real_instances) and player FK loads
(in_bulk) so serializing N plays costs a constant number of queries.
"""
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

# Every player FK that can appear in a play summary, across all snap types.
_PLAYER_ID_ATTRS = (
    'ball_carrier_id', 'quarterback_id', 'receiver_id', 'primary_player_id',
    'kicker_id', 'punter_id', 'passer_id',
)

# Bootstrap contextual color per badge slug (used by the play-by-play page).
_BADGE_COLORS = {
    'run': 'success',
    'pass': 'primary',
    'defense': 'danger',
    'special': 'secondary',
    'penalty': 'warning',
}


def ball_pos_display(pos):
    """Convert -50..+50 to 'OWN 25' / 'OPP 40' / '50' format."""
    if pos is None:
        return "—"
    if pos == 0:
        return "50"
    if pos < 0:
        return f"OWN {50 + pos}"
    return f"OPP {50 - pos}"


def _name(players, player_id, fallback=''):
    """Return '#12 Smith' format from the bulk-loaded player map."""
    player = players.get(player_id) if player_id else None
    return f"#{player.number} {player.last_name}" if player else fallback


def _tb(snap):
    return ' (TB)' if getattr(snap, 'is_touchback', False) else ''


def serialize_recent_plays(game, limit=10, after_seq=None):
    """
    Serialize the game's most recent plays (newest first) as plain dicts.

    after_seq: only include snaps with sequence_number greater than this —
    used by the polling endpoint to send deltas.
    """
    qs = game.snaps.order_by('-sequence_number')
    if after_seq is not None:
        qs = qs.filter(sequence_number__gt=after_seq)
    return _serialize_pks(list(qs.values_list('pk', flat=True)[:limit]))


def serialize_game_plays(game, quarter=None):
    """All of a game's plays in game order (for the play-by-play page)."""
    qs = game.snaps.order_by('sequence_number')
    if quarter:
        qs = qs.filter(quarter=quarter)
    return _serialize_pks(list(qs.values_list('pk', flat=True)))


def _serialize_pks(snap_pks):
    """Batch-serialize snaps by pk: one downcast per concrete type plus one
    player in_bulk, regardless of how many snaps are requested."""
    if not snap_pks:
        return []

    # One query for base rows + one per concrete type present (not per snap).
    # non_polymorphic() is required: without it the queryset auto-downcasts
    # during iteration AND get_real_instances() re-fetches — double the work.
    real_map = {
        s.pk: s
        for s in BaseSnap.objects.non_polymorphic()
                                 .filter(pk__in=snap_pks)
                                 .get_real_instances()
    }
    player_ids = set()
    for snap in real_map.values():
        for attr in _PLAYER_ID_ATTRS:
            pid = getattr(snap, attr, None)
            if pid:
                player_ids.add(pid)
    players = Player.objects.in_bulk(player_ids)

    return [
        serialize_snap(real_map[pk], players)
        for pk in snap_pks if pk in real_map
    ]


def serialize_snap(actual, players):
    """Serialize one downcast snap using the bulk-loaded player map."""
    info = {
        'id': actual.id,
        'sequence_number': actual.sequence_number,
        'quarter': actual.quarter,
        'down': actual.down,
        'distance': actual.distance,
        'ball_position': actual.ball_position,
        'ball_position_display': ball_pos_display(actual.ball_position),
        'notes': actual.notes or '',
        'type': type(actual).__name__,
        'yards': 0,
        'is_touchdown': False,
        'is_turnover': False,
        'is_first_down': getattr(actual, 'is_first_down', False),
    }

    if isinstance(actual, RunPlay):
        info['type_label'] = 'Run'
        info['badge'] = 'run'
        info['summary'] = f"{_name(players, actual.ball_carrier_id, 'Unknown')} run for {actual.yards_gained} yds"
        info['yards'] = actual.yards_gained
        info['is_touchdown'] = actual.is_touchdown
        info['is_turnover'] = actual.fumble_lost
    elif isinstance(actual, PassPlay):
        info['type_label'] = 'Pass'
        info['badge'] = 'pass'
        qb = _name(players, actual.quarterback_id, 'Unknown')
        if actual.was_sacked:
            info['summary'] = f"{qb} sacked for {actual.sack_yards or 0} yds"
            info['yards'] = actual.sack_yards or 0
        elif actual.is_interception:
            info['summary'] = f"{qb} INTERCEPTED"
        elif actual.is_complete:
            rec = f" to {_name(players, actual.receiver_id)}" if actual.receiver_id else ''
            info['summary'] = f"{qb}{rec} complete for {actual.yards_gained} yds"
            info['yards'] = actual.yards_gained
        else:
            info['summary'] = f"{qb} pass incomplete"
        info['is_touchdown'] = actual.is_touchdown
        info['is_turnover'] = actual.is_interception or actual.fumble_lost
    elif isinstance(actual, FieldGoalSnap):
        info['type_label'] = 'Field Goal'
        info['badge'] = 'special'
        info['summary'] = f"FG {actual.result} ({actual.kick_distance} yds)"
    elif isinstance(actual, ExtraPointSnap):
        info['type_label'] = 'Extra Point'
        info['badge'] = 'special'
        info['summary'] = f"{'PAT' if actual.attempt_type == 'KICK' else '2PT'} {actual.result}"
    elif isinstance(actual, KickoffSnap):
        info['type_label'] = 'Kickoff'
        info['badge'] = 'special'
        info['summary'] = f"Kickoff {actual.kick_yards} yds{_tb(actual)}"
    elif isinstance(actual, PuntSnap):
        info['type_label'] = 'Punt'
        info['badge'] = 'special'
        info['summary'] = (
            "BLOCKED punt" if actual.is_blocked
            else f"Punt {actual.punt_yards} yds{_tb(actual)}"
        )
        info['is_touchdown'] = actual.blocked_td
    elif isinstance(actual, DefenseSnap):
        info['type_label'] = 'Defense'
        info['badge'] = 'defense'
        summary = f"DEF: {actual.get_play_result_display()}"
        if actual.opponent_play_type:
            summary += f" ({actual.get_opponent_play_type_display()})"
        if actual.primary_player_id:
            summary = f"{_name(players, actual.primary_player_id)} - {summary}"
        info['summary'] = summary
        info['yards'] = actual.tackle_yards or 0
        info['is_touchdown'] = actual.is_defensive_touchdown
        info['is_turnover'] = actual.play_result in (
            DefenseSnap.PlayResult.INTERCEPTION, DefenseSnap.PlayResult.FUMBLE_RECOVERY,
        )
    elif isinstance(actual, OffenseSnap):
        # Offensive penalty (base OffenseSnap, not a RunPlay/PassPlay subclass)
        info['type_label'] = 'Penalty'
        info['badge'] = 'penalty'
        desc = actual.penalty_description or 'Penalty'
        summary = f"PENALTY: {desc}"
        if actual.penalty_yards:
            summary += f" ({actual.penalty_yards} yds)"
        info['summary'] = summary
    else:
        info['type_label'] = type(actual).__name__
        info['badge'] = 'special'
        info['summary'] = f"Play #{actual.sequence_number}"

    info['badge_color'] = _BADGE_COLORS.get(info['badge'], 'secondary')
    return info
