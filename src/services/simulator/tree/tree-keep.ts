/**
 * tree-keep.ts — 消える手の「残したい MOD」(S-27d、スイッチ keepAll。10-31 朝オーナー決め 7「よーは挙動はMODが消えてしまうような奴は全員そうよな」)。
 * 消去 (Hand.keep、S-27) と同じ見方を、カオス・パーフェクトエッセンス・満杯の側の骨にも: 残したい MOD が消えた = 狙いが消えた、☑ の無い MOD は消えても外れ。
 * keep の無い手 (前に保存した手・候補が 1 つ以下で聞かなかった手) は既定 = 持っている狙い (☑ の印) 全部 = 今までの数え。
 * 狙いが消えた人に付ける狙い (☑・エッセンスの MOD) が付いたら、狙いが消えた箱を別にして (鍵 `g:`)「狙いが消えた・狙いが付いた」、付いた狙いは ☑ の印に数える
 */
import { omensFor, type PatchData, type StageItem } from "../../craft-stage/engine";
import { stepOutcomes } from "../sim-engine";
import { aimHeldOn } from "./tree-aim";
import { effectOf, engineOmens } from "./tree-hands";
import { prepFor } from "./tree-unbounded";
import { fractureMarks, type Aim, type Hand, type TreeDoc } from "./tree-model";
import { joinKeys } from "./tree-whittle";
import { flag } from "../../../web/release-flags";

/** 消去でない手で残したい MOD を決めた物か (消去の keep は今までどおり tree-outcome の isKeepAnnul) */
export const isKeepHand = (h: Hand | null | undefined): h is Hand & { keep: Aim[] } => flag("keepAll") && !!h?.keep && effectOf(h.currency) !== "remove";
/** 残したい MOD の段は完成形の段 (消去の S-27c と同じ) */
const goalTier = (doc: TreeDoc, keep: readonly Aim[]): Aim[] => keep.map((a) => (doc.memoAims ?? []).find((g) => g.modId === a.modId) ?? a);
/** 消える手の残したい MOD (段は完成形の段)。残したい MOD を決めていない手は null (既定 = 持っている狙い) */
export const keptAimsOf = (doc: TreeDoc, h: Hand | null | undefined): Aim[] | null => (isKeepHand(h) ? goalTier(doc, h.keep) : null);
/** 打つ前の ☑ の代わりに使う印 (残したい MOD + ✦ の印)。決めていない手は aimed のまま */
export function keptAimedOf(doc: TreeDoc, h: Hand | null | undefined, aimed: ReadonlySet<string> | null | undefined): ReadonlySet<string> | null | undefined {
  const k = keptAimsOf(doc, h);
  return k ? new Set([...k, ...fractureMarks(doc)].map((a) => a.modId)) : aimed;
}

/** goneOf の覚え (1 手ごとに人の数だけ呼ぶ。手と MOD の組が同じなら同じ) */
const GONE = new WeakMap<PatchData, Map<string, ReadonlySet<string> | null>>();
/** 手 (お告げ込み) でこのアイテムから消えうる MOD の modId (S-27b の候補・S-27e)。打てなければ null */
export function goneOf(data: PatchData, item: StageItem, currency: string, omens: readonly string[]): ReadonlySet<string> | null {
  let m = GONE.get(data);
  if (!m) GONE.set(data, (m = new Map()));
  const key = [currency, ...omens, item.rarity, ...[...item.prefixes, ...item.suffixes].map((x) => `${x.modId}.${x.tierIndex}${x.fractured ? "f" : ""}${x.unrevealed ? "u" : ""}`)].join("|");
  if (m.has(key)) return m.get(key)!;
  const outs = stepOutcomes(data, prepFor(data, item, currency), currency, engineOmens({ omens: omensFor(currency, [...omens]) }))?.filter((o) => !o.void);
  const out = outs?.length ? new Set(outs.flatMap((o) => o.removed.map((x) => x.modId))) : null;
  if (m.size > 20000) m.clear();
  m.set(key, out);
  return out;
}

const GOT = "g:";
/** 狙いが消えた人に付いた狙い (own = この手の当たりの札。打つ前に無く、打った後にある物) の鍵 `g:modId,…`。付いていなければ undefined */
export function gotKeyOf(data: PatchData, before: StageItem, after: StageItem, own: readonly Aim[]): string | undefined {
  if (!flag("keepAll")) return undefined;
  const got = own.filter((a) => !aimHeldOn(data, before, a, { sameText: true }) && aimHeldOn(data, after, a, { sameText: true })).map((a) => a.modId);
  return got.length ? `${GOT}${[...new Set(got)].sort().join(",")}` : undefined;
}
/** 狙いが消えた結果に付いた狙いの鍵を足す (狙いが消えた以外はそのまま) */
export function withGot<T extends { out: string; junkKey?: string }>(data: PatchData, oc: T, before: StageItem, after: StageItem, own: readonly Aim[]): T {
  if (oc.out !== "lost") return oc;
  const g = gotKeyOf(data, before, after, own);
  return g ? { ...oc, junkKey: joinKeys(oc.junkKey, g) } : oc;
}
/** 箱の鍵から付いた狙いの modId (無ければ []) */
export const gotOf = (key: string | undefined): string[] => key?.split(";").find((s) => s.startsWith(GOT))?.slice(GOT.length).split(",").filter(Boolean) ?? [];
/** 鍵に付いた狙いがあるか (箱の題「狙いが消えた・狙いが付いた」) */
export const hasGot = (key: string | undefined): boolean => gotOf(key).length > 0;
