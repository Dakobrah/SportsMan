"""
Frontend URL configuration.
"""
from django.urls import path
from . import views

app_name = 'frontend'

urlpatterns = [
    # Authentication
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    path('register/', views.register_view, name='register'),
    path('profile/', views.profile_view, name='profile'),
    path('profile/password/', views.password_change_view, name='password_change'),

    # Teams
    path('teams/', views.team_list, name='team_list'),
    path('teams/add/', views.team_create, name='team_create'),
    path('teams/<int:pk>/', views.team_detail, name='team_detail'),
    path('teams/<int:pk>/edit/', views.team_edit, name='team_edit'),

    # Players
    path('players/', views.player_list, name='player_list'),
    path('players/add/', views.player_create, name='player_create'),
    path('players/<int:pk>/', views.player_detail, name='player_detail'),
    path('players/<int:pk>/edit/', views.player_edit, name='player_edit'),

    # Seasons
    path('seasons/', views.season_list, name='season_list'),

    # Games
    path('games/', views.game_list, name='game_list'),
    path('games/add/', views.game_create, name='game_create'),
    path('games/<int:pk>/', views.game_detail, name='game_detail'),
    path('games/<int:pk>/edit/', views.game_edit, name='game_edit'),
    path('games/<int:pk>/plays/', views.game_plays, name='game_plays'),
    path('games/<int:pk>/plays/add/', views.game_add_play, name='game_add_play'),

    # Play editing
    path('plays/<int:pk>/edit/', views.play_edit, name='play_edit'),

    # Reports
    path('reports/offense/', views.report_offense, name='report_offense'),
    path('reports/defense/', views.report_defense, name='report_defense'),
    path('reports/special-teams/', views.report_special_teams, name='report_special_teams'),
]
