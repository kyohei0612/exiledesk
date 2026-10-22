/**
 * tree-check.ts — ルート精査 (2026-10-22 オーナー「今どこで止まるのか、今の状態で付くのかをチェック。5 人を回して、カオススパム設定なら 1 発で付く前提で
 * 動いて全パターン検出。穴がある所をエラー表記で」)。費用は出さない。打つのは全部エンジン (tree-sample の playHand → applyCurrency)。
 *
 * 辿り方: 5 人それぞれ、始まりから箱の手をエンジンで打ち、矢印の先の結果の箱を全部 (当たり・外れ・消えた) 順に 1 回ずつ通す
 * (その結果が出るまで打ち直す。乱数任せにしない)。繰り返しの手 (カオススパム) は当たりの箱へ 1 発で行く前提 = 当たりが出るまで打ち直すだけ。
 * 戻りの矢印は 1 回だけ辿り、戻った状態のまま先も辿る (箱ごとに「ふつうに着いた」と「戻りで着いた」の 2 回まで、戻りの中の戻りでは止める)。
 * 10-22 靴を白紙から組んで: 狙いが消えて外れを持ったまま始めに戻り、カオスで当たるとサフィックスが満杯で次の高貴が打てず 100 人中 64 人止まるのに、
 * 前は戻った先の手が打てるかだけ見て先へ進まず、精査に出なかった
 */
import { allMods, modBoostsOf, mulberry32, stepOutcomes, unrevealedOf, type PatchData, type StageItem } from "../../craft-stage/engine";
import { CATALYSING, isCatalyst } from "./tree-hands";
import { aimKey, type Aim, type OutKind, type TreeDoc } from "./tree-model";
import { aimHeld, aimsOf, handAims, handProblem, outcomeOf, playHand, sampleOf } from "./tree-sample";
import { heldSets, MATCH, matchItem, matchTargets, outBoxOf, RESTART, runTree, settle, shapesOf } from "./tree-run";
import { withTreeTune } from "./tree-tune";
import { tr } from "../../../i18n/lang";

export type CheckKind = "open" | "noAim" | "cantUse" | "neverHit" | "noDone" | "loop" | "doneShape" | "quality" | "unwanted" | "noMatch" | "noCatalyst" | "unexpected" | "stuck";
export interface CheckIssue { boxId: string; kind: CheckKind; text: string }

const PEOPLE = 5;
/** 回して止まる箱を数える人数 (5 人を辿るだけでは、止まる形 (例: 外れを持ったまま戻って満杯) を引かない事がある) */
const RUN_PEOPLE = 30;
/** 結果の名前 (画面の tree-names の OUT_LOOK と同じ言葉) */
const OUT_NAME: Partial<Record<OutKind, [string, string]>> = { hit: ["当たり", "Hit"], junk: ["外れ", "Miss"], junkGone: ["外れが消えた", "Miss removed"], lost: ["狙いが消えた", "Target lost"] };
const outName = (o: OutKind): string => { const n = OUT_NAME[o]; return n ? tr(n[0], n[1]) : o; };
/** 1 つの結果が出るまで打ち直す上限 (精査は数秒で終わるよう、見本の 3000 より少なく) */
const TRIES = 1200;

