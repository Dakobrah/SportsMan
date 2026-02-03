"""
Factories for teams models.
"""
import factory
from factory.django import DjangoModelFactory
from apps.teams.models import Team, Season, Player


class TeamFactory(DjangoModelFactory):
    class Meta:
        model = Team

    name = factory.Sequence(lambda n: f"Team {n}")
    abbreviation = factory.Sequence(lambda n: f"TM{n}")


class SeasonFactory(DjangoModelFactory):
    class Meta:
        model = Season

    year = factory.Sequence(lambda n: 2020 + n)
    team = factory.SubFactory(TeamFactory)


class PlayerFactory(DjangoModelFactory):
    class Meta:
        model = Player

    first_name = factory.Faker("first_name")
    last_name = factory.Faker("last_name")
    position = factory.Iterator(["QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S"])
    number = factory.Sequence(lambda n: (n % 99) + 1)
    team = factory.SubFactory(TeamFactory)
    is_active = True
