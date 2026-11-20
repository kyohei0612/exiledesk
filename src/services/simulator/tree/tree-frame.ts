/**
 * tree-frame.ts — 箱の配置 (枠) を、見本を打たずにエンジンの決まり (数え上げ stepOutcomes = parts の説明文どおりの動き) から出す (S-200・E-99、11-06 オーナー
 * 「カオスの挙動で起こりうる結果をただ枝にするだけやん　なんでまいてまいて初めましてなん」「まず1000回のやつ廃止ね絶対」)。
 * 始まりの品から、箱ごとに代表の品を 1 つ持つ。手のある箱は代表の品に手を 1 回数え上げ、出た枝を回す時と同じ boxOutcomeOf → outBoxOf で結果の箱へ分ける。
 * 代表は、その箱へ行く枝のうち、その箱の手を打った時に行き先の無い結果が一番少ない物 (1 手先読み。同じなら重い方) = 箱の配置に合う枝 (S-200 ③)。
 * 乱数も打ち直しも無い。行き先の箱が無い枝 = 起こりうるのに枝が無い結果 (miss)。
 * 段階 2: まだ組む所は使わない (今の見本の作りと並べて違いを数えるだけ)
 */
import { aimHits, mulberry32, occupiedFamiliesOf, sameAimTarget, stageTuning, unrevealedOf, type PatchData, type StageItem, type StageSide } from "../../craft-stage/engine";
import { stepOutcomesOrTooMany } from "../sim-engine/outcomes";
import { revealOutcomes } from "../sim-engine/reveal-outcomes";
import { boxOutcomeOf, essenceHold } from "./tree-outcome";
import { aimFloorItem } from "./tree-aim-floor";
import { goalFamilies, itemTaking, junkClean, junkTaking, swapJunk } from "./tree-junk-frame";
import { outBoxOf } from "./tree-shape";
import { engineOmens, isCatalyst } from "./tree-hands";
import { applyHand } from "./tree-hand-core";
import { aimsOf, docHeld, holdDocSig, playHand, putCapped, startItemOf } from "./tree-sample";
import { aimHeldOn } from "./tree-aim";
import { aimTargetOf } from "./tree-ele-any";
import { blockMarkOf, contentAimsKey, contentOf, keyForBox, nextAimed, startAimed, treeFamilies } from "./tree-judge";
import { docPartOf, itemKeyOf } from "./tree-sample-key";
import { isRevealHand, veilPick } from "./tree-veil";
import { carryFloors, floorKeyOf, handWhittleSide, isWhittleHand, lvClassOf, lvPart, rankVariants } from "./tree-whittle";
import { bandCompare, frameGroupKey, frameHandOf, whittleCompare } from "./tree-whittle-scene";
import type { MissAims } from "./tree-miss";
import { withTreeTune } from "./tree-tune";
import { setFlowShown } from "./tree-flow-once";
import { reuseOf, stepSig } from "./tree-frame-reuse";
import { holdsAt } from "./tree-foresee";
import { sureFracOn, sureFracture } from "./tree-sure-frac";
import { divineBranches, isDivineAim } from "./tree-divine";
import { fullExample, isRecipeV1, pathKeysOf, RECIPE_V2, slimExample, toRecipeV1, type RecipeExample } from "./tree-recipe-v1";
import type { Aim, TreeBox, TreeDoc } from "./tree-model";
import { ODD_OUTS, oddOf, withOddKey, withoutOdd } from "./tree-odd";
import { builtOf, type TreeBuilt } from "./tree-built";
import { flag, type Flag } from "../../../web/release-flags";

/** 箱の配置: 代表の品・☑・枠の鍵。note = 決まりで出せなかった訳 (tooMany = 枝が多すぎる手、nobranch = この箱へ行く枝が無い、split = 分かれ目の下) */
export interface Frame { item: StageItem; aimed: ReadonlySet<string>; key: string; p: number; note: string | null; /** 代表のほかにこの箱へ着く枝の品 (重い順、見本の種 2 以降 = 「見本を幾つか見る」所が 1 品の答えにならないように) */ alts?: readonly StageItem[] }
/** 手の箱で、行き先の箱が無かった枝 (結果の種類ごとに確率の合計)。from = ↩ で着く人の箱 (その箱の代表の品に手を当てた枝)、oc = 結果の分け */
export interface FrameMiss { box: string; out: string; p: number; from?: string; oc: Outcome }
/** 代表のほか (↩ で着く人・印の違う枝) の形で、その箱の手が打てない (cant) か、当たるまでの手が当たらない (noHit)。from = その形の元の箱 */
/** 見本の配置の枝の元 = 箱とその時の代表 (スイッチ oddStale) */
type Src = readonly [string, Frame];
export interface FrameCant { box: string; from: string; why: "cant" | "noHit" }
export interface FrameTree { frames: Map<string, Frame>; miss: FrameMiss[]; cant: FrameCant[]; /** 手の結果で枠の違う品が 2 つ以上着く箱 (S-27d (ア) の見張り、11-11) */ mixed: string[] }

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
/** (S-21b) 狙いの MOD の組の違う軽い枝に手を当てる上限 */
const ODD = 3;

