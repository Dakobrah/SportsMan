"""
Management command: seed_dev_data

Creates a realistic development dataset for the Riverside Rams so that
every part of the application (reports, tracker, dashboard) has data
to display immediately after a fresh migration.

Usage:
    python manage.py seed_dev_data
    python manage.py seed_dev_data --reset   # wipe and re-seed
"""
from datetime import date

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.games.models import Game, QuarterScore
from apps.teams.models import Player, Season, Team

User = get_user_model()


# ---------------------------------------------------------------------------
# Roster definition: (first, last, position, jersey_number)
# ---------------------------------------------------------------------------
ROSTER = [
    # Offense
    ("Marcus",   "Thompson", "QB",  1),
    ("D'Andre",  "Williams", "RB", 22),
    ("Jared",    "Kim",      "RB", 34),
    ("Tyrell",   "Johnson",  "WR", 80),
    ("Carlos",   "Reyes",    "WR", 81),
    ("Devon",    "Cross",    "WR", 84),
    ("Brandon",  "Price",    "TE", 88),
    ("Mike",     "Andrews",  "OL", 70),
    ("Shane",    "Cooper",   "OL", 73),
    ("DeShawn",  "Rogers",   "OL", 75),
    ("Tyler",    "Martin",   "OL", 77),
    ("Marcus",   "Bell",     "OL", 64),
    # Defense
    ("Deon",     "Harris",   "LB", 52),
    ("Kevin",    "Okafor",   "LB", 54),
    ("Rashad",   "Ellis",    "DL", 99),
    ("Jordan",   "Webb",     "DL", 92),
    ("Isaiah",   "Parker",   "CB", 23),
    ("Trey",     "Mitchell", "CB", 24),
    ("Marcus",   "Evans",    "S",  41),
    ("Devon",    "Wright",   "S",  45),
    # Special teams
    ("Kyle",     "Patterson","K",   4),
    ("Zach",     "Munroe",   "P",   5),
    ("Travis",   "Sims",     "LS", 48),
]

# ---------------------------------------------------------------------------
# Game data: (opponent, date, location, weather, field_condition, team_score,
#             opp_score, quarter_scores_list)
# Each quarter entry: (our_score, opp_score) for that quarter.
# ---------------------------------------------------------------------------
GAMES_2024 = [
    ("Central Lions",      date(2024, 8, 30), "home",    "clear", "turf",  24, 17,
     [(7, 3), (10, 7), (7, 7), (0, 0)]),
    ("Westfield Eagles",   date(2024, 9, 6),  "away",    "windy", "grass", 10, 28,
     [(0, 7), (3, 14), (7, 7), (0, 0)]),
    ("Northbrook Knights", date(2024, 9, 13), "home",    "clear", "turf",  35, 21,
     [(7, 7), (14, 7), (7, 7), (7, 0)]),
    ("Ridgeline Panthers", date(2024, 9, 20), "away",    "clear", "grass", 14,  7,
     [(7, 0), (0, 7), (7, 0), (0, 0)]),
    ("Summit Bulldogs",    date(2024, 9, 27), "home",    "rainy", "wet",   21, 28,
     [(7, 14), (7, 7), (7, 7), (0, 0)]),
    ("Riverside Wolves",   date(2024, 10, 4), "neutral", "clear", "turf",  31, 20,
     [(7, 7), (10, 6), (7, 7), (7, 0)]),
]

GAMES_2025_COMPLETED = [
    ("Central Lions",  date(2025, 8, 29), "home", "hot",   "turf",  17, 10,
     [(7, 0), (3, 3), (7, 7), (0, 0)]),
    ("Eastport Titans", date(2025, 9, 5), "away", "clear", "grass", 24,  7,
     [(7, 0), (10, 7), (7, 0), (0, 0)]),
]

# The live/upcoming game (score 0-0, no plays).
LIVE_GAME = ("Westfield Eagles", date(2025, 9, 12), "home", "clear", "turf")


