/**
 * history.ts — 画面ごとの履歴 (2026-09-30 オーナー「全てにおいて履歴、ログはあとからおかしいってなった時に即見れるような作りにすべき」)
 *
 * 計算した時の入力と結果を app_data_dir/history/<feature>.jsonl に 1 行ずつ残す (Rust の app_log::history_write)。
 * 「リリース版でおかしい」と言われた時に、画面を見なくてもその時の条件で組み直せるようにするのが目的。
 *   - 同じ中身が続けて来たら書かない (相場の取り直しで同じ計算が何度も走るため)
 *   - Tauri の外 (ブラウザ・テスト) では何もしない
 *   - 失敗しても画面は止めない
 * 残す物の決まり: その画面の「入力」(ベース・狙い・設定) と「結果」(選んだ経路・値段・件数) を、後から同じ計算を再現できる粒度で。
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../utils/isTauriRuntime";

const last = new Map<string, string>();

export function recordHistory(feature: string, event: string, data: Record<string, unknown>): void {
  if (!isTauriRuntime()) return;
  let body: string;
  try {
    body = JSON.stringify(data);
  } catch {
    return;
  }
  const key = `${feature}:${event}`;
  if (last.get(key) === body) return;
  last.set(key, body);
  void invoke("history_write", { feature, entry: { event, ...JSON.parse(body) } }).catch(() => undefined);
}
