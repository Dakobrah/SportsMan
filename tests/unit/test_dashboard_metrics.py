import datetime

import pytest
from django.urls import reverse
from django.contrib.auth import get_user_model

from apps.teams.models import Team, Season, Player
from apps.games.models import Game, QuarterScore
from apps.snaps.models.offense import RunPlay, PassPlay
from apps.snaps.models.defense import DefenseSnap


@pytest.mark.django_db
def test_dashboard_metrics(client):
    User = get_user_model()

    # Setup team, season, user
    team = Team.objects.create(name="Test Team", abbreviation="TST")
    season = Season.objects.create(year=2026, team=team)
    user = User.objects.create_user(username="coach", password="pass")
    user.team = team
    user.save()

    # Create a game and quarter scores
    game = Game.objects.create(
        season=season,
        date=datetime.date.today(),
        opponent="Opponent",
        location="home",
        weather="clear",
        field_condition="turf",
        team_score=21,
        opponent_score=14,
    )

    QuarterScore.objects.create(game=game, quarter=1, team_score=7, opponent_score=0)
    QuarterScore.objects.create(game=game, quarter=2, team_score=7, opponent_score=7)
    QuarterScore.objects.create(game=game, quarter=3, team_score=7, opponent_score=7)

    # Players
    rb = Player.objects.create(first_name="Joe", last_name="Runner", position="RB", number=1, team=team)
    defender = Player.objects.create(first_name="Dave", last_name="Sack", position="LB", number=55, team=team)

    # Third-down conversions: two attempts, both converted
    RunPlay.objects.create(
        game=game,
        sequence_number=1,
        quarter=1,
        down=3,
        distance=10,
        ball_position=40,
        ball_carrier=rb,
        yards_gained=5,
        is_first_down=True,
    )

    PassPlay.objects.create(
        game=game,
        sequence_number=2,
        quarter=1,
        down=3,
        distance=7,
        ball_position=35,
        quarterback=rb,
        receiver=rb,
        is_complete=True,
        yards_gained=10,
        is_first_down=True,
    )

    # Red zone touchdown (ball_position >= 30)
    RunPlay.objects.create(
        game=game,
        sequence_number=3,
        quarter=2,
        down=1,
        distance=10,
        ball_position=30,
        ball_carrier=rb,
        yards_gained=10,
        is_touchdown=True,
    )

    # Two sacks by same defender to trigger alert
    DefenseSnap.objects.create(game=game, sequence_number=4, quarter=2, play_result=DefenseSnap.PlayResult.SACK, primary_player=defender)
    DefenseSnap.objects.create(game=game, sequence_number=5, quarter=3, play_result=DefenseSnap.PlayResult.SACK, primary_player=defender)

    # Call the view directly using RequestFactory to inspect context without test client template copy
    from django.test import RequestFactory
    from apps.frontend import dashboard as dashboard_view

    rf = RequestFactory()
    request = rf.get('/')
    request.user = user

    resp = dashboard_view.home(request)
    # TemplateResponse: access context_data (may be lazy until render)
    if hasattr(resp, 'render'):
        resp.render()

    assert hasattr(resp, 'context_data') or hasattr(resp, 'context')
    metrics = resp.context_data['metrics'] if hasattr(resp, 'context_data') else resp.context['metrics']

    # Third-down
    assert metrics['third_down_attempts'] == 2
    assert metrics['third_down_conversions'] == 2
    assert metrics['third_down_pct'] == 100

    # Red zone
    assert metrics['red_zone_plays'] >= 1
    assert metrics['red_zone_tds'] >= 1
    assert metrics['red_zone_pct'] is not None

    # Alerts should include sacks entry
    alert_types = {a['type'] for a in metrics['alerts']}
    assert 'sacks' in alert_types
