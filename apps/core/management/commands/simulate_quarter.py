"""
Management command: simulate_quarter

Simulates a realistic Q1 of play-by-play data through the live tracker AJAX
endpoints, exercising every snap type: run, pass (complete / sack / incomplete),
punt, kickoff, extra-point PAT, defensive tackles, sack, interception, and an
opponent touchdown.

After all plays are submitted the command verifies scores and sequence numbers.

Usage:
    python manage.py simulate_quarter
    python manage.py simulate_quarter --game-id 7
    python manage.py simulate_quarter --clear          # wipe snaps first
    python manage.py simulate_quarter --game-id 7 --clear
"""
import json

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.test import Client
from django.urls import reverse

from apps.games.models import Game
from apps.teams.models import Player

User = get_user_model()


class Command(BaseCommand):
    help = "Simulate a Q1 via the live tracker AJAX endpoints and verify correctness."

    def add_arguments(self, parser):
        parser.add_argument(
            "--game-id",
            type=int,
            help="PK of the game to simulate (default: most recent 0-0 game).",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete all existing snaps and reset scores before simulating.",
        )

    def handle(self, *args, **options):
        game = self._resolve_game(options.get("game_id"))

        if options["clear"]:
            count = game.snaps.count()
            game.snaps.all().delete()
            game.team_score = 0
            game.opponent_score = 0
            game.save(update_fields=["team_score", "opponent_score"])
            if count:
                self.stdout.write(f"  Cleared {count} existing snaps and reset scores.")

        client = self._make_client(game)
        players = self._load_players(game)

        sep = "-" * 68
        self.stdout.write(f"\n{sep}")
        self.stdout.write(
            f"  Q1 Simulation: {game.season.team.abbreviation} vs {game.opponent} "
            f"(game pk={game.pk})"
        )
        self.stdout.write(f"  Starting state: OWN 25 (received opening kickoff)")
        self.stdout.write(sep)

        # Initial state: we received the opening kickoff, ball at our OWN 25.
        state = {
            "down": 1,
            "distance": 10,
            "ball_position": -25,
            "situation": "normal",
            "quarter": 1,
        }

        state = self._run_drives(client, game, players, state)

        game.refresh_from_db()
        snap_count = game.snaps.count()

        self.stdout.write(sep)
        self.stdout.write(
            f"  {snap_count} plays recorded  |  "
            f"RAMS {game.team_score} - {game.opponent_score} {game.opponent}"
        )
        self.stdout.write(sep)

        self._verify(game, expected_team=7, expected_opp=6, expected_plays=17)

    # ------------------------------------------------------------------
    # Drive script
    # ------------------------------------------------------------------

    def _run_drives(self, client, game, p, state):
        """
        Scripted Q1 drives.  Returns the final game state dict.

        Drive 1 – RAMS offense → punt (exercises run, pass, sack, incomplete, punt)
        Drive 2 – Opponent → RAMS defence (tackle, sack, interception)
        Drive 3 – RAMS offense → TD + PAT (exercises TD run, extra-point kick)
        Drive 4 – RAMS kickoff + Opponent → opponent TD
                  (exercises kickoff, large-gain tackle, opponent-TD detection)
        """
        gid = game.pk

        def url(name):
            return reverse(f"tracker:{name}", kwargs={"pk": gid})

        # ----------------------------------------------------------------
        # DRIVE 1  –  RAMS offense starts at OWN 25 (state already set)
        # ----------------------------------------------------------------
        self.stdout.write("\n  -- Drive 1: RAMS offense (OWN 25 -> punt)")

        # 1. Run +6 yds
        state = self._play(client, 1, "RUN", url("add_run"), {
            "quarter": 1, **_ds(state),
            "ball_carrier": _pid(p, "rb"),
            "yards_gained": 6,
        }, f"#{_num(p,'rb')} run +6 yds")

        # 2. Pass complete +8 yds (first down)
        state = self._play(client, 2, "PASS", url("add_pass"), {
            "quarter": 1, **_ds(state),
            "quarterback": _pid(p, "qb"),
            "target": _pid(p, "wr"),
            "receiver": _pid(p, "wr"),
            "is_complete": True, "yards_gained": 8,
            "air_yards": 5, "yards_after_catch": 3,
            "is_first_down": True,
        }, f"#{_num(p,'qb')} to #{_num(p,'wr')} +8 yds (1st down)")

        # 3. Run +3 yds
        state = self._play(client, 3, "RUN", url("add_run"), {
            "quarter": 1, **_ds(state),
            "ball_carrier": _pid(p, "rb"),
            "yards_gained": 3,
        }, f"#{_num(p,'rb')} run +3 yds")

        # 4. Pass – sacked -7 yds
        state = self._play(client, 4, "PASS", url("add_pass"), {
            "quarter": 1, **_ds(state),
            "quarterback": _pid(p, "qb"),
            "is_complete": False, "was_sacked": True,
            "yards_gained": -7, "sack_yards": -7,
        }, f"#{_num(p,'qb')} sacked -7 yds")

        # 5. Pass – incomplete (4th & long)
        state = self._play(client, 5, "PASS", url("add_pass"), {
            "quarter": 1, **_ds(state),
            "quarterback": _pid(p, "qb"),
            "target": _pid(p, "wr"),
            "is_complete": False, "yards_gained": 0,
        }, f"#{_num(p,'qb')} pass incomplete")

        # 6. Punt 40 yds  (ball_pos ≈ -1 → -1+40 = +39 = OPP 11)
        state = self._play(client, 6, "PUNT", url("add_punt"), {
            "quarter": 1, **_ds(state),
            "punter": _pid(p, "p"),
            "punt_yards": 40,
            "is_touchback": False,
            "out_of_bounds": False,
        }, f"#{_num(p,'p')} punts 40 yds -> OPP 11")

        # ----------------------------------------------------------------
        # DRIVE 2  –  Opponent has ball at +39 (OPP 11)
        # ----------------------------------------------------------------
        self.stdout.write("\n  -- Drive 2: Opponent drives (INT -> RAMS ball)")

        # 7. Defense – tackle +5 yds
        state = self._play(client, 7, "DEFENSE", url("add_defense"), {
            "quarter": 1, **_ds(state),
            "play_result": "TACKLE", "tackle_yards": 5,
            "opponent_play_type": "RUN",
            "primary_player": _pid(p, "lb"),
        }, f"#{_num(p,'lb')} tackle +5 yds")

        # 8. Defense – sack -5 yds (opponent QB sacked)
        state = self._play(client, 8, "DEFENSE", url("add_defense"), {
            "quarter": 1, **_ds(state),
            "play_result": "SACK", "tackle_yards": -5,
            "opponent_play_type": "PASS",
            "primary_player": _pid(p, "dl"),
        }, f"#{_num(p,'dl')} sack -5 yds")

        # 9. Defense – interception (turnover)
        state = self._play(client, 9, "DEFENSE", url("add_defense"), {
            "quarter": 1, **_ds(state),
            "play_result": "INT", "tackle_yards": 0,
            "opponent_play_type": "PASS",
            "primary_player": _pid(p, "cb"),
            "interception_return_yards": 8,
        }, f"#{_num(p,'cb')} INTERCEPTION +8 rtn")
        # Ensure we treat this as 1st & 10 on our next drive.
        state = {**state, "down": 1, "distance": 10}

        # ----------------------------------------------------------------
        # DRIVE 3  –  RAMS offense at +39 (OPP 11) → TD
        # ----------------------------------------------------------------
        self.stdout.write("\n  -- Drive 3: RAMS offense (OPP 11 -> TD)")

        # 10. Run +4 yds
        state = self._play(client, 10, "RUN", url("add_run"), {
            "quarter": 1, **_ds(state),
            "ball_carrier": _pid(p, "rb"),
            "yards_gained": 4,
        }, f"#{_num(p,'rb')} run +4 yds")

        # 11. Pass complete +4 yds (triggers 1st down: dist 6→6-4=2? no, 3rd & 2)
        #     ball_pos: 39+4=43, then 43+4=47
        state = self._play(client, 11, "PASS", url("add_pass"), {
            "quarter": 1, **_ds(state),
            "quarterback": _pid(p, "qb"),
            "target": _pid(p, "te"),
            "receiver": _pid(p, "te"),
            "is_complete": True, "yards_gained": 4,
            "air_yards": 2, "yards_after_catch": 2,
        }, f"#{_num(p,'qb')} to TE +4 yds")

        # 12. Run TD (3 yds from +47 → +50, auto-TD)
        state = self._play(client, 12, "RUN", url("add_run"), {
            "quarter": 1, **_ds(state),
            "ball_carrier": _pid(p, "rb"),
            "yards_gained": 3,
            "is_touchdown": True,
        }, f"#{_num(p,'rb')} TOUCHDOWN! +3 yds (RAMS +6)")

        # 13. PAT kick – GOOD
        state = self._play(client, 13, "PAT", url("add_extra_point"), {
            "quarter": 1,
            "ball_position": 47,  # snap from ~3 yard line
            "attempt_type": "KICK",
            "result": "GOOD",
            "kicker": _pid(p, "k"),
        }, f"#{_num(p,'k')} PAT kick - GOOD (RAMS +7)")

        # ----------------------------------------------------------------
        # DRIVE 4  –  RAMS kick off; opponent drives for TD
        # ----------------------------------------------------------------
        self.stdout.write("\n  -- Drive 4: Kickoff -> opponent TD")

        # 14. Kickoff – touchback; opponent receives at their OWN 25 (= OPP 25 = +25 in our frame).
        #     Must send receiving_team='away' so the endpoint places the ball at +25, not -25.
        state = self._play(client, 14, "KICKOFF", url("add_kickoff"), {
            "quarter": 1,
            "ball_position": -15,       # our OWN 35
            "kick_yards": 67,
            "is_touchback": True,
            "receiving_team": "away",   # opponent receives -> ball_pos_after = +25
        }, f"#{_num(p,'k')} kickoff - touchback -> opp OWN 25 (+25)")

        # 15. Defense – tackle +35 yds (OPP 25 -> OWN 40, i.e. +25 - 35 = -10)
        state = self._play(client, 15, "DEFENSE", url("add_defense"), {
            "quarter": 1, **_ds(state),
            "play_result": "TACKLE", "tackle_yards": 35,
            "opponent_play_type": "RUN",
            "primary_player": _pid(p, "s"),
        }, f"#{_num(p,'s')} tackle after 35-yd gain (OPP 25 -> OWN 40)")

        # 16. Defense – tackle +15 yds (OWN 40 -> OWN 25, i.e. -10 - 15 = -25)
        state = self._play(client, 16, "DEFENSE", url("add_defense"), {
            "quarter": 1, **_ds(state),
            "play_result": "TACKLE", "tackle_yards": 15,
            "opponent_play_type": "RUN",
            "primary_player": _pid(p, "lb"),
        }, f"#{_num(p,'lb')} tackle after 15-yd gain (OWN 40 -> OWN 25)")

        # 17. Defense – opponent TOUCHDOWN
        #     ball_pos after P16: -25 (OWN 25).
        #     Tackle 30 yds: -25 - 30 = -55 ≤ -50 → opponent TD, opp_score += 6.
        state = self._play(client, 17, "DEFENSE", url("add_defense"), {
            "quarter": 1, **_ds(state),
            "play_result": "TACKLE", "tackle_yards": 30,
            "opponent_play_type": "RUN",
            "primary_player": _pid(p, "lb"),
        }, f"Opponent TOUCHDOWN! 30-yd run (opp +6)")

        return state

    # ------------------------------------------------------------------
    # HTTP helper
    # ------------------------------------------------------------------

    def _play(self, client, seq, label, url, data, description):
        """POST to a tracker endpoint, log the result, return the next state."""
        resp = client.post(url, json.dumps(data), content_type="application/json")

        if resp.status_code != 200:
            raise RuntimeError(
                f"Play {seq} [{label}] -> HTTP {resp.status_code}: "
                f"{resp.content.decode()[:300]}"
            )

        result = resp.json()
        if not result.get("success"):
            raise RuntimeError(f"Play {seq} [{label}] -> success=false: {result}")

        ns = result["next_state"]
        score = f"RAMS {result['team_score']}-{result['opponent_score']}"
        bp = _fmt_pos(ns.get("ball_position"))
        sit = ns.get("situation", "")
        dn_str = (
            f"D{ns.get('down')}&{ns.get('distance')}"
            if ns.get("down")
            else sit.upper()[:12]
        )
        self.stdout.write(
            f"  {seq:>2}. [{label:<8}] {description:<48} "
            f"{dn_str:<14} {bp:<10} {score}"
        )

        return ns

    # ------------------------------------------------------------------
    # Correctness verification
    # ------------------------------------------------------------------

    def _verify(self, game, expected_team, expected_opp, expected_plays):
        self.stdout.write("\n  Correctness checks:")
        errors = []

        game.refresh_from_db()

        # Score checks
        if game.team_score != expected_team:
            errors.append(
                f"team_score: expected {expected_team}, got {game.team_score}"
            )
        if game.opponent_score != expected_opp:
            errors.append(
                f"opponent_score: expected {expected_opp}, got {game.opponent_score}"
            )

        # Snap count and sequence integrity
        snaps = list(
            game.snaps.order_by("sequence_number").values_list(
                "sequence_number", flat=True
            )
        )
        if len(snaps) != expected_plays:
            errors.append(
                f"snap count: expected {expected_plays}, got {len(snaps)}"
            )
        elif snaps != list(range(1, expected_plays + 1)):
            errors.append(
                f"sequence_numbers not consecutive 1..{expected_plays}: {snaps}"
            )

        if errors:
            for e in errors:
                self.stdout.write(self.style.ERROR(f"  FAIL  {e}"))
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"  PASS  scores ({expected_team}-{expected_opp}), "
                    f"sequence numbers (1-{expected_plays}) OK"
                )
            )

    # ------------------------------------------------------------------
    # Setup helpers
    # ------------------------------------------------------------------

    def _resolve_game(self, game_id):
        if game_id:
            return Game.objects.select_related("season__team").get(pk=game_id)
        game = (
            Game.objects.select_related("season__team")
            .filter(team_score=0, opponent_score=0)
            .order_by("-date")
            .first()
        )
        if not game:
            raise RuntimeError(
                "No 0-0 game found. Run `seed_dev_data` first "
                "or pass --game-id <pk>."
            )
        return game

    def _make_client(self, game):
        """Return a logged-in Django test Client for the game's team."""
        client = Client(SERVER_NAME="localhost")
        team = game.season.team
        user = (
            User.objects.filter(team=team, is_superuser=True).first()
            or User.objects.filter(team=team).first()
            or User.objects.filter(is_superuser=True).first()
        )
        if not user:
            raise RuntimeError(
                "No user found. Run `seed_dev_data` first to create accounts."
            )
        client.force_login(user)
        return client

    def _load_players(self, game):
        """Return a dict of role → Player for the game's team."""
        team = game.season.team
        qs = Player.objects.filter(team=team, is_active=True)

        def first(pos):
            return qs.filter(position=pos).first()

        players = {
            "qb":  first("QB"),
            "rb":  qs.filter(position="RB").first(),
            "rb2": qs.filter(position="RB").last(),
            "wr":  first("WR"),
            "te":  first("TE"),
            "k":   first("K"),
            "p":   first("P"),
            "lb":  first("LB"),
            "dl":  first("DL"),
            "cb":  first("CB"),
            "s":   first("S"),
        }

        missing = [role for role, pl in players.items() if pl is None]
        if missing:
            self.stdout.write(
                self.style.WARNING(
                    f"  Warning: no player found for roles: {missing}. "
                    "Player FKs will be null on those snaps."
                )
            )
        return players


# ---------------------------------------------------------------------------
# Module-level helpers (stateless, used by both class and drive script)
# ---------------------------------------------------------------------------

def _pid(players, role):
    """Return player pk or None for the given role key."""
    pl = players.get(role)
    return pl.pk if pl else None


def _num(players, role):
    """Return jersey number string (e.g. '22') or '?' if player is None."""
    pl = players.get(role)
    return str(pl.number) if pl else "?"


def _ds(state):
    """Extract down/distance/ball_position from a state dict for POST data."""
    return {
        "down": state.get("down"),
        "distance": state.get("distance"),
        "ball_position": state.get("ball_position"),
    }


def _fmt_pos(pos):
    """Format a ball_position integer as 'OWN 25' / 'OPP 14' / '50'."""
    if pos is None:
        return "--"
    if pos == 0:
        return "50"
    if pos < 0:
        return f"OWN {50 + pos}"
    return f"OPP {50 - pos}"
