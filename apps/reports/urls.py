"""
URL configuration for reports app.
"""
from django.urls import path
from . import views

urlpatterns = [
    # Offense
    path("offense/rushing/totals/", views.RushingTotalsView.as_view(), name="rushing-totals"),
    path("offense/rushing/players/", views.RushingByPlayerView.as_view(), name="rushing-players"),
    path("offense/passing/totals/", views.PassingTotalsView.as_view(), name="passing-totals"),
    path("offense/passing/quarterbacks/", views.PassingByQBView.as_view(), name="passing-qbs"),
    path("offense/receiving/players/", views.ReceivingByPlayerView.as_view(), name="receiving-players"),
    # Defense
    path("defense/totals/", views.DefenseTotalsView.as_view(), name="defense-totals"),
    path("defense/players/", views.DefenseByPlayerView.as_view(), name="defense-players"),
    # Special Teams
    path("special-teams/punting/totals/", views.PuntTotalsView.as_view(), name="punt-totals"),
    path("special-teams/kicking/totals/", views.FieldGoalTotalsView.as_view(), name="fg-totals"),
    path("special-teams/kicking/kickers/", views.FieldGoalByKickerView.as_view(), name="fg-kickers"),
]
