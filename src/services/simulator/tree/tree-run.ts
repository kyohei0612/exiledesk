/**
 * tree-run.ts — クラフトの道 (ツリー) を n 人に 1 人ずつ打たせて、箱ごとの数字を出す (解析君、2026-10-23。入口の形 docs/org/math/notes/2026-10-23-tree-run.md、
 * 設計 docs/org/simulator/notes/2026-10-22-manual-sim-design.md の 4)。ワーカーと画面はシミュ部長、ここは純粋な計算だけ。
 *
 * 打つのは全部エンジンの入口 (applyCurrency / fillCatalyst)。結果の分け方は tree-sample.ts の outcomeOf・aimsOf (見本と同じ分け方)。
 * 繰り返し (当たるまで) は tree-sample の playHand と同じ流れを、個数を数えるためにここでたどる (playHand を変える時はここも合わせる)。
 */
import { mulberry32, type PatchData, type StageApply, type StageItem } from "../../craft-stage/engine";
import { isAimMod } from "./tree-aim";
import { aimOpts, aimsOf, handAims, holdDocSig, outcomeOf, playHandSteps, sampleOf, SPAM_CAP, startItemOf as startOf, targetsOf } from "./tree-sample";
import { boxOutcomeOf, essenceHold, passSameHi } from "./tree-outcome";
import { MATCH, outBoxOf, RESTART, splitTo, type SplitBox } from "./tree-shape";
import { withTreeTune } from "./tree-tune";
import { modText, tr } from "../../../i18n/lang";
import { nameOfKey } from "../../../state/for-share/craft-stage-shelf";
import { type Aim, type OutKind, type TreeDoc } from "./tree-model";
import { contentDiff, goalsOn, judgeMemo, nextAimed, startAimed, type Judge } from "./tree-judge";
import { routeOf } from "./tree-judge-link";
import { seenTo } from "./tree-foresee";
import { sureFracOn, sureFracture, useSureFrac } from "./tree-sure-frac";
import { defaultCapDiv } from "./run-price";

