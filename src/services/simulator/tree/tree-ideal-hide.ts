/**
 * tree-ideal-hide.ts — 完成を押すまで、まだ手を決めていない外れの箱を隠す (S-142n、スイッチ idealHide)。
 * オーナー 11-15「ハズレMODは非表示の方が分かりやすい…完成の理想ルートだけ表示させておいて、どんどん作っていく方が多分いい」
 * 「理想形以外は一旦全部非表示で理想MODが全て終わった後に未設定をばーん」「ライトアップ削除でグレーアウトを非表示で行こうか」
 * 「狙い無しは自分で付けてるから非表示扱いじゃないよね」(ブラック 121 経由)。
 * 隠す = 外れ・狙いが消えた・塞がったの結果の箱で、手・分かれ目・完成 / 失敗・人の付けた ↩ が無い物 (自動の ↩ だけの箱も隠す)。
 * 狙い無しの手の結果 (打った後・外れが消えた) と当たりの箱は隠さない。完成 (main) の印が 1 つでも付いた木は何も隠さない (完成を押すと一気に出る)。
 * 木の中身は変えず、描かない・数えないだけ (消去の続きを畳む stripHidden と同じ口で効かせる)
 */
import type { TreeDoc } from "./tree-model";
import { DEV_BUILD, flag } from "../../../web/release-flags";
import { flowOnce } from "./tree-flow-once";

/** 隠す結果の種類 (狙いを持って打って狙い通りにいかなかった結果) */
const HIDE_OUT: ReadonlySet<string> = new Set(["junk", "lost", "blocked"]);
const NONE: ReadonlySet<string> = new Set();
const memo = new WeakMap<TreeDoc, { key: string; v: ReadonlySet<string> }>();

/** 今隠す箱 (スイッチが閉じている・完成の印がある木は空) */
export function idealHidden(d: TreeDoc): ReadonlySet<string> {
  if (!flag("idealHide")) return NONE;
  return flowOnce("ideal", d, null, () => hiddenRaw(d)); // 画面の木は同じ流れで 1 回 (S-196i、スイッチ drawOnce)
}
function hiddenRaw(d: TreeDoc): ReadonlySet<string> {
  const bs = Object.values(d.boxes);
  if (bs.some((b) => b.done === "main")) return NONE;
  const key = bs.map((b) => `${b.id}:${b.out}:${b.hand ? 1 : 0}${b.split?.length ? 1 : 0}${b.back ? (b.autoBack ? "a" : "b") : ""}${b.done ?? ""}`).join("|");
  const m = memo.get(d);
  if (m?.key === key) return m.v;
  const v = new Set(bs.filter((b) => HIDE_OUT.has(b.out) && !b.hand && !b.split?.length && !b.done && (!b.back || !!b.autoBack)).map((b) => b.id));
  memo.set(d, { key, v });
  return v;
}

/**
 * (S-142n3 案、開発版で URL に ?idealOnly を付けた時だけ) 理想手だけを描く試し: スタートから当たり・打った後・通り抜け・分かれ目の結果だけを辿った箱
 * (S-142j ⑤ の当たりの道と同じ辿り) のほかを全部描かない。並べ方は描く箱だけで今の並べ (S-142j) のまま。11-21 オーナー
 * 「この案Aで理想手のみを表示させて並べてみてくれるか」(ブラック 144 経由)。木の中身・回す・保存は触らない
 */
const IDEAL_SIDE: ReadonlySet<string> = new Set(["hit", "any", "pass", "branch"]);
export const idealOnlyOn = (): boolean => DEV_BUILD && typeof location !== "undefined" && new URLSearchParams(location.search).has("idealOnly");
export function idealOnlyHidden(d: TreeDoc): ReadonlySet<string> {
  if (!idealOnlyOn() || !d.boxes.start) return NONE;
  const path = new Set<string>();
  const walk = (id: string): void => { if (path.has(id)) return; path.add(id); for (const k of d.boxes[id]?.outs ?? []) if (IDEAL_SIDE.has(d.boxes[k]?.out ?? "")) walk(k); };
  walk("start");
  return new Set(Object.keys(d.boxes).filter((id) => !path.has(id)));
}
