"""
Serializers for report responses.
"""
from rest_framework import serializers


class RushingTotalsSerializer(serializers.Serializer):
    """Serializer for team rushing totals."""

    attempts = serializers.IntegerField()
    yards = serializers.IntegerField()
    touchdowns = serializers.IntegerField()
    first_downs = serializers.IntegerField()
    fumbles = serializers.IntegerField()
    fumbles_lost = serializers.IntegerField()
    longest = serializers.IntegerField()
    avg_yards = serializers.FloatField()


class RushingPlayerSerializer(serializers.Serializer):
    """Serializer for per-player rushing stats."""

    ball_carrier__id = serializers.IntegerField()
    ball_carrier__first_name = serializers.CharField()
    ball_carrier__last_name = serializers.CharField()
    ball_carrier__number = serializers.IntegerField()
    attempts = serializers.IntegerField()
    yards = serializers.IntegerField()
    touchdowns = serializers.IntegerField()
    first_downs = serializers.IntegerField()
    fumbles = serializers.IntegerField()
    fumbles_lost = serializers.IntegerField()
    longest = serializers.IntegerField()
    avg_yards = serializers.FloatField()
    short_runs = serializers.IntegerField()
    long_runs = serializers.IntegerField()
    explosive_runs = serializers.IntegerField()


class PassingTotalsSerializer(serializers.Serializer):
    """Serializer for team passing totals."""

    attempts = serializers.IntegerField()
    completions = serializers.IntegerField()
    yards = serializers.IntegerField()
    touchdowns = serializers.IntegerField()
    interceptions = serializers.IntegerField()
    sacks = serializers.IntegerField()
    sack_yards = serializers.IntegerField()
    air_yards = serializers.IntegerField()
    yac = serializers.IntegerField()
    longest = serializers.IntegerField()


class PassingPlayerSerializer(serializers.Serializer):
    """Serializer for per-QB passing stats."""

    quarterback__id = serializers.IntegerField()
    quarterback__first_name = serializers.CharField()
    quarterback__last_name = serializers.CharField()
    quarterback__number = serializers.IntegerField()
    attempts = serializers.IntegerField()
    completions = serializers.IntegerField()
    yards = serializers.IntegerField()
    touchdowns = serializers.IntegerField()
    interceptions = serializers.IntegerField()
    sacks = serializers.IntegerField()
    air_yards = serializers.IntegerField()
    yac = serializers.IntegerField()
    longest = serializers.IntegerField()
    thrown_away = serializers.IntegerField()
    under_pressure = serializers.IntegerField()
    completion_pct = serializers.FloatField()
    yards_per_attempt = serializers.FloatField()
    passer_rating = serializers.FloatField()


class ReceivingPlayerSerializer(serializers.Serializer):
    """Serializer for per-receiver stats."""

    receiver__id = serializers.IntegerField()
    receiver__first_name = serializers.CharField()
    receiver__last_name = serializers.CharField()
    receiver__number = serializers.IntegerField()
    receiver__position = serializers.CharField()
    receptions = serializers.IntegerField()
    yards = serializers.IntegerField()
    touchdowns = serializers.IntegerField()
    first_downs = serializers.IntegerField()
    longest = serializers.IntegerField()
    yac = serializers.IntegerField()
    fumbles = serializers.IntegerField()
    avg_yards = serializers.FloatField()


class DefenseTotalsSerializer(serializers.Serializer):
    """Serializer for team defense totals."""

    total_tackles = serializers.IntegerField()
    total_tfl = serializers.IntegerField()
    total_sacks = serializers.IntegerField()
    total_interceptions = serializers.IntegerField()
    total_fumble_recoveries = serializers.IntegerField()
    total_pass_defended = serializers.IntegerField()
    total_pressures = serializers.IntegerField()
    total_forced_incompletions = serializers.IntegerField()
    defensive_touchdowns = serializers.IntegerField()
    int_return_yards = serializers.IntegerField()
    fumble_return_yards = serializers.IntegerField()


class DefensePlayerSerializer(serializers.Serializer):
    """Serializer for per-player defense stats."""

    primary_player__id = serializers.IntegerField()
    primary_player__first_name = serializers.CharField()
    primary_player__last_name = serializers.CharField()
    primary_player__number = serializers.IntegerField()
    primary_player__position = serializers.CharField()
    tackles = serializers.IntegerField()
    tfl = serializers.IntegerField()
    sacks = serializers.IntegerField()
    interceptions = serializers.IntegerField()
    fumble_recoveries = serializers.IntegerField()
    pass_defended = serializers.IntegerField()
    pressures = serializers.IntegerField()
    def_tds = serializers.IntegerField()


class FieldGoalTotalsSerializer(serializers.Serializer):
    """Serializer for team field goal totals."""

    attempts = serializers.IntegerField()
    made = serializers.IntegerField()
    missed = serializers.IntegerField()
    blocked = serializers.IntegerField()
    longest = serializers.IntegerField(allow_null=True)
    percentage = serializers.FloatField()


class FieldGoalKickerSerializer(serializers.Serializer):
    """Serializer for per-kicker field goal stats."""

    kicker__id = serializers.IntegerField()
    kicker__first_name = serializers.CharField()
    kicker__last_name = serializers.CharField()
    kicker__number = serializers.IntegerField()
    attempts = serializers.IntegerField()
    made = serializers.IntegerField()
    missed = serializers.IntegerField()
    blocked = serializers.IntegerField()
    longest = serializers.IntegerField(allow_null=True)
    percentage = serializers.FloatField()


class PuntTotalsSerializer(serializers.Serializer):
    """Serializer for team punt totals."""

    punts = serializers.IntegerField()
    total_yards = serializers.IntegerField()
    avg_yards = serializers.FloatField()
    longest = serializers.IntegerField()
    touchbacks = serializers.IntegerField()
    blocked = serializers.IntegerField()
    out_of_bounds = serializers.IntegerField()
