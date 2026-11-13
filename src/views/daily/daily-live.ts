/**
 * daily-live.ts — 挑戦中の人の木と動作の控えをサーバーへ (D-57b、スイッチ dailyLive。オーナー 11-12「レシピに保存しなくてもこっちで見れるように」
 * 「その人の動作を全部書き込めばいいのでは」)。提出しなかった人・諦めた人・回しただけの人の木も、こちらで再現できるようにする。
 * 木 = 端末の控えの tree (提出と同じ形、シミュでそのまま開ける) の最新を上書き。動作 = 下の形の列を全部 (サーバーが後ろへ足す)。
 *   { t: 始めてからの秒, k: 種類, … }
 *   k = open (木を開いた)・pick (始め方とフラクチャーの MOD)・restart (スタートからやり直す)・hand (箱に手を置いた・替えた)・hand-off (手を消した)・
 *       done / undone (完成の印)・boxes (箱の増減だけ)・undo / redo・run (100 人回した結果)・ev (回す・穴チェックなどの押した印、track の名前)・leave (離れた)
 * 送るのは木か動作が変わってから 15 秒まとめて 1 回 + 離れる時に 1 回 (Y-100 の例外、D-57)。終わった挑戦 (提出・諦め・時間切れ) では送らない。
 * 木の中身の見比べは置いた手と完成の印だけ (箱の場所・見た目だけの違いは動作に数えない)
 */
import type { Hand, TreeDoc } from "../../services/simulator/tree/tree-model";
import { flag } from "../../web/release-flags";
import { trailNow } from "../../web/track";
import { livePost } from "./daily-api";

/** まとめて送る間 (ms) と、1 回に送る動作の上限 (サーバーも 200 個まで) */
const SEND_MS = 15_000;
const BATCH = 200;
/** 動作に残す track の印 (回す・穴チェック・貼り付け・レシピへの保存) */
const EVENTS = new Set(["sim:run", "sim:run-view", "sim:test", "sim:paste", "daily:save-recipe"]);

type Act = { t: number; k: string } & Record<string, unknown>;
type BoxSig = { hand: string; done: string };

let topicId = "";
let startedAt = 0;
let acts: Act[] = [];
let dirty = false;
let timer = 0;
let stopped = true;
let lastEvAt = 0;
/** 見比べ用: 箱ごとの手と完成の印、木ぜんぶの印の履歴 (1 つ戻す・やり直すを見分ける) */
let prev: Map<string, BoxSig> | null = null;
let past: string[] = [];
let future: string[] = [];

const sec = (): number => Math.max(0, Math.round((Date.now() - startedAt) / 1000));
const handSig = (h: Hand | null): string => (h ? [h.currency, ...h.omens, h.catalyst ?? "", h.free ? "free" : "", h.repeat ? "spam" : "", h.held ? "held" : "", h.noUse ? "noUse" : "", h.veil ?? ""].filter(Boolean).join("+") : "");
function sigOf(d: TreeDoc): Map<string, BoxSig> {
  const m = new Map<string, BoxSig>();
  for (const b of Object.values(d.boxes)) m.set(b.id, { hand: handSig(b.hand), done: b.done ?? "" });
  return m;
}
const keyOf = (m: Map<string, BoxSig>): string => [...m].map(([id, s]) => `${id}:${s.hand}:${s.done}`).sort().join("|");

function push(k: string, extra?: Record<string, unknown>): void {
  if (stopped) return;
  acts.push({ t: sec(), k, ...extra });
  if (acts.length > BATCH * 3) acts.splice(0, acts.length - BATCH * 3);
  mark();
}
function mark(): void {
  dirty = true;
  if (!timer) timer = window.setTimeout(() => { timer = 0; void send(false); }, SEND_MS);
}
/** 回す・穴チェックなどの押した印を、前に拾った後の分だけ動作へ */
function pullEvents(): void {
  const now = Date.now();
  for (const e of trailNow()) {
    const at = now - e.ago * 1000;
    if (at > lastEvAt && EVENTS.has(e.n)) acts.push({ t: Math.max(0, Math.round((at - startedAt) / 1000)), k: "ev", n: e.n });
  }
  lastEvAt = now;
}
async function send(last: boolean): Promise<void> {
  if (stopped || (!dirty && !last)) return;
  pullEvents();
  if (last) acts.push({ t: sec(), k: "leave" });
  const batch = acts.splice(0, BATCH);
  dirty = acts.length > 0;
  const ok = await livePost(topicId, batch, last);
  if (ok === false) { liveStop(); return; }
  // つながらなかった分は次の回に付け直す (古いサーバー・回線切れ)。増えすぎないよう頭から捨てる
  if (ok === null && !last) { acts.unshift(...batch); if (acts.length > BATCH * 3) acts.splice(0, acts.length - BATCH * 3); }
  if (dirty && !timer && !stopped) mark();
}
const onHide = (): void => { if (document.visibilityState === "hidden") void send(true); };

