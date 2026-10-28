/**
 * tree-shape.ts — ツリーの形合わせ (形の合う箱・分かれ目・結果の箱)。tree-run.ts から分けた (シミュ部長 25 本目、2026-10-25、1 ファイル 500 行まで)。
 * 回す所 (tree-run)・精査 (tree-check)・画面 (つなぐ・まとめる) が同じ物を読む。中身は前のまま
 */
import { mulberry32, sideOfMod, type PatchData, type StageItem } from "../../craft-stage/engine";
import { backBody, bodyFixed, bodyKinds, bodyMemo, bodyOf, boxBody, heldOfKey, sameBody, type BodyOf } from "./tree-box-shape";
import { aimHeldOn, junkOf } from "./tree-aim";
import { effectOf } from "./tree-hands";
import { aimOpts, aimsOf, essenceBoxFits, handProblem, playHand, targetsOf } from "./tree-sample";
import { flag } from "../../../web/release-flags";
import { aimKey, keepCut, MATCH_BACK, type Aim, type Hand, type OutKind, type SplitRange, type SplitRule, type SplitWhen, type TreeBox, type TreeDoc, boxAims, drop, subtree } from "./tree-model";

/**
 * 形の合う箱へ (設計の「消去の後は 形の合う箱へ」、back: "match")。形 = 付いている狙いの組 + 外れがあるか。
 * 箱の形 = 始まりから親をたどった当たりの札の組 (+ 外れの箱なら外れあり)。狙いが 1 つも無ければ始まりへ (始まりの手が外れも扱う)
 */
export const MATCH = MATCH_BACK;
/** 作り直し (設計の「作り直し」、back: "restart"): 始めのアイテムに戻して、始めの費用をもう一度払う。数えた回数は TreeRunResult.restarts */
export const RESTART = "restart";

/**
 * 分かれ目の箱 (設計 2 弾目「打たずに状態で分ける」、10-22 画面にも): 手を打たずに、今のアイテムの状態の条件を上から順に見て、最初に合った行の箱へ進む。
 * 形 (split) は tree-model の TreeBox。どの行にも合わない・行き先を決めていない行に合ったら止まる。
 * next = 手の結果がどれでも、この箱へ進む (解析君の台本の木だけ。分かれ目に戻す時に結果の箱を並べなくてよい)
 */
export type { SplitRule, SplitWhen } from "./tree-model";
export type SplitBox = TreeBox & { next?: string };
type Range = SplitRange;
const inRange = (n: number, r?: Range): boolean => !r || (n >= r[0] && n <= r[1]);
export function splitTo(data: PatchData, rules: readonly SplitRule[], item: StageItem, aims: readonly Aim[]): string | null {
  const held = new Set(aims.filter((a) => aimHeldOn(data, item, a, { sameText: true })).map(aimKey));
  const junk = junkOf(item, targetsOf(data, aims), aimOpts(data));
  const count = (side: "prefix" | "suffix" | "any", junkOnly: boolean): number =>
    (side !== "suffix" ? (junkOnly ? junk.prefix : item.prefixes.filter((m) => !m.fractured)).length : 0) + (side !== "prefix" ? (junkOnly ? junk.suffix : item.suffixes.filter((m) => !m.fractured)).length : 0);
  const ok = (w: SplitWhen): boolean =>
    inRange(held.size, w.heldCount)
    && (w.has ?? []).every((k) => held.has(k))
    && (w.lacks ?? []).every((k) => !held.has(k))
    && (["prefix", "suffix", "any"] as const).every((sd) => inRange(count(sd, true), w.junk?.[sd]) && inRange(count(sd, false), w.free?.[sd]));
  return rules.find((r) => ok(r.when))?.to ?? null;
}
/**
 * 形の合う箱の判定 (回す時・ルート精査・画面の線で同じ物を使う。シミュ部長 10-21 オーナー「↩ 形の合う箱へは自動で探して線を引いた状態に」)。
 * 形の鍵 = 付いている狙いの組 + 外れがあるか。外れの側・種類・数・✦・レアリティ (体) は tree-box-shape で比べる (決まりは docs/spec/sim-tree.md の S-60〜S-64)
 */
const shapeKey = (held: readonly string[], junk: boolean): string => `${[...new Set(held)].sort().join(",")}#${junk ? 1 : 0}`;
/** sig = その箱の体 (tree-box-shape の boxBody。shapesOf に data を渡した時だけ、スイッチ goalShape) */
export type Shape = { key: string; box: string; hand?: Hand | null; sig?: string | null };
/**
 * 箱の道の札の組 (始まりから親をたどった当たりの札、aimKey)。「どれか」の当たりの箱 (anyOf、同じ側の狙いのどれか 1 つ) を通ると、
 * どれが付いたかで組が分かれる (10-26)。組は 64 で打ち切る
 */
/**
 * 形に数える当たりの札 (スイッチ goalShape): 完成の狙い (memoAims) にある物だけ。エッセンス・冒涜で付いた狙いでない MOD は外れ MOD と同じで形に数えない
 * (10-27 昼オーナー「指定 (☑) の MOD 以外はいらない MOD なので、何が付いても外れ MOD として付ける形」、メモ feedback-unchecked-is-junk と同じ)。完成の狙いが無い木は今まで通り全部
 */
function hitKeys(doc: TreeDoc, c: TreeBox): string[] {
  const ks = boxAims(c).map(aimKey);
  const goals = doc.memoAims ?? [];
  if (!goals.length) return ks;
  const g = new Set(goals.map(aimKey));
  return ks.filter((k) => g.has(k));
}
/** 完成の狙いに無い MOD だけが付いた当たりの箱 = 外れの箱と同じ形 (スイッチ goalShape) */
const junkLike = (doc: TreeDoc, b: TreeBox): boolean => b.out === "hit" && !!b.aim && !!(doc.memoAims ?? []).length && !hitKeys(doc, b).length;
/**
 * 当たりの箱を通った組 = 今の組に、その箱で新しく付いた狙い (ks のどれか) を足した物。当たりは新しく付いた物なので、もう持っている狙いが
 * もう一度付く組 (まとめた箱「アーマーかライフ」のアーマーの道で、次の当たり「アーマーが付いた」) はありえない。その組は落とす
 * (10-27 夜モンキー 2 回目 1: 落とさないと当たりの箱の組が 2 通りになり、自動で「形の合う箱へ」の戻りが付いて「再度挑戦」になった。全部落ちる時は前のまま。スイッチ hitNew)
 */
