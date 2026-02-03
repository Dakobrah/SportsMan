"""
Custom exception handlers for the Sports-Man API.
"""
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    """
    Custom exception handler that adds additional context to error responses.
    """
    response = exception_handler(exc, context)

    if response is not None:
        response.data["status_code"] = response.status_code

    return response


class BusinessLogicError(Exception):
    """
    Exception for business logic violations.
    """

    def __init__(self, message, code=None):
        self.message = message
        self.code = code
        super().__init__(message)
