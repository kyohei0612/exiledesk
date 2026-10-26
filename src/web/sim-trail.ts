/**
 * シミュの操作の流れ (2026-10-26 夜オーナー「どこで躓いたかが全く分からんから、全てにおいて監視を付ける形で、シミュ」)。
 * 1 訪問の中で操作を端末に貯め、シミュの画面から出た時・タブを隠した / 閉じた時に D1 の sim_trail を 1 件だけ (形はサーバー 5 と決めた)。
 *   { v: 1, from: 最初に入った画面, ops: [[秒, 画面, 操作, 詳しく?], …], last: 最後の操作, end: "page" | "leave" | "full" }
 * 記録は離れる時の 1 便 (log-sender、1 時間に 1 回まで) に乗るので D1 の行は増えない。300 件で 1 度出して空にする (full)。
 * 中身は短い英語の操作名と 40 文字までの詳しく (ベース名・手の種類・エラーの頭など) だけ。レシピの中身・自由に打った文字・名前は入れない。
 * 呼ぶのはシミュの画面 (simOp) と track.ts (ページの出入り・エラー・回す)
 */
import { logRecord } from "../utils/log-record";

const MAX_OPS = 300;
type Op = [number, string, string] | [number, string, string, string];

const t0 = Date.now();
/** 今いるシミュの画面 (tree / sim-base / sim-mods / recipes / sim-<工程>)。シミュの外なら null */
let cur: string | null = null;
let enteredAt = 0;
let from: string | null = null;
let ops: Op[] = [];
let last = "";
const sec = (): number => Math.round((Date.now() - t0) / 1000);
/** シミュの画面にいるか (エラーはシミュにいる時の物だけ残す) */
export const onSim = (): boolean => cur !== null;

/** シミュの操作を 1 つ (op は短い英語: pick-base・add-hand・cancel・run など。detail は 40 文字まで) */
export function simOp(op: string, detail?: string | number): void {
  const d = detail == null || detail === "" ? null : String(detail).slice(0, 40);
  ops.push(d ? [sec(), cur ?? "-", op, d] : [sec(), cur ?? "-", op]);
  last = op;
  if (ops.length >= MAX_OPS) emit("full");
}

function emit(end: "page" | "leave" | "full"): void {
  if (!ops.length) return;
  logRecord("sim_trail", { v: 1, from, ops: ops.splice(0), last, end });
}

/** page.ts のページの印 (track の page:*) から。シミュの画面に入った・出た (何秒いたか) を残し、シミュから出たら 1 件出す */
export function simPage(name: string, extra?: string): void {
  const to = name === "page:tree" ? "tree" : name === "page:sim-base" ? "sim-base" : name === "page:sim-mods" ? "sim-mods" : name === "page:recipes" ? "recipes" : name === "page:sim" && extra ? `sim-${extra}` : null;
  if (to === cur) return;
  if (cur) simOp("exit", Math.round((Date.now() - enteredAt) / 1000));
  cur = to;
  enteredAt = Date.now();
  if (to) { from ??= to; simOp("enter"); } else emit("page");
}

/** タブを隠した・閉じた時 (track.ts の pull から。log-sender が送る直前に呼ぶので同じ便に乗る) */
export function simLeave(): void {
  if (cur) simOp("hide", Math.round((Date.now() - enteredAt) / 1000));
  emit("leave");
  // 戻ってきたら、その画面にいた秒はそこから数え直す
  enteredAt = Date.now();
}
