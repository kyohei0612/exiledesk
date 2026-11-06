/**
 * tree-frame.ts — 箱の配置 (枠) を、見本を打たずにエンジンの決まり (数え上げ stepOutcomes = parts の説明文どおりの動き) から出す (S-200・E-99、11-06 オーナー
 * 「カオスの挙動で起こりうる結果をただ枝にするだけやん　なんでまいてまいて初めましてなん」「まず1000回のやつ廃止ね絶対」)。
 * 始まりの品から、箱ごとに代表の品を 1 つ持つ。手のある箱は代表の品に手を 1 回数え上げ、出た枝を回す時と同じ boxOutcomeOf → outBoxOf で結果の箱へ分ける。
 * 代表は、その箱へ行く枝のうち、その箱の手を打った時に行き先の無い結果が一番少ない物 (1 手先読み。同じなら重い方) = 箱の配置に合う枝 (S-200 ③)。
 * 乱数も打ち直しも無い。行き先の箱が無い枝 = 起こりうるのに枝が無い結果 (miss)。
 * 段階 2: まだ組む所は使わない (今の見本の作りと並べて違いを数えるだけ)
 */
import { applyCurrency, mulberry32, unrevealedOf, type PatchData, type StageItem } from "../../craft-stage/engine";
import { stepOutcomesOrTooMany } from "../sim-engine/outcomes";
import { revealOutcomes } from "../sim-engine/reveal-outcomes";
import { boxOutcomeOf } from "./tree-outcome";
import { outBoxOf } from "./tree-shape";
import { engineOmens, isCatalyst } from "./tree-hands";
import { applyHand } from "./tree-hand-core";
import { aimsOf, putCapped, startItemOf } from "./tree-sample";
import { contentOf, nextAimed, startAimed } from "./tree-judge";
import { docPartOf, itemKeyOf } from "./tree-sample-key";
import { isRevealHand, veilPick } from "./tree-veil";
import { isWhittleHand, WHITTLE } from "./tree-whittle";
import { withTreeTune } from "./tree-tune";
import type { Aim, TreeBox, TreeDoc } from "./tree-model";
import { DEV_BUILD } from "../../../web/release-flags";

/** 箱の配置: 代表の品・☑・枠の鍵。note = 決まりで出せなかった訳 (tooMany = 枝が多すぎる手、nobranch = この箱へ行く枝が無い、split = 分かれ目の下) */
export interface Frame { item: StageItem; aimed: ReadonlySet<string>; key: string; p: number; note: string | null }
/** 手の箱で、行き先の箱が無かった枝 (結果の種類ごとに確率の合計) */
export interface FrameMiss { box: string; out: string; p: number }
export interface FrameTree { frames: Map<string, Frame>; miss: FrameMiss[] }

type Outcome = ReturnType<typeof boxOutcomeOf>;
type Br = { item: StageItem; p: number };
interface Split { to: Map<string, Br[]>; lost: Map<string, number> }
const missKey = (oc: Outcome): string => `${oc.out}${oc.hits.length ? `:${oc.hits.map((a) => a.modId).join("+")}` : ""}${oc.junkKey ? ` [${oc.junkKey}]` : ""}`;
/** 先読みで比べる枝の数の上限 (重い順) */
const LOOK = 8;

/**
 * 手の起こりうる行き先 (打たない)。数え上げで表せない手 (ルーン・品質・無限のエッセンスなど結果が 1 つに決まる物) は決まった種で 1 回当てるだけ、
 * カタリストはエンジンの 1 個 = 1 回 (oneCatalyst、手順の再生と同じ)。発現で選ぶ手は未発現を出うる MOD ごとに分ける (revealOutcomes)
 */
