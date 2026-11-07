/**
 * tree-outcome.ts — 箱の手の結果の分け方 (回す tree-run・見本 tree-sample・精査 tree-check・台本で同じ物を呼ぶ。2026-10-27 tree-sample.ts から分けた)。
 * ☑ の無い MOD は外れ MOD (メモ feedback-unchecked-is-junk)、消去の残したい MOD (Hand.keep) もここ。打った前後の比べはエンジンの入口 (outcomeOf の aimDiff)
 */
import { applyCurrency, mulberry32, unrevealedOf, type PatchData, type StageItem } from "../../craft-stage/engine";
import { stepOutcomes } from "../../simulator/sim-engine";
import { aimHeldOn } from "./tree-aim";
import { effectOf, engineOmens, isCatalyst, isRuneHand } from "./tree-hands";
import { boxAims, type Aim, type Hand, type OutKind, type TreeBox, type TreeDoc } from "./tree-model";
import { aimDiff, aimsOf, outcomeOf, sampleOf, SINGLE_SEEDS } from "./tree-sample";
import { isInfiniteEssence } from "../../craft-stage/apply-essence";

/**
 * 無限のエッセンス (筋力・器用さ・知性のどれかがランダム) は ☑ した能力値だけ当たり、ほかが付いたら外れ MOD (10-27 オーナー「知性を選んだら知性が付いた = 当たり、
 * 筋力・器用さが付いた = 外れ MOD の 2 枝」)。ほかのエッセンスは付く MOD が決まっているので今のまま
 */
export const infiniteAim = (key: string | undefined): boolean => !!key && isInfiniteEssence(key);
import { isRevealHand, revealedOf, revealHitOf, stoneAims, veilKeep, veilPick } from "./tree-veil";
import { fracFree, fracFreeHit, fracFreeOuts, junkKeyOf, newlyFractured } from "./tree-frac-pick";
import { nextKeyOf, sideKeyOf } from "./tree-junk-side";
import { aimedAims, isWhittleHand, joinKeys, rankVariants } from "./tree-whittle";
import { aimedOfSample, sampleAimed } from "./tree-judge";
import { gotOf, keptAimedOf, keptAimsOf, withGot } from "./tree-keep";
import { itemKeyOf } from "./tree-sample-key";
import { mainSideOf, rolledOutcomes } from "./tree-uncountable";
import { divineOutcome, divineOuts, isDivineAim } from "./tree-divine";

type Outcome = { out: OutKind; hits: Aim[]; junkKey?: string };
/** 狙いが消えたも側で分ける (S-65・S-71g)。消去もほかの手と同じ (11-04、S-28e の中身の鍵は撤回) */
const lostSided = (_h: Hand | null | undefined): boolean => true;
/** 外れ・打った後・外れが消えたに側の鍵を付ける (S-65。閉じていれば今のまま) */
function sided(oc: Outcome, before: StageItem, after: StageItem, h?: Hand | null): Outcome {
  // 狙いの付かないエッセンスの結果 (当たりで札が空) は洗い出しでは打った後の箱
  const bare = oc.out === "hit" && !oc.hits.length;
  if (oc.junkKey || (!bare && oc.out !== "junk" && oc.out !== "any" && oc.out !== "junkGone" && !(oc.out === "lost" && lostSided(h)))) return oc;
  const k = sideKeyOf(before, after);
  return k ? { ...oc, junkKey: k } : oc;
}

/**
 * 箱 b の手の結果 (回す・見本・精査で同じ)。☑ の無い MOD は外れ MOD (10-27 オーナー「チェックなしは外れ MOD 扱いでしょ」): 当たりはこの手の当たりの箱の札 (☑) だけ、
 * 狙いが消えたはこの箱に持って着きうる狙い (道の当たりの札、tree-lost の aimsMayHold) だけで数え、木のほかの箱の狙いは外れ MOD として外れ・外れが消えたに入れる。
 * 前は木全部の狙いで数え、☑ の無いキャストスピードが付いた・消えた人に行き先が無く止まった (r/ibMlQuAV の 2 段目のカオスで 30 人中 28 人)。aims は木の狙い (エッセンス・フラクチャーはそのまま)
 */
