"""
Health check endpoint for container orchestration and monitoring.
"""
from django.http import JsonResponse
from django.db import connection
from django.db.utils import OperationalError


def health_check(request):
    """
    Returns 200 if the app is healthy, 503 if not.
    Used by Docker health checks, load balancers, monitoring.
    """
    health_status = {
        "status": "healthy",
        "database": "ok",
    }

    # Check database connection
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except OperationalError:
        health_status["status"] = "unhealthy"
        health_status["database"] = "error"
        return JsonResponse(health_status, status=503)

    return JsonResponse(health_status)
