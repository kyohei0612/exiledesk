/**
 * tree-low-tier.ts — 「<狙い> 低ティア MOD」の箱 (S-33g、スイッチ lowTierBox、11-16 オーナー「Aだけど、王者だけじゃなくて初めてその狙いＭＯＤを付けた時の挙動として
 * 起こりうるタイミング全部に枠ださんといかんな」、ブラック 114 経由)。その道で初めて狙い A を ☑ した手の結果に、手の後の品が A の系統を段の足りない形で持つ人
 * (その手で付いた・前の狙い無しの手で付いていた) の箱を A ごとに 1 つ (out blocked・鍵 lt:<modId>)。同じ系統は 1 つなので、その人には以後 A が付かない。
 * 判定は外れの式 (tree-miss の isMissMod = エンジンの aimHits、段の番号) と系統 (E-11a) だけ。木の形を変えるのは ☑ のある手の結果だけ (☑ の無い木は今のまま)
 */
import { familiesOf, type PatchData, type StageItem } from "../../craft-stage/engine";
import { stepOutcomes } from "../../simulator/sim-engine";
import { flag } from "../../../web/release-flags";
import { boxAims, type Aim, type OutKind, type TreeBox, type TreeDoc } from "./tree-model";
import { isMissMod, missAims } from "./tree-miss";
import { aimFams } from "./tree-junk-frame";
import { sameAim } from "./tree-hand-core";
import { effectOf, engineOmens } from "./tree-hands";
import { sampleOf, SINGLE_SEEDS } from "./tree-sample";

/** 低ティアの箱の鍵の頭 (後ろは狙いの modId) */
export const LOW_TIER = "lt:";
export const lowTierKey = (a: Pick<Aim, "modId">): string => `${LOW_TIER}${a.modId}`;
/** 鍵が低ティアの箱なら狙いの modId */
export const lowTierModOf = (k: string | undefined): string | null => (k?.startsWith(LOW_TIER) ? k.slice(LOW_TIER.length) : null);
/** スマホの全体図の短い名前 */
export const LOW_SHORT: readonly [string, string] = ["低ティア", "Low tier"];
/** 低ティアの箱か (「エッセンスと同じ MOD」と同じ種類 blocked で、鍵だけ違う) */
export const isLowTierBox = (b: Pick<TreeBox, "out" | "junkKey"> | undefined): boolean => b?.out === "blocked" && !!lowTierModOf(b.junkKey);

/** 品 item が狙い a の系統を段の足りない形で持つか (a に当たる MOD は持たない)。未発現は見ない */
export function holdsLowTier(data: PatchData, item: StageItem, a: Aim): boolean {
  const fams = new Set(aimFams(data, a));
  if (!fams.size) return false;
  const x = missAims(data, [a]), mods = [...item.prefixes, ...item.suffixes].filter((m) => !m.unrevealed);
  if (mods.some((m) => !isMissMod(m, x))) return false;
  return mods.some((m) => { const md = data.mods.get(m.modId); return !!md && familiesOf(md).some((f) => fams.has(f)); });
}

/** 箱 b の手の当たりの箱の狙い (☑) */
const pickedOf = (doc: TreeDoc, b: TreeBox): Aim[] => b.outs.flatMap((id) => { const c = doc.boxes[id]; return c?.out === "hit" ? boxAims(c) : []; });

/**
 * 箱 b の手で ☑ した狙いのうち、その道 (始まりから b まで) で初めて ☑ した物。エッセンス / 合金の手は「エッセンスと同じ MOD」(S-33e) が受けるので無し。
 * 「いずれかの元素耐性」(S-10h) は 1 元素の低い段で他の元素が塞がらないので無し
 */
export function firstAimsOf(data: PatchData, doc: TreeDoc, b: TreeBox): Aim[] {
  if (!b.hand || effectOf(b.hand.currency) === "essence") return [];
  const seen: Aim[] = [];
  for (let p = b.parent ? doc.boxes[b.parent] : undefined; p; p = p.parent ? doc.boxes[p.parent] : undefined) seen.push(...pickedOf(doc, p));
  const out: Aim[] = [];
  for (const a of pickedOf(doc, b)) if (!a.anyEle && !seen.some((x) => sameAim(data, x, a)) && !out.some((x) => sameAim(data, x, a))) out.push(a);
  return out;
}

