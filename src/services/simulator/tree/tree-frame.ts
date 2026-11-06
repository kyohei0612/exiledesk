/**
 * tree-frame.ts — 箱の配置 (枠) を、見本を打たずにエンジンの決まり (数え上げ stepOutcomes = parts の説明文どおりの動き) から出す (S-71b ㉑、11-06 オーナー
 * 「カオスの挙動で起こりうる結果をただ枝にするだけやん　なんでまいてまいて初めましてなん」「まず1000回のやつ廃止ね絶対」)。
 * 始まりの品から、箱ごとに代表の品を 1 つ持つ。手のある箱は代表の品に手を 1 回数え上げ、出た枝を回す時と同じ boxOutcomeOf → outBoxOf で結果の箱へ分け、
 * 箱ごとに一番重い枝を代表にする。乱数も打ち直しも無い。行き先の箱が無い枝 = 起こりうるのに枝が無い結果 (miss)。
 * 段階 1: まだ組む所は使わない (今の見本の作りと並べて違いを数えるだけ)
 */
import { mulberry32, type PatchData, type StageItem } from "../../craft-stage/engine";
import { stepOutcomesOrTooMany } from "../sim-engine/outcomes";
import { boxOutcomeOf } from "./tree-outcome";
import { outBoxOf } from "./tree-shape";
import { engineOmens } from "./tree-hands";
import { applyHand } from "./tree-hand-core";
import { aimsOf, startItemOf } from "./tree-sample";
import { contentOf, nextAimed, startAimed } from "./tree-judge";
import { itemKeyOf } from "./tree-sample-key";
import { withTreeTune } from "./tree-tune";
import type { TreeDoc } from "./tree-model";

/** 箱の配置: 代表の品・☑・枠の鍵。note = 決まりで出せなかった訳 (tooMany = 枝が多すぎる手、none = 数え上げで表せない手、nobranch = この箱へ行く枝が無い、split = 分かれ目の下) */
export interface Frame { item: StageItem; aimed: ReadonlySet<string>; key: string; p: number; note: string | null }
/** 手の箱で、行き先の箱が無かった枝 (結果の種類ごとに確率の合計) */
export interface FrameMiss { box: string; out: string; p: number }
export interface FrameTree { frames: Map<string, Frame>; miss: FrameMiss[] }

type Outcome = ReturnType<typeof boxOutcomeOf>;
const missKey = (oc: Outcome): string => `${oc.out}${oc.hits.length ? `:${oc.hits.map((a) => a.modId).join("+")}` : ""}${oc.junkKey ? ` [${oc.junkKey}]` : ""}`;

export function frameTree(data: PatchData, doc: TreeDoc): FrameTree {
  return withTreeTune(doc, () => {
    const frames = new Map<string, Frame>(), miss: FrameMiss[] = [], aims = aimsOf(doc);
    const st = startItemOf(data, doc, mulberry32(1)), sa = startAimed(data, doc, st.item);
    frames.set("start", { item: st.item, aimed: sa, key: contentOf(data, doc, st.item, sa), p: 1, note: st.note });
    const q = ["start"];
    while (q.length) {
      const id = q.shift()!, b = doc.boxes[id], f = frames.get(id);
      if (!b || !f) continue;
      const kids = b.outs.filter((o) => doc.boxes[o]);
      q.push(...kids);
      // 手の無い箱の下 (分かれ目の行・ヒネコラのハズレ) は親の代表のまま
      const same = (o: string, note: string | null): void => { frames.set(o, { ...f, note }); };
      if (!b.hand) { for (const o of kids) same(o, b.split ? "split" : null); continue; }
      let rs = stepOutcomesOrTooMany(data, f.item, b.hand.currency, engineOmens(b.hand), { merge: (r) => itemKeyOf(r.item) });
      if (rs === "tooMany") { for (const o of kids) same(o, "tooMany"); continue; }
      // 数え上げで表せない手 (ルーン・品質・発現・無限のエッセンスなど、結果が 1 つに決まる物) は決まった種で 1 回だけ当てる (打ち直さない)
      if (rs === null) { const h = applyHand(data, f.item, b.hand.currency, mulberry32(1), { omens: b.hand.omens }); rs = h.applied ? [{ p: 1, item: h.item, added: h.added, removed: h.removed }] : []; }
      const live = rs.filter((r) => !r.void), tot = live.reduce((n, r) => n + r.p, 0) || 1;
      const best = new Map<string, { item: StageItem; p: number; sum: number }>(), lost = new Map<string, number>();
      for (const r of live) {
        const oc = boxOutcomeOf(data, doc, b, f.item, r.item, aims, f.aimed), to = outBoxOf(doc, b, oc, r.item), p = r.p / tot;
        if (!to) { const k = missKey(oc); lost.set(k, (lost.get(k) ?? 0) + p); continue; }
        const e = best.get(to);
        if (!e) best.set(to, { item: r.item, p, sum: p });
        else { e.sum += p; if (p > e.p) { e.item = r.item; e.p = p; } }
      }
      for (const [out, p] of lost) miss.push({ box: id, out, p });
      for (const o of kids) {
        const e = best.get(o);
        if (doc.boxes[o]!.seen || !e) { same(o, doc.boxes[o]!.seen ? null : "nobranch"); continue; }
        const am = nextAimed(data, doc, f.aimed, o, e.item, f.item);
        frames.set(o, { item: e.item, aimed: am, key: contentOf(data, doc, e.item, am), p: e.sum, note: null });
      }
    }
    return { frames, miss };
  });
}
