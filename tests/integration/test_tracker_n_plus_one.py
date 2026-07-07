"""
N+1 regression guards for the tracker read paths.

Verifies the play_feed serializer batching is preserved on both the feed
endpoint and the tracker page load:
- polymorphic downcast via non_polymorphic().get_real_instances()
  (one query per concrete type, NOT one per snap, and no double downcast)
- player FKs loaded via a single Player.objects.in_bulk() (the factories
  create a DISTINCT player per snap, so a per-row FK regression would add
  ~10 queries here and breach the ceiling).

With batching, cost is O(distinct snap types): ~10 queries for the endpoint
regardless of snap count.  An N+1 regression looks like 20+.
"""
import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from tests.factories import (
    UserFactory,
    GameFactory,
    RunPlayFactory,
    PassPlayFactory,
    DefenseSnapFactory,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SNAP_COUNT = 10  # total snaps across 3 concrete types
_QUERY_CEILING = 10  # measured: exactly 10 with batching; N+1 adds ~10 more


def _make_mixed_snaps(game):
    """Create _SNAP_COUNT snaps of three concrete types against *game*."""
    seq = 1
    for _ in range(4):
        RunPlayFactory(game=game, sequence_number=seq)
        seq += 1
    for _ in range(3):
        PassPlayFactory(game=game, sequence_number=seq)
        seq += 1
    for _ in range(3):
        DefenseSnapFactory(game=game, sequence_number=seq)
        seq += 1


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestTrackerRecentPlaysNPlusOne:
    """Ensures tracker_recent_plays stays inside the batched query budget."""

    def test_query_count_bounded_for_mixed_snap_types(self, client):
        """
        For _SNAP_COUNT snaps across 3 concrete types the endpoint must
        issue ≤ _QUERY_CEILING queries.  A regression to per-snap
        get_real_instance() calls would produce ~14+ queries and breach
        the ceiling.
        """
        staff = UserFactory(is_staff=True)
        game = GameFactory()
        _make_mixed_snaps(game)

        client.force_login(staff)

        with CaptureQueriesContext(connection) as qctx:
            response = client.get(
                f"/games/{game.pk}/tracker/plays/",
                {"limit": _SNAP_COUNT},
            )

        assert response.status_code == 200, response.content
        data = response.json()
        assert data["success"] is True
        assert len(data["plays"]) == _SNAP_COUNT

        n_queries = len(qctx.captured_queries)
        assert n_queries <= _QUERY_CEILING, (
            f"tracker_recent_plays issued {n_queries} queries for {_SNAP_COUNT} snaps "
            f"(ceiling: {_QUERY_CEILING}).  Likely cause: BaseSnap queryset is being "
            f"iterated with per-row get_real_instance() instead of batch "
            f"get_real_instances().  See tracker_recent_plays in apps/frontend/tracker.py."
        )

    def test_query_count_scales_sublinearly(self, client):
        """
        Doubling the snap count must not double the query count.
        Runs two requests (5 snaps, then 10 snaps) and verifies the query
        delta is < 4 — proving the cost is type-count-driven, not snap-driven.
        """
        staff = UserFactory(is_staff=True)
        game = GameFactory()
        _make_mixed_snaps(game)
        client.force_login(staff)

        with CaptureQueriesContext(connection) as ctx_5:
            client.get(f"/games/{game.pk}/tracker/plays/", {"limit": 5})

        with CaptureQueriesContext(connection) as ctx_10:
            client.get(f"/games/{game.pk}/tracker/plays/", {"limit": 10})

        delta = len(ctx_10.captured_queries) - len(ctx_5.captured_queries)
        assert delta < 4, (
            f"Query count grew by {delta} when doubling snap limit from 5→10.  "
            f"With batched get_real_instances() the delta should be 0–1.  "
            f"A delta ≥ 4 strongly suggests per-snap N+1 regression."
        )


_PAGE_QUERY_CEILING = 18  # page load renders scoreboard + feed; N+1 adds ~10+


@pytest.mark.django_db
class TestGameTrackerPageNPlusOne:
    """The tracker page itself must render the feed from the batched serializer."""

    def test_page_load_query_count_bounded(self, rf):
        """
        Rendering /games/<pk>/tracker/ with 10 mixed snaps (each with a
        distinct player) must stay inside the batched budget.  A regression
        to rendering model instances via BaseSnap.__str__ (which walks
        game → season → team per row) or per-row player access would add
        ~10-30 queries and breach the ceiling.

        Uses RequestFactory + a direct view call (not the test client):
        the test client's template-context capture crashes under
        Python 3.14 + Django 5.0, and we only care about query counts.
        """
        from apps.frontend.tracker import game_tracker

        staff = UserFactory(is_staff=True)
        game = GameFactory()
        _make_mixed_snaps(game)

        request = rf.get(f"/games/{game.pk}/tracker/")
        request.user = staff

        with CaptureQueriesContext(connection) as qctx:
            response = game_tracker(request, pk=game.pk)

        assert response.status_code == 200
        n_queries = len(qctx.captured_queries)
        assert n_queries <= _PAGE_QUERY_CEILING, (
            f"game_tracker page load issued {n_queries} queries for "
            f"{_SNAP_COUNT} snaps (ceiling: {_PAGE_QUERY_CEILING}).  Likely "
            f"cause: the recent-plays feed is being rendered from model "
            f"instances instead of play_feed.serialize_recent_plays dicts."
        )
