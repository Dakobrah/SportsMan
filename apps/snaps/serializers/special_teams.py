"""
Serializers for special teams snap models.
"""
from rest_framework import serializers
from apps.teams.models import Player
from apps.teams.serializers import PlayerMinimalSerializer
from apps.games.models import Game
from apps.games.serializers import GameMinimalSerializer
from apps.snaps.models import (
    PuntSnap,
    KickoffSnap,
    FieldGoalSnap,
    ExtraPointSnap,
)


class PuntSnapReadSerializer(serializers.ModelSerializer):
    """For GET requests."""

    game = GameMinimalSerializer(read_only=True)
    punter = PlayerMinimalSerializer(read_only=True)

    class Meta:
        model = PuntSnap
        fields = [
            "id",
            "game",
            "sequence_number",
            "quarter",
            "game_clock",
            "down",
            "distance",
            "ball_position",
            "formation",
            "punter",
            "punt_yards",
            "hang_time",
            "is_blocked",
            "is_touchback",
            "out_of_bounds",
            "downed_at_yard_line",
            "notes",
            "created_at",
        ]


class PuntSnapWriteSerializer(serializers.ModelSerializer):
    """For POST/PUT requests."""

    game_id = serializers.PrimaryKeyRelatedField(
        queryset=Game.objects.all(), source="game", write_only=True
    )
    punter_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(), source="punter", write_only=True
    )

    class Meta:
        model = PuntSnap
        fields = [
            "game_id",
            "sequence_number",
            "quarter",
            "game_clock",
            "down",
            "distance",
            "ball_position",
            "formation",
            "punter_id",
            "punt_yards",
            "hang_time",
            "is_blocked",
            "is_touchback",
            "out_of_bounds",
            "downed_at_yard_line",
            "notes",
        ]


class KickoffSnapReadSerializer(serializers.ModelSerializer):
    """For GET requests."""

    game = GameMinimalSerializer(read_only=True)
    kicker = PlayerMinimalSerializer(read_only=True)

    class Meta:
        model = KickoffSnap
        fields = [
            "id",
            "game",
            "sequence_number",
            "quarter",
            "game_clock",
            "formation",
            "kicker",
            "kick_yards",
            "is_touchback",
            "is_onside_kick",
            "onside_recovered",
            "out_of_bounds",
            "notes",
            "created_at",
        ]


class KickoffSnapWriteSerializer(serializers.ModelSerializer):
    """For POST/PUT requests."""

    game_id = serializers.PrimaryKeyRelatedField(
        queryset=Game.objects.all(), source="game", write_only=True
    )
    kicker_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(), source="kicker", write_only=True
    )

    class Meta:
        model = KickoffSnap
        fields = [
            "game_id",
            "sequence_number",
            "quarter",
            "game_clock",
            "formation",
            "kicker_id",
            "kick_yards",
            "is_touchback",
            "is_onside_kick",
            "onside_recovered",
            "out_of_bounds",
            "notes",
        ]


class FieldGoalSnapReadSerializer(serializers.ModelSerializer):
    """For GET requests."""

    game = GameMinimalSerializer(read_only=True)
    kicker = PlayerMinimalSerializer(read_only=True)
    holder = PlayerMinimalSerializer(read_only=True)

    class Meta:
        model = FieldGoalSnap
        fields = [
            "id",
            "game",
            "sequence_number",
            "quarter",
            "game_clock",
            "down",
            "ball_position",
            "formation",
            "kicker",
            "holder",
            "distance",
            "result",
            "notes",
            "created_at",
        ]


class FieldGoalSnapWriteSerializer(serializers.ModelSerializer):
    """For POST/PUT requests."""

    game_id = serializers.PrimaryKeyRelatedField(
        queryset=Game.objects.all(), source="game", write_only=True
    )
    kicker_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(), source="kicker", write_only=True
    )
    holder_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(),
        source="holder",
        required=False,
        allow_null=True,
        write_only=True,
    )

    class Meta:
        model = FieldGoalSnap
        fields = [
            "game_id",
            "sequence_number",
            "quarter",
            "game_clock",
            "down",
            "ball_position",
            "formation",
            "kicker_id",
            "holder_id",
            "distance",
            "result",
            "notes",
        ]


class ExtraPointSnapReadSerializer(serializers.ModelSerializer):
    """For GET requests."""

    game = GameMinimalSerializer(read_only=True)
    kicker = PlayerMinimalSerializer(read_only=True)
    ball_carrier = PlayerMinimalSerializer(read_only=True)
    passer = PlayerMinimalSerializer(read_only=True)
    receiver = PlayerMinimalSerializer(read_only=True)

    class Meta:
        model = ExtraPointSnap
        fields = [
            "id",
            "game",
            "sequence_number",
            "quarter",
            "game_clock",
            "formation",
            "attempt_type",
            "result",
            "kicker",
            "ball_carrier",
            "passer",
            "receiver",
            "notes",
            "created_at",
        ]


class ExtraPointSnapWriteSerializer(serializers.ModelSerializer):
    """For POST/PUT requests."""

    game_id = serializers.PrimaryKeyRelatedField(
        queryset=Game.objects.all(), source="game", write_only=True
    )
    kicker_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(),
        source="kicker",
        required=False,
        allow_null=True,
        write_only=True,
    )
    ball_carrier_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(),
        source="ball_carrier",
        required=False,
        allow_null=True,
        write_only=True,
    )
    passer_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(),
        source="passer",
        required=False,
        allow_null=True,
        write_only=True,
    )
    receiver_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(),
        source="receiver",
        required=False,
        allow_null=True,
        write_only=True,
    )

    class Meta:
        model = ExtraPointSnap
        fields = [
            "game_id",
            "sequence_number",
            "quarter",
            "game_clock",
            "formation",
            "attempt_type",
            "result",
            "kicker_id",
            "ball_carrier_id",
            "passer_id",
            "receiver_id",
            "notes",
        ]

    def validate(self, attrs):
        attempt_type = attrs.get("attempt_type")
        if attempt_type == ExtraPointSnap.AttemptType.KICK and not attrs.get("kicker"):
            raise serializers.ValidationError(
                {"kicker_id": "Kicker required for PAT kick"}
            )
        return attrs
