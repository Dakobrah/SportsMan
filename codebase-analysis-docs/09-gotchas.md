# 09 — Gotchas, Pitfalls & Known Issues

← [08 — Deployment](08-deployment.md) | ↑ [INDEX](INDEX.md)

These are confirmed bugs, naming traps, and non-obvious behaviors discovered through development. Refer here before debugging anything unusual.

---

## Critical — Will Crash or Silently Break

### 1. `FieldGoalSnap` uses `kick_distance`, not `distance`

`BaseSnap` has a field called `distance` (yards to first down). `FieldGoalSnap` uses `kick_distance` for the kick length to avoid shadowing the base field.

```python
# CORRECT
FieldGoalSnap.objects.create(kick_distance=42, result='GOOD', ...)

# WRONG — silently saves 0 to kick_distance, sets BaseSnap.distance to 42
FieldGoalSnap.objects.create(distance=42, ...)
```

→ See [apps/snaps/models/special_teams.py](../apps/snaps/models/special_teams.py)

**Note (2026-02-18):** The model now accepts a legacy `distance=` kwarg and maps it to `kick_distance` with a `UserWarning`. This prevents the silent write-to-wrong-field bug while preserving backward compatibility.

---

### 2. `Game` has no direct `team` FK

Access team via `game.season.team`. Filtering by team requires `game__season__team`:

```python
# CORRECT
Game.objects.filter(season__team=team)

# WRONG — FieldError: Cannot resolve keyword 'team' into field
Game.objects.filter(team=team)
```

Similarly in templates, `{{ game.team }}` returns an empty string (silent failure) rather than erroring — making this especially hard to detect.

---

### 3. `Coalesce` must be imported from `django.db.models.functions`

```python
# CORRECT
from django.db.models.functions import Coalesce

# WRONG — ImportError or AttributeError; django.db.models has no Coalesce
from django.db.models import Coalesce
```

---

### 4. Python docstrings inside JavaScript break the entire script

If `"""..."""` triple-quote strings appear inside a `.js` file (e.g., pasted from Python), the browser treats the first `"""` as an unterminated string literal. **The entire script fails to parse** — no event listeners are attached, no network requests fire. The tracker appears "dead" with no error in the network tab.

```javascript
// THIS BREAKS JS — all code after this point is unreachable
function updatePossessionDisplay() {
    """Update the scoreboard display based on possession."""  // ← Python syntax, invalid JS
    ...
}
```

**Diagnosis:** Open browser console. You'll see a SyntaxError at the line with `"""`. **Fix:** Remove the docstring entirely. Use `//` or `/* */` comments in JS.

This was the cause of the tracker being completely non-functional (no hash marks, no button response, nothing in network tab) after a session that mixed Python editing and JS editing.

---

### 5. `DefenseSnap.tackle_yards` vs `BaseSnap.distance`

`BaseSnap.distance` = yards to first down (an offensive concept). `DefenseSnap.tackle_yards` = yards gained by the opposing offense on this play.

Do not confuse them. When advancing ball position after a defense snap, use `tackle_yards`:

```python
# tracker_add_defense (pseudocode)
tackle_yds = play.tackle_yards or 0
new_ball_pos = ball_pos - tackle_yds  # opponent gains → our position moves backward
```

---

### 6. URL namespaces require `app_name` in the module

If `app_name = 'tracker'` is missing from `tracker_urls.py`, all `{% url 'tracker:game_tracker' %}` calls raise `NoReverseMatch`. Django does not tell you which namespace is missing — just that the URL name cannot be resolved.

---

## Important — Behavioral Surprises

### 7. Templates silently swallow missing attributes

`{{ game.team }}` in a template → empty string (no error, no exception).
`Game.objects.filter(team=...)` in Python → `FieldError` crash.

With `DEBUG=False`, template errors produce a bare HTTP 500 with no useful message in the browser. **Always check container logs (`docker compose logs web`)** when seeing unexplained 500s in production.

---

### 8. Django polymorphic query behavior

```python
BaseSnap.objects.all()     # Returns ALL snap types, auto-downcast (slow on large DB)
RunPlay.objects.all()      # Returns ONLY run plays (fast)
snap.get_real_instance()   # Explicitly downcast to most-derived class
```

Polymorphic queries JOIN multiple tables. Avoid `BaseSnap.objects.all()` in hot paths on large datasets. Use the specific subclass manager instead.

---

### 9. Undo reverses score via `get_real_instance()`

