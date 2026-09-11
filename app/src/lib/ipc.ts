/**
 * Tauri IPC 封装。
 * 在浏览器中运行时自动切换为「演示模式」：返回内置示例数据，便于预览 UI。
 */
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const DEMO = !isTauri;

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (DEMO) {
    return demoInvoke<T>(cmd, args);
  }
  return tauriInvoke<T>(cmd, args);
}

export async function listen<T>(event: string, cb: (payload: T) => void): Promise<() => void> {
  if (DEMO) {
    return demoListen(event, cb as Listener);
  }
  const un = await tauriListen<T>(event, (e) => cb(e.payload));
  return () => un();
}

// ---------------- 演示模式 ----------------

import { demoGuardResult, demoUidRecords, demoWordFreq, demoSettings } from "./demoData";
import type { FansEvent, GuardResult, Settings, WordFreqResult, UidBatchResult } from "./types";

type Listener = (payload: unknown) => void;
const demoSubs = new Map<string, Set<Listener>>();

function demoEmit(event: string, payload: unknown) {
  demoSubs.get(event)?.forEach((cb) => cb(payload));
}

let demoMonitorTimer: ReturnType<typeof setInterval> | null = null;
let demoMonitorFollower = 128456;
let demoMonitorNew = 0;
const demoMonitorRecords: { time: string; follower: number; new_count: number }[] = [];

function demoInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  switch (cmd) {
    case "get_settings":
      return Promise.resolve(demoSettings as T);
    case "save_settings":
      return Promise.resolve(undefined as T);
    case "test_cookie":
      return sleep(400).then(
        () =>
          ({
            logged_in: (args as any)?.demoLogin ?? demoSettings.__demoLoggedIn,
            uname: "蜻蜓碰水",
            mid: 34503997,
            vip_type: 1,
          } as T),
      );
    case "fetch_guard":
      return (async () => {
        const total = demoGuardResult.entries.length;
        for (let i = 1; i <= 3; i++) {
          await sleep(350);
          demoEmit("task-progress", { task: "guard", done: Math.round((total * i) / 3), total, message: `第 ${i} 页` });
        }
        return demoGuardResult as T;
      })();
    case "fetch_uid_batch": {
      return (async () => {
        const mids = ((args as any)?.mids ?? []) as number[];
        const total = mids.length;
        const records: any[] = [];
        const failed: any[] = [];
        for (let i = 0; i < total; i++) {
          await sleep(220);
          const rec = { ...demoUidRecords[i % demoUidRecords.length] };
          rec.uid = mids[i];
          records.push(rec);
          demoEmit("task-progress", {
            task: "uid",
            done: i + 1,
            total,
            message: `${rec["昵称"]} (uid ${mids[i]}) ✓`,
          });
        }
        return { records, failed } as T;
      })();
    }
    case "start_fans_monitor": {
      const uid = (args as any)?.uid ?? 0;
      demoEmit("fans-event", { uid, kind: "started", anchor_name: "永雏塔菲", time: nowStr() });
      // 预置一段历史曲线，演示更直观
      if (demoMonitorRecords.length === 0) {
        let base = 127900;
        for (let i = 12; i > 0; i--) {
          base += Math.floor(Math.random() * 40) + 8;
          const d = new Date(Date.now() - i * 10 * 60000);
          demoMonitorRecords.push({ time: demoTimeStr(d), follower: base, new_count: Math.floor(Math.random() * 5) });
        }
        demoMonitorFollower = base;
      }
      let count = 0;
      demoMonitorTimer = setInterval(() => {
        count++;
        demoMonitorFollower += Math.floor(Math.random() * 12);
        const newFans = Math.random() > 0.6 ? [{ time: nowStr(), mid: 100000 + demoMonitorNew++, uname: "新粉丝" + demoMonitorNew }] : [];
        demoMonitorRecords.push({ time: nowStr(), follower: demoMonitorFollower, new_count: newFans.length });
        if (demoMonitorRecords.length > 200) demoMonitorRecords.shift();
        demoEmit("fans-event", {
          uid,
          kind: count === 1 ? "baseline" : "update",
          time: nowStr(),
          follower: demoMonitorFollower,
          known_count: demoMonitorFollower - 120000,
          new_fans: newFans,
          logged_in: true,
          records: [...demoMonitorRecords],
          recent_new: newFans,
        });
      }, 2000);
      return Promise.resolve(undefined as T);
    }
    case "stop_fans_monitor": {
      if (demoMonitorTimer) clearInterval(demoMonitorTimer);
      demoMonitorTimer = null;
      demoEmit("fans-event", { uid: (args as any)?.uid ?? 0, kind: "stopped", time: nowStr() });
      return Promise.resolve(undefined as T);
    }
    case "get_fans_record":
      return Promise.resolve({ uid: 0, anchor_name: "", known: {}, records: [], new_log: [] } as T);
    case "fetch_wordfreq": {
      return (async () => {
        const mids = ((args as any)?.mids ?? []) as number[];
        const total = Math.max(mids.length, 1);
        for (let i = 0; i < total; i++) {
          await sleep(260);
          demoEmit("task-progress", { task: "freq", done: i + 1, total, message: `uid ${mids[i] ?? 0} ✓` });
        }
        // 跳过者取自输入列表（演示：最后一个 uid 设置了隐私）
        const skippedMid = mids.length > 1 ? mids[mids.length - 1] : 999;
        return {
          mode: (args as any)?.mode ?? "like",
          items: demoWordFreq,
          per_uid: {},
          skipped: [{ uid: skippedMid, error: "该用户隐私设置未公开，无法抓取" }],
          ok_count: Math.max(mids.length - 1, 0),
        } as WordFreqResult as T;
      })();
    }
    case "save_text_file":
      return sleep(300).then(() => "~/Downloads/示例导出.json" as T);
    default:
      return Promise.reject(new Error(`演示模式不支持命令: ${cmd}`));
  }
}

function nowStr() {
  return demoTimeStr(new Date());
}

function demoTimeStr(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function demoListen(event: string, cb: Listener): Promise<() => void> {
  if (!demoSubs.has(event)) demoSubs.set(event, new Set());
  demoSubs.get(event)!.add(cb);
  return Promise.resolve(() => demoSubs.get(event)?.delete(cb));
}

// 为类型引用保留
export type { FansEvent, GuardResult, Settings, UidBatchResult };
