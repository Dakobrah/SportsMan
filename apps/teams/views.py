"""
ViewSets for Team, Season, and Player models.
"""
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Team, Season, Player
from .serializers import (
    TeamSerializer,
    SeasonSerializer,
    PlayerSerializer,
)
from .filters import TeamFilter, SeasonFilter, PlayerFilter


class TeamViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Team CRUD operations.
    """

    queryset = Team.objects.all()
    serializer_class = TeamSerializer
    filterset_class = TeamFilter
    search_fields = ["name", "abbreviation"]
    ordering_fields = ["name", "created_at"]

    @action(detail=True, methods=["get"])
    def players(self, request, pk=None):
        """Get all players for a team."""
        team = self.get_object()
        players = team.players.filter(is_active=True)
        serializer = PlayerSerializer(players, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def seasons(self, request, pk=None):
        """Get all seasons for a team."""
        team = self.get_object()
        seasons = team.seasons.all()
        serializer = SeasonSerializer(seasons, many=True)
        return Response(serializer.data)


class SeasonViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Season CRUD operations.
    """

    queryset = Season.objects.select_related("team").all()
    serializer_class = SeasonSerializer
    filterset_class = SeasonFilter
    ordering_fields = ["year", "created_at"]


class PlayerViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Player CRUD operations.
    """

    queryset = Player.objects.select_related("team").all()
    serializer_class = PlayerSerializer
    filterset_class = PlayerFilter
    search_fields = ["first_name", "last_name"]
    ordering_fields = ["number", "last_name", "position", "created_at"]

    @action(detail=False, methods=["get"])
    def by_position(self, request):
        """Get players grouped by position."""
        position = request.query_params.get("position")
        if not position:
            return Response({"error": "position parameter required"}, status=400)

        players = self.get_queryset().filter(position=position, is_active=True)
        serializer = self.get_serializer(players, many=True)
        return Response(serializer.data)
