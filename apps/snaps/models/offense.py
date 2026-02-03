"""
Offensive snap models - RunPlay and PassPlay.
"""
from django.db import models
from .base import BaseSnap


class OffenseSnap(BaseSnap):
    """
    Base for offensive plays. Contains fields common to all offense.
    """

    class PlayResult(models.TextChoices):
        RUN = "RUN", "Run"
        PASS = "PASS", "Pass"
        SACK = "SACK", "Sack"
        PENALTY = "PENALTY", "Penalty Only"
        KNEEL = "KNEEL", "Kneel"
        SPIKE = "SPIKE", "Spike"

    play_result = models.CharField(max_length=10, choices=PlayResult.choices)

    # Penalty tracking
    had_penalty = models.BooleanField(default=False)
    penalty_player = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="offense_penalties",
    )
    penalty_yards = models.SmallIntegerField(null=True, blank=True)
    penalty_description = models.CharField(max_length=100, blank=True)

    class Meta:
        db_table = "snaps_offense"


class RunPlay(OffenseSnap):
    """
    Rushing play details.
    """

    ball_carrier = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        related_name="rushing_attempts",
    )
    yards_gained = models.SmallIntegerField(default=0)
    is_touchdown = models.BooleanField(default=False)
    is_first_down = models.BooleanField(default=False)

    # Fumble tracking
    fumbled = models.BooleanField(default=False)
    fumble_lost = models.BooleanField(
        default=False, help_text="True if opponent recovered"
    )
    fumble_recovered_by = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rushing_fumble_recoveries",
    )

    class Meta:
        db_table = "snaps_offense_run"

    def save(self, *args, **kwargs):
        self.play_result = OffenseSnap.PlayResult.RUN
        super().save(*args, **kwargs)


class PassPlay(OffenseSnap):
    """
    Passing play details with advanced metrics.
    """

    quarterback = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        related_name="pass_attempts",
    )

    # Target vs Receiver distinction
    target = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="targets",
    )
    receiver = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="receptions",
    )

    # Completion and yardage
    is_complete = models.BooleanField(default=False)
    yards_gained = models.SmallIntegerField(default=0)

    # Advanced passing metrics
    air_yards = models.SmallIntegerField(
        default=0, help_text="Yards traveled in the air before catch"
    )
    yards_after_catch = models.SmallIntegerField(
        default=0, help_text="YAC - yards gained after the catch"
    )

    # Outcome flags
    is_touchdown = models.BooleanField(default=False)
    is_first_down = models.BooleanField(default=False)
    is_interception = models.BooleanField(default=False)
    is_thrown_away = models.BooleanField(default=False)
    was_under_pressure = models.BooleanField(default=False)
    was_sacked = models.BooleanField(default=False)
    sack_yards = models.SmallIntegerField(
        default=0, help_text="Yards lost on sack (negative number)"
    )

    # Fumble tracking
    fumbled = models.BooleanField(default=False)
    fumble_lost = models.BooleanField(default=False)

    class Meta:
        db_table = "snaps_offense_pass"

    def save(self, *args, **kwargs):
        if self.was_sacked:
            self.play_result = OffenseSnap.PlayResult.SACK
        else:
            self.play_result = OffenseSnap.PlayResult.PASS
        super().save(*args, **kwargs)
