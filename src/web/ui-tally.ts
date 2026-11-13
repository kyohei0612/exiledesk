/**
 * 押した数の数え (Y-67、2026-11-14 オーナー「使ってないボタンとか把握したいし分析周りちょっと強化しようか」「ボタンの数えも足してええよ」)。
 * Web の押せる物 (ボタン・タブ・切り替え) を押した数を端末の中で名前ごとに数え、track.ts の pull (離れる時の 1 便) で
 * ui_tally {t: {名前: 回数}, s: 開いてから何秒目か} を 1 件だけ記録に足す (エミュの手の数え useTally と同じ。D1 の行も問い合わせも増えない)。
 * 名前: ① data-ui ② その物の最初の data-* (値が短い英数なら =値) ③ どちらも無ければ ?<一番近い親の data-*>。ボタンの字・入力欄の中身は入れない (Y-62)。
 * 数えない: スイッチ uiTally が閉じている・記録しない端末 (Y-63)・チュートリアルの中 (Y-65、エミュのコースとシミュのチュートリアル)
 */
import { craftStage } from "../state/craft-stage";
import { noLog } from "../utils/no-log";
import { flag } from "./release-flags";

const SEL = 'button, [role="button"], [role="tab"], input[type="checkbox"], input[type="radio"], [data-ui]';
const MAX_NAMES = 100;
const MAX_LEN = 48;
/** 値を名前に入れてよい形 (英数と - _ . : だけ、20 字まで。文や人が打った物は入らない) */
const SAFE_VAL = /^[A-Za-z0-9_.:-]{1,20}$/;
const tally = new Map<string, number>();
const pauses: Array<() => boolean> = [];

/** チュートリアルの間など、数えない時を足す (シミュのチュートリアルが自分の「始まっている」を渡す) */
export function pauseUiTallyWhen(f: () => boolean): void { pauses.push(f); }

/** その物の最初の data-* (Vue の scoped の data-v-* は外す) */
function dataName(el: Element): string | null {
  for (const a of Array.from(el.attributes)) {
    const n = a.name;
    if (!n.startsWith("data-") || n.startsWith("data-v-") || n === "data-ui") continue;
    const k = n.slice(5);
    return SAFE_VAL.test(a.value) ? `${k}=${a.value}` : k;
  }
  return null;
}
/** 押した物の名前 (上の ①〜③) */
export function uiName(el: Element): string {
  const ui = el.getAttribute("data-ui");
  if (ui) return ui.slice(0, MAX_LEN);
  const own = dataName(el);
  if (own) return own.slice(0, MAX_LEN);
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const u = p.getAttribute("data-ui") ?? dataName(p);
    if (u) return `?${u}`.slice(0, MAX_LEN);
  }
  return "?";
}

function count(el: Element | null): void {
  if (!el || !flag("uiTally") || noLog()) return;
  if (craftStage.play.value === "lesson" || pauses.some((f) => f())) return;
  const n = uiName(el);
  if (!tally.has(n) && tally.size >= MAX_NAMES) return;
  tally.set(n, (tally.get(n) ?? 0) + 1);
}

/** 入口で 1 回 (track.ts の startTracking から)。select は開いただけでは数えず、選び替えた時に数える */
export function startUiTally(): void {
  document.addEventListener("click", (e) => { const t = e.target; if (t instanceof Element) count(t.closest(SEL)); }, { capture: true, passive: true });
  document.addEventListener("change", (e) => { const t = e.target; if (t instanceof HTMLSelectElement) count(t); }, { capture: true, passive: true });
}

/** 溜まった数を取り出して空にする (track.ts の pull から)。無ければ null */
export function takeUiTally(): Record<string, number> | null {
  if (!tally.size) return null;
  const t = Object.fromEntries(tally);
  tally.clear();
  return t;
}
