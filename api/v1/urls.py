"""
API v1 URL configuration.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.teams.views import TeamViewSet, SeasonViewSet, PlayerViewSet
from apps.games.views import GameViewSet, QuarterScoreViewSet
from apps.snaps.views import (
    RunPlayViewSet,
    PassPlayViewSet,
    DefenseSnapViewSet,
    PuntSnapViewSet,
    KickoffSnapViewSet,
    FieldGoalSnapViewSet,
    ExtraPointSnapViewSet,
)

router = DefaultRouter()

# Teams
router.register(r"teams", TeamViewSet, basename="team")
router.register(r"seasons", SeasonViewSet, basename="season")
router.register(r"players", PlayerViewSet, basename="player")

# Games
router.register(r"games", GameViewSet, basename="game")
router.register(r"quarter-scores", QuarterScoreViewSet, basename="quarter-score")

# Snaps
router.register(r"snaps/run", RunPlayViewSet, basename="run-play")
router.register(r"snaps/pass", PassPlayViewSet, basename="pass-play")
router.register(r"snaps/defense", DefenseSnapViewSet, basename="defense-snap")
router.register(r"snaps/punt", PuntSnapViewSet, basename="punt")
router.register(r"snaps/kickoff", KickoffSnapViewSet, basename="kickoff")
router.register(r"snaps/field-goal", FieldGoalSnapViewSet, basename="field-goal")
router.register(r"snaps/extra-point", ExtraPointSnapViewSet, basename="extra-point")

urlpatterns = [
    path("", include(router.urls)),
    path("reports/", include("apps.reports.urls")),
    path("auth/", include("apps.accounts.urls")),
]
