/**
 * start-kind.ts — 樹 MOD と作る側の関係から、始め方の種類を決める (2026-09-24)
 *
 * 固定 (フラクチャー) できるのは 1 つだけ。樹 MOD はクラフトで付け直せないので、**カオス・消去で MOD が消える側**に
 * 居る樹 MOD だけが危ない。どの側がそうかは、完成品のその側の MOD の数で決める (オーナー 2026-09-24):
 *   - 満杯の側 (ベースの枠いっぱい、普通は 3) … 普通の MOD を作るならカオス・消去を使う = 重い側。ここの樹 MOD は固定しないと死ぬ
 *   - エッセンスを使う側 … パーフェクトエッセンスは必ずその側の MOD を 1 つ消すので、空きがあっても重い側
 *   - それ以外 (枠に空きがある側) … 冒涜で足してリロールできる (光のお告げは冒涜だけ消す) = 樹 MOD は消えない
 *     (「サフィ 1 プレ 2 とか片方が 2 以下の場合は当たらん。片方冒涜でリロールできるから。ただ、その場合数値が多いほうに
 *      必ずフラクチャーないとクラフトできない」)
 * 種類:
 *   none     … 樹 MOD が無い。普通の MOD から固定する物を選ぶ (今まで通り)
 *   separate … 重い側に樹 MOD が無い。固定不要: 樹 MOD が付いた物を買って、重い側を作る
 *              (オーナー:「プレフィックスのみ消去してたら消えない。この場合フラクチャーは意味ない」)
 *   fix      … 重い側に樹 MOD が 1 つ。それを固定 (fixSide の樹 MOD)
 *   unsafe   … 重い側の樹 MOD が 2 つ以上 (プレ 3・サフィ 3 の両方に樹 MOD など)。1 つしか固定できず、もう片方が
 *              ガチャで消える。**クラフト非推奨** (オーナー:「クラフトは非推奨って出したほうがいい」)
 * 樹 MOD の側が分からない時は fix (前の扱い) に倒す。
 */
import { CRAFTED_SOURCES } from "../../vendor/poe2htc/engine/pool";
import { sideLimits } from "../../services/htc/bridge";
import { zeroStart } from "./craft-settings";
import type { useHtcCraft } from "./useHtcCraft";

export type StartKind = "none" | "separate" | "fix" | "unsafe";
type S = "P" | "S";

export function startKindOf(c: ReturnType<typeof useHtcCraft>): {
  kind: StartKind;
  /** 重い側 (1 つだけの時)。固定不要の時はここの狙いを固定済みで買う候補にする */
  craftSide: S | null;
  /** 固定する樹 MOD の側 (fix の時) */
  fixSide: S | null;
  /** 重い側の樹 MOD の数 */
  atRisk: number;
  /** 非推奨の理由 (側ごとに、なぜ重いか・樹 MOD がいくつあるか)。unsafe 以外は空 */
  reasons?: string[];
} {
  const tree = c.dropOnly.value;
  if (!tree.length) return { kind: "none", craftSide: null, fixSide: null, atRisk: 0 };
  if (tree.some((t) => !t.side)) return { kind: "fix", craftSide: null, fixSide: null, atRisk: 1 };
  const d = c.data.value;
  const sideOf = (type: string | undefined): S => (type === "prefix" ? "P" : "S");
  // 完成品の側ごとの MOD の数 = 狙い + 繋がらなかった行 (樹 MOD・冒涜のみ・作れない)
  const count: Record<S, number> = { P: c.slotsUsed.value.prefixes, S: c.slotsUsed.value.suffixes };
  const rolls: Record<S, boolean> = { P: false, S: false };
  /** エッセンスで付ける狙いがある側。パーフェクトエッセンスは**必ずその側の MOD を 1 つ消して**付くので、枠に空きがあっても危ない */
  const essence: Record<S, boolean> = { P: false, S: false };
  for (const t of c.targets.value) {
    const m = d?.mods.get(t.modId);
    if (!m) continue;
    count[sideOf(m.type)]++;
    if (m.source === "normal" || CRAFTED_SOURCES.has(m.source)) rolls[sideOf(m.type)] = true;
    if (CRAFTED_SOURCES.has(m.source)) essence[sideOf(m.type)] = true;
  }
  // 満杯はベースの枠で見る (指輪によってプレ・サフィの数が違う。オーナー 2026-09-24:「接辞が変化する指輪でも出る時ある」)
  const lim = d ? sideLimits(d, c.item.value?.baseType ?? zeroStart.value.baseType) : { prefix: 3, suffix: 3 };
  const full: Record<S, number> = { P: lim.prefix, S: lim.suffix };
  // 重い側 = 満杯で普通の MOD を作る側、またはエッセンスを使う側 (オーナー 2026-09-24:「プレ 4 サフィ 2 の特殊なリングで、
  // 樹 MOD がプレ 1・サフィ 1、サフィにエッセンス必要とかだとクラフト出来ん」)
  const heavy = (["P", "S"] as const).filter((x) => (count[x] >= full[x] && rolls[x]) || essence[x]);
  const risky = tree.filter((t) => heavy.includes(t.side!));
  const craftSide = heavy.length === 1 ? heavy[0]! : null;
  if (risky.length === 0) return { kind: "separate", craftSide, fixSide: null, atRisk: 0 };
  if (risky.length === 1) return { kind: "fix", craftSide, fixSide: risky[0]!.side!, atRisk: 1 };
  // 非推奨の理由を側ごとに (オーナー 2026-09-24:「非推奨パターン入れて非推奨って出そう」)
  const jaSide = (x: S): string => (x === "P" ? "プレ" : "サフィ");
  const reasons = heavy.map((x) => {
    const n = risky.filter((t) => t.side === x).length;
    const why = [count[x] >= full[x] && rolls[x] ? `枠が満杯 (${count[x]}/${full[x]}) でカオス・消去を使う` : "", essence[x] ? "エッセンスを使う (必ず 1 つ消える)" : ""].filter(Boolean).join("、");
    return n ? `${jaSide(x)}: ${why}のに樹 MOD が ${n} つ` : "";
  }).filter(Boolean);
  if (risky.length > 1 && heavy.length === 1) reasons.push("同じ側の樹 MOD は 1 つしか固定できない");
  return { kind: "unsafe", craftSide, fixSide: null, atRisk: risky.length, reasons };
}
