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
import { allMods, modBoostsOf, mulberry32, room, SIDES, unrevealedOf, type PatchData, type StageItem } from "../../craft-stage/engine";
import { stepOutcomes } from "../../craft-stage/engine-sim";
import { catalystTagOf } from "../../craft-stage/engine-sim";
import { aimHeldOn, junkOf } from "./tree-aim";
import { CATALYSING, effectOf, engineOmens, isCatalyst } from "./tree-hands";
import { aimKey, type Aim, type OutKind, type TreeDoc } from "./tree-model";
import { aimOpts, aimsOf, handAims, handProblem, outcomeOf, playHand, sampleOf, startItemOf, targetsOf } from "./tree-sample";
import { heldSets, MATCH, matchItem, matchTargets, outBoxOf, RESTART, runTreeSteps, settle, shapesOf, splitTo } from "./tree-run";
import { withTreeTune } from "./tree-tune";
import { modText, tr } from "../../../i18n/lang";

type CheckKind = "open" | "noAim" | "cantUse" | "neverHit" | "noDone" | "loop" | "doneShape" | "quality" | "unwanted" | "noMatch" | "noCatalyst" | "unexpected" | "stuck" | "carry" | "omenWaste";
export interface CheckIssue { boxId: string; kind: CheckKind; text: string }

const PEOPLE = 5;
/** 回して止まる箱を数える人数 (5 人を辿るだけでは、止まる形 (例: 外れを持ったまま戻って満杯) を引かない事がある) */
const RUN_PEOPLE = 30;
/** 結果の名前 (画面の tree-names の OUT_LOOK と同じ言葉) */
const OUT_NAME: Partial<Record<OutKind, [string, string]>> = { hit: ["当たり", "Hit"], junk: ["外れ", "Miss"], junkGone: ["外れが消えた", "Miss removed"], lost: ["狙いが消えた", "Target lost"] };
const outName = (o: OutKind): string => { const n = OUT_NAME[o]; return n ? tr(n[0], n[1]) : o; };
/** 1 つの結果が出るまで打ち直す上限 (精査は数秒で終わるよう、見本の 3000 より少なく) */
const TRIES = 1200;

/** 精査の進み (walk = 5 人を辿る、run = 30 人回す) */
export interface CheckProgress { phase: "walk" | "run"; n: number; of: number; /** ここまでに見つかった穴 (辿った人から順に足す、10-22 オーナー「読み込みながら徐々に出す」) */ partial: CheckIssue[] }
/** ルート精査 (木の設定 tune で打つ。一気に回す、台本・テスト用) */
export function checkTree(data: PatchData, doc: TreeDoc): CheckIssue[] {
  const g = checkSteps(data, doc);
  for (;;) { const r = withTreeTune(doc, () => g.next()); if (r.done) return r.value; }
}
/**
 * ルート精査を 1 人ずつ区切って回し、間に画面を返す (くるくるが回り「精査中 12/30」が出る、10-22 オーナー「ローディング画面を出さないとバグってるのか分からない」)。
 * 中身は checkTree と同じ。木の設定 (tune) は 1 区切りごとに包む
 */