function outsOf(data: PatchData, item: StageItem, b: TreeBox): Br[] | "tooMany" {
  const h = b.hand!, key = h.currency;
  let rs: Br[];
  if (isRevealHand(key)) rs = [{ p: 1, item }];
  else if (isCatalyst(key)) { const r = applyCurrency(data, item, key, mulberry32(1), [], { oneCatalyst: true }); rs = r.applied ? [{ p: 1, item: r.item }] : []; }
  else {
    // 削りのお告げは段の順位を見ない = 消せる MOD のどれもが消えうる (外れは一律、削りは当たり / ハズレの 2 枝を必ず。S-200 決め (a))
    const om = isWhittleHand(h) ? engineOmens(h).filter((o) => o !== WHITTLE) : engineOmens(h);
    const s = stepOutcomesOrTooMany(data, item, key, om, { merge: (r) => itemKeyOf(r.item) });
    if (s === "tooMany") return s;
    if (s) rs = s.filter((r) => !r.void);
    else { const r = applyHand(data, item, key, mulberry32(1), { omens: h.omens }); rs = r.applied ? [{ p: 1, item: r.item }] : []; }
  }
  if (veilPick(h)) rs = rs.flatMap((r) => (unrevealedOf(r.item) ? revealOutcomes(data, r.item).map((x) => ({ p: r.p * x.p, item: x.item })) : [r]));
  const tot = rs.reduce((n, r) => n + r.p, 0) || 1;
  return rs.map((r) => ({ item: r.item, p: r.p / tot }));
}

/**
 * 分けた枝の覚え (データごと)。答えは木の前提 (狙い・置き石)・代表の品・☑・手・箱と子の札だけで決まるので、開く・組み替えで木が 1 手ずつ変わる間も
 * 変わらない所は引き直さない (覚えないと 1 手ごとに全部の箱を数え直し、小さな木の開きが前の作りより遅くなった)
 */
const SPLITS = new WeakMap<PatchData, Map<string, Split | "tooMany">>();
const SPLITS_MAX = 20000;
const splitKeyOf = (doc: TreeDoc, b: TreeBox, f: { item: StageItem; aimed: ReadonlySet<string> }, part: string): string =>
  JSON.stringify([part, b.out, b.aim, b.junkKey, b.hand, b.outs.map((o) => { const c = doc.boxes[o]; return c ? [o, c.out, c.aim, c.junkKey, c.mergedOuts, c.seen] : null; }), [...f.aimed].sort(), itemKeyOf(f.item)]);
function splitOf(data: PatchData, doc: TreeDoc, b: TreeBox, f: { item: StageItem; aimed: ReadonlySet<string> }, aims: readonly Aim[], part: string): Split | "tooMany" {
  let m = SPLITS.get(data);
  if (!m) SPLITS.set(data, (m = new Map()));
  const k = splitKeyOf(doc, b, f, part), had = m.get(k);
  if (had) return had;
  const s = splitRaw(data, doc, b, f, aims);
  putCapped(m, k, s, SPLITS_MAX);
  return s;
}
/** 代表の品 f に箱 b の手を当てた枝を、行き先の箱ごとに分ける。当たるまでの手 (repeat) は当たりの枝だけ (当たるまで打ち続ける挙動) */
function splitRaw(data: PatchData, doc: TreeDoc, b: TreeBox, f: { item: StageItem; aimed: ReadonlySet<string> }, aims: readonly Aim[]): Split | "tooMany" {
  const rs = outsOf(data, f.item, b);
  if (rs === "tooMany") return rs;
  let ocs = rs.map((r) => ({ r, oc: boxOutcomeOf(data, doc, b, f.item, r.item, aims, f.aimed) }));
  if (b.hand!.repeat) { const hit = ocs.filter((x) => x.oc.out === "hit"); if (hit.length) { const t = hit.reduce((n, x) => n + x.r.p, 0); ocs = hit.map((x) => ({ ...x, r: { ...x.r, p: x.r.p / t } })); } }
  const to = new Map<string, Br[]>(), lost = new Map<string, number>();
  for (const { r, oc } of ocs) {
    const o = outBoxOf(doc, b, oc, r.item);
    if (!o) { const k = missKey(oc); lost.set(k, (lost.get(k) ?? 0) + r.p); continue; }
    (to.get(o) ?? to.set(o, []).get(o)!).push(r);
  }
  return { to, lost };
}
const lostP = (s: Split | "tooMany"): number => (s === "tooMany" ? 0 : [...s.lost.values()].reduce((n, p) => n + p, 0));

