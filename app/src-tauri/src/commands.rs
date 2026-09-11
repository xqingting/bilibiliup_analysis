use std::collections::HashMap;
use std::sync::Arc;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::bili::client::{BiliClient, Settings};
use crate::bili::fans::{self, MonitorRegistry};
use crate::bili::guard;
use crate::bili::space;
use crate::bili::wordfreq::{self, FreqMode};
use crate::store;

pub struct AppState {
    pub client: Arc<BiliClient>,
    pub monitors: Arc<MonitorRegistry>,
}

#[derive(Serialize, Clone)]
struct ProgressEvent {
    task: String,
    done: usize,
    total: usize,
    message: String,
}

// ---------- 设置 ----------

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    Ok(state.client.settings().await)
}

#[tauri::command]
pub async fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<(), String> {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| {
        store::app_dir().unwrap_or_else(|| std::env::temp_dir())
    });
    store::save_settings(&dir, &settings)?;
    state.client.update_settings(settings).await;
    Ok(())
}

#[tauri::command]
pub async fn test_cookie(state: State<'_, AppState>) -> Result<Value, String> {
    state.client.ensure_visitor_cookies().await;
    match state
        .client
        .get_json(
            "https://api.bilibili.com/x/web-interface/nav",
            &[],
            "https://www.bilibili.com/",
            false,
        )
        .await
    {
        Ok(v) => Ok(json!({
            "logged_in": v["data"]["isLogin"].as_bool().unwrap_or(false),
            "uname": v["data"]["uname"].as_str().unwrap_or(""),
            "mid": v["data"]["mid"].as_u64().unwrap_or(0),
            "vip_type": v["data"]["vipType"].as_i64().unwrap_or(0),
        })),
        Err(e) => Err(e.to_display()),
    }
}

// ---------- 航海榜 ----------

#[tauri::command]
pub async fn fetch_guard(
    app: AppHandle,
    state: State<'_, AppState>,
    room_input: String,
) -> Result<Value, String> {
    let client = state.client.clone();
    let result = guard::fetch_guard_list(&client, &room_input)
        .await
        .map_err(|e| e.to_display())?;
    let _ = app.emit(
        "task-progress",
        ProgressEvent {
            task: "guard".into(),
            done: result.entries.len(),
            total: result.entries.len(),
            message: format!("共抓取 {} 个大航海", result.entries.len()),
        },
    );
    serde_json::to_value(result).map_err(|e| e.to_string())
}

// ---------- UID 批量抓取 ----------

#[tauri::command]
pub async fn fetch_uid_batch(
    app: AppHandle,
    state: State<'_, AppState>,
    mids: Vec<u64>,
) -> Result<Value, String> {
    let client = state.client.clone();
    let total = mids.len();
    let mut records: Vec<Value> = Vec::new();
    let mut failed: Vec<Value> = Vec::new();

    for (i, mid) in mids.iter().enumerate() {
        match space::fetch_user(&client, *mid).await {
            Ok(r) => {
                let mut v = r.to_legacy_json();
                v["source"] = json!(if r.source == space::SourceLevel::Full { "full" } else { "card" });
                records.push(v);
                let _ = app.emit(
                    "task-progress",
                    ProgressEvent {
                        task: "uid".into(),
                        done: i + 1,
                        total,
                        message: format!("{} (uid {}) ✓", r.name, mid),
                    },
                );
            }
            Err(e) => {
                failed.push(json!({"uid": mid, "error": e.to_display()}));
                let _ = app.emit(
                    "task-progress",
                    ProgressEvent {
                        task: "uid".into(),
                        done: i + 1,
                        total,
                        message: format!("uid {} 失败: {}", mid, e.to_display()),
                    },
                );
            }
        }
    }
    Ok(json!({"records": records, "failed": failed}))
}

// ---------- 粉丝监控 ----------

