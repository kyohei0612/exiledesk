/**
 * tree-outcome.ts — 箱の手の結果の分け方 (回す tree-run・見本 tree-sample・精査 tree-check・台本で同じ物を呼ぶ。2026-10-27 tree-sample.ts から分けた)。
 * ☑ の無い MOD は外れ MOD (メモ feedback-unchecked-is-junk)、消去の残したい MOD (Hand.keep) もここ。打った前後の比べはエンジンの入口 (outcomeOf の aimDiff)
 */
import { applyCurrency, forceKey, mulberry32, unrevealedOf, type PatchData, type StageItem } from "../../craft-stage/engine";
import { fillCatalyst, stepOutcomes } from "../../simulator/sim-engine";
import { aimHeldOn } from "./tree-aim";
import { effectOf, engineOmens, isCatalyst } from "./tree-hands";
import { aimsMayHold } from "./tree-lost";
import { aimKey, boxAims, subtree, type Aim, type Hand, type OutKind, type TreeBox, type TreeDoc } from "./tree-model";
import { aimDiff, aimsOf, outcomeOf, sampleOf, SINGLE_SEEDS } from "./tree-sample";
import { shapeFit } from "./tree-sample-shape";
import { prepFor } from "./tree-unbounded";
import { isInfiniteEssence } from "../../craft-stage/apply-essence";
import { flag } from "../../../web/release-flags";

/**
 * 無限のエッセンス (筋力・器用さ・知性のどれかがランダム) は ☑ した能力値だけ当たり、ほかが付いたら外れ MOD (10-27 オーナー「知性を選んだら知性が付いた = 当たり、
 * 筋力・器用さが付いた = 外れ MOD の 2 枝」、スイッチ goalShape)。ほかのエッセンスは付く MOD が決まっているので今のまま
 */
export const infiniteAim = (key: string | undefined): boolean => !!key && flag("goalShape") && isInfiniteEssence(key);
import { heldSets } from "./tree-shape";
import { likeOf } from "./tree-box-shape";
import { isRevealHand, revealedOf, revealHitOf, veilKeep, veilPick } from "./tree-veil";
import { fracFree, fracFreeHit, fracFreeOuts, junkKeyOf, newlyFractured } from "./tree-frac-pick";

/**
 * 箱 b の手の結果 (回す・見本・精査で同じ)。☑ の無い MOD は外れ MOD (10-27 オーナー「チェックなしは外れ MOD 扱いでしょ」): 当たりはこの手の当たりの箱の札 (☑) だけ、
 * 狙いが消えたはこの箱に持って着きうる狙い (道の当たりの札、tree-lost の aimsMayHold) だけで数え、木のほかの箱の狙いは外れ MOD として外れ・外れが消えたに入れる。
 * 前は木全部の狙いで数え、☑ の無いキャストスピードが付いた・消えた人に行き先が無く止まった (r/ibMlQuAV の 2 段目のカオスで 30 人中 28 人)。aims は木の狙い (エッセンス・フラクチャーはそのまま)
 */