/**
 * aimed = 打つ前のアイテムの ☑ で付いた狙い (tree-judge)。渡すと、付いていて ☑ の無い完成形の MOD は外れ MOD として数える
 * (消えても外れが消えた・外れ。どれが狙いかは打つ前の中身、S-29・S-60。エッセンスも同じ = 大本 2)
 */
export function boxOutcomeOf(data: PatchData, doc: TreeDoc, b: TreeBox, before: StageItem, after: StageItem, aims0: readonly Aim[], aimed?: ReadonlySet<string> | null): Outcome {
  const key = b.hand?.currency;
  // 目標の数値を決めた神 (S-202): 目標に届いたら以上、届かなければ未満
  if (isDivineAim(b.hand)) return divineOutcome(after, b.hand!);
  // 消える手の残したい MOD (S-27d): 打つ前の ☑ の代わりに残したい MOD で数える
  const am = noStones(doc, b.hand, keptAimedOf(doc, b.hand, aimed)), nx = am;
  const aims = am ? keptPlus(doc, b.hand, mineOf(data, before, aims0, am)) : aims0;
  const own = b.outs.flatMap((id) => { const c = doc.boxes[id]; return c?.out === "hit" && c.aim ? boxAims(c) : []; });
  // 当たりの箱が無い手 (残したい MOD が全部で当たりが起きない手) も、g: の箱を作った時の ☑ で付いた狙いを見る (S-27d)
  const got = [...own, ...b.outs.flatMap((id) => gotOf(doc.boxes[id]?.junkKey).map((m) => (doc.memoAims ?? []).find((g) => g.modId === m) ?? { modId: m, tier: 99 }))];
  // フラクチャー (S-41 の鍵) は側で分けない。エッセンスは側と次の MOD 群で分ける (S-65b)
  if (!key || effectOf(key) === "fracture") {
    const fo = withGot(data, nextKeyed(doc, b, boxOutcomeRaw(data, doc, b, before, after, aims), before, after, nx), before, after, got);
    // ☑ に無い狙いが固定された結果は外れ (当たりの箱は ☑ の札だけ = 手を置く時の onlyOf と同じ、S-22。前は当たりのまま行き先が無かった = 枝の外れ探しの rowFracStar b9、11-06)
    return key && fo.out === "hit" && own.length && !fo.hits.some((a) => own.some((x) => x.modId === a.modId)) ? { ...fo, out: "junk", hits: [] } : fo;
  }
  const oc = withGot(data, nextKeyed(doc, b, sided(boxOutcomeRaw(data, doc, b, before, after, aims), before, after, b.hand), before, after, nx), before, after, got);
  // 数え上げられない手は当たりの人も形で分ける (S-21。組む間は鍵の合う箱が無いので今の 1 箱へ、整理で足す)
  return oc.out === "hit" && b.hand && mainSideOf(data, before, b.hand) ? { ...oc, junkKey: sideKeyOf(before, after) } : oc;
}
/** 残したい MOD を決めていない手は置き石を狙いに数えない (S-33)。残したければ人が ☑ */
function noStones(doc: TreeDoc, h: Hand | null | undefined, am: ReadonlySet<string> | null | undefined): ReadonlySet<string> | null | undefined {
  if (!am || h?.keep) return am;
  const st = new Set(stoneAims(doc).map((a) => a.modId));
  return st.size ? new Set([...am].filter((id) => !st.has(id))) : am;
}
/** 外れ・打った後・狙いが消えたに次の MOD 群の鍵を足す (S-65b の総則)。残したい MOD の消去は中身の鍵 (S-28e)、印の無い乱数のフラクチャーは S-41 の鍵のまま、当たりは ☑ の札 */
function nextKeyed<T extends { out: OutKind; junkKey?: string }>(doc: TreeDoc, b: Pick<TreeBox, "hand">, oc: T, before: StageItem, after: StageItem, kept: ReadonlySet<string> | null | undefined): T {
  if ((oc.out === "hit" && (oc as { hits?: readonly Aim[] }).hits?.length !== 0) || fracFree(doc, b.hand)) return oc;
  // 発現で選ぶ手は打った後に未発現が残らない (③ 見積もりは発現の前の形)
  const nk = nextKeyOf(before, after, kept, veilPick(b.hand));
  return nk ? { ...oc, junkKey: joinKeys(oc.junkKey, nk) } : oc;
}
/** 残したい MOD のうち木の狙いに無い物 (外れの MOD を残したい時) も狙いの並びに足す (消去の keepAims と同じく、残したい MOD だけで消えた / 残ったを見る) */
const keptPlus = (doc: TreeDoc, h: Hand | null | undefined, aims: Aim[]): Aim[] => { const k = keptAimsOf(doc, h); return k ? [...aims, ...k.filter((a) => !aims.some((x) => x.modId === a.modId))] : aims; };
/** 残したい MOD の消去か (☑ が 1 つ以上) */
export const isKeepAnnul = (h: Hand | null | undefined): h is Hand => !!h?.keep?.length && effectOf(h.currency) === "remove";
/** ☑ を選ぶ手 (付け足す・入れ替える = 高貴・カオスなど。tree-hand-plan の FREE_EFFECTS と同じ) */
const PICK_EFFECTS: readonly string[] = ["add", "swap"];
/**
 * ☑ を選ぶ手の狙い = 打つ前に付いている狙いと、この手の ☑ (picked) だけ (S-22b)。☑ の無い完成形の MOD が付いても外れ MOD。
 * 前は木の狙い全部で数え、付いた知性 (☑ 無し) が「当たり」を取ってから外れに落ちて、同時に消えた最大ライフの「狙いが消えた」が抜けた (木 oWkFcwYX の b14 のカオス)
 */
