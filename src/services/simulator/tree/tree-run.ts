/**
 * tree-run.ts — クラフトの道 (ツリー) を n 人に 1 人ずつ打たせて、箱ごとの数字を出す (解析君、2026-10-23。入口の形 docs/org/math/notes/2026-10-23-tree-run.md、
 * 設計 docs/org/simulator/notes/2026-10-22-manual-sim-design.md の 4)。ワーカーと画面はシミュ部長、ここは純粋な計算だけ。
 *
 * 打つのは全部エンジンの入口 (applyCurrency / fillCatalyst)。結果の分け方は tree-sample.ts の outcomeOf・aimsOf (見本と同じ分け方)。
 * 繰り返し (当たるまで) は tree-sample の playHand と同じ流れを、個数を数えるためにここでたどる (playHand を変える時はここも合わせる)。
 */
import { mulberry32, sideOfMod, type PatchData, type StageItem } from "../../craft-stage/engine";
import { aimHeldOn, isAimMod, junkOf } from "./tree-aim";
import { effectOf } from "./tree-hands";
import { aimOpts, aimsOf, essenceBoxFits, fractureChoices, handAims, handProblem, outcomeOf, playHand, startItemOf as startOf, targetsOf } from "./tree-sample";
import { withTreeTune } from "./tree-tune";
import { modText, tr } from "../../../i18n/lang";
import { aimKey, MATCH_BACK, type Aim, type Hand, type OutKind, type SplitRange, type SplitRule, type SplitWhen, type TreeBox, type TreeDoc } from "./tree-model";

export interface TreeRunOpts {
  /** 人数 (裏は 100、確かめは 300) */
  n: number;
  /** 同じ seed なら同じ結果 */
  seed: number;
  /** 値段のキー → 神。無い物は 0 */
  price: (key: string) => number;
  /** 始めの形の値段 (神)。始まりの 1 回だけ払う */
  startCost?: number;
  /** 1 人の打ち止め (神、既定 2000) */
  capDiv?: number;
  /** 1 人の手の上限 (既定 20000) */
  capSteps?: number;
  /** 狙いの札 (既定 = ツリーの当たりの箱の札、aimsOf)。分かれ目の箱だけで組んだツリーは当たりの箱が無いので渡す */
  aims?: Aim[];
  /** 始めのアイテム (既定 = sampleOf の始まり: レア + フラクチャーの指名) */
  start?: (rng: () => number) => StageItem;
  /** every 人ごとに途中の結果 */
  onProgress?: (r: TreeRunResult) => void;
  every?: number;
  /** 1 人終わるごとに、その人の通った箱 (順に、着いた時の費用) と終わり方。画面の「1 人目が木を進む」が読む (10-22) */
  onPerson?: (p: { end: End; at: string; cost: number; visits: readonly { box: string; cost: number; pass?: true }[]; why?: { reason: string; item: StageItem } }, i: number) => void;
}
interface BoxStat {
  /** 1 回でもここに来た人数 */
  reach: number;
  /** 来た回数の合計 */
  visits: number;
  /** 着いた時のそれまでの費用の平均 (神、来た回ごと) */
  costIn: number;
  /** ここから完成 (か打ち止め・止まり) までの費用の平均 (神、来た回ごと) */
  remain: number;
  /** remain > startCost + perItem (作り直しの方が安い) */
  warn: boolean;
  /** この箱の手で使ったお金の 1 人あたり (神。次の箱に着いた時の費用 − 着いた時の費用、結果のレポートの「一番お金を使った箱」10-22) */
  spend: number;
}
export interface TreeRunResult {
  n: number;
  /** 完成した人 (終わり方は完成か未完成だけ。未完成 = 打ち止め・止まり、妥協は無し、オーナー 10-22) */
  finished: number;
  /** 打ち止め (神か手の上限) */
  capped: number;
  /** 組んでいない芽・打てない手で止まった人 */
  stuck: number;
  stuckAt: Record<string, number>;
  /** 手が打てずに止まった箱の、最初の 1 人の理由・着いた形・通った戻りの箱 (古い順、重ねない)。精査がどの外れ・どの戻りが元かを出す (10-22) */
  stuckWhy: Record<string, { reason: string; item: StageItem; backs: string[]; noBox?: boolean }>;
  /** 手の結果に合う結果の箱が無かった人数 (箱ごと。結果が 1 通りとして箱を 1 つにした手で別の結果が出た等。形の合う箱があればそこへ進み、無ければ止まり) */
  unexpected: Record<string, number>;
  /** 着いた箱 (手の結果の箱・戻り先) の形が実物と違い、形の合う箱へ移した人数 (箱ごと、settle。照らしの台本は形合わせを辿らないので、これのある木は比べ方が違う、10-24) */
  moved: Record<string, number>;
  /** 全員の合計 ÷ 完成数 (完成 0 なら NaN) */
  perItem: number;
  meanFinished: number;
  median: number;
  p90: number;
  /** 完成した人の費用の下位 10% (安い方、結果のレポート 10-22) */
  p10: number;
  /** 1 人あたりの個数 (値段のキーごと) */
  uses: Record<string, number>;
  /** 1 人あたりの作り直しの回数 */
  restarts: number;
  boxes: Record<string, BoxStat>;
  /** 箱から箱へ移った回数の合計 ("<元>><先>"、進む線も戻りの弧も。回した時の層の線の太さ、10-22 オーナー) */
  edges: Record<string, number>;
}

