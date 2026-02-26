"""
Game simulation test - simulates a minimal football game being played.

This test walks through a realistic game scenario including:
- Kickoff
- Offensive drives (runs and passes)
- Defensive plays
- Punts
- Field goals
- Touchdowns and extra points
- Quarter scoring
- Final statistics via reports
"""
import pytest
from datetime import timedelta
from apps.games.models import QuarterScore
from apps.snaps.models import (
    RunPlay,
    PassPlay,
    DefenseSnap,
    KickoffSnap,
    KickoffReturnSnap,
    PuntSnap,
    FieldGoalSnap,
    ExtraPointSnap,
)
from apps.reports.services import OffenseReportService, DefenseReportService, SpecialTeamsReportService
from tests.factories import TeamFactory, SeasonFactory, PlayerFactory, GameFactory


@pytest.mark.django_db
class TestGameSimulation:
    """
    Simulates a minimal football game to test the full system.

    Game scenario:
    - Q1: Kickoff, TD drive (run plays), PAT good -> 7-0
    - Q1: Kickoff, opponent scores (simulated) -> 7-7
    - Q2: Offensive drive stalls, punt
    - Q2: Defense gets interception
    - Q2: Field goal attempt good -> 10-7
    - Halftime
    - Q3: Passing TD drive -> 17-7
    - Q4: Opponent scores (simulated) -> 17-14
    - Q4: Run out clock with rushing plays
    - Final: 17-14 WIN
    """

    @pytest.fixture
    def game_setup(self, db):
        """Set up team, players, season, and game via factories."""
        season = SeasonFactory(year=2024)
        team = season.team
        game = GameFactory(
            season=season,
            opponent="Rival Tigers",
            location="home",
            weather="clear",
            field_condition="grass",
            team_score=0,
            opponent_score=0,
        )

        players = {
            'qb':  PlayerFactory(team=team, position="QB", last_name="Quarterback"),
            'rb1': PlayerFactory(team=team, position="RB", last_name="Runner"),
            'rb2': PlayerFactory(team=team, position="RB"),
            'wr1': PlayerFactory(team=team, position="WR", last_name="Speed"),
            'wr2': PlayerFactory(team=team, position="WR"),
            'te':  PlayerFactory(team=team, position="TE"),
            'lb1': PlayerFactory(team=team, position="LB"),
            'lb2': PlayerFactory(team=team, position="LB"),
            'cb':  PlayerFactory(team=team, position="CB"),
            's':   PlayerFactory(team=team, position="S"),
            'k':   PlayerFactory(team=team, position="K"),
            'p':   PlayerFactory(team=team, position="P"),
            'kr':  PlayerFactory(team=team, position="WR"),
        }

        return {'team': team, 'season': season, 'game': game, 'players': players}

    def test_full_game_simulation(self, game_setup):
        """
        Simulate a complete football game with realistic play sequences.
        """
        game = game_setup['game']
        p = game_setup['players']

        play_num = 0

        # ========== FIRST QUARTER ==========

        # --- Opening Kickoff ---
        play_num += 1
        KickoffSnap.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=1,
            kicker=p['k'],
            kick_yards=65,
            is_touchback=False
        )

        play_num += 1
        KickoffReturnSnap.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=1,
            returner=p['kr'],
            return_yards=25,
            is_touchdown=False
        )

        # --- First Drive: TD Drive (starting at own 25) ---
        # 1st & 10 - Run for 5 yards
        play_num += 1
        RunPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=1,
            down=1,
            distance=10,
            ball_position=-25,
            formation="I-Formation",
            ball_carrier=p['rb1'],
            yards_gained=5,
            is_first_down=False
        )

        # 2nd & 5 - Pass complete for 12 yards, first down
        play_num += 1
        PassPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=1,
            down=2,
            distance=5,
            ball_position=-30,
            formation="Shotgun",
            quarterback=p['qb'],
            target=p['wr1'],
            receiver=p['wr1'],
            is_complete=True,
            yards_gained=12,
            air_yards=8,
            yards_after_catch=4,
            is_first_down=True
        )

        # 1st & 10 - Run for 8 yards
        play_num += 1
        RunPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=1,
            down=1,
            distance=10,
            ball_position=-42,
            ball_carrier=p['rb1'],
            yards_gained=8,
            is_first_down=False
        )

        # 2nd & 2 - Run for 4 yards, first down
        play_num += 1
        RunPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=1,
            down=2,
            distance=2,
            ball_position=50,
            ball_carrier=p['rb2'],
            yards_gained=4,
            is_first_down=True
        )

        # 1st & 10 - Pass to TE for 15 yards
        play_num += 1
        PassPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=1,
            down=1,
            distance=10,
            ball_position=46,
            formation="Spread",
            quarterback=p['qb'],
            target=p['te'],
            receiver=p['te'],
            is_complete=True,
            yards_gained=15,
            air_yards=10,
            yards_after_catch=5,
            is_first_down=True
        )

        # 1st & 10 - Big run for 22 yards
        play_num += 1
        RunPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=1,
            down=1,
            distance=10,
            ball_position=31,
            ball_carrier=p['rb1'],
            yards_gained=22,
            is_first_down=True
        )

        # 1st & Goal from 9 - Run for TD!
        play_num += 1
        RunPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=1,
            down=1,
            distance=9,
            ball_position=9,
            ball_carrier=p['rb1'],
            yards_gained=9,
            is_touchdown=True,
            is_first_down=True
        )

        # PAT - Good!
        play_num += 1
        ExtraPointSnap.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=1,
            attempt_type="KICK",
            result="GOOD",
            kicker=p['k']
        )

        # Kickoff after TD
        play_num += 1
        KickoffSnap.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=1,
            kicker=p['k'],
            kick_yards=65,
            is_touchback=True
        )

        # Record Q1 score (after opponent's TD)
        QuarterScore.objects.create(
            game=game,
            quarter=1,
            team_score=7,
            opponent_score=7
        )

        # ========== SECOND QUARTER ==========

        # --- Stalled Drive ending in Punt ---
        # 1st & 10 - Run for 2 yards
        play_num += 1
        RunPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=2,
            down=1,
            distance=10,
            ball_position=-25,
            ball_carrier=p['rb2'],
            yards_gained=2
        )

        # 2nd & 8 - Incomplete pass
        play_num += 1
        PassPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=2,
            down=2,
            distance=8,
            ball_position=-27,
            quarterback=p['qb'],
            target=p['wr1'],
            is_complete=False,
            yards_gained=0,
            was_under_pressure=True
        )

        # 3rd & 8 - Short completion for 3 yards (not enough)
        play_num += 1
        PassPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=2,
            down=3,
            distance=8,
            ball_position=-27,
            quarterback=p['qb'],
            target=p['rb1'],
            receiver=p['rb1'],
            is_complete=True,
            yards_gained=3,
            air_yards=-2,
            yards_after_catch=5
        )

        # 4th & 5 - Punt
        play_num += 1
        PuntSnap.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=2,
            down=4,
            distance=5,
            ball_position=-30,
            punter=p['p'],
            punt_yards=45,
            hang_time=timedelta(seconds=4, milliseconds=200),
            is_touchback=False,
            downed_at_yard_line=25
        )

        # --- Defense gets Interception! ---
        play_num += 1
        DefenseSnap.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=2,
            play_result="INT",
            primary_player=p['cb'],
            interception_return_yards=15,
            is_defensive_touchdown=False
        )

        # --- Field Goal Drive ---
        # 1st & 10 - Run for 6
        play_num += 1
        RunPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=2,
            down=1,
            distance=10,
            ball_position=40,
            ball_carrier=p['rb1'],
            yards_gained=6
        )

        # 2nd & 4 - Sack! Loss of 7
        play_num += 1
        PassPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=2,
            down=2,
            distance=4,
            ball_position=34,
            quarterback=p['qb'],
            was_sacked=True,
            sack_yards=-7,
            yards_gained=0,
            was_under_pressure=True
        )

        # 3rd & 11 - Pass for 8 (not enough)
        play_num += 1
        PassPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=2,
            down=3,
            distance=11,
            ball_position=41,
            quarterback=p['qb'],
            target=p['wr2'],
            receiver=p['wr2'],
            is_complete=True,
            yards_gained=8,
            air_yards=6,
            yards_after_catch=2
        )

        # 4th & 3 - Field Goal Attempt from 33 - GOOD!
        play_num += 1
        FieldGoalSnap.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=2,
            down=4,
            ball_position=33,
            kicker=p['k'],
            kick_distance=50,
            result="GOOD"
        )

        # Q2 Score: 10-7
        QuarterScore.objects.create(
            game=game,
            quarter=2,
            team_score=3,
            opponent_score=0
        )

        # ========== THIRD QUARTER ==========

        play_num += 1
        KickoffReturnSnap.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=3,
            returner=p['kr'],
            return_yards=30,
            is_touchdown=False
        )

        # 1st & 10 - Pass for 15
        play_num += 1
        PassPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=3,
            down=1,
            distance=10,
            ball_position=-30,
            formation="Shotgun",
            quarterback=p['qb'],
            target=p['wr1'],
            receiver=p['wr1'],
            is_complete=True,
            yards_gained=15,
            air_yards=12,
            yards_after_catch=3,
            is_first_down=True
        )

        # 1st & 10 - Pass incomplete (thrown away)
        play_num += 1
        PassPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=3,
            down=1,
            distance=10,
            ball_position=-45,
            quarterback=p['qb'],
            is_complete=False,
            is_thrown_away=True,
            was_under_pressure=True
        )

        # 2nd & 10 - Big pass play! 35 yards
        play_num += 1
        PassPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=3,
            down=2,
            distance=10,
            ball_position=-45,
            formation="Spread",
            quarterback=p['qb'],
            target=p['wr1'],
            receiver=p['wr1'],
            is_complete=True,
            yards_gained=35,
            air_yards=30,
            yards_after_catch=5,
            is_first_down=True
        )

        # 1st & 10 from 20 - Run for 5
        play_num += 1
        RunPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=3,
            down=1,
            distance=10,
            ball_position=20,
            ball_carrier=p['rb2'],
            yards_gained=5
        )

        # 2nd & 5 - TD Pass to TE!
        play_num += 1
        PassPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=3,
            down=2,
            distance=5,
            ball_position=15,
            formation="Goal Line",
            quarterback=p['qb'],
            target=p['te'],
            receiver=p['te'],
            is_complete=True,
            yards_gained=15,
            air_yards=12,
            yards_after_catch=3,
            is_touchdown=True,
            is_first_down=True
        )

        # PAT - Good!
        play_num += 1
        ExtraPointSnap.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=3,
            attempt_type="KICK",
            result="GOOD",
            kicker=p['k']
        )

        # Q3 Score: 17-7
        QuarterScore.objects.create(
            game=game,
            quarter=3,
            team_score=7,
            opponent_score=0
        )

        # ========== FOURTH QUARTER ==========

        # --- Clock-killing drive with runs ---
        # 1st & 10 - Run for 4
        play_num += 1
        RunPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=4,
            down=1,
            distance=10,
            ball_position=-30,
            ball_carrier=p['rb1'],
            yards_gained=4
        )

        # 2nd & 6 - Run for 3
        play_num += 1
        RunPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=4,
            down=2,
            distance=6,
            ball_position=-34,
            ball_carrier=p['rb1'],
            yards_gained=3
        )

        # 3rd & 3 - Run for first down!
        play_num += 1
        RunPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=4,
            down=3,
            distance=3,
            ball_position=-37,
            ball_carrier=p['rb1'],
            yards_gained=5,
            is_first_down=True
        )

        # 1st & 10 - Run for 6
        play_num += 1
        RunPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=4,
            down=1,
            distance=10,
            ball_position=-42,
            ball_carrier=p['rb2'],
            yards_gained=6
        )

        # 2nd & 4 - Run for 5, first down
        play_num += 1
        RunPlay.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=4,
            down=2,
            distance=4,
            ball_position=-48,
            ball_carrier=p['rb1'],
            yards_gained=5,
            is_first_down=True
        )

        # Defense makes a stop - Tackle for loss
        play_num += 1
        DefenseSnap.objects.create(
            game=game,
            sequence_number=play_num,
            quarter=4,
            play_result="TFL",
            primary_player=p['lb1'],
            tackle_yards=-3,
            tackle_for_loss=True,
            applied_pressure=True
        )

        # Q4 Score
        QuarterScore.objects.create(
            game=game,
            quarter=4,
            team_score=0,
            opponent_score=7
        )

        # ========== UPDATE FINAL SCORE ==========
        game.team_score = 17
        game.opponent_score = 14
        game.save()

        # ========== VERIFY GAME STATISTICS ==========

        assert game.is_win is True
        assert game.result == "W"
        assert game.snaps.count() == play_num

        # ========== OFFENSIVE REPORTS ==========

        offense_service = OffenseReportService(game_ids=[game.id])

        rushing = offense_service.get_rushing_totals()
        assert rushing["attempts"] == 13
        assert rushing["yards"] > 0
        assert rushing["touchdowns"] == 1

        passing = offense_service.get_passing_totals()
        assert passing["attempts"] == 10
        assert passing["completions"] == 7
        assert passing["touchdowns"] == 1
        assert passing["sacks"] == 1

        rushing_by_player = offense_service.get_rushing_by_player()
        rb1_stats = next(
            (r for r in rushing_by_player if r["ball_carrier__last_name"] == "Runner"),
            None
        )
        assert rb1_stats is not None
        assert rb1_stats["touchdowns"] == 1

        passing_by_qb = offense_service.get_passing_by_quarterback()
        assert len(passing_by_qb) == 1
        qb_stats = passing_by_qb[0]
        assert qb_stats["quarterback__last_name"] == "Quarterback"
        assert qb_stats["touchdowns"] == 1
        assert qb_stats["completion_pct"] > 60
        assert qb_stats["passer_rating"] > 0

        receiving = offense_service.get_receiving_by_player()
        wr1_stats = next(
            (r for r in receiving if r["receiver__last_name"] == "Speed"),
            None
        )
        assert wr1_stats is not None
        assert wr1_stats["receptions"] >= 3

        # ========== DEFENSIVE REPORTS ==========

        defense_service = DefenseReportService(game_ids=[game.id])
        defense_totals = defense_service.get_team_totals()
        assert defense_totals["total_interceptions"] == 1
        assert defense_totals["total_tfl"] == 1
        assert defense_totals["int_return_yards"] == 15

        # ========== SPECIAL TEAMS REPORTS ==========

        st_service = SpecialTeamsReportService(game_ids=[game.id])

        punt_totals = st_service.get_punt_totals()
        assert punt_totals["punts"] == 1
        assert punt_totals["total_yards"] == 45

        fg_totals = st_service.get_field_goal_totals()
        assert fg_totals["attempts"] == 1
        assert fg_totals["made"] == 1
        assert fg_totals["percentage"] == 100.0

        xp_totals = st_service.get_extra_point_totals()
        assert xp_totals["pat_attempts"] == 2
        assert xp_totals["pat_made"] == 2

        # ========== QUARTER SCORES ==========

        quarters = game.quarter_scores.all()
        assert quarters.count() == 4
        assert sum(q.team_score for q in quarters) == 17
        assert sum(q.opponent_score for q in quarters) == 14


