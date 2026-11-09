/**
 * tree-frame.ts — 箱の配置 (枠) を、見本を打たずにエンジンの決まり (数え上げ stepOutcomes = parts の説明文どおりの動き) から出す (S-200・E-99、11-06 オーナー
 * 「カオスの挙動で起こりうる結果をただ枝にするだけやん　なんでまいてまいて初めましてなん」「まず1000回のやつ廃止ね絶対」)。
 * 始まりの品から、箱ごとに代表の品を 1 つ持つ。手のある箱は代表の品に手を 1 回数え上げ、出た枝を回す時と同じ boxOutcomeOf → outBoxOf で結果の箱へ分ける。
 * 代表は、その箱へ行く枝のうち、その箱の手を打った時に行き先の無い結果が一番少ない物 (1 手先読み。同じなら重い方) = 箱の配置に合う枝 (S-200 ③)。
 * 乱数も打ち直しも無い。行き先の箱が無い枝 = 起こりうるのに枝が無い結果 (miss)。
 * 段階 2: まだ組む所は使わない (今の見本の作りと並べて違いを数えるだけ)
 */
import { mulberry32, occupiedFamiliesOf, unrevealedOf, type PatchData, type StageItem } from "../../craft-stage/engine";
import { stepOutcomesOrTooMany } from "../sim-engine/outcomes";
import { revealOutcomes } from "../sim-engine/reveal-outcomes";
import { boxOutcomeOf, essenceHold } from "./tree-outcome";
import { outBoxOf } from "./tree-shape";
import { engineOmens, isCatalyst } from "./tree-hands";
import { applyHand } from "./tree-hand-core";
import { aimsOf, docHeld, playHand, putCapped, startItemOf } from "./tree-sample";
import { blockMarkOf, contentOf, nextAimed, startAimed, treeFamilies } from "./tree-judge";
import { docPartOf, itemKeyOf } from "./tree-sample-key";
import { isRevealHand, veilPick } from "./tree-veil";
import { aimedAims, carryFloors, isWhittleHand, rankVariants } from "./tree-whittle";
import { keptAimedOf } from "./tree-keep";
import { withTreeTune } from "./tree-tune";
import { holdsAt } from "./tree-foresee";
import { sureFracOn, sureFracture } from "./tree-sure-frac";
import { divineBranches, isDivineAim } from "./tree-divine";
import { fullExample, isRecipeV1, pathKeysOf, RECIPE_V2, slimExample, toRecipeV1, type RecipeExample } from "./tree-recipe-v1";
import type { Aim, TreeBox, TreeDoc } from "./tree-model";

/** 箱の配置: 代表の品・☑・枠の鍵。note = 決まりで出せなかった訳 (tooMany = 枝が多すぎる手、nobranch = この箱へ行く枝が無い、split = 分かれ目の下) */
export interface Frame { item: StageItem; aimed: ReadonlySet<string>; key: string; p: number; note: string | null; /** 代表のほかにこの箱へ着く枝の品 (重い順、見本の種 2 以降 = 「見本を幾つか見る」所が 1 品の答えにならないように) */ alts?: readonly StageItem[] }
/** 手の箱で、行き先の箱が無かった枝 (結果の種類ごとに確率の合計)。from = ↩ で着く人の箱 (その箱の代表の品に手を当てた枝)、oc = 結果の分け */
export interface FrameMiss { box: string; out: string; p: number; from?: string; oc: Outcome }
/** 代表のほか (↩ で着く人・印の違う枝) の形で、その箱の手が打てない (cant) か、当たるまでの手が当たらない (noHit)。from = その形の元の箱 */
export interface FrameCant { box: string; from: string; why: "cant" | "noHit" }
export interface FrameTree { frames: Map<string, Frame>; miss: FrameMiss[]; cant: FrameCant[] }

