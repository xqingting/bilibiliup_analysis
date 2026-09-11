import { useEffect, useState } from "react";
import { Cookie, KeyRound, Save, ShieldCheck, Timer } from "lucide-react";
import { invoke } from "../lib/ipc";
import type { CookieTestResult, Settings } from "../lib/types";
import { PageHeader, useToast } from "../components/ui";

export default function SettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [test, setTest] = useState<CookieTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke<Settings>("get_settings")
      .then(setSettings)
      .catch((e) => toast("error", String(e)));
  }, []);

  if (!settings) {
    return (
      <div>
        <PageHeader title="设置" desc="登录 Cookie 与抓取参数" icon={<KeyRound className="w-5 h-5" />} />
        <div className="card p-6 text-sm text-ink-400">加载中…</div>
      </div>
    );
  }

  async function save() {
    setSaving(true);
    try {
      await invoke("save_settings", { settings });
      toast("success", "设置已保存");
    } catch (e) {
      toast("error", String(e));
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      // 先保存再测试，保证测试的是当前输入
      await invoke("save_settings", { settings });
      const r = await invoke<CookieTestResult>("test_cookie");
      setTest(r);
    } catch (e) {
      setTest({ logged_in: false, uname: "", mid: 0, vip_type: -1 });
      toast("error", String(e));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div>
      <PageHeader title="设置" desc="登录 Cookie 与抓取参数" icon={<KeyRound className="w-5 h-5" />} />

      <div className="card p-5">
        <div className="flex items-center justify-between">
          <label className="label !mb-0 flex items-center gap-1.5">
            <Cookie className="w-3.5 h-3.5 text-bilibili" /> 登录 Cookie（可选，但强烈推荐）
          </label>
          {test && (
            <span
              className={`badge ${
                test.logged_in ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
              }`}
            >
              {test.logged_in ? `有效 · ${test.uname}` : "未登录 / 匿名"}
            </span>
          )}
        </div>
        <textarea
          className="input h-24 font-mono text-xs !leading-relaxed resize-y mt-1.5"
          placeholder="粘贴方式：浏览器登录 B 站 → F12 → Network → 任一 api.bilibili.com 请求 → Request Headers → 复制整段 Cookie 值（需包含 SESSDATA=…）"
          value={settings.cookie}
          onChange={(e) => setSettings({ ...settings, cookie: e.target.value })}
        />
        <div className="flex items-center gap-2 mt-3">
          <button className="btn-ghost" onClick={runTest} disabled={testing}>
            <ShieldCheck className="w-4 h-4" />
            {testing ? "检测中…" : "保存并检测登录态"}
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            <Save className="w-4 h-4" />
            {saving ? "保存中…" : "保存设置"}
          </button>
        </div>
        <ul className="text-xs text-ink-400 mt-4 space-y-1.5 leading-relaxed list-disc list-inside">
          <li>Cookie 仅保存在<b className="text-ink-300">本机</b>应用数据目录（settings.json），不会上传到任何服务器。</li>
          <li>匿名模式下：航海榜、点赞/投币/追番词频可用；UID 资料走 card 降级；粉丝列表（新增名单）不可用。</li>
          <li>登录后：UID 完整资料（生日/学校/勋章）、粉丝列表精确监控、投稿分区词频全部解锁。</li>
          <li>建议使用小号；SESSDATA 长期有效但可在账号安全设置中随时失效。</li>
        </ul>
      </div>

      <div className="card p-5 mt-4">
        <label className="label flex items-center gap-1.5">
          <Timer className="w-3.5 h-3.5 text-cyanic" /> 抓取行为
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-ink-300 mb-1">请求最小间隔（毫秒）</div>
            <input
              className="input"
              type="number"
              min={80}
              max={5000}
              step={20}
              value={settings.interval_ms}
              onChange={(e) => setSettings({ ...settings, interval_ms: parseInt(e.target.value, 10) || 300 })}
            />
            <div className="text-[11px] text-ink-400 mt-1">值越大越保守。被风控时可调到 800~1500。</div>
          </div>
          <div>
            <div className="text-xs text-ink-300 mb-1">风控重试次数</div>
            <input
              className="input"
              type="number"
              min={1}
              max={10}
              value={settings.max_retries}
              onChange={(e) => setSettings({ ...settings, max_retries: parseInt(e.target.value, 10) || 4 })}
            />
            <div className="text-[11px] text-ink-400 mt-1">遇到 -352/-412 时指数退避重试的次数。</div>
          </div>
        </div>
      </div>
    </div>
  );
}