export type End = "done" | "capped" | "stuck";
interface Person { end: End; cost: number; at: string; visits: { box: string; cost: number; pass?: true }[]; uses: Record<string, number>; restarts: number; odd: Set<string>; why?: { reason: string; item: StageItem; noBox?: boolean } }

const startItemOf = (data: PatchData, doc: TreeDoc, rng: () => number): StageItem => startOf(data, doc, rng).item;

/**
 * 形の合う箱へ (設計の「消去の後は 形の合う箱へ」、back: "match")。形 = 付いている狙いの組 + 外れがあるか。
 * 箱の形 = 始まりから親をたどった当たりの札の組 (+ 外れの箱なら外れあり)。狙いが 1 つも無ければ始まりへ (始まりの手が外れも扱う)
 */
export const MATCH = MATCH_BACK;
/** フラクチャーの外れの回数 (10-24 オーナー「2 回外れて 1 回当たり」) と、外れうる固定の候補の数 */
export const FRACTURE_MISS = 2;
const FRACTURE_PICK = 2;
/** 作り直し (設計の「作り直し」、back: "restart"): 始めのアイテムに戻して、始めの費用をもう一度払う。数えた回数は TreeRunResult.restarts */
export const RESTART = "restart";

/**
 * 分かれ目の箱 (設計 2 弾目「打たずに状態で分ける」、10-22 画面にも): 手を打たずに、今のアイテムの状態の条件を上から順に見て、最初に合った行の箱へ進む。
 * 形 (split) は tree-model の TreeBox。どの行にも合わない・行き先を決めていない行に合ったら止まる。
 * next = 手の結果がどれでも、この箱へ進む (解析君の台本の木だけ。分かれ目に戻す時に結果の箱を並べなくてよい)
 */
