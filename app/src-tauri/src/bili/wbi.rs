use std::time::{Duration, Instant};

use md5::{Digest, Md5};
use serde_json::Value;

use super::error::{BiliError, Result};

/// Wbi 签名的字符置换表（来自 bilibili-API-collect）
const MIXIN_TAB: [usize; 64] = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29,
    28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25,
    54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

const CACHE_TTL: Duration = Duration::from_secs(20 * 60);

#[derive(Clone)]
pub struct WbiKeys {
    pub mixin_key: String,
}

#[derive(Default)]
pub struct WbiCache {
    keys: Option<WbiKeys>,
    fetched_at: Option<Instant>,
}

impl WbiCache {
    pub fn get(&mut self) -> Option<WbiKeys> {
        match (&self.keys, self.fetched_at) {
            (Some(k), Some(t)) if t.elapsed() < CACHE_TTL => Some(k.clone()),
            _ => None,
        }
    }

    pub fn store(&mut self, keys: WbiKeys) {
        self.keys = Some(keys);
        self.fetched_at = Some(Instant::now());
    }

    pub fn invalidate(&mut self) {
        self.keys = None;
        self.fetched_at = None;
    }
}

fn get_mixin_key(img_sub: &str) -> String {
    img_sub
        .as_bytes()
        .get(..64)
        .map(|raw| {
            MIXIN_TAB
                .iter()
                .filter_map(|&i| raw.get(i).map(|&b| b as char))
                .collect::<String>()
                .chars()
                .take(32)
                .collect::<String>()
        })
        .unwrap_or_default()
}

/// Wbi 规范要求过滤签名值中的特殊字符
fn sanitize(value: &str) -> String {
    value
        .chars()
        .filter(|c| !matches!(c, '!' | '\'' | '(' | ')' | '*'))
        .collect()
}

/// encodeURIComponent 语义的百分号编码（大写十六进制）
fn encode_uri_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for &b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'!' | b'~' | b'*'
            | b'\'' | b'(' | b')' => out.push(b as char),
            other => out.push_str(&format!("%{:02X}", other)),
        }
    }
    out
}

/// 对参数列表做 Wbi 签名：追加 wts 与 w_rid，返回新的参数列表
pub fn sign_params(params: Vec<(String, String)>, keys: &WbiKeys) -> Vec<(String, String)> {
    let mut signed = params;
    signed.retain(|(k, _)| k != "w_rid" && k != "wts");
    signed.push(("wts".into(), now_ts().to_string()));
    signed.sort_by(|a, b| a.0.cmp(&b.0));
    let query = signed
        .iter()
        .map(|(k, v)| format!("{}={}", k, encode_uri_component(&sanitize(v))))
        .collect::<Vec<_>>()
        .join("&");
    let mut hasher = Md5::new();
    hasher.update((query + &keys.mixin_key).as_bytes());
    let digest = hex_encode(&hasher.finalize());
    signed.push(("w_rid".into(), digest));
    signed
}

fn now_ts() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// 从 nav 响应中解析 wbi key
pub fn extract_keys(nav_json: &Value) -> Result<WbiKeys> {
    let data = nav_json
        .get("data")
        .and_then(|d| d.get("wbi_img"))
        .ok_or_else(|| BiliError::Parse("nav 响应缺少 wbi_img".into()))?;
    let img_url = data
        .get("img_url")
        .and_then(Value::as_str)
        .ok_or_else(|| BiliError::Parse("nav 响应缺少 img_url".into()))?;
    let sub_url = data
        .get("sub_url")
        .and_then(Value::as_str)
        .ok_or_else(|| BiliError::Parse("nav 响应缺少 sub_url".into()))?;
    let img = img_url.rsplit('/').next().unwrap_or("");
    let sub = sub_url.rsplit('/').next().unwrap_or("");
    let raw: String = img
        .split('.')
        .next()
        .unwrap_or("")
        .to_string()
        + sub.split('.').next().unwrap_or("");
    let mixin_key = get_mixin_key(&raw);
    if mixin_key.is_empty() {
        return Err(BiliError::Parse("wbi mixin key 计算失败".into()));
    }
    Ok(WbiKeys { mixin_key })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mixin_key_matches_reference() {
        // bilibili-API-collect 官方样例
        // img_key = 7cd084941338484aae1ad9425b84077c
        // sub_key = 4932caff0ff746eab6f01bf08b70ac45
        let raw = "7cd084941338484aae1ad9425b84077c4932caff0ff746eab6f01bf08b70ac45";
        let key = get_mixin_key(raw);
        assert_eq!(key, "ea1db124af3c7062474693fa704f4ff8");
    }

    #[test]
    fn sanitize_removes_specials() {
        assert_eq!(sanitize("a!'()*b"), "ab");
    }

    #[test]
    fn encode_matches_javascript_uri_component() {
        assert_eq!(encode_uri_component("abc123-_.~"), "abc123-_.~");
        assert_eq!(encode_uri_component("a b/c?d= e"), "a%20b%2Fc%3Fd%3D%20e");
        assert_eq!(encode_uri_component("中文"), "%E4%B8%AD%E6%96%87");
    }
}
