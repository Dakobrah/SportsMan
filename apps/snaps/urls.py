"""
URL configuration for snaps app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    RunPlayViewSet,
    PassPlayViewSet,
    DefenseSnapViewSet,
    PuntSnapViewSet,
    KickoffSnapViewSet,
    FieldGoalSnapViewSet,
    ExtraPointSnapViewSet,
)

router = DefaultRouter()
router.register(r"run", RunPlayViewSet, basename="run-play")
router.register(r"pass", PassPlayViewSet, basename="pass-play")
router.register(r"defense", DefenseSnapViewSet, basename="defense-snap")
router.register(r"punt", PuntSnapViewSet, basename="punt")
router.register(r"kickoff", KickoffSnapViewSet, basename="kickoff")
router.register(r"field-goal", FieldGoalSnapViewSet, basename="field-goal")
router.register(r"extra-point", ExtraPointSnapViewSet, basename="extra-point")

urlpatterns = [
    path("", include(router.urls)),
]
