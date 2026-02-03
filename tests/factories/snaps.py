"""
Factories for snaps models.
"""
import factory
from factory.django import DjangoModelFactory
from apps.snaps.models import RunPlay, PassPlay, DefenseSnap
from .games import GameFactory
from .teams import PlayerFactory


class RunPlayFactory(DjangoModelFactory):
    class Meta:
        model = RunPlay

    game = factory.SubFactory(GameFactory)
    sequence_number = factory.Sequence(lambda n: n + 1)
    quarter = factory.Iterator([1, 2, 3, 4])
    down = factory.Iterator([1, 2, 3, 4])
    distance = 10
    ball_carrier = factory.SubFactory(PlayerFactory, position="RB")
    yards_gained = factory.Faker("pyint", min_value=-5, max_value=20)
    is_touchdown = False
    is_first_down = False
    play_result = "RUN"


class PassPlayFactory(DjangoModelFactory):
    class Meta:
        model = PassPlay

    game = factory.SubFactory(GameFactory)
    sequence_number = factory.Sequence(lambda n: n + 1)
    quarter = factory.Iterator([1, 2, 3, 4])
    down = factory.Iterator([1, 2, 3, 4])
    distance = 10
    quarterback = factory.SubFactory(PlayerFactory, position="QB")
    target = factory.SubFactory(PlayerFactory, position="WR")
    receiver = factory.LazyAttribute(lambda obj: obj.target)
    is_complete = True
    yards_gained = factory.Faker("pyint", min_value=0, max_value=30)
    air_yards = factory.Faker("pyint", min_value=0, max_value=20)
    yards_after_catch = factory.LazyAttribute(
        lambda obj: obj.yards_gained - obj.air_yards if obj.yards_gained > obj.air_yards else 0
    )
    is_touchdown = False
    is_first_down = False
    play_result = "PASS"


class DefenseSnapFactory(DjangoModelFactory):
    class Meta:
        model = DefenseSnap

    game = factory.SubFactory(GameFactory)
    sequence_number = factory.Sequence(lambda n: n + 1)
    quarter = factory.Iterator([1, 2, 3, 4])
    play_result = "TACKLE"
    primary_player = factory.SubFactory(PlayerFactory, position="LB")
    tackle_yards = factory.Faker("pyint", min_value=0, max_value=10)
