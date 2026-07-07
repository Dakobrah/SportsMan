# Live Game Tracker — Design Document

**Status:** As-built (branch `live-tracker-fix`, July 2026 rebuild)
**Supersedes:** [ADR-001 §4 "Tracker State Machine"](ADR-001-system-architecture.md#4-tracker-state-machine), which describes the pre-rebuild, client-authoritative design. ADR-001 remains the reference for whole-application architecture (polymorphic snaps, dual REST/template interface, deployment).

---

## 1. Overview & Goals

The live tracker is a mobile-first page (`/games/<pk>/tracker/`) that lets a coach record football plays in real time from the sideline: runs, passes, penalties, kickoffs, punts, field goals, extra points, and defensive snaps. It maintains the full game situation — score, quarter, down & distance, ball position, possession, and special phases (kickoff, extra point, free kick) — and renders it on a live field visualization.

### Design goals

1. **Durable state.** A page reload, browser crash, or dead battery must never lose game state. The server is the single source of truth.
2. **Multi-viewer live sync.** Any logged-in team member (assistant coach, press box) sees new plays and score changes within a few seconds, without touching the operator's device.
3. **Zero new infrastructure.** Must run on the existing stack: 3-worker Gunicorn (WSGI), nginx, PostgreSQL in Docker (SQLite in dev). No Redis, no Channels/ASGI, no message broker.
4. **Field-side resilience.** Sideline Wi-Fi is flaky; every write is atomic, duplicate-submit-safe, and the client surfaces failures instead of silently dropping plays.
5. **Small-data honesty.** K-12 volume (<500 snaps/season/team). Optimizations target *round-trips* (N+1s, poll cost), not big-data scale.

### Non-goals

- Instant (<1s) push updates — polling at 4s is deliberate (see §6 and Future Improvements).
- Multi-operator merge semantics — concurrent operators serialize on a row lock; last writer's play wins the next sequence number.
- Opponent roster tracking — opponent plays are recorded from our defense's perspective.

---

## 2. Domain Model

```
Team ──< Season ──< Game ──── GameState        (OneToOne, mutable "live row")
                      │
                      └────< BaseSnap          (immutable event log, polymorphic)
                               ├─ OffenseSnap ──< RunPlay, PassPlay
                               ├─ DefenseSnap
                               └─ SpecialTeamsSnap ──< PuntSnap, KickoffSnap,
                                    FieldGoalSnap, ExtraPointSnap, (return snaps)
```

Two complementary records of a game:

- **`BaseSnap` rows are the event log** — one immutable row per play, ordered by `sequence_number` (unique per game, DB-enforced). Concrete-table inheritance via django-polymorphic ([apps/snaps/models/](../apps/snaps/models/)).
- **`GameState` is the current situation** — one mutable row per game ([apps/games/models.py](../apps/games/models.py)), created lazily on first use and updated in the same transaction as each snap write.

### GameState fields

| Field | Meaning |
|---|---|
| `quarter`, `down`, `distance` | Current situation; `down`/`distance` are NULL in no-down phases |
| `ball_position` | −50 (our endzone) … 0 (midfield) … +50 (opponent endzone) |
| `los_position` | Where the next snap occurs — follows the ball after every play (the *first-down* line is what stays fixed for a series) |
| `possession` | `home` (us) / `away` (opponent) / `""` (unknown, pregame) |
| `situation` | Phase: `pregame · kickoff · normal · extra_point · opponent_td · free_kick_us · free_kick_opp` |
| `coin_toss_winner`, `coin_toss_choice` | The recorded on-field toss |
| `version` | Monotonic counter, bumped on **every** mutation — drives polling (§6) |
| `last_sequence` | Mirrors the highest snap `sequence_number` — drives feed deltas and undo detection |

### Undo metadata on every snap

Each `BaseSnap` stores how to reverse itself ([apps/snaps/models/base.py](../apps/snaps/models/base.py)):

- `score_delta_team` / `score_delta_opponent` — points this play added
- `prior_state` — JSON snapshot of GameState taken just before the play was applied (**scores deliberately excluded** — see §7)

The coordinate frame is shared end to end: model storage, state machine, API payloads, and the JS field renderer all speak −50…+50.

---

## 3. State Machine

All rules live in **pure functions** in [apps/frontend/tracker_logic.py](../apps/frontend/tracker_logic.py) — no Django imports, fully unit-testable:

```python
@dataclass
class Outcome:
    down: int | None
    distance: int | None
    ball_position: int
    situation: str
    team_pts: int = 0     # scoring is DATA, not a side effect
    opp_pts: int = 0
```

`next_state_run_pass / _penalty / _kickoff / _punt / _field_goal / _extra_point / _defense` each map *(current state, play data)* → `Outcome`. Because scoring is data, the same value feeds three consumers: the live score adjustment, the per-snap undo deltas, and the response payload. There is exactly one place where "a blocked-punt TD is worth 6" is written down.

`compute_next_state()` and `_defense_next_state()` in [apps/frontend/tracker.py](../apps/frontend/tracker.py) remain as thin wrappers preserving the historical signatures the unit tests were written against.

The football rules these functions encode — ruleset (NFHS), field-position constants, and every documented simplification — are specified in **[FOOTBALL-SEMANTICS.md](FOOTBALL-SEMANTICS.md)**, which is the authoritative ledger: change the ledger first, then the code.

### Situations vs phases

Pure functions return transient **situations** (`turnover`, `opponent_ball`, `safety_kick`, …). `_PHASE_MAP` in tracker.py collapses them into the persistent **phase** stored on GameState — e.g. every flavor of possession change becomes phase `normal` (the `possession` field records who has the ball), while `safety` becomes `free_kick_us` so a reload lands the operator back in the free-kick flow.

### Possession resolution

Possession is never trusted from the client. Per play:

1. **Inference:** recording an offensive play forces `possession = home`; a defensive snap forces `away` (self-correcting for games that predate GameState).
2. **Outcome:** `_possession_after()` applies the flip table — `turnover`/`turnover_on_downs` flip, `opponent_ball`/`opponent_td`/`safety_kick` → away, `extra_point`/`safety` → home, `normal`/`kickoff` keep.
3. **Kickoffs** resolve directly from where the ball landed (`normal` = we received). During any kick phase, **possession = the kicking team**, which lets the server derive the receiving team when the client omits it (coin toss → kickoff, post-score kickoff, both free-kick phases, post-opponent-TD kickoff all fall out of this one rule).

---

## 4. Concurrency Model

- **The `Game` row is the single mutex.** Every write endpoint runs `transaction.atomic()` + `Game.objects.select_for_update()`. GameState is only ever written while that lock is held, so GameState itself is never locked — one invariant instead of two lock orders.
- **Sequence integrity is DB-enforced:** `unique_together (game, sequence_number)`. If two requests race past the lock (or a client double-submits), the loser gets `IntegrityError` → **HTTP 409** with the contract "play already recorded — poll and move on." The client treats 409 as *someone else got there first*, not as an error.
- Reads (page load, polling, feed) take no locks; `get_or_create` absorbs the one benign race on lazy GameState creation.

---

## 5. API Surface

All endpoints under `/games/<pk>/tracker/` ([apps/frontend/tracker_urls.py](../apps/frontend/tracker_urls.py)), session-auth via `@login_required`, team-scoped via `_parse_request()` (staff bypass; users with no team or another team get 403).

| Endpoint | Method | Purpose |
|---|---|---|
| `…/tracker/` | GET | Page; seeds client from GameState (`?view=1` → read-only viewer) |
| `…/coin-toss/` | POST | Record the on-field toss: `{winner, choice}` → sets possession + kickoff phase |
| `…/run/ · pass/ · penalty/ · kickoff/ · punt/ · field-goal/ · extra-point/ · defense/` | POST | Record a play (8 endpoints) |
| `…/update-score/` | POST | Manual score edit (bumps version) |
| `…/update-quarter/` | POST | Persist quarter change |
| `…/undo/` | POST | Delete last play, rewind state (§7) |
| `…/plays/` | GET | Recent-plays feed (`?limit=`) |
| `…/state/` | GET | Polling endpoint (`?since=&after_seq=`, §6) |

### Play response envelope (backward compatible)

```json
{
  "success": true, "play_id": 74,
  "play_summary": "#22 Smith run for 8 yds",
  "play_detail": { "type": "Run", "sequence": 3, "quarter": 1, "yards": 8, ... },
  "next_state": { "down": 2, "distance": 2, "ball_position": -10, "situation": "normal" },
  "team_score": 7, "opponent_score": 0,
  "state": { ...full serialized GameState... },
  "version": 12
}
```

`next_state` is the legacy transient outcome (drives phase transitions); `state`/`version` are the authoritative snapshot every client adopts. **Client-sent `down`/`distance`/`ball_position`/`quarter` are ignored** — snaps are stamped from server state.

---

## 6. Sync Protocol (Polling)

Every open tracker page — operator or viewer — polls:

```
GET /games/<pk>/tracker/state/?since=<my version>&after_seq=<highest seq my feed shows>
```

- **Unchanged** (the overwhelmingly common case): `{"changed": false, "version": N}` — one indexed `.values()` query, ~40 bytes. Budget is pinned by test at ≤4 total queries including auth.
- **Changed:** full state + scores + only the plays with `sequence_number > after_seq` (cap 20), serialized by the same [play_feed](../apps/frontend/play_feed.py) serializer the page and feed endpoint use.

Client loop ([static/js/tracker/poll.js](../static/js/tracker/poll.js)): `setInterval(4000)`, skipped while a submit is in flight or the tab is hidden; `visibilitychange` triggers an immediate catch-up poll.

**Reconciliation rules** (why the operator never fights the poller):

1. Every write response carries `state`+`version`, which the client adopts immediately — so its own writes can never re-apply via a later poll.
2. `adoptServerState()` is version-monotonic: payloads with `version <= mine` are discarded (guards against out-of-order responses).
3. **Undo detection:** if the server's `last_sequence` is below the feed's top sequence, another device undid plays → the feed truncates above `last_sequence`.
4. A poll never clears a form the operator is filling in; it only refreshes scoreboard/field/feed, plus a toast when the phase changed remotely.

Why polling and not WebSockets: 4-second latency is indistinguishable from "live" for football spectating, it needs zero new services on game day, it survives proxies and sleep/wake cycles trivially, and the idle cost (~1 tiny query per client per 4s) is negligible at this scale. The upgrade path is in Future Improvements.

---

## 7. Undo Design

`POST …/undo/` (under the Game lock):

1. Subtract the last snap's `score_delta_*` from the Game scores (floored at 0).
2. Restore GameState fields from the snap's `prior_state` snapshot.
3. `last_sequence = seq − 1`, `version += 1`, delete the snap.

Two deliberate asymmetries:

- **Scores rewind via deltas, state via snapshot.** If the operator manually corrected the score *after* the play, an undo subtracts only what the play scored — the manual correction survives. A snapshot restore would silently revert it.
- **Legacy fallback:** snaps recorded before this design have `prior_state = NULL`; undo then re-derives state from the previous snap's stamped fields (same derivation the page load used pre-rebuild). Migration `snaps/0005` backfilled `score_delta_*` for historical snaps using the old inference rules, so score reversal is always exact.

This replaced a ~50-line type-ladder that re-inferred scoring per snap class — the rules now exist only in `tracker_logic`.

---

## 8. Client Architecture

Vanilla-JS **ES modules** (no bundler) in [static/js/tracker/](../static/js/tracker/):

```
state.js   seed + mutable state + adoptServerState()      (no imports)
ui.js      escapeHtml, toasts, focus/a11y helpers          (no imports)
api.js     CSRF-aware postJSON/getJSON                     → state
field.js   scoreboard, ball/LOS/first-down rendering       → state
feed.js    feed prepend/merge/truncate by sequence         → ui
flow.js    recordPlay, undo, phase transitions             → state,api,field,feed,ui
forms.js   form builders + collectors + delegation         → state,ui,field,flow
modals.js  coin-toss recorder, TD/PAT dialogs              → state,ui,api,field,forms
poll.js    the sync loop                                   → state,api,field,feed,forms,ui
main.js    entry: wiring, initial render, viewer mode      → everything
```

Imports flow strictly downward. The one would-be cycle (flow needs to *show* forms/modals after a play; forms need flow's `recordPlay`) is broken by dependency injection: `main.js` passes the phase handlers into `flow.initFlow({...})`.

Notable behaviors:

- **Coin toss is a recorder, not a simulator.** The real coin is flipped on the field; the 2-step modal records who won and what they elected, and persists it — the old client generated the result with `Math.random()` and kept it only in memory.
- **Resume-on-load:** `main.js` reads `GameState.situation` and lands the operator back in the right phase (coin toss modal, kickoff form, extra-point form, opponent-PAT dialog).
- **Viewer mode** (`?view=1`) hides all entry controls, shows a VIEWER badge, moves the feed under the scoreboard, and runs only the poller. This is a UI affordance — write authorization is unchanged (any owning-team member; see Future Improvements for server-enforced roles).
- **Kickoffs need no `receiving_team`** from the client — the server derives it from possession (§3).

Production serving: WhiteNoise's manifest storage does **not** rewrite ES-module `import './x.js'` statements to hashed filenames by default — every module would 404. [apps/core/storage.py](../apps/core/storage.py) subclasses it with `support_js_module_import_aggregation = True`; verified via `collectstatic` (hashed `main.*.js` contains hashed import specifiers).

---

## 9. Performance

### Query budgets (pinned by regression tests)

| Path | Budget | Test |
|---|---|---|
| Feed endpoint, 10 mixed snaps | ≤10 queries | `tests/integration/test_tracker_n_plus_one.py` |
| Tracker page load | ≤18 queries | same file |
| Idle poll | ≤4 queries | `tests/integration/test_tracker_polling.py` |

### The two traps, documented

1. **Polymorphic double-downcast.** Iterating a polymorphic queryset auto-downcasts (1 + one query per concrete type) — and then `get_real_instances()` re-fetches everything. The batched pattern is `BaseSnap.objects.non_polymorphic().filter(pk__in=…).get_real_instances()`. This alone was 7 snap queries → 4 for the feed.
2. **Per-row player FKs.** Summaries touch up to 7 player FKs across snap types; [play_feed.py](../apps/frontend/play_feed.py) collects all ids and issues one `Player.objects.in_bulk()`. play_feed is the *only* snap serializer — feed, polling, tracker page, and the play-by-play page all share it (and its query discipline).

### Caching without invalidation

[apps/core/cache.py](../apps/core/cache.py): with 3 Gunicorn workers, LocMem is per-process, so signal-based invalidation cannot propagate. Instead, cache keys **embed a data version** — `Count + Max(updated_at)` aggregates over the scoped snaps and games (two cheap queries). Any create/edit/delete/undo changes the version, making stale entries unaddressable; TTL/LRU evicts them. Applied to the three report pages (300s) and the dashboard (60s). Tests run with `DummyCache`.

### Other

- Dashboard uses conditional aggregation (`Count(filter=Q(...))`) — one scan per table instead of a `.count()` per metric (~17 queries → ~10).
- Report "top performer" queries slice at the database (`get_rushing_by_player(limit=1)`).
- Snap REST ViewSets use cursor pagination (no `COUNT(*)` per request). Ordering is `(-created_at, -id)` — `sequence_number` is only unique *per game*, and cursor pagination silently skips/duplicates rows at boundaries under non-unique global ordering. **Note:** this changed the API envelope from page numbers to cursor links.

---

## 10. Testing Strategy

| Layer | Files | What it pins |
|---|---|---|
| Pure rules | `tests/unit/test_tracker_logic.py`, `test_tracker_logic_outcomes.py` | Down/distance/position math; scoring-as-data (`team_pts`/`opp_pts`) |
| HTTP contract | `tests/integration/test_tracker_endpoints.py` | Auth matrix, server-stamping (bogus client state ignored), GameState transitions, deltas/snapshots, all undo paths, blocked punts, defensive TD/safety, coin toss/quarter persistence |
| Sync | `tests/integration/test_tracker_polling.py` | Delta payloads, version bumps from every mutation type, idle-poll query budget |
| Query budgets | `tests/integration/test_tracker_n_plus_one.py` | The ceilings in §9, with a distinct player per snap so FK regressions can't hide |
| Pages | `tests/integration/test_report_pages.py` | Report auth guards + render (regression for a decorator-placement bug) |
| Cache | `tests/unit/test_cache_version.py` | `data_version` changes on every mutation type; scope isolation |
| End-to-end | scratchpad `e2e_tracker.py` / `e2e_pages.py` | Full game sequence against a live server with separate operator/viewer sessions |

**Environment caveat:** Python 3.14 + Django 5.0's *test client* crashes copying template contexts (`store_rendered_templates`). Template-rendering tests therefore use `RequestFactory` + direct view calls; JSON endpoints use the normal client. Factories are deterministic (static quarter/down, 0–0 scores) — `factory.Iterator` and random scores previously made results order-dependent.

---

## 11. Future Improvements

Ordered roughly by value ÷ effort.

1. **Server-enforced roles (operator vs viewer).** Today any owning-team member can write; `?view=1` is purely cosmetic. Add a `role` field (or `is_tracker_operator` flag) to `accounts.User`, enforce in `_parse_request()` for write endpoints, and drive viewer mode from the server instead of the query string. Small, high-value hardening.
2. **Offline-first operator.** Sideline Wi-Fi drops mid-drive. Queue failed play submissions in IndexedDB and replay on reconnect. The 409 contract + per-game sequence numbers already provide idempotent dedup, so the server needs no changes — this is a client-only `api.js`/`flow.js` extension with a "N plays queued" badge.
3. **Game clock capture.** `BaseSnap.game_clock` (DurationField) exists but has no UI. A tap-to-set clock chip on the scoreboard (persisted on GameState, stamped per snap) unlocks time-based analytics (time of possession, 2-minute situations) cheaply.
4. **Drive summaries.** GameState now records possession transitions, and every snap snapshots its pre-play state — drives can be reconstructed server-side (`possession` changes in `prior_state` chains) and surfaced as "Drive: 8 plays, 64 yds, TD" separators in the feed and game detail page.
5. **Push upgrade path (only if 4s ever feels slow).** Step 1: Server-Sent Events endpoint behind the same version counter — works on Gunicorn with `gevent` workers, no Redis, and `poll.js` degrades to polling automatically. Step 2 (only for true fan-out scale): Channels + Redis. The version/`after_seq` protocol is transport-agnostic by design, so neither step touches the data model.
6. **Edit past plays / redo.** Undo is last-play-only. The `prior_state` chain makes bounded replay feasible: to edit play N, rewind to N's snapshot, re-apply plays N+1… through the pure state machine, and diff the scores. Worth doing only with a real coaching request — the state machine purity is what keeps this tractable.
7. **Defensive-side penalties.** The penalty state machine assumes our-offense frame (`on_offense=False` means *their defense* fouled *our offense*). Penalties while the opponent has the ball can't be entered correctly — needs a possession-aware penalty function in `tracker_logic` plus a form variant.
8. **PWA + wake lock.** A manifest + service worker (which also serves improvement #2) lets tablets install the tracker full-screen; the Screen Wake Lock API stops the device sleeping mid-drive.
9. **Public read-only share links.** Signed, expiring game tokens (`django.core.signing`) so parents can watch the viewer page without accounts. Requires rate limiting and denying the write endpoints for token sessions — pairs with improvement #1.
10. **Redis cache tier.** Only if the deployment grows past one host or worker duplication starts to matter: swap `CACHES` to Redis and `data_version` keys keep working unchanged (they're backend-agnostic).
11. **Housekeeping** (from the code-review ledger): nginx security headers for static files, SRI hashes on CDN assets, registration rate limiting, `--cov-fail-under` in pytest.ini, and de-duplicating the `collectstatic` run (Dockerfile + entrypoint).

---

## Appendix: File Map

| Concern | Files |
|---|---|
| Live state model | [apps/games/models.py](../apps/games/models.py) (`GameState`) |
| Event log + undo metadata | [apps/snaps/models/base.py](../apps/snaps/models/base.py) |
| Endpoints + state helpers | [apps/frontend/tracker.py](../apps/frontend/tracker.py), [tracker_urls.py](../apps/frontend/tracker_urls.py) |
| Pure rules | [apps/frontend/tracker_logic.py](../apps/frontend/tracker_logic.py) |
| Snap serialization | [apps/frontend/play_feed.py](../apps/frontend/play_feed.py) |
| Client | [static/js/tracker/](../static/js/tracker/), [templates/games/tracker.html](../templates/games/tracker.html) |
| Caching / storage / pagination | [apps/core/cache.py](../apps/core/cache.py), [storage.py](../apps/core/storage.py), [pagination.py](../apps/core/pagination.py) |
| Migrations | `games/0002_gamestate`, `snaps/0005_snap_undo_metadata` |
