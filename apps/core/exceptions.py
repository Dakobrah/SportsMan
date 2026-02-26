"""
Custom exception handlers for the Sports-Man API.
"""
from rest_framework.views import exception_handler
from rest_framework import status
from rest_framework.exceptions import ValidationError, APIException


def custom_exception_handler(exc, context):
    """Add RFC 9457-style fields to all DRF error responses."""
    request = context.get('request')
    response = exception_handler(exc, context)

    if response is not None:
        detail = getattr(exc, 'detail', str(exc)) or "An error occurred"
        if isinstance(exc, ValidationError):
            detail = "; ".join(
                f"{f}: {'; '.join(str(m) for m in msgs) if isinstance(msgs, list) else msgs}"
                for f, msgs in (response.data.items() if isinstance(response.data, dict) else {})
            ) or "Invalid request data"

        new_data = {
            "type": "about:blank",
            "status": response.status_code,
            "detail": detail,
        }
        if isinstance(exc, ValidationError):
            new_data["errors"] = response.data
        if request:
            new_data["instance"] = request.path

        response.data = new_data

    return response


class BusinessLogicError(APIException):
    """422 for requests that are well-formed but violate business rules."""
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    default_detail = "Business logic validation failed."
    default_code = "business_logic_error"
