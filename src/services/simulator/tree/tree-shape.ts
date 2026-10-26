/**
 * tree-shape.ts — ツリーの形合わせ (形の合う箱・分かれ目・結果の箱)。tree-run.ts から分けた (シミュ部長 25 本目、2026-10-25、1 ファイル 500 行まで)。
 * 回す所 (tree-run)・精査 (tree-check)・画面 (つなぐ・まとめる) が同じ物を読む。中身は前のまま
 */
import { mulberry32, sideOfMod, type PatchData, type StageItem } from "../../craft-stage/engine";
import { aimHeldOn, junkOf } from "./tree-aim";
import { effectOf } from "./tree-hands";
import { aimOpts, aimsOf, essenceBoxFits, handProblem, playHand, targetsOf } from "./tree-sample";
import { aimKey, MATCH_BACK, type Aim, type Hand, type OutKind, type SplitRange, type SplitRule, type SplitWhen, type TreeBox, type TreeDoc, boxAims, drop, subtree } from "./tree-model";

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
 * 形の鍵 = 付いている狙いの組 + 外れがあるか (空きの数は、側の決まった狙いと外れの有無で決まる)
 */
const shapeKey = (held: readonly string[], junk: boolean): string => `${[...new Set(held)].sort().join(",")}#${junk ? 1 : 0}`;
export type Shape = { key: string; box: string; hand?: Hand | null };
/**
 * 箱の道の札の組 (始まりから親をたどった当たりの札、aimKey)。「どれか」の当たりの箱 (anyOf、同じ側の狙いのどれか 1 つ) を通ると、
 * どれが付いたかで組が分かれる (10-26)。組は 64 で打ち切る
 */