#[tauri::command]
pub async fn start_fans_monitor(
    app: AppHandle,
    state: State<'_, AppState>,
    uid: u64,
    interval_secs: u64,
) -> Result<(), String> {
    {
        let handles = state.monitors.handles.lock().await;
        if handles.contains_key(&uid) {
            return Err("该主播已在监控中".into());
        }
    }
    if state.monitors.data_dir.lock().await.is_none() {
        let dir = app.path().app_data_dir().unwrap_or_else(|_| {
            store::app_dir().unwrap_or_else(|| std::env::temp_dir())
        });
        *state.monitors.data_dir.lock().await = Some(dir.join("monitor"));
    }
    let client = state.client.clone();
    let registry = state.monitors.clone();
    tauri::async_runtime::spawn(async move {
        fans::spawn_monitor(app.clone(), client, registry, uid, interval_secs).await;
    });
    Ok(())
}

#[tauri::command]
pub async fn stop_fans_monitor(state: State<'_, AppState>, uid: u64) -> Result<(), String> {
    let handles = state.monitors.handles.lock().await;
    if let Some(h) = handles.get(&uid) {
        h.stop.store(true, std::sync::atomic::Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
pub async fn get_fans_record(app: AppHandle, uid: u64) -> Result<Value, String> {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| {
        store::app_dir().unwrap_or_else(|| std::env::temp_dir())
    });
    let dir = dir.join("monitor");
    let record = fans::load_record(&Some(dir), uid).await;
    serde_json::to_value(record).map_err(|e| e.to_string())
}

// ---------- 词频 ----------

#[tauri::command]
pub async fn fetch_wordfreq(
    app: AppHandle,
    state: State<'_, AppState>,
    mode: String,
    mids: Vec<u64>,
) -> Result<Value, String> {
    let freq_mode = match mode.as_str() {
        "archive" => FreqMode::Archive,
        "like" => FreqMode::Like,
        "coin" => FreqMode::Coin,
        "bangumi" => FreqMode::Bangumi,
        other => return Err(format!("未知词频模式: {other}")),
    };
    let client = state.client.clone();
    let total = mids.len();
    let mut total_freq: HashMap<String, u64> = HashMap::new();
    let mut per_uid: HashMap<String, Value> = HashMap::new();
    let mut skipped: Vec<Value> = Vec::new();
    let mut ok_count = 0usize;

    for (i, mid) in mids.iter().enumerate() {
        match wordfreq::fetch_user_freq(&client, freq_mode, *mid).await {
            Ok(f) => {
                ok_count += 1;
                per_uid.insert(mid.to_string(), json!(f));
                for (w, c) in &f {
                    *total_freq.entry(w.clone()).or_insert(0) += c;
                }
                let _ = app.emit(
                    "task-progress",
                    ProgressEvent {
                        task: "freq".into(),
                        done: i + 1,
                        total,
                        message: format!("uid {} ✓", mid),
                    },
                );
            }
            Err(e) => {
                skipped.push(json!({"uid": mid, "error": e.to_display()}));
                let _ = app.emit(
                    "task-progress",
                    ProgressEvent {
                        task: "freq".into(),
                        done: i + 1,
                        total,
                        message: format!("uid {} 跳过: {}", mid, e.to_display()),
                    },
                );
            }
        }
    }
    let items: Vec<Value> = wordfreq::sorted(&total_freq)
        .into_iter()
        .map(|it| json!({"word": it.word, "count": it.count}))
        .collect();
    Ok(json!({
        "mode": mode,
        "items": items,
        "per_uid": per_uid,
        "skipped": skipped,
        "ok_count": ok_count,
    }))
}

// ---------- 文件导出 ----------

#[tauri::command]
pub async fn save_text_file(
    app: AppHandle,
    default_name: String,
    contents: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let app2 = app.clone();
    let name = default_name;
    let handle = tauri::async_runtime::spawn_blocking(move || {
        app2.dialog()
            .file()
            .set_file_name(&name)
            .blocking_save_file()
    })
    .await
    .map_err(|e| e.to_string())?;

    match handle {
        Some(file_path) => {
            let path = file_path.into_path().map_err(|e| e.to_string())?;
            std::fs::write(&path, contents).map_err(|e| e.to_string())?;
            Ok(Some(path.display().to_string()))
        }
        None => Ok(None),
    }
}
