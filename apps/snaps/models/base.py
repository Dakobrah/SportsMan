"""
Base snap models - polymorphic base class and Play reference table.
"""
from django.db import models
from polymorphic.models import PolymorphicModel
from apps.core.models import TimeStampedModel


class Play(TimeStampedModel):
    """
    Reference table for play/formation names.
    Examples: "I-Formation", "Shotgun", "4-3 Defense"
    """

    class UnitType(models.TextChoices):
        OFFENSE = "OFF", "Offense"
        DEFENSE = "DEF", "Defense"
        SPECIAL_TEAMS = "ST", "Special Teams"

    name = models.CharField(max_length=100)
    unit_type = models.CharField(max_length=3, choices=UnitType.choices)
    description = models.TextField(blank=True)

    class Meta:
        db_table = "plays"

    def __str__(self):
        return f"{self.name} ({self.get_unit_type_display()})"


class BaseSnap(PolymorphicModel, TimeStampedModel):
    """
    Base class for all snap types using django-polymorphic.

    This allows:
    - BaseSnap.objects.all() returns all snap types
    - RunPlay.objects.all() returns only run plays
    - Automatic downcasting to correct subclass
    """

    game = models.ForeignKey(
        "games.Game", on_delete=models.CASCADE, related_name="snaps"
    )

    # Play sequencing within the game
    sequence_number = models.PositiveIntegerField(
        help_text="Order of this play within the game (1, 2, 3...)"
    )
    quarter = models.PositiveSmallIntegerField()
    game_clock = models.DurationField(
        null=True, blank=True, help_text="Time remaining in quarter (e.g., 12:34)"
    )

    # Down and distance (null for kickoffs, PATs, etc.)
    down = models.PositiveSmallIntegerField(null=True, blank=True)
    distance = models.PositiveSmallIntegerField(
        null=True, blank=True, help_text="Yards needed for first down"
    )
    ball_position = models.SmallIntegerField(
        null=True, blank=True, help_text="Yard line (-50 to 50, negative = own territory)"
    )

    formation = models.CharField(max_length=50, blank=True)
    play_called = models.ForeignKey(
        Play, on_delete=models.SET_NULL, null=True, blank=True
    )
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "snaps"
        ordering = ["game", "sequence_number"]
        indexes = [
            models.Index(fields=["game", "quarter"]),
            models.Index(fields=["game", "sequence_number"]),
        ]

    def __str__(self):
        return f"{self.game} - Play #{self.sequence_number}"