/**
 * 手の起こりうる行き先 (打たない)。数え上げで表せない手 (ルーン・品質・無限のエッセンスなど結果が 1 つに決まる物) は決まった種で 1 回当てるだけ、
 * カタリストは回す時と同じ playHand (品質の上限まで繰り返す 1 手、11-06 オーナー「A」)。発現で選ぶ手は未発現を出うる MOD ごとに分ける (revealOutcomes)
 */
function outsOf(data: PatchData, item: StageItem, b: TreeBox, wanted: readonly Aim[] = [], lvMiss?: MissAims, lvSide?: StageSide | null): Br[] | "tooMany" {
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
    for (const v of rankVariants(data, item, wanted, b.junkKey, lvMiss, handWhittleSide(h), lvSide)) {
      const s = stepOutcomesOrTooMany(data, v.item, key, engineOmens(h), { merge: (r) => itemKeyOf(r.item) });
      if (s === "tooMany") return s;
      // 残った外れに、消えた MOD の MOD レベルを下限として持たせる (次の削減で絞る、S-65b)
      if (s) rs.push(...s.filter((r) => !r.void).map((r) => { carryFloors(data, v.item, r.item, wanted, key); return { p: v.p * r.p, item: r.item }; }));
    }
  } else {
    const s = stepOutcomesOrTooMany(data, item, key, engineOmens(h), { merge: (r) => itemKeyOf(r.item) });
    if (s === "tooMany") return s;
    if (s) rs = s.filter((r) => !r.void);
    else { const r = applyHand(data, item, key, mulberry32(1), { omens: h.omens }); rs = r.applied ? [{ p: 1, item: r.item }] : []; }
  }
  if (veilPick(h)) rs = rs.flatMap((r) => (unrevealedOf(r.item) ? revealOutcomes(data, r.item).map((x) => ({ p: r.p * x.p, item: x.item })) : [r]));
  // ほかの手は残った MOD の下限をそのまま持ち回る (削減の手は上で付けた)
  if (!isWhittleHand(h)) for (const r of rs) if (r.item !== item) carryFloors(data, item, r.item, null, key);
  const tot = rs.reduce((n, r) => n + r.p, 0) || 1;
  return rs.map((r) => ({ item: r.item, p: r.p / tot }));
}

/**
 * 手の起こりうる行き先の覚え (データごと)。答えは品 (下限の持ち回りも)・手・エンジンの設定だけで決まる (削減の手は外れの差し替えが箱の鍵で変わるので覚えない)。
 * 下の分けの覚え (SPLITS) は鍵に木の狙いの一覧 (part) が入り、開く時の組み直しで当たりの箱が増えるたびに全部外れ、同じ品に同じ手の数え上げを打ち直していた
 * (スマホ 390 で開く時の固まりの 1 割前後、11-10 開く速さの案 D)
 */
