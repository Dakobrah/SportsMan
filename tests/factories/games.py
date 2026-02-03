"""
Factories for games models.
"""
import factory
from factory.django import DjangoModelFactory
from apps.games.models import Game, QuarterScore
from .teams import SeasonFactory


class GameFactory(DjangoModelFactory):
    class Meta:
        model = Game

    season = factory.SubFactory(SeasonFactory)
    date = factory.Faker("date_object")
    opponent = factory.Faker("city")
    location = "home"
    weather = "clear"
    field_condition = "grass"
    team_score = factory.Faker("pyint", min_value=0, max_value=50)
    opponent_score = factory.Faker("pyint", min_value=0, max_value=50)


class QuarterScoreFactory(DjangoModelFactory):
    class Meta:
        model = QuarterScore

    game = factory.SubFactory(GameFactory)
    quarter = factory.Iterator([1, 2, 3, 4])
    team_score = factory.Faker("pyint", min_value=0, max_value=21)
    opponent_score = factory.Faker("pyint", min_value=0, max_value=21)
