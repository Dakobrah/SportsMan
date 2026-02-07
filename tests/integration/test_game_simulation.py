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
from apps.teams.models import Team, Season, Player
from apps.games.models import Game, QuarterScore
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
        """Set up team, players, season, and game."""
        # Create team
        team = Team.objects.create(name="Test Eagles", abbreviation="TST")

        # Create season
        season = Season.objects.create(year=2024, team=team)

        # Create roster
        players = {}

        # Offense
        players['qb'] = Player.objects.create(
            team=team, first_name="Joe", last_name="Quarterback",
            position="QB", number=12
        )
        players['rb1'] = Player.objects.create(
            team=team, first_name="Marcus", last_name="Runner",
            position="RB", number=22
        )
        players['rb2'] = Player.objects.create(
            team=team, first_name="David", last_name="Swift",
            position="RB", number=28
        )
        players['wr1'] = Player.objects.create(
            team=team, first_name="Antonio", last_name="Speed",
            position="WR", number=81
        )
        players['wr2'] = Player.objects.create(
            team=team, first_name="Mike", last_name="Hands",
            position="WR", number=84
        )
        players['te'] = Player.objects.create(
            team=team, first_name="Travis", last_name="Kelso",
            position="TE", number=87
        )

        # Defense
        players['lb1'] = Player.objects.create(
            team=team, first_name="Ray", last_name="Tackle",
            position="LB", number=52
        )
        players['lb2'] = Player.objects.create(
            team=team, first_name="Patrick", last_name="Willis",
            position="LB", number=55
        )
        players['cb'] = Player.objects.create(
            team=team, first_name="Deion", last_name="Lockdown",
            position="CB", number=21
        )
        players['s'] = Player.objects.create(
            team=team, first_name="Ed", last_name="Reed",
            position="S", number=20
        )

        # Special teams
        players['k'] = Player.objects.create(
            team=team, first_name="Justin", last_name="Kicker",
            position="K", number=3
        )
        players['p'] = Player.objects.create(
            team=team, first_name="Pat", last_name="Punter",
            position="P", number=7
        )
        players['kr'] = Player.objects.create(
            team=team, first_name="Devin", last_name="Hester",
            position="WR", number=23
        )

        # Create game
        game = Game.objects.create(
            season=season,
            date="2024-09-15",
            opponent="Rival Tigers",
            location="home",
            weather="clear",
            field_condition="grass",
            team_score=0,
            opponent_score=0
        )

        return {
            'team': team,
            'season': season,
            'game': game,
            'players': players,
        }

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

        # Update score: 7-0

        # --- Opponent scores (simulated via kickoff return for simplicity) ---
        # In real tracking, this would be opponent's offensive plays
        # For test purposes, we just note opponent scored

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
        # Short drive after INT, settle for FG

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
            kick_distance=50,  # 33 yard line + 17 yards
            result="GOOD"
        )

        # Q2 Score: 10-7
        QuarterScore.objects.create(
            game=game,
            quarter=2,
            team_score=3,  # Points scored this quarter
            opponent_score=0
        )

        # ========== THIRD QUARTER ==========

        # --- Passing TD Drive ---
        # After halftime, receive kickoff

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

        # Opponent scores (simulated) making it 17-14

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

        # Verify game result
        assert game.is_win is True
        assert game.result == "W"

        # Verify play count
        total_plays = play_num
        assert game.snaps.count() == total_plays

        # ========== TEST OFFENSIVE REPORTS ==========

        offense_service = OffenseReportService(game_ids=[game.id])

        # Rushing stats
        rushing = offense_service.get_rushing_totals()
        assert rushing["attempts"] == 13  # Count all run plays
        assert rushing["yards"] > 0
        assert rushing["touchdowns"] == 1

        # Passing stats
        passing = offense_service.get_passing_totals()
        assert passing["attempts"] == 10  # Count all pass plays
        assert passing["completions"] == 7  # Complete passes
        assert passing["touchdowns"] == 1
        assert passing["sacks"] == 1

        # Per-player rushing
        rushing_by_player = offense_service.get_rushing_by_player()
        rb1_stats = next(
            (p for p in rushing_by_player if p["ball_carrier__last_name"] == "Runner"),
            None
        )
        assert rb1_stats is not None
        assert rb1_stats["touchdowns"] == 1

        # Per-QB passing
        passing_by_qb = offense_service.get_passing_by_quarterback()
        assert len(passing_by_qb) == 1
        qb_stats = passing_by_qb[0]
        assert qb_stats["quarterback__last_name"] == "Quarterback"
        assert qb_stats["touchdowns"] == 1
        assert qb_stats["completion_pct"] > 60  # Should be decent
        assert qb_stats["passer_rating"] > 0  # Has a rating

        # Receiving stats
        receiving = offense_service.get_receiving_by_player()
        wr1_stats = next(
            (r for r in receiving if r["receiver__last_name"] == "Speed"),
            None
        )
        assert wr1_stats is not None
        assert wr1_stats["receptions"] >= 3

        # ========== TEST DEFENSIVE REPORTS ==========

        defense_service = DefenseReportService(game_ids=[game.id])

        defense_totals = defense_service.get_team_totals()
        assert defense_totals["total_interceptions"] == 1
        assert defense_totals["total_tfl"] == 1
        assert defense_totals["int_return_yards"] == 15

        # ========== TEST SPECIAL TEAMS REPORTS ==========

        st_service = SpecialTeamsReportService(game_ids=[game.id])

        # Punt stats
        punt_totals = st_service.get_punt_totals()
        assert punt_totals["punts"] == 1
        assert punt_totals["total_yards"] == 45

        # Field goal stats
        fg_totals = st_service.get_field_goal_totals()
        assert fg_totals["attempts"] == 1
        assert fg_totals["made"] == 1
        assert fg_totals["percentage"] == 100.0

        # Extra point stats
        xp_totals = st_service.get_extra_point_totals()
        assert xp_totals["pat_attempts"] == 2
        assert xp_totals["pat_made"] == 2

        # ========== VERIFY QUARTER SCORES ==========

        quarters = game.quarter_scores.all()
        assert quarters.count() == 4

        # Total up quarter scores
        team_total = sum(q.team_score for q in quarters)
        opp_total = sum(q.opponent_score for q in quarters)
        assert team_total == 17
        assert opp_total == 14

        print(f"\n{'='*50}")
        print(f"GAME SIMULATION COMPLETE")
        print(f"{'='*50}")
        print(f"Final Score: {game.season.team.abbreviation} {game.team_score} - {game.opponent} {game.opponent_score}")
        print(f"Result: {'WIN' if game.is_win else 'LOSS'}")
        print(f"Total Plays: {total_plays}")
        print(f"\nOffense:")
        print(f"  Rushing: {rushing['attempts']} att, {rushing['yards']} yds, {rushing['touchdowns']} TD")
        print(f"  Passing: {passing['completions']}/{passing['attempts']}, {passing['yards']} yds, {passing['touchdowns']} TD, {passing['interceptions']} INT")
        print(f"\nDefense:")
        print(f"  Interceptions: {defense_totals['total_interceptions']}")
        print(f"  TFLs: {defense_totals['total_tfl']}")
        print(f"\nSpecial Teams:")
        print(f"  FG: {fg_totals['made']}/{fg_totals['attempts']}")
        print(f"  PAT: {xp_totals['pat_made']}/{xp_totals['pat_attempts']}")
        print(f"{'='*50}")