const OUTS = new WeakMap<PatchData, Map<string, Br[] | "tooMany">>();
function outsOfMemo(data: PatchData, item: StageItem, b: TreeBox, wanted: readonly Aim[] = [], lvMiss?: MissAims, lvSide?: StageSide | null): Br[] | "tooMany" {
  if (isWhittleHand(b.hand)) return outsOf(data, item, b, wanted, lvMiss, lvSide);
  let m = OUTS.get(data);
  if (!m) OUTS.set(data, (m = new Map()));
  const k = `${JSON.stringify(b.hand)}|${JSON.stringify(stageTuning())}|${floorKeyOf(item)}|${itemKeyOf(item)}`;
  const had = m.get(k);
  if (had) return had;
  const rs = outsOf(data, item, b, wanted, lvMiss);
  putCapped(m, k, rs, SPLITS_MAX);
  return rs;
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
  // 削減の差し替えで見る欲しい MOD と組の比べの相手は同じ札 (tree-whittle-scene の whittleCompare、枠を作る・回す時と同じ)
  const w = isWhittleHand(b.hand!) ? whittleCompare(data, doc, b.hand, f.aimed, f.item) : null, bw = w ? bandCompare(data, doc, b.id, f.aimed, f.item) : null; // 帯の枠は帯の比べる手で絞る (S-65c7)
  const rs = sure ? [{ p: 1, item: sure.item }] : outsOfMemo(data, f.item, b, w ? w.wanted : [], bw ? bw.miss : w?.miss, bw?.side);
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
const sigFull = (doc: TreeDoc): string => JSON.stringify(doc, (k, v: unknown) => (k === "x" || k === "y" || k === "note" || k === "examples" ? undefined : v));
/**
 * スイッチ frameSigOnce: 鍵は同じ木の物ごとに、今の流れ (同じマイクロタスクの間 = 画面の 1 回の描き) の中で 1 回だけ作る。
 * 箱のカードごとに木を丸ごと文字にしていた (4 倍遅く・94 箱で約 0.5 秒、開く・手を置く・タブ替えのたびに)。
 * 木をその場で書き換える所 (並べ・消去の札) があるので、木の物そのものを鍵にはしない。次の流れでは必ず作り直す。
 * 覚えるのは画面に出ている木だけ (組み替えの途中の木 = edit の中の整理 tidyJunk は、同じ流れの中で書き換えながら引くので毎回作る)
 */
let sigNow = new WeakMap<TreeDoc, string>(), sigClear = false, sigShown: TreeDoc | null = null;
/** 画面に出ている木を知らせる (use-row-settle が木を替えるたびに呼ぶ) */
export const setSigShown = (d: TreeDoc): void => { sigShown = d; setFlowShown(d); };
const sigOf = (doc: TreeDoc): string => {
  if (!flag("frameSigOnce") || doc !== sigShown) return sigFull(doc);
  let s = sigNow.get(doc);
  if (s === undefined) {
    sigNow.set(doc, (s = sigFull(doc)));
    if (!sigClear) { sigClear = true; queueMicrotask(() => { sigNow = new WeakMap(); sigClear = false; }); }
  }
  return s;
};
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
export function recipeOf(data: PatchData | null | undefined, d: TreeDoc, withBuilt = true): TreeDoc {
  const rec = toRecipeV1(d);
  const ex = isRecipeV1(d) ? d.examples : data && d.boxes.start ? examplesOf(data, d) : undefined;
  const out: TreeDoc = ex && Object.keys(ex).length ? { ...rec, schema: RECIPE_V2, examples: JSON.parse(JSON.stringify(ex)) as Record<string, RecipeExample> } : rec;
  // 組み上がった木の写し (S-104b): 組んだ木なら今の作りで作る、保存の形なら持っている物をそのまま (版・打ち方の比べは開く時に tree-built がする)
  const built = !withBuilt ? undefined : isRecipeV1(d) ? d.built : data ? builtOf(d) : undefined;
  return built ? { ...out, built: JSON.parse(JSON.stringify(built)) as TreeBuilt } : out;
}

/** 例のアイテムから組んだ品の覚え (組み直しの 1 手ごとに配置を出し直すので、毎回作ると重い。品は同じ物を使い回す = 品の鍵の覚えも効く) */
const EXAMPLES = new WeakMap<RecipeExample, { start: string; item: StageItem }>();

/** (スイッチ aimsOnce) 配置を作る間は木を書き換えないので、1 回の囲み (holdDocSig、鍵は要る時だけ) の中で作る = 狙いの組・置き石・木の族を箱ごとに作り直さない */
export function frameTree(data: PatchData, doc: TreeDoc): FrameTree {
  return flag("aimsOnce") ? holdDocSig(doc, () => frameTreeIn(data, doc), true) : frameTreeIn(data, doc);
}
function frameTreeIn(data: PatchData, doc: TreeDoc): FrameTree {
  return withTreeTune(doc, () => {
    const frames = new Map<string, Frame>(), miss: FrameMiss[] = [], mixed = new Set<string>(), aims = aimsOf(data, doc), part = docPartOf(data, doc);
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
    /**
     * 保存の例を代表にする時、例の品は外れの下限を持たない (開いた時に JSON から作った品)。親の代表の下限を持ち回り、親の手の段の下限 (E-11d) を
     * この手で付いた MOD に付ける (S-65c6、スイッチ whittleFloor。前は例の道で下限が無く、上級の手の後の削減に付きえない「同じ」の帯が出た = e0N7mhG3 の 13 段目)
     */
    // 比べる元 (A-r2): 親の箱の保存の例があればそれ (例の品は保存の道で 1 手ずつ続く。親の代表が差し替えの品の時に、例に前からある外れを「この手で付いた」と取り違えない)。
    // 親の例が下限を持たなければ、親の代表から同じ MOD の下限だけ写す (分からない MOD は下限 0 = 付きうる枠を取りこぼさない側)。
    // 親の手が削減なら、消えた MOD の MOD レベルを残った外れの下限に (S-65b、A-r1)。欲しい MOD は枝を作る時 (splitRaw) と同じ whittleCompare
    const exFloored = (o: string, ex: StageItem, from: Pick<Frame, "item" | "aimed">): StageItem => {
      const pid = doc.boxes[o]?.parent ?? "", ph = doc.boxes[pid]?.hand;
      if (!flag("whittleFloor") || !ph || floorKeyOf(ex)) return ex;
      const pex = exOf(pid), before = pex ?? from.item;
      if (pex && pex !== from.item && !floorKeyOf(pex)) carryFloors(data, from.item, pex, null);
      const wanted = isWhittleHand(ph) ? whittleCompare(data, doc, ph, from.aimed, before).wanted : null;
      carryFloors(data, before, ex, wanted, ph.currency);
      return ex;
    };
    const sf: Frame = { item: st.item, aimed: sa, key: frameKeyOf(contentOf(data, doc, st.item, sa)), p: 1, note: st.note }, se = exOf("start");
    const sea = se ? startAimed(data, doc, se) : null;
    frames.set("start", se && sea && frameKeyOf(contentOf(data, doc, se, sea)) === sf.key ? { ...sf, item: se, aimed: sea } : sf);
    /**
     * 代表のほかに手を当てる形 (S-21 を配置で、打ち直さない): at の箱の手を f に当てた枝の、行き先の無い結果を from 付きの miss にする (開く・整理で箱を足す)。
     * ↩ で着く人 (from = ↩ 元の箱) と、1 つの箱に形の違う枝が入る時のほかの形 (狙い無しの結果を 1 箱にした any など。from = その箱、重い順に LOOK まで)
     */
    const extra: Array<{ at: string; f: Frame; from: string; /** 偶然付いた狙いの枝 (S-21b) */ odd?: true; /** 元にした箱とその時の代表 (スイッチ oddStale: 代表が替わった後は当てない) */ src?: Src }> = [];
    /** 今 bestOf が枝を作っている元 (step の箱の代表、ほかの形の枝はその枝の元) */
    let src: Src | undefined;
    /** ほかの形の枝で見本を埋めた箱 → その枝の元 (スイッチ oddStale: 元が替わったら埋め直してよい) */
    const setBy = new Map<string, Src>();
    const stale = (s: Src | undefined): boolean => !!s && flag("oddStale") && frames.get(s[0]) !== s[1];
    const cant: FrameCant[] = [], fams = treeFamilies(data, doc), gf = flag("junkFrameOnly") ? goalFamilies(data, doc, aims) : null;
    // (S-196j) 木全体の鍵 = 箱の外の木 (と完成形の狙い・置き石)・中身の狙いの組・木の族・保存の例の札。始まりの代表は中身が同じなら前の物そのもの (下の段の覚えを使うため)
    const reuse = flag("frameReuse") ? reuseOf(data, [part, contentAimsKey(data, doc), [...fams].sort().join(","), doc.examples ? Object.keys(doc.examples).sort().join(",") : ""].join("\n")) : null;
    if (reuse) { const s0 = frames.get("start")!, r0 = reuse.start; if (r0 && r0.key === s0.key && r0.note === s0.note && [...r0.aimed].sort().join() === [...s0.aimed].sort().join() && itemKeyOf(r0.item) === itemKeyOf(s0.item)) frames.set("start", r0); else reuse.start = s0; }
    /** 木の族を塞ぎうる MOD の組 (狙いも入る粗い分け。印の違う枝を探すだけ) */
    /** (S-21b) 満たしている完成形・木の狙いの組 (段の足りない物は満たさない = エンジンの aimHeldOn。偶然狙いが付いた枝を見分けるだけ) */
    const sigAims = [...aims, ...(doc.memoAims ?? [])];
    const sigT = sigAims.map((a) => aimTargetOf(data, a));
    /** 同じ MOD の狙い (段は見ない、エンジンの sameAimTarget) は一番前の番号にまとめる */
    const canon = sigT.map((t, i) => sigT.findIndex((u, j) => j >= i || sameAimTarget(data, u, t)));
    /** 段を見ない篩いの的 (エンジンの aimHits で品の MOD に当てる。いずれかの元素耐性は篩わない) */
    const loose = sigT.map((t) => ({ ...t, minTierIndex: 0 })), looseOpts = { data, sameText: true };
    const sigMemo = new WeakMap<StageItem, number[]>();
    /** 品が満たす狙いの番号 (品ごとに覚える) */
    const heldIdx = (it: StageItem): number[] => { let s = sigMemo.get(it); if (!s) sigMemo.set(it, (s = sigAims.flatMap((a, i) => (aimHeldOn(data, it, a, { sameText: true }) ? [i] : [])))); return s; };
    /** 品が満たす狙いのまとめた番号 */
    const heldSet = (it: StageItem): Set<number> => new Set(heldIdx(it).map((i) => canon[i]!));
    const aimSig = (it: StageItem): string => heldIdx(it).join(",");
    /** skip (まとめた番号) に無い狙いの MOD を段を見ずに持つか (持たない品は aimHeldOn で判定しない。全部の枝で回すと組むのが 2 倍遅かった) */
    const anyAimMod = (it: StageItem, skip: ReadonlySet<number>): boolean =>
      sigT.some((t, i) => !skip.has(canon[i]!) && (!!t.anyEle || [...it.prefixes, ...it.suffixes].some((m) => aimHits(m, loose[i]!, looseOpts))));
    /** it が満たし rep が満たさない狙いの番号 (満たした物の番号。同じ MOD は前の 1 つ) */
    const oddIdx = (it: StageItem, rep: StageItem): number[] => {
      const r = heldSet(rep), seen = new Set<number>();
      if (!anyAimMod(it, r)) return [];
      return heldIdx(it).filter((i) => !r.has(canon[i]!) && !seen.has(canon[i]!) && !!seen.add(canon[i]!));
    };
    /** it が満たし rep が満たさない狙い (同じ MOD は 1 つ) */
    const oddOn = (it: StageItem, rep: StageItem): Aim[] => oddIdx(it, rep).map((i) => ({ modId: sigAims[i]!.modId, tier: sigAims[i]!.tier }));
    const famSig = (it: StageItem): string => (fams.size ? [...it.prefixes, ...it.suffixes].filter((m) => !m.unrevealed && famOf(data, m.modId).some((x) => fams.has(x))).map((m) => m.modId).sort().join(",") : "");
    /** 枝 brs (元の箱の代表 from に手を当てた物) から、箱 o の代表を選ぶ。箱の配置に合う枝 = その箱の手で行き先の無い結果が一番少ない枝 (手の無い箱・枝 1 つは重い方) */
    const bestOf = (o: string, brs: Br[], from: Frame): Frame => {
      const c = doc.boxes[o]!, sum = brs.reduce((n, r) => n + r.p, 0);
      const pick = (r: Br): Frame => { const am = nextAimed(data, doc, from.aimed, o, r.item, from.item); return { item: r.item, aimed: am, key: frameKeyOf(contentOf(data, doc, r.item, am)), p: sum, note: null }; };
      // 札の鍵の合う枝を先に (削減は順位を見ずに枝を出すので (決め (a))、エンジンでは消えない狙いが消えた枝が「クリティカルが消えた」の箱の代表になった、11-07 猿の照らし b29)
      const sorted = [...brs].sort((x, y) => Number(!!x.off) - Number(!!y.off) || y.p - x.p), heavy = sorted.slice(0, LOOK);
      const all = heavy.map(pick);
      // 1 つの箱に枠の違う品が着く (結果が 2 通り以上なのに箱が 1 つ = S-27d (ア) の外れ、11-11 ごめんね)。「どれか」の当たり・まとめた箱は人が選んだので見ない
      // 比べは箱をつなぐ時と同じ (keyForBox: この箱の手が要る時だけエッセンス・冒涜の外れの数を見る、S-201c。前は丸ごと比べ、消去の箱に偽の未設定 = r/y5msCmTe の b28)
      // 「いずれか」の狙いがある木は、余分に付いた元素耐性 (外れに数えない、S-10h ③) と外れを同じ形と見る (eleJunk。数・行き先は fitsItem のまま)。(スイッチ oddMixSkip、S-21b2) 外れ・打った後の箱では、この手で完成形の狙いが偶然付いた形 (冒涜で付いた置き石の枠 S-33h も) を比べに入れない = 回すと先へ進むか予期せぬで作り直す人 (r/VK1opGjg の b90)
      const anyEle = (doc.memoAims ?? []).some((a) => a.anyEle), mixKey = (fr: Frame): string => keyForBox(doc, o, anyEle ? frameKeyOf(contentOf(data, doc, fr.item, fr.aimed, true)) : fr.key), plain = flag("oddMixSkip" as Flag) && ODD_OUTS.has(c.out) ? all.filter((fr) => !oddIdx(fr.item, from.item).length) : all, mixAll = plain.length ? plain : all;
      if (!c.anyOf?.length && !c.mergedOuts?.length && !c.merged && new Set(mixAll.map(mixKey)).size > 1) mixed.add(o);
      // 重い順の LOOK に入らない枝も、木の族を塞ぐ MOD の組が違えば 1 つずつ当てる (外れの印 (g) の違う枝、代表には選ばない)
      const seenSig = new Set(heavy.map((r) => famSig(r.item))), marks = new Set(all.map((fr) => blockMarkOf(data, doc, fr.item, fr.aimed))), marked: Frame[] = [];
      for (const r of sorted.slice(LOOK)) {
        const s = famSig(r.item);
        if (seenSig.has(s) || marked.length >= MARKED) continue;
        seenSig.add(s);
        const fr = pick(r), mk = blockMarkOf(data, doc, fr.item, fr.aimed);
        if (!marks.has(mk)) { marks.add(mk); marked.push(fr); }
      }
      const ex0 = exOf(o), ex = ex0 && exFloored(o, ex0, from), fe = ex ? pick({ item: ex, p: sum }) : null, saved = !!fe && all.some((fr) => fr.key === fe.key);
      // 外れは枠だけ (S-200 ③、スイッチ junkFrameOnly): 代表は 0) 保存の例 1) 外れが木の狙いの族を取らない枝 2) 段を満たす物だけの枝 3) 段の足りない外れをほかの枝の外れと差し替えた品 の順 (保存の例も同じ順で見る)
      const clean = (fr: Frame): boolean => !gf || junkClean(data, c, from.item, fr.item, gf);
      const ok = (fr: Frame): boolean => !gf || !junkTaking(data, c, from.item, fr.item, gf).length;
      const first = saved ? fe! : all[0]!;
      const far = (p: (fr: Frame) => boolean): Frame | null => { for (const r of sorted.slice(LOOK)) { const fr = pick(r); if (fr.key === first.key && p(fr)) return fr; } return null; };
      const swapped = (): Frame | null => { const it = swapJunk(data, from.item, first.item, junkTaking(data, c, from.item, first.item, gf!), sorted.map((r) => r.item), gf!); const fr = it ? pick({ item: it, p: sum }) : null; return fr && fr.key === first.key ? fr : null; };
      const near = (p: (fr: Frame) => boolean): Frame | null => (p(first) ? first : all.find((fr) => fr.key === first.key && p(fr)) ?? far(p));
      // 0) 保存の例は段の足りない外れを持たなければそのまま (段を満たす狙いを持つ例 = ✦ の狙いの筋力 T2 などを捨てない、レビュワー 1 の 13)
      let best = !gf ? first : saved && ok(fe!) ? fe! : near(clean) ?? near(ok) ?? swapped() ?? first;
      if (c.hand && heavy.length > 1) {
        let bestLost = best === fe ? 0 : lostP(splitOf(data, doc, c, best, aims, part));
        for (const fr of all) {
          if (fr === best || (ok(best) && !ok(fr)) || (clean(best) && !clean(fr))) continue;
          if (bestLost === 0) break;
          const l = lostP(splitOf(data, doc, c, fr, aims, part));
          if (l < bestLost - 1e-9) { best = fr; bestLost = l; }
        }
      }
      // 見本の ☑ の狙い MOD は狙いの段の一番下 (S-200 ③、スイッチ aimFloor)。鍵が替わる時は替えない
      const fl = aimFloorItem(data, doc, o, from.item, best.item, best.aimed), flf = fl ? pick({ item: fl, p: sum }) : null;
      if (flf && flf.key === best.key) best = flf;
      // 代表と枠の違う形: 手の箱はその手を当て、手の無い ↩ の箱は ↩ 先の手を当てる (S-21 を配置で。↩ の箱は前は代表 1 つだけ = FmNY7Wwv b23)
      const at = c.hand ? o : c.back && doc.boxes[c.back] ? c.back : null;
      // 枠が同じでも外れの印 (g) が違えば当てる (印は枠の比べに入れない、tree-judge の blockMarkOf)
      const markOf = (fr: Frame): string => `${fr.key}|${blockMarkOf(data, doc, fr.item, fr.aimed)}`;
      const hit: Frame[] = [best];
      if (at) { const keys = new Set([markOf(best)]); for (const fr of [...all, ...marked]) { const k = markOf(fr); if (!keys.has(k)) { keys.add(k); hit.push(fr); extra.push({ at, f: fr, from: o, src }); } } }
      // (スイッチ oddShapes、S-21b) 代表と上で手を当てた枝のほか、付いている完成形の狙いの MOD の組が違う枝 (重い枝も) にも手を当てる。
      // 枠の鍵・外れの印が代表と同じでも、偶然狙いが付いた人は次の手の後に形が分かれる (バナナの 4 段目「打った後」の受け流し)。代表・見本には使わない
      if (at && ODD_OUTS.has(c.out) && flag("oddShapes") && !flag("oddStop")) { // oddStop (S-21b 11-18): 箱を足さず、その人は予期せぬ狙い MOD で止めて作り直す
        // 代表 (と上で当てた枝) に無い狙いを持つ枝だけ、まだ当てていない狙いごとに重い順の 1 本 (狙いが減った枝・同じ狙いの 2 本目は当てない = 組む時間)
        const covered = new Set(hit.flatMap((fr) => [...heldSet(fr.item)]));
        let n = 0;
        for (const r of sorted) { if (n >= ODD) break; if (!anyAimMod(r.item, covered)) continue; const fresh = oddIdx(r.item, best.item).map((i) => canon[i]!).filter((k) => !covered.has(k)); if (!fresh.length) continue; for (const k of fresh) covered.add(k); extra.push({ at, f: pick(r), from: o, odd: true, src }); n++; }
      }
      // 数値の両端の形 (前の rollEnds) は当てない: 木の数値は既定で段の下限、数値を決めるのは神の目標 (S-202 ②、11-06 オーナー)
      const alts = [...all, ...marked].filter((fr) => fr !== best).map((fr) => fr.item);
      return alts.length ? { ...best, alts } : best;
    };
    // (S-196j、スイッチ frameReuse) 段の鍵と親の代表が前と同じ段は前の答えをそのまま使う (tree-frame-reuse)
    const walk = (q: string[]): void => { while (q.length) {
      const id = q.shift()!, b = doc.boxes[id], f = frames.get(id);
      if (!b || !f) continue;
      const kids = b.outs.filter((o) => doc.boxes[o]);
      q.push(...kids);
      if (!reuse) { step(id, b, f, kids); continue; }
      const sig = stepSig(doc, b, kids), had = reuse.steps.get(id);
      if (had && had.f === f && had.sig === sig) { for (const [o, fr] of had.kids) frames.set(o, fr); extra.push(...had.extra); miss.push(...had.miss); cant.push(...had.cant); for (const x of had.mixed) mixed.add(x); continue; }
      const e0 = extra.length, m0 = miss.length, c0 = cant.length, x0 = mixed.size;
      step(id, b, f, kids);
      reuse.steps.set(id, { f, sig, kids: kids.flatMap((o) => { const fr = frames.get(o); return fr ? [[o, fr] as [string, Frame]] : []; }), extra: extra.slice(e0), miss: miss.slice(m0), cant: cant.slice(c0), mixed: [...mixed].slice(x0) });
    } };
    /** 配置の 1 段: 箱 id (代表 f) の手から子の箱の代表を決める */
    const step = (id: string, b: TreeBox, f: Frame, kids: readonly string[]): void => {
      src = [id, f];
      for (const o of kids) setBy.delete(o); // 代表から決め直す子は、ほかの形の枝で埋めた印を外す
      // 手の無い箱の下 (分かれ目の行・ヒネコラのハズレ) は親の代表のまま
      const same = (o: string, note: string | null): void => { frames.set(o, { ...f, note }); };
      // 代表を出せない箱 (枝の多すぎる手の下・分かれ目の下) の下も全部出せない = 見本の打ち直しのまま (S-200。前は 1 段下だけで、錬金術 → 骨の箱を白の品で数え、ノーマル・MOD なしの見本になった)
      if (f.note === "tooMany" || f.note === "split") { for (const o of kids) same(o, f.note); return; }
      if (!b.hand) { for (const o of kids) same(o, b.split ? "split" : null); return; }
      const s = splitOf(data, doc, b, f, aims, part);
      if (s === "tooMany") { for (const o of kids) same(o, "tooMany"); return; }
      for (const [out, x] of s.lost) miss.push({ box: id, out, p: x.p, oc: x.oc });
      if (s.noHit) cant.push({ box: id, from: id, why: "noHit" });
      // ヒネコラの結果の箱 (予見の箱、S-39) は MOD の変わらない同じ予見済みの品。当たり / ハズレは持った手の結果の分けなので、枝の無い箱もヒネコラの枝を持つ
      const held = [...s.to.values()].flat();
      for (const o of kids) {
        const c = doc.boxes[o]!, brs = s.to.get(o) ?? (holdsAt(doc, o) && held.length ? held : undefined);
        // 枝の来ない箱も印はこの箱の手の後 (残したい MOD の ☑ の無い候補は外れ、S-27e)。親の印の写しのままだと、その下の箱で ☑ しなかった MOD が狙いと出た
        // (11-07 カオス + 左側の抹消 b19 と親 b14 の手の窓のカード、a61362897)。品は親の代表のまま (作れない見本 = カードも親の品)
        if (c.seen) { same(o, null); continue; }
        if (!brs?.length) { const lf = lvFrameOf(o, kids, s.to, f); frames.set(o, lf ?? { ...f, aimed: nextAimed(data, doc, f.aimed, o, f.item, f.item), note: "nobranch" }); continue; }
        frames.set(o, bestOf(o, brs, f));
      }
    };
    /**
     * 削減の手前の枠 (S-65c) で代表の道からは枝の来ない組の箱: 兄弟の枠 (同じ種類・側の鍵) の代表の外れを、データでその組になる段へ差し替えた品を代表にする
     * (代表の道では残したい MOD と MOD レベルがぴったり同じ外れが出なくても、ほかの道の人は着く。代表が無いとその枠の削減の結果が外れの無い品で作られた)
     */
    const lvFrameOf = (o: string, kids: readonly string[], to: Map<string, Br[]>, f: Frame): Frame | null => {
      const c = doc.boxes[o]!, want = lvPart(c.junkKey);
      if (!want) return null;
      // 兄弟の枠は同じ組 (種類・当たりの狙い・枠を外した鍵)、削減の手は枠の組の手 (tree-whittle-scene、枠を作る所と同じ)
      const g = frameGroupKey(c), wh = frameHandOf(doc, o);
      for (const k of kids) {
        const x = doc.boxes[k], brs = to.get(k);
        if (k === o || !x || !brs?.length || frameGroupKey(x) !== g) continue;
        const sib = bestOf(k, brs, f), { wanted, miss, side } = whittleCompare(data, doc, wh, sib.aimed, sib.item);
        const v = rankVariants(data, sib.item, wanted, c.junkKey, miss, side).find((y) => lvClassOf(y.item, miss, side) === want);
        if (!v) continue;
        // 保存の例のアイテム (S-200 ⑦) がこの枠の組・兄弟の枠と同じ中身なら、差し替えた品の代わりに例を代表にする = 開き直しても組んだ時と同じ見本 (スイッチ treeLaneExample。見本の見た目だけ、割合 p は差し替えの物のまま)
        // 保存の例の外れが木の狙いの族を段の足りない形で取っていれば使わない (スイッチ junkFrameOnly、レビュワー 1 の 10)
        const ex0 = flag("treeLaneExample") ? exOf(o) : null, ex = ex0 && !itemTaking(data, ex0, gf) ? exFloored(o, ex0, f) : null;
        let rep: Pick<Frame, "item" | "aimed" | "key"> = { item: v.item, aimed: sib.aimed, key: sib.key };
        if (ex) { const am = nextAimed(data, doc, f.aimed, o, ex, f.item), key = frameKeyOf(contentOf(data, doc, ex, am)), w = whittleCompare(data, doc, wh, am, ex); if (key === sib.key && lvClassOf(ex, w.miss, w.side) === want) rep = { item: ex, aimed: am, key }; }
        return { ...sib, ...rep, p: sib.p * v.p, alts: undefined };
      }
      return null;
    };
    /**
     * (スイッチ oddShapes、S-21b) ほかの形の枝 fa に箱 x の手を当てた枝で、偶然付いた完成形の狙い (行き先の箱の代表に無い) を持ち、
     * 行き先の箱の代表と中身が違い、中身の同じ手・完成の箱も無い (回すとそこで止まる) 物は、鍵 o: の結果を行き先の無い結果にする (整理で未設定の箱を足す)
     */
    const oddMiss = (at: string, x: TreeBox, fa: Frame, from: string, to: Map<string, Br[]>): void => {
      let keys: Set<string> | null = null;
      for (const [o, brs] of to) {
        const c = doc.boxes[o], fo = frames.get(o);
        if (!c || !ODD_OUTS.has(c.out) || oddOf(c.junkKey).length || !fo || fo.note) continue;
        for (const r of brs) {
          const odd = oddOn(r.item, fo.item);
          if (!odd.length) continue;
          const key = frameKeyOf(contentOf(data, doc, r.item, nextAimed(data, doc, fa.aimed, o, r.item, fa.item)));
          keys ??= new Set(Object.values(doc.boxes).flatMap((b) => { const f = (b.hand || b.done) && frames.get(b.id); return f && !f.note ? [f.key] : []; }));
          if (key === fo.key || keys.has(key)) continue;
          const oc0 = boxOutcomeOf(data, doc, x, fa.item, r.item, aims, fa.aimed), oc = { ...oc0, junkKey: withOddKey(withoutOdd(oc0.junkKey), odd) };
          miss.push({ box: at, out: missKey(oc), p: r.p, from, oc });
        }
      }
    };
    walk(["start"]);
    for (const a of Object.values(doc.boxes)) { const fa = frames.get(a.id); if (a.back && a.back !== a.id && fa && !fa.note) extra.push({ at: a.back, f: fa, from: a.id, src: [a.id, fa] }); }
    // 代表では枝の無い箱はほかの形の枝を代表にし、その下を出し直す (その下にまた ↩・ほかの形があるので、変わらなくなるまで。上限 3 回)
    const done = new Set<string>();
    for (let pass = 0; pass < 3 && extra.length; pass++) {
      const again: string[] = [];
      // ↩・ほかの形で作れない見本の箱を埋める時は、外れが木の狙いの族を段の足りない形で持たない形を先に (無ければ使う。スイッチ junkFrameOnly、レビュワー 1 の 9)
      const xs = extra.splice(0);
      if (gf) xs.sort((a, b) => Number(itemTaking(data, a.f.item, gf)) - Number(itemTaking(data, b.f.item, gf)));
      for (const { at, f: fa, from, odd, src: s0 } of xs) {
        // (スイッチ oddStale) 元の箱の代表がその後の組み直しで替わった古い枝は当てない (替わった代表の枝は組み直しの時に積み直してある)。
        // 前は古い代表の枝が「狙いが付いた」の箱の見本を先に埋め、親に無い MOD の付いた見本になった (11-18 オーナー eEn6Yd8f の 7 段目の骨)
        if (stale(s0)) continue;
        const x = doc.boxes[at], k = `${at}|${from}|${fa.key}|${blockMarkOf(data, doc, fa.item, fa.aimed)}${odd ? `|o${aimSig(fa.item)}` : ""}`;
        if (!x?.hand || done.has(k)) continue;
        src = s0;
        done.add(k);
        const s = splitOf(data, doc, x, fa, aims, part);
        if (s === "tooMany") continue;
        // 代表のほかの形でこの手が打てない・当たるまでが当たらない (外れの印 (g) の違う枝など。回すとここで止まる)
        if (odd) { /* 偶然の枝は知らせない (S-21b) */ } else if (!s.to.size && !s.lost.size) cant.push({ box: at, from, why: "cant" });
        else if (s.noHit) cant.push({ box: at, from, why: "noHit" });
        // 偶然の枝 (odd) からは止まる人の箱 (oddMiss) だけ足す。ほかの行き先の無い結果まで足すと、止まらない木にも外れの箱が増えた (見張りの木 4 本で +2〜3)
        if (!odd) for (const [out, y] of s.lost) miss.push({ box: at, out, p: y.p, from, oc: y.oc });
        if (odd) oddMiss(at, x, fa, from, s.to);
        for (const o of x.outs) {
          const brs = s.to.get(o);
          // (スイッチ oddStale) 古い枝で埋めた見本 (元の箱の代表が後で替わった) は今の枝で埋め直す (前は ↩ で着く人の「狙いが付いた」の箱が 5 MOD、eEn6Yd8f の 3 段目の骨)
          if (!brs?.length || (frames.get(o)?.note !== "nobranch" && !stale(setBy.get(o)))) continue;
          frames.set(o, bestOf(o, brs, fa));
          if (s0) setBy.set(o, s0); else setBy.delete(o);
          again.push(o);
        }
      }
      if (again.length) walk(again);
    }
    return { frames, miss, cant, mixed: [...mixed] };
  });
}
