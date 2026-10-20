/**
 * 覚えておく物 (state/state.json、git に入れない):
 *   feedback  … 起こした要望の id → 時刻 (同じ id は 1 回だけ)
 *   report    … 日 (JST) → "woke" | "missing" | "late" (日報で起こすのは 1 日 1 回、9:30 に無ければ "missing")
 *   lastMsg   … チャンネル → 最後に見た投稿の id (止まっていた間の取りこぼしを読み直す境)
 *   daily     … 日 (JST) → その日に起こした回数 (1 日の上限)
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function openState(dir) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "state.json");
  let s = { feedback: {}, report: {}, lastMsg: {}, daily: {} };
  try { s = { ...s, ...JSON.parse(readFileSync(file, "utf8")) }; } catch { /* 初回 */ }
  const save = () => {
    // 90 日より前の要望 id は捨てる (KV も 90 日で消える)
    const old = Date.now() - 90 * 864e5;
    for (const [id, at] of Object.entries(s.feedback)) if (Date.parse(at) < old) delete s.feedback[id];
    for (const m of [s.report, s.daily]) for (const day of Object.keys(m)) if (Date.parse(day) < old) delete m[day];
    writeFileSync(file + ".tmp", JSON.stringify(s, null, 1));
    renameSync(file + ".tmp", file);
  };
  return { s, save };
}

/** 日本時間の日付 "YYYY-MM-DD" と 時・分 */
export function jstNow(now = Date.now()) {
  const d = new Date(now + 9 * 3600e3);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours(), min: d.getUTCMinutes() };
}

/** Discord の投稿 id (snowflake) の大小 */
export const snowLess = (a, b) => BigInt(a) < BigInt(b);
