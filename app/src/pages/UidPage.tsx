import { useMemo, useState } from "react";
import { Download, Play, Users, X } from "lucide-react";
import { invoke, listen } from "../lib/ipc";
import type { ProgressEvent, UidBatchResult } from "../lib/types";
import { exportJson, toCsv, exportText } from "../lib/export";
import { Empty, PageHeader, ProgressBar, StatCard, useToast } from "../components/ui";

/** 支持从任意文本中抠出 uid：纯数字行、JSON、空间链接均兼容 */
function parseUids(text: string): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const tokens = text.match(/\d{4,}/g) ?? [];
  for (const t of tokens) {
    const n = parseInt(t, 10);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

export default function UidPage() {
  const toast = useToast();
  const [text, setText] = useState("34503997\n401742377\n946974");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; message: string } | null>(null);
  const [result, setResult] = useState<UidBatchResult | null>(null);

  const uids = useMemo(() => parseUids(text), [text]);

  async function run() {
    if (uids.length === 0) {
      toast("error", "未识别到任何 UID，请每行输入一个数字 uid（也支持粘贴 JSON/链接，自动提取数字）");
      return;
    }
    setBusy(true);
    setResult(null);
    setProgress({ done: 0, total: uids.length, message: "准备…" });
    const un = await listen<ProgressEvent>("task-progress", (p) => {
      if (p.task === "uid") setProgress({ done: p.done, total: p.total, message: p.message });
    });
    try {
      const r = await invoke<UidBatchResult>("fetch_uid_batch", { mids: uids });
      setResult(r);
      toast(
        r.failed.length > 0 ? "info" : "success",
        `完成：成功 ${r.records.length} 个${r.failed.length ? `，失败 ${r.failed.length} 个` : ""}`,
      );
    } catch (e) {
      toast("error", String(e));
    } finally {
      un();
      setBusy(false);
    }
  }

  async function doExportJson() {
    if (!result) return;
    const legacy: Record<string, unknown> = {};
    for (const r of result.records) legacy[String(r.uid)] = r;
    const path = await exportJson(`uid_已处理.json`, legacy);
    if (path) toast("success", `已导出 JSON：${path}`);
  }

  async function doExportCsv() {
    if (!result) return;
    const headers = ["uid", "昵称", "性别", "生日", "等级", "粉丝数", "关注数", "投稿数", "获赞数", "大会员状态", "大会员类型", "认证类型", "学校", "粉丝勋章", "勋章等级", "数据来源"];
    const rows = result.records.map((r) => [
      r.uid, r["昵称"], r["性别"], r["生日"], r["等级"], r["粉丝数"], r["关注数"], r["投稿数"], r["获赞数"],
      r["大会员状态"], r["大会员类型"], r["认证类型"], r["学校"],
      r["佩戴粉丝勋章"] ? `${r["粉丝勋章名称"]}` : "无",
      r["粉丝勋章等级"],
      r.source === "full" ? "完整" : "降级",
    ]);
    const path = await exportText("uid_已处理.csv", toCsv(headers, rows));
    if (path) toast("success", `已导出 CSV：${path}`);
  }

  const full = result?.records.filter((r) => r.source === "full").length ?? 0;

  return (
    <div>
      <PageHeader title="UID 批量抓取" desc="批量抓取用户资料，导出格式与旧版 解读.json 兼容" icon={<Users className="w-5 h-5" />} />

      <div className="card p-5">
        <div className="flex items-center justify-between mb-1.5">
          <label className="label !mb-0">UID 列表（每行一个，或直接粘贴 JSON / 空间链接）</label>
          <span className="text-xs text-ink-400">识别到 <b className="text-cyanic">{uids.length}</b> 个 uid</span>
        </div>
        <textarea
          className="input h-32 font-mono !leading-relaxed resize-y"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"34503997\n401742377\n…"}
          disabled={busy}
        />
        <div className="flex items-center gap-3 mt-4">
          <button className="btn-primary" onClick={run} disabled={busy}>
            <Play className="w-4 h-4" />
            {busy ? "抓取中…" : `开始抓取 ${uids.length > 0 ? `(${uids.length})` : ""}`}
          </button>
          {busy && (
            <div className="flex-1">
              <ProgressBar done={progress?.done ?? 0} total={progress?.total ?? 0} />
              <p className="text-xs text-ink-400 mt-1 truncate">{progress?.message}</p>
            </div>
          )}
        </div>
        <p className="text-xs text-ink-400 mt-3 leading-relaxed">
          匿名模式使用 card 接口降级抓取（无生日/学校/勋章字段）；在「设置」中配置登录 Cookie 后自动升级为完整资料抓取。
          请求按设置的最小间隔限速，风控自动指数退避重试。
        </p>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-3 gap-4 mt-6">
            <StatCard label="成功" value={result.records.length} accent="green" />
            <StatCard label="完整数据" value={full} accent="cyan" sub="需要登录 Cookie" />
            <StatCard label="失败" value={result.failed.length} accent="amber" sub="多为注销号或隐私设置" />
          </div>

          {result.failed.length > 0 && (
            <div className="card mt-4 p-4">
              <div className="text-xs text-ink-400 mb-2 font-semibold">失败明细</div>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {result.failed.map((f) => (
                  <div key={f.uid} className="text-xs text-red-400/90 flex gap-2">
                    <span className="font-mono">{f.uid}</span>
                    <span className="text-ink-400">{f.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card mt-4 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-ink-700/60">
              <h3 className="text-sm font-semibold text-white">抓取结果</h3>
              <div className="flex gap-2">
                <button className="btn-ghost !py-1.5" onClick={doExportCsv}>
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
                <button className="btn-ghost !py-1.5" onClick={doExportJson}>
                  <Download className="w-3.5 h-3.5" /> JSON
                </button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[520px]">
              <table className="w-full">
                <thead className="sticky top-0 bg-ink-800 z-10">
                  <tr>
                    <th className="th">UID</th>
                    <th className="th">昵称</th>
                    <th className="th">等级</th>
                    <th className="th">粉丝数</th>
                    <th className="th">关注数</th>
                    <th className="th">投稿</th>
                    <th className="th">获赞</th>
                    <th className="th">大会员</th>
                    <th className="th">勋章</th>
                    <th className="th">来源</th>
                  </tr>
                </thead>
                <tbody>
                  {result.records.map((r) => (
                    <tr key={r.uid} className="border-t border-ink-700/40 hover:bg-ink-800/50">
                      <td className="td font-mono text-cyanic">{r.uid}</td>
                      <td className="td text-white font-medium max-w-40 truncate" title={r["签名"]}>{r["昵称"]}</td>
                      <td className="td tabular-nums">Lv{r["等级"]}</td>
                      <td className="td tabular-nums">{fmt(r["粉丝数"])}</td>
                      <td className="td tabular-nums">{fmt(r["关注数"])}</td>
                      <td className="td tabular-nums">{fmt(r["投稿数"])}</td>
                      <td className="td tabular-nums">{fmt(r["获赞数"])}</td>
                      <td className="td">{r["大会员状态"] === "有" ? <span className="badge bg-amber-500/15 text-amber-400">{r["大会员类型"]}</span> : <span className="text-ink-400">无</span>}</td>
                      <td className="td">{r["佩戴粉丝勋章"] ? <span className="badge bg-bilibili/15 text-bilibili">{r["粉丝勋章名称"]}·{r["粉丝勋章等级"]}</span> : <span className="text-ink-400">无</span>}</td>
                      <td className="td">
                        <span className={`badge ${r.source === "full" ? "bg-emerald-500/15 text-emerald-400" : "bg-ink-700 text-ink-300"}`}>
                          {r.source === "full" ? "完整" : "降级"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!result && !busy && (
        <div className="card mt-6">
          <Empty text="粘贴 uid 列表后开始抓取" icon={<X className="w-8 h-8 opacity-40" />} />
        </div>
      )}
    </div>
  );
}

function fmt(n: number | string): string {
  const v = Number(n) || 0;
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : String(v);
}
