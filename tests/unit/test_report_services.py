"""
Comprehensive tests for report services.
"""
import pytest
from apps.reports.services import (
    OffenseReportService,
    DefenseReportService,
    SpecialTeamsReportService,
)
from apps.snaps.models import (
    RunPlay,
    PassPlay,
    DefenseSnap,
    DefenseSnapAssist,
    PuntSnap,
    KickoffSnap,
    FieldGoalSnap,
    ExtraPointSnap,
)
from tests.factories import (
    TeamFactory,
    SeasonFactory,
    GameFactory,
    PlayerFactory,
)


@pytest.mark.django_db
class TestOffenseReportServiceRushing:
    """Tests for OffenseReportService rushing statistics."""

    def test_rushing_totals_empty(self):
        """Empty database returns zeros."""
        service = OffenseReportService()
        totals = service.get_rushing_totals()

        assert totals["attempts"] == 0
        assert totals["yards"] == 0
        assert totals["touchdowns"] == 0
        assert totals["first_downs"] == 0
        assert totals["fumbles"] == 0
        assert totals["fumbles_lost"] == 0
        assert totals["longest"] == 0
        assert totals["avg_yards"] == 0.0

    def test_rushing_totals_aggregation(self):
        """Correctly aggregates rushing statistics."""
        game = GameFactory()
        rb = PlayerFactory(position="RB")

        # Create varied run plays
        RunPlay.objects.create(
            game=game, sequence_number=1, quarter=1,
            ball_carrier=rb, yards_gained=5
        )
        RunPlay.objects.create(
            game=game, sequence_number=2, quarter=1,
            ball_carrier=rb, yards_gained=15, is_first_down=True
        )
        RunPlay.objects.create(
            game=game, sequence_number=3, quarter=1,
            ball_carrier=rb, yards_gained=-2
        )
        RunPlay.objects.create(
            game=game, sequence_number=4, quarter=2,
            ball_carrier=rb, yards_gained=8, is_touchdown=True, is_first_down=True
        )

        service = OffenseReportService()
        totals = service.get_rushing_totals()

        assert totals["attempts"] == 4
        assert totals["yards"] == 26  # 5 + 15 - 2 + 8
        assert totals["touchdowns"] == 1
        assert totals["first_downs"] == 2
        assert totals["longest"] == 15
        assert totals["avg_yards"] == pytest.approx(6.5, rel=0.01)

    def test_rushing_totals_with_fumbles(self):
        """Correctly counts fumbles and fumbles lost."""
        game = GameFactory()
        rb = PlayerFactory(position="RB")

        RunPlay.objects.create(
            game=game, sequence_number=1, quarter=1,
            ball_carrier=rb, yards_gained=5, fumbled=True, fumble_lost=False
        )
        RunPlay.objects.create(
            game=game, sequence_number=2, quarter=1,
            ball_carrier=rb, yards_gained=3, fumbled=True, fumble_lost=True
        )

        service = OffenseReportService()
        totals = service.get_rushing_totals()

        assert totals["fumbles"] == 2
        assert totals["fumbles_lost"] == 1

    def test_rushing_by_player(self):
        """Correctly groups rushing stats by player."""
        game = GameFactory()
        rb1 = PlayerFactory(position="RB", first_name="Marcus", last_name="Runner")
        rb2 = PlayerFactory(position="RB", first_name="David", last_name="Swift")

        # RB1 - 3 carries, 25 yards, 1 TD
        RunPlay.objects.create(game=game, sequence_number=1, quarter=1, ball_carrier=rb1, yards_gained=10)
        RunPlay.objects.create(game=game, sequence_number=2, quarter=1, ball_carrier=rb1, yards_gained=7)
        RunPlay.objects.create(game=game, sequence_number=3, quarter=1, ball_carrier=rb1, yards_gained=8, is_touchdown=True)

        # RB2 - 2 carries, 12 yards
        RunPlay.objects.create(game=game, sequence_number=4, quarter=2, ball_carrier=rb2, yards_gained=5)
        RunPlay.objects.create(game=game, sequence_number=5, quarter=2, ball_carrier=rb2, yards_gained=7)

        service = OffenseReportService()
        by_player = service.get_rushing_by_player()

        # Should be sorted by yards descending
        assert len(by_player) == 2
        assert by_player[0]["ball_carrier__last_name"] == "Runner"
        assert by_player[0]["attempts"] == 3
        assert by_player[0]["yards"] == 25
        assert by_player[0]["touchdowns"] == 1
        assert by_player[1]["ball_carrier__last_name"] == "Swift"
        assert by_player[1]["yards"] == 12

    def test_rushing_filtered_by_game(self):
        """Filters correctly by game_ids."""
        game1 = GameFactory()
        game2 = GameFactory()
        rb = PlayerFactory(position="RB")

        RunPlay.objects.create(game=game1, sequence_number=1, quarter=1, ball_carrier=rb, yards_gained=10)
        RunPlay.objects.create(game=game2, sequence_number=1, quarter=1, ball_carrier=rb, yards_gained=20)

        service = OffenseReportService(game_ids=[game1.id])
        totals = service.get_rushing_totals()

        assert totals["yards"] == 10

    def test_rushing_filtered_by_season(self):
        """Filters correctly by season_id."""
        team = TeamFactory()
        season1 = SeasonFactory(team=team, year=2023)
        season2 = SeasonFactory(team=team, year=2024)
        game1 = GameFactory(season=season1)
        game2 = GameFactory(season=season2)
        rb = PlayerFactory(position="RB")

        RunPlay.objects.create(game=game1, sequence_number=1, quarter=1, ball_carrier=rb, yards_gained=10)
        RunPlay.objects.create(game=game2, sequence_number=1, quarter=1, ball_carrier=rb, yards_gained=20)

        service = OffenseReportService(season_id=season2.id)
        totals = service.get_rushing_totals()

        assert totals["yards"] == 20