export interface TreeRunOpts {
  /** 人数 (裏は 100、確かめは 300) */
  n: number;
  /** 同じ seed なら同じ結果 */
  seed: number;
  /** 値段のキー → 神。無い物は 0 */
  price: (key: string) => number;
  /** 始めの形の値段 (神)。始まりの 1 回だけ払う */
  startCost?: number;
  /** 1 人の打ち止め (神、既定 = 相場の値段 (runPrice) なら鏡 2 個分、ほかは 2000。S-71・run-price の defaultCapDiv) */
  capDiv?: number;
  /** 1 人の手の上限 (既定 20000) */
  capSteps?: number;
  /** 狙いの札 (既定 = ツリーの当たりの箱の札、aimsOf)。分かれ目の箱だけで組んだツリーは当たりの箱が無いので渡す */
  aims?: Aim[];
  /** 始めのアイテム (既定 = sampleOf の始まり: レア + フラクチャーの指名) */
  start?: (rng: () => number) => StageItem;
  /**
   * 「当たるまで」(上限無し) の箱 (既定 = repeat.max の無い箱)。見張りの上限 (SPAM_CAP・精査の写しは 1,000) まで当たらなかった人は、形の合う箱へ回し直さずここで止まる
   * (抜けにくい形: 削減のお告げで満杯の側の入れ替えが続く等。前は形の合う同じ箱へ戻って打ち直し、1 人が数万回回って画面が止まった、10-25 モンキー 4 本目の 12 本)
   */
  untilHit?: ReadonlySet<string>;
  /** every 人ごとに途中の結果 */
  onProgress?: (r: TreeRunResult) => void;
  every?: number;
  /** 1 人終わるごとに、その人の通った箱 (順に、着いた時の費用) と終わり方。画面の「1 人目が木を進む」が読む (10-22) */
  onPerson?: (p: { end: End; at: string; cost: number; visits: readonly { box: string; cost: number; pass?: true }[]; why?: { reason: string; item: StageItem } }, i: number) => void;
  /** 手を打つ直前の箱とアイテム (照らしの台本が、箱に着いた実物ごとにエンジンの確率を出して比べる。シミュ 25 本目 10-25) */
  onHand?: (box: string, item: StageItem) => void;
  /**
   * 1 人の途中でも slice ms ごとに 1 回返す (runTreeSteps は同じ人数をもう一度返す)。最終チェックの 30 人回しと、合格の後の試しの 30 人 (use-tree-run の test) が使う (J 11-09、当たらない箱を 1,000 回打つ 1 人分で
   * 3.6 秒・試しの 30 人で 1 人 0.24 秒ずつ固まった)。100 人回しは 1 回目の next() で 1 人目が終わる前提なので渡さない。結果は渡しても同じ
   */
  slice?: number;
  /**
   * 乱数を「何人目 × どの箱」ごとの列にする (デイリー D-58b、11-11 オーナー「乱数同じの方が良いのやっぱり　この動きの後はこの乱数で統一的な」)。
   * 無ければ今までどおり全員で 1 本の列を使った順。ある時は 1 人目の箱 b12 の 3 回目は、ほかの箱の手を替えても同じ数を引く (始めの品・作り直しは "start" の列)
   */
  perBox?: boolean;
  /**
   * 完成の箱に着いた人の品を見て、完成に数えてよいかを返す (S-05b、デイリーが「お題の狙いを全部持つ品だけ完成」に使う)。
   * 無ければ今までどおり着いた人は全員完成。false の人はその箱の失敗と同じ数え (そこで終わり・費用は合計に入る・完成に数えない)、箱ごとの人数は結果の unmetAt
   */
  doneOk?: (item: StageItem, box: string) => boolean;
  /** 1 人目の挑戦 (S-72c、スイッチ firstTry): 100 人とは別にもう 1 人、失敗の箱でも作り直して完成まで回す。結果は firstTry に (100 人の数には入れない) */
  firstTry?: boolean;
}
/** 箱ごとの列 (perBox)。種・何人目・箱の名前を混ぜて 1 本ずつ作る */
function boxStreams(seed: number, i: number): (box: string) => () => number {
  const m = new Map<string, () => number>();
  return (box) => {
    let f = m.get(box);
    if (!f) {
      let h = 2166136261 ^ seed;
      for (const c of `${i}|${box}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
      m.set(box, (f = mulberry32(h >>> 0)));
    }
    return f;
  };
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
  /** 失敗 (ここで終わり) の箱で止めた人の数と箱ごとの数  */
  failed: number;
  failAt: Record<string, number>;
  /** 完成の箱に着いたが doneOk が false を返した人の箱ごとの数 (failed・failAt にも入っている。doneOk を渡さない時は空) */
  unmetAt: Record<string, number>;
  /** 手が打てずに止まった箱の、最初の 1 人の理由・着いた形・通った戻りの箱 (古い順、重ねない)。精査がどの外れ・どの戻りが元かを出す (10-22) */
  stuckWhy: Record<string, { reason: string; /** 止まり方の 1 行の要約 (10 種、11-08。詳しい文は reason) */ short?: string; item: StageItem; backs: string[]; /** 着いてから形の合う箱へ移った時の、着いた箱 (古い順) */ moved?: string[]; noBox?: boolean; /** 当たるまでを この回数打っても当たらずに止まった (untilHit) */ spam?: number }>;
  /** 打ち止めの人が最後の方で一番多く通った箱 (輪から出られない所。穴チェックの走行の「どこでループしたか」、10-27 オーナー) */
  loopAt: Record<string, number>;
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
  /** 回した時のベースの値段 (神) と、人ごとの費用・作り直しの回数・完成したか (ベースの値段を替えた時に回し直さず足し直す、withStartCost) */
  startCost: number;
  persons: Array<{ cost: number; restarts: number; done: boolean }>;
  /** 1 人目の挑戦 (S-72c、opts.firstTry の時だけ): 終わり方・費用・作り直しの回数 */
  firstTry?: { end: End; cost: number; restarts: number };
}

export type End = "done" | "capped" | "stuck" | "failed";
interface Person { /** 止まりの付け先 (体の違う人を送り出した ↩ の箱・移した箱、スイッチ bodyStrict) */ blame?: string; /** 完成の箱で doneOk が false (失敗と同じ数え) */ unmet?: true; end: End; cost: number; at: string; visits: { box: string; cost: number; pass?: true }[]; uses: Record<string, number>; restarts: number; odd: Set<string>; why?: { reason: string; short?: string; item: StageItem; noBox?: boolean; spam?: number } }

const startItemOf = (data: PatchData, doc: TreeDoc, rng: () => number): StageItem => startOf(data, doc, rng).item;
/** 止まった人のアイテム → その時の ☑ */
const STOP_AIMED = new WeakMap<StageItem, ReadonlySet<string>>();
/** 止まりの記録 (stuckWhy) のアイテムの人の ☑ (分からなければ null) */
export const stopAimedOf = (item: StageItem): ReadonlySet<string> | null => STOP_AIMED.get(item) ?? null;


/** 輪の 1 周の記録 (手の費用か来訪。同じ順に足し直して、1 手ずつ回した時と同じ費用・来訪にする) */
type LoopOp = { box: string; pass?: true } | { key: string; n: number };
function* runOne(data: PatchData, doc: TreeDoc, aims: readonly Aim[], j: Judge, rng0: () => number, pick: ((box: string) => () => number) | null, o: Required<Pick<TreeRunOpts, "price" | "startCost" | "capDiv" | "capSteps" | "untilHit" | "slice">> & Pick<TreeRunOpts, "start" | "onHand" | "doneOk"> & { retryFail?: boolean }): Generator<void, Person> {
  // 輪の早送り (S-71b): 乱数を引かない手だけで同じ箱・同じアイテム・同じ狙いへ戻ったら、この先は同じ周回しか起きないので、残りの周は打たずに記録だけ足す
  const light = !o.onHand;
  let rolls = 0, seenRolls = -1;
  // 引く列 (perBox の時は箱ごと、無ければ全員で 1 本)。輪の早送りは引いた回数 rolls で見るので、どの列から引いても数える
  const rngOf = (box: string): (() => number) => { const f = pick ? pick(box) : rng0; return light ? (): number => { rolls++; return f(); } : f; };
  const rng = rngOf("start");
  const seen = new Map<string, { at: number; steps: number; cost: number }>();
  let ops: LoopOp[] = [];
  let item = o.start ? o.start(rng) : startItemOf(data, doc, rng);
  // この人の ☑ で付いた狙い (tree-judge。当たりの箱に着いたらその札、消えたら外れる)
  let aimed: ReadonlySet<string> = startAimed(data, doc, item);
  const arrive = (box: string, it: StageItem, was?: StageItem): void => { aimed = nextAimed(data, doc, aimed, box, it, was); };
  let cost = o.startCost;
  const uses: Record<string, number> = {};
  const visits: Person["visits"] = [];
  const use = (key: string, n = 1): void => { uses[key] = (uses[key] ?? 0) + n; cost += o.price(key) * n; if (light) ops.push({ key, n }); };
  const visit = (box: string, pass?: true): void => { visits.push(pass ? { box, cost, pass } : { box, cost }); if (light) ops.push(pass ? { box, pass } : { box }); };
  /** 周回の記録を捨てる (乱数を引いた・作り直しのように費用を直に足した) */
  const forget = (): void => { seen.clear(); ops = []; };
  let at = "start";
  // 止まりの付け先 (S-72、スイッチ bodyStrict): 体 (外れの側・数) の違う人を ↩ で送り出した箱・形の合う箱へ移した箱。止まったらそこに数える
  // (10-29 オーナー「なんか止まり方が戻った先で止まるんだよな。結果を選んでその結果にしたがってるだけなのに」)
  let blame: string | null = null;
  const fin = (p: Person): Person => {
    // 止まった人の ☑ (止まりの文の外れの数え、tree-check の stuckText)。結果の形 (見張りの JSON) は変えない
    if (p.end === "stuck" && p.why) STOP_AIMED.set(p.why.item, aimed);
    return blame && p.end === "stuck" ? { ...p, blame } : p;
  };
  /** 付いている名前の印になりうる MOD (箱の中身の鍵と同じ口 goalsOn。前は完成形の狙いだけで、行き先探しの前にエッセンス / 合金の印が落ちた) */
  const aimsHeld = (it: StageItem): ReadonlySet<string> => goalsOn(data, doc, it);
  let steps = 0;
  let restarts = 0;
  const odd = new Set<string>();
  // back だけで回り続ける形 (back の輪) の見張り
  let hops = 0;
  // 細切れ (slice): 1 人の途中でも o.slice ms ごとに画面へ返す (J 11-09)。打つ順・乱数は変えない
  let t0 = o.slice ? performance.now() : 0;
  for (;;) {
    if (o.slice && performance.now() - t0 > o.slice) { yield; t0 = performance.now(); }
    const b = doc.boxes[at];
    if (!b) return fin({ end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: STOP.noBox(), short: STOP.noBox(), item } });
    visit(at);
    // 完成の印は "main" だけ (前の版の妥協 "compromise" は未完成 = 印の無い箱として先へ読む)。
    // 失敗 (ここで終わり) の箱: そこで止める。止まり (行き先未定) とは別に数える 
    if (b.done === "fail" && !o.retryFail) return fin({ end: "failed", cost, at, visits, uses, restarts, odd });
    // 1 人目の挑戦 (S-72c): 失敗の箱でもスタートから作り直す (作り直しの手 RESTART と同じ数え)。打ち切りは打ち止めの上限
    if (b.done === "fail") { item = o.start ? o.start(rng) : startItemOf(data, doc, rng); aimed = startAimed(data, doc, item); cost += o.startCost; forget(); restarts++; at = "start"; if (++steps > o.capSteps || cost > o.capDiv) return fin({ end: "capped", cost, at, visits, uses, restarts, odd }); continue; }
    if (b.done === "main") {
      if (o.doneOk && !o.doneOk(item, at)) return fin({ end: "failed", unmet: true, cost, at, visits, uses, restarts, odd });
      // 完成の箱に着いた人はそのまま完成 (狙いの数え直しはしない、S-05。完成形の品質は指標なので見ない = S-205、11-07 オーナー「完成形はあくまでも指標」)。
      // 完成のアイテムも残す (台本で完成図を出す。止まりの集計 stuckWhy には入れない)
      return fin({ end: "done", cost, at, visits, uses, restarts, odd, why: { reason: tr("完成", "Done"), item } });
    }
    const sb = b as SplitBox;
    if (sb.split) {
      if (++hops > 1000) return fin({ end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: STOP.loop(), short: STOP.loop(), item } });
      const to = splitTo(data, sb.split, item, aims);
      if (!to) return fin({ end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: STOP.split(), short: STOP.split(), item } });
      at = to;
      continue;
    }
    if (b.back) {
      if (++hops > 1000) return fin({ end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: STOP.loop(), short: STOP.loop(), item } });
      if (b.back === RESTART) {
        item = o.start ? o.start(rng) : startItemOf(data, doc, rng);
        aimed = startAimed(data, doc, item);
        cost += o.startCost;
        forget();
        restarts++;
        at = "start";
        continue;
      }
      // 全部消えてよい消去の直線は、止まる所 (同じレアリティ・同じ外れの数の箱) が無ければ形の合う箱を探さない = 行き先未定 (スイッチ stripRarity)
      const to = routeOf(data, doc, j, b.back === MATCH ? null : b.back, item, aimed);
      // 戻り先と中身が違い、中身の同じ箱も無い (S-64、人と箱): この箱で止まる (未設定)
      if (!to && b.back !== MATCH) return fin({ end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: tr(`戻り先の箱と中身が違い、中身の同じ箱も無い`, `The return target holds a different item, and no box matches it`), short: STOP.backDiff(), item, noBox: true } });
      if (!to) return fin({ end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: tr("戻り先の「形の合う箱」が無い", "No box matches the shape to return to"), short: STOP.noBack(), item, noBox: true } });
      // 戻り先に着いてから形の合う箱へ移った時も、結果の箱と同じく戻り先の来訪を pass で残す (moved に数える)
      if (b.back !== MATCH && to !== b.back) visit(b.back, true);
      if (to !== b.back) blame = at;
      at = to;
      continue;
    }
    if (!b.hand) {
      // 決めていない箱で止まった人の原因はその箱 (決めれば進む。前に移った箱を原因にしない、S-72)
      blame = null;
      return fin({ end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: tr("次の手・戻り先が無い", "No next craft or return"), short: STOP.open(), item, noBox: true } });
    }
    // 打ち止めの時のアイテムも残す (台本で輪から抜けない理由を見る。止まりの集計 stuckWhy には入れない)
    if (++steps > o.capSteps || cost > o.capDiv) return fin({ end: "capped", cost, at, visits, uses, restarts, odd, why: { reason: tr("打ち止め", "Capped"), item } });
    hops = 0;
    if (light) {
      if (rolls !== seenRolls) { seenRolls = rolls; forget(); }
      else {
        const key = `${at}|${[...aimed].sort().join()}|${JSON.stringify(item)}`, was = seen.get(key);
        if (!was) seen.set(key, { at: ops.length, steps, cost });
        else {
          const one = ops.slice(was.at), len = steps - was.steps, dc = cost - was.cost;
          forget();
          // 上限に届く手前まで足す。端数の周は下で普通に打つ
          while (len > 0 && steps + len < o.capSteps && cost + dc <= o.capDiv) {
            for (const x of one) if ("key" in x) use(x.key, x.n); else visit(x.box, x.pass);
            steps += len;
          }
        }
      }
    }
    const before = item;
    const tried = uses[b.hand.currency] ?? 0, own = handAims(doc, at, aims);
    o.onHand?.(at, item);
    // 使った物は結果の箱を見てから数える (ヒネコラのハズレの箱 = 手を使わない、S-39)
    const spent: Array<[string, number]> = [];
    // 打たないエッセンス / 合金 (飛ばす / 塞がる、S-33e): 手を使わず品のまま、boxOutcomeOf が当たり / 塞がったの箱へ分ける。前は「打てません」で止まった
    // デイリーの確定フラクチャー (D-03): ✦ の MOD が固定された品、使う物は 3 回分
    const sure = sureFracOn(doc, b.hand) ? sureFracture(data, doc, item, b.hand) : null;
    if (sure) useSureFrac(b.hand, (k, n) => { spent.push([k, n]); });
    const r: StageApply = sure ?? (essenceHold(data, item, b.hand.currency) ? { applied: true, item, added: [], removed: [] } : yield* playHandSteps(data, item, b.hand, pick ? rngOf(at) : rng, own, (k, n = 1) => { spent.push([k, n]); }, o.slice));
    if (!r.applied) {
      return fin({ end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: r.reason ?? "", short: STOP.cantUse(r.reason ?? ""), item } });
    }
    const oc = sb.next ? null : boxOutcomeOf(data, doc, b, before, r.item, aims, aimed);
    const next = oc ? outBoxOf(data, doc, b, oc, r.item) : null;
    // 予見で当たり以外が見えた人: 手を使わず、アイテム・☑・費用は持つ前のまま、まとめたハズレ箱の手へ (S-39)
    if (next && doc.boxes[next]?.seen && !b.hand.repeat) { const to = seenTo(doc, next); if (to !== next) visit(next, true); at = to; continue; }
    for (const [k, n] of spent) use(k, n);
    const cap = b.hand.repeat?.max ?? SPAM_CAP;
    if (o.untilHit.has(at) && (uses[b.hand.currency] ?? 0) - tried >= cap && outcomeOf(data, before, r.item, own, b.hand.currency).out !== "hit") {
      return fin({ end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: tr(`当たるまでを ${cap} 回打っても当たらない (この形からは狙いが付きにくい・付かない)`, `No hit in ${cap} repeats (the target is unlikely or impossible from this item)`), short: STOP.spam(cap), item: r.item, spam: cap } });
    }
    if (sb.next || !oc) { item = r.item; arrive(sb.next!, item, before); at = sb.next!; continue; } // oc は sb.next の無い時だけある
    if (!next) {
      // 合う結果の箱が無い (10-22 ブラック「1 箱にした手で別の結果が出た時に黙って止まらない」): 形の合う箱があればそこへ、無ければ止まり。どちらも想定外として数える
      odd.add(at);
      aimed = new Set([...aimed].filter((id) => aimsHeld(r.item).has(id)));
      const to = routeOf(data, doc, j, null, r.item, aimed);
      if (!to) return fin({ end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: tr(`この手の結果「${outcomeText(data, r.item, oc)}」の箱が無く、形の合う箱も無い`, `No box for this craft's result "${outcomeText(data, r.item, oc)}", and no box matches the shape`), short: STOP.noOut(outcomeText(data, r.item, oc)), item: r.item, noBox: true } });
      item = r.item;
      at = to;
      continue;
    }
    item = r.item;
    // 結果の箱には一度着いてから形の合う箱へ移る (着いた数と線に入れる。前は飛ばして、当たりの箱が「来た人 0」・照らしで当たり 0% になった、10-24 モンキー m-602・指輪 b11)
    // 結果の箱の中身と違えば中身の同じ箱へ (S-64)。無ければ結果の箱で止まる (未設定)
    arrive(next, item, before);
    const to = routeOf(data, doc, j, next, item, aimed);
    if (!to) { visits.push({ box: next, cost }); return fin({ end: "stuck", cost, at: next, visits, uses, restarts, odd, why: { ...otherShapeText(data, doc, at, next, item, aimed), item, noBox: true } }); }
    if (to !== next) { visit(next, true); blame = next; item = passSameHi(data, doc, b, next, to, item); }
    at = to;
  }
}

/** 手の結果の名前 (止まりの文。当たりは付いた MOD の文) */
/** 箱の呼び名「n 段目の外れ」(止まりの文の来た道。段は深さ、S-141) */
const BOX_WORD: Partial<Record<OutKind | "start", [string, string]>> = { start: ["スタート", "start"], hit: ["当たり", "hit"], any: ["打った後", "result"], junk: ["外れ", "miss"], junkGone: ["外れが消えた", "miss removed"], lost: ["狙いが消えた", "target lost"], pass: ["品質の後", "after quality"], branch: ["分かれ目", "branch"] };
function boxWord(doc: TreeDoc, id: string): string {
  let n = 0;
  for (let b = doc.boxes[id]; b?.parent; b = doc.boxes[b.parent]) n++;
  const w = BOX_WORD[doc.boxes[id]?.out ?? "start"] ?? ["箱", "box"];
  return tr(`${n + 1} 段目の「${w[0]}」`, `step ${n + 1} "${w[1]}"`);
}
/**
 * 手の結果が結果の箱の見本と違う形で、同じ形の箱も無くて止まった人の文 (S-64): 元の手の箱を名指しし、次に押す物まで書く
 */
function otherShapeText(data: PatchData, doc: TreeDoc, from: string, to: string, item: StageItem, aimed: ReadonlySet<string>): { reason: string; short: string } {
  // 名前は品で引く (骨は部位で名前が変わる。品が無いと鍵「desecrate_ancient」のまま出た、要望 b3956330)
  const h = doc.boxes[from]?.hand, name = h ? nameOfKey(h.currency, item) : "";
  // 違う所は判定 (fitsItem) と同じ部品から (tree-judge の contentDiff)。言えない時だけ前の側の数
  const diff = contentDiff(data, doc, item, aimed, to);
  const s = diff.length ? null : sampleOf(data, doc, to, 1), ja = (it: StageItem): string => `プレ ${it.prefixes.length}・サフィ ${it.suffixes.length}`, en = (it: StageItem): string => `${it.prefixes.length} prefix, ${it.suffixes.length} suffix`;
  const whyJa = s ? `見本 ${ja(s.item)}・この人 ${ja(item)}` : `違う所: ${diff.join("・")}`, whyEn = s ? `example ${en(s.item)}, this run ${en(item)}` : `differs: ${diff.join(", ")}`;
  const reason = tr(`${boxWord(doc, from)}の手「${name}」の後に、${boxWord(doc, to)}の見本と形の違う人がいる (${whyJa})。この形の箱が木に無い。次に押す物: ${boxWord(doc, from)}の手を替えるか、同じ形の箱に手を決める (手を決めると、この人はその箱へ進む)`,
    `After "${name}" at ${boxWord(doc, from)}, some runs differ from the example at ${boxWord(doc, to)} (${whyEn}). No box has this shape. Next: change the craft at ${boxWord(doc, from)}, or give a box of the same shape a craft (this run then moves there)`);
  return { reason, short: STOP.shape(diff[0] ?? (s ? tr(`見本 ${ja(s.item)}・この人 ${ja(item)}`, `example ${en(s.item)}, this run ${en(item)}`) : "")) };
}
/**
 * 止まり方の 1 行の要約 (10 種、11-08 オーナー「普通に日本語がいみわからんな要約の」→ 前の部長の案に「それでおｋ」)。
 * 何が起きたかだけを短く。詳しい文 (reason) は開いた時に出す。中身の違いは 1 つ目だけ
 */
export const STOP = {
  open: (): string => tr("次の手が決まっていません", "No next step yet"),
  cantUse: (why: string): string => (why ? tr(`打てません: ${why}`, `Can't use the craft: ${why}`) : tr("打てません", "Can't use the craft")),
  spam: (n: number): string => tr(`${n} 回打っても当たりません`, `No hit in ${n} tries`),
  noOut: (out: string): string => tr(`この結果 (${out}) の行き先がありません`, `No box for this result (${out})`),
  shape: (first: string): string => (first ? tr(`行き先と中身が違います (${first})`, `The next box holds a different item (${first})`) : tr("行き先と中身が違います", "The next box holds a different item")),
  backDiff: (): string => tr("戻り先と中身が違います", "The return target holds a different item"),
  noBack: (): string => tr("戻れる箱がありません", "No box to return to"),
  loop: (): string => tr("戻りがぐるぐる回っています", "The returns go round in a loop"),
  split: (): string => tr("分かれ目のどの行にも合いません", "No split row matches"),
  noBox: (): string => tr("行き先の箱がありません", "The next box is missing"),
};
/**
 * 止まった人の形と来た道 (10-29 オーナー「これで何で止まるんか不明」): この人の MOD (✦ 付き) と、通った戻り (↩) と、着いてから形の合う箱へ移った箱。
 * 精査の一覧と止まりの札の乗せた時の文が使う
 */
export function stuckDetail(doc: TreeDoc, w: { item: StageItem; backs: readonly string[]; moved?: readonly string[] }): string {
  const mods = [...w.item.prefixes, ...w.item.suffixes].map((m) => `${m.side === "prefix" ? "P" : "S"} ${modText(m)}${m.fractured ? " ✦" : ""}`).join(" / ");
  const way = [...w.backs.map((id) => `↩ ${boxWord(doc, id)}`), ...(w.moved ?? []).map((id) => tr(`${boxWord(doc, id)} から移った`, `moved from ${boxWord(doc, id)}`))];
  return tr(`この人の MOD: ${mods || "無し"}${way.length ? `。来た道: ${way.join("・")}` : ""}`, `This run's mods: ${mods || "none"}${way.length ? `. Path: ${way.join(", ")}` : ""}`);
}
const OUT_TEXT: Partial<Record<OutKind, [string, string]>> = { junk: ["外れ", "Miss"], junkGone: ["外れが消えた", "Miss removed"], lost: ["狙いが消えた", "Target lost"] };
function outcomeText(data: PatchData, item: StageItem, oc: { out: OutKind; hits: Aim[] }): string {
  if (oc.out !== "hit") { const n = OUT_TEXT[oc.out]; return n ? tr(n[0], n[1]) : oc.out; }
  const mods = [...item.prefixes, ...item.suffixes];
  const names = oc.hits.map((a) => { const t = targetsOf(data, [a]), m = mods.find((x) => isAimMod(x, t, aimOpts(data))); return m ? modText(m) : a.modId; });
  return tr(`当たり ${names.join("・")}`, `Hit ${names.join(", ")}`);
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
  const stuckAt: Record<string, number> = {}, failAt: Record<string, number> = {};
  const unmetAt: Record<string, number> = {};
  for (const p of people) if (p.end === "failed") { failAt[p.at] = (failAt[p.at] ?? 0) + 1; if (p.unmet) unmetAt[p.at] = (unmetAt[p.at] ?? 0) + 1; }
  const stuckWhy: TreeRunResult["stuckWhy"] = {};
  // 止まりは流れ着いた先でなく原因の箱 (体の違う人を ↩ で送り出した箱・移した箱) に付ける (S-72、スイッチ bodyStrict)
  for (const p of people) if (p.end === "stuck" && p.blame && p.blame !== p.at && p.why) p.why = { ...p.why, reason: tr(`ここから外れの側・数の違う人が先へ進み、${boxWord(doc, p.at)}で止まる: ${p.why.reason}`, `Runs with different misses go on from here and stop at ${boxWord(doc, p.at)}: ${p.why.reason}`) };
  for (const p of people) if (p.end === "stuck" && p.blame && p.blame !== p.at) p.at = p.blame;
  for (const p of people) if (p.end === "stuck") { stuckAt[p.at] = (stuckAt[p.at] ?? 0) + 1; if (p.why && !stuckWhy[p.at]) stuckWhy[p.at] = { ...p.why, backs: [...new Set(p.visits.map((v) => v.box).filter((id) => doc.boxes[id]?.back))], moved: [...new Set(p.visits.filter((v) => v.pass).map((v) => v.box))] }; }
  const loopAt: Record<string, number> = {};
  for (const p of people) {
    if (p.end !== "capped") continue;
    const tally = new Map<string, number>();
    for (const v of p.visits.slice(-200)) tally.set(v.box, (tally.get(v.box) ?? 0) + 1);
    const top = [...tally].sort((a, z) => z[1] - a[1])[0]?.[0];
    if (top) loopAt[top] = (loopAt[top] ?? 0) + 1;
  }
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
    stuckAt, failed: people.filter((p) => p.end === "failed").length, failAt, unmetAt, stuckWhy, loopAt, unexpected, moved, perItem,
    meanFinished: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : NaN,
    median: q(0.5), p90: q(0.9), p10: q(0.1), uses, boxes, edges,
    restarts: people.reduce((a, p) => a + p.restarts, 0) / (n || 1),
    startCost, persons: people.map((p) => ({ cost: p.cost, restarts: p.restarts, done: p.end === "done" })),
  };
}

