"""
Defensive snap models.
"""
from django.db import models
from .base import BaseSnap


class DefenseSnap(BaseSnap):
    """
    Defensive play tracking.
    """

    class PlayResult(models.TextChoices):
        TACKLE = "TACKLE", "Tackle"
        TACKLE_FOR_LOSS = "TFL", "Tackle for Loss"
        SACK = "SACK", "Sack"
        INTERCEPTION = "INT", "Interception"
        FUMBLE_RECOVERY = "FREC", "Fumble Recovery"
        PASS_DEFENDED = "PD", "Pass Defended"
        PENALTY = "PENALTY", "Penalty"

    play_result = models.CharField(max_length=10, choices=PlayResult.choices)
    secondary_formation = models.CharField(
        max_length=50, blank=True, help_text="Defensive backfield alignment"
    )

    # Primary defender who made the play
    primary_player = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="defense_primary_plays",
    )

    # Tackle details
    tackle_yards = models.SmallIntegerField(
        null=True, blank=True, help_text="Yards gained by offense on this play"
    )
    tackle_for_loss = models.BooleanField(default=False)

    # Pressure and coverage
    applied_pressure = models.BooleanField(default=False)
    forced_incompletion = models.BooleanField(default=False)

    # Turnover details
    interception_return_yards = models.SmallIntegerField(null=True, blank=True)
    fumble_return_yards = models.SmallIntegerField(null=True, blank=True)
    is_defensive_touchdown = models.BooleanField(default=False)

    # Penalty
    penalty_player = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="defense_penalties",
    )
    penalty_yards = models.SmallIntegerField(null=True, blank=True)
    penalty_description = models.CharField(max_length=100, blank=True)

    class Meta:
        db_table = "snaps_defense"


class DefenseSnapAssist(models.Model):
    """
    Tracks defensive assists (e.g., shared tackles, sack assists).
    """

    class AssistType(models.TextChoices):
        TACKLE = "TACKLE", "Tackle Assist"
        SACK = "SACK", "Sack Assist"
        COVERAGE = "COV", "Coverage Assist"

    snap = models.ForeignKey(
        DefenseSnap, on_delete=models.CASCADE, related_name="assists"
    )
    player = models.ForeignKey(
        "teams.Player", on_delete=models.CASCADE, related_name="defense_assists"
    )
    assist_type = models.CharField(max_length=10, choices=AssistType.choices)

    class Meta:
        db_table = "snaps_defense_assists"
        unique_together = ["snap", "player", "assist_type"]

    def __str__(self):
        return f"{self.player} - {self.get_assist_type_display()}"
