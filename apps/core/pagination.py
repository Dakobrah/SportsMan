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
    Cursor-based pagination for snap lists — avoids the COUNT(*) that
    PageNumberPagination runs on every request and stays consistent under
    concurrent inserts.

    Ordering must be globally unique and stable: sequence_number is only
    unique per game, so a global list ordered by it would skip/duplicate
    rows at cursor boundaries. (-created_at, -id) is unique and matches
    insertion order.
    """

    page_size = 20
    ordering = ("-created_at", "-id")
    cursor_query_param = "cursor"
