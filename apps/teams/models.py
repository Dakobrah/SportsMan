"""
Team, Season, and Player models.
"""
from django.db import models
from apps.core.models import TimeStampedModel


class Team(TimeStampedModel):
    """
    Represents a football team. Supports multi-team scenarios.
    """

    name = models.CharField(max_length=100)
    abbreviation = models.CharField(max_length=10, unique=True)

    class Meta:
        db_table = "teams"

    def __str__(self):
        return self.name


class Season(TimeStampedModel):
    """
    Separate season tracking allows year-over-year analysis.
    """

    year = models.PositiveSmallIntegerField()
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="seasons")

    class Meta:
        db_table = "seasons"
        unique_together = ["year", "team"]
        ordering = ["-year"]

    def __str__(self):
        return f"{self.team.abbreviation} {self.year}"


class Player(TimeStampedModel):
    """
    Football player with position-based categorization.
    """

    class Position(models.TextChoices):
        # Offense
        QB = "QB", "Quarterback"
        RB = "RB", "Running Back"
        FB = "FB", "Fullback"
        WR = "WR", "Wide Receiver"
        TE = "TE", "Tight End"
        OL = "OL", "Offensive Line"
        # Defense
        DL = "DL", "Defensive Line"
        LB = "LB", "Linebacker"
        CB = "CB", "Cornerback"
        S = "S", "Safety"
        # Special Teams
        K = "K", "Kicker"
        P = "P", "Punter"
        LS = "LS", "Long Snapper"

    first_name = models.CharField(max_length=50)
    last_name = models.CharField(max_length=50)
    position = models.CharField(max_length=3, choices=Position.choices)
    number = models.PositiveSmallIntegerField()
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="players")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "players"
        indexes = [
            models.Index(fields=["team", "is_active"]),
            models.Index(fields=["last_name", "first_name"]),
        ]
        ordering = ["number"]

    def __str__(self):
        return f"#{self.number} {self.first_name} {self.last_name}"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"
