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


class GameState(TimeStampedModel):
    """
    Server-authoritative live-tracker state for a game.

    One mutable row per game, updated inside the same transaction as each
    snap write. Writers MUST hold the Game row lock (select_for_update on
    Game) — GameState itself is never locked directly.

    ``version`` increments on every mutation so pollers can cheaply detect
    "nothing changed". ``last_sequence`` mirrors the highest snap
    sequence_number so clients can request only newer plays.
    """

    class Possession(models.TextChoices):
        HOME = "home", "Home"
        AWAY = "away", "Away"

    game = models.OneToOneField(
        Game, on_delete=models.CASCADE, related_name="live_state"
    )
    quarter = models.PositiveSmallIntegerField(default=1)
    down = models.PositiveSmallIntegerField(null=True, blank=True)
    distance = models.PositiveSmallIntegerField(null=True, blank=True)
    ball_position = models.SmallIntegerField(
        null=True, blank=True, help_text="Yard line (-50 to 50, negative = own territory)"
    )
    los_position = models.SmallIntegerField(null=True, blank=True)
    possession = models.CharField(
        max_length=4, choices=Possession.choices, blank=True, default=""
    )
    # pregame | kickoff | normal | opponent_ball | extra_point | opponent_td
    # | free_kick_us | free_kick_opp | turnover | turnover_on_downs
    situation = models.CharField(max_length=20, default="pregame")
    coin_toss_winner = models.CharField(max_length=4, blank=True, default="")
    coin_toss_choice = models.CharField(max_length=8, blank=True, default="")
    version = models.PositiveIntegerField(default=0)
    last_sequence = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "game_states"

    def __str__(self):
        return f"GameState(game={self.game_id}, v{self.version})"


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
