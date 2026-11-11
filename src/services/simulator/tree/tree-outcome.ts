/**
 * tree-outcome.ts — 箱の手の結果の分け方 (回す tree-run・見本 tree-sample・精査 tree-check・配置 tree-frame・台本で同じ物を呼ぶ。2026-10-27 tree-sample.ts から分けた)。
 * ☑ の無い MOD は外れ MOD (メモ feedback-unchecked-is-junk)、消去の残したい MOD (Hand.keep) もここ。打った前後の比べはエンジンの入口 (outcomeOf の aimDiff)。
 * 分け方は handOutcome の 1 本 (G-1 S-1、11-07): 箱の結果は boxOutcomeOf、手を置く時に起こりうる結果の箱 (possibleOutsOf) は列挙した枝を handOutcome に通して集めるだけ
 */
import { applyCurrency, familiesOf, isCraftedSource, makeStageMod, mulberry32, unrevealedOf, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { revealOutcomes, stepOutcomes } from "../../simulator/sim-engine";
import { aimHeldOn } from "./tree-aim";
import { effectOf, engineOmens, isCatalyst, isRuneHand, PICK_EFFECTS } from "./tree-hands";
import { bothKeyOf, boxAims, fractureMarks, type Aim, type Hand, type OutKind, type TreeBox, type TreeDoc } from "./tree-model";
import { aimDiff, aimsOf, outcomeOf, sampleOf, SINGLE_SEEDS } from "./tree-sample";
import { sameAim, sameAimMod } from "./tree-hand-core";
import { essenceTarget, essenceTierIndex, essenceTierVerdict, isInfiniteEssence } from "../../craft-stage/apply-essence";
import { isRevealHand, revealedOf, revealHitOf, stoneAims, veilKeep, veilPick } from "./tree-veil";
import { fracFree, fracFreeHit, fracFreeOuts, junkKeyOf, newlyFractured } from "./tree-frac-pick";
import { namedGoneOf, nextKeyOf, sideKeyOf } from "./tree-junk-side";
import { isWhittleHand, joinKeys, lvClassOf, lvPart, rankVariants, stripLv, withLv } from "./tree-whittle";
import { frameHandOf, whittleCompare } from "./tree-whittle-scene";
import { aimedOfSample, sampleAimed } from "./tree-judge";
import { goalTierOf, gotOf, keptAimedOf, keptAimsOf, swapKeyOf, withGot } from "./tree-keep";
import { mainSideOf } from "./tree-uncountable";
import { sureFracOn } from "./tree-sure-frac";
import { divineOutcome, divineOuts, isDivineAim } from "./tree-divine";

/**
 * 無限のエッセンス (筋力・器用さ・知性のどれかがランダム) は ☑ した能力値だけ当たり、ほかが付いたら外れ MOD (10-27 オーナー「知性を選んだら知性が付いた = 当たり、
 * 筋力・器用さが付いた = 外れ MOD の 2 枝」)。ほかのエッセンスは付く MOD が決まっているので今のまま
 */
export const infiniteAim = (key: string | undefined): boolean => !!key && isInfiniteEssence(key);

type Outcome = { out: OutKind; hits: Aim[]; junkKey?: string };

/**
 * エッセンス / 合金を打たない時 (前の普通の MOD と系統が被る = S-33e): 飛ばす (同格以上) / 塞がる (エッセンスと同じ MOD)。打つ時は null。
 * 被るかはエンジンの E-56 (essenceTierVerdict) に聞き、同格以上かは木の決まりで値の下限どうしを比べる (11-08 夜オーナー「値で見るしかないよなエッセンスの同じMODファミリーなら」
 * 「MODの下限が24以下ならかな指標　下限値だけみたらいいよ」「これもツリーruleでしょ」): 付いている普通の MOD の段の値の幅の下限が、エッセンス / 合金で付く値の幅の下限以上なら同格以上。
 * 値が 2 つ以上ある MOD は全部の値で比べ、1 つでも下回ればエッセンスと同じ MOD。クラフト MOD・タグで被る時は今まで通り塞がる
 */
export function essenceHold(data: PatchData, item: StageItem, key: string): "skip" | "blocked" | null {
  if (effectOf(key) !== "essence") return null;
  const v = essenceTierVerdict(data, item, key)?.verdict;
  if (v !== "skip" && v !== "blocked") return null;
  const t = isInfiniteEssence(key) ? null : essenceTarget(data, item, key), lows = t?.mod.tiers[essenceTierIndex(t.level, t.mod)]?.ranges.map((r) => r[0] ?? 0);
  if (!t || !lows) return v;
  const held = [...item.prefixes, ...item.suffixes];
  const high = (f: string): boolean => held.some((m) => { const md = data.mods.get(m.modId); return !!md && familiesOf(md).includes(f) && !m.crafted && !isCraftedSource(md.source) && lows.every((lo, i) => (m.ranges[i]?.[0] ?? lo) >= lo); });
  return familiesOf(t.mod).every(high) ? "skip" : "blocked";
}
/** 枝に分けられない手をエンジンで打って見る回数 (見本 1 つあたり。決まった乱数) */
const RAW_DRAWS = 24;
/** 手を置く時の結果の箱の形 (当たりは札 1 つ) */
type BoxOut = { out: OutKind; aim: Aim | null; junkKey?: string };
/** 箱の当たりの札 = この手の当たりの箱の ☑ */
const ownOf = (doc: TreeDoc, b: Pick<TreeBox, "outs">): Aim[] => b.outs.flatMap((id) => { const c = doc.boxes[id]; return c?.out === "hit" && c.aim ? boxAims(c) : []; });
/** 外れ・打った後・外れが消えた・狙いが消えたに側の鍵を付ける (S-65・S-71g。狙いが消えたは消去もほかの手と同じく側で分ける、11-04。鍵があればそのまま) */
function sided(oc: Outcome, before: StageItem, after: StageItem): Outcome {
  // 狙いの付かないエッセンスの結果 (当たりで札が空) は洗い出しでは打った後の箱
  const bare = oc.out === "hit" && !oc.hits.length;
  if (oc.junkKey || (!bare && oc.out !== "junk" && oc.out !== "any" && oc.out !== "junkGone" && oc.out !== "lost")) return oc;
  const k = sideKeyOf(before, after);
  return k ? { ...oc, junkKey: k } : oc;
}

/**
 * 箱 b の手の結果 (回す・見本・精査・配置で同じ)。☑ の無い MOD は外れ MOD (10-27 オーナー「チェックなしは外れ MOD 扱いでしょ」): 当たりはこの手の当たりの箱の札 (☑) だけ、
 * 狙いが消えたは打つ前の ☑ で付いた狙い (aimed) だけで数え、木のほかの箱の狙いは外れ MOD として外れ・外れが消えたに入れる。
 * 前は木全部の狙いで数え、☑ の無いキャストスピードが付いた・消えた人に行き先が無く止まった (r/ibMlQuAV の 2 段目のカオスで 30 人中 28 人)。aims は木の狙い (エッセンス・フラクチャーはそのまま)。
 * aimed = 打つ前のアイテムの ☑ で付いた狙い (tree-judge)。渡すと、付いていて ☑ の無い完成形の MOD は外れ MOD として数える
 * (消えても外れが消えた・外れ。どれが狙いかは打つ前の中身、S-29・S-60。エッセンスも同じ = 大本 2)
 */
export function boxOutcomeOf(data: PatchData, doc: TreeDoc, b: TreeBox, before: StageItem, after: StageItem, aims0: readonly Aim[], aimed?: ReadonlySet<string> | null): Outcome {
  // この箱のエッセンス / 合金を打たない人 (前の手より前で同じ系統を同格以上で付けた = 飛ばす) は、この箱の下の「エッセンスと同じ MOD (同格以上)」へ (S-33e ⑦、11-11 オーナー「A」)
  if (b.hand && after === before && b.outs.some((id) => doc.boxes[id]?.out === "blocked" && doc.boxes[id]?.junkKey === SAME_HI) && essenceHold(data, before, b.hand.currency) === "skip") return { out: "blocked", hits: [], junkKey: SAME_HI };
  const oc = plainOutcomeOf(data, doc, b, before, after, aims0, aimed);
  // 次のエッセンス / 合金と同じ系統の MOD が付いた人は「エッセンスと同じ MOD」の箱へ (S-33e ③。その箱がある時だけ)。同格以上は (同格以上) の箱へ (S-33e ⑥)
  if (oc.out !== "blocked") for (const [hold, key] of [["blocked", undefined], ["skip", SAME_HI]] as const) {
    if (b.outs.some((id) => doc.boxes[id]?.out === "blocked" && doc.boxes[id]?.junkKey === key) && sameModKids(doc, b, oc.out).some((k) => essenceHold(data, after, k) === hold)) return { out: "blocked", hits: [], ...(key ? { junkKey: key } : {}) };
  }
  return lvKeyed(data, doc, b, oc, after, aimed);
}
/** 箱 b の手の結果 (「エッセンスと同じ MOD」・削減の枠の振り分けの前の本体) */
function plainOutcomeOf(data: PatchData, doc: TreeDoc, b: TreeBox, before: StageItem, after: StageItem, aims0: readonly Aim[], aimed?: ReadonlySet<string> | null): Outcome {
  const own = ownOf(doc, b);
  // 当たりの箱が無い手 (残したい MOD が全部で当たりが起きない手) も、g: の箱を作った時の ☑ で付いた狙いを見る (S-27d)
  const got = [...own, ...b.outs.flatMap((id) => gotOf(doc.boxes[id]?.junkKey).map((m) => (doc.memoAims ?? []).find((g) => g.modId === m) ?? { modId: m, tier: 99 }))];
  const oc = handOutcome(data, doc, b.hand, own, got, before, after, aims0, aimed);
  // 名前の印の MOD が消えた鍵 (n:) は、同じ鍵の結果の箱がある時だけ (S-65b2。無い = その形では 1 通りなので鍵を外した箱へ)
  return namedGoneOf(oc.junkKey) && !b.outs.some((id) => doc.boxes[id]?.junkKey === oc.junkKey) ? withoutNamed(oc) : oc;
}
/** 鍵から名前の印の MOD が消えた部品 (n:) を外す */
function withoutNamed<T extends { junkKey?: string }>(oc: T): T {
  if (!namedGoneOf(oc.junkKey)) return oc;
  const k = oc.junkKey!.split(";").filter((p) => !p.startsWith("n:")).join(";");
  const { junkKey: _drop, ...rest } = oc;
  return (k ? { ...rest, junkKey: k } : rest) as T;
}
/**
 * 削減の手前の枠 (S-65c): 結果の箱が外れの MOD レベルの組 (低い・同じ・高い) で分かれていれば、打った後の品の組を鍵に足す (一人ずつ実物の外れの MOD レベルで枠へ)。
 * 残したい MOD = 打った後に ☑ の印の付く狙い (打つ前の印 + この手で付いた狙い) を外れの式 (aimedMiss) で見た外れ以外
 */
function lvKeyed(data: PatchData, doc: TreeDoc, b: TreeBox, oc: Outcome, after: StageItem, aimed?: ReadonlySet<string> | null): Outcome {
  // 箱の種類の比べは行き先の選び (tree-shape の outBoxOf の鍵の合わせ) と同じ: 狙い無しの手の箱は「打った後」で、人の結果は外れ = 種類でなく狙いが消えたかどうかで合わせる
  // (11-10 1 外れの試し: 種類で比べて枠の鍵が付かず、高い枠の 29 人が先頭の低い枠に着いてから移り、低い枠の札が 100 人になった)
  // 当たりの箱も枠に分かれる (S-65c ①、11-10): 当たりは当たりの枠 (同じ狙い) だけ、外れ側は外れ側の枠だけに合わせる
  const fits = (c: TreeBox): boolean => (c.out === "lost") === (oc.out === "lost") && (c.out === "hit") === (oc.out === "hit") && (oc.out !== "hit" || boxAims(c).some((x) => oc.hits.some((a) => sameAim(data, a, x)))) && !!lvPart(c.junkKey) && stripLv(c.junkKey) === stripLv(oc.junkKey);
  if (oc.out === "blocked" || !b.outs.some((id) => { const c = doc.boxes[id]; return !!c && fits(c); })) return oc;
  const am = aimed ? new Set([...aimed, ...oc.hits.map((a) => a.modId)]) : null;
  // 比べるのは枠の削減の手のお告げで消える側の MOD だけ。手・札・側は枠を作る所と同じ (tree-whittle-scene)
  const at = b.outs.find((id) => { const c = doc.boxes[id]; return !!c && fits(c) && !!frameHandOf(doc, id); });
  const w = whittleCompare(data, doc, at ? frameHandOf(doc, at) : null, am, after);
  const c = lvClassOf(after, w.miss, w.side);
  return c ? { ...oc, junkKey: withLv(oc.junkKey, c) } : oc;
}
/** 「エッセンスと同じ MOD (同格以上)」の箱の鍵 (S-33e ⑥。前の手でエッセンスと同格以上の同じ系統が付いた人) */
export const SAME_HI = "hi";
/**
 * 箱 from の手の結果の箱 at から to へ進む人の品 (S-33e ⑥ の特例、11-08 オーナー「ツリーの樹で特例お願い」): at が「エッセンスと同じ MOD (同格以上)」で
 * 既定 (統合) のまま別の箱へ移る人だけ、兄弟のエッセンス / 合金と同じ系統の普通の MOD に crafted (エッセンスで付いた印) を立てる。
 * 以後の 1 品 1 つ・MOD レベルで切る手の側・カードの札はエンジンがそのまま見る。「新しいツリーを作る」にした箱 (自分の手へ進む) では立てない
 */
export function passSameHi(data: PatchData, doc: TreeDoc, from: Pick<TreeBox, "outs" | "hand">, at: string, to: string, item: StageItem): StageItem {
  const ab = doc.boxes[at];
  if (to === at || ab?.out !== "blocked" || ab.junkKey !== SAME_HI) return item;
  // 自分の手がエッセンスの箱の下の「同格以上」(S-33e ⑦) は自分の手のエッセンスで
  const own = from.hand && effectOf(from.hand.currency) === "essence" ? [from.hand.currency] : [];
  const key = [...own, ...sameModKids(doc, from)].find((k) => essenceHold(data, item, k) === "skip");
  const v = key ? essenceTierVerdict(data, item, key) : null;
  if (!v) return item; // 同格以上かは木の決まり (essenceHold の値の比べ) で決めた。系統だけエンジンから
  const mark = (m: StageMod): StageMod => { const md = data.mods.get(m.modId); return md && !m.crafted && !isCraftedSource(md.source) && familiesOf(md).some((f) => v.families.includes(f)) ? { ...m, crafted: true } : m; };
  return { ...item, prefixes: item.prefixes.map(mark), suffixes: item.suffixes.map(mark) };
}
/**
 * 「エッセンスと同じ MOD」の箱のカードに出す品 (表示だけ。回す時の分け方 essenceHold は変えない): 兄弟のエッセンス / 合金と同じ系統の普通の MOD を、
 * 乱数の見本の段でなく「エッセンスの値の下限を下回る段のうち一番高い段」(アイテムレベルで付く段) に揃える 。「エッセンスと同じ MOD (同格以上)」の箱は「エッセンスの値の下限以上の段のうち一番低い段」(S-33e、11-08 夜オーナー「エッセンス未満のティアの一番高いティアで表示させてあげて　ここ乱数でしょ。確定MODでいい」「同格以上も揃えて」)
 */
export function sameModShown(data: PatchData, doc: TreeDoc, boxId: string, item: StageItem): StageItem {
  const b = doc.boxes[boxId], p = b?.parent ? doc.boxes[b.parent] : undefined;
  if (!b || !p || b.out !== "blocked" || (b.junkKey && b.junkKey !== SAME_HI)) return item;
  const hi = b.junkKey === SAME_HI;
  const key = sameModKids(doc, p).find((k) => essenceHold(data, item, k) === (hi ? "skip" : "blocked"));
  const t = key && !isInfiniteEssence(key) ? essenceTarget(data, item, key) : null, lows = t?.mod.tiers[essenceTierIndex(t.level, t.mod)]?.ranges.map((r) => r[0] ?? 0);
  if (!t || !lows) return item;
  const fams = familiesOf(t.mod);
  const fix = (m: StageMod): StageMod => {
    const md = data.mods.get(m.modId);
    if (!md || m.crafted || isCraftedSource(md.source) || !familiesOf(md).some((f) => fams.includes(f))) return m;
    let best = -1;
    md.tiers.forEach((tr, i) => { if (tr.ilvl <= item.itemLevel && lows.every((lo, k) => (tr.ranges[k]?.[0] ?? lo) >= lo) === hi && (best < 0 || (hi ? tr.ilvl < md.tiers[best]!.ilvl : tr.ilvl > md.tiers[best]!.ilvl))) best = i; });
    return best < 0 || best === m.tierIndex ? m : { ...m, ...makeStageMod(md, m.side, best, () => 0) };
  };
  return { ...item, prefixes: item.prefixes.map(fix), suffixes: item.suffixes.map(fix) };
}
/** 箱 a の結果の箱に置いたエッセンス / 合金の手 (「エッセンスと同じ MOD」の箱を作る相手) */
/** out を渡すと、人の結果と同じ側の箱 (狙いが消えたか・当たりかが同じ。狙い無しの「打った後」は外れと同じ側) に置いたエッセンスだけ (エッセンスの箱へ行かない人は「エッセンスと同じ MOD」に入れない、S-33e) */
const sameModKids = (doc: TreeDoc, a: Pick<TreeBox, "outs">, out?: OutKind): string[] => a.outs.flatMap((id) => { const c = doc.boxes[id]; return c && c.out !== "blocked" && (!out || ((c.out === "lost") === (out === "lost") && (c.out === "hit") === (out === "hit"))) && c.hand && effectOf(c.hand.currency) === "essence" ? [c.hand.currency] : []; });
/**
 * 箱 a の手の結果に「エッセンスと同じ MOD」の箱が要るか (S-33e ①、11-08 オーナー「エッセンス打つ前の枝だから、枠を増やすのはエッセンスの前に１つ枠を作る形になるよね」):
 * a の見本に a の手を打った結果のどれかが、結果の箱に置いたエッセンス / 合金と同じ系統の普通の MOD を低い段で持つ (E-56 の塞がる) 時だけ。前の手で付きようが無ければ作らない
 */
export function needsSameMod(data: PatchData, doc: TreeDoc, aId: string, hold: "blocked" | "skip" = "blocked"): boolean {
  const a = doc.boxes[aId], keys = a ? sameModKids(doc, a) : [];
  if (!a?.hand || !keys.length) return false;
  for (let i = 1; i <= SINGLE_SEEDS; i++) {
    const smp = sampleOf(data, doc, aId, i);
    if (smp.note === "none" || smp.note?.startsWith("cant:")) continue;
    const outs = stepOutcomes(data, smp.item, a.hand.currency, engineOmens(a.hand)) ?? [];
    // エッセンスの手のある箱と同じ結果になる人だけ (11-11 枝のフルチェック: 左側の消去で外れが消えた人がエッセンスの MOD を持ったまま「塞がった」へ入り、外れが消えたの箱に誰も着かなかった)
    const aims = aimsOf(data, doc), aimed = sampleAimed(data, doc, aId, i);
    if (outs.some((o) => !o.void && sameModKids(doc, a, plainOutcomeOf(data, doc, a, smp.item, o.item, aims, aimed).out).some((k) => essenceHold(data, o.item, k) === hold))) return true;
  }
  return false;
}
/**
 * エッセンス / 合金の手の箱 eId の下に「エッセンスと同じ MOD (同格以上)」が要るか (S-33e ⑦、11-11 オーナー「A」): 1 つ前の手より上の手 (2 つ前から始まりまで) の結果で、
 * このエッセンスと同じ系統の普通の MOD を同格以上で持つ品が出うる時 (その人はここへ着いてエッセンスを打たない)。1 つ前の手の結果で付く人は 1 つ前の手の側の箱 (S-33e ⑥) へ行く
 */
export function needsSameHiUnder(data: PatchData, doc: TreeDoc, eId: string): boolean {
  const e = doc.boxes[eId], key = e?.hand?.currency;
  if (!key || effectOf(key) !== "essence") return false;
  const p = e.parent ? doc.boxes[e.parent] : undefined;
  for (let a = p?.parent ? doc.boxes[p.parent] : undefined; a; a = a.parent ? doc.boxes[a.parent] : undefined) {
    if (!a.hand) continue;
    for (let i = 1; i <= SINGLE_SEEDS; i++) {
      const smp = sampleOf(data, doc, a.id, i);
      if (smp.note === "none" || smp.note?.startsWith("cant:")) continue;
      if (essenceHold(data, smp.item, key) === "skip") return true;
      if ((stepOutcomes(data, smp.item, a.hand.currency, engineOmens(a.hand)) ?? []).some((o) => !o.void && essenceHold(data, o.item, key) === "skip")) return true;
    }
  }
  return false;
}
/**
 * 手 h の結果の分け (1 本)。own = 当たりの札 (☑。箱なら当たりの箱の札、手を置く時は棚の当たりの候補)、got = 狙いが消えた人に付いたら g: の鍵にする狙い。
 * 鍵の順: 側 s: → 次の MOD 群 (u: 未発現・f: ✦) → 付いた狙い g: → パーフェクトエッセンスの入れ替わり e:
 */
function handOutcome(data: PatchData, doc: TreeDoc, h: Hand | null | undefined, own: readonly Aim[], got: readonly Aim[], before: StageItem, after: StageItem, aims0: readonly Aim[], aimed?: ReadonlySet<string> | null): Outcome {
  const key = h?.currency;
  // 目標の数値を決めた神 (S-202): 目標に届いたら以上、届かなければ未満
  if (isDivineAim(h)) return divineOutcome(after, h!);
  // 打たなかったエッセンス / 合金 (品が変わらない): 塞がる = 塞がったの箱、飛ばす = 当たりの箱 (付く MOD は狙いに数えない = 打った後の形も受ける、S-33e)
  if (key && after === before) { const hold = essenceHold(data, before, key); if (hold) return { out: hold === "blocked" ? "blocked" : "hit", hits: [] }; }
  // 消える手の残したい MOD (S-27d): 打つ前の ☑ の代わりに残したい MOD で数える
  const am = withoutUnaimed(data, doc, before, aimed, noStones(data, doc, h, keptAimedOf(data, doc, h, aimed)));
  const aims = countedAims(data, doc, h, before, aims0, aimed);
  const raw = boxOutcomeRaw(data, doc, h, own, before, after, aims);
  // フラクチャー (S-41 の鍵) は側で分けない。エッセンスは側と次の MOD 群で分ける (S-65b)
  if (!key || effectOf(key) === "fracture") {
    const fo = withGot(data, nextKeyed(doc, h, raw, before, after, am), before, after, got);
    // ☑ に無い狙いが固定された結果は外れ (当たりの箱は ☑ の札だけ = 手を置く時の onlyOf と同じ、S-22。前は当たりのまま行き先が無かった = 枝の外れ探しの rowFracStar b9、11-06)
    return key && fo.out === "hit" && own.length && !fo.hits.some((a) => own.some((x) => x.modId === a.modId)) ? { ...fo, out: "junk", hits: [] } : fo;
  }
  const oc = withGot(data, nextKeyed(doc, h, sided(raw, before, after), before, after, am), before, after, got);
  // 数え上げられない手は当たりの人も形で分ける (S-21。組む間は鍵の合う箱が無いので今の 1 箱へ、整理で足す)
  const sc = oc.out === "hit" && h && mainSideOf(data, before, h) ? { ...oc, junkKey: sideKeyOf(before, after) } : oc;
  // ☑ の無いパーフェクトエッセンスは入れ替わって消えた MOD ごとに分ける (S-29 のエッセンスの枝)
  const sw = swapKeyOf(doc, h, before, after);
  return withBoth(sw ? { ...sc, junkKey: joinKeys(sc.junkKey, sw) } : sc);
}
/**
 * 1 手で ☑ の狙いが 2 つ以上付いた結果 (偉大なる高貴なお告げなど 2 つ足す手) は、付いた狙いの組の鍵 `a:<modId>+<modId>` を持つ「2 つとも付いた」箱へ (S-22d、11-10 オーナー
 * 「偉大って２こつくから２こ狙いMODえらんだり１こ狙いMOD選んだりで枝が結構違ってくるから作りこんでくれ」。前は当たりの箱が狙い 1 つの形しか無く、2 つとも付いた人は先頭の狙いの箱に入った)
 */
function withBoth(oc: Outcome): Outcome {
  const k = oc.out === "hit" ? bothKeyOf(oc.hits) : undefined;
  return k ? { ...oc, junkKey: joinKeys(oc.junkKey, k) } : oc;
}
/** 残したい MOD を決めていない手は置き石を狙いに数えない (S-33)。残したければ人が ☑ */
function noStones(data: PatchData, doc: TreeDoc, h: Hand | null | undefined, am: ReadonlySet<string> | null | undefined): ReadonlySet<string> | null | undefined {
  if (!am || h?.keep) return am;
  const st = new Set(stoneAims(data, doc).map((a) => a.modId));
  return st.size ? new Set([...am].filter((id) => !st.has(id))) : am;
}
/** 外れ・打った後・狙いが消えたに次の MOD 群の鍵を足す (S-65b の総則)。残したい MOD の消去は中身の鍵 (S-28e)、印の無い乱数のフラクチャーは S-41 の鍵のまま、当たりは ☑ の札 */
function nextKeyed<T extends { out: OutKind; junkKey?: string }>(doc: TreeDoc, h: Hand | null | undefined, oc: T, before: StageItem, after: StageItem, kept: ReadonlySet<string> | null | undefined): T {
  if ((oc.out === "hit" && (oc as { hits?: readonly Aim[] }).hits?.length !== 0) || fracFree(doc, h)) return oc;
  // 発現で選ぶ手は打った後に未発現が残らない (③ 見積もりは発現の前の形)
  // 名前の印の MOD が消えた鍵は、残したい MOD を決めていない手の、狙いが消えた以外の結果だけ (決めた手は選んだ MOD が狙い = 消えたら狙いが消えた、選ばなければ外れ。S-27d)
  const nk = joinKeys(joinKeys(nextKeyOf(before, after, kept, veilPick(h)), !h?.keep && oc.out !== "lost" ? namedGoneKey(doc, before, after, kept) : undefined), oc.out === "lost" ? lostKeyOf(before, after, kept) : undefined);
  return nk ? { ...oc, junkKey: joinKeys(oc.junkKey, nk) } : oc;
}
/**
 * 狙いが消えた結果の、消えた残したい MOD の鍵 `d:<modId>,…` (S-27d (ア)「結果が 2 通り以上なら枠に分ける」)。
 * 前は側の数 (s:) だけで、同じ側の別の狙い (例 クリティカル / マナコストのエッセンス) が消えた人が 1 箱にまとまり、下の自動の消去 (S-28g) が
 * 見本の形にしか合わず、もう 1 つの形の人が止まった (11-11 オーナーの木 /r/lefrj8Hz、100 人中 17 人)
 */
function lostKeyOf(before: StageItem, after: StageItem, kept: ReadonlySet<string> | null | undefined): string | undefined {
  if (!kept?.size) return undefined;
  const has = (it: StageItem, id: string): boolean => [...it.prefixes, ...it.suffixes].some((m) => m.modId === id);
  const gone = [...kept].filter((id) => has(before, id) && !has(after, id)).sort();
  return gone.length ? `d:${gone.join(",")}` : undefined;
}
/**
 * 名前の印の付いた完成形に無い MOD (木の手のエッセンス / 合金で付けた物、S-33c) が消えた数の鍵 `n:<数>` (S-65b)。側の数は同じでも、中身 (名前の印の組) が打つ前と違うので別の枝
 * (11-11 枝のフルチェック: 完成のエッセンスの後のカオスで、エッセンスの MOD が普通の外れに替わった人が「外れ (同じ側)」= ↩ 前の箱 に混ざり、前の箱と中身が違って止まった)
 */
function namedGoneKey(doc: TreeDoc, before: StageItem, after: StageItem, kept: ReadonlySet<string> | null | undefined): string | undefined {
  if (!kept?.size) return undefined;
  const goal = new Set((doc.memoAims ?? []).map((a) => a.modId)), has = (it: StageItem, id: string): boolean => [...it.prefixes, ...it.suffixes].some((m) => m.modId === id);
  const n = [...kept].filter((id) => !goal.has(id) && has(before, id) && !has(after, id)).length;
  return n ? `n:${n}` : undefined;
}/**
 * 残したい MOD のうち木の狙いに無い物 (外れの MOD を残したい時) も狙いの並びに足す (消去の keepAims と同じく、残したい MOD だけで消えた / 残ったを見る)。
 * 木の狙いにあるかは札どうしをエンジンの当て方で (sameAimMod、段は見ない)
 */
const keptPlus = (data: PatchData, doc: TreeDoc, h: Hand | null | undefined, aims: Aim[]): Aim[] => { const k = keptAimsOf(data, doc, h); return k ? [...aims, ...k.filter((a) => !aims.some((x) => sameAimMod(data, x, a)))] : aims; };
/**
 * ☑ を選ぶ手の狙い = 打つ前に付いている狙いと、この手の ☑ (picked) だけ (S-22b)。☑ の無い完成形の MOD が付いても外れ MOD。
 * 前は木の狙い全部で数え、付いた知性 (☑ 無し) が「当たり」を取ってから外れに落ちて、同時に消えた最大ライフの「狙いが消えた」が抜けた (木 oWkFcwYX の b14 のカオス)
 */
const pickedAims = (data: PatchData, before: StageItem, aims: readonly Aim[], picked: readonly Aim[]): Aim[] =>
  aims.filter((a) => picked.some((x) => sameAim(data, x, a)) || aimHeldOn(data, before, a, { sameText: true }));
/**
 * 消去の残したい MOD (☑) の段は完成形の段で見る (S-27c)。保存の ☑ は見本の段 (最大ライフ T4) で、完成形 (T5) の人の最大ライフが消えても
 * 「外れが消えた」になった (木 oWkFcwYX の b9)。完成形に無い MOD はそのまま
 */
const keepAims = goalTierOf;
/** 狙いに数える物 = ☑ で付いている物と、まだ付いていない物 (付いていて ☑ の無い完成形の MOD は外れ MOD) */
const mineOf = (data: PatchData, before: StageItem, aims: readonly Aim[], aimed: ReadonlySet<string>): Aim[] => aims.filter((a) => aimed.has(a.modId) || !aimHeldOn(data, before, a, { sameText: true }));
/**
 * 打つ前の品 before で狙いに数える札 (回す時の handOutcome と手を置く時の possibleOutsOf で 1 つ): ☑ で付いた狙い・まだ付いていない狙い・残したい MOD。
 * 付いていて ☑ の無い完成形の MOD は入れない = 外れ (tree-miss の isMissMod の相手にこの札を渡すのと同じ、S-22・S-82)。aimed が無ければ木の狙いのまま
 */
function countedAims(data: PatchData, doc: TreeDoc, h: Hand | null | undefined, before: StageItem, aims0: readonly Aim[], aimed?: ReadonlySet<string> | null): Aim[] {
  const am = noStones(data, doc, h, keptAimedOf(data, doc, h, aimed));
  if (!am) return [...aims0];
  const counted = keptPlus(data, doc, h, mineOf(data, before, aims0, am));
  return counted.filter((a) => !unaimedOn(data, doc, before, aimed, a.modId));
}
/**
 * ☑ の無い完成形の MOD は残したい MOD に選んであってもこの人では外れ (消えたら外れが消えた、S-22・S-27d)。自動で写した消去の残したい MOD を、
 * 別の枝で ☑ 無しに付き直して ↩ で来た人が持っていて、消えると「狙いが消えた」で行き先が無かった (oWkFcwYX b11 の 11 人、11-07 エミュでの枝の確かめ)
 */
function unaimedOn(data: PatchData, doc: TreeDoc, before: StageItem, aimed: ReadonlySet<string> | null | undefined, modId: string): boolean {
  if (!aimed || aimed.has(modId)) return false;
  const g = (doc.memoAims ?? []).find((x) => x.modId === modId);
  return !!g && aimHeldOn(data, before, g, { sameText: true });
}
/** 残したい MOD の印から unaimedOn の物を落とす (次の MOD 群の鍵も同じ見方) */
const withoutUnaimed = (data: PatchData, doc: TreeDoc, before: StageItem, aimed: ReadonlySet<string> | null | undefined, am: ReadonlySet<string> | null | undefined): ReadonlySet<string> | null | undefined =>
  am && aimed ? new Set([...am].filter((id) => !unaimedOn(data, doc, before, aimed, id))) : am;
/** 当たりは ☑ の札だけ (付いた狙いが ☑ に無ければ外れ MOD。札どうしはエンジンの当て方で sameAim) */
const ownHits = (data: PatchData, oc: Outcome, own: readonly Aim[]): Outcome => {
  if (oc.out !== "hit") return oc;
  const hits = oc.hits.filter((a) => own.some((x) => sameAim(data, x, a)));
  return hits.length ? { out: "hit", hits } : { out: "junk", hits: [] };
};
function boxOutcomeRaw(data: PatchData, doc: TreeDoc, h: Hand | null | undefined, own: readonly Aim[], before: StageItem, after: StageItem, aims: readonly Aim[]): Outcome {
  const key = h?.currency;
  // ルーンの手は確定の手: はめた人は全員「打った後」の 1 箱へ (当たり / 外れに分けない、S-31e)
  if (key && isRuneHand(key)) return { out: "any", hits: [] };
  if (key && infiniteAim(key)) return ownHits(data, outcomeOf(data, before, after, aims, key), own);
  // 印の無い木の狙い無しのフラクチャー: 固定された MOD の箱 (スイッチ fracPick)
  if (fracFree(doc, h)) {
    const m = newlyFractured(before, after), hit = fracFreeHit(data, m, own);
    return hit ? { out: "hit", hits: [hit] } : { out: "junk", hits: [], ...(m ? { junkKey: junkKeyOf(data, m) } : {}) };
  }
  // 骨を未発現のまま : 未発現の冒涜が付いた (打った後) 1 つ。満杯の側で狙いが消えた時だけ狙いが消えた
  if (veilKeep(h)) { const oc = outcomeOf(data, before, after, aims, key); return oc.out === "lost" ? oc : { out: "any", hits: [] }; }
  // 発現で選ぶ手: 発現した MOD が ☑ の札 (この手の当たりの箱) に当たれば当たり、ほかは外れ。持っていた狙いが消えたら ☑ が付いても狙いが消えた (S-22b)
  if (veilPick(h)) {
    const oc = outcomeOf(data, before, after, aims, key, true);
    if (oc.out === "lost") return oc;
    const hit = revealHitOf(data, revealedOf(before, after), own);
    return hit ? { out: "hit", hits: [hit] } : { out: "junk", hits: [] };
  }
  if (!key || effectOf(key) === "essence" || effectOf(key) === "fracture") return outcomeOf(data, before, after, aims, key);
  // 消去の残したい MOD (10-27 オーナー): ☑ があればその MOD だけで消えた / 外れが消えたを分ける (ほかは外れ MOD)。全部消えてよい ([]) は狙い無しで数える = 外れが消えた 1 つ
  // (前は全部消えてよいだけ別の道で「外れが消えた」と決め打っていた。消すだけの手なので狙い無しで数えると同じ、G-1 S-1)
  const keep = effectOf(key) === "remove" ? h?.keep : undefined;
  // どれが狙いかは打つ前のアイテムの中身 (付いている完成形の狙い、S-60・S-29)。道で持って着く狙いの数え (heldSets) は使わない (大本 1、R5 で消した)
  // 入れ替える・付ける手 (☑ を選ぶ手) は 消す → 付ける の順 (持っていた狙いが消えたら ☑ が付いても狙いが消えた、エッセンス S-29 と同じ順、S-22b)
  const pick = PICK_EFFECTS.includes(effectOf(key));
  // 残したい MOD も数える札 (countedAims) にある物だけ = ☑ 無しで付いている完成形の MOD は外れ (unaimedOn)
  const mine = keep ? keepAims(data, doc, keep).filter((a) => aims.some((x) => sameAimMod(data, x, a))) : pick ? pickedAims(data, before, aims, own) : aims;
  return ownHits(data, outcomeOf(data, before, after, mine, key, pick), own);
}
/** 結果 → 手を置く時の箱の形 (回す時の outBoxOf の受け方と同じ): 狙い無しの手は狙いが消えた以外を「打った後」、狙いの付かない当たり (エッセンスで外れを置き換える等) も「打った後」 */
function boxOutOf(oc: Outcome, free: boolean): BoxOut {
  const any = (free && oc.out !== "lost") || (oc.out === "hit" && !oc.hits.length);
  return { out: any ? "any" : oc.out, aim: any ? null : oc.hits[0] ?? null, ...(oc.junkKey ? { junkKey: oc.junkKey } : {}) };
}
/**
 * 起こりうる結果の箱 (10-25 オーナー「結局 例えばプレフィックスに付いたらどか考えられるでしょ」、前は手の種類ごとの決め打ち OUTS_OF と「1 通りなら 1 つ」だけ):
 * 手を置く時に、この箱の見本 (tree-sample、道で決める。S-74) を SINGLE_SEEDS 個まで取り (同じ箱でも外れが左右どちらかなどで違う)、
 * それぞれにエンジンの stepOutcomes で起こりうる行き先を全部たどり、回す時と同じ分け方 (handOutcome、当たりの札 = extra) を全部集める (当たりは付く札ごと)。お告げ込み。
 * 狙いの付かない当たり (エッセンスで外れを置き換える等) は「打った後」(any)。箱に着かなかった見本は数えない。pre = 前に打つカタリスト (エンジンで 1 回)。
 * 繰り返し・狙い無し・品質だけの手・未発現が付く手 (冒涜の骨、発現で選ぶ候補で分かれる) と、エンジンが枝に分けられない手は null (今までどおり手の種類の箱)。
 * extra = 棚の当たりの候補 (チェックした狙い・欲しい MOD のメモ)。足す・入れ替える手が「外れだけ」の時も外れだけ (11-06 から。前は null で当たりの箱を作って MOD を選ばせた)
 */
export function possibleOutsOf(data: PatchData, doc: TreeDoc, boxId: string, h: Hand, pre: string | null = null, extra: readonly Aim[] = []): BoxOut[] | null {
  // デイリーの確定フラクチャー (D-03): 箱は「✦ の MOD が固定された」1 つ (外れの枝なし)
  if (sureFracOn(doc, h)) return [{ out: "hit", aim: fractureMarks(doc)[0]! }];
  // 印の無い木の狙い無しのフラクチャー: 固定されうる MOD ごとの箱 (「〇〇がフラクチャーされた場合」。スイッチ fracPick)
  if (fracFree(doc, h)) { const f = fracFreeOuts(data, doc, Array.from({ length: SINGLE_SEEDS }, (_, i) => sampleOf(data, doc, boxId, i + 1).item)); const l = [...f.aims.map((x) => ({ out: "hit" as OutKind, aim: x })), ...f.junk.map((k) => ({ out: "junk" as OutKind, aim: null, junkKey: k }))]; return l.length ? l : null; }
  // 目標の数値を決めた神 (S-202): 目標の以上 / 未満 (届く割合が 0 か 1 の側は無し)
  if (isDivineAim(h)) { const it = sampleOf(data, doc, boxId, 1).item; return divineOuts(data, it, h); }
  // 骨を未発現のまま (狙い無し) は下の未発現の所で「未発現の冒涜が付いた」1 つに
  // 狙い無しは「打った後」1 つ (手の種類の箱) の間は付いた側ごとの「打った後」(S-65)
  const freeSide = !!h.free && !veilKeep(h);
  if (h.repeat || isCatalyst(h.currency)) return null;
  // ルーンの手は確定の手: はめた後のアイテムの「打った後」1 箱 (カタリストと同じ、S-31e。前は当たり (付く MOD 無し) と外れに分かれて輪になった)
  if (isRuneHand(h.currency)) return [{ out: "any", aim: null }];
  // ヒネコラの髪束は MOD を変えない手: 直下に予見した「打った後」の 1 箱だけ (S-39 ①、11-11 オーナー「1枠ヒネコラ打ったらその直下に枠出来るだけじゃないのそもそも」。
  // 前はエンジンの枝が取れず手の種類の既定 = 当たり + 外れ の 2 箱になり、合流をやめた後に直下が 2 つに見えた)
  if (h.currency === "hinekora") return [{ out: "any", aim: null }];
  // 後から打つ発現の手: 見本の未発現に出うる MOD (エンジンの revealOutcomes) が ☑ の札に当たれば当たり、どれにも当たらない MOD があれば外れ (発現は MOD を消さない。
  // 当て方は回す時の revealHitOf と同じ。前は ☑ の札全部 + 外れの決め打ち)。箱に着いた見本が無ければ前の形のまま
  if (isRevealHand(h.currency)) {
    const got = Array.from({ length: SINGLE_SEEDS }, (_, i) => sampleOf(data, doc, boxId, i + 1)).filter((x) => x.note !== "none" && !x.note?.startsWith("cant:"))
      .flatMap((x) => revealOutcomes(data, x.item).map((o) => revealHitOf(data, revealedOf(x.item, o.item), extra)));
    if (!got.length) return [...extra.map((a) => ({ out: "hit" as OutKind, aim: a })), { out: "junk", aim: null }];
    return [...extra.filter((a) => got.includes(a)).map((a) => ({ out: "hit" as OutKind, aim: a })), ...(got.includes(null) ? [{ out: "junk" as OutKind, aim: null }] : [])];
  }
  // 消去もほかの手と同じ狙いの並び (残したい MOD は keptAimedOf の印で見る、S-27d。11-04 に消去だけの見方は撤回)
  const tree = aimsOf(data, doc), aims = [...tree, ...extra.filter((a) => !tree.some((x) => sameAim(data, x, a)))];
  const found = new Map<string, BoxOut>();
  // 見本の中身だけで見る (持って着きうる狙いを足した形は作らない、狙いが消えうるのは見本に付いている狙い。大本 1)
  /** 未発現が付く手 (冒涜の骨): 当たり / 外れは発現で選ぶ候補で分かれるので見ない。消える側 (狙いが消えた) だけ発現の前の形で見る */
  let veiled = false, veiledLost = false, veiledKeep = false;
  /** 未発現が付く手で狙いが消える結果の鍵 (次の MOD 群、S-65b) */
  const veiledLostKeys = new Set<string>();
  /** 未発現が付く手で、狙いを消さない結果の側の鍵 (S-65) */
  const veiledSides = new Set<string>();
  // 見本 = この箱に着いた人のアイテム (着いた人が SINGLE_SEEDS より少なければ同じ物が回ってくるので 1 回だけ見る)
  const smps = Array.from({ length: SINGLE_SEEDS }, (_, i) => sampleOf(data, doc, boxId, i + 1)).filter((x) => x.note !== "none" && !x.note?.startsWith("cant:"));
  // 見本ごとの ☑ (付いていて ☑ の無い完成形の MOD は外れ MOD、消えても狙いが消えたにしない)
  for (let s = 1; s <= SINGLE_SEEDS; s++) sampleAimed(data, doc, boxId, s);
  const seen = new Set<StageItem>();
  /** エンジンが枝に分けられない手 (錬金など 3 つ以上足す・振り直す) で、エンジンそのもので打つと狙いが消える人がいたか (S-21a) */
  let rawLost = false;
  for (const [i, smp] of smps.entries()) {
    const seed = i + 1;
    if (seen.has(smp.item)) continue;
    seen.add(smp.item);
    const item = pre ? applyCurrency(data, smp.item, pre, mulberry32(seed)).item : smp.item;
    const aimed = aimedOfSample(boxId, smp.item) ?? sampleAimed(data, doc, boxId, seed);
    // 削減の手は外れを MOD レベルの範囲ごとの代わりに差し替えた形で見る (見本の外れ 1 つの MOD レベルで決めない、S-65b・tree-whittle)
    // 差し替えで見る欲しい MOD と組の比べの相手は同じ札 (tree-whittle-scene の whittleCompare、枠を作る所と同じ)
    const w = isWhittleHand(h) ? whittleCompare(data, doc, h, aimed, item) : null;
    const all = w ? rankVariants(data, item, w.wanted, doc.boxes[boxId]?.junkKey, w.miss, w.side).map((v) => v.item) : [item];
    for (const it of all) {
      // 打たないエッセンス / 合金 (飛ばす / 塞がる、S-33e) は品のままの 1 枝
      if (essenceHold(data, it, h.currency)) { const e = boxOutOf(handOutcome(data, doc, h, extra, extra, it, it, aims, aimed), freeSide); found.set(`${e.out}:${e.aim ? `${e.aim.modId}/${e.aim.tier}` : ""}:${e.junkKey ?? ""}`, e); continue; }
      const outs = stepOutcomes(data, it, h.currency, engineOmens(h))?.filter((o) => !o.void);
      // 枝に分けられない手は、エンジンの 1 手そのもの (applyCurrency) を決まった乱数で RAW_DRAWS 回打ち、回す時と同じ分け方で狙いが消える人がいるかだけ見る
      // (11-11 枝のフルチェック: 狙い 1 のマジックに錬金 = 振り直しで大半の人の狙いが消えるのに、手の種類の既定 (当たり + 外れ) に「狙いが消えた」が無く止まった)
      if (!outs && !rawLost) for (let k = 0; k < RAW_DRAWS && !rawLost; k++) { const r = applyCurrency(data, it, h.currency, mulberry32(seed * 1000 + k), engineOmens(h)); if (r.applied && handOutcome(data, doc, h, extra, extra, it, r.item, aims, aimed).out === "lost") rawLost = true; }
      // 打てない見本は飛ばす (外れの種類で打てない人。その人は打てる箱へ移る S-64)。全部打てなければ下の list が空で null
      if (!outs?.length) continue;
      // 未発現が新しく付く手だけ (前から未発現を持ったまま打つフラクチャー・カオスなどは普通に分ける)
      if (outs.some((o) => unrevealedOf(o.item)) && !unrevealedOf(it)) {
        veiled = true;
        // 消えて「狙いが消えた」になるのは打つ前の ☑ で付いた狙いだけ = 回す時の handOutcome と同じ札 (countedAims)。☑ の無い完成形の MOD は外れなので、
        // 骨が消しても外れの側 (外れ・未発現のまま なら打った後) に入る (11-07。前は木の狙い全部で数え、☑ の無い完成形の MOD が消えると手を置く時だけ「狙いが消えた」の箱が出た。
        // 10-28 モンキー 6 の錬金術の打った後のキャストも同じ)。残したい MOD を決めた骨は、その MOD が消えた時だけ狙いが消えた (S-27d、countedAims の中)
        const held = countedAims(data, doc, h, it, aims, aimed);
        const lostOf = (o: { item: StageItem }): number => aimDiff(data, it, o.item, held, { sameText: true }).lost.length;
        if (outs.some((o) => lostOf(o))) veiledLost = true;
        // 狙いを消さない結果があるか (満杯の側で全部が狙いなら、骨は必ず狙いを消す = 当たり・外れ・打った後の箱は起こらない。10-28 冒涜まわりの確かめ)
        if (outs.some((o) => !lostOf(o))) veiledKeep = true;
        const kept = keptAimedOf(data, doc, h, aimed);
        for (const o of outs) { const sk = !lostOf(o) ? sideKeyOf(it, o.item) : undefined; if (sk) veiledSides.add(joinKeys(sk, nextKeyOf(it, o.item, kept, veilPick(h)))!); }
        for (const o of outs) if (lostOf(o)) { const e = nextKeyed(doc, h, sided({ out: "lost", hits: [] }, it, o.item), it, o.item, kept); if (e.junkKey) veiledLostKeys.add(e.junkKey); }
        continue;
      }
      // 結果の分けは回す時と同じ handOutcome (当たりの札・付いた狙いの札 = 棚の当たりの候補 extra)
      for (const o of outs) {
        const oc = handOutcome(data, doc, h, extra, extra, it, o.item, aims, aimed);
        // ☑ の狙いが 2 つ以上同時に付く結果も箱にする (「2 つとも付いた」、鍵 a:、S-22d。前は null で手の種類の箱に戻り、2 つとも付いた箱が出なかった)
        const e = boxOutOf(oc, freeSide);
        found.set(`${e.out}:${e.aim ? `${e.aim.modId}/${e.aim.tier}` : ""}:${e.junkKey ?? ""}`, e);
      }
    }
  }
  // 冒涜: 当たり (この手の札) と外れはいつも、狙いが消えたは消える側で狙いを失いうる時だけ (10-25 シミュ 28 の洗い出し: 満杯の側に死霊術で打つと 13〜14% 狙いが消えるのに箱が無く、回すと止まった)
  // 骨を未発現のまま: 未発現の冒涜が付いた (打った後) 1 つ + 狙いが消えうる時は狙いが消えた
  const veiledLostOuts = (): BoxOut[] => (veiledLostKeys.size ? [...veiledLostKeys].sort().map((junkKey) => ({ out: "lost" as OutKind, aim: null, junkKey })) : [{ out: "lost", aim: null }]);
  if (veiled && !veiledKeep) return veiledLostOuts();
  // 側の鍵があれば側ごと (S-65)
  const vs = (out: OutKind): BoxOut[] => (veiledSides.size ? [...veiledSides].sort().map((junkKey) => ({ out, aim: null, junkKey })) : [{ out, aim: null }]);
  if (veiled && veilKeep(h)) return [...vs("any"), ...(veiledLost ? veiledLostOuts() : [])];
  // もう持っている狙いがもう一度付く道は数えない (S-24。起きない当たりの箱が出た)
  const unheldAim = (a: Aim): boolean => smps.some((s) => !aimHeldOn(data, s.item, a, { sameText: true }));
  if (veiled) return [...extra.filter(unheldAim).map((a) => ({ out: "hit" as OutKind, aim: a })), ...vs("junk"), ...(veiledLost ? veiledLostOuts() : [])];
  // ✦ の木のフラクチャーも結果は全部箱にする (S-43 の「✦ の当たりだけ箱、外れは費用に足す」は 11-05 撤回。回す時は素のフラクチャーで ✦ の無い MOD も固定されうるのに、
  // 箱が無く行き先無しになっていた = 枝の外れ探しの rowFracStar b9、11-06。S-200 ①)
  // 名前の印の MOD が消えた鍵 (n:) は、同じ種類・同じ残りの鍵で消えなかった結果も並ぶ時だけ残す (1 通りなら外して今の箱のまま = 保存した木の決めを崩さない、S-65b2)
  const bare = (e: BoxOut): string => `${e.out}:${e.aim?.modId ?? ""}:${withoutNamed(e).junkKey ?? ""}`;
  const list0 = [...found.values()];
  const list = list0.map((e) => (namedGoneOf(e.junkKey) && !list0.some((x) => !namedGoneOf(x.junkKey) && bare(x) === bare(e)) ? withoutNamed(e) : e)).filter((e, i, l) => l.findIndex((x) => bare(x) === bare(e) && x.junkKey === e.junkKey) === i);
  // 枝に分けられない手で狙いが消えうる: 手の種類の既定の箱 (当たり + 外れ / 狙い無しは打った後) に「狙いが消えた」を足す (S-21a。側の鍵は付けない = 1 箱ずつ)
  if (!list.length && rawLost) return [...(freeSide ? [{ out: "any" as OutKind, aim: null }] : [...extra.filter(unheldAim).map((a) => ({ out: "hit" as OutKind, aim: a })), { out: "junk" as OutKind, aim: null }]), { out: "lost", aim: null }];
  // 足す・入れ替える手が外れだけの時も外れ (と消えた) だけ = 箱の下はエンジンの結果と同じ (S-21、11-06 オーナー「直すのはいいけど」。前はまだ付いていない狙いがあると
  // 手の種類の箱へ逃がし、MOD を選ぶ当たりの箱を作ったが、エンジンではどの狙いも付かないので誰も来ない箱だった = 乱数の確かめの高貴のずれ)
  return list.length ? list : null;
}

/** ✦ 以外の MOD の数 (全部消えてよい消去では全部外れ MOD) */
export const looseOf = (it: StageItem): number => [...it.prefixes, ...it.suffixes].filter((m) => !m.fractured).length;
