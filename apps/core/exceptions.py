"""
Custom exception handlers for the Sports-Man API.
Implements RFC 9457 Problem Details format for consistent error responses.
Reference: https://tools.ietf.org/html/rfc9457
"""
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import ValidationError, APIException
import logging

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    Custom exception handler implementing RFC 9457 Problem Details format.
    
    Converts all exceptions to a consistent error response structure:
    {
        "type": "about:blank",  # URI identifying problem type
        "status": 400,          # HTTP status code
        "title": "Bad Request", # Short description
        "detail": "...",        # Human-readable explanation
        "instance": "/api/.../" # Request path (debugging)
    }
    
    Args:
        exc: The exception raised
        context: Request context (request, view, etc.)
    
    Returns:
        Response with RFC 9457 Problem Details format or None
    """
    request = context.get('request')
    response = exception_handler(exc, context)

    if response is not None:
        # Build RFC 9457 Problem Details structure
        error_data = {
            "type": "about:blank",
            "status": response.status_code,
            "title": _get_error_title(response.status_code),
            "detail": _get_error_detail(exc, response),
            "instance": request.path if request else None,
        }
        
        # Preserve validation errors in standard format
        if isinstance(exc, ValidationError):
            error_data["errors"] = response.data
        
        response.data = error_data
        
        # Log errors at appropriate level
        if response.status_code >= 500:
            logger.error(
                f"Internal Server Error: {exc.__class__.__name__}",
                exc_info=exc,
                extra={"path": request.path if request else None}
            )
        elif response.status_code >= 400:
            logger.warning(
                f"Client Error ({response.status_code}): {error_data['detail']}"
            )

    return response


def _get_error_title(status_code: int) -> str:
    """Map HTTP status code to RFC 7231 reason phrase."""
    status_texts = {
        400: "Bad Request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Not Found",
        405: "Method Not Allowed",
        409: "Conflict",
        422: "Unprocessable Entity",
        429: "Too Many Requests",
        500: "Internal Server Error",
        502: "Bad Gateway",
        503: "Service Unavailable",
    }
    return status_texts.get(status_code, "Unknown Error")


def _get_error_detail(exc, response) -> str:
    """Extract human-readable error detail from exception."""
    if isinstance(exc, ValidationError):
        # Join all validation error messages
        if isinstance(response.data, dict):
            details = []
            for field, messages in response.data.items():
                if isinstance(messages, list):
                    details.append(f"{field}: {'; '.join(str(m) for m in messages)}")
                else:
                    details.append(f"{field}: {messages}")
            return "; ".join(details) if details else "Invalid request data"
        else:
            return str(response.data[0]) if response.data else "Validation failed"
    
    return getattr(exc, 'detail', str(exc)) or "An error occurred"


class BusinessLogicError(APIException):
    """
    Exception for business logic violations (422 Unprocessable Entity).
    Use when the request is well-formed but violates business rules.
    """
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    default_detail = "Business logic validation failed."
    default_code = "business_logic_error"

    def __init__(self, detail=None, code=None, **kwargs):
        if detail is None:
            detail = self.default_detail
        super().__init__(detail=detail, code=code)
        self.extra = kwargs
