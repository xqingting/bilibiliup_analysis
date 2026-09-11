import { createContext, useContext, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

// ---------- Toast ----------

export interface ToastMsg {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
}

export const ToastContext = createContext<(kind: ToastMsg["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastStack({ toasts, dismiss }: { toasts: ToastMsg[]; dismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 w-96 max-w-[90vw]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`card flex items-start gap-3 px-4 py-3 shadow-xl shadow-black/40 animate-[slideIn_.2s_ease-out] ${
            t.kind === "error"
              ? "border-red-500/40"
              : t.kind === "success"
                ? "border-emerald-500/40"
                : "border-ink-600"
          }`}
        >
          {t.kind === "error" ? (
            <AlertTriangle className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />
          ) : t.kind === "success" ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
          ) : (
            <Info className="w-4 h-4 mt-0.5 text-cyan-400 shrink-0" />
          )}
          <div className="text-sm text-ink-200 leading-relaxed flex-1 break-all">{t.text}</div>
          <button onClick={() => dismiss(t.id)} className="text-ink-400 hover:text-ink-200 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------- 布局组件 ----------

export function PageHeader({
  title,
  desc,
  icon,
  children,
}: {
  title: string;
  desc?: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-bilibili/10 border border-bilibili/30 flex items-center justify-center text-bilibili">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold text-white">{title}</h1>
          {desc && <p className="text-sm text-ink-400 mt-0.5">{desc}</p>}
        </div>
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: "pink" | "cyan" | "green" | "amber";
}) {
  const colors = {
    pink: "text-bilibili",
    cyan: "text-cyanic",
    green: "text-emerald-400",
    amber: "text-amber-400",
  };
  return (
    <div className="card px-5 py-4">
      <div className="text-xs text-ink-400">{label}</div>
      <div className={`text-2xl font-bold mt-1 tabular-nums ${colors[accent ?? "pink"]}`}>{value}</div>
      {sub && <div className="text-[11px] text-ink-400 mt-1">{sub}</div>}
    </div>
  );
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-ink-400 mb-1">
        <span>{total > 0 ? `${done} / ${total}` : "准备中…"}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-ink-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-bilibili to-fuchsia-400 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function Empty({ text, icon }: { text: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-ink-400 gap-3">
      {icon ?? <Info className="w-10 h-10 opacity-50" />}
      <p className="text-sm">{text}</p>
    </div>
  );
}

export function DemoBanner() {
  const isDemo = typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);
  if (!isDemo) return null;
  return (
    <div className="mx-6 mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300 flex items-center gap-2">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      浏览器演示模式：展示的是内置示例数据。请通过 Tauri 桌面应用运行以进行真实抓取。
    </div>
  );
}
