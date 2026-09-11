import { useCallback, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  BarChart3,
  Gauge,
  HeartHandshake,
  ListOrdered,
  Radio,
  Settings as SettingsIcon,
  Tv,
  Users,
} from "lucide-react";
import { ToastContext, ToastStack, DemoBanner, type ToastMsg } from "./components/ui";
import Dashboard from "./pages/Dashboard";
import GuardPage from "./pages/GuardPage";
import UidPage from "./pages/UidPage";
import MonitorPage from "./pages/MonitorPage";
import FreqPage from "./pages/FreqPage";
import SettingsPage from "./pages/SettingsPage";

const NAV = [
  { to: "/", label: "仪表盘", icon: Gauge, end: true },
  { to: "/guard", label: "航海榜", icon: Tv, end: false },
  { to: "/uid", label: "UID 批量抓取", icon: Users, end: false },
  { to: "/monitor", label: "粉丝监控", icon: Radio, end: false },
  { to: "/freq", label: "词频统计", icon: BarChart3, end: false },
  { to: "/settings", label: "设置", icon: SettingsIcon, end: false },
];

let toastSeq = 1;

export default function App() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toast = useCallback((kind: ToastMsg["kind"], text: string) => {
    const id = toastSeq++;
    setToasts((ts) => [...ts.slice(-4), { id, kind, text }]);
    if (kind !== "error") {
      setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 5000);
    }
  }, []);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  return (
    <ToastContext.Provider value={toast}>
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <DemoBanner />
          <div className="p-6 max-w-6xl mx-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/guard" element={<GuardPage />} />
              <Route path="/uid" element={<UidPage />} />
              <Route path="/monitor" element={<MonitorPage />} />
              <Route path="/freq" element={<FreqPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </div>
        </main>
      </div>
      <ToastStack toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function Sidebar() {
  const loc = useLocation();
  return (
    <aside className="w-56 shrink-0 border-r border-ink-700/60 bg-ink-900/60 flex flex-col">
      <div className="px-5 pt-6 pb-5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-bilibili to-fuchsia-500 flex items-center justify-center shadow-lg shadow-bilibili/30">
          <Tv className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="font-bold text-white text-sm leading-tight">B站UP主</div>
          <div className="font-bold text-white text-sm leading-tight">数据分析工坊</div>
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {NAV.map(({ to, label, icon: Icon, end }) => {
          const active = end ? loc.pathname === to : loc.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                active
                  ? "bg-bilibili/15 text-bilibili font-semibold"
                  : "text-ink-300 hover:bg-ink-800 hover:text-white"
              }`}
            >
              <Icon className="w-4.5 h-4.5 w-[18px] h-[18px]" />
              {label}
            </NavLink>
          );
        })}
      </nav>
      <div className="p-4 border-t border-ink-700/60">
        <div className="flex items-center gap-2 text-[11px] text-ink-400">
          <HeartHandshake className="w-3.5 h-3.5" />
          <span>v2.0 · 重构自 bilibiliup_analysis</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ink-400 mt-1">
          <ListOrdered className="w-3.5 h-3.5" />
          <span>旧脚本已归档至 legacy/</span>
        </div>
      </div>
    </aside>
  );
}