export type { SplitRule, SplitWhen } from "./tree-model";
type SplitBox = TreeBox & { next?: string };
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
/** 箱の道の札 (始まりから親をたどった当たりの札、aimKey) */
function pathHeld(doc: TreeDoc, id: string | null): string[] {
  const held: string[] = [];
  for (let x = id; x; x = doc.boxes[x]?.parent ?? null) {
    const c = doc.boxes[x];
    if (c?.out === "hit" && c.aim) held.push(aimKey(c.aim));
  }
  return [...new Set(held)];
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
    if (c.out === "hit" && c.aim) { const k = aimKey(c.aim); sets = sets.map((h) => (h.includes(k) ? h : [...h, k])); }
    else if (c.out === "lost") {
      sets = sets.flatMap((h) => (h.length ? h.map((k) => h.filter((x) => x !== k)) : [h]));
      // エッセンスの「狙いが消えた」は、エッセンスで付いた MOD (同じ手の当たりの箱の札) は付いている
      const p = c.parent ? doc.boxes[c.parent] : undefined;
      const ess = p?.hand && effectOf(p.hand.currency) === "essence" ? p.outs.map((o) => doc.boxes[o]).find((x) => x?.out === "hit" && x.aim)?.aim : undefined;
      if (ess) { const k = aimKey(ess); sets = sets.map((h) => (h.includes(k) ? h : [...h, k])); }
    }
    const seen = new Set<string>();
    sets = sets.map((h) => [...h].sort()).filter((h) => { const k = h.join(","); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 64);
  }
  return sets;
}
/** 行き先になれる箱 (手のある当たり / 外れの箱) とその形 */
export function shapesOf(doc: TreeDoc): Shape[] {
  const out: Shape[] = [];
  for (const b of Object.values(doc.boxes)) {
    if (!b.hand || (b.out !== "hit" && b.out !== "junk")) continue;
    out.push({ key: shapeKey(pathHeld(doc, b.out === "junk" ? b.parent : b.id), b.out === "junk"), box: b.id, hand: b.hand });
  }
  // 分かれ目の箱も行き先に (外れの有無は行で分けるので両方の形を受ける。手のある箱が先、10-22 13 通り組んだ #14: 分かれ目の下の消去の「外れが消えた」に行き先が無かった)
  for (const b of Object.values(doc.boxes)) {
    if (!b.split || b.hand) continue;
    const held = pathHeld(doc, b.id);
    for (const junk of [false, true]) out.push({ key: shapeKey(held, junk), box: b.id });
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
function matchBox(data: PatchData, shapes: readonly Shape[], item: StageItem, aims: readonly Aim[]): string | null {
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
    if (itemKey(data, item, aims) === JUNK_ONLY) return boxOfShape(shapes, JUNK_ONLY, { data, item }) ?? id;
    // 始まりの手が打てない (エッセンスの MOD が既に付いている等) 時は、形の合う打てる箱へ (10-22 解析君 body-essence-path: 狙いが消えて始めに戻り 49 人止まった)
    const h = doc.boxes.start?.hand;
    if (!h || !handProblem(data, item, h)) return id;
    const to = boxOfShape(shapes, itemKey(data, item, aims), { data, item });
    const th = to ? doc.boxes[to]?.hand : null;
    return to && (!th || canPlay(data, item, th)) ? to : id;
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
 * 形が複数ありうる箱 (狙いが消えた = どれが消えたかで分かれる) と、同じ形の箱が複数ある時は先に作った箱 (残りは回す時の settle が形の合う箱へ)。
 * 同じ形の箱が無い箱は setHand の既定のまま。つながない物 (10-22 白紙から 13 通り組んだ #2、毎回 × で外す手間・始まりの手を打ち直せない木で 100 人止まり):
 * MOD をまだ選んでいない当たりの箱、狙い 0 の形 (始まりへ送るのは狙いが消えた箱だけ)、setHand が決めた戻り先 (外れが消えた → 外れの前の箱など。
 * 形の合う箱へと、狙いが消えた → 始まりは同じ形の箱へ付け替える)
 */
export function linkSameShape(doc: TreeDoc, ids: readonly string[]): void {
  for (const id of ids) {
    const c = doc.boxes[id];
    // 分かれ目の行の箱 (branch) は人が手を決める所 (分かれ目の箱も行き先になったので、つなぐと自分の分かれ目へ戻る輪になる)
    if (!c || c.hand || c.out === "pass" || c.out === "any" || c.out === "branch") continue;
    if ((c.out === "hit" && !c.aim) || (c.back && c.back !== MATCH && !(c.out === "lost" && c.back === "start"))) continue;
    // フラクチャーの結果の箱は、形 (✦ は数えない) が親と同じでも つながない (親へ戻すと ✦ のある品にもう一度フラクチャーを打って止まった、10-24)
    const p = c.parent ? doc.boxes[c.parent] : undefined;
    if (p?.hand && effectOf(p.hand.currency) === "fracture") continue;
    const to = matchTargets(doc, id).map((m) => m.to).find((x): x is string => !!x && x !== id && (x !== "start" || c.out === "lost"));
    if (!to) continue;
    c.back = to;
    c.autoBack = true;
    c.done = null;
  }
}

/** 手の結果 (outcomeOf) に合う結果の箱 (回す時と精査で同じ)。any = 狙い無しの手の「打った後」、pass = 品質だけ上げた後 */
/** after = 打った後のアイテム (無限のエッセンスで当たりの箱が 2 つ以上の時、付いた MOD の箱を選ぶ。無ければ 1 つ目) */
export function outBoxOf(doc: TreeDoc, b: TreeBox, oc: { out: OutKind; hits: Aim[] }, after?: StageItem): string | undefined {
  return b.outs.find((id) => {
    const c = doc.boxes[id];
    if (!c || (c.out !== oc.out && c.out !== "any" && c.out !== "pass")) return false;
    // 打った後・品質の後の箱はどの結果も受ける (狙い無しの手で狙いが付いても。前は当たりだと狙いを見て外れ、精査の「結果の箱に無い結果」・回しの止まりになった、10-22 靴・手袋)
    if (c.out === "any" || c.out === "pass") return true;
    // エッセンスの当たりの箱は 1 つ (付く MOD は必ず付く)。付く MOD が完成の狙いに無い時は hits が空でもこの箱 (tree-sample の outcomeOf)
    if (oc.out === "hit" && b.hand && effectOf(b.hand.currency) === "essence") return !after || essenceBoxFits(doc, b, c, after);
    return oc.out !== "hit" || (!!c.aim && oc.hits.some((a) => a.modId === c.aim!.modId && a.tier === c.aim!.tier));
  });
}

function runOne(data: PatchData, doc: TreeDoc, aims: readonly Aim[], shapes: readonly Shape[], rng: () => number, o: Required<Pick<TreeRunOpts, "price" | "startCost" | "capDiv" | "capSteps">> & Pick<TreeRunOpts, "start">): Person {
  let item = o.start ? o.start(rng) : startItemOf(data, doc, rng);
  let cost = o.startCost;
  const uses: Record<string, number> = {};
  const visits: Person["visits"] = [];
  const use = (key: string, n = 1): void => { uses[key] = (uses[key] ?? 0) + n; cost += o.price(key) * n; };
  let at = "start";
  let steps = 0;
  let restarts = 0;
  const odd = new Set<string>();
  // back だけで回り続ける形 (back の輪) の見張り
  let hops = 0;
  for (;;) {
    const b = doc.boxes[at];
    if (!b) return { end: "stuck", cost, at, visits, uses, restarts, odd };
    visits.push({ box: at, cost });
    // 完成の印は "main" だけ (前の版の妥協 "compromise" は未完成 = 印の無い箱として先へ読む)。
    // 着いた時に狙いの数を見る: 道の当たりの数より少なければ完成にせず、形の合う箱へ (無ければ止まり)
    // (10-22 白紙から 13 通り組んだ #4: 入れ替えのカオスで途中の狙いが消え、完成 100% と出たのに 96 人は狙い 1 つだった)
    if (b.done === "main") {
      // 完成のアイテムも残す (台本で完成図を出す。止まりの集計 stuckWhy には入れない)
      if (doneOk(data, doc, at, item, aims)) return { end: "done", cost, at, visits, uses, restarts, odd, why: { reason: tr("完成", "Done"), item } };
      odd.add(at);
      const to = ++hops > 1000 ? null : matchBox(data, shapes, item, aims);
      if (!to || to === at) return { end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: tr("完成の箱に着いたが、狙いが揃っていない (形の合う箱も無い)", "Reached a done box without all its targets (and no box matches the shape)"), item } };
      at = to;
      continue;
    }
    const sb = b as SplitBox;
    if (sb.split) {
      if (++hops > 1000) return { end: "stuck", cost, at, visits, uses, restarts, odd };
      const to = splitTo(data, sb.split, item, aims);
      if (!to) return { end: "stuck", cost, at, visits, uses, restarts, odd };
      at = to;
      continue;
    }
    if (b.back) {
      if (++hops > 1000) return { end: "stuck", cost, at, visits, uses, restarts, odd };
      if (b.back === RESTART) {
        item = o.start ? o.start(rng) : startItemOf(data, doc, rng);
        cost += o.startCost;
        restarts++;
        at = "start";
        continue;
      }
      const to = b.back === MATCH ? matchBox(data, shapes, item, aims) : settle(data, doc, shapes, b.back, item, aims);
      if (!to) return { end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: tr("戻り先の「形の合う箱」が無い", "No box matches the shape to return to"), item, noBox: true } };
      // 戻り先に着いてから形の合う箱へ移った時も、結果の箱と同じく戻り先の来訪を pass で残す (moved に数える)
      if (b.back !== MATCH && to !== b.back) visits.push({ box: b.back, cost, pass: true });
      at = to;
      continue;
    }
    if (!b.hand) {
      // 完成 = 完成の狙い (0 完成形の設定) が全部付いた時点。手の無い箱で揃っていれば完成 (狙いを全部付けたスタート、10-22 14 本目)
      const goals = doc.memoAims ?? [];
      if (goals.length && goals.every((a) => aimHeldOn(data, item, a, { sameText: true }))) return { end: "done", cost, at, visits, uses, restarts, odd, why: { reason: tr("完成", "Done"), item } };
      return { end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: tr("次の手・戻り先が無い", "No next craft or return"), item, noBox: true } };
    }
    // 打ち止めの時のアイテムも残す (台本で輪から抜けない理由を見る。止まりの集計 stuckWhy には入れない)
    if (++steps > o.capSteps || cost > o.capDiv) return { end: "capped", cost, at, visits, uses, restarts, odd, why: { reason: tr("打ち止め", "Capped"), item } };
    hops = 0;
    const before = item;
    // フラクチャーは必ず狙いを固定し (playHand の fractureTarget)、固定できる MOD が 2 つ以上なら「2 回外れて 1 回当たり」として、ここまでに使った物と
    // 始めの値段を 2 回分足す (外れた時は素材を作り直す。10-24 オーナー、ツリーに買い直しの道は作らない)。作り直しの回数にも 2
    const miss = effectOf(b.hand.currency) === "fracture" && fractureChoices(data, item) >= FRACTURE_PICK ? Object.entries(uses) : null;
    const r = playHand(data, item, b.hand, rng, handAims(doc, at, aims), use);
    if (!r.applied) return { end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: r.reason ?? "", item } };
    if (miss) {
      for (const [k, n] of miss) use(k, FRACTURE_MISS * n);
      use(b.hand.currency, FRACTURE_MISS);
      cost += FRACTURE_MISS * o.startCost;
      restarts += FRACTURE_MISS;
    }
    if (sb.next) { item = r.item; at = sb.next; continue; }
    const oc = outcomeOf(data, before, r.item, aims, b.hand.currency);
    const next = outBoxOf(doc, b, oc, r.item);
    if (!next) {
      // 合う結果の箱が無い (10-22 ブラック「1 箱にした手で別の結果が出た時に黙って止まらない」): 形の合う箱があればそこへ、無ければ止まり。どちらも想定外として数える
      odd.add(at);
      const to = matchBox(data, shapes, r.item, aims);
      if (!to) return { end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: tr(`この手の結果「${outcomeText(data, r.item, oc)}」の箱が無く、形の合う箱も無い`, `No box for this craft's result "${outcomeText(data, r.item, oc)}", and no box matches the shape`), item: r.item, noBox: true } };
      item = r.item;
      at = to;
      continue;
    }
    item = r.item;
    // 結果の箱には一度着いてから形の合う箱へ移る (着いた数と線に入れる。前は飛ばして、当たりの箱が「来た人 0」・照らしで当たり 0% になった、10-24 モンキー m-602・指輪 b11)
    const to = settle(data, doc, shapes, next, item, aims);
    if (to !== next) visits.push({ box: next, cost, pass: true });
    at = to;
  }
}

