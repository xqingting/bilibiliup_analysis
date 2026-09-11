import { useState } from "react";
import { Download, Play, Square, Tv } from "lucide-react";
import { invoke, listen } from "../lib/ipc";
import type { GuardResult, ProgressEvent } from "../lib/types";
import { exportJson, toCsv, exportText } from "../lib/export";
import { Empty, PageHeader, ProgressBar, StatCard, useToast } from "../components/ui";

export default function GuardPage() {
  const toast = useToast();
  const [roomInput, setRoomInput] = useState("21452505");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; message: string } | null>(null);
  const [result, setResult] = useState<GuardResult | null>(null);

  async function run() {
    if (!roomInput.trim()) {
      toast("error", "请输入直播间链接或房间号");
      return;
    }
    setBusy(true);
    setResult(null);
    setProgress({ done: 0, total: 0, message: "解析房间…" });
    const un = await listen<ProgressEvent>("task-progress", (p) => {
      if (p.task === "guard") setProgress({ done: p.done, total: p.total, message: p.message });
    });
    try {
      const r = await invoke<GuardResult>("fetch_guard", { roomInput: roomInput.trim() });
      setResult(r);
      toast("success", `抓取完成：${r.anchor_name} 共 ${r.total} 个大航海`);
    } catch (e) {
      toast("error", String(e));
    } finally {
      un();
      setBusy(false);
    }
  }

  async function doExportJson() {
    if (!result) return;
    const path = await exportJson(`航海榜_${result.room_id}.json`, {
      room_id: result.room_id,
      anchor_name: result.anchor_name,
      total: result.total,
      exported_at: new Date().toISOString(),
      entries: result.entries,
    });
    if (path) toast("success", `已导出 JSON：${path}`);
  }

  async function doExportCsv() {
    if (!result) return;
    const csv = toCsv(
      ["uid", "昵称", "舰长等级", "粉丝勋章", "勋章等级", "勋章所属UP"],
      result.entries.map((e) => [e.uid, e.username, guardName(e.guard_level), e.medal_name, e.medal_level, e.medal_target_id]),
    );
    const path = await exportText(`航海榜_${result.room_id}.csv`, csv);
    if (path) toast("success", `已导出 CSV：${path}`);
  }

  const counts = result
    ? {
        zongdu: result.entries.filter((e) => e.guard_level === 3).length,
        tidu: result.entries.filter((e) => e.guard_level === 2).length,
        jianzhang: result.entries.filter((e) => e.guard_level === 1).length,
      }
    : null;

  return (
    <div>
      <PageHeader title="航海榜抓取" desc="输入直播间链接或房间号，抓取全部大航海名单" icon={<Tv className="w-5 h-5" />} />

      <div className="card p-5">
        <label className="label">直播间链接 / 房间号</label>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="例如 https://live.bilibili.com/21452505 或 21452505"
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && run()}
            disabled={busy}
          />
          <button className="btn-primary shrink-0" onClick={run} disabled={busy}>
            <Play className="w-4 h-4" />
            {busy ? "抓取中…" : "开始抓取"}
          </button>
        </div>
        {busy && progress && (
          <div className="mt-4">
            <ProgressBar done={progress.done} total={progress.total} />
            <p className="text-xs text-ink-400 mt-1.5 truncate">{progress.message}</p>
          </div>
        )}
        <p className="text-xs text-ink-400 mt-3">
          主播 UID 会通过房间号自动解析，无需手动查询。大航海分页自动翻页、去重。
        </p>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-4 gap-4 mt-6">
            <StatCard label="主播" value={<span className="text-lg">{result.anchor_name}</span>} sub={`房间 ${result.room_id}`} />
            <StatCard label="总数" value={result.total} accent="pink" />
            <StatCard label="总督" value={counts!.zongdu} accent="amber" />
            <StatCard label="提督 / 舰长" value={`${counts!.tidu} / ${counts!.jianzhang}`} accent="cyan" />
          </div>

          <div className="card mt-6 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-ink-700/60">
              <h3 className="text-sm font-semibold text-white">大航海名单</h3>
              <div className="flex gap-2">
                <button className="btn-ghost !py-1.5" onClick={doExportCsv}>
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
                <button className="btn-ghost !py-1.5" onClick={doExportJson}>
                  <Download className="w-3.5 h-3.5" /> JSON
                </button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full">
                <thead className="sticky top-0 bg-ink-800 z-10">
                  <tr>
                    <th className="th">#</th>
                    <th className="th">UID</th>
                    <th className="th">昵称</th>
                    <th className="th">等级</th>
                    <th className="th">粉丝勋章</th>
                    <th className="th">勋章等级</th>
                  </tr>
                </thead>
                <tbody>
                  {result.entries.map((e, i) => (
                    <tr key={e.uid} className="border-t border-ink-700/40 hover:bg-ink-800/50">
                      <td className="td text-ink-400">{i + 1}</td>
                      <td className="td font-mono text-cyanic">{e.uid}</td>
                      <td className="td text-white font-medium">{e.username}</td>
                      <td className="td">
                        <span
                          className={`badge ${
                            e.guard_level === 3
                              ? "bg-amber-500/15 text-amber-400"
                              : e.guard_level === 2
                                ? "bg-fuchsia-500/15 text-fuchsia-400"
                                : "bg-cyan-500/15 text-cyan-400"
                          }`}
                        >
                          {guardName(e.guard_level)}
                        </span>
                      </td>
                      <td className="td">{e.medal_name || <span className="text-ink-400">无</span>}</td>
                      <td className="td tabular-nums">{e.medal_level || "-"}</td>
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
          <Empty text="输入房间号开始抓取，结果将显示在这里" icon={<Square className="w-8 h-8 opacity-40" />} />
        </div>
      )}
    </div>
  );
}

function guardName(level: number): string {
  return level === 3 ? "总督" : level === 2 ? "提督" : "舰长";
}
