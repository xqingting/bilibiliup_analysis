use std::collections::BTreeMap;
use std::time::Duration;

use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::{Mutex, RwLock};

use super::error::{BiliError, Result};
use super::wbi::{extract_keys, sign_params, WbiCache, WbiKeys};

pub const UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/// 匿名风控码：遇到时指数退避重试
const RISK_CODES: [i64; 2] = [-352, -412];
const RISK_HTTP: [u16; 2] = [412, 429];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    /// 用户从浏览器复制的 Cookie（含 SESSDATA 即视为登录态）
    #[serde(default)]
    pub cookie: String,
    /// 两次请求的最小间隔（毫秒）
    #[serde(default = "default_interval")]
    pub interval_ms: u64,
    #[serde(default = "default_retries")]
    pub max_retries: u32,
}

fn default_interval() -> u64 {
    300
}
fn default_retries() -> u32 {
    4
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            cookie: String::new(),
            interval_ms: default_interval(),
            max_retries: default_retries(),
        }
    }
}

pub struct BiliClient {
    http: reqwest::Client,
    settings: RwLock<Settings>,
    wbi: Mutex<WbiCache>,
    /// 访客 Cookie（buvid3 等），成功通过风控后会补充
    visitor_cookies: RwLock<BTreeMap<String, String>>,
    /// 全局限速门：保证两次请求间隔 >= interval_ms
    gate: Mutex<()>,
    last_request: RwLock<Option<tokio::time::Instant>>,
}

impl BiliClient {
    pub fn new(settings: Settings) -> Self {
        let http = reqwest::Client::builder()
            .user_agent(UA)
            .timeout(Duration::from_secs(15))
            .connect_timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("failed to build http client");
        BiliClient {
            http,
            settings: RwLock::new(settings),
            wbi: Mutex::new(WbiCache::default()),
            visitor_cookies: RwLock::new(BTreeMap::new()),
            gate: Mutex::new(()),
            last_request: RwLock::new(None),
        }
    }

    pub async fn settings(&self) -> Settings {
        self.settings.read().await.clone()
    }

    pub async fn update_settings(&self, s: Settings) {
        let login_changed = {
            let old = self.settings.read().await;
            has_sessdata(&old.cookie) != has_sessdata(&s.cookie)
        };
        *self.settings.write().await = s;
        if login_changed {
            self.wbi.lock().await.invalidate();
        }
    }

    pub async fn has_login(&self) -> bool {
        has_sessdata(&self.settings.read().await.cookie)
    }

    async fn pace(&self) {
        let interval = self.settings.read().await.interval_ms.max(80) as u64;
        let _permit = self.gate.lock().await;
        if let Some(last) = *self.last_request.read().await {
            let elapsed = last.elapsed();
            if elapsed < Duration::from_millis(interval) {
                tokio::time::sleep(Duration::from_millis(interval) - elapsed).await;
            }
        }
        *self.last_request.write().await = Some(tokio::time::Instant::now());
    }

    fn build_cookie_header(&self, visitor: &BTreeMap<String, String>, extra: &str) -> String {
        let mut parts: Vec<String> = visitor
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect();
        let extra = extra.trim();
        if !extra.is_empty() {
            parts.push(extra.trim_end_matches(';').to_string());
        }
        parts.join("; ")
    }

    /// 获取匿名访客 Cookie（buvid3/buvid4），失败不影响主流程
    pub async fn ensure_visitor_cookies(&self) {
        {
            let vc = self.visitor_cookies.read().await;
            if vc.contains_key("buvid3") {
                return;
            }
        }
        if let Some((b3, b4)) = self.fetch_spi().await {
            self.store_visitor_cookies(b3, b4).await;
        }
    }

    /// 清空并重新获取访客 Cookie（风控重试时调用）
    async fn refresh_visitor_cookies(&self) {
        self.visitor_cookies.write().await.clear();
        if let Some((b3, b4)) = self.fetch_spi().await {
            self.store_visitor_cookies(b3, b4).await;
        }
    }

    async fn store_visitor_cookies(&self, b3: String, b4: String) {
        let mut vc = self.visitor_cookies.write().await;
        vc.insert("buvid3".into(), b3);
        vc.insert("buvid4".into(), b4);
        vc.insert(
            "b_nut".into(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs().to_string())
                .unwrap_or_default(),
        );
    }

    /// 单次无重试请求 finger/spi，避免与 raw_get_json 相互递归
    async fn fetch_spi(&self) -> Option<(String, String)> {
        let req = self
            .http
            .get("https://api.bilibili.com/x/frontend/finger/spi")
            .header("Accept", "application/json, text/plain, */*")
            .header("Referer", "https://www.bilibili.com/");
        let v: Value = req.send().await.ok()?.json().await.ok()?;
        if v["code"].as_i64() == Some(0) {
            let b3 = v["data"]["b_3"].as_str()?.to_string();
            let b4 = v["data"]["b_4"].as_str()?.to_string();
            Some((b3, b4))
        } else {
            None
        }
    }


