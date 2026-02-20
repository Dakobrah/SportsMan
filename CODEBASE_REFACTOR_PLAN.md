# Refactor Plan — Split `static/js/tracker.js`

Goal: Improve readability and maintainability by splitting the large `static/js/tracker.js`
into smaller, focused modules without changing runtime behavior.

Approach (safe, incremental):

1. Create `static/js/tracker/modules/` and add modular files containing extracted logic:
   - `field_viz.js` — functions: `updateFieldViz`, `renderFieldHashMarks`, `updateFirstDownLine`, `ballPosDisplay`.
   - `ajax.js` — `getCSRFToken`, `postPlay`, helpers for AJAX payload building.
   - `ui_forms.js` — form builders and show/hide functions for play forms.
   - `coin.js` — coin toss and defer UI flow.

2. Keep a single runtime entrypoint at `static/js/tracker.js` (existing file) and **do not** change template includes.
   - Copy the module code into new files for developer clarity and keep the entrypoint unchanged during the rollout.
   - Verify no behavior change by running tracker pages locally and confirming JS console and UI.

3. Optional next step (requires template change): convert `tracker.js` to a small loader that imports the modules (ES modules), update templates to use `type="module"` script tags, and serve modules directly.

Destructive Action Plan (DAP):
- Scope: changes limited to `static/js/*` and template that includes `tracker.js`.
- Risk: changing script loading could break the tracker UI and live game recording.
- Rollback: keep a git branch with original `static/js/tracker.js`; revert the template to the previous script include.
- Validation: open a game tracker page, run through saving a play, confirm network POSTs and UI updates; run `docker compose logs web` if server errors occur.

Testing:
- Manual QA on local dev server with DEBUG=True: open tracker page, validate coin toss, add run/pass/sack, undo play, confirm scoreboard updates.
- Run unit tests (`pytest -q`) to ensure no server-side regressions.

Estimated time: 1–3 hours, depending on QA thoroughness.

If you want me to proceed with an automatic, non-intrusive first pass I will create the `modules/` copies and keep the existing `tracker.js` entrypoint unchanged. Then we can iterate to make the runtime switch in a follow-up PR.
