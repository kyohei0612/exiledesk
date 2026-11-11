/**
 * tree-keep.ts — 消える手の「残したい MOD」(S-27d。10-31 朝オーナー決め 7「よーは挙動はMODが消えてしまうような奴は全員そうよな」)。
 * 消去 (Hand.keep、S-27) と同じ見方を、カオス・パーフェクトエッセンス・満杯の側の骨にも: 残したい MOD が消えた = 狙いが消えた、☑ の無い MOD は消えても外れ。
 * keep の無い手 (前に保存した手・候補が 1 つ以下で聞かなかった手) は既定 = 持っている狙い (☑ の印) 全部 = 今までの数え。
 * 狙いが消えた人に付ける狙い (☑・エッセンスの MOD) が付いたら、狙いが消えた箱を別にして (鍵 `g:`)「狙いが消えた・狙いが付いた」、付いた狙いは ☑ の印に数える
 */
import { omensFor, parseKey, type PatchData, type StageItem } from "../../craft-stage/engine";
import { stepOutcomes } from "../sim-engine";
import { aimHeldOn } from "./tree-aim";
import { engineOmens } from "./tree-hands";
import { isMissMod, missAims } from "./tree-miss";
import { sameAimMod } from "./tree-hand-core";
import { fractureMarks, type Aim, type Hand, type TreeDoc } from "./tree-model";
import { handWhittleSide, isWhittleHand, joinKeys, rankVariants } from "./tree-whittle";

/** 残したい MOD を決めた手か。消去も同じ (11-04、[] = 全部消えてよい = 残したい MOD 無し。前は消去だけ tree-outcome の isKeepAnnul で別に数えた) */
export const isKeepHand = (h: Hand | null | undefined): h is Hand & { keep: Aim[] } => !!h?.keep;
/** 残したい MOD の段は完成形の段 (消去の S-27c と同じ) */
export const goalTierOf = (data: PatchData, doc: TreeDoc, keep: readonly Aim[]): Aim[] => keep.map((a) => { const g = (doc.memoAims ?? []).find((x) => sameAimMod(data, x, a)); return g ? { ...a, tier: g.tier } : a; });
/** 消える手の残したい MOD (段は完成形の段)。残したい MOD を決めていない手は null (既定 = 持っている狙い) */
export const keptAimsOf = (data: PatchData, doc: TreeDoc, h: Hand | null | undefined): Aim[] | null => (isKeepHand(h) ? goalTierOf(data, doc, h.keep) : null);
/** 打つ前の ☑ の代わりに使う印 (残したい MOD + ✦ の印)。決めていない手は aimed のまま */
export function keptAimedOf(data: PatchData, doc: TreeDoc, h: Hand | null | undefined, aimed: ReadonlySet<string> | null | undefined): ReadonlySet<string> | null | undefined {
  const k = keptAimsOf(data, doc, h);
  return k ? new Set([...k, ...fractureMarks(doc)].map((a) => a.modId)) : aimed;
}

/** goneOf の覚え (1 手ごとに人の数だけ呼ぶ。手と MOD の組が同じなら同じ) */
const GONE = new WeakMap<PatchData, Map<string, ReadonlySet<string> | null>>();
/**
 * 手 (お告げ込み) でこのアイテムから消えうる MOD の modId (S-27b の候補・S-27e)。打てなければ null。
 * 削減は一番低い MOD レベルの MOD が消えるので、外れの MOD レベルをその外れが付いた手の池で出うる出方ごとに差し替えて見る (wanted = 欲しい MOD、tree-whittle の rankVariants)。
 * 差し替えた外れが消えたら元の外れが消えうる (11-07 オーナー「残したいMODの設定は2個以上候補ある時かな削減先が」)
 */
export function goneOf(data: PatchData, item: StageItem, currency: string, omens: readonly string[], wanted: readonly Aim[] = []): ReadonlySet<string> | null {
  let m = GONE.get(data);
  if (!m) GONE.set(data, (m = new Map()));
  // 削減の手か・消える側は木のほかの所と同じ見方 (isWhittleHand・handWhittleSide = エンジンに渡すお告げで見る)
  const whittle = isWhittleHand({ omens }) && wanted.length > 0;
  const key = [currency, ...omens, item.rarity, ...[...item.prefixes, ...item.suffixes].map((x) => `${x.modId}.${x.tierIndex}${x.fractured ? "f" : ""}${x.unrevealed ? "u" : ""}`), ...(whittle ? wanted.map((a) => `w:${a.modId}.${a.tier}`) : [])].join("|");
  if (m.has(key)) return m.get(key)!;
  const mods = [...item.prefixes, ...item.suffixes], ids = new Set(mods.map((x) => x.modId)), miss = missAims(data, wanted);
  // 外れか = 外れの式 (tree-miss の isMissMod、当たり方はエンジンの aimHits の sameText)
  const junkOn = (side: string): string[] => mods.filter((x) => x.side === side && !x.fractured && isMissMod(x, miss)).map((x) => x.modId);
  // お告げは品を渡して効かない状態の物を落とす (omensFor の第 3 引数)
  const outs = (whittle ? rankVariants(data, item, wanted, undefined, undefined, handWhittleSide({ omens })).map((v) => v.item) : [item]).flatMap((it) => stepOutcomes(data, it, currency, engineOmens({ omens: omensFor(currency, [...omens], it) }))?.filter((o) => !o.void) ?? []);
  const out = outs.length ? new Set(outs.flatMap((o) => o.removed.flatMap((x) => (ids.has(x.modId) ? [x.modId] : junkOn(x.side))))) : null;
  if (m.size > 20000) m.clear();
  m.set(key, out);
  return out;
}

