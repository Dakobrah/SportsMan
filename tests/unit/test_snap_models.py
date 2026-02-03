"""
Unit tests for snap models.
"""
import pytest
from datetime import timedelta
from apps.snaps.models import (
    Play,
    RunPlay,
    PassPlay,
    DefenseSnap,
    DefenseSnapAssist,
    PuntSnap,
    KickoffSnap,
    FieldGoalSnap,
    ExtraPointSnap,
)
from tests.factories import GameFactory, PlayerFactory


@pytest.mark.django_db
class TestPlayModel:
    """Tests for Play reference model."""

    def test_create_offensive_play(self):
        """Create an offensive play formation."""
        play = Play.objects.create(
            name="Shotgun Spread",
            unit_type="OFF",
            description="4 WR spread formation"
        )
        assert str(play) == "Shotgun Spread (Offense)"

    def test_create_defensive_play(self):
        """Create a defensive formation."""
        play = Play.objects.create(
            name="4-3 Cover 2",
            unit_type="DEF",
            description="Standard 4-3 with Cover 2 shell"
        )
        assert play.get_unit_type_display() == "Defense"


@pytest.mark.django_db
class TestRunPlayModel:
    """Tests for RunPlay model."""

    def test_create_basic_run(self):
        """Create a basic run play."""
        game = GameFactory()
        rb = PlayerFactory(team=game.season.team, position="RB")

        run = RunPlay.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            down=1,
            distance=10,
            ball_carrier=rb,
            yards_gained=5
        )

        assert run.play_result == "RUN"
        assert run.yards_gained == 5
        assert run.is_touchdown is False

    def test_run_play_auto_sets_result(self):
        """Run play automatically sets play_result to RUN on save."""
        game = GameFactory()
        rb = PlayerFactory(position="RB")

        run = RunPlay(
            game=game,
            sequence_number=1,
            quarter=1,
            ball_carrier=rb,
            yards_gained=10
        )
        run.save()

        assert run.play_result == "RUN"

    def test_touchdown_run(self):
        """Test a touchdown run play."""
        game = GameFactory()
        rb = PlayerFactory(position="RB")

        run = RunPlay.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            down=1,
            distance=5,
            ball_carrier=rb,
            yards_gained=5,
            is_touchdown=True,
            is_first_down=True
        )

        assert run.is_touchdown is True
        assert run.is_first_down is True

    def test_fumble_run(self):
        """Test a run play with fumble."""
        game = GameFactory()
        rb = PlayerFactory(position="RB")
        defender = PlayerFactory(position="LB")

        run = RunPlay.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            ball_carrier=rb,
            yards_gained=3,
            fumbled=True,
            fumble_lost=True,
            fumble_recovered_by=defender
        )

        assert run.fumbled is True
        assert run.fumble_lost is True
        assert run.fumble_recovered_by == defender

    def test_run_with_penalty(self):
        """Test a run play with offensive penalty."""
        game = GameFactory()
        rb = PlayerFactory(position="RB")
        ol = PlayerFactory(position="OL")

        run = RunPlay.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            ball_carrier=rb,
            yards_gained=10,
            had_penalty=True,
            penalty_player=ol,
            penalty_yards=10,
            penalty_description="Holding"
        )

        assert run.had_penalty is True
        assert run.penalty_yards == 10


