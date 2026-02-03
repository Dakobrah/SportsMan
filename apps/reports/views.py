"""
Report views - thin views that delegate to services.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema, OpenApiParameter
from .services import OffenseReportService, DefenseReportService, SpecialTeamsReportService
from .serializers import (
    RushingTotalsSerializer,
    RushingPlayerSerializer,
    PassingTotalsSerializer,
    PassingPlayerSerializer,
    ReceivingPlayerSerializer,
    DefenseTotalsSerializer,
    DefensePlayerSerializer,
    FieldGoalTotalsSerializer,
    FieldGoalKickerSerializer,
    PuntTotalsSerializer,
)


class BaseReportView(APIView):
    """Base class for report views with common parameter parsing."""

    permission_classes = [IsAuthenticated]

    def _parse_game_ids(self, request):
        """Parse game_ids from query params."""
        game_ids_param = request.query_params.get("game_ids")
        if game_ids_param:
            return [int(x) for x in game_ids_param.split(",")]
        return None

    def _get_filters(self, request):
        """Get common filters from request."""
        return {
            "game_ids": self._parse_game_ids(request),
            "season_id": request.query_params.get("season_id"),
            "team_id": getattr(request.user, "team_id", None),
        }


# Offense Reports


class RushingTotalsView(BaseReportView):
    """Team rushing totals."""

    @extend_schema(
        summary="Team rushing totals",
        parameters=[
            OpenApiParameter(name="game_ids", type=str, description="Comma-separated game IDs"),
            OpenApiParameter(name="season_id", type=int, description="Filter by season"),
        ],
        responses={200: RushingTotalsSerializer},
    )
    def get(self, request):
        service = OffenseReportService(**self._get_filters(request))
        data = service.get_rushing_totals()
        serializer = RushingTotalsSerializer(data)
        return Response(serializer.data)


class RushingByPlayerView(BaseReportView):
    """Rushing stats by player."""

    @extend_schema(
        summary="Rushing stats by player",
        responses={200: RushingPlayerSerializer(many=True)},
    )
    def get(self, request):
        service = OffenseReportService(**self._get_filters(request))
        data = service.get_rushing_by_player()
        serializer = RushingPlayerSerializer(data, many=True)
        return Response(serializer.data)


class PassingTotalsView(BaseReportView):
    """Team passing totals."""

    @extend_schema(
        summary="Team passing totals",
        responses={200: PassingTotalsSerializer},
    )
    def get(self, request):
        service = OffenseReportService(**self._get_filters(request))
        data = service.get_passing_totals()
        serializer = PassingTotalsSerializer(data)
        return Response(serializer.data)


class PassingByQBView(BaseReportView):
    """Passing stats by quarterback."""

    @extend_schema(
        summary="Passing stats by quarterback",
        responses={200: PassingPlayerSerializer(many=True)},
    )
    def get(self, request):
        service = OffenseReportService(**self._get_filters(request))
        data = service.get_passing_by_quarterback()
        serializer = PassingPlayerSerializer(data, many=True)
        return Response(serializer.data)


class ReceivingByPlayerView(BaseReportView):
    """Receiving stats by player."""

    @extend_schema(
        summary="Receiving stats by player",
        responses={200: ReceivingPlayerSerializer(many=True)},
    )
    def get(self, request):
        service = OffenseReportService(**self._get_filters(request))
        data = service.get_receiving_by_player()
        serializer = ReceivingPlayerSerializer(data, many=True)
        return Response(serializer.data)


# Defense Reports


class DefenseTotalsView(BaseReportView):
    """Team defense totals."""

    @extend_schema(
        summary="Team defense totals",
        responses={200: DefenseTotalsSerializer},
    )
    def get(self, request):
        service = DefenseReportService(**self._get_filters(request))
        data = service.get_team_totals()
        serializer = DefenseTotalsSerializer(data)
        return Response(serializer.data)


class DefenseByPlayerView(BaseReportView):
    """Defense stats by player."""

    @extend_schema(
        summary="Defense stats by player",
        responses={200: DefensePlayerSerializer(many=True)},
    )
    def get(self, request):
        service = DefenseReportService(**self._get_filters(request))
        data = service.get_player_summary()
        serializer = DefensePlayerSerializer(data, many=True)
        return Response(serializer.data)


# Special Teams Reports


class PuntTotalsView(BaseReportView):
    """Team punt totals."""

    @extend_schema(
        summary="Team punt totals",
        responses={200: PuntTotalsSerializer},
    )
    def get(self, request):
        service = SpecialTeamsReportService(**self._get_filters(request))
        data = service.get_punt_totals()
        serializer = PuntTotalsSerializer(data)
        return Response(serializer.data)


class FieldGoalTotalsView(BaseReportView):
    """Team field goal totals."""

    @extend_schema(
        summary="Team field goal totals",
        responses={200: FieldGoalTotalsSerializer},
    )
    def get(self, request):
        service = SpecialTeamsReportService(**self._get_filters(request))
        data = service.get_field_goal_totals()
        serializer = FieldGoalTotalsSerializer(data)
        return Response(serializer.data)


class FieldGoalByKickerView(BaseReportView):
    """Field goal stats by kicker."""

    @extend_schema(
        summary="Field goal stats by kicker",
        responses={200: FieldGoalKickerSerializer(many=True)},
    )
    def get(self, request):
        service = SpecialTeamsReportService(**self._get_filters(request))
        data = service.get_field_goal_by_kicker()
        serializer = FieldGoalKickerSerializer(data, many=True)
        return Response(serializer.data)
