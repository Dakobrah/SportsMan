"""
ViewSets for Team, Season, and Player models.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from apps.core.permissions import IsAdminOrReadOnly, IsTeamMemberOrStaff
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

    All authenticated users can list/retrieve teams.
    Only staff may create, update, or delete teams.
    """

    queryset = Team.objects.all()
    serializer_class = TeamSerializer
    permission_classes = [IsAdminOrReadOnly]
    filterset_class = TeamFilter
    search_fields = ["name", "abbreviation"]
    ordering_fields = ["name", "created_at"]

    @action(detail=True, methods=["get"])
    def players(self, request, pk=None):
        """Get all active players for a team."""
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

    Any authenticated user may read seasons.
    Writes are restricted: staff can modify any season; coaches can only
    create/edit seasons that belong to their own team.
    """

    queryset = Season.objects.select_related("team").all()
    serializer_class = SeasonSerializer
    permission_classes = [IsTeamMemberOrStaff]
    filterset_class = SeasonFilter
    ordering_fields = ["year", "created_at"]

    def perform_create(self, serializer):
        """Ensure coaches can only create seasons for their own team."""
        team = serializer.validated_data.get("team")
        user_team = getattr(self.request.user, "team", None)
        if not self.request.user.is_staff and team != user_team:
            raise PermissionDenied("You can only create seasons for your own team.")
        serializer.save()


class PlayerViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Player CRUD operations.

    Any authenticated user may read player records.
    Writes are restricted: staff can modify any player; coaches can only
    create/edit players on their own team.
    """

    queryset = Player.objects.select_related("team").all()
    serializer_class = PlayerSerializer
    permission_classes = [IsTeamMemberOrStaff]
    filterset_class = PlayerFilter
    search_fields = ["first_name", "last_name"]
    ordering_fields = ["number", "last_name", "position", "created_at"]

    def perform_create(self, serializer):
        """Ensure coaches can only add players to their own team."""
        team = serializer.validated_data.get("team")
        user_team = getattr(self.request.user, "team", None)
        if not self.request.user.is_staff and team != user_team:
            raise PermissionDenied("You can only add players to your own team.")
        serializer.save()

    @action(detail=False, methods=["get"])
    def by_position(self, request):
        """Get active players filtered by position."""
        position = request.query_params.get("position")
        if not position:
            return Response(
                {"error": "position parameter required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        players = self.get_queryset().filter(position=position, is_active=True)
        serializer = self.get_serializer(players, many=True)
        return Response(serializer.data)
