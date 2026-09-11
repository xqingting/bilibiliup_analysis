use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::Emitter;
use tokio::sync::Mutex;

use super::error::Result;
use super::BiliClient;

const MAX_PAGES: u64 = 20; // 粉丝列表接口最多暴露约前1000个，20页 x 50

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FansRecord {
    pub uid: u64,
    pub anchor_name: String,
    /// 已知粉丝 mid -> 昵称（仅登录后更新；匿名模式为空）
    pub known: HashMap<String, String>,
    /// 历史快照
    pub records: Vec<FansSnapshot>,
    /// 新增粉丝日志
    pub new_log: Vec<FansNew>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FansSnapshot {
    pub time: String,
    pub follower: u64,
    pub new_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FansNew {
    pub time: String,
    pub mid: u64,
    pub uname: String,
}

pub struct MonitorHandle {
    pub stop: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct MonitorRegistry {
    pub handles: Mutex<HashMap<u64, Arc<MonitorHandle>>>,
    pub states: Mutex<HashMap<u64, FansRecord>>,
    pub data_dir: Mutex<Option<PathBuf>>,
}

fn now_str() -> String {
    Local::now().format("%Y/%m/%d %H:%M:%S").to_string()
}

fn record_path(dir: &Option<PathBuf>, uid: u64) -> Option<PathBuf> {
    dir.as_ref().map(|d| d.join(format!("monitor_{uid}.json")))
}

pub async fn load_record(dir: &Option<PathBuf>, uid: u64) -> FansRecord {
    if let Some(p) = record_path(dir, uid) {
        if let Ok(text) = tokio::fs::read_to_string(p).await {
            if let Ok(r) = serde_json::from_str::<FansRecord>(&text) {
                return r;
            }
        }
    }
    FansRecord {
        uid,
        ..Default::default()
    }
}

pub async fn save_record(dir: &Option<PathBuf>, record: &FansRecord) {
    if let Some(p) = record_path(dir, record.uid) {
        if let Some(parent) = p.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        if let Ok(text) = serde_json::to_string_pretty(record) {
            let _ = tokio::fs::write(p, text).await;
        }
    }
}

/// 拉取粉丝列表快照（需登录；匿名时返回 None）
async fn fetch_follower_map(client: &BiliClient, uid: u64) -> Result<Option<HashMap<String, String>>> {
    if !client.has_login().await {
        return Ok(None);
    }
    let mut map = HashMap::new();
    for pn in 1..=MAX_PAGES {
        let params = vec![
            ("vmid".to_string(), uid.to_string()),
            ("pn".to_string(), pn.to_string()),
            ("ps".to_string(), "50".into()),
            ("order".to_string(), "desc".into()),
        ];
        let v = match client
            .get_json_wbi("https://api.bilibili.com/x/relation/followers", params, &format!("https://space.bilibili.com/{uid}/"))
            .await
        {
            Ok(v) => v,
            Err(super::error::BiliError::RiskBlocked(_)) => break,
            Err(e) => {
                if pn == 1 {
                    return Err(e);
                }
                break;
            }
        };
        let list = v["data"]["list"].as_array().cloned().unwrap_or_default();
        if list.is_empty() {
            break;
        }
        for f in &list {
            let mid = f["mid"].as_u64().unwrap_or(0).to_string();
            let uname = f["uname"].as_str().unwrap_or("").to_string();
            if !mid.is_empty() && mid != "0" {
                map.insert(mid, uname);
            }
        }
        if list.len() < 50 {
            break;
        }
    }
    Ok(Some(map))
}

async fn fetch_follower_count(client: &BiliClient, uid: u64) -> u64 {
    if let Ok(v) = client
        .get_json(
            "https://api.bilibili.com/x/relation/stat",
            &[("vmid".to_string(), uid.to_string())],
            &format!("https://space.bilibili.com/{uid}/"),
            false,
        )
        .await
    {
        return v["data"]["follower"].as_u64().unwrap_or(0);
    }
    0
}

/// 主播昵称（失败时回退为 uid）
async fn fetch_anchor_name(client: &BiliClient, uid: u64) -> String {
    if let Ok(v) = client
        .get_json(
            "https://api.bilibili.com/x/web-interface/card",
            &[
                ("mid".to_string(), uid.to_string()),
                ("photo".to_string(), "false".into()),
            ],
            &format!("https://space.bilibili.com/{uid}/"),
            false,
        )
        .await
    {
        return v["data"]["card"]["name"].as_str().unwrap_or("").to_string();
    }
    String::new()
}

/// 启动一个监控循环（spawn 到 tauri runtime）
pub async fn spawn_monitor(
    app: tauri::AppHandle,
    client: Arc<BiliClient>,
    registry: Arc<MonitorRegistry>,
    uid: u64,
    interval_secs: u64,
) {
    let stop = Arc::new(AtomicBool::new(false));
    let handle = Arc::new(MonitorHandle {
        stop: stop.clone(),
    });
    registry.handles.lock().await.insert(uid, handle.clone());
    {
        let mut states = registry.states.lock().await;
        if !states.contains_key(&uid) {
            let dir = registry.data_dir.lock().await.clone();
            states.insert(uid, load_record(&dir, uid).await);
        }
    }

    let anchor = fetch_anchor_name(&client, uid).await;
    {
        let mut states = registry.states.lock().await;
        if let Some(rec) = states.get_mut(&uid) {
            if rec.anchor_name.is_empty() {
                rec.anchor_name = anchor.clone();
            }
        }
    }
    let _ = app.emit(
        "fans-event",
        json!({"uid": uid, "kind": "started", "anchor_name": anchor, "time": now_str()}),
    );

    let dir = registry.data_dir.lock().await.clone();
    let mut first_cycle = true;
    loop {
        if stop.load(Ordering::Relaxed) {
            break;
        }
        let has_login = client.has_login().await;
        let (follower, list) = tokio::join!(
            fetch_follower_count(&client, uid),
            fetch_follower_map(&client, uid)
        );

        let mut new_fans: Vec<FansNew> = Vec::new();
        let mut baseline = false;
        {
            let mut states = registry.states.lock().await;
            let rec = states.entry(uid).or_insert_with(FansRecord::default);
            rec.uid = uid;
            if rec.anchor_name.is_empty() {
                rec.anchor_name = anchor.clone();
            }
            if let Ok(Some(map)) = &list {
                if first_cycle && rec.known.is_empty() && !map.is_empty() {
                    // 首轮做基线，不把已有粉丝当新增
                    rec.known = map.clone();
                    baseline = true;
                } else if !map.is_empty() {
                    let ts = now_str();
                    for (mid, uname) in map.iter() {
                        if !rec.known.contains_key(mid) {
                            new_fans.push(FansNew {
                                time: ts.clone(),
                                mid: mid.parse().unwrap_or(0),
                                uname: uname.clone(),
                            });
                            rec.known.insert(mid.clone(), uname.clone());
                        }
                    }
                }
            }
            rec.records.push(FansSnapshot {
                time: now_str(),
                follower,
                new_count: new_fans.len() as u64,
            });
            if rec.records.len() > 2000 {
                rec.records.drain(..rec.records.len() - 2000);
            }
            rec.new_log.extend(new_fans.iter().cloned());
            if rec.new_log.len() > 5000 {
                let cut = rec.new_log.len() - 5000;
                rec.new_log.drain(..cut);
            }
        }
        let record_snapshot = {
            let states = registry.states.lock().await;
            states.get(&uid).cloned().unwrap_or_default()
        };
        save_record(&dir, &record_snapshot).await;

        let known_count = record_snapshot.known.len() as u64;
        let _ = app.emit(
            "fans-event",
            json!({
                "uid": uid,
                "kind": if baseline { "baseline" } else { "update" },
                "time": now_str(),
                "follower": follower,
                "known_count": known_count,
                "new_fans": new_fans,
                "logged_in": has_login,
                "records": record_snapshot.records.iter().rev().take(200).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>(),
                "recent_new": record_snapshot.new_log.iter().rev().take(200).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>(),
            }),
        );
        first_cycle = false;

        // 分片睡眠，便于及时响应停止
        let total = interval_secs.max(60);
        let mut waited = 0u64;
        while waited < total {
            if stop.load(Ordering::Relaxed) {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            waited += 2;
        }
    }
    registry.handles.lock().await.remove(&uid);
    let _ = app.emit("fans-event", json!({"uid": uid, "kind": "stopped", "time": now_str()}));
}
