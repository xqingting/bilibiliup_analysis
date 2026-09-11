# bilibiliup_analysis · B站UP主数据分析工坊

一套针对 B 站 UP 主（尤其是主播）的数据分析工具。**v2 起为 Tauri 2 桌面应用**，带现代化图形界面，
在保留原脚本全部能力的基础上，针对 2023 年后 B 站接口风控做了完整适配。

> 旧版 Python/JS 脚本已整体归档到 [`legacy/`](legacy/)，仍可独立运行；其抓取能力已被本应用完整取代并增强。

## 功能

| 功能 | 匿名模式 | 登录 Cookie | 说明 |
|---|---|---|---|
| **航海榜抓取** | ✅ | ✅ | 输入直播间链接/房间号，抓取全部大航海（总督/提督/舰长）名单与粉丝勋章，自动翻页去重 |
| **UID 批量抓取** | ⚠️ 降级 | ✅ 完整 | 批量抓取用户资料；匿名走 `card` 降级（无生日/学校/勋章），登录后抓完整字段，导出与旧版 `解读.json` 兼容 |
| **粉丝监控** | ⚠️ 仅数量 | ✅ 名单 | 定时轮询：匿名监控粉丝数曲线；登录后精确记录每位新增粉丝（昵称+时间），数据本地持久化 |
| **词频统计** | ✅ | ✅ | 聚合统计一群用户的点赞/投币分区、追番标题、投稿分区词频排行 |

导出统一支持 **JSON / CSV**（CSV 带 BOM，Excel 直接打开不乱码）。

## 为什么需要登录 Cookie？

B 站自 2023-07 起对 `x/space/wbi/acc/info`、`x/relation/followers` 等接口启用强制风控（`-352` /
`-403`），未登录请求一律拒绝——**这是旧版脚本失效的根本原因**。本应用的应对：

- **内置 Wbi 签名**（自动获取/缓存 wbi key，20 分钟刷新）；
- **自动申请匿名访客 Cookie**（`finger/spi` 获取 buvid3/buvid4）并通过风控校验；
- **风控自动重试**：遇 `-352`/`-412`/HTTP 412 指数退避重试，必要时自动轮换访客 Cookie；
- **全局限速**：可配置的最小请求间隔（默认 300ms），避免触发频控；
- **优雅降级**：无法完整抓取时自动切换到仍可用的接口，并在 UI 中明确标注数据来源（完整/降级）；
- **登录增强**：在「设置」粘贴浏览器 Cookie（含 `SESSDATA`）即解锁全部字段。Cookie 只保存在本机
  应用数据目录，不上传。

## 下载安装

前往 [Releases](../../releases) 下载对应平台安装包：

- Windows：`*-setup.exe`（NSIS 安装器）
- macOS：`.dmg`（注意区分 Apple Silicon `aarch64` 与 Intel `x64`）
- Linux：`.AppImage` / `.deb`

发布由 GitHub Actions 自动构建（`.github/workflows/release.yml`）：推送 `v*` 标签即触发三平台打包。

## 开发

```bash
# 前置：Rust stable、Node 18+、pnpm
cd app
pnpm install

# 开发模式（热更新）
pnpm tauri dev

# 构建本机安装包
pnpm tauri build
```

代码结构：

```
app/
├── src/                  # React 18 + Tailwind 前端
│   ├── pages/            # 仪表盘 / 航海榜 / UID抓取 / 粉丝监控 / 词频 / 设置
│   ├── components/ui.tsx # 共享组件
│   └── lib/              # IPC 封装（含浏览器演示模式）、导出工具
└── src-tauri/            # Tauri 2 / Rust 抓取核心
    └── src/
        ├── bili/
        │   ├── client.rs # HTTP 客户端：访客Cookie、限速、重试、登录态
        │   ├── wbi.rs    # Wbi 参数签名（含官方样例单测）
        │   ├── guard.rs  # 航海榜
        │   ├── space.rs  # UID 资料（acc/info ↔ card 自动降级）
        │   ├── fans.rs   # 粉丝监控（后台任务 + 本地持久化）
        │   └── wordfreq.rs # 词频
        └── commands.rs   # Tauri 命令层（进度事件推送到前端）
```

## 旧脚本 API 存活状态实测（2026-09）

| 旧脚本依赖的接口 | 状态 | 说明 |
|---|---|---|
| `xlive/app-room/v2/guardTab/topList`（航海榜） | ✅ 可用 | 匿名即可，需 roomid+ruid 正确 |
| `x/web-interface/card`（用户卡片） | ✅ 可用 | 匿名可用，字段少于 acc/info |
| `x/relation/stat`（粉丝/关注数） | ✅ 可用 | 匿名可用 |
| `x/space/like/video`（点赞词频） | ✅ 可用 | 匿名可用；用户设隐私时返回 53013 |
| `x/space/coin/video`（投币词频） | ✅ 可用 | 匿名可用 |
| `x/space/bangumi/follow/list`（追番） | ✅ 可用 | 匿名可用，旧 ajax 接口也仍在线 |
| `x/space/wbi/acc/info`（完整资料） | ❌ 匿名 -403 | 必须登录 Cookie（旧脚本因此失效） |
| `x/relation/followers`（粉丝列表） | ❌ 匿名 -352 | 必须登录 Cookie（旧脚本因此失效） |
| `x/space/wbi/arc/search`（投稿列表） | ❌ 匿名 -412 | 必须登录 Cookie |

实测脚本见 `docs/probes/`（Python，可直接复跑验证）。

## License

MIT
