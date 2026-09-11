import { useEffect, useRef, useState } from "react";
import { CircleStop, Play, Radio } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { invoke, listen } from "../lib/ipc";
import type { FansEvent, FansNew, FansRecord, FansSnapshot } from "../lib/types";
import { Empty, PageHeader, StatCard, useToast } from "../components/ui";

export default function MonitorPage() {
  const toast = useToast();
  const [uidInput, setUidInput] = useState("401742377");
  const [intervalMin, setIntervalMin] = useState(10);
  const [monitoring, setMonitoring] = useState(false);
  const [anchorName, setAnchorName] = useState("");
  const [follower, setFollower] = useState<number | null>(null);
  const [knownCount, setKnownCount] = useState(0);
  const [loggedIn, setLoggedIn] = useState(true);
  const [series, setSeries] = useState<FansSnapshot[]>([]);
  const [newFans, setNewFans] = useState<FansNew[]>([]);
  const uidRef = useRef<number>(0);

  useEffect(() => {
    const un = listen<FansEvent>("fans-event", (ev) => {
      if (ev.uid !== uidRef.current) return;
      if (ev.kind === "started") {
        setAnchorName(ev.anchor_name ?? "");
        setMonitoring(true);
      } else if (ev.kind === "stopped") {
        setMonitoring(false);
      } else {
        if (ev.follower !== undefined) setFollower(ev.follower);
        if (ev.known_count !== undefined) setKnownCount(ev.known_count);
        if (ev.logged_in !== undefined) setLoggedIn(ev.logged_in);
        if (ev.records) setSeries(ev.records);
        if (ev.new_fans && ev.new_fans.length > 0) {
          setNewFans((prev) => [...ev.new_fans!, ...prev].slice(0, 500));
        }
      }
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  async function start() {
    const uid = parseInt(uidInput, 10);
    if (!uid || uid <= 0) {
      toast("error", "请输入有效的主播 UID");
      return;
    }
    if (intervalMin < 1) {
      toast("error", "监控间隔至少 1 分钟");
      return;
    }
    uidRef.current = uid;
    setSeries([]);
    setNewFans([]);
    setFollower(null);
    // 恢复本地历史
    try {
      const rec = await invoke<FansRecord>("get_fans_record", { uid });
      if (rec.anchor_name) setAnchorName(rec.anchor_name);
      if (rec.records?.length) setSeries(rec.records.slice(-200));
      if (rec.new_log?.length) setNewFans(rec.new_log.slice(-500).reverse());
      if (rec.known) setKnownCount(Object.keys(rec.known).length);
    } catch {
      /* 首次监控没有历史 */
    }
    try {
      await invoke("start_fans_monitor", { uid, intervalSecs: intervalMin * 60 });
      setMonitoring(true);
      toast("info", `已开始监控 uid ${uid}，每 ${intervalMin} 分钟轮询一次`);
    } catch (e) {
      toast("error", String(e));
    }
  }

  async function stop() {
    await invoke("stop_fans_monitor", { uid: uidRef.current }).catch(() => {});
    setMonitoring(false);
  }

  const chartData = series.map((s) => ({
    // 含秒级时间，避免密集采样时 X 轴刻度重复
    time: s.time.slice(5),
    follower: s.follower,
  }));

  // 粉丝数跨度小时（监控场景）用精确数字刻度，避免万单位精度不足导致刻度重复
  const followerSpan =
    chartData.length > 1
      ? Math.max(...chartData.map((d) => d.follower)) - Math.min(...chartData.map((d) => d.follower))
      : 0;
  const fmtY = (v: number) =>
    followerSpan >= 100000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString();

  return (
    <div>
      <PageHeader title="粉丝监控" desc="定时轮询粉丝变化，新增粉丝实时记录（数据保存于本机）" icon={<Radio className="w-5 h-5" />} />

      <div className="card p-5">
        <div className="grid grid-cols-[1fr_140px_auto] gap-3 items-end">
          <div>
            <label className="label">主播 UID</label>
            <input
              className="input font-mono"
              placeholder="例如 401742377"
              value={uidInput}
              onChange={(e) => setUidInput(e.target.value)}
              disabled={monitoring}
            />
          </div>
          <div>
            <label className="label">间隔（分钟）</label>
            <input
              className="input"
              type="number"
              min={1}
              max={120}
              value={intervalMin}
              onChange={(e) => setIntervalMin(parseInt(e.target.value, 10) || 10)}
              disabled={monitoring}
            />
          </div>
          {monitoring ? (
            <button className="btn-danger h-[38px]" onClick={stop}>
              <CircleStop className="w-4 h-4" /> 停止监控
            </button>
          ) : (
            <button className="btn-primary h-[38px]" onClick={start}>
              <Play className="w-4 h-4" /> 开始监控
            </button>
          )}
        </div>
        {monitoring && (
          <div className="flex items-center gap-2 mt-4 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-emerald-400 font-medium">监控运行中</span>
            {anchorName && <span className="text-ink-400">· {anchorName}（uid {uidRef.current}）</span>}
            {!loggedIn && <span className="text-amber-400">· 匿名模式：仅监控粉丝数变化，新增名单需登录 Cookie</span>}
          </div>
        )}
      </div>

      {monitoring || follower !== null || series.length > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-4 mt-6">
            <StatCard label="当前粉丝数" value={follower === null ? "—" : follower.toLocaleString()} accent="pink" />
            <StatCard label="已记录粉丝" value={knownCount.toLocaleString()} accent="cyan" sub={loggedIn ? "最近 ~1000 名（平台限制）" : "需登录 Cookie"} />
            <StatCard label="本轮新增" value={newFans.length} accent="green" />
          </div>

          <div className="card mt-6 p-5">
            <h3 className="text-sm font-semibold text-white mb-4">粉丝数曲线</h3>
            {chartData.length > 1 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
                    <CartesianGrid stroke="#243044" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="time" stroke="#7c8db0" fontSize={11} tickLine={false} axisLine={{ stroke: "#243044" }} />
                    <YAxis
                      stroke="#7c8db0"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      domain={["auto", "auto"]}
                      tickFormatter={fmtY}
                      width={72}
                    />
                    <Tooltip
                      contentStyle={{ background: "#1a2333", border: "1px solid #33415c", borderRadius: 12, fontSize: 12 }}
                      labelStyle={{ color: "#a5b3cf" }}
                      formatter={(v) => [Number(v).toLocaleString(), "粉丝数"]}
                    />
                    <Line type="monotone" dataKey="follower" stroke="#FB7299" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty text="正在等待下一轮轮询数据…" />
            )}
          </div>

          <div className="card mt-4 overflow-hidden">
            <div className="px-4 py-3 border-b border-ink-700/60">
              <h3 className="text-sm font-semibold text-white">新增粉丝记录</h3>
            </div>
            {newFans.length === 0 ? (
              <Empty text={loggedIn ? "暂无新增，监控持续中…" : "匿名模式只能监控粉丝数变化；粘贴登录 Cookie 后可记录每位新粉丝"} />
            ) : (
              <div className="overflow-y-auto max-h-80">
                <table className="w-full">
                  <thead className="sticky top-0 bg-ink-800">
                    <tr>
                      <th className="th">时间</th>
                      <th className="th">UID</th>
                      <th className="th">昵称</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newFans.map((f, i) => (
                      <tr key={`${f.mid}-${i}`} className="border-t border-ink-700/40 hover:bg-ink-800/50">
                        <td className="td text-ink-400 font-mono text-xs">{f.time}</td>
                        <td className="td font-mono text-cyanic">{f.mid}</td>
                        <td className="td text-white">{f.uname}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="card mt-6">
          <Empty text="输入主播 UID 并开始监控" icon={<Radio className="w-8 h-8 opacity-40" />} />
        </div>
      )}
    </div>
  );
}