/** ルート精査 (木の設定 tune で打つ) */
export function checkTree(data: PatchData, doc: TreeDoc): CheckIssue[] {
  return withTreeTune(doc, () => checkIn(data, doc));
}
function checkIn(data: PatchData, doc: TreeDoc): CheckIssue[] {
  const out: CheckIssue[] = [];
  const add = (boxId: string, kind: CheckKind, text: string): void => { if (!out.some((x) => x.boxId === boxId && x.kind === kind)) out.push({ boxId, kind, text }); };
  const boxes = Object.values(doc.boxes);
  const aims = aimsOf(doc);
  /** 戻りの矢印の行き先 (形の合う箱へ = 行きうる全部、作り直し = 始まり) */
  const backTo = (id: string): string[] => {
    const back = doc.boxes[id]?.back;
    if (!back) return [];
    if (back === MATCH) return matchTargets(doc, id).flatMap((x) => (x.to ? [x.to] : []));
    return [back === RESTART ? "start" : back];
  };

  // 1) 形だけで分かる穴: 決めていない芽・MOD を選んでいない当たり
  if (!doc.fracture) add("start", "noAim", tr("フラクチャーする MOD を選んでいない", "No fractured mod picked"));
  for (const b of boxes) {
    if (!b.hand && !b.back && !b.done) add(b.id, "open", b.out === "start" ? tr("最初の手を決めていない (ここで止まる)", "No first craft yet (stops here)") : tr("行き先を決めていない (ここで止まる)", "No next step yet (stops here)"));
    if (b.out === "hit" && !b.aim) add(b.id, "noAim", tr("付く MOD を選んでいない", "No mod picked for this hit"));
    // 触媒のお告げはカタリストで入れた品質にだけ効く。カタリストを打つ手が無ければ効きは乗らない (10-22 オーナー「ちゃんと打つルートが無いとあかん」)。
    // 品質だけ上げる手 (カタリスト) の後の通り抜けから打つ時は、その手がカタリストを打つ手
    const before = b.out === "pass" && b.parent ? doc.boxes[b.parent]?.hand : null;
    const afterCat = !!before && isCatalyst(before.currency);
    if (b.hand?.omens.includes(CATALYSING) && !b.hand.catalyst && !afterCat) add(b.id, "noCatalyst", tr("触媒のお告げなのにカタリストを打つ手が無い (手の札でカタリストを選ぶ)", "Catalysing omen without a catalyst craft (pick a catalyst in the craft)"));
  }

  // 1b) 形の合う箱へ: 行きうる形の箱がツリーに無い (tree-run の matchTargets、回す時と同じ判定)
  for (const b of boxes) if (b.back === MATCH) {
    const miss = matchTargets(doc, b.id).filter((x) => !x.to);
    if (miss.length) add(b.id, "noMatch", tr(`続きの箱が無い (${miss.length} つの形。その形で手のある箱を作る)`, `No box to continue from (${miss.length} shape(s)); add a box with that shape and a craft`));
  }

  // 2) 完成に着かない道・抜けられない輪 (矢印を逆に辿って、完成の箱へ行ける箱を集める)
  const done = boxes.filter((b) => b.done);
  if (!done.length) add("start", "noDone", tr("完成の箱が無い (当たりの箱で「完成にする」)", "No done box yet (mark a hit as done)"));
  const reach = new Set(done.map((b) => b.id));
  for (let changed = true; changed;) {
    changed = false;
    for (const b of boxes) {
      if (reach.has(b.id)) continue;
      if (b.outs.some((o) => reach.has(o)) || backTo(b.id).some((x) => reach.has(x))) { reach.add(b.id); changed = true; }
    }
  }
  if (done.length) for (const b of boxes) {
    if (reach.has(b.id) || (!b.hand && !b.back && !b.done)) continue; // 決めていない芽は 1) で出している
    if (b.back) add(b.id, "loop", tr("戻りの輪から抜けられない (完成の箱へ着く道が無い)", "Stuck in a return loop (no way to a done box)"));
    else if (b.hand && b.outs.every((o) => !reach.has(o))) add(b.id, "noDone", tr("この先は完成の箱へ一度も着かない", "Nothing below this ever reaches a done box"));
  }

  // 3) 完成の形の食い違い (完成の箱どうしで、道の札がそろっていない)
  const pathAims = (id: string): string => {
    const ks = new Set<string>();
    for (let b: TreeDoc["boxes"][string] | undefined = doc.boxes[id]; b; b = b.parent ? doc.boxes[b.parent] : undefined) if (b.out === "hit" && b.aim) ks.add(aimKey(b.aim));
    return [...ks].sort().join(",");
  };
  const mains = done.filter((b) => b.done === "main");
  // 比べるのは揃った狙いの数 (「どれか 2 つ」の木は完成ごとに札が違うのが正しい。前は札の組で比べ、靴の完成の箱ほぼ全部に ! が付いた、10-22)
  const nOf = (id: string): number => (pathAims(id) ? pathAims(id).split(",").length : 0);
  if (mains.length > 1) { const first = nOf(mains[0]!.id); for (const b of mains.slice(1)) if (nOf(b.id) !== first) add(b.id, "doneShape", tr(`ほかの完成の箱と、揃った狙いの数が違う (${nOf(b.id)} つ / ${first} つ)`, `Different number of targets than the other done box (${nOf(b.id)} / ${first})`)); }

  // 4) エンジンで 5 人を辿る: 打てない手・付かない当たり
  if (doc.fracture) {
    const cant = new Map<string, { who: Set<number>; reason: string }>();
    const never = new Set<string>();
    /** 結果の箱に無い結果が出る箱 (箱 → 人数と出る結果)。結果が 1 通りとして箱を 1 つにした手で、想定外の形で着いた時など (10-22 ブラック) */
    const odd = new Map<string, { who: Set<number>; outs: Set<string> }>();
    const shapes = shapesOf(doc);
    for (let person = 1; person <= PEOPLE; person++) {
      const rng = mulberry32(7919 * person);
      const start = sampleOf(data, doc, "start", person).item;
      const seen = new Set<string>();
      const walk = (id: string, item: StageItem, viaBack: boolean): void => {
        const b = doc.boxes[id];
        if (!b || seen.has(id + (viaBack ? "<" : ""))) return;
        seen.add(id + (viaBack ? "<" : ""));
        // × (要らない) の印の MOD が残ったまま完成 (印はこの箱と上の箱で付けた物、段は問わない)
        if (b.done) for (let x: typeof b | undefined = b; x; x = x.parent ? doc.boxes[x.parent] : undefined) for (const m of x.unwanted ?? []) {
          if (aimHeld(data, item, { modId: m, tier: 99 })) add(id, "unwanted", tr("× (要らない) の印の MOD が残ったまま完成", "A mod marked × (unwanted) is still on the done item"));
        }
        if (b.back && !viaBack) {
          // 形の合う箱へ = 回す時と同じく今のアイテムの形で行き先を決める (tree-run の matchItem)。作り直し = 始めのアイテムで始まりへ
          const to = b.back === MATCH ? matchItem(data, doc, item, aims) : b.back === RESTART ? "start" : settle(data, doc, shapes, b.back, item, aims);
          if (!to) { add(id, "noMatch", tr("この形の箱が無い (回すとここで止まる)", "No box has this shape (runs stop here)")); return; }
          walk(to, b.back === RESTART ? start : item, true);
          return;
        }
        if (!b.hand) return;
        // 打てない手 (効かない・消せる物が無いお告げも。tree-sample の handProblem、オーナー 10-22「進行不能」)
        const why = handProblem(data, item, b.hand);
        const first = playHand(data, item, b.hand, rng, handAims(doc, b.id, aims));
        if (why || !first.applied) { const c = cant.get(id) ?? { who: new Set<number>(), reason: why ?? first.reason ?? "" }; c.who.add(person); cant.set(id, c); return; }
        // 結果の箱に無い結果 (エンジンの stepOutcomes で起こりうる枝を全部。未発現が付く手・繰り返しの手は見ない)
        if (!b.hand.repeat) {
          const miss = (stepOutcomes(data, item, b.hand.currency, b.hand.omens) ?? []).filter((o) => !o.void && !unrevealedOf(o.item))
            .map((o) => outcomeOf(data, item, o.item, aims)).filter((oc) => !outBoxOf(doc, b, oc));
          if (miss.length) { const c = odd.get(id) ?? { who: new Set<number>(), outs: new Set<string>() }; c.who.add(person); for (const oc of miss) c.outs.add(outName(oc.out)); odd.set(id, c); }
        }
        // 品質 (オーナー 10-22「ルート精査の時の品質のチェック」): 触媒の品質が当たりの MOD に効くかは下で見る。
        // 聖別・コラプトの後の手・カタリストが入らない手は、上の打てない手 (エンジンの理由) で出る。触媒は打つと品質を使い切るので、前の品質の入れ替えは起きない
        const tag = b.hand.catalyst && b.hand.omens.includes(CATALYSING) ? b.hand.catalyst.slice("catalyst_".length) : null;
        let boosted = false, hits = 0;
        for (const o of b.outs) {
          const ob = doc.boxes[o]!;
          let got: StageItem | null = null;
          for (let i = 0; i < TRIES && !got; i++) {
            const r = i === 0 ? first : playHand(data, item, b.hand, rng, handAims(doc, b.id, aims));
            if (!r.applied) break;
            const res = outcomeOf(data, item, r.item, aims);
            if ((res.out === ob.out || ob.out === "any" || ob.out === "pass") && (ob.out !== "hit" || !ob.aim || res.hits.some((a: Aim) => aimKey(a) === aimKey(ob.aim!)))) got = r.item;
          }
          if (got && tag && ob.out === "hit" && ob.aim) {
            // 触媒の品質がこの当たりの MOD に効くか (エンジンの modBoostsOf。触媒は打つと品質を使い切るので、その種類の品質が載った形で聞く)
            const m = allMods(got).find((x) => x.modId === ob.aim!.modId);
            if (m) { hits++; if (modBoostsOf({ ...got, quality: Math.max(got.quality, 1), catalystQuality: 1, qualityTag: tag }, m, data).some((k) => k.kind === "quality")) boosted = true; }
          }
          if (got) walk(settle(data, doc, shapes, o, got, aims), got, viaBack);
          // もう付いているかもしれない狙い (狙いが消えた後の取り直し、heldSets) は、付いていない人だけが着くので数えない
          else if (ob.out === "hit" && ob.aim && !viaBack && !heldSets(doc, id).some((h) => h.includes(aimKey(ob.aim!)))) never.add(o);
        }
        if (tag && hits && !boosted) add(id, "quality", tr("触媒で入れる品質が、この手の当たりの MOD のどれにも効かない (カタリストの種類を確かめる)", "The catalysed quality boosts none of this craft's target mods (check the catalyst type)"));
      };
      walk("start", start, false);
    }
    for (const [id, c] of cant) add(id, "cantUse", tr(`この箱に着いた状態では手が打てない (${PEOPLE} 人中 ${c.who.size} 人): ${c.reason}`, `The craft can't be used here (${c.who.size} of ${PEOPLE}): ${c.reason}`));
    for (const [id, c] of odd) add(id, "unexpected", tr(`結果の箱に無い結果も出る (${PEOPLE} 人中 ${c.who.size} 人): ${[...c.outs].join("・")}。回すと形の合う箱へ進み、無ければ止まる`, `Results with no box can happen (${c.who.size} of ${PEOPLE}): ${[...c.outs].join(", ")}. Runs go to a box of the same shape, or stop`));
    // 5) 回して止まる箱 (tree-run を 30 人、値段 0)。10-22 靴を白紙から組んで: 100 人中 64 人が止まる箱を上の辿り方では引かなかった
    const run = runTree(data, doc, { n: RUN_PEOPLE, seed: 1, price: () => 0 });
    for (const [id, n] of Object.entries(run.stuckAt)) add(id, "stuck", tr(`回すと ${RUN_PEOPLE} 人中 ${n} 人がここで止まる (この箱の手が打てない形で着く。外れを消す手を前に置くか、形の合う箱へ戻す)`, `${n} of ${RUN_PEOPLE} runs stop here (they arrive in a shape this craft can't be used on; remove the miss first or return to a box of that shape)`));
    for (const id of never) add(id, "neverHit", tr(`上の手を ${TRIES} 回打ってもこの札が付かなかった (側・段・手を確かめる)`, `This mod never hit in ${TRIES} tries of the craft above (check side, tier and craft)`));
  }
  // 止まる・打てない物を先に (10-22 精査で靴の止まりが完成の札の ! の下に埋もれた)
  const RANK: Partial<Record<CheckKind, number>> = { stuck: 0, cantUse: 1, noMatch: 2, unexpected: 3, open: 4, loop: 5, noDone: 6 };
  return out.map((x, i) => ({ x, i })).sort((a, z) => (RANK[a.x.kind] ?? 9) - (RANK[z.x.kind] ?? 9) || a.i - z.i).map((v) => v.x);
}
