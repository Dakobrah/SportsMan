"""
Serializers for Game and QuarterScore models.
"""
from rest_framework import serializers
from apps.teams.models import Season
from apps.teams.serializers import SeasonMinimalSerializer
from .models import Game, QuarterScore


class QuarterScoreSerializer(serializers.ModelSerializer):
    """Serializer for QuarterScore model."""

    class Meta:
        model = QuarterScore
        fields = ["id", "quarter", "team_score", "opponent_score"]


class GameReadSerializer(serializers.ModelSerializer):
    """Full Game serializer for GET requests."""

    season = SeasonMinimalSerializer(read_only=True)
    quarter_scores = QuarterScoreSerializer(many=True, read_only=True)
    result = serializers.ReadOnlyField()
    is_win = serializers.ReadOnlyField()
    is_loss = serializers.ReadOnlyField()
    location_display = serializers.CharField(source="get_location_display", read_only=True)
    weather_display = serializers.CharField(source="get_weather_display", read_only=True)
    field_condition_display = serializers.CharField(
        source="get_field_condition_display", read_only=True
    )

    class Meta:
        model = Game
        fields = [
            "id",
            "season",
            "date",
            "opponent",
            "location",
            "location_display",
            "weather",
            "weather_display",
            "field_condition",
            "field_condition_display",
            "team_score",
            "opponent_score",
            "result",
            "is_win",
            "is_loss",
            "quarter_scores",
            "notes",
            "created_at",
            "updated_at",
        ]


class GameWriteSerializer(serializers.ModelSerializer):
    """Game serializer for POST/PUT requests."""

    season_id = serializers.PrimaryKeyRelatedField(
        queryset=Season.objects.all(), source="season", write_only=True
    )

    class Meta:
        model = Game
        fields = [
            "season_id",
            "date",
            "opponent",
            "location",
            "weather",
            "field_condition",
            "team_score",
            "opponent_score",
            "notes",
        ]


class GameMinimalSerializer(serializers.ModelSerializer):
    """Minimal Game serializer for nested responses."""

    result = serializers.ReadOnlyField()

    class Meta:
        model = Game
        fields = ["id", "date", "opponent", "team_score", "opponent_score", "result"]
