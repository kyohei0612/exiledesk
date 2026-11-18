/**
 * tree-low-tier.ts — 狙いが低いティアで付いた人 (S-33g、スイッチ lowTierBox)。11-16 オーナー「低ティアの枠はどうすっかね。もう排除するか…全部予期せぬMODに入れちゃっておk。
 * その回どうせ回しなおすんでしょ？」(ブラック 122 経由) = 木に「<狙い> 低ティア MOD」の箱は作らない。回した時に ☑ した手の後の品が狙い A の系統を段の足りない形で
 * 持つ人 (同じ系統は 1 つなので以後 A は付かない) は、そこで「予期せぬ狙い MOD」の止まり (S-33g ②) になり、やり直し (goalRetry) に入る。
 * 判定は外れの式 (tree-miss の isMissMod = エンジンの aimHits、段の番号) と系統 (E-11a) だけ。前に作った低ティアの箱 (鍵 lt:<modId>) の名前・見分けは残す (前の木を開いた時)
 */
import { familiesOf, type PatchData, type StageItem } from "../../craft-stage/engine";
import { flag } from "../../../web/release-flags";
import { tr } from "../../../i18n/lang";
import { boxAims, type Aim, type OutKind, type TreeBox, type TreeDoc } from "./tree-model";
import { isMissMod, missAims } from "./tree-miss";
import { aimFams } from "./tree-junk-frame";
import { effectOf } from "./tree-hands";

/** 低ティアの箱の鍵の頭 (後ろは狙いの modId。前に作った箱だけ) */
export const LOW_TIER = "lt:";
export const lowTierKey = (a: Pick<Aim, "modId">): string => `${LOW_TIER}${a.modId}`;
/** 鍵が低ティアの箱なら狙いの modId */
export const lowTierModOf = (k: string | undefined): string | null => (k?.startsWith(LOW_TIER) ? k.slice(LOW_TIER.length) : null);
/** スマホの全体図の短い名前 */
export const LOW_SHORT: readonly [string, string] = ["低ティア", "Low tier"];
/** 低ティアの箱か (「エッセンスと同じ MOD」と同じ種類 blocked で、鍵だけ違う。前に作った箱) */
export const isLowTierBox = (b: Pick<TreeBox, "out" | "junkKey"> | undefined): boolean => b?.out === "blocked" && !!lowTierModOf(b.junkKey);

/** 品 item が狙い a の系統を段の足りない形で持つか (a に当たる MOD は持たない)。未発現は見ない */
export function holdsLowTier(data: PatchData, item: StageItem, a: Aim): boolean {
  const fams = new Set(aimFams(data, a));
  if (!fams.size) return false;
  const x = missAims(data, [a]), mods = [...item.prefixes, ...item.suffixes].filter((m) => !m.unrevealed);
  if (mods.some((m) => !isMissMod(m, x, item))) return false;
  return mods.some((m) => { const md = data.mods.get(m.modId); return !!md && familiesOf(md).some((f) => fams.has(f)); });
}

/** 箱 b の手の当たりの箱の狙い (☑) */
const pickedOf = (doc: TreeDoc, b: TreeBox): Aim[] => b.outs.flatMap((id) => { const c = doc.boxes[id]; return c?.out === "hit" ? boxAims(c) : []; });

/** 前に作った低ティアの箱 b の狙い (鍵 lt:<modId> と同じ modId の完成形の狙い。withParent の時は親の手の当たりの箱の狙いを先に見る = 箱の名前) */
export function lowTierAimOf(doc: TreeDoc, b: (Pick<TreeBox, "out" | "junkKey"> & { parent?: string | null }) | undefined, withParent = false): Aim | undefined {
  if (!b || !isLowTierBox(b)) return undefined;
  const p = withParent && b.parent ? doc.boxes[b.parent] : undefined;
  return [...(p ? pickedOf(doc, p) : []), ...(doc.memoAims ?? [])].find((x) => lowTierKey(x) === b.junkKey);
}

/**
 * 箱 b の手 (結果 oc、手の後の品 after) で ☑ した狙いが低いティアで付いた人の止まり (スイッチ lowTierBox。無ければ null)。
 * 当たり・狙いが消えた・塞がったの人はそのまま。エッセンス / 合金の手は S-33e (essSameStop) が受け、「いずれかの元素耐性」(S-10h) は 1 元素の低い段で
 * ほかの元素が塞がらないので見ない
 */
export function lowTierStopOf(data: PatchData, doc: TreeDoc, b: TreeBox, oc: { out: OutKind }, after: StageItem, before?: StageItem, okLow?: ReadonlySet<string>): { why: string } | null {
  if (!flag("lowTierBox") || !b.hand || effectOf(b.hand.currency) === "essence" || oc.out === "hit" || oc.out === "lost" || oc.out === "blocked") return null;
  // (スイッチ lowTierJunk) この手で低い段が付いた人 (打つ前は持っていない) は止めず外れ MOD と同じ扱い = 結果の箱へ。止めるのは前の手で付いていた人だけ (11-16 オーナー「低ティアの扱いってそもそも1つ前に出た時云々じゃないの？」)
  // A を ☑ した手で付いた低い段 (okLow、lowTierOk) は前から持っていても止めない (外れの箱が ↩ で同じカオスへ戻った人、S-33g ①)
  const junkNow = flag("lowTierJunk") && !!before;
  const a = pickedOf(doc, b).find((x) => !x.anyEle && holdsLowTier(data, after, x) && !(junkNow && (!holdsLowTier(data, before!, x) || !!okLow?.has(lowTierKey(x)))));
  if (!a) return null;
  return { why: junkNow
    ? tr("前の手 (この狙いを ☑ していない手) で狙いの MOD が低いティアで付いていた (以後この狙いは付かない。予期せぬ狙い MOD)", "The target mod was already added at a low tier by an earlier craft that didn't check it (it can no longer be added; unexpected target mod)")
    : tr("☑ した狙いの MOD が低いティアで付いた (以後この狙いは付かない。予期せぬ狙い MOD)", "The checked target mod was added at a low tier (it can no longer be added; unexpected target mod)") };
}
/**
 * (スイッチ lowTierJunk、S-33g ①) 人ごとの「A を ☑ した手で付いた低い段の狙い」(鍵 lowTierKey) を、手の後の品で更新する。
 * その手が ☑ した狙いで、打つ前は持たず後で低い段を持つ物を足し、低い段を持たなくなった物は外す
 */
export function lowTierOk(data: PatchData, doc: TreeDoc, b: TreeBox, before: StageItem, after: StageItem, ok: ReadonlySet<string>): ReadonlySet<string> {
  if (!flag("lowTierJunk")) return ok;
  const goal = new Map((doc.memoAims ?? []).map((g) => [lowTierKey(g), g] as const));
  const next = new Set([...ok].filter((m) => { const g = goal.get(m); return !!g && holdsLowTier(data, after, g); }));
  for (const x of pickedOf(doc, b)) if (!x.anyEle && holdsLowTier(data, after, x) && !holdsLowTier(data, before, x)) next.add(lowTierKey(x));
  return next.size || ok.size ? next : ok;
}
