"""
Management command: create_season

Bootstraps a fresh deployment with a team, a season, and an optional admin
user.  Safe to run in any environment (no DEBUG guard).  Idempotent — running
it twice with the same arguments does nothing.

Usage examples:
    # Minimal — prompts for admin password
    python manage.py create_season --team-name "Riverside Rams" --team-abbr RAMS

    # Fully non-interactive
    python manage.py create_season \
        --team-name "Riverside Rams" --team-abbr RAMS \
        --year 2026 \
        --admin-username admin --admin-password secret123

    # Skip creating an admin user (one already exists)
    python manage.py create_season \
        --team-name "Riverside Rams" --team-abbr RAMS \
        --no-admin
"""
import datetime

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.teams.models import Season, Team

User = get_user_model()

CURRENT_YEAR = datetime.date.today().year


class Command(BaseCommand):
    help = "Bootstrap a team, season, and optional admin user for a fresh deployment."

    def add_arguments(self, parser):
        parser.add_argument("--team-name", required=True, help="Full team name, e.g. 'Riverside Rams'")
        parser.add_argument("--team-abbr", required=True, help="Short abbreviation, e.g. 'RAMS'")
        parser.add_argument("--year", type=int, default=CURRENT_YEAR, help=f"Season year (default: {CURRENT_YEAR})")
        parser.add_argument("--admin-username", default="admin", help="Admin username (default: admin)")
        parser.add_argument("--admin-password", default=None, help="Admin password (prompted if omitted)")
        parser.add_argument("--admin-email", default="", help="Admin email address (optional)")
        parser.add_argument(
            "--no-admin",
            action="store_true",
            help="Skip creating an admin user",
        )

    def handle(self, *args, **options):
        team_name = options["team_name"]
        team_abbr = options["team_abbr"].upper()
        year = options["year"]
        no_admin = options["no_admin"]

        if year < 2000 or year > CURRENT_YEAR + 5:
            raise CommandError(f"Year {year} looks wrong. Use a value between 2000 and {CURRENT_YEAR + 5}.")

        with transaction.atomic():
            team = self._get_or_create_team(team_name, team_abbr)
            season = self._get_or_create_season(team, year)

            if not no_admin:
                self._get_or_create_admin(
                    username=options["admin_username"],
                    password=options["admin_password"],
                    email=options["admin_email"],
                    team=team,
                )

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Done."))
        self.stdout.write(f"  Team   : {team.name} ({team.abbreviation})  pk={team.pk}")
        self.stdout.write(f"  Season : {season.year}  pk={season.pk}")
        self.stdout.write("")

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _get_or_create_team(self, name, abbreviation):
        team, created = Team.objects.get_or_create(
            abbreviation=abbreviation,
            defaults={"name": name},
        )
        label = "Created" if created else "Found  "
        self.stdout.write(f"  {label} team: {team}")
        return team

    def _get_or_create_season(self, team, year):
        season, created = Season.objects.get_or_create(year=year, team=team)
        label = "Created" if created else "Found  "
        self.stdout.write(f"  {label} season: {season}")
        return season

    def _get_or_create_admin(self, username, password, email, team):
        if User.objects.filter(username=username).exists():
            self.stdout.write(f"  Found   admin user: {username} (already exists, skipping)")
            return

        if not password:
            import getpass
            password = getpass.getpass(f"  Password for '{username}': ")
            confirm = getpass.getpass(f"  Confirm password: ")
            if password != confirm:
                raise CommandError("Passwords do not match.")

        if len(password) < 8:
            raise CommandError("Password must be at least 8 characters.")

        User.objects.create_superuser(
            username=username,
            email=email,
            password=password,
            team=team,
        )
        self.stdout.write(f"  Created admin user: {username}")