@pytest.mark.django_db
class TestOffenseReportServicePassing:
    """Tests for OffenseReportService passing statistics."""

    def test_passing_totals_empty(self):
        """Empty database returns zeros."""
        service = OffenseReportService()
        totals = service.get_passing_totals()

        assert totals["attempts"] == 0
        assert totals["completions"] == 0
        assert totals["yards"] == 0
        assert totals["touchdowns"] == 0
        assert totals["interceptions"] == 0
        assert totals["sacks"] == 0

    def test_passing_totals_aggregation(self):
        """Correctly aggregates passing statistics."""
        game = GameFactory()
        qb = PlayerFactory(position="QB")
        wr = PlayerFactory(position="WR")

        # Complete pass
        PassPlay.objects.create(
            game=game, sequence_number=1, quarter=1,
            quarterback=qb, target=wr, receiver=wr,
            is_complete=True, yards_gained=15, air_yards=10, yards_after_catch=5
        )
        # Incomplete
        PassPlay.objects.create(
            game=game, sequence_number=2, quarter=1,
            quarterback=qb, target=wr, is_complete=False, yards_gained=0
        )
        # TD pass
        PassPlay.objects.create(
            game=game, sequence_number=3, quarter=2,
            quarterback=qb, target=wr, receiver=wr,
            is_complete=True, yards_gained=25, is_touchdown=True,
            air_yards=20, yards_after_catch=5
        )
        # Interception
        PassPlay.objects.create(
            game=game, sequence_number=4, quarter=3,
            quarterback=qb, target=wr, is_complete=False, is_interception=True
        )
        # Sack
        PassPlay.objects.create(
            game=game, sequence_number=5, quarter=4,
            quarterback=qb, was_sacked=True, sack_yards=-8
        )

        service = OffenseReportService()
        totals = service.get_passing_totals()

        assert totals["attempts"] == 5
        assert totals["completions"] == 2
        assert totals["yards"] == 40  # 15 + 25
        assert totals["touchdowns"] == 1
        assert totals["interceptions"] == 1
        assert totals["sacks"] == 1
        assert totals["air_yards"] == 30  # 10 + 20
        assert totals["yac"] == 10  # 5 + 5
        assert totals["longest"] == 25

    def test_passing_by_quarterback(self):
        """Correctly groups passing stats by QB with passer rating."""
        game = GameFactory()
        qb1 = PlayerFactory(position="QB", first_name="Joe", last_name="Montana")
        qb2 = PlayerFactory(position="QB", first_name="Steve", last_name="Young")
        wr = PlayerFactory(position="WR")

        # QB1 - 5/8, 80 yards, 1 TD, 0 INT (good game)
        for i in range(5):
            PassPlay.objects.create(
                game=game, sequence_number=i+1, quarter=1,
                quarterback=qb1, target=wr, receiver=wr,
                is_complete=True, yards_gained=16, air_yards=10, yards_after_catch=6
            )
        for i in range(3):
            PassPlay.objects.create(
                game=game, sequence_number=i+6, quarter=2,
                quarterback=qb1, target=wr, is_complete=False
            )

        # QB2 - 2/5, 20 yards, 0 TD, 1 INT (bad game)
        for i in range(2):
            PassPlay.objects.create(
                game=game, sequence_number=i+9, quarter=3,
                quarterback=qb2, target=wr, receiver=wr,
                is_complete=True, yards_gained=10
            )
        PassPlay.objects.create(
            game=game, sequence_number=11, quarter=3,
            quarterback=qb2, target=wr, is_complete=False, is_interception=True
        )
        for i in range(2):
            PassPlay.objects.create(
                game=game, sequence_number=i+12, quarter=4,
                quarterback=qb2, target=wr, is_complete=False
            )

        service = OffenseReportService()
        by_qb = service.get_passing_by_quarterback()

        # Should be sorted by yards descending
        assert len(by_qb) == 2

        qb1_stats = next(q for q in by_qb if q["quarterback__last_name"] == "Montana")
        assert qb1_stats["attempts"] == 8
        assert qb1_stats["completions"] == 5
        assert qb1_stats["completion_pct"] == pytest.approx(62.5, rel=0.01)
        assert qb1_stats["passer_rating"] > 0

        qb2_stats = next(q for q in by_qb if q["quarterback__last_name"] == "Young")
        assert qb2_stats["interceptions"] == 1
        assert qb2_stats["passer_rating"] < qb1_stats["passer_rating"]

    def test_receiving_by_player(self):
        """Correctly groups receiving stats by player."""
        game = GameFactory()
        qb = PlayerFactory(position="QB")
        wr1 = PlayerFactory(position="WR", first_name="Antonio", last_name="Brown")
        wr2 = PlayerFactory(position="WR", first_name="Julio", last_name="Jones")
        te = PlayerFactory(position="TE", first_name="Travis", last_name="Kelce")

        # WR1 - 4 catches, 60 yards, 1 TD
        for i in range(4):
            PassPlay.objects.create(
                game=game, sequence_number=i+1, quarter=1,
                quarterback=qb, target=wr1, receiver=wr1,
                is_complete=True, yards_gained=15 if i < 3 else 15,
                is_touchdown=(i == 3)
            )
        # WR2 - 2 catches, 35 yards
        for i in range(2):
            PassPlay.objects.create(
                game=game, sequence_number=i+5, quarter=2,
                quarterback=qb, target=wr2, receiver=wr2,
                is_complete=True, yards_gained=17 if i == 0 else 18
            )
        # TE - 3 catches, 25 yards
        for i in range(3):
            PassPlay.objects.create(
                game=game, sequence_number=i+7, quarter=3,
                quarterback=qb, target=te, receiver=te,
                is_complete=True, yards_gained=8 if i < 2 else 9
            )

        service = OffenseReportService()
        receiving = service.get_receiving_by_player()

        assert len(receiving) == 3

        # Sorted by yards descending
        wr1_stats = next(r for r in receiving if r["receiver__last_name"] == "Brown")
        assert wr1_stats["receptions"] == 4
        assert wr1_stats["yards"] == 60
        assert wr1_stats["touchdowns"] == 1