function addHit(sets: string[][], ks: readonly string[]): string[][] {
  const old = sets.flatMap((h) => ks.map((k) => (h.includes(k) ? h : [...h, k])));
  const fresh = sets.flatMap((h) => ks.filter((k) => !h.includes(k)).map((k) => [...h, k]));
  return fresh.length ? fresh : old;
}
function pathHelds(doc: TreeDoc, id: string | null): string[][] {
  let sets: string[][] = [[]];
  for (let x = id; x; x = doc.boxes[x]?.parent ?? null) {
    const c = doc.boxes[x];
    if (c?.out === "hit" && c.aim && hitKeys(doc, c).length) sets = addHit(sets, hitKeys(doc, c)).slice(0, 64);
    // 残したい MOD を決めた消去の後は、その MOD だけ持っている (ほかは外れ MOD。上はたどらない、10-27)
    const keep = c ? keepCut(doc, c) : null;
    if (keep) { const ks = keep.map(aimKey); return sets.map((h) => [...new Set([...h, ...ks])]); }
  }
  return sets;
}
/**
 * 箱の時点で付いていうる狙いの組 (始まりから親をたどる。狙いが消えた箱を通ると、その時の組から 1 つ欠けた組のどれか。10-22 見本の
 * 「狙いが消えたらカオスを当たるまで」で、消えた後の当たりの行き先を木の上だけで決めるため)。組は並べ替えた鍵の順、多すぎる時は 64 で打ち切る
 */
