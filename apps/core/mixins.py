"""
Shared ViewSet mixins.
"""
from rest_framework import status
from rest_framework.response import Response


class ReadWriteSerializerMixin:
    """
    Selects a read serializer for list/retrieve and a write serializer for
    create/update/partial_update/destroy.

    Subclasses must set:
        read_serializer_class  — returned for safe (GET) actions
        write_serializer_class — returned for mutating actions

    Also provides _paginate_player_filter() for custom player-scoped actions.
    """

    read_serializer_class = None
    write_serializer_class = None

    def get_serializer_class(self):
        if self.action in ("list", "retrieve"):
            return self.read_serializer_class
        return self.write_serializer_class

    def _paginate_player_filter(self, request, param, field, **extra_filters):
        """
        Validate a required query param, filter the queryset by it, and return
        a paginated response.

        Args:
            param         — query param name (e.g. "player_id")
            field         — model field to filter on (e.g. "ball_carrier_id")
            extra_filters — additional queryset filter kwargs (e.g. is_complete=True)
        """
        player_id = request.query_params.get(param)
        if not player_id:
            return Response(
                {"error": f"{param} parameter required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qs = self.get_queryset().filter(**{field: player_id}, **extra_filters)
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(self.get_serializer(page, many=True).data)
