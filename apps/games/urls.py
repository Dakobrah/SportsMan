"""
URL configuration for games app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import GameViewSet, QuarterScoreViewSet

router = DefaultRouter()
router.register(r"games", GameViewSet, basename="game")
router.register(r"quarter-scores", QuarterScoreViewSet, basename="quarter-score")

urlpatterns = [
    path("", include(router.urls)),
]
