"""
Special teams snap models.
"""
from django.db import models
from .base import BaseSnap


class SpecialTeamsSnap(BaseSnap):
    """
    Base for all special teams plays.
    """

    penalty_player = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="st_penalties",
    )
    penalty_yards = models.SmallIntegerField(null=True, blank=True)
    penalty_description = models.CharField(max_length=100, blank=True)

    class Meta:
        db_table = "snaps_special_teams"


class PuntSnap(SpecialTeamsSnap):
    """Punt play from the punting team's perspective."""

    punter = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        related_name="punts",
    )
    punt_yards = models.PositiveSmallIntegerField(default=0)
    hang_time = models.DurationField(
        null=True, blank=True, help_text="Ball hang time in seconds"
    )
    is_blocked = models.BooleanField(default=False)
    is_touchback = models.BooleanField(default=False)
    out_of_bounds = models.BooleanField(default=False)
    downed_at_yard_line = models.SmallIntegerField(null=True, blank=True)

    class Meta:
        db_table = "snaps_st_punt"


class PuntReturnSnap(SpecialTeamsSnap):
    """Punt return from the receiving team's perspective."""

    returner = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        related_name="punt_returns",
    )
    return_yards = models.SmallIntegerField(default=0)
    is_fair_catch = models.BooleanField(default=False)
    is_touchdown = models.BooleanField(default=False)
    fumbled = models.BooleanField(default=False)
    fumble_lost = models.BooleanField(default=False)

    tackler = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="punt_return_tackles",
    )

    class Meta:
        db_table = "snaps_st_punt_return"


class KickoffSnap(SpecialTeamsSnap):
    """Kickoff from the kicking team's perspective."""

    kicker = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        related_name="kickoffs",
    )
    kick_yards = models.PositiveSmallIntegerField(default=0)
    is_touchback = models.BooleanField(default=False)
    is_onside_kick = models.BooleanField(default=False)
    onside_recovered = models.BooleanField(default=False)
    out_of_bounds = models.BooleanField(default=False)

    class Meta:
        db_table = "snaps_st_kickoff"


class KickoffReturnSnap(SpecialTeamsSnap):
    """Kickoff return from the receiving team's perspective."""

    returner = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        related_name="kickoff_returns",
    )
    return_yards = models.SmallIntegerField(default=0)
    is_touchdown = models.BooleanField(default=False)
    fumbled = models.BooleanField(default=False)
    fumble_lost = models.BooleanField(default=False)

    tackler = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="kickoff_return_tackles",
    )

    class Meta:
        db_table = "snaps_st_kickoff_return"


class FieldGoalSnap(SpecialTeamsSnap):
    """Field goal attempt."""

    class Result(models.TextChoices):
        GOOD = "GOOD", "Good"
        MISSED = "MISS", "Missed"
        BLOCKED = "BLOCK", "Blocked"

    kicker = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        related_name="field_goal_attempts",
    )
    holder = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="field_goal_holds",
    )
    distance = models.PositiveSmallIntegerField(help_text="Attempt distance in yards")
    result = models.CharField(max_length=10, choices=Result.choices)

    class Meta:
        db_table = "snaps_st_field_goal"


class ExtraPointSnap(SpecialTeamsSnap):
    """
    Point After Touchdown (PAT) or 2-point conversion.
    """

    class AttemptType(models.TextChoices):
        KICK = "KICK", "PAT Kick"
        TWO_PT_RUN = "2PT_RUN", "2-Point Run"
        TWO_PT_PASS = "2PT_PASS", "2-Point Pass"

    class Result(models.TextChoices):
        GOOD = "GOOD", "Good"
        MISSED = "MISS", "Missed"
        BLOCKED = "BLOCK", "Blocked"
        FAILED = "FAIL", "Failed (2pt)"

    attempt_type = models.CharField(max_length=10, choices=AttemptType.choices)
    result = models.CharField(max_length=10, choices=Result.choices)

    # For kicks
    kicker = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="extra_point_kicks",
    )

    # For 2-point conversions
    ball_carrier = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="two_point_carries",
    )
    passer = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="two_point_passes",
    )
    receiver = models.ForeignKey(
        "teams.Player",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="two_point_receptions",
    )

    class Meta:
        db_table = "snaps_st_extra_point"
