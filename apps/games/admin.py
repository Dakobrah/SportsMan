"""
Admin configuration for games app.
"""
from django.contrib import admin
from .models import Game, QuarterScore


class QuarterScoreInline(admin.TabularInline):
    model = QuarterScore
    extra = 4
    max_num = 6  # 4 quarters + 2 OT


@admin.register(Game)
class GameAdmin(admin.ModelAdmin):
    list_display = [
        "date",
        "season",
        "opponent",
        "location",
        "team_score",
        "opponent_score",
        "result",
    ]
    list_filter = ["season", "location", "weather", "field_condition"]
    search_fields = ["opponent", "notes"]
    ordering = ["-date"]
    date_hierarchy = "date"
    inlines = [QuarterScoreInline]

    def result(self, obj):
        return obj.result

    result.short_description = "Result"