class Command(BaseCommand):
    help = "Seed development database with sample data for Riverside Rams."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete existing seed data (team RAMS and seed users) before re-creating.",
        )

    def handle(self, *args, **options):
        if options["reset"]:
            self._reset()

        with transaction.atomic():
            team = self._get_or_create_team()
            self._get_or_create_players(team)
            season_2024 = self._get_or_create_season(team, 2024)
            season_2025 = self._get_or_create_season(team, 2025)
            self._get_or_create_games(season_2024, GAMES_2024)
            self._get_or_create_games(season_2025, GAMES_2025_COMPLETED)
            live_game = self._get_or_create_live_game(season_2025)
            self._get_or_create_users(team)

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Development data ready."))
        self.stdout.write(f"  Team    : Riverside Rams (RAMS)")
        self.stdout.write(f"  Players : {len(ROSTER)}")
        self.stdout.write(f"  Seasons : 2024, 2025")
        self.stdout.write(
            f"  Games   : {len(GAMES_2024)} in 2024, "
            f"{len(GAMES_2025_COMPLETED)} completed + 1 live in 2025"
        )
        self.stdout.write(f"  Users   : admin / admin1234  |  coach / coach1234")
        self.stdout.write(f"  Live game pk: {live_game.pk}")
        self.stdout.write("")
        self.stdout.write(
            "  Run `python manage.py simulate_quarter` to populate the live game."
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _reset(self):
        deleted, _ = Team.objects.filter(abbreviation="RAMS").delete()
        User.objects.filter(username__in=["admin", "coach"]).delete()
        self.stdout.write(f"  Cleared seed data ({deleted} team rows deleted).")

    def _get_or_create_team(self):
        team, created = Team.objects.get_or_create(
            abbreviation="RAMS",
            defaults={"name": "Riverside Rams"},
        )
        self.stdout.write(f"  {'Created' if created else 'Found  '} team: {team}")
        return team

    def _get_or_create_season(self, team, year):
        season, created = Season.objects.get_or_create(year=year, team=team)
        self.stdout.write(f"  {'Created' if created else 'Found  '} season: {season}")
        return season

    def _get_or_create_players(self, team):
        created_count = 0
        for first, last, pos, number in ROSTER:
            _, created = Player.objects.get_or_create(
                team=team,
                number=number,
                defaults={
                    "first_name": first,
                    "last_name": last,
                    "position": pos,
                    "is_active": True,
                },
            )
            if created:
                created_count += 1
        self.stdout.write(
            f"  Players : {created_count} created, "
            f"{len(ROSTER) - created_count} already existed"
        )

    def _get_or_create_games(self, season, games_data):
        created_count = 0
        for opponent, d, location, weather, field, ts, os, quarters in games_data:
            game, created = Game.objects.get_or_create(
                season=season,
                opponent=opponent,
                defaults={
                    "date": d,
                    "location": location,
                    "weather": weather,
                    "field_condition": field,
                    "team_score": ts,
                    "opponent_score": os,
                },
            )
            if created:
                for i, (qs_team, qs_opp) in enumerate(quarters, start=1):
                    QuarterScore.objects.get_or_create(
                        game=game,
                        quarter=i,
                        defaults={"team_score": qs_team, "opponent_score": qs_opp},
                    )
                created_count += 1
        self.stdout.write(
            f"  Games   : {created_count} created in {season.year} "
            f"({len(games_data) - created_count} already existed)"
        )

    def _get_or_create_live_game(self, season):
        opponent, d, location, weather, field = LIVE_GAME
        game, created = Game.objects.get_or_create(
            season=season,
            opponent=opponent,
            defaults={
                "date": d,
                "location": location,
                "weather": weather,
                "field_condition": field,
                "team_score": 0,
                "opponent_score": 0,
            },
        )
        self.stdout.write(
            f"  {'Created' if created else 'Found  '} live game: {game} (pk={game.pk})"
        )
        return game

    def _get_or_create_users(self, team):
        if not User.objects.filter(username="admin").exists():
            User.objects.create_superuser(
                username="admin",
                email="admin@riverside.edu",
                password="admin1234",
                first_name="Head",
                last_name="Coach",
                team=team,
            )
            self.stdout.write("  Created user: admin / admin1234 (superuser)")
        else:
            self.stdout.write("  Found   user: admin (already exists)")

        if not User.objects.filter(username="coach").exists():
            User.objects.create_user(
                username="coach",
                email="coach@riverside.edu",
                password="coach1234",
                first_name="Assistant",
                last_name="Coach",
                team=team,
            )
            self.stdout.write("  Created user: coach / coach1234")
        else:
            self.stdout.write("  Found   user: coach (already exists)")