/**
 * ベースの値段を替えた時に回し直さず数字だけ足し直す (10-25 オーナー「ベースの値段設定したら普通に回しなおさなくてもそのまま追加したらいいのでは」)。
 * 1 人の費用 = 手の費用 + ベースの値段 × (1 + 作り直しの回数)。
 * 1 個・平均・中央・安い / 高い 10% を出し直す。箱ごとの来た時の費用は、着く前の作り直しを数えていないので、ベースの値段 1 個分だけずらす。
 * 打ち止め (神の上限) の判定は回した時の値段のまま
 */
export function withStartCost(r: TreeRunResult, startCost: number): TreeRunResult {
  const d = startCost - r.startCost;
  if (!d || !r.persons) return r;
  const persons = r.persons.map((p) => ({ ...p, cost: p.cost + d * (1 + p.restarts) }));
  const total = persons.reduce((a, p) => a + p.cost, 0);
  const costs = persons.filter((p) => p.done).map((p) => p.cost).sort((a, b) => a - b);
  const q = (p: number): number => (costs.length ? costs[Math.min(costs.length - 1, Math.floor(p * costs.length))]! : NaN);
  const boxes: Record<string, BoxStat> = {};
  for (const [id, b] of Object.entries(r.boxes)) boxes[id] = { ...b, costIn: b.visits ? b.costIn + d : b.costIn };
  return {
    ...r, startCost, persons, boxes,
    perItem: r.finished ? total / r.finished : NaN,
    meanFinished: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : NaN,
    median: q(0.5), p90: q(0.9), p10: q(0.1),
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
  const untilHit = opts.untilHit ?? new Set(Object.values(doc.boxes).filter((b) => b.hand?.repeat && b.hand.repeat.max == null).map((b) => b.id));
  const o = { price: opts.price, startCost: opts.startCost ?? 0, capDiv: opts.capDiv ?? defaultCapDiv(opts.price), capSteps: opts.capSteps ?? 20000, start: opts.start, untilHit, onHand: opts.onHand, slice: opts.slice ?? 0, doneOk: opts.doneOk };
  const aims = opts.aims ?? aimsOf(data, doc);
  const j = judgeMemo(data, doc);
  const rng = mulberry32(opts.seed);
  const people: Person[] = [];
  const every = Math.max(1, opts.every ?? 10);
  for (let i = 0; i < opts.n; i++) {
    // 細切れの時は 1 区切りごとに holdDocSig で包む (覚えは捨てて作り直すだけ = 結果は同じ)。無ければ今までどおり 1 人を一気に
    const g = runOne(data, doc, aims, j, rng, opts.perBox ? boxStreams(opts.seed, i) : null, o);
    let p: Person;
    if (!o.slice) p = holdDocSig(doc, () => { for (;;) { const s = g.next(); if (s.done) return s.value; } });
    else for (;;) { const s = holdDocSig(doc, () => g.next()); if (s.done) { p = s.value; break; } yield i; }
    people.push(p);
    opts.onPerson?.(p, i);
    // 止まった人は間引いても必ず知らせる (画面はその時点の止まりの箱で止める)
    if (opts.onProgress && ((i + 1) % every === 0 || p.end === "stuck") && i + 1 < opts.n) opts.onProgress(summarize(doc, people, o.startCost));
    yield i + 1;
  }
  const out = summarize(doc, people, o.startCost);
  if (opts.firstTry) {
    // 1 人目の挑戦 (S-72c): 100 人とは別の乱数の列で 1 人 (100 人の数は変えない)
    const g = runOne(data, doc, aims, j, mulberry32((opts.seed ^ 0x9e3779b9) >>> 0), opts.perBox ? boxStreams(opts.seed, -1) : null, { ...o, slice: 0, retryFail: true });
    const p = holdDocSig(doc, () => { for (;;) { const s = g.next(); if (s.done) return s.value; } });
    out.firstTry = { end: p.end, cost: p.cost, restarts: p.restarts };
  }
  return out;
}
function runIn(data: PatchData, doc: TreeDoc, opts: TreeRunOpts): TreeRunResult {
  const g = runTreeSteps(data, doc, opts);
  let s = g.next();
  while (!s.done) s = g.next();
  return s.value;
}
