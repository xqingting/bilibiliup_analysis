use thiserror::Error;

#[derive(Debug, Error)]
pub enum BiliError {
    #[error("需要登录Cookie：B站对接口 `{0}` 启用了风控/权限校验，请在「设置」中粘贴浏览器Cookie后重试")]
    NeedLogin(String),
    #[error("该用户隐私设置未公开，无法抓取：{0}")]
    Private(String),
    #[error("接口返回错误 code={code} message={message}")]
    Api { code: i64, message: String },
    #[error("风控拦截（连续{0}次校验失败），请稍后重试或降低请求频率")]
    RiskBlocked(i32),
    #[error("网络错误: {0}")]
    Http(String),
    #[error("响应解析失败（可能被风控页拦截）: {0}")]
    Parse(String),
}

impl BiliError {
    /// 归一化为前端可读的字符串
    pub fn to_display(&self) -> String {
        self.to_string()
    }
}

pub type Result<T> = std::result::Result<T, BiliError>;