/**
 * 箱の比べ (judgeMemo) を配置でする (S-200 段階 2)。開発版だけ (オーナーの OK の後に本番へ)、開発版で前のままを見る時は URL に ?off=frameJudge
 * (release-flags と同じ書き方。release-flags はデザイン部の持ち物なので、本番に出す時にスイッチの名前を頼む)
 */
export const FRAME_JUDGE: boolean = DEV_BUILD && !(typeof location !== "undefined" && (new URLSearchParams(location.search).get("off") ?? "").split(",").includes("frameJudge"));

/** 配置の鍵 = 中身の鍵から品質の % を抜いた物 (品質の % は配置に入れない、カタリストの +1% / +2% は同じ箱。S-200 ②、11-06 ブラック 49 の決め A)。カタリストの種類は残す */
export const frameKeyOf = (k: string): string => k.replace(/~q\d+\.\d*\./, "~q.");

/** 木の形 (位置・メモを除く) が同じ間は配置を 1 回だけ出す (judgeMemo は組み替え・回しのたびに作り直す) */
const FRAMES = new WeakMap<PatchData, WeakMap<TreeDoc, { sig: string; ft: FrameTree }>>();
const sigOf = (doc: TreeDoc): string => JSON.stringify(doc, (k, v: unknown) => (k === "x" || k === "y" || k === "note" ? undefined : v));
export function frameOfDoc(data: PatchData, doc: TreeDoc): FrameTree {
  let m = FRAMES.get(data);
  if (!m) FRAMES.set(data, (m = new WeakMap()));
  const sig = sigOf(doc), had = m.get(doc);
  if (had?.sig === sig) return had.ft;
  const ft = frameTree(data, doc);
  m.set(doc, { sig, ft });
  return ft;
}

export function frameTree(data: PatchData, doc: TreeDoc): FrameTree {
  return withTreeTune(doc, () => {
    const frames = new Map<string, Frame>(), miss: FrameMiss[] = [], aims = aimsOf(doc), part = docPartOf(doc);
    const st = startItemOf(data, doc, mulberry32(1)), sa = startAimed(data, doc, st.item);
    frames.set("start", { item: st.item, aimed: sa, key: frameKeyOf(contentOf(data, doc, st.item, sa)), p: 1, note: st.note });
    const q = ["start"];
    while (q.length) {
      const id = q.shift()!, b = doc.boxes[id], f = frames.get(id);
      if (!b || !f) continue;
      const kids = b.outs.filter((o) => doc.boxes[o]);
      q.push(...kids);
      // 手の無い箱の下 (分かれ目の行・ヒネコラのハズレ) は親の代表のまま
      const same = (o: string, note: string | null): void => { frames.set(o, { ...f, note }); };
      if (!b.hand) { for (const o of kids) same(o, b.split ? "split" : null); continue; }
      const s = splitOf(data, doc, b, f, aims, part);
      if (s === "tooMany") { for (const o of kids) same(o, "tooMany"); continue; }
      for (const [out, p] of s.lost) miss.push({ box: id, out, p });
      for (const o of kids) {
        const c = doc.boxes[o]!, brs = s.to.get(o);
        if (c.seen || !brs?.length) { same(o, c.seen ? null : "nobranch"); continue; }
        const sum = brs.reduce((n, r) => n + r.p, 0);
        const pick = (r: Br): Frame => { const am = nextAimed(data, doc, f.aimed, o, r.item, f.item); return { item: r.item, aimed: am, key: frameKeyOf(contentOf(data, doc, r.item, am)), p: sum, note: null }; };
        const heavy = [...brs].sort((x, y) => y.p - x.p).slice(0, LOOK);
        // 箱の配置に合う枝 = その箱の手で行き先の無い結果が一番少ない枝 (手の無い箱・枝 1 つは重い方)
        let best = pick(heavy[0]!);
        if (c.hand && heavy.length > 1) {
          let bestLost = lostP(splitOf(data, doc, c, best, aims, part));
          for (const r of heavy.slice(1)) {
            if (bestLost === 0) break;
            const fr = pick(r), l = lostP(splitOf(data, doc, c, fr, aims, part));
            if (l < bestLost - 1e-9) { best = fr; bestLost = l; }
          }
        }
        frames.set(o, best);
      }
    }
    return { frames, miss };
  });
}
