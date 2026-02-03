"""
Serializers for offensive snap models.
"""
from rest_framework import serializers
from apps.teams.models import Player
from apps.teams.serializers import PlayerMinimalSerializer
from apps.games.models import Game
from apps.games.serializers import GameMinimalSerializer
from apps.snaps.models import RunPlay, PassPlay


class RunPlayReadSerializer(serializers.ModelSerializer):
    """For GET requests - includes nested player/game data."""

    ball_carrier = PlayerMinimalSerializer(read_only=True)
    game = GameMinimalSerializer(read_only=True)
    fumble_recovered_by = PlayerMinimalSerializer(read_only=True)
    penalty_player = PlayerMinimalSerializer(read_only=True)

    class Meta:
        model = RunPlay
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
            "ball_carrier",
            "yards_gained",
            "is_touchdown",
            "is_first_down",
            "fumbled",
            "fumble_lost",
            "fumble_recovered_by",
            "had_penalty",
            "penalty_player",
            "penalty_yards",
            "penalty_description",
            "notes",
            "created_at",
        ]


class RunPlayWriteSerializer(serializers.ModelSerializer):
    """For POST/PUT requests - accepts IDs."""

    game_id = serializers.PrimaryKeyRelatedField(
        queryset=Game.objects.all(), source="game", write_only=True
    )
    ball_carrier_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(), source="ball_carrier", write_only=True
    )
    fumble_recovered_by_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(),
        source="fumble_recovered_by",
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
        model = RunPlay
        fields = [
            "game_id",
            "sequence_number",
            "quarter",
            "game_clock",
            "down",
            "distance",
            "ball_position",
            "formation",
            "ball_carrier_id",
            "yards_gained",
            "is_touchdown",
            "is_first_down",
            "fumbled",
            "fumble_lost",
            "fumble_recovered_by_id",
            "had_penalty",
            "penalty_player_id",
            "penalty_yards",
            "penalty_description",
            "notes",
        ]

    def validate(self, attrs):
        if attrs.get("fumble_lost") and not attrs.get("fumbled"):
            raise serializers.ValidationError(
                {"fumble_lost": "Cannot lose fumble without fumbling"}
            )
        return attrs


class PassPlayReadSerializer(serializers.ModelSerializer):
    """For GET requests - includes nested player/game data."""

    quarterback = PlayerMinimalSerializer(read_only=True)
    target = PlayerMinimalSerializer(read_only=True)
    receiver = PlayerMinimalSerializer(read_only=True)
    game = GameMinimalSerializer(read_only=True)
    penalty_player = PlayerMinimalSerializer(read_only=True)

    class Meta:
        model = PassPlay
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
            "quarterback",
            "target",
            "receiver",
            "is_complete",
            "yards_gained",
            "air_yards",
            "yards_after_catch",
            "is_touchdown",
            "is_first_down",
            "is_interception",
            "is_thrown_away",
            "was_under_pressure",
            "was_sacked",
            "sack_yards",
            "fumbled",
            "fumble_lost",
            "had_penalty",
            "penalty_player",
            "penalty_yards",
            "penalty_description",
            "notes",
            "created_at",
        ]


class PassPlayWriteSerializer(serializers.ModelSerializer):
    """For POST/PUT requests - accepts IDs."""

    game_id = serializers.PrimaryKeyRelatedField(
        queryset=Game.objects.all(), source="game", write_only=True
    )
    quarterback_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(), source="quarterback", write_only=True
    )
    target_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(),
        source="target",
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
    penalty_player_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(),
        source="penalty_player",
        required=False,
        allow_null=True,
        write_only=True,
    )

    class Meta:
        model = PassPlay
        fields = [
            "game_id",
            "sequence_number",
            "quarter",
            "game_clock",
            "down",
            "distance",
            "ball_position",
            "formation",
            "quarterback_id",
            "target_id",
            "receiver_id",
            "is_complete",
            "yards_gained",
            "air_yards",
            "yards_after_catch",
            "is_touchdown",
            "is_first_down",
            "is_interception",
            "is_thrown_away",
            "was_under_pressure",
            "was_sacked",
            "sack_yards",
            "fumbled",
            "fumble_lost",
            "had_penalty",
            "penalty_player_id",
            "penalty_yards",
            "penalty_description",
            "notes",
        ]

    def validate(self, attrs):
        if attrs.get("is_complete") and not attrs.get("receiver"):
            raise serializers.ValidationError(
                {"receiver_id": "Receiver required for completed passes"}
            )
        return attrs