export function boxOutcomeOf(data: PatchData, doc: TreeDoc, b: TreeBox, before: StageItem, after: StageItem, aims: readonly Aim[]): { out: OutKind; hits: Aim[]; junkKey?: string } {
  const key = b.hand?.currency;
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
  // 骨を未発現のまま (スイッチ boneLater): 未発現の冒涜が付いた (打った後) 1 つ。満杯の側で狙いが消えた時だけ狙いが消えた
  if (veilKeep(b.hand)) { const oc = outcomeOf(data, before, after, aims, key); return oc.out === "lost" ? oc : { out: "any", hits: [] }; }
  // 発現で選ぶ手: 発現した MOD が ☑ の札 (この手の当たりの箱) に当たれば当たり、ほかは外れ (狙いが消えたは前のまま)
  if (veilPick(b.hand)) {
    const oc = outcomeOf(data, before, after, aims, key);
    if (oc.out === "lost") return oc;
    const own = b.outs.flatMap((id) => { const c = doc.boxes[id]; return c?.out === "hit" && c.aim ? boxAims(c) : []; });
    const hit = revealHitOf(data, revealedOf(before, after), own);
    return hit ? { out: "hit", hits: [hit] } : { out: "junk", hits: [] };
  }
  if (!key || effectOf(key) === "essence" || effectOf(key) === "fracture") return outcomeOf(data, before, after, aims, key);
  // 消去の残したい MOD (10-27 オーナー): 全部消えてよい = 外れが消えた 1 つ。☑ があればその MOD だけで消えた / 外れが消えたを分ける (ほかは外れ MOD)
  const keep = effectOf(key) === "remove" ? b.hand?.keep : undefined;
  if (keep && !keep.length) return { out: "junkGone", hits: [] };
  if (keep) return outcomeOf(data, before, after, keep, key);
  const same = (x: { modId: string; tier: number }, a: { modId: string; tier: number }): boolean => x.modId === a.modId && x.tier === a.tier;
  const own = b.outs.flatMap((id) => { const c = doc.boxes[id]; return c?.out === "hit" && c.aim ? boxAims(c) : []; });
  // 道で持って着く狙い。エッセンスの「狙いが消えた」の道はエッセンスで付いた MOD も持っている (heldSets。前は抜けて、消去で消えても外れが消えたになり r/ibMlQuAV の b24 で止まった)
  const onPath = new Set(heldSets(doc, b.id).flat());
  const held = [...aimsMayHold(doc, b.id), ...aims.filter((a) => onPath.has(aimKey(a)))];
  // ☑ の札でも、道で持って着かずに先に付いていた物 (☑ の無い手で付いた = 外れ MOD) は消えても外れ
  const mine = aims.filter((a) => held.some((x) => same(x, a)) || (own.some((x) => same(x, a)) && !aimHeldOn(data, before, a, { sameText: true })));
  const oc = outcomeOf(data, before, after, mine, key);
  if (oc.out !== "hit") return oc;
  const hits = oc.hits.filter((a) => own.some((x) => same(x, a)));
  return hits.length ? { out: "hit", hits } : { out: "junk", hits: [] };
}
/**
 * 起こりうる結果の箱 (10-25 オーナー「結局 例えばプレフィックスに付いたらどか考えられるでしょ」、前は手の種類ごとの決め打ち OUTS_OF と「1 通りなら 1 つ」だけ):
 * 手を置く時に、この箱の見本 (木を回して着いた人のアイテム、tree-arrived) を SINGLE_SEEDS 個まで取り (同じ箱でも外れが左右どちらかなどで違う)、
 * それぞれにエンジンの stepOutcomes で起こりうる行き先を全部たどり、結果の分け方 (outcomeOf) を全部集める (当たりは付く札ごと)。お告げ込み。
 * 狙いの付かない当たり (エッセンスで外れを置き換える等) は「打った後」(any)。箱に着かなかった見本は数えない。pre = 前に品質を最大まで入れるカタリスト。
 * 繰り返し・狙い無し・品質だけの手・未発現が付く手 (冒涜の骨、発現で選ぶ候補で分かれる) と、エンジンが枝に分けられない手は null (今までどおり手の種類の箱)。
 * extra = 棚の当たりの候補 (チェックした狙い・欲しい MOD のメモ)。足す・入れ替える手が「外れだけ」になる時も null
 * (10-22 白紙から 13 通り組んだ #1: 木にまだ無い狙いを足す手で当たりの箱が作れず、横の＋も出なかった。外れだけなら当たりの箱を作って MOD を選ばせる)
 */