const pickedAims = (data: PatchData, before: StageItem, aims: readonly Aim[], picked: readonly Aim[]): Aim[] =>
  aims.filter((a) => picked.some((x) => x.modId === a.modId && x.tier === a.tier) || aimHeldOn(data, before, a, { sameText: true }));
/** ☑ を選ぶ手で持っていた狙いが消えたら、☑ の狙いが付いても狙いが消えた (エッセンス S-29 と同じ順、S-22b)。当たりの箱は持っていた狙いが残った人だけ */
function lostFirst<T extends { out: OutKind; hits: Aim[] }>(on: boolean, data: PatchData, before: StageItem, after: StageItem, aims: readonly Aim[], oc: T): T | { out: OutKind; hits: Aim[] } {
  return on && oc.out === "hit" && aimDiff(data, before, after, aims, { sameText: true }).lost.length ? { out: "lost", hits: [] } : oc;
}
/**
 * 消去の残したい MOD (☑) の段は完成形の段で見る (S-27c)。保存の ☑ は見本の段 (最大ライフ T4) で、完成形 (T5) の人の最大ライフが消えても
 * 「外れが消えた」になった (木 oWkFcwYX の b9)。完成形に無い MOD はそのまま
 */
const keepAims = (doc: TreeDoc, keep: readonly Aim[]): Aim[] => keep.map((a) => (doc.memoAims ?? []).find((g) => g.modId === a.modId) ?? a);
/** 狙いに数える物 = ☑ で付いている物と、まだ付いていない物 (付いていて ☑ の無い完成形の MOD は外れ MOD) */
const mineOf = (data: PatchData, before: StageItem, aims: readonly Aim[], aimed: ReadonlySet<string>): Aim[] => aims.filter((a) => aimed.has(a.modId) || !aimHeldOn(data, before, a, { sameText: true }));
function boxOutcomeRaw(data: PatchData, doc: TreeDoc, b: TreeBox, before: StageItem, after: StageItem, aims: readonly Aim[]): Outcome {
  const key = b.hand?.currency;
  // ルーンの手は確定の手: はめた人は全員「打った後」の 1 箱へ (当たり / 外れに分けない、S-31e)
  if (key && isRuneHand(key)) return { out: "any", hits: [] };
  if (key && infiniteAim(key)) {
    const oc = outcomeOf(data, before, after, aims, key);
    if (oc.out !== "hit") return oc;
    const own = b.outs.flatMap((id) => { const c = doc.boxes[id]; return c?.out === "hit" && c.aim ? boxAims(c) : []; });
    const hits = oc.hits.filter((a) => own.some((x) => x.modId === a.modId && x.tier === a.tier));
    return hits.length ? { out: "hit", hits } : { out: "junk", hits: [] };
  }
  // 印の無い木の狙い無しのフラクチャー: 固定された MOD の箱 (スイッチ fracPick)
  if (fracFree(doc, b.hand)) {
    const m = newlyFractured(before, after);
    const own = b.outs.flatMap((id) => { const c = doc.boxes[id]; return c?.out === "hit" && c.aim ? boxAims(c) : []; });
    const hit = fracFreeHit(data, m, own);
    return hit ? { out: "hit", hits: [hit] } : { out: "junk", hits: [], ...(m ? { junkKey: junkKeyOf(data, m) } : {}) };
  }
  // 骨を未発現のまま : 未発現の冒涜が付いた (打った後) 1 つ。満杯の側で狙いが消えた時だけ狙いが消えた
  if (veilKeep(b.hand)) { const oc = outcomeOf(data, before, after, aims, key); return oc.out === "lost" ? oc : { out: "any", hits: [] }; }
  // 発現で選ぶ手: 発現した MOD が ☑ の札 (この手の当たりの箱) に当たれば当たり、ほかは外れ (狙いが消えたは前のまま)
  if (veilPick(b.hand)) {
    // 持っていた狙いが消えたら ☑ が付いても狙いが消えた (S-22b)
    const oc = lostFirst(true, data, before, after, aims, outcomeOf(data, before, after, aims, key));
    if (oc.out === "lost") return oc;
    const own = b.outs.flatMap((id) => { const c = doc.boxes[id]; return c?.out === "hit" && c.aim ? boxAims(c) : []; });
    const hit = revealHitOf(data, revealedOf(before, after), own);
    return hit ? { out: "hit", hits: [hit] } : { out: "junk", hits: [] };
  }
  if (!key || effectOf(key) === "essence" || effectOf(key) === "fracture") return outcomeOf(data, before, after, aims, key);
  // 消去の残したい MOD (10-27 オーナー): 全部消えてよい = 外れが消えた 1 つ。☑ があればその MOD だけで消えた / 外れが消えたを分ける (ほかは外れ MOD)
  const keep = effectOf(key) === "remove" ? b.hand?.keep : undefined;
  if (keep && !keep.length) return { out: "junkGone", hits: [] };
  if (keep) return outcomeOf(data, before, after, keepAims(doc, keep), key);
  const same = (x: { modId: string; tier: number }, a: { modId: string; tier: number }): boolean => x.modId === a.modId && x.tier === a.tier;
  const own = b.outs.flatMap((id) => { const c = doc.boxes[id]; return c?.out === "hit" && c.aim ? boxAims(c) : []; });
  // どれが狙いかは打つ前のアイテムの中身 (付いている完成形の狙い、S-60・S-29)。道で持って着く狙いの数え (heldSets) は使わない (大本 1、R5 で消した)
  const mine0 = aims;
  const pick = PICK_EFFECTS.includes(effectOf(key ?? ""));
  const mine = pick ? pickedAims(data, before, mine0, own) : mine0;
  const oc = lostFirst(pick, data, before, after, mine, outcomeOf(data, before, after, mine, key));
  if (oc.out !== "hit") return oc;
  const hits = oc.hits.filter((a) => own.some((x) => same(x, a)));
  return hits.length ? { out: "hit", hits } : { out: "junk", hits: [] };
}
/**
 * 起こりうる結果の箱 (10-25 オーナー「結局 例えばプレフィックスに付いたらどか考えられるでしょ」、前は手の種類ごとの決め打ち OUTS_OF と「1 通りなら 1 つ」だけ):
 * 手を置く時に、この箱の見本 (tree-sample、道で決める。S-74) を SINGLE_SEEDS 個まで取り (同じ箱でも外れが左右どちらかなどで違う)、
 * それぞれにエンジンの stepOutcomes で起こりうる行き先を全部たどり、結果の分け方 (outcomeOf) を全部集める (当たりは付く札ごと)。お告げ込み。
 * 狙いの付かない当たり (エッセンスで外れを置き換える等) は「打った後」(any)。箱に着かなかった見本は数えない。pre = 前に打つカタリスト (エンジンで 1 回)。
 * 繰り返し・狙い無し・品質だけの手・未発現が付く手 (冒涜の骨、発現で選ぶ候補で分かれる) と、エンジンが枝に分けられない手は null (今までどおり手の種類の箱)。
 * extra = 棚の当たりの候補 (チェックした狙い・欲しい MOD のメモ)。足す・入れ替える手が「外れだけ」の時も外れだけ (11-06 から。前は null で当たりの箱を作って MOD を選ばせた)
 */
