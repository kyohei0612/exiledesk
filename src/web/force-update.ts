/**
 * force-update.ts — 強制更新 (U-35、スイッチ forceUpdate。オーナー 11-10「強制は俺が指示したタイミングで今使ってる人へ流すポップアップ」
 * 「起動は何かボタンを押した時のイメージ」「待つ。あと後で更新するボタンもつけて」「バージョン横に更新するボタン追加で」)。
 *
 * - 合図: 静的なファイル /force.txt (public/force.txt、中身は「番号 入れる版」1 行。Worker を通らない = Y-100 の取り物 0)。
 *   オーナーが頼んだ時にブラックが番号を上げ、今の本番と同じ中身のまま置き直す。
 * - 読む: 人が押した時 (クリック・鍵) に、前に読んでから 1 分以上たっていれば読む。押していない間・裏のタブは読まない。
 * - 出す: 番号が新しく、この画面の版が入れる版より古ければポップアップ (ForceUpdateAsk.vue)。押した手はそのまま効く。
 *   回している最中 (BusyTag が出ている)・打った直後の演出の間・文字の欄で打つ鍵・確かめの窓が開いている間は出さず、その後の押しで出す。
 * - 後で更新する: 押してから 10 分たった後の次の押しでまた出す。何度でも (オーナー 11-10「10分後に再通知とかやない？更新してない人へ」)。
 * - 更新する: 版替わりの自動の読み直し (web.html の __staleReload) と同じ扱いで読み直す = 離れる時の確かめを出さず、
 *   作りかけの木・エミュの品と手・ページの写し (page-memo)・送りの位置がそのまま戻る (U-27)。ヘッダーの「更新」も同じ。
 */
import { ref, watch } from "vue";
import pkg from "../../package.json";
import { flag } from "./release-flags";
import { leaveAsk } from "./page";
import { craftStage } from "../state/craft-stage";

export const FORCE_ON = typeof window !== "undefined" && flag("forceUpdate");
/**
 * 返事の合図 (U-36、スイッチ replyPush): /force.txt の 2 行目「返事 <要望の id の頭 8 字,…>」。押した時の同じ 1 回の読みで拾い、
 * onReplySignal で渡した物 (ReplyAsk.vue → feedback-replies の checkPushed) に頭の並びを渡す。Worker は通らない
 */
export const REPLY_PUSH = typeof window !== "undefined" && flag("replyPush") && flag("replyPopup");
let replyHook: ((heads: string[]) => void) | null = null;
export function onReplySignal(fn: (heads: string[]) => void): void { replyHook = fn; }

/** ポップアップを出している */
export const forceAsk = ref(false);
/** 新しい版の合図が来ている (ヘッダーの「更新」を目立たせる・スマホで出す) */
export const forceReady = ref(false);
/** 読み直しを始めた (幕を出す) */
export const forceGoing = ref(false);

const READ_GAP = 60_000;
const LATER_MS = 10 * 60_000;
/** 打った後の演出 (浮く文字) の長さの目安。この間の押しでは出さない */
const FX_MS = 1500;

let lastRead = -Infinity;
let reading = false;
/** 後で更新するを押した時刻。null = 押していない */
let laterAt: number | null = null;
let lastCraftAt = -Infinity;

/** a < b (版の比べ。0.1.707 の形) */
function older(a: string, b: string): boolean {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d < 0;
  }
  return false;
}

async function readSignal(): Promise<void> {
  if (reading) return;
  reading = true;
  lastRead = performance.now();
  try {
    const res = await fetch(`/force.txt?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const [first = "", second = ""] = (await res.text()).trim().split(/\r?\n/);
    const [no, to] = first.trim().split(/\s+/);
    const heads = /^(返事|reply)\s+/i.test(second.trim()) ? second.trim().replace(/^\S+\s+/, "").split(/[\s,]+/).filter(Boolean) : [];
    if (REPLY_PUSH && heads.length) replyHook?.(heads);
    if (FORCE_ON && Number(no) > 0 && to && /^\d+(\.\d+)*$/.test(to) && older(pkg.version, to)) forceReady.value = true;
  } catch { /* 読めなければ次の押しで */ } finally { reading = false; }
}

/** 今は出さない時 (回している・演出の間・確かめの窓・もう出している) */
function holding(): boolean {
  return forceAsk.value || forceGoing.value || !!leaveAsk.value || !!document.querySelector("[data-busy-tag]") || performance.now() - lastCraftAt < FX_MS;
}

/**
 * 押した時に出すポップアップ (強制更新の後ろに並ぶ物。返事のポップアップ U-36 など)。true を返したら出した = その押しではほかを出さない。
 * 同時に 2 つは出さない (出ている物があれば holding)、強制更新が先
 */
const askers: Array<() => boolean> = [];
/** 押した時の出し物を足す (出している間は open を true に) */
export function addPressAsker(ask: () => boolean, open: () => boolean): void { askers.push(ask); opens.push(open); }
const opens: Array<() => boolean> = [];

function maybeAsk(): void {
  if (holding() || opens.some((o) => o())) return;
  if (forceReady.value && !(laterAt != null && Date.now() - laterAt < LATER_MS)) { laterAt = null; forceAsk.value = true; return; }
  for (const a of askers) if (a()) return;
}

function onPress(e: Event): void {
  if (e instanceof KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.("input, textarea, select, [contenteditable='true']")) return; // 打っている鍵では出さない (欄の外を押した時に)
  }
  if (((!forceReady.value && FORCE_ON) || REPLY_PUSH) && performance.now() - lastRead >= READ_GAP) { void readSignal().then(() => setTimeout(maybeAsk, 0)); return; }
  setTimeout(maybeAsk, 0); // 押した手が効いた後に出す
}

/** 後で更新する */
export function forceLater(): void {
  laterAt = Date.now();
  forceAsk.value = false;
}

/** 更新する (ポップアップ・ヘッダー)。今の所を写して読み直す */
export function forceReload(): void {
  forceAsk.value = false;
  forceGoing.value = true;
  const w = window as { __staleGo?: number; __staleReload?: () => boolean };
  // 本番の作り: 新しい版が揃うのを待ってから 1 回読み直す (__staleReload が __staleGo と印を立てる)。開発版は版の印が無いのでその場で
  if (!import.meta.env.DEV && w.__staleReload?.()) return;
  try { sessionStorage.setItem("exiledesk-stale-reload", `${Date.now()}:1`); } catch { /* 印が無くても読み直す (戻らないだけ) */ }
  w.__staleGo = 1;
  location.reload();
}

/** Web の入口で 1 回 (強制更新か返事のポップアップのどちらかが入っている時) */
export function startForceUpdate(): void {
  if (!FORCE_ON && !flag("replyPopup")) return;
  for (const ev of ["pointerdown", "keydown"]) window.addEventListener(ev, onPress, { capture: true, passive: true });
  watch(() => craftStage.log.value.length, () => { lastCraftAt = performance.now(); });
}
