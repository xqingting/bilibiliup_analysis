import { useMemo, useState } from "react";
import { BarChart3, Download, Play } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { invoke, listen } from "../lib/ipc";
import type { ProgressEvent, WordFreqItem, WordFreqResult } from "../lib/types";
import { exportText, toCsv } from "../lib/export";
import { Empty, PageHeader, ProgressBar, StatCard, useToast } from "../components/ui";

const MODES = [
  { key: "like", label: "点赞视频分区", hint: "匿名可用（用户需公开点赞）" },
  { key: "coin", label: "投币视频分区", hint: "匿名可用（用户需公开投币）" },
  { key: "bangumi", label: "追番标题", hint: "匿名可用" },
  { key: "archive", label: "投稿分区", hint: "建议登录 Cookie（匿名常被风控）" },
] as const;

type ModeKey = (typeof MODES)[number]["key"];

export default function FreqPage() {
  const toast = useToast();
  const [mode, setMode] = useState<ModeKey>("like");
  const [text, setText] = useState("34503997\n401742377\n946974");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; message: string } | null>(null);
  const [result, setResult] = useState<WordFreqResult | null>(null);

  const uids = useMemo(() => {
    const out: number[] = [];
    const seen = new Set<number>();
    for (const t of text.match(/\d{4,}/g) ?? []) {
      const n = parseInt(t, 10);
      if (!seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
    return out;
  }, [text]);

  const modeMeta = MODES.find((m) => m.key === mode)!;

  async function run() {
    if (uids.length === 0) {
      toast("error", "未识别到任何 UID");
      return;
    }
    setBusy(true);
    setResult(null);
    setProgress({ done: 0, total: uids.length, message: "准备…" });
    const un = await listen<ProgressEvent>("task-progress", (p) => {
      if (p.task === "freq") setProgress({ done: p.done, total: p.total, message: p.message });
    });
    try {
      const r = await invoke<WordFreqResult>("fetch_wordfreq", { mode, mids: uids });
      setResult(r);
      toast(
        r.skipped.length > 0 ? "info" : "success",
        `统计完成：成功 ${r.ok_count} 个用户${r.skipped.length ? `，跳过 ${r.skipped.length} 个` : ""}`,
      );
    } catch (e) {
      toast("error", String(e));
    } finally {
      un();
      setBusy(false);
    }
  }

  async function doExport() {
    if (!result) return;
    const csv = toCsv(["词", "次数"], result.items.map((i) => [i.word, i.count]));
    const path = await exportText(`词频_${mode}.csv`, csv);
    if (path) toast("success", `已导出：${path}`);
  }

  const chartData = (result?.items ?? []).slice(0, 15).map((it) => ({ ...it }));
  const totalWords = result?.items.reduce((s, i) => s + i.count, 0) ?? 0;

  return (
    <div>
      <PageHeader title="词频统计" desc="统计一群用户的视频分区 / 追番标题偏好，聚合生成排行" icon={<BarChart3 className="w-5 h-5" />} />

      <div className="card p-5">
        <label className="label">统计维度</label>
        <div className="grid grid-cols-4 gap-2">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              disabled={busy}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                mode === m.key
                  ? "border-bilibili/60 bg-bilibili/10"
                  : "border-ink-700 bg-ink-900 hover:border-ink-600"
              }`}
            >
              <div className={`text-sm font-medium ${mode === m.key ? "text-bilibili" : "text-ink-200"}`}>{m.label}</div>
              <div className="text-[11px] text-ink-400 mt-0.5">{m.hint}</div>
            </button>
          ))}
        </div>

        <label className="label mt-4">UID 列表（每行一个，或粘贴 JSON）</label>
        <textarea
          className="input h-24 font-mono resize-y"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
        <div className="flex items-center gap-3 mt-4">
          <button className="btn-primary" onClick={run} disabled={busy}>
            <Play className="w-4 h-4" />
            {busy ? "统计中…" : `开始统计（${uids.length} 个 uid）`}
          </button>
          {busy && (
            <div className="flex-1">
              <ProgressBar done={progress?.done ?? 0} total={progress?.total ?? 0} />
              <p className="text-xs text-ink-400 mt-1 truncate">{progress?.message}</p>
            </div>
          )}
        </div>
        <p className="text-xs text-ink-400 mt-3">
          当前模式：{modeMeta.label} —— {modeMeta.hint}。部分用户设置了隐私（点赞/投币不公开）会自动跳过并提示。
        </p>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-3 gap-4 mt-6">
            <StatCard label="成功用户" value={result.ok_count} accent="green" />
            <StatCard label="跳过用户" value={result.skipped.length} accent="amber" sub="隐私设置或风控" />
            <StatCard label="词条总量" value={totalWords} accent="cyan" sub={`${result.items.length} 种词`} />
          </div>

          {result.skipped.length > 0 && (
            <div className="card mt-4 p-4">
              <div className="text-xs text-ink-400 mb-2 font-semibold">跳过明细</div>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {result.skipped.map((s) => (
                  <div key={s.uid} className="text-xs flex gap-2">
                    <span className="font-mono text-ink-300">{s.uid}</span>
                    <span className="text-ink-400">{s.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {chartData.length > 0 && (
            <div className="card mt-4 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">词频排行（Top 15）</h3>
                <button className="btn-ghost !py-1.5" onClick={doExport}>
                  <Download className="w-3.5 h-3.5" /> 导出 CSV
                </button>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
                    <CartesianGrid stroke="#243044" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="word"
                      stroke="#7c8db0"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "#243044" }}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={56}
                    />
                    <YAxis stroke="#7c8db0" fontSize={11} tickLine={false} axisLine={false} width={40} />
                    <Tooltip
                      cursor={{ fill: "rgba(251,114,153,0.06)" }}
                      contentStyle={{ background: "#1a2333", border: "1px solid #33415c", borderRadius: 12, fontSize: 12 }}
                      formatter={(v) => [v, "次数"]}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={i === 0 ? "#FB7299" : `rgba(251,114,153,${Math.max(0.25, 1 - i * 0.06)})`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="card mt-4 overflow-hidden">
            <div className="px-4 py-3 border-b border-ink-700/60">
              <h3 className="text-sm font-semibold text-white">完整排行</h3>
            </div>
            <div className="overflow-y-auto max-h-96">
              <table className="w-full">
                <thead className="sticky top-0 bg-ink-800">
                  <tr>
                    <th className="th">排名</th>
                    <th className="th">词</th>
                    <th className="th">次数</th>
                    <th className="th">占比</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((it: WordFreqItem, i) => (
                    <tr key={it.word} className="border-t border-ink-700/40 hover:bg-ink-800/50">
                      <td className="td text-ink-400">{i + 1}</td>
                      <td className="td text-white">{it.word}</td>
                      <td className="td tabular-nums text-cyanic">{it.count}</td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 bg-ink-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-bilibili rounded-full"
                              style={{ width: `${totalWords ? (it.count / result.items[0].count) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-ink-400 tabular-nums">
                            {totalWords ? `${((it.count / totalWords) * 100).toFixed(1)}%` : "-"}
                          </span>
                        </div>
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
          <Empty text="选择统计维度并输入 uid 列表" icon={<BarChart3 className="w-8 h-8 opacity-40" />} />
        </div>
      )}
    </div>
  );
}