export function possibleOutsOf(data: PatchData, doc: TreeDoc, boxId: string, h: Hand, pre: string | null = null, extra: readonly Aim[] = []): Array<{ out: OutKind; aim: Aim | null; junkKey?: string }> | null {
  // 印の無い木の狙い無しのフラクチャー: 固定されうる MOD ごとの箱 (「〇〇がフラクチャーされた場合」。スイッチ fracPick)
  if (fracFree(doc, h)) { const f = fracFreeOuts(data, doc, Array.from({ length: SINGLE_SEEDS }, (_, i) => sampleOf(data, doc, boxId, i + 1).item)); const l = [...f.aims.map((x) => ({ out: "hit" as OutKind, aim: x })), ...f.junk.map((k) => ({ out: "junk" as OutKind, aim: null, junkKey: k }))]; return l.length ? l : null; }
  // 骨を未発現のまま (狙い無し) は下の未発現の所で「未発現の冒涜が付いた」1 つに (スイッチ boneLater)
  if (h.repeat || (h.free && !veilKeep(h)) || isCatalyst(h.currency) || (h.keep && !h.keep.length)) return null;
  // 後から打つ発現の手: ☑ の札ごとの当たり + 外れ (発現は MOD を消さない。スイッチ boneLater)
  if (isRevealHand(h.currency)) return [...extra.map((a) => ({ out: "hit" as OutKind, aim: a })), { out: "junk", aim: null }];
  // 消去の残したい MOD があれば、その MOD だけを狙いとして見る (ほかは外れ MOD、boxOutcomeOf と同じ)
  const aims = h.keep?.length && effectOf(h.currency) === "remove" ? h.keep : [...aimsOf(doc), ...extra.filter((a) => !aimsOf(doc).some((x) => x.modId === a.modId && x.tier === a.tier))];
  const k = effectOf(h.currency);
  const found = new Map<string, { out: OutKind; aim: Aim | null }>();
  const hold = aimsMayHold(doc, boxId);
  const onPath = new Set(heldSets(doc, boxId).flat());
  const mayLose = (a: Aim): boolean => onPath.has(aimKey(a)) || hold.some((x) => x.modId === a.modId && x.tier === a.tier);
  /** 未発現が付く手 (冒涜の骨): 当たり / 外れは発現で選ぶ候補で分かれるので見ない。消える側 (狙いが消えた) だけ発現の前の形で見る */
  let veiled = false, veiledLost = false, veiledKeep = false;
  /** 見本の中に、まだ付いていない狙いがあるか (外れだけの手でも当たりの箱を作って MOD を選ばせる時の見分け) */
  let unheld = false;
  // 見本 = この箱に着いた人のアイテム (着いた人が SINGLE_SEEDS より少なければ同じ物が回ってくるので 1 回だけ見る)。
  // 箱の形 (道で付いている狙いの組 = heldSets) に合う人だけ (戻ってくる形の違う人の混ざりで結果の箱を増やさない、10-26 オーナー「その選択肢が出てくるのは前提狙いMODの状態でなんかする時やろ」)。合う人がいなければ全員
  const smps = Array.from({ length: SINGLE_SEEDS }, (_, i) => sampleOf(data, doc, boxId, i + 1)).filter((x) => x.note !== "none" && !x.note?.startsWith("cant:"));
  const fits = shapeFit(data, doc, boxId), fit = smps.filter((x) => fits(x.item));
  const seen = new Set<StageItem>();
  for (const [i, smp] of (fit.length ? fit : smps).entries()) {
    const seed = i + 1;
    if (seen.has(smp.item)) continue;
    seen.add(smp.item);
    if (aims.some((a) => !aimHeldOn(data, smp.item, a, { sameText: true }))) unheld = true;
    const item = pre ? fillCatalyst(data, smp.item, pre, mulberry32(seed)).item : smp.item;
    // 見本にまだ無い狙いのうち、この箱に持って着きうる物 (自分の道・戻ってくる箱の道の当たり、tree-lost の aimsMayHold) を 1 つ足した形でも見る
    // (見本は初めて着いた人の形。戻りで狙いを持って来た人は狙いが消えうる、10-22 #8: 素の消去が「外れが消えた」1 通りにまとまって 96 人止まった。
    // 前は持って着かない狙いまで足し、右側の結晶化で外れしか消えない手にも「狙いが消えた」が出た、10-25)
    const forms = [item, ...hold.filter((a) => !aimHeldOn(data, item, a, { sameText: true })).map((a) => applyCurrency(data, item, forceKey(a.modId, `T${a.tier}`, "n"), mulberry32(seed))).filter((r) => r.applied).map((r) => r.item)];
    for (const it of forms) {
      const outs = stepOutcomes(data, prepFor(data, it, h.currency), h.currency, engineOmens(h))?.filter((o) => !o.void);
      if (!outs?.length) return null;
      // 未発現が新しく付く手だけ (前から未発現を持ったまま打つフラクチャー・カオスなどは普通に分ける。スイッチ boneLater)
      if (outs.some((o) => unrevealedOf(o.item)) && !(flag("boneLater") && unrevealedOf(it))) {
        veiled = true;
        // 消えて「狙いが消えた」になるのは道で持っている狙い・持って着きうる狙いだけ (☑ の無い手で付いた完成形の MOD は外れ MOD = boxOutcomeOf と同じ。
        // 狙い無しの錬金術の打った後に付いたキャストを骨が消すと「狙いが消えた」が出た、10-28 モンキー 6。スイッチ boneLater)
        const lostOf = (o: { item: StageItem }): number => aimDiff(data, it, o.item, aims, { sameText: true }).lost.filter((a) => !flag("boneLater") || mayLose(a)).length;
        if (outs.some((o) => lostOf(o))) veiledLost = true;
        // 狙いを消さない結果があるか (満杯の側で全部が狙いなら、骨は必ず狙いを消す = 当たり・外れ・打った後の箱は起こらない。10-28 冒涜まわりの確かめ)
        if (outs.some((o) => !lostOf(o))) veiledKeep = true;
        continue;
      }
      for (const o of outs) {
        const r = outcomeOf(data, it, o.item, aims, h.currency);
        if (r.hits.length > 1) return null;
        // 無限のエッセンスで ☑ していない能力値が付いた = 外れ (infiniteAim)。ほかの狙いの付かない当たりは「打った後」
        const e = r.out === "hit" && (!r.hits.length || (infiniteAim(h.currency) && !extra.some((a) => a.modId === r.hits[0]!.modId && a.tier === r.hits[0]!.tier))) ? { out: (infiniteAim(h.currency) ? "junk" : "any") as OutKind, aim: null } : { out: r.out, aim: r.hits[0] ?? null };
        found.set(`${e.out}:${e.aim ? `${e.aim.modId}/${e.aim.tier}` : ""}`, e);
      }
    }
  }
  // 冒涜: 当たり (この手の札) と外れはいつも、狙いが消えたは消える側で狙いを失いうる時だけ (10-25 シミュ 28 の洗い出し: 満杯の側に死霊術で打つと 13〜14% 狙いが消えるのに箱が無く、回すと止まった)
  // 骨を未発現のまま: 未発現の冒涜が付いた (打った後) 1 つ + 狙いが消えうる時は狙いが消えた
  if (veiled && flag("boneLater") && !veiledKeep) return [{ out: "lost", aim: null }];
  if (veiled && veilKeep(h)) return [{ out: "any", aim: null }, ...(veiledLost ? [{ out: "lost" as OutKind, aim: null }] : [])];
  if (veiled) return [...extra.map((a) => ({ out: "hit" as OutKind, aim: a })), { out: "junk", aim: null }, ...(veiledLost ? [{ out: "lost" as OutKind, aim: null }] : [])];
  const list = [...found.values()];
  // 足す・入れ替える手が外れだけの時は、まだ付いていない狙いがある時だけ手の種類の箱へ (当たりの箱を作って MOD を選ばせる)。
  // 狙いが全部付いていれば外れ (と消えた) だけ (10-25 シミュ 28 の洗い出し: 満杯で削減のお告げのカオスに、起こりえない当たりの箱が出た)
  if (!list.length || ((k === "add" || k === "swap") && unheld && list.every((e) => e.out === "junk"))) return null;
  return list;
}
/** 結果が 1 通りの手 (possibleOutsOf が 1 つだけの時。台本 scripts/_tree-patterns-ui が使う) */
export function singleOutOf(data: PatchData, doc: TreeDoc, boxId: string, h: Hand, pre: string | null = null, extra: readonly Aim[] = []): { out: OutKind; aim: Aim | null } | null {
  const l = possibleOutsOf(data, doc, boxId, h, pre, extra);
  return l?.length === 1 ? l[0]! : null;
}

