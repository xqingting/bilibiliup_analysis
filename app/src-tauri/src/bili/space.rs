use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::error::{BiliError, Result};
use super::BiliClient;

/// 抓取结果等级
/// - full：登录 Cookie 抓到完整资料
/// - card：匿名降级（card + relation/stat），字段较少
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SourceLevel {
    Full,
    Card,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRecord {
    pub uid: u64,
    pub name: String,
    pub sex: String,
    pub sign: String,
    pub level: u32,
    pub birthday: String,
    pub school: String,
    pub follower: u64,
    pub following: u64,
    pub archive_count: u64,
    pub like_num: u64,
    pub article_count: u64,
    pub vip_status: String,
    pub vip_type: String,
    pub official_type: String,
    pub profession: String,
    pub medal_wear: bool,
    pub medal_name: String,
    pub medal_level: u32,
    pub medal_target_id: u64,
    pub source: SourceLevel,
}

impl UserRecord {
    /// 与旧版 解读.json 兼容的中文字段导出
    pub fn to_legacy_json(&self) -> Value {
        serde_json::json!({
            "uid": self.uid,
            "昵称": self.name,
            "性别": self.sex,
            "生日": self.birthday,
            "签名": self.sign,
            "等级": self.level,
            "粉丝数": self.follower,
            "关注数": self.following,
            "投稿数": self.archive_count,
            "获赞数": self.like_num,
            "大会员状态": self.vip_status,
            "大会员类型": self.vip_type,
            "学校": self.school,
            "佩戴粉丝勋章": self.medal_wear,
            "粉丝勋章名称": self.medal_name,
            "粉丝勋章等级": self.medal_level,
            "粉丝勋章所属UP的mid": self.medal_target_id,
            "认证类型": self.official_type,
            "所属机构": self.profession,
        })
    }
}

fn dig<'a>(v: &'a Value, path: &str) -> &'a Value {
    let mut cur = v;
    for part in path.split('.') {
        match cur.get(part) {
            Some(next) => cur = next,
            None => return &Value::Null,
        }
    }
    cur
}