    /// 获取并缓存 Wbi keys
    pub async fn wbi_keys(&self) -> Result<WbiKeys> {
        {
            let mut cache = self.wbi.lock().await;
            if let Some(k) = cache.get() {
                return Ok(k);
            }
        }
        let nav = self
            .get_json(
                "https://api.bilibili.com/x/web-interface/nav",
                &[],
                "https://www.bilibili.com/",
                false,
            )
            .await?;
        let keys = extract_keys(&nav)?;
        self.wbi.lock().await.store(keys.clone());
        Ok(keys)
    }

    /// 带 Wbi 签名的 GET
    pub async fn get_json_wbi(
        &self,
        url: &str,
        params: Vec<(String, String)>,
        referer: &str,
    ) -> Result<Value> {
        let keys = self.wbi_keys().await?;
        let signed = sign_params(params, &keys);
        self.get_json(url, &signed, referer, true).await
    }

    /// 匿名 GET（不签名）
    pub async fn get_json(
        &self,
        url: &str,
        params: &[(String, String)],
        referer: &str,
        _signed: bool,
    ) -> Result<Value> {
        self.raw_get_json(url, params, referer, None).await
    }

    async fn raw_get_json(
        &self,
        url: &str,
        params: &[(String, String)],
        referer: &str,
        retry_override: Option<u32>,
    ) -> Result<Value> {
        let mut attempt: u32 = 0;
        let max = retry_override
            .unwrap_or_else(|| self.settings.try_read().map(|s| s.max_retries).unwrap_or(4))
            .max(1);
        let mut refreshed_buvid = false;
        loop {
            attempt += 1;
            self.pace().await;
            let cookie_src = self.settings.read().await.cookie.clone();
            let visitor = self.visitor_cookies.read().await.clone();
            let cookie_header = self.build_cookie_header(&visitor, &cookie_src);

            let mut req = self
                .http
                .get(url)
                .header("Accept", "application/json, text/plain, */*")
                .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
                .header("Referer", referer)
                .header("Origin", "https://www.bilibili.com");
            if !cookie_header.is_empty() {
                req = req.header("Cookie", cookie_header);
            }
            if !params.is_empty() {
                req = req.query(params);
            }

            let resp = match req.send().await {
                Ok(r) => r,
                Err(e) => {
                    if attempt < max {
                        backoff_sleep(attempt).await;
                        continue;
                    }
                    return Err(BiliError::Http(e.to_string()));
                }
            };
            let status = resp.status().as_u16();

            if RISK_HTTP.contains(&status) {
                if attempt < max {
                    if !refreshed_buvid {
                        refreshed_buvid = true;
                        self.refresh_visitor_cookies().await;
                    }
                    backoff_sleep(attempt).await;
                    continue;
                }
                return Err(BiliError::RiskBlocked(attempt as i32));
            }
            if status >= 400 {
                return Err(BiliError::Http(format!("HTTP {status}")));
            }

            let text = resp.text().await.map_err(|e| BiliError::Http(e.to_string()))?;
            let v: Value = match serde_json::from_str(&text) {
                Ok(v) => v,
                Err(_) => {
                    return Err(BiliError::Parse(format!("非JSON响应 (HTTP {status})")));
                }
            };

            let code = v["code"].as_i64().unwrap_or(i64::MIN);
            if code == 0 {
                return Ok(v);
            }
            if RISK_CODES.contains(&code) {
                if attempt < max {
                    if !refreshed_buvid {
                        refreshed_buvid = true;
                        self.refresh_visitor_cookies().await;
                    }
                    backoff_sleep(attempt).await;
                    continue;
                }
                if self.has_login().await {
                    return Err(BiliError::RiskBlocked(attempt as i32));
                }
                return Err(BiliError::NeedLogin(url_host(url)));
            }
            if code == -101 {
                return Err(BiliError::NeedLogin(url_host(url)));
            }
            if code == -403 {
                // 空间资料 -403：未登录访问受限
                if !self.has_login().await {
                    return Err(BiliError::NeedLogin(url_host(url)));
                }
                return Err(BiliError::Api {
                    code,
                    message: v["message"]
                        .as_str()
                        .unwrap_or("访问权限不足")
                        .to_string(),
                });
            }
            if code == 53013 {
                return Err(BiliError::Private(url_host(url)));
            }
            return Err(BiliError::Api {
                code,
                message: v["message"].as_str().unwrap_or("unknown").to_string(),
            });
        }
    }
}

fn url_host(url: &str) -> String {
    url.split("//")
        .nth(1)
        .and_then(|r| r.split('/').next())
        .unwrap_or(url)
        .to_string()
}

fn has_sessdata(cookie: &str) -> bool {
    cookie.to_ascii_lowercase().contains("sessdata=")
}

async fn backoff_sleep(attempt: u32) {
    let jitter = rand::thread_rng().gen_range(100..400);
    let ms = 800u64 * 2u64.pow(attempt.saturating_sub(1)).min(6000) + jitter;
    tokio::time::sleep(Duration::from_millis(ms)).await;
}
