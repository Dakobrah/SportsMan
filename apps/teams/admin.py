"""
Admin configuration for teams app.
"""
from django.contrib import admin
from .models import Team, Season, Player


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ["name", "abbreviation", "created_at"]
    search_fields = ["name", "abbreviation"]
    ordering = ["name"]


@admin.register(Season)
class SeasonAdmin(admin.ModelAdmin):
    list_display = ["team", "year", "created_at"]
    list_filter = ["team", "year"]
    ordering = ["-year", "team"]


@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    list_display = ["number", "first_name", "last_name", "position", "team", "is_active"]
    list_filter = ["team", "position", "is_active"]
    search_fields = ["first_name", "last_name"]
    ordering = ["team", "number"]