type Outcome = ReturnType<typeof boxOutcomeOf>;
/** off = 札の鍵 (junkKey) の合わない結果を種類の合う箱へ寄せた枝 (代表には後に選ぶ) */
type Br = { item: StageItem; p: number; off?: true };
/** noHit = 当たるまでの手で当たりの枝が 1 つも無い (打ち続けても当たらない) */
interface Split { to: Map<string, Br[]>; lost: Map<string, { p: number; oc: Outcome }>; noHit?: boolean }
const missKey = (oc: Outcome): string => `${oc.out}${oc.hits.length ? `:${oc.hits.map((a) => a.modId).join("+")}` : ""}${oc.junkKey ? ` [${oc.junkKey}]` : ""}`;
/** 先読みで比べる枝の数の上限 (重い順) */
const LOOK = 8;
/** 重い順の LOOK の外から足す、外れの印 (g) の違う枝の数の上限 (1 箱ごと。多いと 8 MOD ワンドの開きが 0.5 → 1.1 秒) */
const MARKED = 2;

/**
 * 手の起こりうる行き先 (打たない)。数え上げで表せない手 (ルーン・品質・無限のエッセンスなど結果が 1 つに決まる物) は決まった種で 1 回当てるだけ、
 * カタリストは回す時と同じ playHand (品質の上限まで繰り返す 1 手、11-06 オーナー「A」)。発現で選ぶ手は未発現を出うる MOD ごとに分ける (revealOutcomes)
 */
function outsOf(data: PatchData, item: StageItem, b: TreeBox, wanted: readonly Aim[] = []): Br[] | "tooMany" {
  const h = b.hand!, key = h.currency;
  let rs: Br[];
  if (isRevealHand(key)) rs = [{ p: 1, item }];
  // 打たないエッセンス / 合金 (飛ばす / 塞がる、S-33e) は品のままの 1 枝 (boxOutcomeOf が塞がった / 当たりへ分ける)
  else if (essenceHold(data, item, key)) return [{ p: 1, item }];
  // 目標の数値を決めた神 (S-202): 目標の以上 / 未満の 2 枝 (予見リセットは以上の 1 枝)
  else if (isDivineAim(h)) rs = divineBranches(data, item, h, (it) => { const r = applyHand(data, it, key, mulberry32(1), { omens: h.omens }); return r.applied ? r.item : null; });
  else if (isCatalyst(key)) { const r = playHand(data, item, h, mulberry32(1)); rs = r.applied ? [{ p: 1, item: r.item }] : []; }
  else if (isWhittleHand(h)) {
    // 削減は一番低い MOD レベルの MOD が消える (E-33)。外れの MOD レベルは、その外れが付いた手の池で出うる MOD レベルの出方ごとに差し替えて打つ
    // (tree-whittle の rankVariants、割合 = その出方の重み)。消えうる MOD が 1 つなら 1 枝 (11-07 オーナー「削減の対象先がハズレMODの場合かな」で決め (a) の「2 枝を必ず」をやめた、S-65b)
    rs = [];
    for (const v of rankVariants(data, item, wanted)) {
      const s = stepOutcomesOrTooMany(data, v.item, key, engineOmens(h), { merge: (r) => itemKeyOf(r.item) });
      if (s === "tooMany") return s;
      // 残った外れに、消えた MOD の MOD レベルを下限として持たせる (次の削減で絞る、S-65b)
      if (s) rs.push(...s.filter((r) => !r.void).map((r) => { carryFloors(data, v.item, r.item, wanted); return { p: v.p * r.p, item: r.item }; }));
    }
  } else {
    const s = stepOutcomesOrTooMany(data, item, key, engineOmens(h), { merge: (r) => itemKeyOf(r.item) });
    if (s === "tooMany") return s;
    if (s) rs = s.filter((r) => !r.void);
    else { const r = applyHand(data, item, key, mulberry32(1), { omens: h.omens }); rs = r.applied ? [{ p: 1, item: r.item }] : []; }
  }
  if (veilPick(h)) rs = rs.flatMap((r) => (unrevealedOf(r.item) ? revealOutcomes(data, r.item).map((x) => ({ p: r.p * x.p, item: x.item })) : [r]));
  // ほかの手は残った MOD の下限をそのまま持ち回る (削減の手は上で付けた)
  if (!isWhittleHand(h)) for (const r of rs) if (r.item !== item) carryFloors(data, item, r.item, null);
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
  // デイリーの確定フラクチャー (D-03): ✦ の MOD が固定された 1 枝 (印の MOD が固定されえない品はいつもどおり)
  const sure = sureFracOn(doc, b.hand) ? sureFracture(data, doc, f.item, b.hand!) : null;
  const rs = sure ? [{ p: 1, item: sure.item }] : outsOf(data, f.item, b, isWhittleHand(b.hand!) ? aimedAims(aims, keptAimedOf(data, doc, b.hand, f.aimed)) : []);
  if (rs === "tooMany") return rs;
  let ocs = rs.map((r) => ({ r, oc: boxOutcomeOf(data, doc, b, f.item, r.item, aims, f.aimed) }));
  let noHit = false;
  if (b.hand!.repeat) { const hit = ocs.filter((x) => x.oc.out === "hit"); if (hit.length) { const t = hit.reduce((n, x) => n + x.r.p, 0); ocs = hit.map((x) => ({ ...x, r: { ...x.r, p: x.r.p / t } })); } else noHit = ocs.length > 0; }
  const to = new Map<string, Br[]>(), lost: Split["lost"] = new Map();
  for (const { r, oc } of ocs) {
    const o = outBoxOf(data, doc, b, oc, r.item);
    if (!o) { const k = missKey(oc); lost.set(k, { p: (lost.get(k)?.p ?? 0) + r.p, oc }); continue; }
    const off = !!oc.junkKey && !!doc.boxes[o]?.junkKey && doc.boxes[o]!.junkKey !== oc.junkKey;
    (to.get(o) ?? to.set(o, []).get(o)!).push(off ? { ...r, off } : r);
  }
  return noHit ? { to, lost, noHit } : { to, lost };
}
/** MOD の系統 (E-11a) の覚え */
const FAM = new WeakMap<PatchData, Map<string, readonly string[]>>();
function famOf(data: PatchData, modId: string): readonly string[] {
  let m = FAM.get(data);
  if (!m) FAM.set(data, (m = new Map()));
  let f = m.get(modId);
  if (!f) { const md = data.mods.get(modId); f = md ? occupiedFamiliesOf(md) : []; m.set(modId, f); }
  return f;
}
const lostP = (s: Split | "tooMany"): number => (s === "tooMany" ? 0 : [...s.lost.values()].reduce((n, x) => n + x.p, 0));