/** ✦ 以外の MOD の数 (全部消えてよい消去では全部外れ MOD) */
export const looseOf = (it: StageItem): number => [...it.prefixes, ...it.suffixes].filter((m) => !m.fractured).length;
const isStrip = (b: TreeBox | undefined): boolean => !!b?.hand?.keep && !b.hand.keep.length && effectOf(b.hand.currency) === "remove";
const stopMemo = new WeakMap<TreeDoc, { sig: string; at: Map<string, Map<number, string>> }>();
let stopBusy = false;
/**
 * 全部消えてよい消去の止まる所 = 外れの数 → 戻る箱 (10-27 オーナー「消去で全部消したら…消去 1 つ損する」: 消していく途中で木の箱と同じ形になったら止めて
 * そこへ戻す)。狙いを持たない手のある箱 (heldSets に空の組がある。始め = 外れ 0、狙い無しの高貴の打った後 = 外れ 1 など) の見本の外れの数。
 * 同じ数は先の箱 (木の並びで上)。self = 消去の手の箱 (自分と下は入れない)
 */
/** rarity = 止まる所をそのレアリティの箱だけに (MOD 0 まで消えたレアを白の始まりへ戻さない。ゲームでは MOD 0 のレアに変成は打てない、10-28 オーナー、スイッチ stripRarity) */
export function stripStops(data: PatchData, doc: TreeDoc, self: string, like?: StageItem): Map<number, string> {
  // 比べる形: 箱の体のレアリティと ✦ の側 (tree-box-shape の likeOf。✦ の違う箱へ戻った、10-28 モンキー 3、スイッチ boxShape・stripRarity)。外れの数は下の looseOf で段ごと
  const likeKey = (it: StageItem): string => likeOf(data, doc, it);
  const rarity = like ? likeKey(like) : undefined;
  // 覚えの鍵 = 木の箱・手・戻り (組み替えたら引き直す。回す 1 手ごとに呼ぶので文字は作らず数で)
  let h = doc.seq;
  for (const b of Object.values(doc.boxes)) { const k = `${b.id}${b.hand?.currency ?? ""}${b.hand?.omens.join() ?? ""}${b.back ?? ""}`; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0; }
  const sig = String(h);
  let m = stopMemo.get(doc);
  if (!m || m.sig !== sig) stopMemo.set(doc, (m = { sig, at: new Map() }));
  const memoKey = rarity !== undefined ? `${self}|${rarity}` : self;
  const had = m.at.get(memoKey);
  if (had) return had;
  // 見本を引く間にまた呼ばれた (見本の道に全部消す消去がある) 時は止まる所無し = 消せなくなるまで
  if (stopBusy) return new Map();
  stopBusy = true;
  const out = new Map<number, string>();
  try {
    const below = new Set(subtree(doc, self));
    for (const b of Object.values(doc.boxes)) {
      if (!b.hand || below.has(b.id) || isStrip(b) || !heldSets(doc, b.id).some((h) => !h.length)) continue;
      const s = sampleOf(data, doc, b.id, 1);
      if (s.note === "none" || s.note?.startsWith("cant:")) continue;
      if (rarity !== undefined && likeKey(s.item) !== rarity) continue;
      const n = looseOf(s.item);
      if (!out.has(n)) out.set(n, b.id);
    }
  } finally { stopBusy = false; }
  m.at.set(memoKey, out);
  return out;
}
/** 全部消えてよい消去の手なら、止める形か (playHand の stop)。違う手は undefined */
export function stripStop(data: PatchData, doc: TreeDoc, b: TreeBox): ((it: StageItem) => boolean) | undefined {
  if (!isStrip(b)) return undefined;
  return (it) => stripStops(data, doc, b.id, it).has(looseOf(it));
}
/** 全部消えてよい消去の結果の箱から戻る箱 (止まった形の箱。無ければ null = 形の合う箱が無い) */
export function stripBackOf(data: PatchData, doc: TreeDoc, id: string, item: StageItem): string | null {
  const p = doc.boxes[id]?.parent;
  return p && isStrip(doc.boxes[p]) ? stripStops(data, doc, p, item).get(looseOf(item)) ?? null : null;
}
/** 全部消えてよい消去の結果の箱か (回す時、止まる所が無ければ形の合う箱を探さず行き先未定。スイッチ stripRarity) */
export const fromStrip = (doc: TreeDoc, id: string): boolean => { const p = doc.boxes[id]?.parent; return !!p && isStrip(doc.boxes[p]); };
/** 全部消えてよい消去の結果の箱の戻り先の候補 (札・線・精査。違えば null) */
export function stripTargetsOf(data: PatchData, doc: TreeDoc, id: string): string[] | null {
  const p = doc.boxes[id]?.parent;
  return p && isStrip(doc.boxes[p]) ? [...new Set(stripStops(data, doc, p).values())] : null;
}