/** 手の結果の名前 (止まりの文。当たりは付いた MOD の文) */
const OUT_TEXT: Partial<Record<OutKind, [string, string]>> = { junk: ["外れ", "Miss"], junkGone: ["外れが消えた", "Miss removed"], lost: ["狙いが消えた", "Target lost"] };
function outcomeText(data: PatchData, item: StageItem, oc: { out: OutKind; hits: Aim[] }): string {
  if (oc.out !== "hit") { const n = OUT_TEXT[oc.out]; return n ? tr(n[0], n[1]) : oc.out; }
  const mods = [...item.prefixes, ...item.suffixes];
  const names = oc.hits.map((a) => { const t = targetsOf(data, [a]), m = mods.find((x) => isAimMod(x, t, aimOpts(data))); return m ? modText(m) : a.modId; });
  return tr(`当たり ${names.join("・")}`, `Hit ${names.join(", ")}`);
}
/** 完成の箱で狙いが揃っているか (付いている木の狙いの数が、その箱の道の当たりの数の一番少ない組以上。分かれ目の先は行の条件で決まるので数で見る) */
function doneOk(data: PatchData, doc: TreeDoc, id: string, item: StageItem, aims: readonly Aim[]): boolean {
  const need = Math.min(...heldSets(doc, id).map((h) => h.length));
  return aims.filter((a) => aimHeldOn(data, item, a, { sameText: true })).length >= need;
}

