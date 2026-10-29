/**
 * tree-frac-pick.ts — ✦ の印の無い木の乱数のフラクチャーの分け方 (10-27 夜オーナー「フラクチャーの場合、未設定なら外れなんて無いよな」「● MOD 名がフラクチャーの場合って記載しないとな」、スイッチ fracPick)。
 * ほかの手と同じく「狙う MOD」の ☑ と狙い無しを選べる:
 *   - 狙い無し (既定): 固定後の形が同じ物どうしで 1 枝 = 固定されうる完成の狙いは 1 つずつ「〇〇がフラクチャーされた場合」、外れ MOD は中身で分けず側と種類ごとに
 *     「外れ MOD がフラクチャーされた場合」(オーナー「1 MOD 3 つなら 3 枝しかできん」「外れ 2 つは同じ側・同じ種類なので固定後の形が同じ」)。
 *     どれが固定されるかはエンジンの乱数のまま (行ごとに等しく、同じ枝の行は足す)
 *   - ☑ あり: ☑ の MOD が固定された = 当たり、ほかが固定された = 外れ (今までの fracRandom の形)
 */
import { aimHits, craftedKindOf, tierIndexOf, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { aimHeldOn, isAimMod } from "./tree-aim";
import { effectOf } from "./tree-hands";
import { aimOpts, targetsOf } from "./tree-sample";
import { stepOutcomes } from "../sim-engine";
import { fractureMarks, type Aim, type Hand, type TreeDoc } from "./tree-model";
import { flag } from "../../../web/release-flags";

/** 印の無い木の、狙い無しの乱数のフラクチャー (カードの行ごとに箱を分ける手) */
export const fracFree = (doc: TreeDoc, h: Pick<Hand, "currency" | "free"> | null | undefined): boolean => !!h && flag("fracPick") && effectOf(h.currency) === "fracture" && !!h.free && !fractureMarks(doc).length;
/** 打った前後で新しく ✦ になった MOD (無ければ null) */
export function newlyFractured(before: StageItem, after: StageItem): StageMod | null {
  const had = new Set([...before.prefixes, ...before.suffixes].filter((m) => m.fractured).map((m) => m.modId));
  return [...after.prefixes, ...after.suffixes].find((m) => m.fractured && !had.has(m.modId)) ?? null;
}
/** 固定されうる MOD (✦・未発現・冒涜で付いた物は固定されない) */
const fixable = (it: StageItem): StageMod[] => [...it.prefixes, ...it.suffixes].filter((m) => !m.fractured && !m.unrevealed && !m.desecrated);
/**
 * 狙い無しの枝: 見本のどれかで固定されうる完成の狙い (完成形の段、完成形の設定の順) と、固定されうる外れ MOD の側と種類 (外れの枝の鍵)
 */
export function fracFreeOuts(data: PatchData, doc: TreeDoc, items: readonly StageItem[]): { aims: Aim[]; junk: string[] } {
  const goals = doc.memoAims ?? [];
  const aims = goals.filter((a) => items.some((it) => aimHeldOn(data, { ...it, prefixes: fixable(it).filter((m) => m.side === "prefix"), suffixes: fixable(it).filter((m) => m.side === "suffix") }, a, { sameText: true }))).map((a) => ({ modId: a.modId, tier: a.tier }));
  const isGoal = (m: StageMod): boolean => goals.some((a) => aimHits(m, { modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) }, { data, sameText: true }));
  // 外れは固定後の形 (側と種類) が同じ物どうしで 1 枝 (10-27 夜オーナー「外れ 2 つは同じ側・同じ種類なので固定後の形が同じ」)。並びはプレ → サフィ、普通 → エッセンス
  const junk = new Set<string>();
  for (const it of items) for (const m of fixable(it)) if (!isGoal(m)) junk.add(junkKeyOf(data, m));
  return { aims, junk: [...junk].sort() };
}
/**
 * 外れ MOD の枝の鍵 = 側 (S-41。外れは種類を見ない = S-60、10-30 オーナー「プレ１とプレ２はどういつのハズレとして扱うから枝が減る」、スイッチ fracSide)。
 * 鍵の形は前と同じ `prefix|normal` (保存の札が合うように)。閉じている間は側と種類 (普通 / エッセンスのクラフト MOD) で分ける
 */
export const junkKeyOf = (data: PatchData, m: StageMod): string => `${m.side}|${!flag("fracSide") && (m.crafted || craftedKindOf(data, m)) ? "crafted" : "normal"}`;
/** 外れの枝の名前の付け足し (枝が 2 つ以上の時だけ。例「プレフィックス・エッセンスの MOD」) */
export function junkKeyLabel(key: string): [string, string] {
  const [side, kind] = key.split("|");
  const ja = `${side === "prefix" ? "プレフィックス" : "サフィックス"}${kind === "crafted" ? "・エッセンスの MOD" : ""}`, en = `${side === "prefix" ? "prefix" : "suffix"}${kind === "crafted" ? ", essence mod" : ""}`;
  return [ja, en];
}
/** 固定された MOD が当たる枝の札 (無ければ外れ MOD の枝) */
export function fracFreeHit(data: PatchData, m: StageMod | null, own: readonly Aim[]): Aim | null {
  if (!m) return null;
  return own.find((a) => aimHits(m, { modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) }, { data, sameText: true })) ?? null;
}

/**
 * フラクチャーの手で ✦ にするアイテムの MOD (10-24 オーナー「フラクチャーは必ずどれか 1 つを固定」、10-25 オーナーが 10-24 の決めに戻した)。
 * aims = この手の当たりの箱の札 (= この箱で付いている完成の MOD の印の狙い、tree-hand-plan の hitAimsOf) のうち、付いている最初の物。無ければ null (エンジンの乱数のまま)
 */
export function fractureTarget(data: PatchData, item: StageItem, h: Hand, aims: readonly Aim[], rng?: () => number): string | null {
  if (effectOf(h.currency) !== "fracture" || h.pick === "random") return null;
  const mods = [...item.prefixes, ...item.suffixes].filter((m) => !m.fractured);
  // ✦ が複数なら、付いている ✦ のどれかを等しく (どの ✦ が固定されても当たり。前は付いている最初の ✦ だけ、スイッチ fracMulti、S-42)
  if (flag("fracMulti") && rng) { const c = aims.flatMap((a) => mods.filter((x) => isAimMod(x, targetsOf(data, [a]), aimOpts(data))).slice(0, 1)); const u = [...new Map(c.map((m) => [m.modId, m])).values()]; return u.length ? u[Math.floor(rng() * u.length)]!.modId : null; }
  for (const a of aims) { const m = mods.find((x) => isAimMod(x, targetsOf(data, [a]), aimOpts(data))); if (m) return m.modId; }
  return null;
}

/** フラクチャーで固定できる MOD の数 (エンジンの stepOutcomes の行き先の数。2 つ以上なら外れうる) */
export const fractureChoices = (data: PatchData, item: StageItem): number => (stepOutcomes(data, item, "fracture") ?? []).filter((o) => !o.void).length;
