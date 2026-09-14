//! The on-device database.
//!
//! This is deliberately not `tauri-plugin-sql`. That plugin routes every call
//! through an sqlx connection pool, so `BEGIN` and `COMMIT` issued as separate
//! calls can land on different connections and a rollback silently does
//! nothing (tauri-apps/plugins-workspace#886, open). `recordPlay` depends on
//! the snap insert, the score update and the cursor write being one atomic
//! unit, so correctness there is not negotiable.
//!
//! One `rusqlite` connection behind a `Mutex` instead. Transactions are then
//! correct by construction — there is only one connection to begin them on —
//! and `execute_batch` runs the multi-statement schema SQL directly, so no
//! statement splitter is needed. Serialised access is the right model anyway:
//! this is a single-user offline app, and the only writer is one coach's
//! thumb.

use std::fs;
use std::sync::Mutex;

use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::Connection;
use serde_json::{Map, Number, Value as Json};
use tauri::{AppHandle, Manager, Runtime, State};

const DATABASE_FILE: &str = "sportsman.db";

pub struct Db(pub Mutex<Connection>);

/// Open (creating on first run) the database in the platform app-data
/// directory. Called once from `setup`, so by the time the webview loads the
/// connection is already live.
pub fn init<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let dir = app.path().app_data_dir()?;
    fs::create_dir_all(&dir)?;

    let conn = Connection::open(dir.join(DATABASE_FILE))?;
    conn.pragma_update(None, "foreign_keys", true)?;
    // journal_mode returns a row, so it cannot go through pragma_update.
    conn.query_row("PRAGMA journal_mode = WAL", [], |row| row.get::<_, String>(0))?;

    app.manage(Db(Mutex::new(conn)));
    Ok(())
}

fn to_sql(value: &Json) -> Result<SqlValue, String> {
    Ok(match value {
        Json::Null => SqlValue::Null,
        // SQLite has no boolean type; the schema stores 0/1 INTEGERs.
        Json::Bool(b) => SqlValue::Integer(i64::from(*b)),
        Json::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else if let Some(f) = n.as_f64() {
                SqlValue::Real(f)
            } else {
                return Err(format!("unsupported number: {n}"));
            }
        }
        Json::String(s) => SqlValue::Text(s.clone()),
        other => return Err(format!("cannot bind {other} as a SQL parameter")),
    })
}

fn bind(params: &[Json]) -> Result<Vec<SqlValue>, String> {
    params.iter().map(to_sql).collect()
}

fn from_sql(value: ValueRef<'_>) -> Json {
    match value {
        ValueRef::Null => Json::Null,
        ValueRef::Integer(i) => Json::Number(i.into()),
        ValueRef::Real(f) => Number::from_f64(f).map(Json::Number).unwrap_or(Json::Null),
        ValueRef::Text(t) => Json::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(_) => Json::Null,
    }
}

/// Run a script of several statements. Used by the migration runner.
#[tauri::command]
pub fn db_exec(db: State<'_, Db>, sql: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute_batch(&sql).map_err(|e| e.to_string())
}

/// Run one statement for its effect, returning the number of rows changed.
#[tauri::command]
pub fn db_run(db: State<'_, Db>, sql: String, params: Vec<Json>) -> Result<usize, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(&sql, rusqlite::params_from_iter(bind(&params)?))
        .map_err(|e| e.to_string())
}

/// Insert a row and return its new id.
#[tauri::command]
pub fn db_insert(db: State<'_, Db>, sql: String, params: Vec<Json>) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(&sql, rusqlite::params_from_iter(bind(&params)?))
        .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

/// Every matching row, as an array of column-keyed objects.
#[tauri::command]
pub fn db_select(
    db: State<'_, Db>,
    sql: String,
    params: Vec<Json>,
) -> Result<Vec<Map<String, Json>>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let names: Vec<String> = stmt.column_names().into_iter().map(String::from).collect();

    let mut rows = stmt
        .query(rusqlite::params_from_iter(bind(&params)?))
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut object = Map::with_capacity(names.len());
        for (index, name) in names.iter().enumerate() {
            let value = row.get_ref(index).map_err(|e| e.to_string())?;
            object.insert(name.clone(), from_sql(value));
        }
        out.push(object);
    }
    Ok(out)
}