@pytest.mark.django_db
class TestDefenseReportService:
    """Tests for DefenseReportService."""

    def test_team_totals_empty(self):
        """Empty database returns zeros."""
        service = DefenseReportService()
        totals = service.get_team_totals()

        assert totals["total_tackles"] == 0
        assert totals["total_sacks"] == 0
        assert totals["total_interceptions"] == 0

    def test_team_totals_aggregation(self):
        """Correctly aggregates defensive statistics."""
        game = GameFactory()
        lb = PlayerFactory(position="LB")
        dl = PlayerFactory(position="DL")
        cb = PlayerFactory(position="CB")

        # Various defensive plays
        DefenseSnap.objects.create(game=game, sequence_number=1, quarter=1, play_result="TACKLE", primary_player=lb)
        DefenseSnap.objects.create(game=game, sequence_number=2, quarter=1, play_result="TACKLE", primary_player=lb)
        DefenseSnap.objects.create(game=game, sequence_number=3, quarter=1, play_result="TFL", primary_player=dl, tackle_for_loss=True)
        DefenseSnap.objects.create(game=game, sequence_number=4, quarter=2, play_result="SACK", primary_player=dl)
        DefenseSnap.objects.create(
            game=game, sequence_number=5, quarter=2, play_result="INT",
            primary_player=cb, interception_return_yards=25
        )
        DefenseSnap.objects.create(game=game, sequence_number=6, quarter=3, play_result="PD", primary_player=cb)
        DefenseSnap.objects.create(
            game=game, sequence_number=7, quarter=3, play_result="FREC",
            primary_player=lb, fumble_return_yards=15
        )
        DefenseSnap.objects.create(
            game=game, sequence_number=8, quarter=4, play_result="INT",
            primary_player=cb, interception_return_yards=45, is_defensive_touchdown=True
        )

        service = DefenseReportService()
        totals = service.get_team_totals()

        assert totals["total_tackles"] == 2
        assert totals["total_tfl"] == 1
        assert totals["total_sacks"] == 1
        assert totals["total_interceptions"] == 2
        assert totals["total_fumble_recoveries"] == 1
        assert totals["total_pass_defended"] == 1
        assert totals["defensive_touchdowns"] == 1
        assert totals["int_return_yards"] == 70  # 25 + 45
        assert totals["fumble_return_yards"] == 15

    def test_player_summary(self):
        """Correctly groups defensive stats by player."""
        game = GameFactory()
        lb = PlayerFactory(position="LB", first_name="Ray", last_name="Lewis")
        cb = PlayerFactory(position="CB", first_name="Deion", last_name="Sanders")

        # LB - tackles and TFL
        DefenseSnap.objects.create(game=game, sequence_number=1, quarter=1, play_result="TACKLE", primary_player=lb)
        DefenseSnap.objects.create(game=game, sequence_number=2, quarter=1, play_result="TACKLE", primary_player=lb)
        DefenseSnap.objects.create(game=game, sequence_number=3, quarter=2, play_result="TFL", primary_player=lb)

        # CB - INT and PD
        DefenseSnap.objects.create(game=game, sequence_number=4, quarter=3, play_result="INT", primary_player=cb)
        DefenseSnap.objects.create(game=game, sequence_number=5, quarter=4, play_result="PD", primary_player=cb)
        DefenseSnap.objects.create(game=game, sequence_number=6, quarter=4, play_result="PD", primary_player=cb)

        service = DefenseReportService()
        by_player = service.get_player_summary()

        lb_stats = next(p for p in by_player if p["primary_player__last_name"] == "Lewis")
        assert lb_stats["tackles"] == 2
        assert lb_stats["tfl"] == 1

        cb_stats = next(p for p in by_player if p["primary_player__last_name"] == "Sanders")
        assert cb_stats["interceptions"] == 1
        assert cb_stats["pass_defended"] == 2