/** 箱 id の見本と、その手を打った結果 (エンジンの数え上げ) のどれかが a を段の足りない形で持つか */
function lowAtRaw(data: PatchData, doc: TreeDoc, id: string, a: Aim, self: boolean): boolean {
  const b = doc.boxes[id];
  if (!b?.hand) return false;
  for (let i = 1; i <= SINGLE_SEEDS; i++) {
    const smp = sampleOf(data, doc, id, i);
    if (smp.note === "none" || smp.note?.startsWith("cant:")) continue;
    if (self && holdsLowTier(data, smp.item, a)) return true;
    if ((stepOutcomes(data, smp.item, b.hand.currency, engineOmens(b.hand)) ?? []).some((o) => !o.void && holdsLowTier(data, o.item, a))) return true;
  }
  return false;
}

/**
 * 箱 bId の手の結果に「<a> 低ティア MOD」の箱が要るか: この箱の見本とその手の結果、上の手 (始まりまで) の結果、↩ でこの箱へ着く箱の道の手の結果の
 * どれかが a を段の足りない形で持ちうる時。代表の外れは狙いの族を取らない (外れは枠だけ、S-200 ③) ので、この箱の見本だけでは見ない (レビュワー 1 の 16)
 */
export function needsLowTier(data: PatchData, doc: TreeDoc, bId: string, a: Aim, memo?: Map<string, boolean>): boolean {
  // memo = 1 回のそろえ (syncLowTier) の中の控え。同じ箱・同じ狙いの見本 × 手の結果を何度も打たない (レビュワー 1 の 28、根の近くに手を置いた時の重さ)
  const lowAt = (d: PatchData, dc: TreeDoc, id: string, x: Aim, self: boolean): boolean => {
    if (!memo) return lowAtRaw(d, dc, id, x, self);
    const k = `${id}|${x.modId}|${x.tier}|${self ? 1 : 0}`;
    let v = memo.get(k);
    if (v === undefined) { v = lowAtRaw(d, dc, id, x, self); memo.set(k, v); }
    return v;
  };
  if (lowAt(data, doc, bId, a, true)) return true;
  const roots = [bId, ...Object.values(doc.boxes).filter((x) => x.back === bId).map((x) => x.id)];
  for (const r of roots) {
    const start = r === bId ? doc.boxes[bId]?.parent : r;
    for (let p = start ? doc.boxes[start] : undefined; p; p = p.parent ? doc.boxes[p.parent] : undefined) {
      if (p.id !== r && pickedOf(doc, p).some((x) => sameAim(data, x, a))) break; // 上で同じ狙いを ☑ した手より上は、その手の低ティアの箱が受ける
      if (lowAt(data, doc, p.id, a, false)) return true;
    }
  }
  return false;
}

/**
 * 箱 b の手の結果 oc を、低ティアの箱へ振り直す (回す・見本・精査・配置で同じ。boxOutcomeOf から)。当たり・狙いが消えた・塞がったはそのまま。
 * 手の後の品 after が箱の狙いを段の足りない形で持てば、その狙いの低ティアの箱へ (その箱がある時だけ)
 */
export function lowTierOutcome<T extends { out: OutKind; hits: Aim[]; junkKey?: string }>(data: PatchData, doc: TreeDoc, b: TreeBox, oc: T, after: StageItem): T {
  if (!flag("lowTierBox") || oc.out === "hit" || oc.out === "lost" || oc.out === "blocked") return oc;
  for (const id of b.outs) {
    const c = doc.boxes[id], k = c?.out === "blocked" && lowTierModOf(c.junkKey) ? c.junkKey : null;
    const a = k ? pickedOf(doc, b).find((x) => lowTierKey(x) === k) : undefined; // 箱の鍵から狙いを引く (MOD の当たりの比べではない)
    if (a && holdsLowTier(data, after, a)) return { ...oc, out: "blocked", hits: [], junkKey: c!.junkKey };
  }
  return oc;
}
