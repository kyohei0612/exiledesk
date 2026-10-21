/**
 * tree-check.ts — ルート精査 (2026-10-22 オーナー「今どこで止まるのか、今の状態で付くのかをチェック。5 人を回して、カオススパム設定なら 1 発で付く前提で
 * 動いて全パターン検出。穴がある所をエラー表記で」)。費用は出さない。打つのは全部エンジン (tree-sample の playHand → applyCurrency)。
 *
 * 辿り方: 5 人それぞれ、始まりから箱の手をエンジンで打ち、矢印の先の結果の箱を全部 (当たり・外れ・消えた) 順に 1 回ずつ通す
 * (その結果が出るまで打ち直す。乱数任せにしない)。繰り返しの手 (カオススパム) は当たりの箱へ 1 発で行く前提 = 当たりが出るまで打ち直すだけ。
 * 戻りの矢印は 1 回だけ辿る (戻り先の手がその状態で打てるか)。
 */
import { allMods, modBoostsOf, mulberry32, type PatchData, type StageItem } from "../../craft-stage/engine";
import { CATALYSING } from "./tree-hands";
import { aimKey, type Aim, type TreeDoc } from "./tree-model";
import { aimHeld, aimsOf, outcomeOf, playHand, sampleOf } from "./tree-sample";
import { MATCH, matchItem, matchTargets, RESTART } from "./tree-run";
import { tr } from "../../../i18n/lang";

export type CheckKind = "open" | "noAim" | "cantUse" | "neverHit" | "noDone" | "loop" | "doneShape" | "quality" | "unwanted" | "noMatch";
export interface CheckIssue { boxId: string; kind: CheckKind; text: string }

const PEOPLE = 5;
/** 1 つの結果が出るまで打ち直す上限 (精査は数秒で終わるよう、見本の 3000 より少なく) */
const TRIES = 1200;

export function checkTree(data: PatchData, doc: TreeDoc): CheckIssue[] {
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
  }

  // 1b) 形の合う箱へ: 行きうる形の箱がツリーに無い (tree-run の matchTargets、回す時と同じ判定)
  for (const b of boxes) if (b.back === MATCH) {
    const miss = matchTargets(doc, b.id).filter((x) => !x.to);
    if (miss.length) add(b.id, "noMatch", tr(`形の合う箱が無い (${miss.length} つの形。その形で手のある箱を作る)`, `No box matches (${miss.length} shape(s)); add a box with that shape and a craft`));
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
  if (mains.length > 1) { const first = pathAims(mains[0]!.id); for (const b of mains.slice(1)) if (pathAims(b.id) !== first) add(b.id, "doneShape", tr("ほかの完成の箱と、着くまでの札が違う (道ごとに完成の形が違う)", "Different set of mods than the other done box")); }

  // 4) エンジンで 5 人を辿る: 打てない手・付かない当たり
  if (doc.fracture) {
    const cant = new Map<string, { n: number; reason: string }>();
    const never = new Set<string>();
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
          const to = b.back === MATCH ? matchItem(data, doc, item, aims) : b.back === RESTART ? "start" : b.back;
          if (!to) { add(id, "noMatch", tr("この形の箱が無い (回すとここで止まる)", "No box has this shape (runs stop here)")); return; }
          walk(to, b.back === RESTART ? start : item, true);
          return;
        }
        if (!b.hand) return;
        const first = playHand(data, item, b.hand, rng, aims);
        if (!first.applied) { const c = cant.get(id) ?? { n: 0, reason: first.reason ?? "" }; c.n++; cant.set(id, c); return; }
        if (viaBack) return; // 戻りの矢印で着いた時は、戻り先の手がこの状態で打てるかだけ見る (先は通常の道で辿る)
        // 品質 (オーナー 10-22「ルート精査の時の品質のチェック」): 触媒の品質が当たりの MOD に効くかは下で見る。
        // 聖別・コラプトの後の手・カタリストが入らない手は、上の打てない手 (エンジンの理由) で出る。触媒は打つと品質を使い切るので、前の品質の入れ替えは起きない
        const tag = b.hand.catalyst && b.hand.omens.includes(CATALYSING) ? b.hand.catalyst.slice("catalyst_".length) : null;
        let boosted = false, hits = 0;
        for (const o of b.outs) {
          const ob = doc.boxes[o]!;
          let got: StageItem | null = null;
          for (let i = 0; i < TRIES && !got; i++) {
            const r = i === 0 ? first : playHand(data, item, b.hand, rng, aims);
            if (!r.applied) break;
            const res = outcomeOf(data, item, r.item, aims);
            if ((res.out === ob.out || ob.out === "any") && (ob.out !== "hit" || !ob.aim || res.hits.some((a: Aim) => aimKey(a) === aimKey(ob.aim!)))) got = r.item;
          }
          if (got && tag && ob.out === "hit" && ob.aim) {
            // 触媒の品質がこの当たりの MOD に効くか (エンジンの modBoostsOf。触媒は打つと品質を使い切るので、その種類の品質が載った形で聞く)
            const m = allMods(got).find((x) => x.modId === ob.aim!.modId);
            if (m) { hits++; if (modBoostsOf({ ...got, quality: Math.max(got.quality, 1), catalystQuality: 1, qualityTag: tag }, m, data).some((k) => k.kind === "quality")) boosted = true; }
          }
          if (got) walk(o, got, false);
          else if (ob.out === "hit" && ob.aim && !viaBack) never.add(o);
        }
        if (tag && hits && !boosted) add(id, "quality", tr("触媒で入れる品質が、この手の当たりの MOD のどれにも効かない (カタリストの種類を確かめる)", "The catalysed quality boosts none of this craft's target mods (check the catalyst type)"));
      };
      walk("start", start, false);
    }
    for (const [id, c] of cant) add(id, "cantUse", tr(`この箱に着いた状態では手が打てない (${PEOPLE} 人中 ${c.n} 人): ${c.reason}`, `The craft can't be used here (${c.n} of ${PEOPLE}): ${c.reason}`));
    for (const id of never) add(id, "neverHit", tr(`上の手を ${TRIES} 回打ってもこの札が付かなかった (側・段・手を確かめる)`, `This mod never hit in ${TRIES} tries of the craft above (check side, tier and craft)`));
  }
  return out;
}
