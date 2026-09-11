use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::error::Result;
use super::BiliClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardEntry {
    pub uid: u64,
    pub username: String,
    pub face: String,
    /// 1=舰长 2=提督 3=总督
    pub guard_level: u8,
    pub medal_name: String,
    pub medal_level: u32,
    pub medal_target_id: u64,
    pub medal_color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardResult {
    pub room_id: u64,
    pub short_room_id: u64,
    pub ruid: u64,
    pub anchor_name: String,
    pub live_status: u32,
    pub total: u64,
    pub entries: Vec<GuardEntry>,
}



/// 把用户输入解析成房间号：支持纯数字、live.bilibili.com/xxx、含 h5 的链接
pub fn parse_room_input(input: &str) -> Option<u64> {
    let s = input.trim();
    if s.is_empty() {
        return None;
    }
    if let Ok(n) = s.parse::<u64>() {
        return Some(n);
    }
    // 从 URL 中抠出路径里第一段数字
    let path = s
        .split("live.bilibili.com")
        .nth(1)
        .unwrap_or(s);
    path.split(&['/', '?', '&', '#'][..])
        .find_map(|seg| seg.parse::<u64>().ok())
}

/// 抓取完整航海榜（大航海名单）
pub async fn fetch_guard_list(client: &BiliClient, room_input: &str) -> Result<GuardResult> {
    let room_raw = parse_room_input(room_input)
        .ok_or_else(|| anyhow_room())?;

    client.ensure_visitor_cookies().await;

    // 解析真实房间号与主播UID
    let info = client
        .get_json(
            "https://api.live.bilibili.com/room/v1/Room/get_info",
            &[("room_id".to_string(), room_raw.to_string())],
            "https://live.bilibili.com/",
            false,
        )
        .await?;
    let room_id = info["data"]["room_id"].as_u64().unwrap_or(room_raw);
    let short_room_id = info["data"]["short_id"].as_u64().unwrap_or(0);
    let ruid = info["data"]["uid"]
        .as_u64()
        .ok_or_else(|| super::error::BiliError::Parse("get_info 响应缺少主播uid".into()))?;
    let live_status = info["data"]["live_status"].as_u64().unwrap_or(0) as u32;

    // 主播昵称（匿名可用）
    let anchor_name = match client
        .get_json(
            "https://api.bilibili.com/x/web-interface/card",
            &[("mid".to_string(), ruid.to_string()), ("photo".to_string(), "false".into())],
            "https://space.bilibili.com/",
            false,
        )
        .await
    {
        Ok(v) => v["data"]["card"]["name"]
            .as_str()
            .unwrap_or("未知主播")
            .to_string(),
        Err(_) => "未知主播".to_string(),
    };

    let mut entries: Vec<GuardEntry> = Vec::new();
    let mut page = 1u64;
    let mut total = 0u64;
    let page_size = 29u64;

    loop {
        let params = vec![
            ("roomid".to_string(), room_id.to_string()),
            ("ruid".to_string(), ruid.to_string()),
            ("page_size".to_string(), page_size.to_string()),
            ("page".to_string(), page.to_string()),
        ];
        let v = client
            .get_json(
                "https://api.live.bilibili.com/xlive/app-room/v2/guardTab/topList",
                &params,
                "https://live.bilibili.com/",
                false,
            )
            .await?;
        let data = &v["data"];
        if page == 1 {
            total = data["info"]["num"].as_u64().unwrap_or(0);
            for e in data["top3"].as_array().cloned().unwrap_or_default() {
                entries.push(parse_guard_entry(&e));
            }
        }
        let list = data["list"].as_array().cloned().unwrap_or_default();
        let got = list.len();
        for e in list {
            entries.push(parse_guard_entry(&e));
        }
        let pages = data["info"]["page"].as_u64().unwrap_or(1);
        page += 1;
        if got == 0 || page > pages || entries.len() as u64 >= total || page > 200 {
            break;
        }
    }

    // 去重（top3 与 list 可能重叠）
    let mut seen = std::collections::HashSet::new();
    entries.retain(|e| seen.insert(e.uid));

    Ok(GuardResult {
        room_id,
        short_room_id,
        ruid,
        anchor_name,
        live_status,
        total: entries.len() as u64,
        entries,
    })
}

fn anyhow_room() -> super::error::BiliError {
    super::error::BiliError::Parse("无法识别房间号，请输入数字房间号或直播间链接".into())
}

fn parse_guard_entry(e: &Value) -> GuardEntry {
    let medal = &e["medal_info"];
    GuardEntry {
        uid: e["uid"].as_u64().unwrap_or(0),
        username: e["username"].as_str().unwrap_or("").to_string(),
        face: e["face"].as_str().unwrap_or("").to_string(),
        guard_level: e["guard_level"].as_u64().unwrap_or(1) as u8,
        medal_name: medal["medal_name"].as_str().unwrap_or("").to_string(),
        medal_level: medal["medal_level"].as_u64().unwrap_or(0) as u32,
        medal_target_id: medal["target_id"].as_u64().unwrap_or(0),
        medal_color: format!(
            "#{:06x}",
            medal["medal_color_start"].as_u64().unwrap_or(0) & 0xFFFFFF
        ),
    }
}