@pytest.mark.django_db
class TestPassPlayModel:
    """Tests for PassPlay model."""

    def test_complete_pass(self):
        """Test a completed pass."""
        game = GameFactory()
        qb = PlayerFactory(position="QB")
        wr = PlayerFactory(position="WR")

        pass_play = PassPlay.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            down=2,
            distance=8,
            quarterback=qb,
            target=wr,
            receiver=wr,
            is_complete=True,
            yards_gained=15,
            air_yards=10,
            yards_after_catch=5,
            is_first_down=True
        )

        assert pass_play.play_result == "PASS"
        assert pass_play.is_complete is True
        assert pass_play.yards_gained == 15

    def test_incomplete_pass(self):
        """Test an incomplete pass."""
        game = GameFactory()
        qb = PlayerFactory(position="QB")
        wr = PlayerFactory(position="WR")

        pass_play = PassPlay.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            quarterback=qb,
            target=wr,
            is_complete=False,
            yards_gained=0
        )

        assert pass_play.is_complete is False
        assert pass_play.receiver is None

    def test_sack(self):
        """Test a sack play."""
        game = GameFactory()
        qb = PlayerFactory(position="QB")

        pass_play = PassPlay.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            quarterback=qb,
            was_sacked=True,
            sack_yards=-8,
            yards_gained=0
        )

        assert pass_play.play_result == "SACK"
        assert pass_play.was_sacked is True
        assert pass_play.sack_yards == -8

    def test_interception(self):
        """Test an interception."""
        game = GameFactory()
        qb = PlayerFactory(position="QB")
        wr = PlayerFactory(position="WR")

        pass_play = PassPlay.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            quarterback=qb,
            target=wr,
            is_complete=False,
            is_interception=True,
            yards_gained=0
        )

        assert pass_play.is_interception is True

    def test_td_pass(self):
        """Test a touchdown pass."""
        game = GameFactory()
        qb = PlayerFactory(position="QB")
        te = PlayerFactory(position="TE")

        pass_play = PassPlay.objects.create(
            game=game,
            sequence_number=1,
            quarter=3,
            down=2,
            distance=5,
            quarterback=qb,
            target=te,
            receiver=te,
            is_complete=True,
            yards_gained=15,
            air_yards=12,
            yards_after_catch=3,
            is_touchdown=True,
            is_first_down=True
        )

        assert pass_play.is_touchdown is True
        assert pass_play.is_complete is True

    def test_thrown_away(self):
        """Test a thrown away pass."""
        game = GameFactory()
        qb = PlayerFactory(position="QB")

        pass_play = PassPlay.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            quarterback=qb,
            is_complete=False,
            is_thrown_away=True,
            was_under_pressure=True
        )

        assert pass_play.is_thrown_away is True
        assert pass_play.was_under_pressure is True


@pytest.mark.django_db
class TestDefenseSnapModel:
    """Tests for DefenseSnap model."""

    def test_tackle(self):
        """Test a basic tackle."""
        game = GameFactory()
        lb = PlayerFactory(position="LB")

        defense = DefenseSnap.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            play_result="TACKLE",
            primary_player=lb,
            tackle_yards=4
        )

        assert defense.play_result == "TACKLE"
        assert defense.tackle_yards == 4

    def test_tackle_for_loss(self):
        """Test a tackle for loss."""
        game = GameFactory()
        dl = PlayerFactory(position="DL")

        defense = DefenseSnap.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            play_result="TFL",
            primary_player=dl,
            tackle_yards=-3,
            tackle_for_loss=True,
            applied_pressure=True
        )

        assert defense.play_result == "TFL"
        assert defense.tackle_for_loss is True
        assert defense.tackle_yards == -3

    def test_sack(self):
        """Test a defensive sack."""
        game = GameFactory()
        de = PlayerFactory(position="DL")

        defense = DefenseSnap.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            play_result="SACK",
            primary_player=de,
            tackle_yards=-8,
            tackle_for_loss=True,
            applied_pressure=True
        )

        assert defense.play_result == "SACK"

    def test_interception_return_td(self):
        """Test an interception returned for TD."""
        game = GameFactory()
        cb = PlayerFactory(position="CB")

        defense = DefenseSnap.objects.create(
            game=game,
            sequence_number=1,
            quarter=2,
            play_result="INT",
            primary_player=cb,
            interception_return_yards=45,
            is_defensive_touchdown=True
        )

        assert defense.play_result == "INT"
        assert defense.interception_return_yards == 45
        assert defense.is_defensive_touchdown is True

    def test_fumble_recovery(self):
        """Test a fumble recovery."""
        game = GameFactory()
        lb = PlayerFactory(position="LB")

        defense = DefenseSnap.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            play_result="FREC",
            primary_player=lb,
            fumble_return_yards=15
        )

        assert defense.play_result == "FREC"
        assert defense.fumble_return_yards == 15

    def test_defense_with_assists(self):
        """Test a defensive play with assists."""
        game = GameFactory()
        lb1 = PlayerFactory(position="LB")
        lb2 = PlayerFactory(position="LB")
        s = PlayerFactory(position="S")

        defense = DefenseSnap.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            play_result="TACKLE",
            primary_player=lb1,
            tackle_yards=2
        )

        # Add assists
        DefenseSnapAssist.objects.create(
            snap=defense,
            player=lb2,
            assist_type="TACKLE"
        )
        DefenseSnapAssist.objects.create(
            snap=defense,
            player=s,
            assist_type="TACKLE"
        )

        assert defense.assists.count() == 2


