/**
 * 土台: 消える候補・付く候補・側・骨の枠 (E-2、2026-11-07 ジン jin-base。洗い出し base-audit-1107 の G-1)。
 *
 * 「付ける・消す・入れ替える」はどの手も同じ物を見る。打つ処理 (parts.ts・parts-unrevealed.ts)・確率の表 (odds.ts・held-odds.ts)・
 * 数え上げ (sim-engine/outcomes.ts)・プレビュー (use-preview.ts) は、選び方をここから引き、乱数で 1 つ選ぶか・全部の枝に分けるか・光らせるかだけが違う。
 * 前は同じ選び方を 4〜8 か所に写していて、E-30a (11-06) と E-25 (骨の数え上げ) で直し漏れが 2 回起きた。
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { allMods, candidates, catalystBoosts, catalystOf, overLimit, room, SIDES, type Candidate } from "../stage-core";
import { whittleTargets } from "../apply-currency";
import { tunedCatalysingMultiplier } from "../stage-tuning";
import type { StageItem, StageMod, StageSide } from "../types";
import type { Action } from "./types";
import type { Mods } from "./parts";
import { tr } from "../../../i18n/lang";

type Remove = Extract<Action, { remove: unknown }>["remove"];
type Add = Extract<Action, { add: unknown }>["add"];

/** 消す側 (E-11g: 左右の抹消・結晶化・左右の消去)。付ける側のお告げ (高貴・ネクロマンシー) は消す側を決めない */
export const removeSideOf = (mods: Mods): StageSide | null => mods.removeSide;
/** 付ける側の候補 (E-11f・E-11g: 左右の高貴・ネクロマンシーはその側だけ、無ければ両側) */
export const addSidesOf = (mods: Mods): readonly StageSide[] => (mods.side ? [mods.side] : SIDES);

/** 触媒の高貴のお告げの重み (E-32: 品質の種類の MOD を重く引く)。掛かっていなければ undefined */
export function catalysingBoost(data: PatchData, item: StageItem, mods: Mods): { test: (m: { id: string; tags?: readonly string[] }) => boolean; mult: number } | undefined {
  const { tag, pct } = catalystOf(item);
  return mods.catalysing && tag ? { test: (m) => catalystBoosts(item, { modId: m.id, tags: m.tags }, tag, data), mult: tunedCatalysingMultiplier(pct) } : undefined;
}

/**
 * その状態で 1 つ付ける時の候補 (E-11f: 空きのある側 ∩ お告げの側、触媒の重み)。before = 枠の上限を見る打つ前の品 (E-30a)。
 * boostFrom = 触媒の重みを見る品 (1 つの手で幾つも付ける時は付ける前の品のまま)。
 * 打つ処理の addOne (stage-draw.ts) も同じ側・同じ重みで candidates を引く
 */
export function addCandidatesOf(data: PatchData, item: StageItem, a: Add, mods: Mods, before: StageItem = item, boostFrom: StageItem = item): Candidate[] {
  const sides = addSidesOf(mods).filter((s) => room(item, s, before));
  if (a.emptyOk && !SIDES.some((s) => room(item, s, before))) return [];
  const boost = catalysingBoost(data, boostFrom, mods);
  return candidates(data, item, sides, a.floor, boost ? { boost } : {});
}

/**
 * 消す部品 (remove) が何を消すか (乱数の前に決まる事)。
 *   all = 固定以外を全部 (アルケミー・腐食) / none = 消さずに通す (完全エッセンスを MOD 0 のレアに、ifAny) / skip = 打つ前に分かって弾かれる /
 *   pick = 1 回ごとに from(今の品) から等しく 1 つ (光 = 冒涜だけ・削減 = MOD レベルの一番低い物・側)。voids = 当たると手ごと不成立 (E-25 上限を超えた側)
 * essenceSide: 付けるエッセンスの MOD の側 (完全エッセンス・合金は、その側が埋まっていればその側から消す。E-51)
 */