function pathHelds(doc: TreeDoc, id: string | null): string[][] {
  let sets: string[][] = [[]];
  for (let x = id; x; x = doc.boxes[x]?.parent ?? null) {
    const c = doc.boxes[x];
    if (c?.out === "hit" && c.aim) { const ks = boxAims(c).map(aimKey); sets = sets.flatMap((h) => ks.map((k) => (h.includes(k) ? h : [...h, k]))).slice(0, 64); }
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
    // 「どれか」の当たりの箱はどれが付いたかで組が分かれる (anyOf、10-26)
    if (c.out === "hit" && c.aim) { const ks = boxAims(c).map(aimKey); sets = sets.flatMap((h) => ks.map((k) => (h.includes(k) ? h : [...h, k]))); }
    else if (c.out === "lost") {
      sets = sets.flatMap((h) => (h.length ? h.map((k) => h.filter((x) => x !== k)) : [h]));
      // エッセンスの「狙いが消えた」は、エッセンスで付いた MOD (同じ手の当たりの箱の札) は付いている
      const p = c.parent ? doc.boxes[c.parent] : undefined;
      const ess = p?.hand && effectOf(p.hand.currency) === "essence" ? p.outs.map((o) => doc.boxes[o]).find((x) => x?.out === "hit" && x.aim)?.aim : undefined;
      if (ess) { const k = aimKey(ess); sets = sets.map((h) => (h.includes(k) ? h : [...h, k])); }
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
  const t = doc.boxes[to];
  if (!t || t.split) return true;
  const key = (h: string[]): string => [...h].sort().join(",");
  const there = new Set(heldSets(doc, to).map(key));
  return heldSets(doc, from).every((h) => there.has(key(h)));
}
/** 行き先になれる箱 (手のある当たり / 外れの箱) とその形 */
export function shapesOf(doc: TreeDoc): Shape[] {
  const out: Shape[] = [];
  for (const b of Object.values(doc.boxes)) {
    if (!b.hand || (b.out !== "hit" && b.out !== "junk")) continue;
    for (const held of pathHelds(doc, b.out === "junk" ? b.parent : b.id)) out.push({ key: shapeKey(held, b.out === "junk"), box: b.id, hand: b.hand });
  }
  // 分かれ目の箱も行き先に (外れの有無は行で分けるので両方の形を受ける。手のある箱が先、10-22 13 通り組んだ #14: 分かれ目の下の消去の「外れが消えた」に行き先が無かった)
  for (const b of Object.values(doc.boxes)) {
    if (!b.split || b.hand) continue;
    for (const held of pathHelds(doc, b.id)) for (const junk of [false, true]) out.push({ key: shapeKey(held, junk), box: b.id });
  }
  return out;
}
/**
 * 形の鍵 → 行き先 (無ければ null)。狙いが 0 なら始まり = 始まりの手が外れも扱う。ただし狙い 0 + 外れありの形の箱 (始めの手の外れ → 消去など) があればそこへ
 * (10-22 解析君の 13 本の突き合わせ: 外れを持ったまま始めの高貴へ戻り、外れを先に消す打ち方より 48〜81% 高かった)。
 * at = 今のアイテム (あればその箱の手が打てる時だけ。光 + 消去の箱は普通の MOD の外れを消せず、兜で 93 人止まった)
 */
function boxOfShape(shapes: readonly Shape[], key: string, at?: { data: PatchData; item: StageItem }): string | null {
  const same = shapes.filter((s) => s.key === key);
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
export function matchBox(data: PatchData, shapes: readonly Shape[], item: StageItem, aims: readonly Aim[]): string | null {
  return boxOfShape(shapes, itemKey(data, item, aims), { data, item });
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
    if (key === JUNK_ONLY) { const to = boxOfShape(shapes, JUNK_ONLY, { data, item }) ?? id; return to === id && cant ? openOfShape(doc, key) ?? id : to; }
    // 始まりの手が打てない (エッセンスの MOD が既に付いている等) 時は、形の合う打てる箱へ (10-22 解析君 body-essence-path: 狙いが消えて始めに戻り 49 人止まった)
    if (!cant) return id;
    const to = boxOfShape(shapes, key, { data, item });
    const th = to ? doc.boxes[to]?.hand : null;
    return to && (!th || canPlay(data, item, th)) ? to : openOfShape(doc, key) ?? id;
  }
  const b = doc.boxes[id];
  // 「打った後」の箱 (見本の頭で外れを付けた後 = 前の始まり、10-25) へ戻って手が打てない時も、始まりと同じく形の合う打てる箱へ
  if (b?.hand && b.out === "any") {
    if (!handProblem(data, item, b.hand)) return id;
    const to = boxOfShape(shapes, itemKey(data, item, aims), { data, item });
    const th = to ? doc.boxes[to]?.hand : null;
    return to && (!th || canPlay(data, item, th)) ? to : id;
  }
  if (!b?.hand || (b.out !== "hit" && b.out !== "junk")) return id;
  const key = itemKey(data, item, aims);
  // 形が合っても手が打てない (外れが消去の届かない側にある等) 時は、形の合う打てる箱へ (10-22 解析君 body-essence-path、狙いが消えた → 外れの箱の戻り)
  if (heldSets(doc, b.out === "junk" ? b.parent : id).some((h) => shapeKey(h, b.out === "junk") === key) && canPlay(data, item, b.hand)) return id;
  const to = boxOfShape(shapes, key, { data, item }) ?? id;
  // 形の合う箱の手が打てず、この箱の手は打てる時はこの箱のまま (10-24 モンキー 7 回目: 始めのルーンの外れは MOD が増えず「外れ無し」の形で始めへ戻され、
  // 同じルーンをもう差せずに 100 人とも止まった。外れの箱の変成はそのまま打てる)
  const th = to !== id ? doc.boxes[to]?.hand : null;
  return th && !canPlay(data, item, th) && canPlay(data, item, b.hand) ? id : to;
}
/** アイテムから行き先 (ルート精査が回す時と同じ道を辿る用) */
export function matchItem(data: PatchData, doc: TreeDoc, item: StageItem, aims: readonly Aim[] = aimsOf(doc)): string | null {
  return matchBox(data, shapesOf(doc), item, aims);
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
  const junk = b.out === "lost" ? p?.out === "junk" || (!!p?.hand && effectOf(p.hand.currency) !== "remove") : b.out === "junk" || b.out === "any";
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
export function linkSameShape(doc: TreeDoc, ids: readonly string[]): void {
  for (const id of ids) {
    const c = doc.boxes[id];
    // 分かれ目の行の箱 (branch) は人が手を決める所 (分かれ目の箱も行き先になったので、つなぐと自分の分かれ目へ戻る輪になる)
    // 人が × で外した箱はつながない (noAutoBack)
    if (!c || c.noAutoBack || c.hand || c.out === "hit" || c.out === "pass" || c.out === "any" || c.out === "branch") continue;
    if (c.back && c.back !== MATCH && !(c.out === "lost" && c.back === "start")) continue;
    // フラクチャーの結果の箱は、形 (✦ は数えない) が親と同じでも つながない (親へ戻すと ✦ のある品にもう一度フラクチャーを打って止まった、10-24)
    const p = c.parent ? doc.boxes[c.parent] : undefined;
    if (p?.hand && effectOf(p.hand.currency) === "fracture") continue;
    const targets = matchTargets(doc, id).map((m) => m.to);
    // 「どれか」の当たりの箱 (anyOf) は、どれが付いても同じ箱へ行く時だけつなぐ (付いた物で行き先が分かれるなら、回す時の settle が実物で形の合う箱へ。10-26)
    if (c.anyOf?.length && new Set(targets).size > 1) continue;
    const to = targets.find((x): x is string => !!x && x !== id && (x !== "start" || c.out === "lost")) ?? swapJunkOf(c, p);
    // 形 (付いている狙いの組) が全部合う箱へだけ (狙いが消えた箱は組が何通りかあり、1 つ目の組だけで別の形の箱へつないでいた。10-26 オーナー「前提狙いMODの状態でなんかする時」、shapeFits)
    if (!to || !shapeFits(doc, id, to)) continue;
    c.back = to;
    c.autoBack = true;
    c.done = null;
  }
}

/** 当たりの箱のアイテムの状態の鍵 = 付いていうる狙いの組 (heldSets) の全部。同じなら同じ MOD が付いた同じ段の箱 (値の差は段の中の差) */
const hitStateKey = (doc: TreeDoc, id: string): string => heldSets(doc, id).map((h) => [...h].sort().join(",")).sort().join("|");
/**
 * 別の道からできた、付いている MOD が全部同じ当たりの箱 (10-26 夜オーナー「段一緒で形も一緒ならまとめるが出ないと挙動的におかしい」
 * 「形は一緒ならこのツリー組んだ瞬間まとまってくれるよね」)。同じ親の横の箱 (joinableOf の「どれか」) と、自分の上・下の箱は除く。
 * 戻りの矢印を持つ箱 (もうどこかへつないだ箱) と分かれ目も除く。並びは先に作った箱から
 */
export function sameHitsOf(doc: TreeDoc, id: string): string[] {
  const b = doc.boxes[id];
  if (!b || b.out !== "hit" || !b.aim || b.back || b.split) return [];
  const up = new Set<string>();
  for (let x = b.parent; x; x = doc.boxes[x]?.parent ?? null) up.add(x);
  const down = new Set(subtree(doc, id)), k = hitStateKey(doc, id);
  return Object.values(doc.boxes).filter((c) => c.id !== id && c.out === "hit" && !!c.aim && !c.back && !c.split && c.parent !== b.parent && !up.has(c.id) && !down.has(c.id) && hitStateKey(doc, c.id) === k).map((c) => c.id);
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
export function linkSameHit(doc: TreeDoc, ids: readonly string[]): void {
  for (const id of ids) {
    const c = doc.boxes[id];
    if (!c || c.out !== "hit" || c.hand || c.noAutoBack) continue;
    const to = sameHitsOf(doc, id)[0];
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
export function outBoxOf(doc: TreeDoc, b: TreeBox, oc: { out: OutKind; hits: Aim[] }, after?: StageItem): string | undefined {
  // 行き先の箱が無い結果を外れなどへ自動で寄せない (オーナー 10-26「ツリーは全ての結果を表示してそれをどう処理するかは当人が決めれるように」)。精査の unexpected で知らせ、箱を足す・まとめるは人が決める
  return outBoxOfRaw(doc, b, oc, after);
}
function outBoxOfRaw(doc: TreeDoc, b: TreeBox, oc: { out: OutKind; hits: Aim[] }, after?: StageItem): string | undefined {
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