export function possibleOutsOf(data: PatchData, doc: TreeDoc, boxId: string, h: Hand, pre: string | null = null, extra: readonly Aim[] = [], arrived?: readonly { item: StageItem; aimed: ReadonlySet<string> }[], roll = false): Array<{ out: OutKind; aim: Aim | null; junkKey?: string }> | null {
  // 印の無い木の狙い無しのフラクチャー: 固定されうる MOD ごとの箱 (「〇〇がフラクチャーされた場合」。スイッチ fracPick)
  if (fracFree(doc, h)) { const f = fracFreeOuts(data, doc, Array.from({ length: SINGLE_SEEDS }, (_, i) => sampleOf(data, doc, boxId, i + 1).item)); const l = [...f.aims.map((x) => ({ out: "hit" as OutKind, aim: x })), ...f.junk.map((k) => ({ out: "junk" as OutKind, aim: null, junkKey: k }))]; return l.length ? l : null; }
  // 目標の数値を決めた神 (S-202): 目標の以上 / 未満 (届く割合が 0 か 1 の側は無し)
  if (isDivineAim(h)) { const it = sampleOf(data, doc, boxId, 1).item; return divineOuts(data, it, h); }
  // 骨を未発現のまま (狙い無し) は下の未発現の所で「未発現の冒涜が付いた」1 つに
  // 狙い無しは「打った後」1 つ (手の種類の箱) の間は付いた側ごとの「打った後」(S-65)
  const freeSide = !!h.free && !veilKeep(h);
  if (h.repeat || (h.free && !veilKeep(h) && !freeSide) || isCatalyst(h.currency)) return null;
  // ルーンの手は確定の手: はめた後のアイテムの「打った後」1 箱 (カタリストと同じ、S-31e。前は当たり (付く MOD 無し) と外れに分かれて輪になった)
  if (isRuneHand(h.currency)) return [{ out: "any", aim: null }];
  // 後から打つ発現の手: ☑ の札ごとの当たり + 外れ (発現は MOD を消さない)
  if (isRevealHand(h.currency)) return [...extra.map((a) => ({ out: "hit" as OutKind, aim: a })), { out: "junk", aim: null }];
  // 消去もほかの手と同じ狙いの並び (残したい MOD は keptAimedOf の印で見る、S-27d。11-04 に消去だけの見方は撤回)
  const aims = [...aimsOf(doc), ...extra.filter((a) => !aimsOf(doc).some((x) => x.modId === a.modId && x.tier === a.tier))];
  const k = effectOf(h.currency);
  const found = new Map<string, { out: OutKind; aim: Aim | null; junkKey?: string }>();
  // 見本の中身だけで見る (持って着きうる狙いを足した形は作らない、狙いが消えうるのは見本に付いている狙い。大本 1)
  /** 未発現が付く手 (冒涜の骨): 当たり / 外れは発現で選ぶ候補で分かれるので見ない。消える側 (狙いが消えた) だけ発現の前の形で見る */
  let veiled = false, veiledLost = false, veiledKeep = false;
  /** 未発現が付く手で狙いが消える結果の鍵 (次の MOD 群、S-65b) */
  const veiledLostKeys = new Set<string>();
  /** 未発現が付く手で、狙いを消さない結果の側の鍵 (S-65) */
  const veiledSides = new Set<string>();
  /** 見本の中に、まだ付いていない狙いがあるか (外れだけの手でも当たりの箱を作って MOD を選ばせる時の見分け) */
  // 見本 = この箱に着いた人のアイテム (着いた人が SINGLE_SEEDS より少なければ同じ物が回ってくるので 1 回だけ見る)。
  // 箱の形 (道で付いている狙いの組 = heldSets) に合う人だけ (戻ってくる形の違う人の混ざりで結果の箱を増やさない、10-26 オーナー「その選択肢が出てくるのは前提狙いMODの状態でなんかする時やろ」)。合う人がいなければ全員
  // arrived = 見本の代わりに見る ↩ で着く人の形 (S-21、tree-hand-plan の addArrivedOuts)
  const smps = arrived ?? Array.from({ length: SINGLE_SEEDS }, (_, i) => sampleOf(data, doc, boxId, i + 1)).filter((x) => x.note !== "none" && !x.note?.startsWith("cant:"));
  const aimedAt = (it: StageItem): ReadonlySet<string> | null => arrived?.find((a) => a.item === it)?.aimed ?? aimedOfSample(boxId, it);
  // 見本ごとの ☑ (付いていて ☑ の無い完成形の MOD は外れ MOD、消えても狙いが消えたにしない)
  for (let s = 1; s <= SINGLE_SEEDS; s++) sampleAimed(data, doc, boxId, s);
  const seen = new Set<StageItem | string>();
  for (const [i, smp] of smps.entries()) {
    const seed = i + 1, mark = roll ? itemKeyOf(smp.item) : smp.item; // 打って集める時は同じ中身の見本を 2 回打たない (S-21)
    if (seen.has(mark)) continue;
    seen.add(mark);
    const item = pre ? applyCurrency(data, smp.item, pre, mulberry32(seed)).item : smp.item;
    const forms = [item];
    // 削減の手は外れを MOD レベルの範囲ごとの代わりに差し替えた形で見る (見本の外れ 1 つの MOD レベルで決めない、S-65b・tree-whittle)
    const all = isWhittleHand(h) ? forms.flatMap((f) => rankVariants(data, f, aimedAims(aims, keptAimedOf(doc, h, aimedAt(smp.item))), doc.boxes[boxId]?.junkKey).map((v) => v.item)) : forms;
    for (const it of all) {
      // roll = 数え上げられない手 (S-21) はエンジンの入口を打って集めた結果で見る
      const outs = (stepOutcomes(data, it, h.currency, engineOmens(h)) ?? (roll ? rolledOutcomes(data, it, h.currency, engineOmens(h)) : null))?.filter((o) => !o.void);
      // 打てない見本は飛ばす (外れの種類で打てない人。その人は打てる箱へ移る S-64)。全部打てなければ下の list が空で null
      if (!outs?.length) continue;
      // 未発現が新しく付く手だけ (前から未発現を持ったまま打つフラクチャー・カオスなどは普通に分ける)
      if (outs.some((o) => unrevealedOf(o.item)) && !unrevealedOf(it)) {
        veiled = true;
        // 消えて「狙いが消えた」になるのは道で持っている狙い・持って着きうる狙いだけ (☑ の無い手で付いた完成形の MOD は外れ MOD = boxOutcomeOf と同じ。
        // 狙い無しの錬金術の打った後に付いたキャストを骨が消すと「狙いが消えた」が出た、10-28 モンキー 6)
        // 残したい MOD を決めた骨は、その MOD が消えた時だけ狙いが消えた (S-27d)
        const lostOf = (o: { item: StageItem }): number => aimDiff(data, it, o.item, keptAimsOf(doc, h) ?? aims, { sameText: true }).lost.length;
        if (outs.some((o) => lostOf(o))) veiledLost = true;
        // 狙いを消さない結果があるか (満杯の側で全部が狙いなら、骨は必ず狙いを消す = 当たり・外れ・打った後の箱は起こらない。10-28 冒涜まわりの確かめ)
        if (outs.some((o) => !lostOf(o))) veiledKeep = true;
        for (const o of outs) { const sk = !lostOf(o) ? sideKeyOf(it, o.item) : undefined; if (sk) veiledSides.add(joinKeys(sk, nextKeyOf(it, o.item, keptAimedOf(doc, h, aimedAt(smp.item) ?? sampleAimed(data, doc, boxId, seed)), veilPick(h)))!); }
        for (const o of outs) if (lostOf(o)) { const e = nextKeyed(doc, { hand: h }, sided({ out: "lost", hits: [] }, it, o.item, h), it, o.item, keptAimedOf(doc, h, aimedAt(smp.item) ?? sampleAimed(data, doc, boxId, seed))); if (e.junkKey) veiledLostKeys.add(e.junkKey); }
        continue;
      }
      for (const o of outs) {
        const am = noStones(doc, h, keptAimedOf(doc, h, aimedAt(smp.item) ?? sampleAimed(data, doc, boxId, seed)));
        const ra0 = am ? keptPlus(doc, h, aims.filter((a) => am.has(a.modId) || !aimHeldOn(data, it, a, { sameText: true }))) : aims;
        const pick = PICK_EFFECTS.includes(k);
        // 残したい MOD の消去は ☑ の物だけで消えた / 残ったを見る (外れの MOD でも「消えた」の枝を出す、S-28e・S-21。印で絞ると枝が無くて人が止まった)
        const ra = pick ? pickedAims(data, it, ra0, extra) : ra0;
        const r = lostFirst(pick, data, it, o.item, ra, outcomeOf(data, it, o.item, ra, h.currency));
        if (r.hits.length > 1) { if (roll) continue; return null; } // 足すのは外れ・打った後の形だけ (当たりの箱は ☑ だけ、S-22)
        // 狙い無しは狙いが消えた以外全部「打った後」を側ごと。☑ の無い狙いが付いたのは外れ (tree-hand-plan の onlyOf と同じ) を側ごと (S-65)
        // フラクチャーは側で分けない (エッセンスは分ける。boxOutcomeOf と同じ、S-65・S-65b。前はフラクチャーの外れの箱にだけ側の鍵が付き、見本が作れず ✦ の無い親の見本のままだった)
        const sk = k === "fracture" ? undefined : sideKeyOf(it, o.item);
        const nk = <T extends { out: OutKind; junkKey?: string }>(e: T): T => nextKeyed(doc, { hand: h }, e, it, o.item, am);
        if (freeSide) { const e = nk<{ out: OutKind; aim: null; junkKey?: string }>(r.out === "lost" ? { out: "lost" as OutKind, aim: null, ...(sk && lostSided(h) ? { junkKey: sk } : {}) } : { out: "any" as OutKind, aim: null, ...(sk ? { junkKey: sk } : {}) }); found.set(`${e.out}:${e.junkKey ?? ""}`, e); continue; }
        if (sk && extra.length && r.out === "hit" && r.hits[0] && !extra.some((a) => a.modId === r.hits[0]!.modId && a.tier === r.hits[0]!.tier)) { const e = nk<{ out: OutKind; aim: null; junkKey?: string }>({ out: "junk", aim: null, junkKey: sk }); found.set(`junk::${e.junkKey}`, e); continue; }
        // 無限のエッセンスで ☑ していない能力値が付いた = 外れ (infiniteAim)。ほかの狙いの付かない当たりは「打った後」
        const e = r.out === "hit" && (!r.hits.length || (infiniteAim(h.currency) && !extra.some((a) => a.modId === r.hits[0]!.modId && a.tier === r.hits[0]!.tier))) ? { out: (infiniteAim(h.currency) ? "junk" : "any") as OutKind, aim: null } : { out: r.out, aim: r.hits[0] ?? null };
        // 狙いが消えた人に ☑ (エッセンスなら付く MOD) が付いたら別の箱「狙いが消えた・狙いが付いた」(S-27d、鍵 g:)
        const ek = withGot(data, nk(sk && (e.out === "junk" || e.out === "any" || e.out === "junkGone" || (e.out === "lost" && lostSided(h))) ? { ...e, junkKey: sk } : e), it, o.item, extra); // 箱の鍵も回す人と同じ印で (渡さないと鍵が合わず見本が作れなかった)
        const ek2 = roll && ek.out === "hit" && sk ? { ...ek, junkKey: sk } : ek;
        found.set(`${ek2.out}:${ek2.aim ? `${ek2.aim.modId}/${ek2.aim.tier}` : ""}:${"junkKey" in ek2 ? ek2.junkKey : ""}`, ek2);
      }
    }
  }
  // 冒涜: 当たり (この手の札) と外れはいつも、狙いが消えたは消える側で狙いを失いうる時だけ (10-25 シミュ 28 の洗い出し: 満杯の側に死霊術で打つと 13〜14% 狙いが消えるのに箱が無く、回すと止まった)
  // 骨を未発現のまま: 未発現の冒涜が付いた (打った後) 1 つ + 狙いが消えうる時は狙いが消えた
  const veiledLostOuts = (): Array<{ out: OutKind; aim: Aim | null; junkKey?: string }> => (veiledLostKeys.size ? [...veiledLostKeys].sort().map((junkKey) => ({ out: "lost" as OutKind, aim: null, junkKey })) : [{ out: "lost", aim: null }]);
  if (veiled && !veiledKeep) return veiledLostOuts();
  // 側の鍵があれば側ごと (S-65)
  const vs = (out: OutKind): Array<{ out: OutKind; aim: Aim | null; junkKey?: string }> => (veiledSides.size ? [...veiledSides].sort().map((junkKey) => ({ out, aim: null, junkKey })) : [{ out, aim: null }]);
  if (veiled && veilKeep(h)) return [...vs("any"), ...(veiledLost ? veiledLostOuts() : [])];
  // もう持っている狙いがもう一度付く道は数えない (S-24。起きない当たりの箱が出た)
  const unheldAim = (a: Aim): boolean => smps.some((s) => !aimHeldOn(data, s.item, a, { sameText: true }));
  if (veiled) return [...extra.filter(unheldAim).map((a) => ({ out: "hit" as OutKind, aim: a })), ...vs("junk"), ...(veiledLost ? veiledLostOuts() : [])];
  // ✦ の木のフラクチャーも結果は全部箱にする (S-43 の「✦ の当たりだけ箱、外れは費用に足す」は 11-05 撤回。回す時は素のフラクチャーで ✦ の無い MOD も固定されうるのに、
  // 箱が無く行き先無しになっていた = 枝の外れ探しの rowFracStar b9、11-06。S-200 ①)
  const list = [...found.values()];
  // 足す・入れ替える手が外れだけの時も外れ (と消えた) だけ = 箱の下はエンジンの結果と同じ (S-21、11-06 オーナー「直すのはいいけど」。前はまだ付いていない狙いがあると
  // 手の種類の箱へ逃がし、MOD を選ぶ当たりの箱を作ったが、エンジンではどの狙いも付かないので誰も来ない箱だった = 乱数の確かめの高貴のずれ)
  if (!list.length) return null;
  return list;
}
/** 結果が 1 通りの手 (possibleOutsOf が 1 つだけの時。台本 scripts/_tree-patterns-ui が使う) */
export function singleOutOf(data: PatchData, doc: TreeDoc, boxId: string, h: Hand, pre: string | null = null, extra: readonly Aim[] = []): { out: OutKind; aim: Aim | null } | null {
  const l = possibleOutsOf(data, doc, boxId, h, pre, extra);
  return l?.length === 1 ? l[0]! : null;
}

/** ✦ 以外の MOD の数 (全部消えてよい消去では全部外れ MOD) */
export const looseOf = (it: StageItem): number => [...it.prefixes, ...it.suffixes].filter((m) => !m.fractured).length;