`tracker_undo_play` calls `last_snap.get_real_instance()` to determine whether to reverse TD/FG/PAT scoring. If you add new play types with score effects, update the undo logic too.

---

### 10. `possession_team` determines offense vs defense buttons

`resetToPlayTypeSelection()` calls `updatePossessionDisplay()` which shows/hides the offense and defense buttons based on `state.possession_team`. After a turnover, `state.possession_team` must be flipped **before** calling `resetToPlayTypeSelection()`.

```javascript
// CORRECT — flip first, then reset
state.possession_team = state.possession_team === 'home' ? 'away' : 'home';
setTimeout(() => resetToPlayTypeSelection(), 300);

// WRONG — was the original bug: showed defense form regardless of possession
showDefenseForm();   // ← now dead/removed
```

---

### 11. Defense snap opponent play type: two visibility triggers

The `#opponent-play-type-section` div (which appears when yards are > 0) must handle both:

1. **`input` event** on `#tackle_yards` (fires when user types manually)
2. **Quick-yard button click** (does NOT fire `input` — must explicitly update visibility)

If only the `input` event is attached, clicking a quick-yard button (e.g., "+5") will set the yards but the section won't appear.

```javascript
// In showPlayForm('defense') — handles manual typing
tyInput.addEventListener('input', () => {
    oppSection.style.display = parseInt(tyInput.value) !== 0 ? '' : 'none';
});

// In handleFormInteraction quick-yard-btn block — handles button clicks
if (input.id === 'tackle_yards') {
    oppSection.style.display = parseInt(yards) !== 0 ? '' : 'none';
}
```

---

### 12. Docker volumes mount as root

If you add `USER appuser` (non-root user) to the Dockerfile, the `staticfiles` and `media` Docker volumes will be mounted as root and the `web` container will fail to write during `collectstatic`.

**Leave the Dockerfile without a USER directive** when using Docker volumes with write access.

---

### 13. `collectstatic` output not in Git

`staticfiles/` is in `.gitignore`. It is populated at container startup by the entrypoint. Never manually commit `staticfiles/` contents. The `static/` directory (source files) IS tracked.

---

## Moderate — Non-Fatal but Worth Knowing

### 14. Session auth vs JWT — two separate systems

A user logged into the frontend (session cookie) cannot automatically access the API endpoints that require JWT. They are completely separate auth systems. Mobile apps and third-party integrations must obtain a JWT token via `/api/v1/auth/token/`.

---

### 15. Default season seeded only if a team already exists

Migration `0002_seed_default_season.py` uses `RunPython` to create a 2025 season for the first team in the database. If no teams exist at migration time, it is a no-op — no season is created. The season can be created manually via admin or API afterward.

---

### 16. Two-point conversion result choices include `FAIL`

`ExtraPointSnap.Result` has both `MISS` (for PAT kick) and `FAIL` (for 2-point attempt). They are distinct. A missed PAT kick = `MISS`. A stopped 2-point run = `FAIL`. The frontend correctly handles this distinction in `buildExtraPointForm()`.

---

### 17. `nul` file in repo root

A file named `nul` exists at the project root (untracked — not committed to git). This is a Windows artifact from accidentally redirecting output to the NUL device (e.g., `some_command > nul`). It is harmless and safe to delete.

---

### 18. `tracker_coin_toss` and `tracker_defer_decision` are stateless

The coin toss and defer decision endpoints return JSON but do **not** persist anything to the database. The resulting `possession_team` is stored only in `state.possession_team` on the frontend JS. If the page is refreshed mid-game after a coin toss but before any plays are recorded, the coin toss will be shown again.

This is acceptable for the current use case (coaches don't refresh the tracker page mid-game), but would need a `possession` field on `Game` for full persistence.

---

## Minor

### 19. `RunPlay.save()` always overwrites `play_result = RUN`

`RunPlay.save()` forces `play_result = 'RUN'` regardless of what was passed. Same for `PassPlay.save()` (sets `SACK` or `PASS` based on `was_sacked`). Do not try to set these directly.

### 20. `Quarter` is 1-indexed, 5+ for overtime

`BaseSnap.quarter` and `QuarterScore.quarter` use 1–4 for regulation, 5+ for overtime periods. There is no `OT` enum — just integers.

### 21. Player positions affect tracker form player selects

The tracker's `buildPassForm()` filters the QB select to players with `position='QB'`. Adding a new position requires updating both the `Player.Position` TextChoices and any relevant form builder player filters in `tracker.js`.

---

→ Back to [INDEX](INDEX.md)