fn str_or(v: &Value, path: &str, default: &str) -> String {
    match dig(v, path) {
        Value::Null => default.to_string(),
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

fn num_or(v: &Value, path: &str, default: u64) -> u64 {
    dig(v, path).as_u64().unwrap_or(default)
}

fn vip_type_name(t: i64) -> String {
    match t {
        0 => "无".into(),
        1 => "月大会员".into(),
        _ => "年度及以上大会员".into(),
    }
}

fn official_name(t: i64) -> String {
    match t {
        -1 | -2 => "无".into(),
        0 => "个人认证".into(),
        1 => "机构认证".into(),
        _ => "无".into(),
    }
}

/// 单个 uid 抓取：登录走 acc/info，匿名走 card + relation/stat
pub async fn fetch_user(client: &BiliClient, mid: u64) -> Result<UserRecord> {
    client.ensure_visitor_cookies().await;
    let referer = format!("https://space.bilibili.com/{mid}/");

    if client.has_login().await {
        match fetch_full(client, mid, &referer).await {
            Ok(r) => return Ok(r),
            Err(BiliError::RiskBlocked(_)) | Err(BiliError::Http(_)) => {
                // 指数退避已在 client 内重试过，这里降级到 card
            }
            Err(e) => return Err(e),
        }
    }
    fetch_by_card(client, mid, &referer).await
}

async fn fetch_full(client: &BiliClient, mid: u64, referer: &str) -> Result<UserRecord> {
    let params = vec![
        ("mid".to_string(), mid.to_string()),
        ("token".to_string(), String::new()),
        ("platform".to_string(), "web".into()),
        ("web_location".to_string(), "1550101".into()),
    ];
    let v = client.get_json_wbi("https://api.bilibili.com/x/space/wbi/acc/info", params, referer).await?;
    let d = &v["data"];

    // 关系数补充（匿名可用，保证 follower/following 齐全）
    let (follower, following) = match client
        .get_json(
            "https://api.bilibili.com/x/relation/stat",
            &[("vmid".to_string(), mid.to_string())],
            referer,
            false,
        )
        .await
    {
        Ok(r) => (
            r["data"]["follower"].as_u64().unwrap_or(0),
            r["data"]["following"].as_u64().unwrap_or(0),
        ),
        Err(_) => (
            dig(d, "relation.follower").as_u64().unwrap_or(0),
            dig(d, "relation.attention").as_u64().unwrap_or(0),
        ),
    };
    // 投稿/获赞数（acc/info 不带，用 card 补）
    let (archive, like, article) = match client
        .get_json(
            "https://api.bilibili.com/x/web-interface/card",
            &[
                ("mid".to_string(), mid.to_string()),
                ("photo".to_string(), "false".into()),
            ],
            referer,
            false,
        )
        .await
    {
        Ok(r) => (
            num_or(&r["data"], "archive_count", 0),
            num_or(&r["data"], "like_num", 0),
            num_or(&r["data"], "article_count", 0),
        ),
        Err(_) => (0, 0, 0),
    };

    let medal_wear = dig(d, "fans_medal.wear").as_bool().unwrap_or(false);
    Ok(UserRecord {
        uid: mid,
        name: str_or(d, "name", ""),
        sex: str_or(d, "sex", "无"),
        sign: str_or(d, "sign", ""),
        level: num_or(d, "level", 0) as u32,
        birthday: str_or(d, "birthday", "无"),
        school: str_or(d, "school.name", "无"),
        follower,
        following,
        archive_count: archive,
        like_num: like,
        article_count: article,
        vip_status: if dig(d, "vip.status").as_i64().unwrap_or(0) == 1 {
            "有".into()
        } else {
            "无".into()
        },
        vip_type: vip_type_name(dig(d, "vip.type").as_i64().unwrap_or(0)),
        official_type: official_name(dig(d, "official.type").as_i64().unwrap_or(-1)),
        profession: str_or(d, "profession.title", "无"),
        medal_wear,
        medal_name: str_or(d, "fans_medal.medal.medal_name", ""),
        medal_level: num_or(d, "fans_medal.medal.level", 0) as u32,
        medal_target_id: num_or(d, "fans_medal.medal.target_id", 0),
        source: SourceLevel::Full,
    })
}

async fn fetch_by_card(client: &BiliClient, mid: u64, referer: &str) -> Result<UserRecord> {
    let card = client
        .get_json(
            "https://api.bilibili.com/x/web-interface/card",
            &[
                ("mid".to_string(), mid.to_string()),
                ("photo".to_string(), "false".into()),
            ],
            referer,
            false,
        )
        .await?;
    if dig(&card, "data.card.mid").as_str().is_none() {
        return Err(BiliError::Api {
            code: -1,
            message: "card 接口未返回用户信息".into(),
        });
    }
    let c = &card["data"]["card"];
    let stat = client
        .get_json(
            "https://api.bilibili.com/x/relation/stat",
            &[("vmid".to_string(), mid.to_string())],
            referer,
            false,
        )
        .await;

    let (follower, following) = match &stat {
        Ok(s) => (
            s["data"]["follower"].as_u64().unwrap_or_else(|| c["fans"].as_u64().unwrap_or(0)),
            s["data"]["following"].as_u64().unwrap_or_else(|| c["attention"].as_u64().unwrap_or(0)),
        ),
        Err(_) => (
            c["fans"].as_u64().unwrap_or(0),
            c["attention"].as_u64().unwrap_or(0),
        ),
    };

    let name = str_or(c, "name", "");
    if name.is_empty() {
        return Err(BiliError::Api {
            code: -1,
            message: "用户不存在或已注销".into(),
        });
    }

    Ok(UserRecord {
        uid: mid,
        name,
        sex: str_or(c, "sex", "无"),
        sign: str_or(c, "sign", ""),
        level: num_or(c, "level_info.current_level", 0) as u32,
        birthday: str_or(c, "birthday", "无"),
        school: "无".into(),
        follower,
        following,
        archive_count: num_or(&card["data"], "archive_count", 0),
        like_num: num_or(&card["data"], "like_num", 0),
        article_count: num_or(&card["data"], "article_count", 0),
        vip_status: if dig(c, "vip.status").as_i64().unwrap_or_else(|| dig(c, "vipStatus").as_i64().unwrap_or(0)) == 1 {
            "有".into()
        } else {
            "无".into()
        },
        vip_type: vip_type_name(
            dig(c, "vip.type").as_i64().unwrap_or_else(|| dig(c, "vipType").as_i64().unwrap_or(0)),
        ),
        official_type: official_name(dig(c, "official.type").as_i64().unwrap_or(-1)),
        profession: str_or(&card["data"], "profession.title", "无"),
        medal_wear: false,
        medal_name: String::new(),
        medal_level: 0,
        medal_target_id: 0,
        source: SourceLevel::Card,
    })
}