function summarize(doc: TreeDoc, people: readonly Person[], startCost: number): TreeRunResult {
  const n = people.length;
  const fin = people.filter((p) => p.end === "done");
  const total = people.reduce((a, p) => a + p.cost, 0);
  const perItem = fin.length ? total / fin.length : NaN;
  const costs = fin.map((p) => p.cost).sort((a, b) => a - b);
  const q = (p: number): number => (costs.length ? costs[Math.min(costs.length - 1, Math.floor(p * costs.length))]! : NaN);
  const uses: Record<string, number> = {};
  for (const p of people) for (const [k, v] of Object.entries(p.uses)) uses[k] = (uses[k] ?? 0) + v / (n || 1);
  const stuckAt: Record<string, number> = {};
  const stuckWhy: TreeRunResult["stuckWhy"] = {};
  for (const p of people) if (p.end === "stuck") { stuckAt[p.at] = (stuckAt[p.at] ?? 0) + 1; if (p.why && !stuckWhy[p.at]) stuckWhy[p.at] = { ...p.why, backs: [...new Set(p.visits.map((v) => v.box).filter((id) => doc.boxes[id]?.back))] }; }
  const unexpected: Record<string, number> = {};
  for (const p of people) for (const id of p.odd) unexpected[id] = (unexpected[id] ?? 0) + 1;
  const moved: Record<string, number> = {};
  for (const p of people) for (const id of new Set(p.visits.filter((v) => v.pass).map((v) => v.box))) moved[id] = (moved[id] ?? 0) + 1;
  const acc: Record<string, { reach: number; visits: number; costIn: number; remain: number; spend: number }> = {};
  for (const id of Object.keys(doc.boxes)) acc[id] = { reach: 0, visits: 0, costIn: 0, remain: 0, spend: 0 };
  for (const p of people) {
    const seen = new Set<string>();
    p.visits.forEach((v, i) => {
      const a = acc[v.box];
      if (!a) return;
      a.spend += (p.visits[i + 1]?.cost ?? p.cost) - v.cost;
      if (!seen.has(v.box)) { seen.add(v.box); a.reach++; }
      // 着いてすぐ形の合う箱へ移った来訪 (pass) は、来た人と線には入れ、来た回数・平均の費用には入れない (この箱の手は打っていない)
      if (v.pass) return;
      a.visits++;
      a.costIn += v.cost;
      a.remain += p.cost - v.cost;
    });
  }
  const edges: Record<string, number> = {};
  for (const p of people) for (let i = 1; i < p.visits.length; i++) { const k = `${p.visits[i - 1]!.box}>${p.visits[i]!.box}`; edges[k] = (edges[k] ?? 0) + 1; }
  const boxes: Record<string, BoxStat> = {};
  for (const [id, a] of Object.entries(acc)) {
    const costIn = a.visits ? a.costIn / a.visits : 0, remain = a.visits ? a.remain / a.visits : 0;
    boxes[id] = { reach: a.reach, visits: a.visits, costIn, remain, warn: a.visits > 0 && Number.isFinite(perItem) && remain > startCost + perItem, spend: a.spend / (n || 1) };
  }
  return {
    n, finished: fin.length,
    capped: people.filter((p) => p.end === "capped").length,
    stuck: people.filter((p) => p.end === "stuck").length,
    stuckAt, stuckWhy, unexpected, moved, perItem,
    meanFinished: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : NaN,
    median: q(0.5), p90: q(0.9), p10: q(0.1), uses, boxes, edges,
    restarts: people.reduce((a, p) => a + p.restarts, 0) / (n || 1),
  };
}