/** 配置の鍵 = 中身の鍵の品質を有り / 無しだけにした物 (% の違いは同じ箱 = カタリストの +1% / +2% は同じ箱。S-200 ②、11-06 オーナー「品質はありなしていいやろ今までと同じ」)。カタリストの種類は残す */
export const frameKeyOf = (k: string): string => k.replace(/~q(\d+)\.(\d*)\./, (_, q: string, c: string) => `~q${Number(q) > 0 || Number(c || 0) > 0 ? 1 : 0}.`);

/** 木の形 (位置・メモを除く) が同じ間は配置を 1 回だけ出す (judgeMemo は組み替え・回しのたびに作り直す) */
const FRAMES = new WeakMap<PatchData, WeakMap<TreeDoc, { sig: string; held: number; ft: FrameTree }>>();
// 例のアイテム (examples) は開いた時に 1 回入れて変えないので鍵に入れない (丸ごと JSON にすると 1 手ごとに重い)
const sigOf = (doc: TreeDoc): string => JSON.stringify(doc, (k, v: unknown) => (k === "x" || k === "y" || k === "note" || k === "examples" ? undefined : v));
export function frameOfDoc(data: PatchData, doc: TreeDoc): FrameTree {
  let m = FRAMES.get(data);
  if (!m) FRAMES.set(data, (m = new WeakMap()));
  // holdDocSig の同じ回の中は木が変わらないので、鍵の JSON を作り直さない (結果の一覧を箱ごとに出す間に毎回木を丸ごと JSON にしていた、S-28g の 8 MOD)
  const held = docHeld(doc), had = m.get(doc);
  if (had && held && had.held === held) return had.ft;
  const sig = sigOf(doc);
  if (had?.sig === sig) { had.held = held; return had.ft; }
  const ft = frameTree(data, doc);
  m.set(doc, { sig, held, ft });
  return ft;
}

