use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::error::Result;
use super::BiliClient;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FreqMode {
    /// 投稿视频分区词频（需登录Cookie较稳）
    Archive,
    /// 点赞视频分区词频（匿名可用，用户隐私公开时）
    Like,
    /// 投币视频分区词频（匿名可用）
    Coin,
    /// 追番标题词频（匿名可用）
    Bangumi,
}


#[derive(Debug, Clone, Serialize)]
pub struct WordFreqItem {
    pub word: String,
    pub count: u64,
}

/// 抓取单个用户的词频
pub async fn fetch_user_freq(
    client: &BiliClient,
    mode: FreqMode,
    mid: u64,
) -> Result<HashMap<String, u64>> {
    let referer = format!("https://space.bilibili.com/{mid}/");
    let mut freq: HashMap<String, u64> = HashMap::new();
    match mode {
        FreqMode::Like => {
            let v = client
                .get_json(
                    "https://api.bilibili.com/x/space/like/video",
                    &[("vmid".to_string(), mid.to_string())],
                    &referer,
                    false,
                )
                .await?;
            for video in v["data"]["list"].as_array().cloned().unwrap_or_default() {
                if let Some(t) = video["tname"].as_str() {
                    *freq.entry(t.to_string()).or_insert(0) += 1;
                }
            }
        }
        FreqMode::Coin => {
            let v = client
                .get_json(
                    "https://api.bilibili.com/x/space/coin/video",
                    &[("vmid".to_string(), mid.to_string())],
                    &referer,
                    false,
                )
                .await?;
            for video in v["data"].as_array().cloned().unwrap_or_default() {
                if let Some(t) = video["tname"].as_str() {
                    *freq.entry(t.to_string()).or_insert(0) += 1;
                }
            }
        }
        FreqMode::Bangumi => {
            for pn in 1..=5u64 {
                let params = vec![
                    ("vmid".to_string(), mid.to_string()),
                    ("pn".to_string(), pn.to_string()),
                    ("ps".to_string(), "30".into()),
                    ("type".to_string(), "1".into()),
                ];
                let v = client
                    .get_json_wbi("https://api.bilibili.com/x/space/bangumi/follow/list", params, &referer)
                    .await?;
                let list = v["data"]["list"].as_array().cloned().unwrap_or_default();
                let got = list.len();
                for season in list {
                    if let Some(t) = season["title"].as_str() {
                        *freq.entry(t.to_string()).or_insert(0) += 1;
                    }
                }
                if got < 30 {
                    break;
                }
            }
        }
        FreqMode::Archive => {
            for pn in 1..=10u64 {
                let params = vec![
                    ("mid".to_string(), mid.to_string()),
                    ("pn".to_string(), pn.to_string()),
                    ("ps".to_string(), "30".into()),
                    ("order".to_string(), "pubdate".into()),
                ];
                let v = client
                    .get_json_wbi("https://api.bilibili.com/x/space/wbi/arc/search", params, &referer)
                    .await?;
                let vlist = v["data"]["list"]["vlist"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default();
                let got = vlist.len();
                for video in vlist {
                    if let Some(t) = video["tname"].as_str() {
                        *freq.entry(t.to_string()).or_insert(0) += 1;
                    }
                }
                if got < 30 {
                    break;
                }
            }
        }
    }
    Ok(freq)
}

/// 把词频 map 排序导出
pub fn sorted(freq: &HashMap<String, u64>) -> Vec<WordFreqItem> {
    let mut items: Vec<WordFreqItem> = freq
        .iter()
        .map(|(w, c)| WordFreqItem {
            word: w.clone(),
            count: *c,
        })
        .collect();
    items.sort_by(|a, b| b.count.cmp(&a.count).then(a.word.cmp(&b.word)));
    items
}
