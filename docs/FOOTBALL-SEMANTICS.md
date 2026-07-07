# Football Semantics Ledger

**Ruleset: NFHS (high school).** This document is the single source of truth for
every football rule the tracker encodes — what is enforced, what is deliberately
simplified, and what is not modeled. When behavior and this ledger disagree, one
of them is a bug: fix the code or amend the ledger, never let them drift.

Rules live in [apps/frontend/tracker_logic.py](../apps/frontend/tracker_logic.py)
(pure functions, unit-tested in `tests/unit/test_tracker_logic*.py`); field-position
constants are named at the top of that module. Kick landing spots are computed in
`tracker_add_kickoff` ([apps/frontend/tracker.py](../apps/frontend/tracker.py)).

**Status legend:** ✅ enforced · ⚠ simplified (documented approximation) · ❌ not modeled

---

## Coordinate frame

The field is one axis: **−50 = our goal line/endzone · 0 = midfield · +50 = opponent goal line/endzone.**
We score by reaching +50; the opponent scores by driving the ball to −50. "OWN n" = −50 + n; "OPP n" = 50 − n.
All layers share this frame: models, state machine, API payloads, and the JS field renderer.

## Possession & series

| Rule | Status | Behavior |
|---|---|---|
| 4 downs to gain the line to gain | ✅ | Down increments; reaching or passing the line (distance ≤ 0, or the explicit 1st-down toggle) resets the series |
| New series distance | ✅ | 10 yards — or **1st & Goal** (distance = yards to the goal line) inside the 10, in both attack directions (`first_down_distance()`) |
| Line of scrimmage | ✅ | Follows the ball after **every** play — it is where the next snap occurs. The *first-down line* is what stays fixed for a series (client renders it as ball + distance) |
| Turnover on downs | ✅ | Ball over at the spot; new possessor gets 1st & 10/Goal |
| Change of possession (INT / fumble lost / recovery) | ✅ | Ball over at the spot; possession flips via the outcome situation |
| Possession inference | ✅ | Recording an offensive play ⇒ we have the ball; a defensive snap ⇒ opponent does (self-correcting) |
| Kicking team holds possession through a kick phase | ✅ | Lets the server derive the kickoff receiver; the kickoff form still shows an explicit receiver control (needed at the half) |
| Halftime possession (deferral) | ⚠ | Not automatic — the operator sets Q3 and picks the receiver on the kickoff form. The recorded coin-toss choice is stored but not yet used to preselect it |
| Overtime procedure | ❌ | Q5+ renders as "OT"; no possession/spot rules |

## Scoring

| Rule | Status | Behavior |
|---|---|---|
| Touchdown = 6 | ✅ | Detected server-side when ball + yards ≥ +50 (or the TD toggle); ball capped at the goal line; flows into the try |
| Try after TD: kick +1, conversion +2 | ✅ | Both directions — our XP form has kick/2-pt run/2-pt pass; the opponent-TD dialog offers +1, +2, or no good |
| Field goal = 3 | ✅ | GOOD → +3, then we free-kick |
| Safety = 2 to the defense | ✅ | Both directions: our carrier downed at −50 (opponent +2, we free-kick) and their carrier pushed to +50 (`safety_kick`, us +2, they free-kick) |
| Defensive/return TDs | ✅ | Pick-six & fumble-return (defense form), blocked-punt return TD (punt form) — each +6 into the try phase |
| Defense scoring on a try (2-pt return) | ❌ | NFHS rules the ball dead on a change of possession during a try, so this is correct for the ruleset |
| One-point safety on a try | ❌ | Vanishingly rare; record via manual score edit |

## Kicks & field position (NFHS constants)

| Rule | Status | Behavior |
|---|---|---|
| Free kicks (kickoffs, post-score) from the kicking team's **40** | ✅ | `FREE_KICK_SPOT = -10` |
| Free kick after a safety from the **20** | ✅ | `SAFETY_FREE_KICK_SPOT = -30` |
| Kickoff touchback → receiver's **20** | ✅ | ±30 |
| Kickoff out of bounds → receiver's **35** | ✅ | ±15 (NFHS: 25 yards from the kick spot) |
| Punt touchback → receiver's **20** | ✅ | ±30 |
| Kickoff return yardage | ⚠ | Not captured — a fielded kickoff is assumed returned out to the receiver's 20. `kick_yards` is recorded for stats only |
| Punt return yardage | ⚠ | Not captured — opponent takes over where the punt lands (LOS + punt distance) |
| Onside kick | ⚠ | Recovery (by us / by them) and possession are enforced; the spot uses the standard landing constant rather than kick spot + 10, and the 10-yard legality is not checked |
| Blocked punt | ⚠ | Live ball at the LOS, recoverable by either side or returned for TD. Not modeled: a kicking-team recovery short of the line to gain should be a turnover on downs (currently always a fresh series) |
| Missed/blocked FG | ⚠ | Opponent ball at the spot of the snap, or their 20 when attempted from inside it (short misses reach the endzone → NFHS touchback). Spot-of-*kick* (7 yards deeper) and block returns are not modeled |

## Penalties

The penalty state machine works in the **our-offense frame** — it assumes we have
the ball. `on_offense=true` means the foul is on our offense.

| Rule | Status | Behavior |
|---|---|---|
| Accepted penalty replays the down | ✅ | Yardage applied, same down |
| **Half the distance to the goal** | ✅ | Enforcement capped at half the distance to the penalized team's goal line, both directions |
| Automatic first down | ✅ | Flag on the penalty (or distance wiped out) → fresh series |
| **Loss of down** (intentional grounding) | ✅ | Yardage plus the down; on 4th down it becomes a turnover on downs |
| Declined penalty | ⚠ | Modeled as "no play, replay the down." Real rule: the play's result stands — the operator should record the actual play as its own snap and log the penalty only if accepted |
| Spot fouls (DPI) | ⚠ | `spot_foul` is data-only; the operator enters the enforcement yardage manually |
| Penalties while the opponent has the ball | ❌ | The our-offense frame can't express them — known limitation, on the roadmap ([DESIGN-live-tracker.md](DESIGN-live-tracker.md) §11) |
| Offsetting penalties | ❌ | Record as declined (replay the down) |

## Clock & game flow

| Rule | Status | Behavior |
|---|---|---|
| Quarters, OT label | ✅ | Manual quarter control, persisted server-side |
| Game clock / play clock | ❌ | `BaseSnap.game_clock` exists but has no UI (roadmap) |
| 12-minute NFHS quarters, halftime, kneel-downs, spikes | ❌ | Untimed by design; kneels/spikes record as ordinary runs/incomplete passes |

---

## How to change a rule

1. Amend this ledger first — it is the spec.
2. Change the pure function in `tracker_logic.py` (or the named constant).
3. Pin it with a test in `tests/unit/test_tracker_logic_outcomes.py`
   (`TestFootballSemantics`) — every ✅ row above should have one.
4. If the rule affects operator input, update the form in
   `static/js/tracker/forms.js` and the flow in `flow.js`/`modals.js`.

Switching rulesets (e.g. NFL) should only require the constants block at the top
of `tracker_logic.py`, the kickoff spots in `tracker_add_kickoff`, and the
affected ledger rows.
