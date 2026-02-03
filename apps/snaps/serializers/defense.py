"""
Serializers for defensive snap models.
"""
from rest_framework import serializers
from apps.teams.models import Player
from apps.teams.serializers import PlayerMinimalSerializer
from apps.games.models import Game
from apps.games.serializers import GameMinimalSerializer
from apps.snaps.models import DefenseSnap, DefenseSnapAssist


class DefenseSnapAssistSerializer(serializers.ModelSerializer):
    """Serializer for DefenseSnapAssist model."""

    player = PlayerMinimalSerializer(read_only=True)
    player_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(), source="player", write_only=True
    )

    class Meta:
        model = DefenseSnapAssist
        fields = ["id", "player", "player_id", "assist_type"]


class DefenseSnapReadSerializer(serializers.ModelSerializer):
    """For GET requests - includes nested data."""

    game = GameMinimalSerializer(read_only=True)
    primary_player = PlayerMinimalSerializer(read_only=True)
    penalty_player = PlayerMinimalSerializer(read_only=True)
    assists = DefenseSnapAssistSerializer(many=True, read_only=True)

    class Meta:
        model = DefenseSnap
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
            "play_result",
            "secondary_formation",
            "primary_player",
            "tackle_yards",
            "tackle_for_loss",
            "applied_pressure",
            "forced_incompletion",
            "interception_return_yards",
            "fumble_return_yards",
            "is_defensive_touchdown",
            "penalty_player",
            "penalty_yards",
            "penalty_description",
            "assists",
            "notes",
            "created_at",
        ]


class DefenseSnapWriteSerializer(serializers.ModelSerializer):
    """For POST/PUT requests - accepts IDs."""

    game_id = serializers.PrimaryKeyRelatedField(
        queryset=Game.objects.all(), source="game", write_only=True
    )
    primary_player_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(),
        source="primary_player",
        required=False,
        allow_null=True,
        write_only=True,
    )
    penalty_player_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(),
        source="penalty_player",
        required=False,
        allow_null=True,
        write_only=True,
    )

    class Meta:
        model = DefenseSnap
        fields = [
            "game_id",
            "sequence_number",
            "quarter",
            "game_clock",
            "down",
            "distance",
            "ball_position",
            "formation",
            "play_result",
            "secondary_formation",
            "primary_player_id",
            "tackle_yards",
            "tackle_for_loss",
            "applied_pressure",
            "forced_incompletion",
            "interception_return_yards",
            "fumble_return_yards",
            "is_defensive_touchdown",
            "penalty_player_id",
            "penalty_yards",
            "penalty_description",
            "notes",
        ]
