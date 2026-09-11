import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, Cookie, Radio, Tv, Users, Workflow } from "lucide-react";
import { invoke } from "../lib/ipc";
import type { CookieTestResult } from "../lib/types";
import { PageHeader, StatCard } from "../components/ui";

export default function Dashboard() {
  const [cookie, setCookie] = useState<CookieTestResult | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    invoke<CookieTestResult>("test_cookie")
      .then(setCookie)
      .catch(() => setCookie(null))
      .finally(() => setChecking(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="仪表盘"
        desc="B站UP主数据分析工坊 · 一站式抓取航海榜、粉丝、UID资料与词频"
      />

      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="登录状态"
          value={checking ? "检测中…" : cookie?.logged_in ? "已登录" : "匿名模式"}
          sub={
            checking
              ? ""
              : cookie?.logged_in
                ? `欢迎，${cookie.uname}（uid ${cookie.mid}）`
                : "可在「设置」粘贴 Cookie 以解锁完整数据"
          }
          accent={cookie?.logged_in ? "green" : "amber"}
        />
        <StatCard label="风控策略" value="Wbi 签名 + 访客 Cookie" sub="自动重试 / 指数退避 / 频率限制" accent="cyan" />
        <StatCard label="数据兼容" value="旧版解读.json" sub="导出格式与 legacy 脚本一致" accent="pink" />
      </div>

      <div className="grid grid-cols-2 gap-4 mt-6">
        <FeatureCard
          to="/guard"
          icon={<Tv className="w-5 h-5" />}
          title="航海榜抓取"
          desc="输入直播间链接或房间号，一键抓取全部大航海（总督/提督/舰长）名单，含粉丝勋章信息，支持 JSON/CSV 导出。匿名可用。"
          tag="匿名可用"
        />
        <FeatureCard
          to="/uid"
          icon={<Users className="w-5 h-5" />}
          title="UID 批量抓取"
          desc="批量抓取用户资料（等级/粉丝数/投稿/获赞/大会员/勋章等）。匿名走 card 降级；登录 Cookie 可抓完整字段。"
          tag="登录增强"
        />
        <FeatureCard
          to="/monitor"
          icon={<Radio className="w-5 h-5" />}
          title="粉丝监控"
          desc="定时轮询粉丝变化：匿名监控粉丝数曲线；登录后可精确记录每一位新增粉丝的昵称与时间，数据本地持久化。"
          tag="后台任务"
        />
        <FeatureCard
          to="/freq"
          icon={<BarChart3 className="w-5 h-5" />}
          title="词频统计"
          desc="批量统计一群用户的投稿/点赞/投币分区或追番标题的词频分布，聚合生成排行，用于分析群体兴趣画像。"
          tag="匿名可用"
        />
      </div>

      <div className="card mt-6 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-white mb-2">
          <Workflow className="w-4 h-4 text-bilibili" /> 典型工作流
        </div>
        <div className="flex items-center gap-2 flex-wrap text-sm text-ink-300">
          <Step n={1} text="航海榜抓取舰长名单" />
          <ArrowRight className="w-3.5 h-3.5 text-ink-400" />
          <Step n={2} text="导出 uid 列表" />
          <ArrowRight className="w-3.5 h-3.5 text-ink-400" />
          <Step n={3} text="UID 批量抓取资料" />
          <ArrowRight className="w-3.5 h-3.5 text-ink-400" />
          <Step n={4} text="词频统计兴趣画像" />
        </div>
        <p className="text-xs text-ink-400 mt-3 leading-relaxed">
          提示：B 站自 2023 年起对用户资料、粉丝列表等接口启用强制风控（-352/-403）。
          匿名模式下本工具自动降级到仍可用的接口；粘贴登录 Cookie 后即可恢复旧版脚本的完整抓取能力。
          <Cookie className="inline w-3.5 h-3.5 mx-1 -mt-0.5" />
          Cookie 仅保存在本机应用数据目录，不会上传。
        </p>
      </div>
    </div>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-ink-800 border border-ink-700 rounded-lg px-2.5 py-1.5">
      <span className="w-4 h-4 rounded bg-bilibili/20 text-bilibili text-[10px] font-bold flex items-center justify-center">
        {n}
      </span>
      {text}
    </span>
  );
}

function FeatureCard({
  to,
  icon,
  title,
  desc,
  tag,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  tag: string;
}) {
  return (
    <Link
      to={to}
      className="card p-5 group hover:border-bilibili/40 transition-colors relative overflow-hidden"
    >
      <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-bilibili/5 group-hover:bg-bilibili/10 transition-colors" />
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl bg-bilibili/10 border border-bilibili/30 text-bilibili flex items-center justify-center">
          {icon}
        </div>
        <span className="badge bg-ink-700/60 text-ink-300">{tag}</span>
      </div>
      <h3 className="font-semibold text-white mt-3 flex items-center gap-1.5">
        {title}
        <ArrowRight className="w-4 h-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-bilibili" />
      </h3>
      <p className="text-sm text-ink-400 mt-1.5 leading-relaxed">{desc}</p>
    </Link>
  );
}