export type Removal =
  | { all: StageMod[] }
  | { none: true }
  | { skip: string }
  | { pick: (cur: StageItem) => StageMod[]; side: StageSide | null; desecrated: boolean; voids: (cur: StageItem, m: StageMod) => boolean };
export function removalOf(item: StageItem, a: Remove, mods: Mods, essenceSide?: StageSide | null): Removal { // E-22a 固定は消えない・E-22 等しく
  if (a.n === "all") return { all: allMods(item).filter((m) => !m.fractured) };
  const never = (): boolean => false;
  // 冒涜だけ (光のお告げ、E-68) は側を見ない (左右の消去は光と一緒には効かない、お告げの排他)
  if ((mods.pick ?? a.pick) === "desecrated") {
    if (!allMods(item).some((m) => m.desecrated && !m.fractured)) return { skip: tr("光のお告げ: 冒涜の MOD が無い", "Omen of Light: no Desecrated mod") };
    return { pick: (cur) => allMods(cur).filter((m) => m.desecrated && !m.fractured), side: null, desecrated: true, voids: never };
  }
  if (a.ifAny && !allMods(item).length) return { none: true };
  const side = removeSideOf(mods);
  let sides: readonly StageSide[] = side ? [side] : SIDES;
  // 付ける側が埋まっている完全エッセンスは、その側から消す。反対の側のお告げなら打てない (E-51・E-11g)
  if (a.sideWhenFull && essenceSide && !room(item, essenceSide)) {
    if (side && side !== essenceSide) return { skip: tr("足す側が埋まっているので、お告げの側からは消せない", "The Essence's side is full, so it can't remove from the Omen's side") };
    sides = [essenceSide];
  }
  const pick = mods.pickLowest ? (cur: StageItem) => whittleTargets(cur, side) : (cur: StageItem) => allMods(cur).filter((m) => !m.fractured && sides.includes(m.side));
  // 上限を超えている側 (侮蔑・合金を外した後) に当たると付け直せずに手ごと不成立 (E-25)
  return { pick, side, desecrated: false, voids: a.overLimitVoids ? (cur, m) => overLimit(cur, m.side) : never };
}
/** 消せる物が無かった時の一言 (お告げの側を決めていればその側) */
export const nothingToRemove = (side: StageSide | null): string => (side ? tr("お告げの側に外せる MOD が無い", "No removable mod on the Omen's side") : tr("外せる MOD が無い", "No mod can be removed"));

/**
 * 骨で選んだ側に未発現を付ける時の枠 (E-61・E-25・E-65)。側を選んだ後の 1 か所:
 *   mark = アビサルロードの紋章を置き換える / open = 空きに付く / replace = その側の固定以外 (from) から等しく 1 つ消して付く /
 *   over = その側は上限を超えていて付かない (E-25: お告げで決めた側なら打てない、当たり所なら手ごと不成立) / stuck = その側が固定だけで消せない
 * fixed = 側をお告げ (か印) で決めた。before = 枠の上限を見る打つ前の品 (E-30a)
 */
export type BoneSlot =
  | { mark: StageMod }
  | { open: true }
  | { replace: StageMod[] }
  | { over: true }
  | { stuck: true };
export function boneSlotOf(item: StageItem, side: StageSide, mark: StageMod | undefined, before: StageItem = item): BoneSlot {
  if (mark) return { mark };
  if (overLimit(item, side)) return { over: true };
  if (room(item, side, before)) return { open: true };
  const from = allMods(item).filter((m) => !m.fractured && m.side === side);
  return from.length ? { replace: from } : { stuck: true };
}
/** 骨の枠で付かない時の一言と、当たり所か (お告げで決めた側なら打つ前に分かる = 打てない) */
export function boneSlotReason(s: { over: true } | { stuck: true }): string {
  return "over" in s ? tr("その側は上限を超えているので冒涜の MOD を付けられない", "That side is over its limit, so no Desecrated mod can be added") : tr("その側に空きが無い", "No open slot on that side");
}
