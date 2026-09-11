#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bili;
mod commands;
mod store;

use std::sync::Arc;

use bili::fans::MonitorRegistry;
use tauri::Manager;
use tokio::sync::Mutex;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| store::app_dir().unwrap_or_else(|| std::env::temp_dir()));
            let _ = std::fs::create_dir_all(dir.join("monitor"));

            let settings = store::load_settings(&dir);
            let client = Arc::new(bili::BiliClient::new(settings));

            let mut monitors = MonitorRegistry::default();
            monitors.data_dir = Mutex::new(Some(dir.join("monitor")));

            app.manage(commands::AppState {
                client,
                monitors: Arc::new(monitors),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::test_cookie,
            commands::fetch_guard,
            commands::fetch_uid_batch,
            commands::start_fans_monitor,
            commands::stop_fans_monitor,
            commands::get_fans_record,
            commands::fetch_wordfreq,
            commands::save_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