/**
 * パーフェクトエッセンス (付く MOD が決まっている入れ替え) の手か (S-29 のエッセンスの枝、11-07 オーナー「エッセンスは入れ替わりの挙動だけど、MODは固定だからハズレMODって出さんよね」
 * 「枝の出し方はエッセンスは特別仕様やな」)。カオス・骨は付く MOD が決まっていないので今のまま (☑ しなかった候補は外れ、S-27e)
 */
// 鍵の読みはエンジンの parseKey (パーフェクトの段・ブリーチでない)。手の窓 (use-hand-keep) も同じ物を呼ぶ
export const isSwapEssenceKey = (key: string | null | undefined): boolean => { const k = key ? parseKey(key) : null; return k?.type === "essence" && k.tier === "perfect" && !k.breach; };
export const isSwapEssence = (h: Hand | null | undefined): boolean => !!h && isSwapEssenceKey(h.currency);
const SWAP = "e:";
/**
 * ☑ が 1 つも無いパーフェクトエッセンス (全部消えてよい) の枝の鍵 `e:<消えた狙いの modId>` (外れが消えたら `e:j`)。消えた MOD ごとに 1 箱 (S-29)。
 * 狙いかは完成形の狙いで見る (見本ごとの印で見ると手を置く時と回す時で鍵がずれる)。☑ のある手は今までどおり ☑ の MOD が消えたかで分ける (鍵は付けない)
 */
export function swapKeyOf(doc: TreeDoc, h: Hand | null | undefined, before: StageItem, after: StageItem): string | undefined {
  if (!isSwapEssence(h) || !h?.keep || h.keep.length) return undefined;
  const left = new Set([...after.prefixes, ...after.suffixes].map((m) => m.modId));
  const gone = [...before.prefixes, ...before.suffixes].filter((m) => !m.fractured && !left.has(m.modId));
  if (!gone.length) return undefined;
  const aim = new Set((doc.memoAims ?? []).map((a) => a.modId));
  // 未発現の MOD は外れと枠が違うので別の鍵 "u" (S-27d (ア))
  return `${SWAP}${[...new Set(gone.map((m) => (m.unrevealed ? "u" : aim.has(m.modId) ? m.modId : "j")))].sort().join(",")}`;
}
/**
 * ☑ のある (既定も) 入れ替える手 (パーフェクトエッセンス・カオス) の当たりで、未発現の MOD が入れ替わって消えた人の鍵 `e:u` (無ければ undefined)。
 * 前は当たりの箱が 1 つで、外れが消えた人と未発現が消えた人が同じ箱に入り、下の手が見本の形にしか合わずにもう 1 つの形の人が止まった
 * (S-27d (ア)「結果が 2 通り以上なら枠に分ける」、11-11 デイリーの提出 ごめんね 100 人中 41 人)
 */
export function veilSwapKeyOf(before: StageItem, after: StageItem): string | undefined {
  const left = new Set([...after.prefixes, ...after.suffixes].filter((m) => m.unrevealed).map((m) => `${m.side}|${m.modId}`));
  return [...before.prefixes, ...before.suffixes].some((m) => m.unrevealed && !m.fractured && !left.has(`${m.side}|${m.modId}`)) ? `${SWAP}u` : undefined;
}
/** 箱の鍵が入れ替わって消えた MOD の鍵 `e:` を持つか */
export const hasSwapKey = (key: string | undefined): boolean => swapGoneOf(key).length > 0;
/** 箱の鍵からエッセンスに入れ替わって消えた MOD (modId、外れは "j"。無ければ []) */
export const swapGoneOf = (key: string | undefined): string[] => key?.split(";").find((s) => s.startsWith(SWAP))?.slice(SWAP.length).split(",").filter(Boolean) ?? [];

const GOT = "g:";
/** 狙いが消えた人に付いた狙い (own = この手の当たりの札。打つ前に無く、打った後にある物) の鍵 `g:modId,…`。付いていなければ undefined */
export function gotKeyOf(data: PatchData, before: StageItem, after: StageItem, own: readonly Aim[]): string | undefined {
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
