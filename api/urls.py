"""
API URL configuration.
"""
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    # Versioned API
    path("v1/", include("api.v1.urls")),
    # Health check (unauthenticated)
    path("", include("apps.core.urls")),
    # OpenAPI documentation
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]