export async function checkTreeAsync(data: PatchData, doc: TreeDoc, onProgress: (p: CheckProgress) => void): Promise<CheckIssue[]> {
  const g = checkSteps(data, doc);
  for (;;) {
    const r = withTreeTune(doc, () => g.next());
    if (r.done) return r.value;
    onProgress(r.value);
    await new Promise((res) => setTimeout(res, 0));
  }
}
function* checkSteps(data: PatchData, doc: TreeDoc): Generator<CheckProgress, CheckIssue[]> {
  const out: CheckIssue[] = [];
  const add = (boxId: string, kind: CheckKind, text: string): void => { if (!out.some((x) => x.boxId === boxId && x.kind === kind)) out.push({ boxId, kind, text }); };
  const boxes = Object.values(doc.boxes);
  const aims = aimsOf(doc);
  /** 戻りの矢印の行き先 (形の合う箱へ = 行きうる全部、作り直し = 始まり) */
  const backTo = (id: string): string[] => {
    const split = doc.boxes[id]?.split;
    if (split) return split.flatMap((r) => (r.to ? [r.to] : []));
    const back = doc.boxes[id]?.back;
    if (!back) return [];
    if (back === MATCH) return matchTargets(doc, id).flatMap((x) => (x.to ? [x.to] : []));
    return [back === RESTART ? "start" : back];
  };

  // 1) 形だけで分かる穴: 決めていない芽・MOD を選んでいない当たり
  // 始まりの MOD は自由 (無くてよい、10-22 オーナー)。付けられない時は見本の理由を出す
  { const note = startItemOf(data, doc, mulberry32(1)).note; if (note) add("start", "cantUse", tr(`始まりの形が作れない: ${note}`, `Can't make the starting item: ${note}`)); }
  for (const b of boxes) {
    if (b.split?.some((r) => !r.to)) add(b.id, "open", tr("分かれ目の行き先を決めていない行がある (その形で来た人はここで止まる)", "A split row has no destination (runs of that shape stop here)"));
    if (!b.hand && !b.back && !b.done && !b.split) add(b.id, "open", b.out === "start" ? tr("最初の手を決めていない (ここで止まる)", "No first craft yet (stops here)") : tr("行き先を決めていない (ここで止まる)", "No next step yet (stops here)"));
    if (b.out === "hit" && !b.aim) add(b.id, "noAim", tr("付く MOD を選んでいない", "No mod picked for this hit"));
    // 触媒のお告げはカタリストで入れた品質にだけ効く。カタリストを打つ手が無ければ効きは乗らない (10-22 オーナー「ちゃんと打つルートが無いとあかん」)。
    // 品質だけ上げる手 (カタリスト) の後の通り抜けから打つ時は、その手がカタリストを打つ手
    const before = b.out === "pass" && b.parent ? doc.boxes[b.parent]?.hand : null;
    const afterCat = !!before && isCatalyst(before.currency);
    if (b.hand?.omens.includes(CATALYSING) && !b.hand.catalyst && !afterCat) add(b.id, "noCatalyst", tr("触媒のお告げなのにカタリストを打つ手が無い (手の札でカタリストを選ぶ)", "Omen of Catalysing Exaltation without a catalyst craft (pick a catalyst in the craft)"));
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
    if (reach.has(b.id) || (!b.hand && !b.back && !b.done && !b.split)) continue; // 決めていない芽は 1) で出している
    if (b.back || b.split) add(b.id, "loop", tr("戻りの輪から抜けられない (完成の箱へ着く道が無い)", "Stuck in a return loop (no way to a done box)"));
    else if (b.hand && b.outs.every((o) => !reach.has(o))) add(b.id, "noDone", tr("この先は完成の箱へ一度も着かない", "Nothing below this ever reaches a done box"));
  }

  // 3) 完成の形の食い違い (完成の箱どうしで、道の札がそろっていない)
  const pathAims = (id: string): string => {
    const ks = new Set<string>();
    for (let b: TreeDoc["boxes"][string] | undefined = doc.boxes[id]; b; b = b.parent ? doc.boxes[b.parent] : undefined) {
      if (b.out === "hit" && b.aim) ks.add(aimKey(b.aim));
      // 分かれ目の行の「付いている狙い」も道の札 (10-24 不在のアミュ B: 負けの後のカオスでキャスト・ルーンワードが残った人の完成の行が「狙い 2 つ」と出た)
      const p = b.parent ? doc.boxes[b.parent] : undefined;
      for (const k of p?.split?.find((r) => r.to === b!.id)?.when.has ?? []) ks.add(k);
    }
    return [...ks].sort().join(",");
  };
  const mains = done.filter((b) => b.done === "main");
  // 比べるのは揃った狙いの数 (「どれか 2 つ」の木は完成ごとに札が違うのが正しい。前は札の組で比べ、靴の完成の箱ほぼ全部に ! が付いた、10-22)。
  // 数は下の 4) でエンジンが辿った時に完成の箱で付いていた狙いの数の一番少ない物 (戻りの矢印で合流すると親をたどった札と違う、靴 b8、10-22)。着かなかった箱は親をたどった札の数
  const nOfPath = (id: string): number => (pathAims(id) ? pathAims(id).split(",").length : 0);
  const heldAtDone = new Map<string, number>();

  // 4) エンジンで 5 人を辿る: 打てない手・付かない当たり
  {
    const cant = new Map<string, { who: Set<number>; reason: string }>();
    const never = new Set<string>();
    /** 結果の箱に無い結果が出る箱 (箱 → 人数と出る結果)。結果が 1 通りとして箱を 1 つにした手で、想定外の形で着いた時など (10-22 ブラック) */
    const odd = new Map<string, { who: Set<number>; outs: Set<string> }>();
    /** お告げが効かない (無駄になる) 人がいる箱 */
    const waste = new Map<string, { who: Set<number>; reason: string }>();
    const shapes = shapesOf(doc);
    const cantIssues = (): CheckIssue[] => [...cant].map(([id, c]) => ({ boxId: id, kind: "cantUse" as const, text: tr(`この箱に着いた状態では手が打てない (${PEOPLE} 人中 ${c.who.size} 人): ${c.reason}`, `The craft can't be used here (${c.who.size} of ${PEOPLE}): ${c.reason}`) }));
    const oddIssues = (): CheckIssue[] => [...odd].map(([id, c]) => ({ boxId: id, kind: "unexpected" as const, text: tr(`結果の箱に無い結果も出る (${PEOPLE} 人中 ${c.who.size} 人): ${[...c.outs].join("・")}。回すと形の合う箱へ進み、無ければ止まる。直すには、その結果の箱を足すか、同じ形で手のある箱を作る`, `Results with no box can happen (${c.who.size} of ${PEOPLE}): ${[...c.outs].join(", ")}. Runs go to a box of the same shape, or stop. Fix: add a box for that result, or a box with a craft for that shape`) }));
    for (let person = 1; person <= PEOPLE; person++) {
      const rng = mulberry32(7919 * person);
      const start = sampleOf(data, doc, "start", person).item;
      const seen = new Set<string>();
      const walk = (id: string, item: StageItem, viaBack: boolean): void => {
        const b = doc.boxes[id];
        if (!b || seen.has(id + (viaBack ? "<" : ""))) return;
        seen.add(id + (viaBack ? "<" : ""));
        // × (要らない) の印の MOD が残ったまま完成 (印はこの箱と上の箱で付けた物、段は問わない)
        if (b.done === "main") { const n = aims.filter((a) => aimHeldOn(data, item, a, { sameText: true })).length; heldAtDone.set(id, Math.min(heldAtDone.get(id) ?? n, n)); }
        if (b.done) for (let x: typeof b | undefined = b; x; x = x.parent ? doc.boxes[x.parent] : undefined) for (const m of x.unwanted ?? []) {
          if (aimHeldOn(data, item, { modId: m, tier: 99 }, { sameText: true })) add(id, "unwanted", tr("× (要らない) の印の MOD が残ったまま完成", "A mod marked × (unwanted) is still on the done item"));
        }
        // 分かれ目: 今のアイテムの形で合う行の箱へ (回す時と同じ splitTo)。合う行が無い・行き先が無い時は止まる
        if (b.split) {
          const to = splitTo(data, b.split, item, aims);
          if (!to) { add(id, "noMatch", tr("分かれ目のどの行にも合わない形で着く (回すとここで止まる)", "Arrives in a shape no split row matches (runs stop here)")); return; }
          walk(to, item, viaBack);
          return;
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
        // お告げが効かないだけ (回すと打って進む) は止まりと分ける (10-22 13 通り組んだ #12: 「手が打てない」と出たのに 100 人とも進んだ)
        if (why && first.applied) { const c = waste.get(id) ?? { who: new Set<number>(), reason: why }; c.who.add(person); waste.set(id, c); }
        else if (why || !first.applied) { const c = cant.get(id) ?? { who: new Set<number>(), reason: why ?? first.reason ?? "" }; c.who.add(person); cant.set(id, c); return; }
        // 結果の箱に無い結果 (エンジンの stepOutcomes で起こりうる枝を全部。未発現が付く手・繰り返しの手は見ない。
        // フラクチャーも見ない: 必ず選んだ狙いを固定し、外れは費用で数える、10-24 オーナー)
        if (!b.hand.repeat && effectOf(b.hand.currency) !== "fracture") {
          const miss = (stepOutcomes(data, item, b.hand.currency, engineOmens(b.hand)) ?? []).filter((o) => !o.void && !unrevealedOf(o.item))
            .map((o) => outcomeOf(data, item, o.item, aims, b.hand!.currency)).filter((oc) => !outBoxOf(doc, b, oc));
          if (miss.length) { const c = odd.get(id) ?? { who: new Set<number>(), outs: new Set<string>() }; c.who.add(person); for (const oc of miss) c.outs.add(outName(oc.out)); odd.set(id, c); }
        }
        // 品質 (オーナー 10-22「ルート精査の時の品質のチェック」): 触媒の品質が当たりの MOD に効くかは下で見る。
        // 聖別・コラプトの後の手・カタリストが入らない手は、上の打てない手 (エンジンの理由) で出る。触媒は打つと品質を使い切るので、前の品質の入れ替えは起きない
        // カタリストは手の札 (前の版) か、前の「カタリストの手」の箱 (品質だけ上げた後の通り抜けの親、今の画面。10-22 13 通り組んだ #6 で見ていなかった)
        const preCat = b.out === "pass" && b.parent ? doc.boxes[b.parent]?.hand : null;
        const cat = b.hand.catalyst ?? (preCat && isCatalyst(preCat.currency) ? preCat.currency : null);
        const tag = cat && b.hand.omens.includes(CATALYSING) ? catalystTagOf(cat) : null;
        let boosted = false, hits = 0;
        for (const o of b.outs) {
          const ob = doc.boxes[o]!;
          // もう付いている狙いの当たりの箱には着かない (打ち直しても付かないので飛ばす。始めに戻った人で当たるまでを 1200 回打ち直し、精査が 13 秒かかった、10-22 金の指輪)
          if (ob.out === "hit" && ob.aim && aimHeldOn(data, item, ob.aim, { sameText: true })) continue;
          let got: StageItem | null = null;
          for (let i = 0; i < TRIES && !got; i++) {
            const r = i === 0 ? first : playHand(data, item, b.hand, rng, handAims(doc, b.id, aims));
            if (!r.applied) break;
            const res = outcomeOf(data, item, r.item, aims, b.hand.currency);
            // 当たるまでの手が上限まで打っても当たらない = 付かない狙いだけ。打ち直しても同じなのでやめる (1 回 5000 回 × 1200 で固まった、10-22)
            if (b.hand.repeat && res.out !== "hit") break;
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
      yield { phase: "walk", n: person, of: PEOPLE, partial: ranked([...out, ...cantIssues(), ...oddIssues()]) };
    }
    for (const x of [...cantIssues(), ...oddIssues()]) add(x.boxId, x.kind, x.text);
    for (const [id, c] of waste) add(id, "omenWaste", tr(`お告げが効かない人がいる (${PEOPLE} 人中 ${c.who.size} 人、手は打てる): ${c.reason}`, `The omen is wasted for some runs (${c.who.size} of ${PEOPLE}; the craft still works): ${c.reason}`));
    // 5) 回して止まる箱 (tree-run を 30 人、値段 0)。10-22 靴を白紙から組んで: 100 人中 64 人が止まる箱を上の辿り方では引かなかった
    const steps = runTreeSteps(data, doc, { n: RUN_PEOPLE, seed: 1, price: () => 0, capSteps: 300 });
    let st = steps.next();
    while (!st.done) { yield { phase: "run", n: st.value, of: RUN_PEOPLE, partial: ranked(out) }; st = steps.next(); }
    const run = st.value;
    // 完成 0 人で半分以上が打ち止め (手の上限) = 完成に着かない (10-22 13 通り組んだ #10: 100 人とも打ち止めの木で精査が何も言わなかった)。
    // ここの回しは手の上限 300 なので、長いだけの木 (100 人回しでは完成 100%) は完成が 1 人でもいれば出さない
    if (!run.finished && run.capped * 2 >= RUN_PEOPLE) add("start", "noDone", tr(`回すと ${RUN_PEOPLE} 人中 1 人も完成せず、${run.capped} 人が手の上限まで打っても着かない (輪から出られない・狙いが付きにくい道を確かめる)`, `None of ${RUN_PEOPLE} runs finished; ${run.capped} hit the craft limit (check for loops or hard-to-hit paths)`));
    for (const [id, n] of Object.entries(run.stuckAt)) {
      const w = run.stuckWhy[id];
      // 外れを持ったまま戻る「狙いが消えた」の戻り (作り直しでない)。カオスを当たるまでは 1 つしか入れ替えないので、持ち込んだ外れは消えずに先で満杯になる (10-22 靴 b14 → b1、100 人中 63 人)
      const carry = (w?.backs ?? []).filter((x) => doc.boxes[x]?.out === "lost" && doc.boxes[x]?.back !== RESTART);
      add(id, "stuck", stuckText(data, aims, n, w, carry.length > 0));
      for (const x of carry) add(x, "carry", tr("ここで戻ると外れを持ったまま進み、先の箱で側が満杯になって止まる (直すのはこの戻り: 戻り先を分かれ目の箱 (打たずに分ける) にして「外れが 2 つ以上なら消去」の行を)", "Returning here keeps the misses, so a later box runs out of room and stops (fix this return: send it to a split box with an \"annul when 2+ misses\" row)"));
    }
    // 回しで結果の箱に無い形になった箱 (5 人の辿りで出なかった物。上限つきの当たるまでが上限で当たらない時など、10-22 13 通り組んだ #13)
    for (const [id, n] of Object.entries(run.unexpected)) {
      const max = doc.boxes[id]?.hand?.repeat?.max;
      add(id, "unexpected", tr(`回すと ${RUN_PEOPLE} 人中 ${n} 人が結果の箱に無い形になる${max ? ` (${max} 回で当たらなかった)` : ""}。形の合う箱へ進み、無ければ止まる。直すには、その結果の箱を足すか、同じ形で手のある箱を作る`, `${n} of ${RUN_PEOPLE} runs end in a shape with no result box${max ? ` (no hit in ${max} tries)` : ""}. They go to a box of the same shape, or stop. Fix: add a box for that result, or a box with a craft for that shape`));
    }
    // 回しで 1 人でも着いた箱は出さない (5 人の辿りは上限つきの当たるまで・始まりに同じ系統が付いている人で外れた、10-22 13 通り組んだ #9 の誤報 3 本)
    for (const id of never) if (!run.boxes[id]?.reach) add(id, "neverHit", tr("上の手を打ち直してもこの札が付かなかった (側・段・手を確かめる)", "This mod never hit when the craft above was retried (check side, tier and craft)"));
  }
  // 3 の続き) 完成の形の食い違い (揃った狙いの数)
  // 一番多く揃う完成の数より少ない形で着く人がいる完成の箱に ! (前は 1 つ目の完成の箱と比べ、どちらが組み違いか分からなかった)
  if (mains.length > 1) {
    const nOf = (id: string): number => heldAtDone.get(id) ?? nOfPath(id);
    const most = Math.max(...mains.map((b) => nOf(b.id)));
    for (const b of mains) if (nOf(b.id) < most) add(b.id, "doneShape", tr(`狙いが ${nOf(b.id)} つしか揃っていない形で着く人がいる (ほかの完成は ${most} つ)`, `Some runs arrive here with only ${nOf(b.id)} target(s) (other done boxes have ${most})`));
  }
  return ranked(out);
}

/** 回して止まる箱の文: 何人・どの側が満杯か・外れの MOD (最初の 1 人の形)。理由が側の満杯でなければエンジンの理由をそのまま */
function stuckText(data: PatchData, aims: readonly Aim[], n: number, w: { reason: string; item: StageItem; noBox?: boolean } | undefined, carry: boolean): string {
  const head = tr(`回すと ${RUN_PEOPLE} 人中 ${n} 人がここで止まる`, `${n} of ${RUN_PEOPLE} runs stop here`);
  // 行き先の箱が無くて止まった (10-22 13 通り組んだ #11: 「手・戻り先が無い」だけでどの結果の箱が無いか分からなかった)
  if (w?.noBox) return `${head}: ${w.reason}`;
  if (!w) return tr(`${head} (手・戻り先が無い、または分かれ目のどの行にも合わない)`, `${head} (no craft or return, or no split row matches)`);
  const full = SIDES.filter((side) => !room(w.item, side));
  if (!full.length) return `${head}: ${w.reason}`;
  const junkAll = junkOf(w.item, targetsOf(data, aims), aimOpts(data));
  const parts = full.map((side) => {
    const junk = junkAll[side];
    const name = side === "prefix" ? tr("プレフィックス", "Prefixes") : tr("サフィックス", "Suffixes");
    return junk.length ? tr(`${name}が満杯 (外れ ${junk.length}: ${junk.map((m) => `${modText(m)} (${m.tierName})`).join("・")})`, `${name} full (${junk.length} miss: ${junk.map((m) => `${modText(m)} (${m.tierName})`).join(", ")})`) : tr(`${name}が満杯`, `${name} full`);
  });
  const fix = carry
    ? tr("。外れを持ったまま戻る「狙いが消えた」の戻りがある (! の付いた戻りの箱)", ". A \"target lost\" return keeps the misses (the return box marked !)")
    : tr("。この手の前に外れを消す手 (消去 + 満杯の側のお告げ) が要る", ". Remove a miss first (annul + the omen for the full side)");
  return tr(`${head}: ${parts.join("・")}で着き、この手が打てない${fix}`, `${head}: ${parts.join(", ")}, so this craft can't be used${fix}`);
}

/** 止まる・打てない物を先に (10-22 精査で靴の止まりが完成の札の ! の下に埋もれた) */
const RANK: Partial<Record<CheckKind, number>> = { stuck: 0, carry: 0, cantUse: 1, noMatch: 2, unexpected: 3, open: 4, loop: 5, noDone: 6 };
function ranked(list: readonly CheckIssue[]): CheckIssue[] {
  return list.map((x, i) => ({ x, i })).sort((a, z) => (RANK[a.x.kind] ?? 9) - (RANK[z.x.kind] ?? 9) || a.i - z.i).map((v) => v.x);
}