/** 配置を出している最中 (中で見本を引いても配置へ戻らない) */
let framing = false;
/**
 * 箱の見本の代わりの代表の品 (S-200 段階 3・4)。見本を引く所 (結果の箱の分け・箱のカード・☑) は全部これを通る = 打ち直さない。
 * この箱へ行く枝が無い箱は作れない見本 (none)。決まりで出せない箱 (枝の多すぎる手の下・分かれ目の下) は null = 前の見本のまま
 */
export function frameSample(data: PatchData, doc: TreeDoc, id: string, seed = 1): { item: StageItem; note: string | null } | null {
  if (framing) return null;
  framing = true;
  try {
    const f = frameOfDoc(data, doc).frames.get(id);
    if (!f) return null;
    // 種 2 以降は代表のほかにこの箱へ着く枝の品 (無ければ代表)。打ち直さない (S-200 段階 3・4)
    if (!f.note) return { item: (seed > 1 && f.alts?.[seed - 2]) || f.item, note: null };
    return f.note === "nobranch" ? { item: f.item, note: "none" } : null;
  } finally { framing = false; }
}

/** 木の箱ごとの例のアイテム (道の札 → 代表の品)。決まりで出せなかった箱 (枝の多すぎる手の下・分かれ目の下・行く枝の無い箱) は入れない */
export function examplesOf(data: PatchData, doc: TreeDoc): Record<string, RecipeExample> {
  const frames = frameOfDoc(data, doc).frames, out: Record<string, RecipeExample> = {};
  for (const [id, k] of pathKeysOf(doc)) { const f = frames.get(id); if (f && !f.note) out[k] = slimExample(f.item); }
  return out;
}
/**
 * 保存する形 (S-104・S-200 ⑦): 打ち方 (v1) + 例のアイテム (v2)。
 * 保存の形 (箱の無い、URL から来た物) は持っている例をそのまま。データがまだ無い時は v1
 */
export function recipeOf(data: PatchData | null | undefined, d: TreeDoc): TreeDoc {
  const rec = toRecipeV1(d);
  const ex = isRecipeV1(d) ? d.examples : data && d.boxes.start ? examplesOf(data, d) : undefined;
  return ex && Object.keys(ex).length ? { ...rec, schema: RECIPE_V2, examples: JSON.parse(JSON.stringify(ex)) as Record<string, RecipeExample> } : rec;
}

/** 例のアイテムから組んだ品の覚え (組み直しの 1 手ごとに配置を出し直すので、毎回作ると重い。品は同じ物を使い回す = 品の鍵の覚えも効く) */
const EXAMPLES = new WeakMap<RecipeExample, { start: string; item: StageItem }>();