@pytest.mark.django_db
class TestSpecialTeamsModels:
    """Tests for special teams snap models."""

    def test_punt(self):
        """Test a punt."""
        game = GameFactory()
        p = PlayerFactory(position="P")

        punt = PuntSnap.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            down=4,
            distance=8,
            punter=p,
            punt_yards=45,
            hang_time=timedelta(seconds=4, milliseconds=500),
            is_touchback=False,
            downed_at_yard_line=15
        )

        assert punt.punt_yards == 45
        assert punt.hang_time == timedelta(seconds=4, milliseconds=500)

    def test_blocked_punt(self):
        """Test a blocked punt."""
        game = GameFactory()
        p = PlayerFactory(position="P")

        punt = PuntSnap.objects.create(
            game=game,
            sequence_number=1,
            quarter=2,
            punter=p,
            punt_yards=0,
            is_blocked=True
        )

        assert punt.is_blocked is True
        assert punt.punt_yards == 0

    def test_touchback_punt(self):
        """Test a touchback punt."""
        game = GameFactory()
        p = PlayerFactory(position="P")

        punt = PuntSnap.objects.create(
            game=game,
            sequence_number=1,
            quarter=3,
            punter=p,
            punt_yards=55,
            is_touchback=True
        )

        assert punt.is_touchback is True

    def test_kickoff(self):
        """Test a kickoff."""
        game = GameFactory()
        k = PlayerFactory(position="K")

        kickoff = KickoffSnap.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            kicker=k,
            kick_yards=65,
            is_touchback=False
        )

        assert kickoff.kick_yards == 65

    def test_touchback_kickoff(self):
        """Test a touchback kickoff."""
        game = GameFactory()
        k = PlayerFactory(position="K")

        kickoff = KickoffSnap.objects.create(
            game=game,
            sequence_number=1,
            quarter=3,
            kicker=k,
            kick_yards=75,
            is_touchback=True
        )

        assert kickoff.is_touchback is True

    def test_onside_kick_recovered(self):
        """Test an onside kick that's recovered."""
        game = GameFactory()
        k = PlayerFactory(position="K")

        kickoff = KickoffSnap.objects.create(
            game=game,
            sequence_number=1,
            quarter=4,
            kicker=k,
            kick_yards=12,
            is_onside_kick=True,
            onside_recovered=True
        )

        assert kickoff.is_onside_kick is True
        assert kickoff.onside_recovered is True

    def test_field_goal_good(self):
        """Test a made field goal."""
        game = GameFactory()
        k = PlayerFactory(position="K")
        h = PlayerFactory(position="P")

        fg = FieldGoalSnap.objects.create(
            game=game,
            sequence_number=1,
            quarter=2,
            kicker=k,
            holder=h,
            distance=45,
            result="GOOD"
        )

        assert fg.result == "GOOD"
        assert fg.distance == 45

    def test_field_goal_missed(self):
        """Test a missed field goal."""
        game = GameFactory()
        k = PlayerFactory(position="K")

        fg = FieldGoalSnap.objects.create(
            game=game,
            sequence_number=1,
            quarter=4,
            kicker=k,
            distance=52,
            result="MISS"
        )

        assert fg.result == "MISS"

    def test_extra_point_kick_good(self):
        """Test a made PAT kick."""
        game = GameFactory()
        k = PlayerFactory(position="K")

        xp = ExtraPointSnap.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            attempt_type="KICK",
            result="GOOD",
            kicker=k
        )

        assert xp.attempt_type == "KICK"
        assert xp.result == "GOOD"

    def test_two_point_conversion_run(self):
        """Test a 2-point conversion run."""
        game = GameFactory()
        rb = PlayerFactory(position="RB")

        xp = ExtraPointSnap.objects.create(
            game=game,
            sequence_number=1,
            quarter=2,
            attempt_type="2PT_RUN",
            result="GOOD",
            ball_carrier=rb
        )

        assert xp.attempt_type == "2PT_RUN"
        assert xp.result == "GOOD"

    def test_two_point_conversion_pass(self):
        """Test a 2-point conversion pass."""
        game = GameFactory()
        qb = PlayerFactory(position="QB")
        wr = PlayerFactory(position="WR")

        xp = ExtraPointSnap.objects.create(
            game=game,
            sequence_number=1,
            quarter=3,
            attempt_type="2PT_PASS",
            result="GOOD",
            passer=qb,
            receiver=wr
        )

        assert xp.attempt_type == "2PT_PASS"
        assert xp.passer == qb
        assert xp.receiver == wr

    def test_blocked_extra_point(self):
        """Test a blocked extra point."""
        game = GameFactory()
        k = PlayerFactory(position="K")

        xp = ExtraPointSnap.objects.create(
            game=game,
            sequence_number=1,
            quarter=4,
            attempt_type="KICK",
            result="BLOCK",
            kicker=k
        )

        assert xp.result == "BLOCK"
