/**
 * tree-shape.ts — ツリーの形合わせの残り (分かれ目・結果の箱・道の狙いの組・まとめ)。tree-run.ts から分けた (シミュ部長 25 本目、2026-10-25、1 ファイル 500 行まで)。
 * 回す所 (tree-run)・精査 (tree-check)・配置 (tree-frame)・画面が同じ物を読む。
 * 箱の比べ (行き先・つなぎ・まとめ) は tree-judge の judgeMemo 1 本 (S-50b)。前の世代の形の鍵の判定 (shapesOf・matchBox・settle・matchItem・matchTargets・linkSameShape と、
 * その下の形の鍵・体の比べ) は、台本 2 本 (_tree-patterns-ui・_tree-autolink-probe) を今の判定 (applyPick・runTree) へ移したので 11-07 に消した
 */
import { parseKey, type PatchData, type StageItem } from "../../craft-stage/engine";
import { missAims } from "./tree-miss";
import { sameAim } from "./tree-hand-core";
import { aimHeldOn, junkOf } from "./tree-aim";
import { effectOf } from "./tree-hands";
import { essenceBoxFits } from "./tree-sample";
import { judgeMemo } from "./tree-judge";
import { pruneByContent } from "./tree-judge-link";
import { aimKey, keepCut, MATCH_BACK, type Aim, type OutKind, type SplitRange, type SplitRule, type SplitWhen, type TreeBox, type TreeDoc, boxAims, drop, subtree } from "./tree-model";

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
/** エッセンスの手の鍵の MOD (読みはエンジンの parseKey。ブリーチは null) */
const essenceModIdOf = (key: string): string | null => { const k = parseKey(key); return k.type === "essence" ? k.modId : null; };
export function splitTo(data: PatchData, rules: readonly SplitRule[], item: StageItem, aims: readonly Aim[]): string | null {
  const held = new Set(aims.filter((a) => aimHeldOn(data, item, a, { sameText: true })).map(aimKey));
  const junk = junkOf(item, missAims(data, aims));
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
 * 箱の道の札の組 (始まりから親をたどった当たりの札、aimKey)。「どれか」の当たりの箱 (anyOf、同じ側の狙いのどれか 1 つ) を通ると、
 * どれが付いたかで組が分かれる (10-26)。組は 64 で打ち切る
 */
/**
 * 形に数える当たりの札 : 完成の狙い (memoAims) にある物だけ。エッセンス・冒涜で付いた狙いでない MOD は外れ MOD と同じで形に数えない
 * (10-27 昼オーナー「指定 (☑) の MOD 以外はいらない MOD なので、何が付いても外れ MOD として付ける形」、メモ feedback-unchecked-is-junk と同じ)。完成の狙いが無い木は今まで通り全部
 */
function hitKeys(doc: TreeDoc, c: TreeBox): string[] {
  const ks = boxAims(c).map(aimKey);
  const goals = doc.memoAims ?? [];
  if (!goals.length) return ks;
  const g = new Set(goals.map(aimKey));
  return ks.filter((k) => g.has(k));
}
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
      // 強化のエッセンスを打つとスピリットが消えてグローバル防御が付くのに、狙い 0 の形に見えて始まりへ戻り、エッセンスを持ったまま回って止まった)
      const essKey = p?.hand && effectOf(p.hand.currency) === "essence" ? essenceModIdOf(p.hand.currency) : null;
      const ess = p?.hand && effectOf(p.hand.currency) === "essence"
        ? p.outs.map((o) => doc.boxes[o]).find((x) => x?.out === "hit" && x.aim)?.aim ?? (doc.memoAims ?? []).find((g) => g.modId === essKey)
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
  // (10-27 夕モンキー 2)
  const fb = doc.boxes[from], fp = fb?.parent ? doc.boxes[fb.parent] : undefined;
  if (fb?.autoBack && fp?.hand && effectOf(fp.hand.currency) === "remove" && fp.hand.keep && !fp.hand.keep.length) return true;
  const t = doc.boxes[to];
  if (!t || t.split) return true;
  const key = (h: string[]): string => [...h].sort().join(",");
  const there = new Set(heldSets(doc, to).map(key));
  return heldSets(doc, from).every((h) => there.has(key(h)));
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

/** 手の結果 (outcomeOf) に合う結果の箱 (回す時と精査で同じ)。any = 狙い無しの手の「打った後」、pass = 品質だけ上げた後 */
/** after = 打った後のアイテム (無限のエッセンスで当たりの箱が 2 つ以上の時、付いた MOD の箱を選ぶ。無ければ 1 つ目) */
export function outBoxOf(data: PatchData, doc: TreeDoc, b: TreeBox, oc: { out: OutKind; hits: Aim[]; junkKey?: string }, after?: StageItem): string | undefined {
  // 行き先の箱が無い結果を外れなどへ自動で寄せない (オーナー 10-26「ツリーは全ての結果を表示してそれをどう処理するかは当人が決めれるように」)。精査の unexpected で知らせ、箱を足す・まとめるは人が決める
  return outBoxOfRaw(data, doc, b, oc, after);
}
function outBoxOfRaw(data: PatchData, doc: TreeDoc, b: TreeBox, oc: { out: OutKind; hits: Aim[]; junkKey?: string }, after?: StageItem): string | undefined {
  // 外れの枝が側と種類で分かれている時は鍵の合う箱 (狙い無しの乱数のフラクチャー、スイッチ fracPick。外れ・打った後・外れが消えたの側 = S-65)。
  // 鍵の合う箱が無ければ (前の版の 1 箱の外れ、見本で出なかった側) 今までどおり種類の合う箱
  // 狙いが消えたの箱も側の鍵を持つので (S-71g)、外れの人を同じ鍵の狙いが消えたの箱へ入れない
  if (oc.junkKey) { const k = b.outs.find((id) => doc.boxes[id]?.junkKey === oc.junkKey && (oc.out !== "lost" || doc.boxes[id]?.out === "lost") && (oc.out === "lost" || doc.boxes[id]?.out !== "lost") && (oc.out !== "hit" || !oc.hits.length || (doc.boxes[id]?.out === "hit" && boxAims(doc.boxes[id]!).some((x) => oc.hits.some((a) => sameAim(data, a, x)))))); if (k) return k; }
  // 種類がぴったり合う箱を先に (打った後の箱と狙いが消えたの箱が並ぶ時、狙いが消えた人を打った後へ入れない。10-25 起こりうる結果の箱 possibleOutsOf)
  // まとめた結果の箱 (mergedOuts) はまとめた種類も受ける (10-26)
  // 「エッセンスと同じ MOD」の 2 つの箱 (低い段 / 同格以上の鍵 hi、S-33e) は鍵まで合わせる
  const exact = b.outs.find((id) => { const c = doc.boxes[id]; return !!c && (c.out === oc.out || !!c.mergedOuts?.includes(oc.out)) && c.out !== "hit" && (c.out !== "blocked" || (c.junkKey ?? "") === (oc.junkKey ?? "")); });
  if (exact) return exact;
  return b.outs.find((id) => {
    const c = doc.boxes[id];
    if (!c || (c.out !== oc.out && c.out !== "any" && c.out !== "pass")) return false;
    // 打った後・品質の後の箱はどの結果も受ける (狙い無しの手で狙いが付いても。前は当たりだと狙いを見て外れ、精査の「結果の箱に無い結果」・回しの止まりになった、10-22 靴・手袋)
    // ただし完成の狙いが新しく付いた人は受けない (当たりの箱へ。無ければ行き先が無い = 精査で出す。10-26 オーナー「当たってたら次の回に消去でそれ決めるんやからおかしい」。
    // 前は狙い無しの手の打った後に狙い持ちも入り、次のカオスに「狙いが消えた」が並んだ)。エッセンスの打った後 (付く MOD が狙いに無い) は hits が空なのでそのまま
    if (c.out === "any" || c.out === "pass") return oc.out !== "hit" || !oc.hits.length;
    // エッセンスの当たりの箱は 1 つ (付く MOD は必ず付く)。付く MOD が完成の狙いに無い時は hits が空でもこの箱 (tree-sample の outcomeOf)
    if (oc.out === "hit" && b.hand && effectOf(b.hand.currency) === "essence") return !after || essenceBoxFits(data, doc, b, c, after);
    // 「どれか」の当たりの箱は、その一覧のどれかが付いたら (anyOf、10-26)
    return oc.out !== "hit" || boxAims(c).some((x) => oc.hits.some((a) => sameAim(data, a, x)));
  });
}

/**
 * 保存してある自動の ↩ (再挑戦・外れが消えたの戻り・まとめなど、autoBack) のうち、体 (外れの側・種類・数) が同じと分からない物を外す = 未設定の箱に戻す
 * (S-50、スイッチ bodyStrict。前の版の木・見本が変わった木の古いつなぎ)。人が付けた ↩ は触らない。外したら true
 */
export function pruneBacks(data: PatchData, doc: TreeDoc): boolean {
  // 見直しも「箱どうし」の判定 (S-50b)
  return pruneByContent(doc, judgeMemo(data, doc));
}