@pytest.mark.django_db
class TestDriveScenarios:
    """Test specific drive scenarios."""

    @pytest.fixture
    def basic_setup(self, db):
        """Basic game setup for drive tests via factories."""
        season = SeasonFactory()
        team = season.team
        game = GameFactory(season=season, location="home", weather="clear", field_condition="grass")
        return {
            'game': game,
            'qb': PlayerFactory(team=team, position="QB"),
            'rb': PlayerFactory(team=team, position="RB"),
            'wr': PlayerFactory(team=team, position="WR"),
            'k':  PlayerFactory(team=team, position="K"),
        }

    def test_td_drive_with_2pt_conversion(self, basic_setup):
        """Test a TD drive followed by 2-point conversion."""
        game = basic_setup['game']
        qb = basic_setup['qb']
        rb = basic_setup['rb']
        wr = basic_setup['wr']

        RunPlay.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            down=1,
            distance=5,
            ball_carrier=rb,
            yards_gained=5,
            is_touchdown=True
        )

        ExtraPointSnap.objects.create(
            game=game,
            sequence_number=2,
            quarter=1,
            attempt_type="2PT_PASS",
            result="GOOD",
            passer=qb,
            receiver=wr
        )

        service = SpecialTeamsReportService(game_ids=[game.id])
        totals = service.get_extra_point_totals()

        assert totals["two_pt_attempts"] == 1
        assert totals["two_pt_made"] == 1

    def test_turnover_fumble_lost(self, basic_setup):
        """Test a play with fumble lost."""
        game = basic_setup['game']
        rb = basic_setup['rb']

        RunPlay.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            down=1,
            distance=10,
            ball_carrier=rb,
            yards_gained=5,
            fumbled=True,
            fumble_lost=True
        )

        service = OffenseReportService(game_ids=[game.id])
        rushing = service.get_rushing_totals()

        assert rushing["fumbles"] == 1
        assert rushing["fumbles_lost"] == 1

    def test_blocked_field_goal(self, basic_setup):
        """Test a blocked field goal."""
        game = basic_setup['game']
        k = basic_setup['k']

        FieldGoalSnap.objects.create(
            game=game,
            sequence_number=1,
            quarter=2,
            kicker=k,
            kick_distance=45,
            result="BLOCK"
        )

        service = SpecialTeamsReportService(game_ids=[game.id])
        fg = service.get_field_goal_totals()

        assert fg["attempts"] == 1
        assert fg["made"] == 0
        assert fg["blocked"] == 1
        assert fg["percentage"] == 0.0

    def test_explosive_passing_play(self, basic_setup):
        """Test a long passing play with YAC."""
        game = basic_setup['game']
        qb = basic_setup['qb']
        wr = basic_setup['wr']

        PassPlay.objects.create(
            game=game,
            sequence_number=1,
            quarter=1,
            down=1,
            distance=10,
            quarterback=qb,
            target=wr,
            receiver=wr,
            is_complete=True,
            yards_gained=75,
            air_yards=40,
            yards_after_catch=35,
            is_touchdown=True,
            is_first_down=True
        )

        service = OffenseReportService(game_ids=[game.id])
        passing = service.get_passing_totals()

        assert passing["yards"] == 75
        assert passing["air_yards"] == 40
        assert passing["yac"] == 35
        assert passing["touchdowns"] == 1
        assert passing["longest"] == 75
