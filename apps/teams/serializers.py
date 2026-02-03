"""
Serializers for Team, Season, and Player models.
"""
from rest_framework import serializers
from .models import Team, Season, Player


class TeamSerializer(serializers.ModelSerializer):
    """Full Team serializer."""

    class Meta:
        model = Team
        fields = ["id", "name", "abbreviation", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]


class TeamMinimalSerializer(serializers.ModelSerializer):
    """Minimal Team serializer for nested responses."""

    class Meta:
        model = Team
        fields = ["id", "name", "abbreviation"]


class SeasonSerializer(serializers.ModelSerializer):
    """Full Season serializer."""

    team = TeamMinimalSerializer(read_only=True)
    team_id = serializers.PrimaryKeyRelatedField(
        queryset=Team.objects.all(), source="team", write_only=True
    )

    class Meta:
        model = Season
        fields = ["id", "year", "team", "team_id", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]


class SeasonMinimalSerializer(serializers.ModelSerializer):
    """Minimal Season serializer for nested responses."""

    team = TeamMinimalSerializer(read_only=True)

    class Meta:
        model = Season
        fields = ["id", "year", "team"]


class PlayerSerializer(serializers.ModelSerializer):
    """Full Player serializer."""

    team = TeamMinimalSerializer(read_only=True)
    team_id = serializers.PrimaryKeyRelatedField(
        queryset=Team.objects.all(), source="team", write_only=True
    )
    full_name = serializers.ReadOnlyField()
    position_display = serializers.CharField(source="get_position_display", read_only=True)

    class Meta:
        model = Player
        fields = [
            "id",
            "first_name",
            "last_name",
            "full_name",
            "position",
            "position_display",
            "number",
            "team",
            "team_id",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class PlayerMinimalSerializer(serializers.ModelSerializer):
    """Minimal Player serializer for nested responses."""

    full_name = serializers.ReadOnlyField()

    class Meta:
        model = Player
        fields = ["id", "first_name", "last_name", "full_name", "number", "position"]