export function heldSets(doc: TreeDoc, id: string | null): string[][] {
  const path: TreeBox[] = [];
  for (let x = id; x; x = doc.boxes[x]?.parent ?? null) { const c = doc.boxes[x]; if (c) path.unshift(c); }
  let sets: string[][] = [[]];
  for (const c of path) {
    // 残したい MOD を決めた消去の後 = その MOD だけ持っている (☑ の無い MOD は外れ MOD、10-27)。狙いが消えたは 1 つ欠けた組
    const keep = keepCut(doc, c);
    if (keep) { const ks = keep.map(aimKey); sets = c.out === "lost" && ks.length ? ks.map((k) => ks.filter((x) => x !== k)) : [ks]; continue; }
    // 「どれか」の当たりの箱はどれが付いたかで組が分かれる (anyOf、10-26)
    if (c.out === "hit" && c.aim && hitKeys(doc, c).length) sets = addHit(sets, hitKeys(doc, c));
    else if (c.out === "lost") {
      sets = sets.flatMap((h) => (h.length ? h.map((k) => h.filter((x) => x !== k)) : [h]));
      // エッセンスの「狙いが消えた」は、エッセンスで付いた MOD (同じ手の当たりの箱の札) は付いている
      const p = c.parent ? doc.boxes[c.parent] : undefined;
      // 当たりの箱が無い時 (結果が「狙いが消えた」1 通り) も、手のエッセンスの MOD が完成の狙いにあれば付いている (10-27 夕モンキー 1: スピリット + ✦ だけの箱で
      // 強化のエッセンスを打つとスピリットが消えてグローバル防御が付くのに、狙い 0 の形に見えて始まりへ戻り、エッセンスを持ったまま回って止まった。スイッチ goalShape)
      const essKey = p?.hand && effectOf(p.hand.currency) === "essence" ? p.hand.currency.split(":").slice(2).join(":") : null;
      const ess = p?.hand && effectOf(p.hand.currency) === "essence"
        ? p.outs.map((o) => doc.boxes[o]).find((x) => x?.out === "hit" && x.aim)?.aim ?? (flag("goalShape") ? (doc.memoAims ?? []).find((g) => g.modId === essKey) : undefined)
        : undefined;
      if (ess && (!(doc.memoAims ?? []).length || (doc.memoAims ?? []).some((g) => aimKey(g) === aimKey(ess)))) { const k = aimKey(ess); sets = sets.map((h) => (h.includes(k) ? h : [...h, k])); }
    }
    // 「狙いが消えた」をまとめた箱 (mergedOuts) は、消えた組と消えていない組の両方 (10-26)
    if (c.out !== "lost" && c.mergedOuts?.includes("lost")) sets = [...sets, ...sets.flatMap((h) => h.map((k) => h.filter((x) => x !== k)))];
    const seen = new Set<string>();
    sets = sets.map((h) => [...h].sort()).filter((h) => { const k = h.join(","); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 64);
  }
  return sets;
}
/**
 * 戻りの矢印の行き先の形が合うか: 戻る箱の狙いの組 (heldSets) が全部、行き先の箱の組にある (10-26 オーナー「その選択肢が出てくるのは前提狙いMODの状態でなんかする時やろ」。
 * 前は当たりの箱から外れの箱へも戻せて、狙い持ちが「狙い無し」の箱でカオスを打ち、結果に「狙いが消えた」が並んだ)。
 * 形の合う箱へ (MATCH)・分かれ目 (行で分かれる) は見ない。始めの箱もほかの箱と同じに見る (10-26 オーナー「始めに戻るはなんかややこしい話だから普通にどこに戻るかいつも通り書く」)
 */
export function shapeFits(doc: TreeDoc, from: string, to: string): boolean {
  if (to === MATCH || to === RESTART) return true;
  // 全部消えてよい消去の後の自動の戻りは、戻り先をエンジンで打った結果の形で選んでいる (tree-hand-plan の stripToShape)。この箱の組は「狙い 0」と数える作りなので比べない
  // (10-27 夕モンキー 2、スイッチ goalShape)
  const fb = doc.boxes[from], fp = fb?.parent ? doc.boxes[fb.parent] : undefined;
  if (fb?.autoBack && fp?.hand && effectOf(fp.hand.currency) === "remove" && fp.hand.keep && !fp.hand.keep.length) return true;
  const t = doc.boxes[to];
  if (!t || t.split) return true;
  const key = (h: string[]): string => [...h].sort().join(",");
  const there = new Set(heldSets(doc, to).map(key));
  return heldSets(doc, from).every((h) => there.has(key(h)));
}
/** 行き先になれる箱 (手のある当たり / 外れの箱) とその形 */
export function shapesOf(doc: TreeDoc, data?: PatchData): Shape[] {
  const out: Shape[] = [];
  for (const b of Object.values(doc.boxes)) {
    // 打った後 (狙い無し) の箱も外れの形の行き先に (消去の「狙いが消えた」(マジック・外れ 1) が上の変成の「打った後」でなく白のスタートへ戻った、10-28 夜オーナー。スイッチ boxShape)。
    // 自動のつなぎ (data を渡さない呼び方、体は linkSameShape が比べる) の時だけ。回す時・精査の「形の合う箱へ」(data あり) に入れると、打った後の箱の鍵は外れの有無を
    // 持たないので、外れの側の違う人まで入った (同じ形 2 つの b6 で右手のお告げが効かない人が出た、10-28 夜 最終チェック長)
    if (!b.hand || (b.out !== "hit" && b.out !== "junk" && !(b.out === "any" && flag("boxShape") && !data))) continue;
    for (const held of pathHelds(doc, b.out === "junk" ? b.parent : b.id)) out.push({ key: shapeKey(held, b.out === "junk" || junkLike(doc, b)), box: b.id, hand: b.hand });
  }
  // 分かれ目の箱も行き先に (外れの有無は行で分けるので両方の形を受ける。手のある箱が先、10-22 13 通り組んだ #14: 分かれ目の下の消去の「外れが消えた」に行き先が無かった)
  for (const b of Object.values(doc.boxes)) {
    if (!b.split || b.hand) continue;
    for (const held of pathHelds(doc, b.id)) for (const junk of [false, true]) out.push({ key: shapeKey(held, junk), box: b.id });
  }
  // 手のある箱に見本の外れの種類を付ける (回す時の「形の合う箱へ」で、同じ形の箱が幾つかあれば種類も合う箱を先に。分かれ目の箱は外れを行で分けるので付けない)
  if (data) {
    const sigs = new Map<string, string | null>();
    for (const s of out) if (s.hand) { if (!sigs.has(s.box)) sigs.set(s.box, boxBody(data, doc, s.box, true)); s.sig = sigs.get(s.box)!; }
  }
  return out;
}
/**
 * 形の鍵 → 行き先 (無ければ null)。狙いが 0 なら始まり = 始まりの手が外れも扱う。ただし狙い 0 + 外れありの形の箱 (始めの手の外れ → 消去など) があればそこへ
 * (10-22 解析君の 13 本の突き合わせ: 外れを持ったまま始めの高貴へ戻り、外れを先に消す打ち方より 48〜81% 高かった)。
 * at = 今のアイテム (あればその箱の手が打てる時だけ。光 + 消去の箱は普通の MOD の外れを消せず、兜で 93 人止まった)
 */
function boxOfShape(shapes: readonly Shape[], key: string, at?: { data: PatchData; item: StageItem; doc?: TreeDoc }): string | null {
  // 同じ形の箱が幾つかあれば、体 (tree-box-shape の bodyOf) も合う箱 → 種類が合う箱 → 前のとおり形だけ の順で見る (スイッチ goalShape。合う箱が無くても止まりは増やさない)
  // ✦ の側とレアリティが違う箱へは行かない (✦ は消せない。外れが固定された枝の箱に狙いが固定された人が入り、見本の ✦ が箱ごとに変わった、10-28 モンキー 7。スイッチ boxShape)
  const held = heldOfKey(key);
  const fixed = at?.doc && flag("boxShape") ? bodyFixed(bodyOf(at.data, at.doc, at.item, held)) : "";
  const all = shapes.filter((s) => s.key === key && (!fixed || s.sig == null || s.sig.startsWith("mixed") || bodyFixed(s.sig) === fixed)), sig = at?.doc ? bodyOf(at.data, at.doc, at.item, held) : null;
  const exact = sig ? all.filter((s) => s.sig == null || s.sig === sig) : [], kinds = sig ? all.filter((s) => s.sig == null || bodyKinds(s.sig) === bodyKinds(sig)) : [];
  const same = exact.length ? exact : kinds.length ? kinds : all;
  // 同じ形の箱が幾つかあれば、手が打てる箱を先に (光 + 消去の箱へ普通の MOD の外れを持って来ても打てない、10-22 金の指輪の見本)
  const playable = (s: Shape): boolean => !at || !s.hand || !handProblem(at.data, at.item, s.hand);
  const ok = at ? same.find(playable) : same[0];
  if (key === JUNK_ONLY) return ok?.box ?? "start";
  // 外れの箱の手が打てない (外れが手の届かない側にある) 時は、同じ狙いの外れ無しの箱の手で進む (10-22 解析君 body-essence-path:
  // 始めの乱数のプレの外れで右側の消去の箱へ送られ 367 人止まった。手の届かない側の外れは狙いの邪魔をしない)
  // 打てるかは回す時と同じ playHand で見る (お告げの「今は意味なし」は回す時は止めない。プレが満杯の右側の高貴は素の高貴と同じに打てる)
  if (at && !ok && key.endsWith("#1")) { const clean = shapes.find((s) => s.key === `${key.slice(0, -1)}0` && (!s.hand || canPlay(at.data, at.item, s.hand))); if (clean) return clean.box; }
  return key.startsWith("#") ? "start" : (ok ?? same[0])?.box ?? null;
}
/** 手も戻りもまだ決めていない当たり (MOD を選んだ物) / 外れの箱で、その形の物 (始めに戻った人の行き先が無い時。settle) */
function openOfShape(doc: TreeDoc, key: string): string | null {
  const open = (c: TreeBox): boolean => !c.hand && !c.back && !c.split && !c.done && ((c.out === "hit" && !!c.aim) || c.out === "junk");
  return Object.values(doc.boxes).find((c) => open(c) && pathHelds(doc, c.out === "junk" ? c.parent : c.id).some((h) => shapeKey(h, c.out === "junk") === key))?.id ?? null;
}
/** 回す時に手が打てるか (playHand。乱数の当たり所で弾かれる物は打てる扱い) */
const canPlay = (data: PatchData, item: StageItem, h: Hand): boolean => { const r = playHand(data, item, { ...h, repeat: null }, mulberry32(1)); return r.applied || !!r.random; };
/** 狙い 0 + 外れあり の形の鍵 */
const JUNK_ONLY = shapeKey([], true);
/**
 * アイテムの形の鍵 (付いている狙い + 外れがあるか)。外れは、まだ付いていない狙いの側にある物だけ数える (狙いが全部付いていれば全部)。
 * 10-22 解析君 body-essence-path: 始めの乱数のプレの外れでいつも「外れあり」になり、サフィの当たりが右側の消去の箱へ送られて当たりを消し、38 人が打ち止めの輪
 */
function itemKey(data: PatchData, item: StageItem, aims: readonly Aim[]): string {
  const held = aims.filter((a) => aimHeldOn(data, item, a, { sameText: true }));
  const open = new Set(aims.filter((a) => !held.includes(a)).map((a) => sideOfMod(data, a.modId)));
  const junk = junkOf(item, targetsOf(data, aims), aimOpts(data));
  const junkOn = (side: "prefix" | "suffix"): boolean => (!open.size || open.has(side)) && junk[side].length > 0;
  return shapeKey(held.map(aimKey), junkOn("prefix") || junkOn("suffix"));
}
export function matchBox(data: PatchData, shapes: readonly Shape[], item: StageItem, aims: readonly Aim[], doc?: TreeDoc): string | null {
  return boxOfShape(shapes, itemKey(data, item, aims), { data, item, doc });
}
/**
 * 着いた箱の形と実物のアイテムの形が違う時は、続きから (形の合う箱) で進む (10-22。回す時と精査で同じ)。
 * 例: 狙い 2 つ + 外れで狙いが 1 つ消え、始めに戻ってカオス (当たるまで) でキャストが付くと「当たり キャスト」の箱に着くが、
 * 前から残った全耐性と外れも付いている。そのまま次の高貴を打つとサフィックスが満杯で止まった (100 人中 23 人)。実際のクラフトもアイテムを見て決める。
 * 戻り先の箱 (back) へ進む時も同じ (10-22 7 本目。3,000 人で 2 人止まった: 外れ 2 つの消去で 1 つ残ったまま「外れの前の箱」へ戻り満杯で触媒の高貴、
 * 始まりのカオスで P2 の狙いが先に付いたまま d1 へ戻り素の高貴の外れが冒涜の外れの箱へ)。
 * 見るのは手のある当たり・外れの箱だけ。同じ形・合う箱が無い時はその箱のまま
 */
export function settle(data: PatchData, doc: TreeDoc, shapes: readonly Shape[], id: string, item: StageItem, aims: readonly Aim[]): string {
  // 始めに戻る時も、狙い 0 で外れを持っていれば、その形の外れの箱があればそこへ (上の boxOfShape と同じ)
  if (id === "start") {
    const key = itemKey(data, item, aims);
    const h = doc.boxes.start?.hand;
    const cant = !!h && !!handProblem(data, item, h);
    // 始まりの手が打てず形の合う手のある箱も無い時は、同じ形の手をまだ決めていない箱へ (止まりをその箱の「決めていない」にまとめる。
    // 10-25 シミュ 27: 錬金術のスタートで狙いが消えて始めに戻った人が、外れの箱に手が無いうちは始まりで「ノーマルかマジックにだけ」と止まり、戻りの箱に持ち越しの穴が出た)
    if (key === JUNK_ONLY) { const to = boxOfShape(shapes, JUNK_ONLY, { data, item, doc }) ?? id; return to === id && cant ? openOfShape(doc, key) ?? id : to; }
    // 始まりの手が打てない (エッセンスの MOD が既に付いている等) 時は、形の合う打てる箱へ (10-22 解析君 body-essence-path: 狙いが消えて始めに戻り 49 人止まった)
    if (!cant) return id;
    const to = boxOfShape(shapes, key, { data, item, doc });
    const th = to ? doc.boxes[to]?.hand : null;
    return to && (!th || canPlay(data, item, th)) ? to : openOfShape(doc, key) ?? id;
  }
  const b = doc.boxes[id];
  // 「打った後」の箱 (見本の頭で外れを付けた後 = 前の始まり、10-25) へ戻って手が打てない時も、始まりと同じく形の合う打てる箱へ
  if (b?.hand && b.out === "any") {
    if (!handProblem(data, item, b.hand)) return id;
    const to = boxOfShape(shapes, itemKey(data, item, aims), { data, item, doc });
    const th = to ? doc.boxes[to]?.hand : null;
    return to && (!th || canPlay(data, item, th)) ? to : id;
  }
  if (!b?.hand || (b.out !== "hit" && b.out !== "junk")) return id;
  const key = itemKey(data, item, aims);
  // 形が合っても手が打てない (外れが消去の届かない側にある等) 時は、形の合う打てる箱へ (10-22 解析君 body-essence-path、狙いが消えた → 外れの箱の戻り)
  // 外れの箱に着いた人で、外れが狙いの無い側にある (形の鍵では「外れ無し」になる) 人も、外れがあればその箱のまま (スイッチ bodyStrict)。
  // 前は外れ無しの形としてスタートへ移され、スタートの狙い無しの高貴で外れが 1 つずつ増えて、当たりの後のサフィ満杯の箱で止まった
  // (10-29 オーナーの木 FmNY7Wwv の b13 → スタート → b8。オーナー「結果と箱を設定したはずなのに内部でズレて違う箱としてとらえた」)
  const junkHere = b.out === "junk" && flag("bodyStrict") && [...item.prefixes, ...item.suffixes].some((m) => !m.fractured && !aims.some((a) => a.modId === m.modId));
  if (heldSets(doc, b.out === "junk" ? b.parent : id).some((h) => shapeKey(h, b.out === "junk") === key || (junkHere && shapeKey(h, false) === key)) && canPlay(data, item, b.hand)) return id;
  const to = boxOfShape(shapes, key, { data, item, doc }) ?? id;
  // 形の合う箱の手が打てず、この箱の手は打てる時はこの箱のまま (10-24 モンキー 7 回目: 始めのルーンの外れは MOD が増えず「外れ無し」の形で始めへ戻され、
  // 同じルーンをもう差せずに 100 人とも止まった。外れの箱の変成はそのまま打てる)
  const th = to !== id ? doc.boxes[to]?.hand : null;
  return th && !canPlay(data, item, th) && canPlay(data, item, b.hand) ? id : to;
}
/** アイテムから行き先 (ルート精査が回す時と同じ道を辿る用) */
export function matchItem(data: PatchData, doc: TreeDoc, item: StageItem, aims: readonly Aim[] = aimsOf(doc)): string | null {
  return matchBox(data, shapesOf(doc, data), item, aims, doc);
}
/**
 * 「形の合う箱へ」の箱が、アイテムを見ずに行きうる形と行き先 (画面の線・ルート精査の「形の合う箱が無い」)。
 * 当たり = 道の札・外れ無し / 外れ・打った後 = 道の札・外れあり / 外れが消えた = 道の札・外れ無し /
 * 狙いが消えた = 親の道の札から 1 つ欠けた形 (どれが消えるかで候補が分かれる)、外れは親が外れの箱か、消す手でない時 (カオスの入れ替え) に残る。
 * 狙いが消えた箱の下は、消えた後の組ごとに行き先が分かれる (heldSets)
 */
export function matchTargets(doc: TreeDoc, id: string): { key: string; to: string | null }[] {
  const b = doc.boxes[id];
  if (!b) return [];
  const shapes = shapesOf(doc);
  const one = (held: string[], junk: boolean): { key: string; to: string | null } => { const key = shapeKey(held, junk); return { key, to: boxOfShape(shapes, key) }; };
  const p = b.out === "lost" && b.parent ? doc.boxes[b.parent] : undefined;
  const junk = b.out === "lost" ? p?.out === "junk" || (!!p?.hand && effectOf(p.hand.currency) !== "remove") : b.out === "junk" || b.out === "any" || junkLike(doc, b);
  // 付いていうる組ごとに 1 つ (狙いが消えた箱はどれが消えたかで、その下の当たりは消えた後の組で分かれる、heldSets)
  const out = heldSets(doc, b.id).map((h) => one(h, junk));
  return out.filter((x, i) => out.findIndex((y) => y.key === x.key) === i);
}

/**
 * 手を付けて新しくできた結果の箱 (ids) のうち、形 (matchTargets = 回す時の settle と同じ鍵) が木の中の手のある箱と同じ物は、そこへ自動でつなぐ
 * (10-22 オーナー「消去で打った結果が同じ狙い MOD 群や外れ MOD の形になったら自動で案内…同じ形だから自分で付ける必要ない」)。印は autoBack (乗せた時のカード)。
 * 当たりの箱 (狙いが付いた) はつながない。次の手は人が＋で足す (10-26 オーナー「狙いがついたら再挑戦おかしくね、狙いついたらシンプルにプラスボタンじゃない？」。前は同じ状態の当たりへ合流 sameHitOf、10-25)。
 * 形が複数ありうる箱 (狙いが消えた = どれが消えたかで分かれる) と、同じ形の箱が複数ある時は先に作った箱 (残りは回す時の settle が形の合う箱へ)。
 * 同じ形の箱が無い箱は setHand の既定のまま。つながない物 (10-22 白紙から 13 通り組んだ #2、毎回 × で外す手間・始まりの手を打ち直せない木で 100 人止まり):
 * MOD をまだ選んでいない当たりの箱、狙い 0 の形 (始まりへ送るのは狙いが消えた箱だけ)、setHand が決めた戻り先 (外れが消えた → 外れの前の箱など。
 * 形の合う箱へと、狙いが消えた → 始まりは同じ形の箱へ付け替える)
 */
/**
 * loose = 箱の体 (tree-box-shape の bodyMemo。applyPick が渡す、スイッチ goalShape)。渡すと体の同じ箱だけ (sameBody)。形の鍵は外れの有無だけなので、外れの数が違う箱
 * (高貴の外れの外れなど) へはつながない・戻らない (10-27 夕モンキー 8: 外れ 2 つの箱が外れ 1 つの箱へ自動で戻り、回すたびにプレの外れが増えて 30 人中 29 人が満杯で止まった)
 */
export function linkSameShape(doc: TreeDoc, ids: readonly string[], loose?: BodyOf): void {
  for (const id of ids) {
    const c = doc.boxes[id];
    // 分かれ目の行の箱 (branch) は人が手を決める所 (分かれ目の箱も行き先になったので、つなぐと自分の分かれ目へ戻る輪になる)
    // 人が × で外した箱はつながない (noAutoBack)
    // 打った後 (狙い無し) の箱も、同じ形の手のある箱へつなぐ (スイッチ boxShape。カオスの「打った後 (同じ側)」が親と同じ形なのに未定のままだった、10-28 夜オーナー「一緒のMODがふくすうあるけど認識されない」)
    if (!c || c.noAutoBack || c.hand || (c.out === "hit" && !junkLike(doc, c)) || c.out === "pass" || (c.out === "any" && !flag("boxShape")) || c.out === "branch") continue;
    if (c.back && c.back !== MATCH && !(c.out === "lost" && c.back === "start")) continue;
    // フラクチャーの結果の箱は、形 (✦ は数えない) が親と同じでも つながない (親へ戻すと ✦ のある品にもう一度フラクチャーを打って止まった、10-24)
    const p = c.parent ? doc.boxes[c.parent] : undefined;
    if (p?.hand && effectOf(p.hand.currency) === "fracture") continue;
    // カタリストの手の結果の箱も (品質は形に入らないので親と同じ形になり、親へ戻すと品質を上げる手の輪になる。S-31b、スイッチ catHand)
    if (p?.hand && effectOf(p.hand.currency) === "quality") continue;
    const matched = matchTargets(doc, id), targets = matched.map((m) => m.to);
    // 「どれか」の当たりの箱 (anyOf) は、どれが付いても同じ箱へ行く時だけつなぐ (付いた物で行き先が分かれるなら、回す時の settle が実物で形の合う箱へ。10-26)
    if (c.anyOf?.length && new Set(targets).size > 1) continue;
    let to = targets.find((x): x is string => !!x && x !== id && (x !== "start" || c.out === "lost")) ?? swapJunkOf(c, p);
    // 同じ鍵の箱が幾つかある時は、体 (側・種類・数・レアリティ) まで合う箱を順に探す (変成の「打った後」がプレとサフィの 2 つあり、1 つ目のプレだけ見て
    // サフィの外れの「狙いが消えた」がどこへもつながらなかった、10-28 夜オーナー「自動で箱違うとこにつくな」。スイッチ boxShape)
    if (flag("boxShape") && loose && (!to || !backBody(loose, id, to))) {
      const keys = new Set(matched.map((m) => m.key));
      to = shapesOf(doc).filter((sh) => keys.has(sh.key) && sh.box !== id).map((sh) => sh.box).find((x) => shapeFits(doc, id, x) && backBody(loose, id, x)) ?? to;
    }
    // 形 (付いている狙いの組) が全部合う箱へだけ (狙いが消えた箱は組が何通りかあり、1 つ目の組だけで別の形の箱へつないでいた。10-26 オーナー「前提狙いMODの状態でなんかする時」、shapeFits)
    if (!to || !shapeFits(doc, id, to) || !backBody(loose, id, to)) continue;
    c.back = to;
    c.autoBack = true;
    // まとめの印は tree-merge-open だけが付ける (ここでつないだ箱は描く)
    delete c.merged;
    c.done = null;
  }
}

/** 当たりの箱のアイテムの状態の鍵 = 付いていうる狙いの組 (heldSets) の全部。同じなら同じ MOD が付いた同じ段の箱 (値の差は段の中の差) */
const hitStateKey = (doc: TreeDoc, id: string): string => heldSets(doc, id).map((h) => [...h].sort().join(",")).sort().join("|");
/**
 * 別の道からできた、付いている MOD が全部同じ当たりの箱 (10-26 夜オーナー「段一緒で形も一緒ならまとめるが出ないと挙動的におかしい」
 * 「形は一緒ならこのツリー組んだ瞬間まとまってくれるよね」)。同じ親の横の箱 (joinableOf の「どれか」) と、自分の下の箱は除く。
 * 自分の上の箱 (先祖) は入れる = そこへ戻ってやり直す輪 (10-27 オーナーのレシピ: 消去 → カオスでスピリットが付いた箱が、1 段目の同じ形の「スピリットが付いた」と
 * まとまらなかった。前は上の箱も除いていた。まとめで消すのは自分の下だけなので、上の箱は触らない)。
 * 戻りの矢印を持つ箱 (もうどこかへつないだ箱) と分かれ目も除く。並びは先に作った箱から
 */
/** loose = 箱の体 (tree-box-shape の bodyMemo)。渡すと外れの側・種類・数まで同じ箱だけ (置き石も冒涜の外れ MOD に数える。10-28 オーナー「全く = じゃないのに、なんでつながってる」、スイッチ boneLater) */
export function sameHitsOf(doc: TreeDoc, id: string, loose?: BodyOf): string[] {
  const b = doc.boxes[id];
  if (!b || b.out !== "hit" || !b.aim || b.back || b.split) return [];
  const down = new Set(subtree(doc, id)), k = hitStateKey(doc, id);
  // 道の途中でフラクチャーを打った箱とそうでない箱は、同じ狙いの組でも ✦ の有無が違うのでまとめない
  // (印の無い木の乱数のフラクチャーで「キャストスピードが固定された」が上の「キャストスピードが付いた」へ自動で統合された、10-27 夜。スイッチ fracRandom)
  const fr = (x: string): boolean => { for (let y: string | null = doc.boxes[x]?.parent ?? null; y; y = doc.boxes[y]?.parent ?? null) { const h = doc.boxes[y]?.hand; if (h && effectOf(h.currency) === "fracture" && h.pick === "random") return true; } return false; };
  const f0 = flag("fracRandom") ? fr(id) : false;
  return Object.values(doc.boxes).filter((c) => c.id !== id && c.out === "hit" && !!c.aim && !c.back && !c.split && c.parent !== b.parent && !down.has(c.id) && hitStateKey(doc, c.id) === k && ((flag("boxShape") && loose) || fr(c.id) === f0) && sameBody(loose, id, c.id)).map((c) => c.id);
}
/**
 * 同じ状態の当たりの箱をまとめる: 選んだ箱 (picks) の下を消し、まとめ先 (to) へ戻りの矢印でつなぐ (木は親が 1 つなので 1 箱にはせず、合流の線で見せる)。
 * 完成の印はまとめ先へ。auto = 手を足した時に自動でつないだ (印 autoBack)
 */
export function joinSameHit(doc: TreeDoc, to: string, picks: readonly string[], auto = false): void {
  const t = doc.boxes[to];
  if (!t) return;
  for (const id of picks) {
    const c = doc.boxes[id];
    if (!c || id === to) continue;
    for (const o of c.outs) drop(doc, subtree(doc, o));
    c.outs = [];
    c.hand = null;
    if (c.done && !t.done) t.done = c.done;
    c.done = null;
    c.back = to;
    if (auto) c.autoBack = true; else delete c.autoBack;
  }
}
/**
 * 手を足してできた当たりの箱 (ids) のうち、別の道に同じ状態の当たりの箱があれば、先にあった箱へ自動でつなぐ (10-26 夜オーナー「組んだ瞬間まとまってくれる」)。
 * 中身 (次の手) がある箱どうしは自動でせず人が「まとめる」(use-tree-join)。× で外した箱 (noAutoBack) はつながない
 */
/**
 * 来た道で付いている狙いの組が何通りかある当たりの箱 (heldSets が 2 つ以上。消去・狙いが消えたの後のカオスなど) は、同じ状態の箱へまとめられないので、
 * 「形の合う箱へ」を自動で付ける (10-27 オーナーの決め (a)、r/SitMjgNY の「スピリットが付いた」)。回す時は実物の形の箱へ (tree-run の matchBox)、
 * 合う箱が無い組は精査の足りない所。手・戻り・完成を決めていない箱だけ、人が × で外した箱は触らない。自分の下の箱しか合わなければ付けない
 */
export function linkShapeHit(doc: TreeDoc, ids: readonly string[], loose?: BodyOf): void {
  for (const id of ids) {
    const c = doc.boxes[id];
    if (!c || c.out !== "hit" || !c.aim || c.hand || c.back || c.done || c.split || c.noAutoBack || heldSets(doc, id).length < 2) continue;
    const down = new Set(subtree(doc, id));
    if (!matchTargets(doc, id).some((m) => !!m.to && !down.has(m.to) && sameBody(loose, id, m.to))) continue;
    c.back = MATCH;
    c.autoBack = true;
    delete c.merged;
  }
}
export function linkSameHit(doc: TreeDoc, ids: readonly string[], loose?: BodyOf): void {
  for (const id of ids) {
    const c = doc.boxes[id];
    if (!c || c.out !== "hit" || c.hand || c.noAutoBack) continue;
    const to = sameHitsOf(doc, id, loose)[0];
    if (to) joinSameHit(doc, to, [id], true);
  }
}

/**
 * 同じ形の横の結果の箱 (外れ・狙いが消えた・外れが消えた・打った後。手も分かれ目も完成も無い物) = 「まとめる」の相手 (10-26 オーナー
 * 「同じ形ってのでハズレMODもまとめれるようにしようよ」)。形 = matchTargets の鍵 (付いている狙いの組 + 外れの有無) の一覧がそっくり同じ。既定はまとめない
 */
export function joinableShapeOf(doc: TreeDoc, id: string): string[] {
  const b = doc.boxes[id], p = b?.parent ? doc.boxes[b.parent] : undefined;
  const plain = (c: TreeBox | undefined): boolean => !!c && c.out !== "hit" && c.out !== "start" && c.out !== "pass" && c.out !== "branch";
  if (!b || !p || !plain(b)) return [];
  const keyOf = (x: string): string => [...new Set(matchTargets(doc, x).map((m) => m.key))].sort().join("|");
  const k = keyOf(id);
  return p.outs.filter((o) => { const c = doc.boxes[o]; return o !== id && plain(c) && !c!.hand && !c!.split && !c!.done && keyOf(o) === k; });
}

/**
 * 入れ替える手 (カオス 1 回ずつ) の外れ = 狙いは親と同じで外れだけ替わった = 親の箱と同じ状態なので、親の箱 (同じ手をもう一度) へ
 * (10-25 オーナー「これ自動でやんないと分からずに同じツリーを何個も作る羽目になるぞ」)。当たるまでの手 (カオススパムオーブ) は外れの箱を作らない
 */
function swapJunkOf(c: TreeBox, p: TreeBox | undefined): string | null {
  return c.out === "junk" && p?.hand && !p.hand.repeat && effectOf(p.hand.currency) === "swap" ? p.id : null;
}

/** 手の結果 (outcomeOf) に合う結果の箱 (回す時と精査で同じ)。any = 狙い無しの手の「打った後」、pass = 品質だけ上げた後 */
/** after = 打った後のアイテム (無限のエッセンスで当たりの箱が 2 つ以上の時、付いた MOD の箱を選ぶ。無ければ 1 つ目) */
export function outBoxOf(doc: TreeDoc, b: TreeBox, oc: { out: OutKind; hits: Aim[]; junkKey?: string }, after?: StageItem): string | undefined {
  // 行き先の箱が無い結果を外れなどへ自動で寄せない (オーナー 10-26「ツリーは全ての結果を表示してそれをどう処理するかは当人が決めれるように」)。精査の unexpected で知らせ、箱を足す・まとめるは人が決める
  return outBoxOfRaw(doc, b, oc, after);
}
function outBoxOfRaw(doc: TreeDoc, b: TreeBox, oc: { out: OutKind; hits: Aim[]; junkKey?: string }, after?: StageItem): string | undefined {
  // 外れの枝が側と種類で分かれている時は鍵の合う箱 (狙い無しの乱数のフラクチャー、スイッチ fracPick。外れ・打った後・外れが消えたの側 = S-65、スイッチ junkSide)。
  // 鍵の合う箱が無ければ (前の版の 1 箱の外れ、見本で出なかった側) 今までどおり種類の合う箱
  if (oc.junkKey) { const k = b.outs.find((id) => doc.boxes[id]?.junkKey === oc.junkKey); if (k) return k; }
  // 種類がぴったり合う箱を先に (打った後の箱と狙いが消えたの箱が並ぶ時、狙いが消えた人を打った後へ入れない。10-25 起こりうる結果の箱 possibleOutsOf)
  // まとめた結果の箱 (mergedOuts) はまとめた種類も受ける (10-26)
  const exact = b.outs.find((id) => { const c = doc.boxes[id]; return !!c && (c.out === oc.out || !!c.mergedOuts?.includes(oc.out)) && c.out !== "hit"; });
  if (exact) return exact;
  return b.outs.find((id) => {
    const c = doc.boxes[id];
    if (!c || (c.out !== oc.out && c.out !== "any" && c.out !== "pass")) return false;
    // 打った後・品質の後の箱はどの結果も受ける (狙い無しの手で狙いが付いても。前は当たりだと狙いを見て外れ、精査の「結果の箱に無い結果」・回しの止まりになった、10-22 靴・手袋)
    // ただし完成の狙いが新しく付いた人は受けない (当たりの箱へ。無ければ行き先が無い = 精査で出す。10-26 オーナー「当たってたら次の回に消去でそれ決めるんやからおかしい」。
    // 前は狙い無しの手の打った後に狙い持ちも入り、次のカオスに「狙いが消えた」が並んだ)。エッセンスの打った後 (付く MOD が狙いに無い) は hits が空なのでそのまま
    if (c.out === "any" || c.out === "pass") return oc.out !== "hit" || !oc.hits.length;
    // エッセンスの当たりの箱は 1 つ (付く MOD は必ず付く)。付く MOD が完成の狙いに無い時は hits が空でもこの箱 (tree-sample の outcomeOf)
    if (oc.out === "hit" && b.hand && effectOf(b.hand.currency) === "essence") return !after || essenceBoxFits(doc, b, c, after);
    // 「どれか」の当たりの箱は、その一覧のどれかが付いたら (anyOf、10-26)
    return oc.out !== "hit" || boxAims(c).some((x) => oc.hits.some((a) => a.modId === x.modId && a.tier === x.tier));
  });
}

/**
 * 結果の箱 (外れ・狙いが消えた・打った後・当たり) で手 h を選んだ時の戻り先 (当たりも同じ、10-27 夕オーナー「同じ手・同じ狙い・同じ挙動の箱を自動で見つける話」) (シミュのルール = PC・スマホ共通、tree-hand-plan の applyPick が呼ぶ。
 * 10-27 オーナー「ここの挙動はシミュのルールだから共通でしょ」、スイッチ goalShape)。新しい段は作らずその箱へ戻る:
 * ① 打つ前の箱 (親) と同じ手 = 再度挑戦 (10-27 オーナー「ハズレでかつ同じ MOD 群で 1 段上に進むことはない」)
 * ② 木の中でこの箱と同じ形 (形の鍵 = 狙いの組 + 外れの有無、shapeFits も合う) で同じ手の箱 (候補が幾つもあれば上の段。r/okPcmPyY: 冒涜の外れで、同じ形の外れのエッセンスと同じ手)。
 * 自分と自分の下は除く。同じ手 = 同じカレンシーとお告げ (狙いの選び方は問わない)。無ければ null = 今までどおり新しい段
 */
export function sameHandReturn(doc: TreeDoc, id: string, h: Hand, loose?: BodyOf): string | null {
  const b = doc.boxes[id];
  // 「外れが消えた」の箱も同じ (10-27 夜モンキー 2 回目 2: 「1 段目へ戻る」の外れが消えたの箱でスタートと同じ手を選ぶと、戻りが消えて新しい段ができた。スイッチ backSameHand)
  if (!b || !(b.out === "junk" || b.out === "lost" || b.out === "any" || b.out === "hit" || (b.out === "junkGone"))) return null;
  const same = (x: Hand | null | undefined): boolean => !!x && x.currency === h.currency && [...x.omens].sort().join() === [...h.omens].sort().join();
  // ⓪ 今の戻り先 (人が選んだ / 自動の) の箱がこの手と同じなら、そのまま戻り先へ (戻り先がスタートの時は、スタートは形の合う箱の候補に入らないので、ここで見る)
  if (b.back && b.back !== MATCH && b.back !== RESTART && same(doc.boxes[b.back]?.hand)) return b.back;
  const p = b.parent ? doc.boxes[b.parent] : undefined;
  const keys = new Set(matchTargets(doc, id).map((m) => m.key));
  // 打つ前の箱へも、形の鍵 (狙いの組 + 外れの有無) が同じ時だけ (10-27 夕モンキー 8: スタート (外れ 0) で高貴を打った外れ (外れ 1) に同じ高貴を選ぶとスタートへ戻り、
  // 回すたびにプレの外れが増えて 30 人中 29 人が満杯で止まった。カオスのように外れの数が変わらない手は今まで通り戻る)
  if (p && same(p.hand) && shapeFits(doc, id, p.id) && matchTargets(doc, p.id).some((m) => keys.has(m.key)) && sameBody(loose, id, p.id)) return p.id;
  const under = (x: string): boolean => { for (let y: string | null = x; y; y = doc.boxes[y]?.parent ?? null) if (y === id) return true; return false; };
  const depth = (x: string): number => { let n = 0; for (let y = doc.boxes[x]?.parent ?? null; y; y = doc.boxes[y]?.parent ?? null) n++; return n; };
  const cands = [...new Set(shapesOf(doc).filter((s) => keys.has(s.key) && same(s.hand) && !under(s.box)).map((s) => s.box))].filter((x) => shapeFits(doc, id, x) && sameBody(loose, id, x));
  return cands.sort((x, y) => depth(x) - depth(y))[0] ?? null;
}

/**
 * 保存してある自動の ↩ (再挑戦・外れが消えたの戻り・まとめなど、autoBack) のうち、体 (外れの側・種類・数) が同じと分からない物を外す = 未設定の箱に戻す
 * (S-50、スイッチ bodyStrict。前の版の木・見本が変わった木の古いつなぎ)。人が付けた ↩ は触らない。外したら true
 */
export function pruneBacks(data: PatchData, doc: TreeDoc): boolean {
  if (!flag("bodyStrict") || !flag("boxShape")) return false;
  const loose = bodyMemo(data, doc);
  let changed = false;
  for (const b of Object.values(doc.boxes)) {
    // 当たりの箱どうしの統合 (同じ MOD 群) は別の物なので見ない
    if (!b.autoBack || !b.back || b.back === MATCH || b.back === RESTART || !doc.boxes[b.back] || (b.out === "hit" && doc.boxes[b.back]!.out === "hit")) continue;
    if (backBody(loose, b.id, b.back)) continue;
    b.back = null; delete b.autoBack; delete b.merged;
    changed = true;
  }
  return changed;
}
