"""
ViewSets for snap models.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.core.mixins import ReadWriteSerializerMixin
from apps.core.pagination import SnapCursorPagination
from apps.core.permissions import IsTeamMember
from .models import (
    RunPlay,
    PassPlay,
    DefenseSnap,
    DefenseSnapAssist,
    PuntSnap,
    KickoffSnap,
    FieldGoalSnap,
    ExtraPointSnap,
)
from .serializers import (
    RunPlayReadSerializer,
    RunPlayWriteSerializer,
    PassPlayReadSerializer,
    PassPlayWriteSerializer,
    DefenseSnapReadSerializer,
    DefenseSnapWriteSerializer,
    DefenseSnapAssistSerializer,
    PuntSnapReadSerializer,
    PuntSnapWriteSerializer,
    KickoffSnapReadSerializer,
    KickoffSnapWriteSerializer,
    FieldGoalSnapReadSerializer,
    FieldGoalSnapWriteSerializer,
    ExtraPointSnapReadSerializer,
    ExtraPointSnapWriteSerializer,
)
from .filters import (
    RunPlayFilter,
    PassPlayFilter,
    DefenseSnapFilter,
    PuntSnapFilter,
    KickoffSnapFilter,
    FieldGoalSnapFilter,
)


class _TeamScopedMixin:
    """Scope queryset to the requesting user's team."""
    permission_classes = [IsAuthenticated, IsTeamMember]
    # Snap tables are the append-heavy hot path — cursor pagination skips
    # the per-request COUNT(*) that page-number pagination runs.
    pagination_class = SnapCursorPagination

    def get_queryset(self):
        qs = super().get_queryset()
        team = getattr(self.request.user, 'team', None)
        if team:
            qs = qs.filter(game__season__team=team)
        return qs


class RunPlayViewSet(_TeamScopedMixin, ReadWriteSerializerMixin, viewsets.ModelViewSet):
    """ViewSet for RunPlay CRUD operations."""

    queryset = RunPlay.objects.select_related(
        "game",
        "game__season",
        "game__season__team",
        "ball_carrier",
        "fumble_recovered_by",
        "penalty_player",
    )
    read_serializer_class = RunPlayReadSerializer
    write_serializer_class = RunPlayWriteSerializer
    filterset_class = RunPlayFilter
    ordering_fields = ["sequence_number", "yards_gained", "created_at"]

    @action(detail=False, methods=["get"])
    def by_carrier(self, request):
        """Get run plays by ball carrier."""
        return self._paginate_player_filter(request, "player_id", "ball_carrier_id")


class PassPlayViewSet(_TeamScopedMixin, ReadWriteSerializerMixin, viewsets.ModelViewSet):
    """ViewSet for PassPlay CRUD operations."""

    queryset = PassPlay.objects.select_related(
        "game", "quarterback", "target", "receiver", "penalty_player"
    )
    read_serializer_class = PassPlayReadSerializer
    write_serializer_class = PassPlayWriteSerializer
    filterset_class = PassPlayFilter
    ordering_fields = ["sequence_number", "yards_gained", "air_yards", "created_at"]

    @action(detail=False, methods=["get"])
    def by_quarterback(self, request):
        """Get pass plays by quarterback."""
        return self._paginate_player_filter(request, "qb_id", "quarterback_id")

    @action(detail=False, methods=["get"])
    def by_receiver(self, request):
        """Get completed passes by receiver."""
        return self._paginate_player_filter(request, "player_id", "receiver_id", is_complete=True)


class DefenseSnapViewSet(_TeamScopedMixin, ReadWriteSerializerMixin, viewsets.ModelViewSet):
    """ViewSet for DefenseSnap CRUD operations."""

    queryset = DefenseSnap.objects.select_related(
        "game", "primary_player", "penalty_player"
    ).prefetch_related("assists", "assists__player")
    read_serializer_class = DefenseSnapReadSerializer
    write_serializer_class = DefenseSnapWriteSerializer
    filterset_class = DefenseSnapFilter
    ordering_fields = ["sequence_number", "created_at"]

    @action(detail=True, methods=["post"])
    def add_assist(self, request, pk=None):
        """Add an assist to a defensive snap."""
        snap = self.get_object()
        serializer = DefenseSnapAssistSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(snap=snap)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PuntSnapViewSet(_TeamScopedMixin, ReadWriteSerializerMixin, viewsets.ModelViewSet):
    """ViewSet for PuntSnap CRUD operations."""

    queryset = PuntSnap.objects.select_related("game", "punter")
    read_serializer_class = PuntSnapReadSerializer
    write_serializer_class = PuntSnapWriteSerializer
    filterset_class = PuntSnapFilter
    ordering_fields = ["sequence_number", "punt_yards", "created_at"]


class KickoffSnapViewSet(_TeamScopedMixin, ReadWriteSerializerMixin, viewsets.ModelViewSet):
    """ViewSet for KickoffSnap CRUD operations."""

    queryset = KickoffSnap.objects.select_related("game", "kicker")
    read_serializer_class = KickoffSnapReadSerializer
    write_serializer_class = KickoffSnapWriteSerializer
    filterset_class = KickoffSnapFilter
    ordering_fields = ["sequence_number", "kick_yards", "created_at"]


class FieldGoalSnapViewSet(_TeamScopedMixin, ReadWriteSerializerMixin, viewsets.ModelViewSet):
    """ViewSet for FieldGoalSnap CRUD operations."""

    queryset = FieldGoalSnap.objects.select_related("game", "kicker", "holder")
    read_serializer_class = FieldGoalSnapReadSerializer
    write_serializer_class = FieldGoalSnapWriteSerializer
    filterset_class = FieldGoalSnapFilter
    ordering_fields = ["sequence_number", "kick_distance", "created_at"]


class ExtraPointSnapViewSet(_TeamScopedMixin, ReadWriteSerializerMixin, viewsets.ModelViewSet):
    """ViewSet for ExtraPointSnap CRUD operations."""

    queryset = ExtraPointSnap.objects.select_related(
        "game", "kicker", "ball_carrier", "passer", "receiver"
    )
    read_serializer_class = ExtraPointSnapReadSerializer
    write_serializer_class = ExtraPointSnapWriteSerializer
    filterset_fields = ["game", "quarter", "attempt_type", "result"]
    ordering_fields = ["sequence_number", "created_at"]
