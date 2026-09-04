mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            db::init(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::db_exec,
            db::db_run,
            db::db_insert,
            db::db_select
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sportsman");
}
