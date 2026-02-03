"""
Game and QuarterScore models.
"""
from django.db import models
from apps.core.models import TimeStampedModel


class Game(TimeStampedModel):
    """
    Represents a single football game with conditions and final scores.
    """

    class Weather(models.TextChoices):
        CLEAR = "clear", "Clear"
        RAINY = "rainy", "Rainy"
        SNOWY = "snowy", "Snowy"
        WINDY = "windy", "Windy"
        HOT = "hot", "Hot (>85°F)"
        COLD = "cold", "Cold (<40°F)"

    class Location(models.TextChoices):
        HOME = "home", "Home"
        AWAY = "away", "Away"
        NEUTRAL = "neutral", "Neutral Site"

    class FieldCondition(models.TextChoices):
        TURF = "turf", "Artificial Turf"
        GRASS = "grass", "Natural Grass"
        WET = "wet", "Wet/Muddy"

    season = models.ForeignKey(
        "teams.Season", on_delete=models.CASCADE, related_name="games"
    )
    date = models.DateField()
    opponent = models.CharField(max_length=100)
    location = models.CharField(max_length=10, choices=Location.choices)
    weather = models.CharField(max_length=10, choices=Weather.choices)
    field_condition = models.CharField(max_length=10, choices=FieldCondition.choices)

    # Final scores
    team_score = models.PositiveSmallIntegerField(default=0)
    opponent_score = models.PositiveSmallIntegerField(default=0)

    notes = models.TextField(blank=True)

    class Meta:
        db_table = "games"
        ordering = ["-date"]
        indexes = [
            models.Index(fields=["season", "date"]),
        ]

    def __str__(self):
        return f"{self.season.team.abbreviation} vs {self.opponent} ({self.date})"

    @property
    def is_win(self):
        return self.team_score > self.opponent_score

    @property
    def is_loss(self):
        return self.team_score < self.opponent_score

    @property
    def is_tie(self):
        return self.team_score == self.opponent_score

    @property
    def result(self):
        if self.is_win:
            return "W"
        elif self.is_loss:
            return "L"
        return "T"


class QuarterScore(models.Model):
    """
    Normalized quarter-by-quarter scoring.
    """

    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="quarter_scores")
    quarter = models.PositiveSmallIntegerField()  # 1-4, 5+ for overtime
    team_score = models.PositiveSmallIntegerField(default=0)
    opponent_score = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "quarter_scores"
        unique_together = ["game", "quarter"]
        ordering = ["quarter"]

    def __str__(self):
        return f"{self.game} Q{self.quarter}: {self.team_score}-{self.opponent_score}"
