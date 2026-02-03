"""
ViewSets for Game and QuarterScore models.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Game, QuarterScore
from .serializers import (
    GameReadSerializer,
    GameWriteSerializer,
    QuarterScoreSerializer,
)
from .filters import GameFilter


class GameViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Game CRUD operations.
    """

    queryset = Game.objects.select_related("season", "season__team").prefetch_related(
        "quarter_scores"
    )
    filterset_class = GameFilter
    search_fields = ["opponent", "notes"]
    ordering_fields = ["date", "team_score", "opponent_score", "created_at"]

    def get_serializer_class(self):
        if self.action in ["list", "retrieve"]:
            return GameReadSerializer
        return GameWriteSerializer

    @action(detail=True, methods=["get", "post"])
    def quarter_scores(self, request, pk=None):
        """Get or add quarter scores for a game."""
        game = self.get_object()

        if request.method == "GET":
            scores = game.quarter_scores.all()
            serializer = QuarterScoreSerializer(scores, many=True)
            return Response(serializer.data)

        # POST - add quarter score
        serializer = QuarterScoreSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(game=game)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["get"])
    def summary(self, request, pk=None):
        """Get game summary with basic stats."""
        game = self.get_object()
        return Response(
            {
                "game": GameReadSerializer(game).data,
                "total_snaps": game.snaps.count() if hasattr(game, "snaps") else 0,
            }
        )


class QuarterScoreViewSet(viewsets.ModelViewSet):
    """
    ViewSet for QuarterScore CRUD operations.
    """

    queryset = QuarterScore.objects.select_related("game")
    serializer_class = QuarterScoreSerializer
    filterset_fields = ["game", "quarter"]
