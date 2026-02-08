"""
Live Game Tracker URL configuration.
"""
from django.urls import path
from . import tracker

app_name = 'tracker'

urlpatterns = [
    # Main tracker page
    path('games/<int:pk>/tracker/', tracker.game_tracker, name='game_tracker'),

    # AJAX play creation endpoints
    path('games/<int:pk>/tracker/run/', tracker.tracker_add_run, name='add_run'),
    path('games/<int:pk>/tracker/pass/', tracker.tracker_add_pass, name='add_pass'),
    path('games/<int:pk>/tracker/penalty/', tracker.tracker_add_penalty, name='add_penalty'),
    path('games/<int:pk>/tracker/kickoff/', tracker.tracker_add_kickoff, name='add_kickoff'),
    path('games/<int:pk>/tracker/punt/', tracker.tracker_add_punt, name='add_punt'),
    path('games/<int:pk>/tracker/field-goal/', tracker.tracker_add_field_goal, name='add_field_goal'),
    path('games/<int:pk>/tracker/extra-point/', tracker.tracker_add_extra_point, name='add_extra_point'),

    # Game state endpoints
    path('games/<int:pk>/tracker/update-score/', tracker.tracker_update_score, name='update_score'),
    path('games/<int:pk>/tracker/undo/', tracker.tracker_undo_play, name='undo_play'),
    path('games/<int:pk>/tracker/plays/', tracker.tracker_recent_plays, name='recent_plays'),
]