@pytest.mark.django_db
class TestSpecialTeamsReportService:
    """Tests for SpecialTeamsReportService."""

    def test_punt_totals(self):
        """Correctly aggregates punt statistics."""
        game = GameFactory()
        p = PlayerFactory(position="P")

        PuntSnap.objects.create(game=game, sequence_number=1, quarter=1, punter=p, punt_yards=45)
        PuntSnap.objects.create(game=game, sequence_number=2, quarter=2, punter=p, punt_yards=52, is_touchback=True)
        PuntSnap.objects.create(game=game, sequence_number=3, quarter=3, punter=p, punt_yards=38)
        PuntSnap.objects.create(game=game, sequence_number=4, quarter=4, punter=p, punt_yards=0, is_blocked=True)

        service = SpecialTeamsReportService()
        totals = service.get_punt_totals()

        assert totals["punts"] == 4
        assert totals["total_yards"] == 135  # 45 + 52 + 38 + 0
        assert totals["avg_yards"] == pytest.approx(33.75, rel=0.01)
        assert totals["longest"] == 52
        assert totals["touchbacks"] == 1
        assert totals["blocked"] == 1

    def test_kickoff_totals(self):
        """Correctly aggregates kickoff statistics."""
        game = GameFactory()
        k = PlayerFactory(position="K")

        KickoffSnap.objects.create(game=game, sequence_number=1, quarter=1, kicker=k, kick_yards=65)
        KickoffSnap.objects.create(game=game, sequence_number=2, quarter=3, kicker=k, kick_yards=70, is_touchback=True)
        KickoffSnap.objects.create(
            game=game, sequence_number=3, quarter=4, kicker=k,
            kick_yards=15, is_onside_kick=True, onside_recovered=True
        )

        service = SpecialTeamsReportService()
        totals = service.get_kickoff_totals()

        assert totals["kickoffs"] == 3
        assert totals["touchbacks"] == 1
        assert totals["onside_attempts"] == 1
        assert totals["onside_recovered"] == 1

    def test_field_goal_totals(self):
        """Correctly aggregates field goal statistics with percentage."""
        game = GameFactory()
        k = PlayerFactory(position="K")

        FieldGoalSnap.objects.create(game=game, sequence_number=1, quarter=1, kicker=k, kick_distance=35, result="GOOD")
        FieldGoalSnap.objects.create(game=game, sequence_number=2, quarter=2, kicker=k, kick_distance=42, result="GOOD")
        FieldGoalSnap.objects.create(game=game, sequence_number=3, quarter=3, kicker=k, kick_distance=48, result="MISS")
        FieldGoalSnap.objects.create(game=game, sequence_number=4, quarter=4, kicker=k, kick_distance=52, result="BLOCK")

        service = SpecialTeamsReportService()
        totals = service.get_field_goal_totals()

        assert totals["attempts"] == 4
        assert totals["made"] == 2
        assert totals["missed"] == 1
        assert totals["blocked"] == 1
        assert totals["longest"] == 42
        assert totals["percentage"] == 50.0

    def test_field_goal_by_kicker(self):
        """Correctly groups FG stats by kicker."""
        game = GameFactory()
        k1 = PlayerFactory(position="K", first_name="Adam", last_name="Vinatieri")
        k2 = PlayerFactory(position="K", first_name="Justin", last_name="Tucker")

        # K1 - 2/3
        FieldGoalSnap.objects.create(game=game, sequence_number=1, quarter=1, kicker=k1, kick_distance=35, result="GOOD")
        FieldGoalSnap.objects.create(game=game, sequence_number=2, quarter=2, kicker=k1, kick_distance=45, result="GOOD")
        FieldGoalSnap.objects.create(game=game, sequence_number=3, quarter=3, kicker=k1, kick_distance=52, result="MISS")

        # K2 - 3/3
        FieldGoalSnap.objects.create(game=game, sequence_number=4, quarter=4, kicker=k2, kick_distance=40, result="GOOD")
        FieldGoalSnap.objects.create(game=game, sequence_number=5, quarter=4, kicker=k2, kick_distance=55, result="GOOD")
        FieldGoalSnap.objects.create(game=game, sequence_number=6, quarter=4, kicker=k2, kick_distance=48, result="GOOD")

        service = SpecialTeamsReportService()
        by_kicker = service.get_field_goal_by_kicker()

        k2_stats = next(k for k in by_kicker if k["kicker__last_name"] == "Tucker")
        assert k2_stats["made"] == 3
        assert k2_stats["attempts"] == 3
        assert k2_stats["percentage"] == 100.0
        assert k2_stats["longest"] == 55

        k1_stats = next(k for k in by_kicker if k["kicker__last_name"] == "Vinatieri")
        assert k1_stats["made"] == 2
        assert k1_stats["percentage"] == pytest.approx(66.67, rel=0.01)

    def test_extra_point_totals(self):
        """Correctly aggregates extra point statistics."""
        game = GameFactory()
        k = PlayerFactory(position="K")
        qb = PlayerFactory(position="QB")
        rb = PlayerFactory(position="RB")
        wr = PlayerFactory(position="WR")

        # PAT kicks: 3 made, 1 missed
        ExtraPointSnap.objects.create(game=game, sequence_number=1, quarter=1, attempt_type="KICK", result="GOOD", kicker=k)
        ExtraPointSnap.objects.create(game=game, sequence_number=2, quarter=2, attempt_type="KICK", result="GOOD", kicker=k)
        ExtraPointSnap.objects.create(game=game, sequence_number=3, quarter=3, attempt_type="KICK", result="GOOD", kicker=k)
        ExtraPointSnap.objects.create(game=game, sequence_number=4, quarter=4, attempt_type="KICK", result="BLOCK", kicker=k)

        # 2-pt conversions: 1 pass good, 1 run fail
        ExtraPointSnap.objects.create(
            game=game, sequence_number=5, quarter=4,
            attempt_type="2PT_PASS", result="GOOD", passer=qb, receiver=wr
        )
        ExtraPointSnap.objects.create(
            game=game, sequence_number=6, quarter=4,
            attempt_type="2PT_RUN", result="FAIL", ball_carrier=rb
        )

        service = SpecialTeamsReportService()
        totals = service.get_extra_point_totals()

        assert totals["pat_attempts"] == 4
        assert totals["pat_made"] == 3
        assert totals["two_pt_attempts"] == 2
        assert totals["two_pt_made"] == 1
