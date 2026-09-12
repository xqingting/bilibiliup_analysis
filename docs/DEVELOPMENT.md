# 开发者文档

面向使用者的说明见 [README](../README.md)。本文记录架构、风控适配与构建发布流程。

## 技术栈

- **桌面框架**：Tauri 2（Rust 后端 + 系统 WebView）
- **抓取核心**：Rust（reqwest + rustls，无外部进程依赖）
- **前端**：React 18 + TypeScript + Tailwind CSS + Recharts，Vite 构建

## 代码结构

```
app/
├── src/                  # React 前端
│   ├── pages/            # 仪表盘 / 航海榜 / UID抓取 / 粉丝监控 / 词频 / 设置
│   ├── components/ui.tsx # 共享组件（Toast、进度条、统计卡等）
│   └── lib/
│       ├── ipc.ts        # Tauri IPC 封装；浏览器环境下自动切换演示模式（示例数据）
│       ├── types.ts      # 与 Rust 端对齐的数据结构
│       └── export.ts     # JSON / CSV(带BOM) 导出，Tauri 另存为对话框
└── src-tauri/
    └── src/
        ├── bili/
        │   ├── client.rs # HTTP 客户端：访客Cookie、全局限速、风控重试、登录态
        │   ├── wbi.rs    # Wbi 参数签名（官方样例单测 + encodeURIComponent）
        │   ├── guard.rs  # 航海榜（房间链接解析、自动翻页去重）
        │   ├── space.rs  # UID 资料（acc/info ↔ card 自动降级）
        │   ├── fans.rs   # 粉丝监控（后台任务 + 本地持久化 monitor_{uid}.json）
        │   └── wordfreq.rs # 词频（like/coin/bangumi/archive 四种模式）
        ├── commands.rs   # Tauri 命令层，进度通过 task-progress / fans-event 事件推送
        └── store.rs      # settings.json 持久化
```

## 风控适配要点

- **Wbi 签名**：nav 接口获取 img/sub key → mixin 表置换取前 32 位 → 参数排序后 `w_rid = md5(query + mixin_key)`；
  key 缓存 20 分钟；签名值过滤 `!'()*` 并做大写百分号编码。
- **匿名访客 Cookie**：`api.bilibili.com/x/frontend/finger/spi` 获取 buvid3/buvid4；风控重试时自动轮换。
- **重试策略**：-352 / -412 / HTTP 412、429 指数退避（0.8s×2ⁿ + 抖动）重试，最多 `max_retries` 次。
- **语义化错误**：-101/-403 → 需要登录；53013 → 用户隐私未公开；风控连续失败 → 明确提示降低频率。
- **降级链**：`acc/info`（需登录）失败 → `x/web-interface/card` + `x/relation/stat`（匿名可用）。

## 旧接口存活状态实测（2026-09，脚本见 [probes/](probes/)）

| 接口 | 状态 | 说明 |
|---|---|---|
| `xlive/app-room/v2/guardTab/topList`（航海榜） | ✅ 匿名可用 | roomid+ruid 需正确 |
| `x/web-interface/card`（用户卡片） | ✅ 匿名可用 | 字段少于 acc/info |
| `x/relation/stat`（粉丝/关注数） | ✅ 匿名可用 | |
| `x/space/like/video`（点赞词频） | ✅ 匿名可用 | 用户设隐私时 53013 |
| `x/space/coin/video`（投币词频） | ✅ 匿名可用 | |
| `x/space/bangumi/follow/list`（追番） | ✅ 匿名可用 | 旧 ajax 接口也仍在线 |
| `x/space/wbi/acc/info`（完整资料） | ❌ 匿名 -403 | 需登录 Cookie |
| `x/relation/followers`（粉丝列表） | ❌ 匿名 -352 | 需登录 Cookie；仅暴露最近约 1000 名 |
| `x/space/wbi/arc/search`（投稿列表） | ❌ 匿名 -412 | 需登录 Cookie |

## 本地开发

```bash
# 前置：Rust stable、Node 18+、pnpm
cd app
pnpm install          # pnpm≥10 需允许 esbuild 构建脚本（仓库已配好 pnpm-workspace.yaml）
pnpm tauri dev        # 开发模式（热更新）
pnpm tauri build      # 构建本机安装包（macOS 产出 .app/.dmg）
cargo test            # Rust 单测（在 app/src-tauri 下）
```

前端可在纯浏览器中开发预览（`pnpm dev` → http://localhost:5173）：
`src/lib/ipc.ts` 检测到非 Tauri 环境时自动返回示例数据，方便调 UI。

## 发布

推送 `v*` 标签触发 [.github/workflows/release.yml](../.github/workflows/release.yml)：

```bash
git tag v2.0.1 && git push origin v2.0.1
```

矩阵构建：macOS 14 (aarch64) / macOS 13 (x86_64) / ubuntu-22.04 / windows-latest，
由 tauri-action 产出安装包并发布 GitHub Release。

## UI 截图

`docs/screenshots/` 下的 6 张截图由浏览器演示模式生成（`pnpm dev` 后逐页操作截图），
README 直接引用相对路径展示。若 UI 改版请同步更新。
