"""
Admin configuration for snaps app.
"""
from django.contrib import admin
from polymorphic.admin import PolymorphicParentModelAdmin, PolymorphicChildModelAdmin
from .models import (
    Play,
    BaseSnap,
    RunPlay,
    PassPlay,
    DefenseSnap,
    DefenseSnapAssist,
    PuntSnap,
    KickoffSnap,
    FieldGoalSnap,
    ExtraPointSnap,
)


@admin.register(Play)
class PlayAdmin(admin.ModelAdmin):
    list_display = ["name", "unit_type", "created_at"]
    list_filter = ["unit_type"]
    search_fields = ["name", "description"]


class DefenseSnapAssistInline(admin.TabularInline):
    model = DefenseSnapAssist
    extra = 1


@admin.register(RunPlay)
class RunPlayAdmin(PolymorphicChildModelAdmin):
    base_model = RunPlay
    list_display = [
        "game",
        "sequence_number",
        "quarter",
        "ball_carrier",
        "yards_gained",
        "is_touchdown",
    ]
    list_filter = ["game", "quarter", "is_touchdown", "fumbled"]
    search_fields = ["ball_carrier__last_name"]


@admin.register(PassPlay)
class PassPlayAdmin(PolymorphicChildModelAdmin):
    base_model = PassPlay
    list_display = [
        "game",
        "sequence_number",
        "quarter",
        "quarterback",
        "is_complete",
        "yards_gained",
        "is_touchdown",
    ]
    list_filter = ["game", "quarter", "is_complete", "is_touchdown", "is_interception"]
    search_fields = ["quarterback__last_name", "receiver__last_name"]


@admin.register(DefenseSnap)
class DefenseSnapAdmin(PolymorphicChildModelAdmin):
    base_model = DefenseSnap
    list_display = [
        "game",
        "sequence_number",
        "quarter",
        "play_result",
        "primary_player",
    ]
    list_filter = ["game", "quarter", "play_result"]
    inlines = [DefenseSnapAssistInline]


@admin.register(PuntSnap)
class PuntSnapAdmin(PolymorphicChildModelAdmin):
    base_model = PuntSnap
    list_display = ["game", "sequence_number", "quarter", "punter", "punt_yards"]
    list_filter = ["game", "quarter", "is_blocked", "is_touchback"]


@admin.register(KickoffSnap)
class KickoffSnapAdmin(PolymorphicChildModelAdmin):
    base_model = KickoffSnap
    list_display = ["game", "sequence_number", "quarter", "kicker", "kick_yards"]
    list_filter = ["game", "quarter", "is_touchback", "is_onside_kick"]


@admin.register(FieldGoalSnap)
class FieldGoalSnapAdmin(PolymorphicChildModelAdmin):
    base_model = FieldGoalSnap
    list_display = ["game", "sequence_number", "quarter", "kicker", "distance", "result"]
    list_filter = ["game", "quarter", "result"]


@admin.register(ExtraPointSnap)
class ExtraPointSnapAdmin(PolymorphicChildModelAdmin):
    base_model = ExtraPointSnap
    list_display = ["game", "sequence_number", "quarter", "attempt_type", "result"]
    list_filter = ["game", "quarter", "attempt_type", "result"]


@admin.register(BaseSnap)
class BaseSnapAdmin(PolymorphicParentModelAdmin):
    base_model = BaseSnap
    child_models = [
        RunPlay,
        PassPlay,
        DefenseSnap,
        PuntSnap,
        KickoffSnap,
        FieldGoalSnap,
        ExtraPointSnap,
    ]
    list_display = ["game", "sequence_number", "quarter"]
    list_filter = ["game", "quarter"]