/** ツリーどおりに n 人を 1 人ずつ打つ (木の設定 tune で打つ) */
export function runTree(data: PatchData, doc: TreeDoc, opts: TreeRunOpts): TreeRunResult {
  return withTreeTune(doc, () => runIn(data, doc, opts));
}
/**
 * 1 人回すごとに人数を返す形 (ルート精査が間に画面を返して「精査中 12/30」を出す、10-22 オーナー「ローディング画面を出さないとバグってるのか分からない」)。
 * 木の設定 (tune) は呼ぶ側が next() ごとに withTreeTune で包む (tree-check の checkTreeAsync)
 */
export function* runTreeSteps(data: PatchData, doc: TreeDoc, opts: TreeRunOpts): Generator<number, TreeRunResult> {
  const o = { price: opts.price, startCost: opts.startCost ?? 0, capDiv: opts.capDiv ?? 2000, capSteps: opts.capSteps ?? 20000, start: opts.start };
  const aims = opts.aims ?? aimsOf(doc);
  const shapes = shapesOf(doc);
  const rng = mulberry32(opts.seed);
  const people: Person[] = [];
  const every = Math.max(1, opts.every ?? 10);
  for (let i = 0; i < opts.n; i++) {
    const p = runOne(data, doc, aims, shapes, rng, o);
    people.push(p);
    opts.onPerson?.(p, i);
    if (opts.onProgress && (i + 1) % every === 0 && i + 1 < opts.n) opts.onProgress(summarize(doc, people, o.startCost));
    yield i + 1;
  }
  return summarize(doc, people, o.startCost);
}
function runIn(data: PatchData, doc: TreeDoc, opts: TreeRunOpts): TreeRunResult {
  const o = { price: opts.price, startCost: opts.startCost ?? 0, capDiv: opts.capDiv ?? 2000, capSteps: opts.capSteps ?? 20000, start: opts.start };
  const aims = opts.aims ?? aimsOf(doc);
  const shapes = shapesOf(doc);
  const rng = mulberry32(opts.seed);
  const every = Math.max(1, opts.every ?? 10);
  const people: Person[] = [];
  for (let i = 0; i < opts.n; i++) {
    const p = runOne(data, doc, aims, shapes, rng, o);
    people.push(p);
    opts.onPerson?.(p, i);
    if (opts.onProgress && (i + 1) % every === 0 && i + 1 < opts.n) opts.onProgress(summarize(doc, people, o.startCost));
  }
  return summarize(doc, people, o.startCost);
}
