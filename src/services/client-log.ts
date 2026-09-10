/**
 * ゲームログ (Client.txt) 診断の Tauri ラッパと、起動時の自動消し込み (2026-09-10)
 *
 * ログは放っておくと 200 MB 近くまで育つので、週 1 回「診断 → 要約を履歴に保存 → 本体を空にする」を
 * 自動で行う (オーナー指示: 溜まるとろくなことにならない)。件数の推移は履歴に残るので、
 * 「いつから VRAM 警告が増えたか」のような追跡はログを消しても続けられる。
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../utils/isTauriRuntime";

export interface DayCount {
  date: string;
  count: number;
}
export interface Finding {
  id: string;
  severity: "warn" | "notice" | "noise";
  title: string;
  advice: string | null;
  count: number;
  daily: DayCount[];
  sample: string;
}
export interface UnknownGroup {
  text: string;
  count: number;
}
export interface LogStatus {
  found: boolean;
  path: string | null;
  size_bytes: number;
  modified_at: number | null;
}
export interface LogDiagnosis {
  path: string;
  size_bytes: number;
  scanned_bytes: number;
  lines: number;
  first_ts: string | null;
  last_ts: string | null;
  crit: number;
  warn: number;
  info: number;
  debug: number;
  findings: Finding[];
  noise: Finding[];
  unknown: UnknownGroup[];
}
export interface HistoryFinding {
  id: string;
  title: string;
  severity: string;
  count: number;
}
export interface HistoryEntry {
  cleared_at: number;
  first_ts: string | null;
  last_ts: string | null;
  lines: number;
  size_bytes: number;
  findings: HistoryFinding[];
}
export interface RotateResult {
  cleared: boolean;
  reason: string;
  next_due_at: number | null;
}

export async function clientLogStatus(): Promise<LogStatus | null> {
  if (!isTauriRuntime()) return null;
  return invoke<LogStatus>("client_log_status");
}

export async function clientLogDiagnose(scanMb = 64): Promise<LogDiagnosis> {
  return invoke<LogDiagnosis>("client_log_diagnose", { scanMb });
}

export async function clientLogHistory(): Promise<HistoryEntry[]> {
  if (!isTauriRuntime()) return [];
  return invoke<HistoryEntry[]>("client_log_history");
}

/** 診断結果を履歴に残してログ本体を空にする */
export async function clientLogClear(d: LogDiagnosis): Promise<LogStatus> {
  const summary: Omit<HistoryEntry, "cleared_at"> = {
    first_ts: d.first_ts,
    last_ts: d.last_ts,
    lines: d.lines,
    size_bytes: d.size_bytes,
    findings: [...d.findings, ...d.noise].map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      count: f.count,
    })),
  };
  return invoke<LogStatus>("client_log_clear", { summary });
}

/** 起動時 1 回: 前回の消し込みから 7 日経っていれば自動で実行する */
let rotated = false;
export async function ensureClientLogRotated(): Promise<void> {
  if (!isTauriRuntime() || rotated) return;
  rotated = true;
  try {
    const r = await invoke<RotateResult>("client_log_auto_rotate", { days: 7 });
    if (r.cleared) console.log("[client-log] 週次の自動消し込みを実行しました");
    else if (r.reason !== "not-due" && r.reason !== "too-small") console.log("[client-log] 自動消し込み見送り:", r.reason);
  } catch (e) {
    console.warn("[client-log] auto rotate failed:", e);
  }
}
