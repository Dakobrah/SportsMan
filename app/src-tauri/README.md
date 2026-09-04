# src-tauri

The native shell. Two things here are deliberate and easy to undo by accident.

## The CSP is the privacy guarantee

`tauri.conf.json` sets `app.security.csp` to `default-src 'self'`. Because
`default-src` also constrains `connect-src`, the webview cannot reach the
network at all — no fetch, no XHR, no WebSocket, no remote font or image.

That is what makes "collects nothing" a property of the build rather than a
promise, and it is the basis for the Play Data Safety declaration. Widening
it (adding a CDN, an analytics host, a font provider) breaks that claim and
means the store listing has to change too.

`style-src` additionally allows `'unsafe-inline'` because Vite injects styles
inline during development. That does not weaken the network guarantee.

## SQLite is a local plugin, not tauri-plugin-sql

`src/db.rs` holds a single `rusqlite` connection behind a `Mutex` and exposes
`db_exec`, `db_run`, `db_insert` and `db_select`.

`tauri-plugin-sql` routes every call through an sqlx connection pool, so
`BEGIN` and `COMMIT` issued as separate calls can land on different
connections and a rollback silently does nothing
(tauri-apps/plugins-workspace#886, still open). `recordPlay` depends on the
snap insert, the score update and the cursor write being one atomic unit, so
that was not usable.

One connection also means `execute_batch` runs the multi-statement schema
directly, and serialised access is the right model regardless: this is a
single-user offline app whose only writer is one coach's thumb.
