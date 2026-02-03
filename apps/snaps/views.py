"""
ViewSets for snap models.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.core.pagination import SnapCursorPagination
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


class RunPlayViewSet(viewsets.ModelViewSet):
    """ViewSet for RunPlay CRUD operations."""

    queryset = RunPlay.objects.select_related(
        "game",
        "game__season",
        "game__season__team",
        "ball_carrier",
        "fumble_recovered_by",
        "penalty_player",
    )
    filterset_class = RunPlayFilter
    ordering_fields = ["sequence_number", "yards_gained", "created_at"]

    def get_serializer_class(self):
        if self.action in ["list", "retrieve"]:
            return RunPlayReadSerializer
        return RunPlayWriteSerializer

    @action(detail=False, methods=["get"])
    def by_carrier(self, request):
        """Get run plays by ball carrier."""
        carrier_id = request.query_params.get("player_id")
        if not carrier_id:
            return Response(
                {"error": "player_id parameter required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        plays = self.get_queryset().filter(ball_carrier_id=carrier_id)
        page = self.paginate_queryset(plays)
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)


class PassPlayViewSet(viewsets.ModelViewSet):
    """ViewSet for PassPlay CRUD operations."""

    queryset = PassPlay.objects.select_related(
        "game", "quarterback", "target", "receiver", "penalty_player"
    )
    filterset_class = PassPlayFilter
    ordering_fields = ["sequence_number", "yards_gained", "air_yards", "created_at"]

    def get_serializer_class(self):
        if self.action in ["list", "retrieve"]:
            return PassPlayReadSerializer
        return PassPlayWriteSerializer

    @action(detail=False, methods=["get"])
    def by_quarterback(self, request):
        """Get pass plays by quarterback."""
        qb_id = request.query_params.get("qb_id")
        if not qb_id:
            return Response(
                {"error": "qb_id parameter required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        passes = self.get_queryset().filter(quarterback_id=qb_id)
        page = self.paginate_queryset(passes)
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    @action(detail=False, methods=["get"])
    def by_receiver(self, request):
        """Get completed passes by receiver."""
        receiver_id = request.query_params.get("player_id")
        if not receiver_id:
            return Response(
                {"error": "player_id parameter required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        passes = self.get_queryset().filter(receiver_id=receiver_id, is_complete=True)
        page = self.paginate_queryset(passes)
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)


class DefenseSnapViewSet(viewsets.ModelViewSet):
    """ViewSet for DefenseSnap CRUD operations."""

    queryset = DefenseSnap.objects.select_related(
        "game", "primary_player", "penalty_player"
    ).prefetch_related("assists", "assists__player")
    filterset_class = DefenseSnapFilter
    ordering_fields = ["sequence_number", "created_at"]

    def get_serializer_class(self):
        if self.action in ["list", "retrieve"]:
            return DefenseSnapReadSerializer
        return DefenseSnapWriteSerializer

    @action(detail=True, methods=["post"])
    def add_assist(self, request, pk=None):
        """Add an assist to a defensive snap."""
        snap = self.get_object()
        serializer = DefenseSnapAssistSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(snap=snap)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PuntSnapViewSet(viewsets.ModelViewSet):
    """ViewSet for PuntSnap CRUD operations."""

    queryset = PuntSnap.objects.select_related("game", "punter")
    filterset_class = PuntSnapFilter
    ordering_fields = ["sequence_number", "punt_yards", "created_at"]

    def get_serializer_class(self):
        if self.action in ["list", "retrieve"]:
            return PuntSnapReadSerializer
        return PuntSnapWriteSerializer


class KickoffSnapViewSet(viewsets.ModelViewSet):
    """ViewSet for KickoffSnap CRUD operations."""

    queryset = KickoffSnap.objects.select_related("game", "kicker")
    filterset_class = KickoffSnapFilter
    ordering_fields = ["sequence_number", "kick_yards", "created_at"]

    def get_serializer_class(self):
        if self.action in ["list", "retrieve"]:
            return KickoffSnapReadSerializer
        return KickoffSnapWriteSerializer


class FieldGoalSnapViewSet(viewsets.ModelViewSet):
    """ViewSet for FieldGoalSnap CRUD operations."""

    queryset = FieldGoalSnap.objects.select_related("game", "kicker", "holder")
    filterset_class = FieldGoalSnapFilter
    ordering_fields = ["sequence_number", "distance", "created_at"]

    def get_serializer_class(self):
        if self.action in ["list", "retrieve"]:
            return FieldGoalSnapReadSerializer
        return FieldGoalSnapWriteSerializer


class ExtraPointSnapViewSet(viewsets.ModelViewSet):
    """ViewSet for ExtraPointSnap CRUD operations."""

    queryset = ExtraPointSnap.objects.select_related(
        "game", "kicker", "ball_carrier", "passer", "receiver"
    )
    filterset_fields = ["game", "quarter", "attempt_type", "result"]
    ordering_fields = ["sequence_number", "created_at"]

    def get_serializer_class(self):
        if self.action in ["list", "retrieve"]:
            return ExtraPointSnapReadSerializer
        return ExtraPointSnapWriteSerializer
