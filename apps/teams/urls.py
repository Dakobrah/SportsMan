"""
URL configuration for teams app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TeamViewSet, SeasonViewSet, PlayerViewSet

router = DefaultRouter()
router.register(r"teams", TeamViewSet, basename="team")
router.register(r"seasons", SeasonViewSet, basename="season")
router.register(r"players", PlayerViewSet, basename="player")

urlpatterns = [
    path("", include(router.urls)),
]
