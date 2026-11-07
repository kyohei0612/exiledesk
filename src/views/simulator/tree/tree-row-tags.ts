/**
 * tree-row-tags.ts — ツリーの箱のカードの MOD の行 (オーナー 10-22。元は乗せた時のカード TreeHoverCard 用、11-02 に消した):
 * このツリーの狙い (当たりの札) に当たらない MOD は行の名前ごと「外れ MOD」(赤、MOD の文は乗せた時の説明。オーナー「もはや MOD の名前を外れ MOD でおk」)。
 * × の印 (前の試し打ちで付けた物) の行は「× 要らない」が先、フラクチャーは付けない。
 * box = その見本の箱。同じ側の「どれか」の当たりの箱 (anyOf) なら、一覧に当たる MOD の行を「A か B」で出す (10-26 オーナー「アイテム枠の中には狙いモッド2種を１MODの中においてどっちかみたいな話でいいんじゃない前みたく」)
 */
import { craftedKindOf, type PatchData, type StageItem, type StageMod } from "../../../services/craft-stage/engine";
import { aimHeldOn, isAimMod } from "../../../services/simulator/tree/tree-aim";
import { aimedMiss, isMissMod, missAims } from "../../../services/simulator/tree/tree-miss";
import { aimKey, type Aim, type Hand, type OutKind, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { heldSets } from "../../../services/simulator/tree/tree-shape";
import { sameAimMod } from "../../../services/simulator/tree/tree-hand-core";
import { aimedOfCard } from "../../../services/simulator/tree/tree-judge";
import { essenceModOf, midAims, placedAims } from "../../../services/simulator/tree/tree-veil";
import { goneOf, isKeepHand, isSwapEssence } from "../../../services/simulator/tree/tree-keep";
/** 外れの側の箱 (道で付いた狙いだけを狙いに数える) */
const MISS_OUTS: readonly OutKind[] = ["junk", "lost", "junkGone", "any"];
import { effectOf, isRuneHand } from "../../../services/simulator/tree/tree-hands";
import { useTree } from "./use-tree";
import { aimOpts, aimsOf, sampleOf, targetsOf } from "../../../services/simulator/tree/tree-sample";
import type { RowTag } from "../../../components/for-share/item/stage-item-row-tag";
import { modText, tr } from "../../../i18n/lang";
import { nameOfKey } from "../../../state/for-share/craft-stage-shelf";

/**
 * スマホの道の画面だけの札 (S-94h。オーナー 11-01「これだとエッセンス系は全部名前ありでいいよ ただ狙いMOD以外のエッセンスは赤文字でハズレMODと同じ色でいいな ブリーチとかは必須モッドじゃないけど道で必要だからそのまま出していい気がするけどまぁこの最短ルート設定時は特別って事で」)。
 * エッセンス・合金で付いた行は「外れ MOD」にまとめず MOD の名前で出す: 完成形の狙いはふつうの色、ほかは外れ MOD と同じ赤 (ブリーチも赤。前のブリーチ・途中で消える MOD の特例は 11-07 に撤回 = S-31・S-30)。それ以外の札はそのまま
 */
export function routeRowTags(d: PatchData, doc: TreeDoc, it: StageItem, tags: Map<string, RowTag>): Map<string, RowTag> {
  const out = new Map(tags), goalMiss = aimedMiss(d, doc), mid = new Set(midAims(d, doc).map((a) => a.modId));
  for (const m of [...it.prefixes, ...it.suffixes]) {
    // 完成形に無いエッセンスの MOD は札が無い (S-33c) ので、ここでは外れと同じ赤の名前に拾う
    const tag = out.get(m.modId) ?? (mid.has(m.modId) ? missTag(d, doc, m, modText(m), { evenChosen: true }) ?? undefined : undefined);
    if (!tag?.replace || tag.tone !== "bad" || m.fractured || !(m.crafted || craftedKindOf(d, m))) continue;
    if (!isMissMod(m, goalMiss)) out.delete(m.modId);
    else out.set(m.modId, { ...tag, text: modText(m) });
  }
  return out;
}
/**
 * 外れ MOD の札 (札を作るのはここだけ。箱のカード・手の窓・スマホの道の画面が全部これ、G-1 V-1)。木の手で付けた完成形に無いエッセンスの MOD は
 * 判定では外れでも札を付けず、MOD の文のまま (null。S-33c・S-82、11-07 オーナー「エッセンスはとりあいずハズレＭＯＤとして表示はしないでおこうか。
 * つけたエッセンスはそのままカードに表示させよう。」。前は「外れ MOD (エッセンス)」)。evenChosen = それでも札にする (固定された外れ・道の画面の赤い名前)。
 * cut = 付いた後に残したい MOD を選ぶ手を通ったエッセンスの MOD の札の鍵 aimKey (札にする、cutEssenceOf。midAims は木を回す外では毎回作り直すので物でなく鍵で比べる)
 */
type MissOpts = { evenChosen?: boolean; cut?: ReadonlySet<string> };
export const missTag = (d: PatchData, doc: TreeDoc, m: StageMod, title: string, opts: MissOpts = {}): RowTag | null => {
  const mid = opts.evenChosen ? undefined : midAims(d, doc).find((a) => a.modId === m.modId);
  return mid && !opts.cut?.has(aimKey(mid)) ? null : { text: tr("外れ MOD", "Miss"), tone: "bad", replace: true, title };
};
/** 行に外れ MOD の札を置く (完成形に無いエッセンスの MOD は置かない = 文のまま) */
export const putMiss = (d: PatchData, out: Map<string, RowTag>, doc: TreeDoc, m: StageMod, title: string, opts: MissOpts = {}): void => { const t = missTag(d, doc, m, title, opts); if (t) out.set(m.modId, t); };
/**
 * 箱 boxId までの道で、完成形に無いエッセンスの MOD が付いた後に残したい MOD を選ぶ手 (消去・カオス・骨など ☑ のある手) の消えうる候補になった物。
 * 文のまま出すのは付いてからその手を通るまでで、☑ しなかった物は以降の箱では「外れ MOD」(合金・ほかの MOD と同じ。S-33c・S-82、11-07 夜オーナー
 * 「エッセンスだろうが消去で全て消えてよい選んでんのになぜかブリーチエッセンスだけはMOD名がでる」)。パーフェクトエッセンスの手は ☑ しなかった MOD も外れにしない (S-29) ので数えない
 */
export function cutEssenceOf(d: PatchData, doc: TreeDoc, boxId: string, it: StageItem): ReadonlySet<string> {
  const cut = new Set<string>(), on = midAims(d, doc).filter((a) => aimHeldOn(d, it, a, { sameText: true }));
  // 見本に無ければ見ない (道を辿らない)
  if (!on.length) return cut;
  // 箱から上へ辿る。付いた所 (そのエッセンスの手) より前の手は数えない (付け直した後は付け直した所から)。MOD の当て方はエンジン (sameAimMod)
  const putOn = new Set<Aim>(), same = (a: Aim, id: string): boolean => sameAimMod(d, a, { modId: id, tier: 99 });
  for (let b = doc.boxes[boxId], n = 0; b?.parent && n < 1000; b = doc.boxes[b.parent], n++) {
    const p = doc.boxes[b.parent], h = p?.hand;
    if (!p || !h) break;
    const e = essenceModOf(h.currency), put = e ? on.find((a) => same(a, e)) : undefined;
    if (put) { putOn.add(put); continue; }
    if (!isKeepHand(h) || isSwapEssence(h)) continue;
    const gone = [...(goneOf(d, sampleOf(d, doc, p.id, 1).item, h.currency, h.omens) ?? [])];
    for (const a of on) if (!putOn.has(a) && gone.some((id) => same(a, id))) cut.add(aimKey(a));
  }
  return cut;
}
/** 選んで付けた MOD (エッセンス・合金・発現済みの冒涜)。消去を持った時も手の窓のカードは箱のカードのまま (S-82) */
export const chosenMod = (d: PatchData, m: StageMod): boolean => !m.unrevealed && !!(m.desecrated || m.crafted || craftedKindOf(d, m));
/** 箱 boxId の見本 it の札 (箱のカードと同じ呼び方。手の窓のカードで同じ物) */
export const boxTagsOf = (d: PatchData, doc: TreeDoc, boxId: string, it: StageItem): Map<string, RowTag> => { const b = doc.boxes[boxId]; return treeRowTags(d, doc, b?.unwanted ?? [], it, b); };
/**
 * 道で付いていうる狙いの組 (heldSets の鍵 modId|段) → 狙いの札。同じ MOD (エンジンの当て方 sameAimMod、同じ文の別 modId も同じ) は 1 枚で、段は後の組の物
 * (前は modId の一致でまとめた)
 */
function heldOfSets(d: PatchData, sets: readonly string[][]): Aim[] {
  const out: Aim[] = [];
  for (const k of sets.flat()) {
    const [modId = "", tier] = k.split("|"), a = { modId, tier: Number(tier) }, i = out.findIndex((x) => sameAimMod(d, x, a));
    if (i < 0) out.push(a); else out[i] = a;
  }
  return out;
}
/** 全部消えてよい消去の手の箱 (消去の直線の箱。☑ が無い = 消えうる MOD は全部外れ MOD) */
const stripHand = (h: Hand | null | undefined): boolean => !!h && effectOf(h.currency) === "remove" && !!h.keep && !h.keep.length;
export function treeRowTags(d: PatchData, doc: TreeDoc, unwanted: readonly string[], it: StageItem, box?: { id?: string; out?: OutKind | "start"; anyOf?: Aim[]; hand?: Hand | null } | null, markId?: string): Map<string, RowTag> {
  // ルーンの手の「打った後」の箱は親の箱と同じ見方 (ルーンは接頭・接尾の MOD を変えない。外れの側に数えると、親で狙いのエッセンスの MOD が「外れ MOD」と出た、S-31e。スイッチ runeHand)
  const up = box?.id && box.out === "any" ? doc.boxes[doc.boxes[box.id]?.parent ?? ""] : null;
  if (up && up.hand && isRuneHand(up.hand.currency)) return treeRowTags(d, doc, unwanted, it, { id: up.id, out: up.out, anyOf: up.anyOf, hand: up.hand }, box?.id);
  const out = new Map<string, RowTag>();
  // 消去の直線の箱 (全部消えてよい消去の手の箱) は、フラクチャー以外の MOD を全部「外れ MOD」で出す (手の窓で消去を持った時と同じ考え。10-27 夜オーナー、スイッチ heldTags)
  // 直線の途中の箱だけ (消去を打ち始める元の箱は普段の札。子に消去の手を足すと親の ES・未発現まで「外れ MOD」に変わった、10-28 モンキー 1。未発現の枠も替えない)
  const chainBox = !!box?.id && stripHand(doc.boxes[doc.boxes[box.id]?.parent ?? ""]?.hand);
  // 残したい MOD を選ぶ手を通った完成形に無いエッセンスの MOD は「外れ MOD」(S-33c)。ルーンの手の後の箱はその箱の道で見る (markId)
  const cut = box?.id ? cutEssenceOf(d, doc, markId ?? box.id, it) : undefined;
  // 箱の表示はその箱の見本と、その箱を作った手 (親の手) だけから (この箱に置いた手 = 子を作る手では変えない。10-28 オーナー OK の対策 2)。
  // 全部消えてよい消去で作られた箱 (直線の途中と終わり) が「外れ MOD」
  // 候補の外の印 (S-27e) は箱の見本の ☑ で見る (下の外れの箱の見方)
  if (chainBox && !aimedOfCard(d, doc, box!.id!, it)) {
    for (const m of [...it.prefixes, ...it.suffixes]) if (!m.fractured && !m.unrevealed) putMiss(d, out, doc, m, tr(`全部消えてよい${nameOfKey("annul", null)}で消えうる MOD: ${modText(m)}`, `May be removed by the clear-all ${nameOfKey("annul", null)}: ${modText(m)}`), { cut });
    return out;
  }
  const any = box?.anyOf && box.anyOf.length > 1 ? box.anyOf : null;
  const anyT = any ? targetsOf(d, any) : [];
  const anyText = any ? any.map(useTree().aimShort).join(tr(" か ", " or ")) : "";
  // 完成の狙い (完成形の MOD) も狙いに数える (10-27 夕モンキー 1: エッセンスで付いた完成形の MOD が「外れ MOD」と出た)
  // 外れの箱 (外れ・狙いが消えた・外れが消えた・打った後) は、その箱まで来た道で付いている狙いだけを狙いに数える。☑ の無い MOD はそのカレンシーでは外れ扱いなので、
  // ☑ していない完成形の MOD が付いていても「外れ MOD」(10-27 夜オーナー、モンキー 2 回目 7。スイッチ junkByCheck)
  const missBox = !!box?.id && !!box.out && box.out !== "start" && MISS_OUTS.includes(box.out);
  // 箱の中身 (S-60) と同じく、見本の ☑ で付いた狙い (tree-judge の sampleAimed、見本の打ち方の順) だけを狙い。道の当たりの組では数えない (大本 1)
  const am = missBox ? aimedOfCard(d, doc, box!.id!, it) : null;
  const held = am ? (doc.memoAims ?? []).filter((g) => am.has(g.modId)).map((g) => ({ modId: g.modId, tier: g.tier })) : missBox ? heldOfSets(d, heldSets(doc, box!.id!)) : [];
  // 始まりから付いている完成の狙いも狙い (道の当たりの札には無い。外れが固定された箱で始まりの ES が「外れ MOD」と出た、10-28。スイッチ boxShape)
  // 段は完成の狙いの段 (どの段でも狙いにすると、狙いの段に届かない低い段まで札が付かなかった、10-28 見張り bone3 b4)
  if (missBox && !am) for (const m of doc.start?.mods ?? []) { const g = (doc.memoAims ?? []).find((x) => x.modId === m.modId); if (g && !held.some((h) => h.modId === m.modId)) held.push({ modId: g.modId, tier: g.tier }); }
  // 当たりの箱の札の MOD は、その箱では狙い (発現で選んだ置き石も。以降の箱では外れ MOD)
  const ownAim = box?.id && box.out === "hit" ? doc.boxes[box.id]?.aim : null;
  // 当たりの箱も見本の ☑ で付いた狙いだけを狙い (S-22・S-60)。前は完成形の狙い全部を数え、☑ していない投射物ダメージがフラクチャーの当たりの箱で狙いの名前になった (11-05 動画の木 b11)
  // ルーンの手の後の箱は親の箱の見方を借りるが、☑ の印はその箱の見本で引く (markId。親の id では見本が違い引けず、狙い全部に戻った)
  const hitAm = box?.id && box.out === "hit" ? aimedOfCard(d, doc, markId ?? box.id, it) : null;
  const hitHeld = hitAm ? (doc.memoAims ?? []).filter((g) => hitAm.has(g.modId)) : null;
  // 以降の箱でも見本に付いている置き石は狙い (S-33)。ルーンの手の後の箱も ☑ はその箱の見本で引く (markId。親の id で引くと遺産のルーンの後のソケット効果が「外れ MOD」と出た、11-06 ワンド b12)
  const placed = box?.id ? placedAims(d, doc).filter((a) => aimedOfCard(d, doc, markId ?? box.id!, it)?.has(a.modId)) : [];
  // 外れ MOD の札は外れの式 1 本 (tree-miss の isMissMod): ここで決めた当たりに数える札 (☑ の狙い・置き石・この箱の当たりの札) に当たらない MOD
  const miss = missAims(d, [...(missBox ? held : hitHeld ?? [...aimsOf(d, doc), ...(doc.memoAims ?? [])]), ...placed, ...(ownAim ? [ownAim] : [])]), bad = targetsOf(d, unwanted.map((u) => ({ modId: u, tier: 99 }))), o = aimOpts(d);
  const goalMiss = aimedMiss(d, doc);
  for (const m of [...it.prefixes, ...it.suffixes]) {
    // 未発現の枠は元の文 (未発現の冒涜 MOD) のまま 
    // 固定された外れ (✦ の外れ) も「外れ MOD」だけ (値を出さない、S-82 仮。見本ごとに違う MOD が箱の名前に見えた、10-28 モンキー 7。スイッチ boxShape)
    // 比べるのは完成の狙い全部 (✦ で始まった狙いは道の当たりに無いので、道の狙いで見るとスペル +3 ✦ まで外れになった、10-28 見張り)
    if (m.fractured && isMissMod(m, goalMiss)) { putMiss(d, out, doc, m, tr(`固定された外れ MOD: ${modText(m)}`, `Fixed (fractured) miss mod: ${modText(m)}`), { evenChosen: true }); continue; }
    if (m.fractured || m.unrevealed) continue;
    if (any && isAimMod(m, anyT, o)) out.set(m.modId, { text: anyText, tone: "info", replace: true, title: tr(`どれか 1 つが付けば当たり (この見本は ${modText(m)})`, `Any one of these is a hit (this sample has ${modText(m)})`) });
    else if (isAimMod(m, bad, o)) out.set(m.modId, { text: tr("× 要らない", "× Unwanted"), tone: "bad" });
    else if (isMissMod(m, miss)) putMiss(d, out, doc, m, tr(`このツリーの狙いに当たらない MOD: ${modText(m)}`, `Not one of this tree's target mods: ${modText(m)}`), { cut });
  }
  return out;
}
