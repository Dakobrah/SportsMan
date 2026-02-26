"""
Unit tests for snap model custom behavior (save() logic, relationships).
Field-storage correctness is covered by serializer tests.
"""
import pytest
from apps.snaps.models import (
    Play,
    RunPlay,
    PassPlay,
    DefenseSnap,
    DefenseSnapAssist,
)
from tests.factories import GameFactory, PlayerFactory


@pytest.mark.django_db
class TestPlayModel:
    """Tests for Play __str__ method."""

    def test_str(self):
        play = Play.objects.create(name="Shotgun Spread", unit_type="OFF")
        assert str(play) == "Shotgun Spread (Offense)"


@pytest.mark.django_db
class TestRunPlaySave:
    """Tests for RunPlay.save() auto-setting play_result."""

    def test_auto_sets_run(self):
        """save() always sets play_result to RUN regardless of initial value."""
        game = GameFactory()
        rb = PlayerFactory(position="RB")
        run = RunPlay(game=game, sequence_number=1, quarter=1, ball_carrier=rb, yards_gained=5)
        run.save()
        assert run.play_result == "RUN"


@pytest.mark.django_db
class TestPassPlaySave:
    """Tests for PassPlay.save() auto-setting play_result."""

    def test_sack_sets_sack_result(self):
        """save() sets play_result to SACK when was_sacked=True."""
        game = GameFactory()
        qb = PlayerFactory(position="QB")
        play = PassPlay(game=game, sequence_number=1, quarter=1, quarterback=qb, was_sacked=True, sack_yards=-7)
        play.save()
        assert play.play_result == "SACK"

    def test_completion_sets_pass_result(self):
        """save() sets play_result to PASS for a normal completion."""
        game = GameFactory()
        qb = PlayerFactory(position="QB")
        wr = PlayerFactory(position="WR")
        play = PassPlay(game=game, sequence_number=1, quarter=1, quarterback=qb, receiver=wr, is_complete=True, yards_gained=12)
        play.save()
        assert play.play_result == "PASS"


@pytest.mark.django_db
class TestDefenseSnapAssists:
    """Tests for DefenseSnap assist relationship."""

    def test_assists_linked_to_snap(self):
        """DefenseSnapAssist objects are accessible via snap.assists."""
        game = GameFactory()
        lb1 = PlayerFactory(position="LB")
        lb2 = PlayerFactory(position="LB")

        defense = DefenseSnap.objects.create(
            game=game, sequence_number=1, quarter=1,
            play_result="TACKLE", primary_player=lb1, tackle_yards=3,
        )
        DefenseSnapAssist.objects.create(snap=defense, player=lb2, assist_type="TACKLE")

        assert defense.assists.count() == 1
        assert defense.assists.first().player == lb2
