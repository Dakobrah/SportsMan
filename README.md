# SportsMan

A football play-by-play tracker for one team's sideline. It runs as a desktop
app, keeps every game in a SQLite database on the device, and never touches the
network: no accounts, no server, no analytics.

**Try it:** a playable browser demo, with a game already recorded, is on
[playedu.games](https://playedu.games/products/sportsman).

Built with Svelte 5, TypeScript and Vite, and packaged with Tauri v2.

## Layout

Everything lives in `app/`.

| Path | What |
|---|---|
| `src/lib/game/` | the rules: field position, down and distance, scoring, what follows each play |
| `src/lib/db/` | schema, migrations, repositories, report queries, and the two drivers: `tauri.ts` for the desktop, `web.ts` (sql.js) for the demo |
| `src/lib/reports/` | drive segmentation, metrics, and the report templates |
| `src/lib/backup/` | backup and restore, the only copy a local-only app has |
| `src/lib/playbook/` | formations and play calls, with import and export |
| `src/lib/demo/` | the recorded game the demo opens with |
| `src/lib/components/` | the tracker, charts, and shared UI |
| `src/routes/` | screens |
| `src-tauri/` | the desktop shell |
| `tests/` | Vitest suites |

`src/main.ts` is the desktop entry point and `src/demo.ts` the browser demo's.
Neither imports the other's database driver, so the desktop bundle carries no
sql.js and the demo carries no Tauri code.

## Develop

You need Node 26 (the tests use its built-in `node:sqlite`) and, for the
desktop app, the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
cd app
npm ci
npm run app          # desktop app with hot reload
npm test             # Vitest, against real SQLite rather than mocks
npm run check        # svelte-check and tsc
npm run build:demo   # browser demo into dist-demo/
npm run app:build    # desktop installers: msi, nsis, deb, AppImage
```

## Conventions

- **Field position has one definition**, in `src/lib/game/field.ts`: -50 is our
  own goal line, 0 is midfield, +50 is the opponent's. Never write a bare
  yard-line number anywhere else.
- **Snaps are one flat table** with a `kind` column, not a class hierarchy, so
  no report needs a join.
- **No analytics, crash-reporting or ad SDKs.** Keeping everything local is the
  privacy promise.

## History

The first SportsMan was a Django REST API with a server-rendered tracker. It was
rebuilt as this app and removed from the tree in September 2026; the Django
code is in git history. Comments that say "Django did X" explain what the port
changed, and `tests/game/nextState.parity.test.ts` still checks the rules
against output recorded from the Django version.
