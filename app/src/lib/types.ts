export interface GuardEntry {
  uid: number;
  username: string;
  face: string;
  guard_level: number;
  medal_name: string;
  medal_level: number;
  medal_target_id: number;
  medal_color: string;
}

export interface GuardResult {
  room_id: number;
  short_room_id: number;
  ruid: number;
  anchor_name: string;
  live_status: number;
  total: number;
  entries: GuardEntry[];
}

export interface GuardNameEntry {
  uid: number;
  username: string;
  guard_level: number;
}

export interface ProgressEvent {
  task: string;
  done: number;
  total: number;
  message: string;
}

/** 与旧版 解读.json 兼容的中文字段 */
export interface LegacyUserRecord {
  uid: number;
  昵称: string;
  性别: string;
  生日: string;
  签名: string;
  等级: number;
  粉丝数: number;
  关注数: number;
  投稿数: number;
  获赞数: number;
  大会员状态: string;
  大会员类型: string;
  学校: string;
  佩戴粉丝勋章: boolean | string;
  粉丝勋章名称: string;
  粉丝勋章等级: number;
  粉丝勋章所属UP的mid: number;
  认证类型: string;
  所属机构: string;
  source?: "full" | "card";
}

export interface UidBatchResult {
  records: LegacyUserRecord[];
  failed: { uid: number; error: string }[];
}

export interface FansSnapshot {
  time: string;
  follower: number;
  new_count: number;
}

export interface FansNew {
  time: string;
  mid: number;
  uname: string;
}

export interface FansRecord {
  uid: number;
  anchor_name: string;
  known: Record<string, string>;
  records: FansSnapshot[];
  new_log: FansNew[];
}

export interface FansEvent {
  uid: number;
  kind: "started" | "baseline" | "update" | "stopped";
  time: string;
  anchor_name?: string;
  follower?: number;
  known_count?: number;
  new_fans?: FansNew[];
  logged_in?: boolean;
  records?: FansSnapshot[];
  recent_new?: FansNew[];
}

export interface WordFreqItem {
  word: string;
  count: number;
}

export interface WordFreqResult {
  mode: string;
  items: WordFreqItem[];
  per_uid: Record<string, Record<string, number>>;
  skipped: { uid: number; error: string }[];
  ok_count: number;
}

export interface Settings {
  cookie: string;
  interval_ms: number;
  max_retries: number;
  /** 仅演示模式使用 */
  __demoLoggedIn?: boolean;
}

export interface CookieTestResult {
  logged_in: boolean;
  uname: string;
  mid: number;
  vip_type: number;
}

export const GUARD_LEVEL_NAMES: Record<number, string> = {
  3: "总督",
  2: "提督",
  1: "舰长",
};
