use std::path::{Path, PathBuf};

use crate::bili::client::Settings;

pub fn load_settings(dir: &Path) -> Settings {
    let p = dir.join("settings.json");
    if let Ok(text) = std::fs::read_to_string(&p) {
        if let Ok(s) = serde_json::from_str(&text) {
            return s;
        }
    }
    Settings::default()
}

pub fn save_settings(dir: &Path, s: &Settings) -> Result<(), String> {
    let p = dir.join("settings.json");
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    std::fs::write(p, text).map_err(|e| e.to_string())
}

pub fn app_dir() -> Option<PathBuf> {
    dirs_home().map(|h| h.join(".biliup-analysis"))
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from)
}
