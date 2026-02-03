"""
Pagination classes for API responses.
"""
from rest_framework.pagination import PageNumberPagination, CursorPagination


class StandardPagination(PageNumberPagination):
    """
    Standard pagination for desktop clients.
    """

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class MobilePagination(PageNumberPagination):
    """
    Smaller page sizes for mobile clients to reduce payload size
    and improve perceived performance on slower connections.
    """

    page_size = 15
    page_size_query_param = "page_size"
    max_page_size = 50


class SnapCursorPagination(CursorPagination):
    """
    Cursor-based pagination for snap lists.

    Use cursor pagination for:
    - Large datasets with frequent inserts
    - Infinite scroll UIs (mobile-friendly)
    - Consistent ordering without offset drift
    """

    page_size = 20
    ordering = "-sequence_number"
    cursor_query_param = "cursor"
