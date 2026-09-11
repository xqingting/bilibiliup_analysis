import { invoke, isTauri } from "./ipc";

/** 通用导出：优先走系统另存为对话框；浏览器内回退为下载 */
export async function exportText(defaultName: string, contents: string): Promise<string | null> {
  if (isTauri) {
    const saved = await invoke<string | null>("save_text_file", { defaultName, contents });
    return saved ?? null;
  }
  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return defaultName;
}

export async function exportJson(defaultName: string, data: unknown): Promise<string | null> {
  return exportText(defaultName, JSON.stringify(data, null, 2));
}

/** Excel 友好的 CSV：UTF-8 BOM */
export function toCsv(headers: string[], rows: (string | number | boolean)[][]): string {
  const esc = (v: string | number | boolean) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}