/** 木を開いた時 (挑戦の画面、DailyPlay)。同じ挑戦の続きなら履歴はそのまま */
export function liveStart(id: string, started: number): void {
  if (!flag("dailyLive")) return;
  if (!stopped && id === topicId && started === startedAt) return;
  liveStop();
  topicId = id; startedAt = started; acts = []; dirty = false; prev = null; past = []; future = []; lastEvAt = Date.now(); stopped = false;
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onHide);
  push("open");
}
/** 画面を離れた・挑戦が終わった。残りを 1 回送って止める */
export function liveStop(final = false): void {
  if (stopped) return;
  if (final) void send(true);
  stopped = true;
  clearTimeout(timer); timer = 0;
  document.removeEventListener("visibilitychange", onHide);
  window.removeEventListener("pagehide", onHide);
}
/**
 * 提出・諦めの直前 (窓の「出す」「諦める」を押した時、サーバーへ送る前) に、溜まった動作と離れた印を送り切って待つ。
 * サーバーは終わった挑戦を受けず、端末も ended の後は送らないので、終える前に送らないと最後の 15 秒の手が消える (11-13 総ざらいの ×)。
 * 止めはしない = 終えられなかった時 (つながらない) は挑戦の続きをそのまま送る。終わった後の最初の送りで止まる。
 * 待つのは 3 秒まで (遅い回線で提出・諦めを待たせない。送りは keepalive なので待たなくても届く事が多い)
 */
export async function liveFlush(): Promise<void> {
  if (stopped) return;
  clearTimeout(timer); timer = 0;
  await Promise.race([send(true), new Promise<void>((ok) => setTimeout(ok, 3000))]);
}
/** 木の外の動作 (始め方とフラクチャーの選び・やり直し・回した結果など) */
export function liveAct(k: string, extra?: Record<string, unknown>): void {
  push(k, extra);
  // やり直しの後は新しい木なので、前の木との見比べを捨てる
  if (k === "restart") { prev = null; past = []; future = []; }
}

/** 木が変わるたびに呼ぶ (DailyPlay の見張り)。前の木と見比べて、何をしたかを動作にする */
export function liveDoc(d: TreeDoc): void {
  if (stopped) return;
  const now = sigOf(d), key = keyOf(now);
  if (!prev) { prev = now; past = [key]; mark(); return; }
  if (key === past[past.length - 1]) { mark(); return; } // 手と完成の印は同じ (場所・メモだけ)。木は送り直す
  const boxes = now.size;
  if (past.length > 1 && key === past[past.length - 2]) { future.push(past.pop()!); push("undo", { boxes }); }
  else if (future.length && key === future[future.length - 1]) { past.push(future.pop()!); push("redo", { boxes }); }
  else {
    future = [];
    past.push(key);
    if (past.length > 200) past.shift();
    let n = 0;
    for (const [id, s] of now) {
      const p = prev.get(id);
      if (s.hand !== (p?.hand ?? "") && n < 8) { push(s.hand ? "hand" : "hand-off", { box: id, out: d.boxes[id]?.out, ...(s.hand ? { hand: s.hand } : { was: p?.hand }), boxes }); n++; }
      if (s.done !== (p?.done ?? "") && n < 8) { push(s.done ? "done" : "undone", { box: id, ...(s.done ? { as: s.done } : {}), boxes }); n++; }
    }
    if (!n) push("boxes", { boxes, was: prev.size });
  }
  prev = now;
}