@pytest.mark.django_db
class TestDriveScenarios:
    """Test specific drive scenarios."""

    @pytest.fixture
    def basic_setup(self, db):
        """Basic game setup for drive tests."""
        team = Team.objects.create(name="Test Team", abbreviation="TST")
        season = Season.objects.create(year=2024, team=team)
        game = Game.objects.create(
            season=season,
            date="2024-09-15",
            opponent="Opponent",
            location="home",
            weather="clear",
            field_condition="grass"
        )
        qb = Player.objects.create(team=team, first_name="QB", last_name="Test", position="QB", number=1)
        rb = Player.objects.create(team=team, first_name="RB", last_name="Test", position="RB", number=2)
        wr = Player.objects.create(team=team, first_name="WR", last_name="Test", position="WR", number=3)
        k = Player.objects.create(team=team, first_name="K", last_name="Test", position="K", number=4)

        return {'game': game, 'qb': qb, 'rb': rb, 'wr': wr, 'k': k}

    def test_td_drive_with_2pt_conversion(self, basic_setup):
        """Test a TD drive followed by 2-point conversion."""
        game = basic_setup['game']
        qb = basic_setup['qb']
        rb = basic_setup['rb']
        wr = basic_setup['wr']

        # TD run
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

        # 2-point conversion pass
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