export function frameTree(data: PatchData, doc: TreeDoc): FrameTree {
  return withTreeTune(doc, () => {
    const frames = new Map<string, Frame>(), miss: FrameMiss[] = [], aims = aimsOf(data, doc), part = docPartOf(data, doc);
    const st = startItemOf(data, doc, mulberry32(1)), sa = startAimed(data, doc, st.item);
    // 保存の例のアイテム (v2、S-200 ⑦)。同じ配置の枝があればその代わりに代表にする。例の無い箱・古いレシピは種 1 つのまま (決め (c))
    const keys = doc.examples ? pathKeysOf(doc) : null;
    const exOf = (id: string): StageItem | null => {
      const e = keys ? doc.examples![keys.get(id) ?? ""] : undefined;
      if (!e) return null;
      const had = EXAMPLES.get(e);
      if (had?.start === st.item.base) return had.item;
      const item = fullExample(st.item, e);
      EXAMPLES.set(e, { start: st.item.base, item });
      return item;
    };
    const sf: Frame = { item: st.item, aimed: sa, key: frameKeyOf(contentOf(data, doc, st.item, sa)), p: 1, note: st.note }, se = exOf("start");
    const sea = se ? startAimed(data, doc, se) : null;
    frames.set("start", se && sea && frameKeyOf(contentOf(data, doc, se, sea)) === sf.key ? { ...sf, item: se, aimed: sea } : sf);
    /**
     * 代表のほかに手を当てる形 (S-21 を配置で、打ち直さない): at の箱の手を f に当てた枝の、行き先の無い結果を from 付きの miss にする (開く・整理で箱を足す)。
     * ↩ で着く人 (from = ↩ 元の箱) と、1 つの箱に形の違う枝が入る時のほかの形 (狙い無しの結果を 1 箱にした any など。from = その箱、重い順に LOOK まで)
     */
    const extra: Array<{ at: string; f: Frame; from: string }> = [];
    const cant: FrameCant[] = [], fams = treeFamilies(data, doc);
    /** 木の族を塞ぎうる MOD の組 (狙いも入る粗い分け。印の違う枝を探すだけ) */
    const famSig = (it: StageItem): string => (fams.size ? [...it.prefixes, ...it.suffixes].filter((m) => !m.unrevealed && famOf(data, m.modId).some((x) => fams.has(x))).map((m) => m.modId).sort().join(",") : "");
    /** 枝 brs (元の箱の代表 from に手を当てた物) から、箱 o の代表を選ぶ。箱の配置に合う枝 = その箱の手で行き先の無い結果が一番少ない枝 (手の無い箱・枝 1 つは重い方) */
    const bestOf = (o: string, brs: Br[], from: Frame): Frame => {
      const c = doc.boxes[o]!, sum = brs.reduce((n, r) => n + r.p, 0);
      const pick = (r: Br): Frame => { const am = nextAimed(data, doc, from.aimed, o, r.item, from.item); return { item: r.item, aimed: am, key: frameKeyOf(contentOf(data, doc, r.item, am)), p: sum, note: null }; };
      // 札の鍵の合う枝を先に (削減は順位を見ずに枝を出すので (決め (a))、エンジンでは消えない狙いが消えた枝が「クリティカルが消えた」の箱の代表になった、11-07 猿の照らし b29)
      const sorted = [...brs].sort((x, y) => Number(!!x.off) - Number(!!y.off) || y.p - x.p), heavy = sorted.slice(0, LOOK);
      const all = heavy.map(pick);
      // 重い順の LOOK に入らない枝も、木の族を塞ぐ MOD の組が違えば 1 つずつ当てる (外れの印 (g) の違う枝、代表には選ばない)
      const seenSig = new Set(heavy.map((r) => famSig(r.item))), marks = new Set(all.map((fr) => blockMarkOf(data, doc, fr.item, fr.aimed))), marked: Frame[] = [];
      for (const r of sorted.slice(LOOK)) {
        const s = famSig(r.item);
        if (seenSig.has(s) || marked.length >= MARKED) continue;
        seenSig.add(s);
        const fr = pick(r), mk = blockMarkOf(data, doc, fr.item, fr.aimed);
        if (!marks.has(mk)) { marks.add(mk); marked.push(fr); }
      }
      const ex = exOf(o), fe = ex ? pick({ item: ex, p: sum }) : null, saved = !!fe && all.some((fr) => fr.key === fe.key);
      let best = saved ? fe! : all[0]!;
      if (c.hand && heavy.length > 1) {
        let bestLost = saved ? 0 : lostP(splitOf(data, doc, c, best, aims, part));
        for (const fr of all.slice(1)) {
          if (bestLost === 0) break;
          const l = lostP(splitOf(data, doc, c, fr, aims, part));
          if (l < bestLost - 1e-9) { best = fr; bestLost = l; }
        }
      }
      // 代表と枠の違う形: 手の箱はその手を当て、手の無い ↩ の箱は ↩ 先の手を当てる (S-21 を配置で。↩ の箱は前は代表 1 つだけ = FmNY7Wwv b23)
      const at = c.hand ? o : c.back && doc.boxes[c.back] ? c.back : null;
      // 枠が同じでも外れの印 (g) が違えば当てる (印は枠の比べに入れない、tree-judge の blockMarkOf)
      const markOf = (fr: Frame): string => `${fr.key}|${blockMarkOf(data, doc, fr.item, fr.aimed)}`;
      if (at) { const keys = new Set([markOf(best)]); for (const fr of [...all, ...marked]) { const k = markOf(fr); if (!keys.has(k)) { keys.add(k); extra.push({ at, f: fr, from: o }); } } }
      // 数値の両端の形 (前の rollEnds) は当てない: 木の数値は既定で段の下限、数値を決めるのは神の目標 (S-202 ②、11-06 オーナー)
      const alts = [...all, ...marked].filter((fr) => fr !== best).map((fr) => fr.item);
      return alts.length ? { ...best, alts } : best;
    };
    const walk = (q: string[]): void => { while (q.length) {
      const id = q.shift()!, b = doc.boxes[id], f = frames.get(id);
      if (!b || !f) continue;
      const kids = b.outs.filter((o) => doc.boxes[o]);
      q.push(...kids);
      // 手の無い箱の下 (分かれ目の行・ヒネコラのハズレ) は親の代表のまま
      const same = (o: string, note: string | null): void => { frames.set(o, { ...f, note }); };
      // 代表を出せない箱 (枝の多すぎる手の下・分かれ目の下) の下も全部出せない = 見本の打ち直しのまま (S-200。前は 1 段下だけで、錬金術 → 骨の箱を白の品で数え、ノーマル・MOD なしの見本になった)
      if (f.note === "tooMany" || f.note === "split") { for (const o of kids) same(o, f.note); continue; }
      if (!b.hand) { for (const o of kids) same(o, b.split ? "split" : null); continue; }
      const s = splitOf(data, doc, b, f, aims, part);
      if (s === "tooMany") { for (const o of kids) same(o, "tooMany"); continue; }
      for (const [out, x] of s.lost) miss.push({ box: id, out, p: x.p, oc: x.oc });
      if (s.noHit) cant.push({ box: id, from: id, why: "noHit" });
      // ヒネコラの結果の箱 (予見の箱、S-39) は MOD の変わらない同じ予見済みの品。当たり / ハズレは持った手の結果の分けなので、枝の無い箱もヒネコラの枝を持つ
      const held = [...s.to.values()].flat();
      for (const o of kids) {
        const c = doc.boxes[o]!, brs = s.to.get(o) ?? (holdsAt(doc, o) && held.length ? held : undefined);
        // 枝の来ない箱も印はこの箱の手の後 (残したい MOD の ☑ の無い候補は外れ、S-27e)。親の印の写しのままだと、その下の箱で ☑ しなかった MOD が狙いと出た
        // (11-07 カオス + 左側の抹消 b19 と親 b14 の手の窓のカード、a61362897)。品は親の代表のまま (作れない見本 = カードも親の品)
        if (c.seen) { same(o, null); continue; }
        if (!brs?.length) { frames.set(o, { ...f, aimed: nextAimed(data, doc, f.aimed, o, f.item, f.item), note: "nobranch" }); continue; }
        frames.set(o, bestOf(o, brs, f));
      }
    } };
    walk(["start"]);
    for (const a of Object.values(doc.boxes)) { const fa = frames.get(a.id); if (a.back && a.back !== a.id && fa && !fa.note) extra.push({ at: a.back, f: fa, from: a.id }); }
    // 代表では枝の無い箱はほかの形の枝を代表にし、その下を出し直す (その下にまた ↩・ほかの形があるので、変わらなくなるまで。上限 3 回)
    const done = new Set<string>();
    for (let pass = 0; pass < 3 && extra.length; pass++) {
      const again: string[] = [];
      for (const { at, f: fa, from } of extra.splice(0)) {
        const x = doc.boxes[at], k = `${at}|${from}|${fa.key}|${blockMarkOf(data, doc, fa.item, fa.aimed)}`;
        if (!x?.hand || done.has(k)) continue;
        done.add(k);
        const s = splitOf(data, doc, x, fa, aims, part);
        if (s === "tooMany") continue;
        // 代表のほかの形でこの手が打てない・当たるまでが当たらない (外れの印 (g) の違う枝など。回すとここで止まる)
        if (!s.to.size && !s.lost.size) cant.push({ box: at, from, why: "cant" });
        else if (s.noHit) cant.push({ box: at, from, why: "noHit" });
        for (const [out, y] of s.lost) miss.push({ box: at, out, p: y.p, from, oc: y.oc });
        for (const o of x.outs) {
          const brs = s.to.get(o);
          if (!brs?.length || frames.get(o)?.note !== "nobranch") continue;
          frames.set(o, bestOf(o, brs, fa));
          again.push(o);
        }
      }
      if (again.length) walk(again);
    }
    return { frames, miss, cant };
  });
}
