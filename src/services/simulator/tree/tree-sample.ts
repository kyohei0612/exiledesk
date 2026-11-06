/**
 * tree-sample.ts — ツリーの箱に「着いた時のアイテム」の見本を 1 個作る・箱の手を 1 回打つ (2026-10-22 オーナー「エンジンでカレンシーを使えるように。
 * 外れのやり方を決める時にカレンシーを打たせて決める」)。打つのは全部エンジンの入口 (engine.ts の applyCurrency)、ここで結果は作らない。
 *
 * 見本の作り方: 始まり = 金の指輪のレア + フラクチャー (指名の手 force:…|f をエンジンで打つ。創生の樹の MOD も置ける)。
 * その下の箱 = 道 (始まり → 親の手の並び) だけで決める (S-74。前の「回して着いた人」tree-arrived は 10-30 R5 で外し、11-02 にファイルも消した)。親の見本に親の手を打ち、結果がその箱 (当たり X / 外れ / 外れが消えた / 狙いが消えた) になるまで引き直す (TRIES 回まで)。
 * 引けなかった結果の箱は作れない印 (note) を返す (指名で付けて作らない)。分け方は設計 11 の表 (付いた > 消えた > 外れが減った > 外れ)
 */
import { frameSample } from "./tree-frame";
import { keepsMods } from "./tree-foresee";
import { aimDone, freshItem, mulberry32, stageTuning, tierIndexOf, type AimHitOpts, type AimTarget, type PatchData, type StageApply, type StageItem, type StageMod } from "../../craft-stage/engine";
import { fractureStart } from "../../simulator/sim-engine";
import { aimDiff, applyHand, canUse, startWith } from "./tree-hand-core";
export { aimDiff } from "./tree-hand-core";
import { pathKeyOf } from "./tree-recipe-v1";
import { docPartOf, itemKeyOf, pathKeyOfBox, premiseOf, type PathLink } from "./tree-sample-key";
import { aimHeldOn } from "./tree-aim";
import { ECHO, effectOf, isBone } from "./tree-hands";
import { fractureMarks, START_JUNK, startOf, startRarity, startsFractured, type Aim, type Hand, type OutKind, type TreeBox, type TreeDoc, boxAims } from "./tree-model";
import { withTreeTune } from "./tree-tune";
import { splitTo } from "./tree-shape";
import { boxOutcomeOf } from "./tree-outcome";
import { isWhittleHand, rankVariants } from "./tree-whittle";
import { sampleAimed } from "./tree-judge";
import { isRevealHand, veilKeep, veilPick } from "./tree-veil";
import { fracFree, junkKeyOf } from "./tree-frac-pick";
import { mainSideOf } from "./tree-uncountable";
import { clearRolls, handOut, rollAt, type Roll } from "./tree-rolls";
export { fractureChoices, fractureTarget } from "./tree-frac-pick"; // フラクチャーの小物は tree-frac-pick へ (1 ファイル 500 行まで、10-28)

/** 打ち直しの上限 (見本の木 9 本で成功は全部 1000 回以内、S-71b) */
const TRIES_LIGHT = 1000;
export interface Sample { item: StageItem; note: string | null }

/** 木の狙い (段 T) → エンジンの入口の狙いの形 (段の位置)。当たりの判定はエンジンの入口 (aimHeldOn・isAimMod・junkOf) に sameText で聞く (決まり 8) */
export const targetsOf = (data: PatchData, aims: readonly Aim[]): AimTarget[] => aims.map((a) => ({ modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) }));
/** 木の当たりの判定の設定 (同じ系統・同じ文も当たり。系統だけで合わせると「スペルスキルのレベル」にミニオン・近接・投射物のスキルレベルが当たった、10-22 #3) */
export const aimOpts = (data: PatchData): AimHitOpts => ({ data, sameText: true });
/**
 * その箱の手で「当たり」と数える札。繰り返し (当たるまで) は、その箱の結果の当たりの箱の札だけで止める
 * (10-22 プレフィックスをつないだら、始まりのカオスがプレフィックスのレアリティで止まり、行き先が無く 87 人止まった)。ほかの手はツリー全部の札
 */
export function handAims(doc: TreeDoc, id: string, aims: readonly Aim[]): readonly Aim[] {
  const b = doc.boxes[id];
  // 発現で選ぶ手 (骨の「発現させる」・後から打つ発現) は、その手の当たりの箱の札 (☑。完成の狙いに無い置き石も) だけで選ぶ 
  if (veilPick(b?.hand)) return b!.outs.flatMap((o) => { const c = doc.boxes[o]; return c?.out === "hit" && c.aim ? boxAims(c) : []; });
  // ✦ の木の確定フラクチャーは ✦ の印だけを固定する (S-42。木の狙い全部を渡すと印の無い狙いまで固定され、✦ の無い側の ✦ の人に行き先が無く止まった、金の指輪 10-31)
  if (b?.hand && effectOf(b.hand.currency) === "fracture" && b.hand.pick !== "random" && fractureMarks(doc).length) return fractureMarks(doc);
  if (!b?.hand?.repeat) return aims;
  const own = b.outs.flatMap((o) => { const c = doc.boxes[o]; return c?.out === "hit" && c.aim ? boxAims(c) : []; });
  return own.length ? own : aims;
}
/**
 * このツリーで使っている当たりの札 (重ならない物)。エッセンスの当たりの箱の札は付いた MOD の名前なので、完成の狙いに無い物は数えない
 * (10-24 不在のアミュ B: 右側の結晶化 + 無限のエッセンスで冒涜の外れを消す。% 能力値を狙いに数えると、次の冒涜で置き換わった時に「狙いが消えた」になった)
 */
export function aimsOf(doc: TreeDoc): Aim[] {
  const out: Aim[] = [];
  // 完成形の設定 (memoAims) にフラクチャーの印でない狙いがある木だけ (印だけの古い見本 = 金の指輪はエッセンスの札も狙いのまま)
  const goals = doc.memoAims ?? [];
  const byGoals = goals.some((g) => !g.fractured);
  const label = (b: TreeBox): boolean => {
    const h = b.parent ? doc.boxes[b.parent]?.hand : null;
    // 発現で選んだ置き石 (完成の狙いに無い MOD) は、その手の時だけ当たり。以降の手では冒涜の外れ MOD (10-27 夜オーナー)
    if ((veilPick(h) || fracFree(doc, h)) && !goals.some((g) => g.modId === b.aim!.modId)) return true;
    return byGoals && !!h && effectOf(h.currency) === "essence" && !goals.some((g) => g.modId === b.aim!.modId);
  };
  for (const b of Object.values(doc.boxes)) if (b.out === "hit" && b.aim && !label(b)) for (const a of boxAims(b)) if (!out.some((x) => x.modId === a.modId && x.tier === a.tier)) out.push(a);
  // 始めから付いている完成の狙い (スタートの窓の「＋ 外れを狙いに差し替える」)。前は当たりの箱の札だけで、始めの狙いが消える結果を「外れが消えた」と数え、
  // 「狙いが消えた」の箱も作らなかった (10-25 シミュ 28 の洗い出し: 始めにスピリット・キャストを付けた形で、消去・カオス・パーフェクトの全部)
  for (const m of startGoalAims(doc)) if (!out.some((x) => x.modId === m.modId && x.tier === m.tier)) out.push(m);
  return out;
}
/** 始めのアイテムに付いている完成の狙い (印の ✦ でない物。札は完成形の設定の段) */
export function startGoalAims(doc: TreeDoc): Aim[] {
  const goals = (doc.memoAims ?? []).filter((g) => !g.fractured);
  return (doc.start?.mods ?? []).filter((m) => !m.fractured).flatMap((m) => goals.filter((g) => g.modId === m.modId).slice(0, 1));
}

/**
 * エッセンスの当たりの箱 box が、打った後 after の行き先か。当たりの箱が 1 つなら必ず (付く MOD は必ず付く)。
 * 2 つ以上 (無限のエッセンス = 筋力・器用さ・知性のどれか、エンジンの infiniteChoices) は箱の札の MOD が付いている箱
 * (前は 1 つ目の箱へ全員送り、ツリーは筋力 100% / エンジンは 1/3 ずつ。10-25 モンキー 4 本目・ジン部長の見立て)
 */
export function essenceBoxFits(doc: TreeDoc, parent: TreeBox, box: TreeBox, after: StageItem): boolean {
  if (!box.aim || parent.outs.filter((id) => doc.boxes[id]?.out === "hit").length < 2) return true;
  return [...after.prefixes, ...after.suffixes].some((m) => m.modId === box.aim!.modId);
}

/**
 * 打つ前と後を比べて、どの箱の結果か (付いた狙いは hits に)。key = 打った手 (エッセンスは付く MOD が必ず付くので、狙いが消えたかを先に見る。
 * 付いた MOD は hits のまま、10-22 オーナー「エッセンスの道」)
 */
export function outcomeOf(data: PatchData, before: StageItem, after: StageItem, aims: readonly Aim[], key?: string): { out: OutKind; hits: Aim[] } {
  // 狙いの付いた・消えた・外れが減った・新しく ✦ になった MOD はエンジンの入口の aimDiff (B12 10-22)。ここは箱の分け方だけ
  const d = aimDiff(data, before, after, aims, { sameText: true });
  if (key && effectOf(key) === "essence" && d.lost.length) return { out: "lost", hits: d.hits };
  // エッセンスの道は 2 つだけ (10-24 オーナー): 狙いが消えていなければ当たりの道 (付く MOD が完成の狙いに無くても。外れを消すだけのエッセンス)
  if (key && effectOf(key) === "essence") return { out: "hit", hits: d.hits };
  // フラクチャー: 新しく ✦ になった MOD が狙いなら当たり (札 = その狙い)、ほかは外れ (MOD の数は変わらない)
  if (key && effectOf(key) === "fracture") return d.fracturedHits.length ? { out: "hit", hits: d.fracturedHits.slice(0, 1) } : { out: "junk", hits: [] };
  if (d.hits.length) return { out: "hit", hits: d.hits };
  if (d.lost.length) return { out: "lost", hits: [] };
  if (d.junkGone) return { out: "junkGone", hits: [] };
  return { out: "junk", hits: [] };
}

export { possibleOutsOf, singleOutOf } from "./tree-outcome";
/** 分かれ目の行の箱の見本を引き直す回数 */
const SPLIT_TRIES = 40;
/** 当たりの箱の狙いを持っていない親の見本を引き直す回数 (hitNew) と、引き直しの中か (入れ子で引き直さない) */
const HIT_TRIES = 8;
/** 狙い無しの乱数のフラクチャーの箱で、その MOD の付いた親の見本を探す回数 (着いた人を順に見る) */
const FRAC_TRIES = 24;
let altDeep = false;
/** 結果が 1 通りかを見る見本の数 */
export const SINGLE_SEEDS = 8;


/** 繰り返し (カオススパム) の上限が無い時の見張り */
export const SPAM_CAP = 5000;

/**
 * 箱の手を 1 回打つ (エンジンの applyCurrency を 1 回。木の側で打ち直し・先入れ・選びはしない、11-05 オーナー「ツリーに勝手に足しやがって2度とすんなまじで」)。
 * 繰り返しの手 (repeat) は、当たりの札 (aims) のどれかが新しく付くまで (か上限まで) 打ち続けた結果を 1 回分として返す。
 * use を渡すと使った物 (カレンシー・お告げ) を数える (100 人回し tree-run)
 */
export function playHand(data: PatchData, item: StageItem, h: Hand, rng: () => number, aims: readonly Aim[] = [], use?: (key: string, n?: number) => void): StageApply {
  if (h.repeat) {
    // カオススパム = その手 (お告げ込み) を 1 回ずつ、選んだ狙いのどれかが付いたら当たり (エミュのエンジンと同じ。前の木だけの「空きがあれば先に高貴を 1 回」は 11-05 オーナー「なんでそもそもこれエミュと違うエンジンなの」で外した)。
    // 1 手ずつはエンジンの applyCurrency (applyHand)、当たりはエンジンの aimDone。ツリーの物は繰り返す順番だけ (スパムシミュは使わない、オーナー「あっちはカオスオーブ全部打つ仕組み」)
    const cap = h.repeat.max ?? SPAM_CAP;
    const open = targetsOf(data, aims).filter((t) => !aimDone(item, [t]));
    const done = (x: StageItem): boolean => open.some((t) => aimDone(x, [t]));
    let r: StageApply = { applied: false, item, added: [], removed: [] };
    let it = item;
    for (let i = 0; i < cap; i++) {
      const c = playHand(data, it, { ...h, repeat: null }, rng, aims, use);
      if (!c.applied) return it !== item ? { ...c, applied: true, item: it } : c;
      r = c; it = c.item;
      if (done(it)) break;
    }
    return { ...r, item: it };
  }
  // 骨を未発現のまま次へ (veil keep) は発現しない。未発現を持ったまま打つほかの手 (フラクチャー・カオスなど) も発現しない = 未発現のまま
  const keepVeil = veilKeep(h) || (!isBone(h.currency) && !isRevealHand(h.currency));
  const r = applyHand(data, item, h.currency, rng, { omens: h.omens, reveal: !keepVeil });
  if (use && r.applied) {
    use(h.currency);
    for (const o of r.handOmensUsed) use(o);
    if (r.echoUsed) use(ECHO);
  }
  return r;
}

/**
 * 始めのアイテム (10-23 オーナー「スタートは印で決まる」): 完成の狙いにフラクチャーの印があれば、印のどれか 1 つが ✦ のレア + ＋ の MOD + 外れ (合わせて 4 つ、エンジンの入口 fractureStart)。
 * 印が無ければ白 (ノーマル) に＋の MOD を付けた物 (＋が無ければ白のまま)。ルーンは先に差す。見本・ルート精査・100 人回し (tree-run) で同じ物。
 * note = 打てなかった理由 (無ければ null)
 */
export function startItemOf(data: PatchData, doc: TreeDoc, rng: () => number): Sample {
  const st = startOf(doc), marks = fractureMarks(doc);
  // 作り方 (ルーン → 指名の MOD、マジックはノーマルから) はエンジンの入口の startWith (B10 10-22)
  // フラクチャー前から (印あり・start.from four) は必ず白 (ノーマル)。始まりの MOD も付けない (10-24 夜オーナー)
  if (!startsFractured(doc)) return startWith(data, doc.base, doc.itemLevel, { rarity: startRarity(doc), mods: marks.length ? [] : st.mods, runes: st.runes }, rng);
  // ルーンを先に差したレア (ルーンの MOD の候補・＋の分のソケットも開ける) から
  const pre = startWith(data, doc.base, doc.itemLevel, { rarity: "rare", mods: [], runes: st.runes, socketFor: [...marks, ...st.mods] }, rng);
  if (pre.note) return pre;
  const from = pre.item;
  // 印の狙いは「その段以上」(10-24 オーナー「T2 を選んだら T2 以上」): 印の段から上の段 (T1 まで) を全部候補に渡す (アイテムレベルで付かない段はエンジンが外す)
  const cands = marks.flatMap((a) => Array.from({ length: a.tier }, (_, i) => ({ modId: a.modId, tier: i + 1 })));
  // 外れには完成の狙いを付けない (段は問わず。ライフを持ってスタートした人が外れの箱のカオススパムで当たらず止まった、10-24 モンキー初めての人の回)
  const avoid = (doc.memoAims ?? []).filter((a) => !a.fractured).map((a) => ({ modId: a.modId, tier: a.tier }));
  const r = fractureStart(data, doc.base, doc.itemLevel, cands, rng, { junk: START_JUNK, extra: st.mods, from, avoid });
  return { item: r.item, note: r.note };
}

/**
 * その手がこのアイテムに打てない理由 (打てるなら null。オーナー 10-22「進行不能」: 消せる物が無い側のお告げ・効かないお告げが掛かった手を確定させない)。
 * 判定はエンジンの入口の canUse (お告げ → 触媒の前のカタリスト → 手そのもの、繰り返しは 1 回分、乱数で決まる物は打てる扱い。B11 10-22)
 */
export function handProblem(data: PatchData, item: StageItem, h: Hand): string | null {
  return canUse(data, item, h.currency, h.omens);
}

/** 箱の見本 (seed が同じなら同じ物。木の設定 tune で打つ) */
export function sampleOf(data: PatchData, doc: TreeDoc, boxId: string, seed: number): Sample {
  // 見本は道だけで決まるので道の鍵で覚え続ける (S-71b ②)。手を足しても新しい箱の分だけ作る
  if (data !== memoData) { memo.clear(); pathMemo.clear(); failMemo.clear(); okMemo.clear(); STARTS.clear(); clearRolls(); memoSig = ""; memoData = data; }
  // 開発版は配置の代表の品 (打ち直さない、S-200 段階 3・4)。決まりで出せない箱だけ前の見本
  const fs = frameSample(data, doc, boxId);
  if (fs) return fs;
  return withTreeTune(doc, () => sampleIn(data, doc, boxId, seed));
}
/** 覚えた見本 (木の中身の鍵が変わったら全部捨てる。treeLight は holdDocSig の間の早道だけ) */
const memo = new Map<string, Sample>();
let memoSig = "", memoData: PatchData | null = null;
/** 木の中身の鍵 (位置 x・y と、見本に効かないメモの文を除く) */
const docSig = (doc: TreeDoc): string => JSON.stringify(doc, (k, v) => (k === "x" || k === "y" || k === "note" || k === "doneNow" || k === "tidied" || k === "tidyRan" || k === "examples" ? undefined : v));
/** fn の間は木が変わらないので鍵を作り直さない (1 回の JSON が 100 人回しの 4 割だった、S-71b) */
const heldLinks = new Map<string, PathLink>();
let heldDoc: TreeDoc | null = null, heldSig = "", heldPart: string | null = null, heldLazy = false, holdNo = 0;
/** lazy = 木全体の鍵は要る時だけ作る (判定と見本作りの短い間。作るだけで箱の数の分だけ掛かる) */
export function holdDocSig<T>(doc: TreeDoc, fn: () => T, lazy = false): T {
  if (heldDoc) return fn();
  heldDoc = doc; heldLazy = lazy; heldSig = lazy ? "" : docSig(doc); heldPart = null; heldLinks.clear(); holdNo++;
  try { return fn(); } finally { heldDoc = null; }
}
/** 今 holdDocSig の中ならその回の番号、外なら 0 (同じ番号の間は木が変わらない) */
export const docHeld = (doc: TreeDoc): number => (heldDoc === doc ? holdNo : 0);
/** 道の鍵で覚えた見本 (鍵 = 見本に効く物全部なので、木が変わっても残してよい。増えすぎたら捨てて作り直す = 結果は同じ) */
const pathMemo = new Map<string, Sample>();
/** 打っても作れなかった見本 (鍵 = 道・親の見本・☑ → 印)。起きない結果の箱を手のたびに打ち直していた (100 箱で 1 手 24 万回、S-71b)。作れた見本も同じ鍵で (okMemo。↩ で着く人の形 arrivalsOf の打ち直しが組み直しの 8〜9 割だった、11-06) */
const failMemo = new Map<string, string>(), okMemo = new Map<string, StageItem>(), PATH_MEMO_MAX = 20000;
/**
 * 覚えに入れる。上限を超えたら一番古い物を 1 つ捨てる (前は上限で全部消したので、狙いを何度か付け直すと覚えが丸ごと消え、次の 1 手が冷えた開き並みに重くなった。11-07 S-71b ⑯)。
 * どの覚えも同じ鍵なら同じ物なので、捨てても作り直すだけで結果は変わらない
 */
export function putCapped<K, V>(m: Map<K, V>, k: K, v: V, max = PATH_MEMO_MAX): void {
  if (!m.has(k) && m.size >= max) { const old = m.keys().next(); if (!old.done) m.delete(old.value); }
  m.set(k, v);
}
/** 全部消えてよい消去の道の箱に効く木全体の鍵の番号 (長い文字を見本ごとの鍵に入れるとその JSON だけで 3 秒を超えた。番号は使い回さない) */
const sigNos = new Map<string, number>();
let sigSeq = 0;
const sigNo = (sig: string): number => { let n = sigNos.get(sig); if (!n) putCapped(sigNos, sig, (n = ++sigSeq), 512); return n; };
function sampleIn(data: PatchData, doc: TreeDoc, boxId: string, seed: number): Sample {
  const k = `${boxId}|${seed}|${altDeep ? 1 : 0}`;
  const held = heldDoc === doc, fast = held && !heldLazy;
  if (fast && memoSig !== heldSig) { memo.clear(); memoSig = heldSig; }
  let r = fast ? memo.get(k) : undefined;
  if (r) return r;
  const pk = keyOf(doc, boxId, seed);
  r = pathMemo.get(pk);
  if (!r) {
    // 見本を作る間は木が変わらないので鍵は 1 回だけ (描画の箱ごとの見本で木全体の JSON が 10 秒を超えた、☑ の手)
    r = holdDocSig(doc, () => sampleRaw(data, doc, boxId, seed), true);
    putCapped(pathMemo, pk, r);
  }
  if (fast) memo.set(k, r);
  return r;
}
/**
 * 画面に置いた木は中を変えない (use-tree の edit は毎回新しい木に差し替える) ので、鍵の材料は木ごとに 1 回だけ作る。描画の箱ごとの見本で道の JSON を作り直していた (S-71e ①)。
 * 中を書き換えて知らせる時 (triggerRef) はもう一度呼ぶ = 作り直す
 */
const stillKeys = new WeakMap<TreeDoc, { part: string | null; sig: string; links: Map<string, PathLink> }>();
export const markStill = (doc: TreeDoc): void => { stillKeys.set(doc, { part: null, sig: "", links: new Map() }); };
function keyOf(doc: TreeDoc, boxId: string, seed: number): string {
  const held = heldDoc === doc, st = held ? undefined : stillKeys.get(doc);
  const part = held ? (heldPart ??= docPartOf(doc)) : st ? (st.part ??= docPartOf(doc)) : docPartOf(doc);
  return pathKeyOfBox(doc, boxId, seed, altDeep, part, () => sigNo(held ? (heldSig ||= docSig(doc)) : st ? (st.sig ||= docSig(doc)) : docSig(doc)), held ? heldLinks : st?.links);
}
/** 作れなかった見本の鍵: 木全体の鍵の代わりに親の見本そのもの (全部消えてよい消去の手の箱では使わない。止まる所が木全体を見る) */
function failKeyOf(doc: TreeDoc, boxId: string, seed: number, base: StageItem, aimed: ReadonlySet<string> | undefined): string {
  const held = heldDoc === doc, part = held ? (heldPart ??= docPartOf(doc)) : docPartOf(doc);
  return `${pathKeyOfBox(doc, boxId, seed, altDeep, part, () => 0, held ? heldLinks : undefined)}|${itemKeyOf(base)}|${aimed ? [...aimed].sort().join() : ""}`;
}
/** 箱の中身の覚えの鍵 (見本の番号を除いた道の鍵、tree-judge) */
export const boxKeyOf = (doc: TreeDoc, boxId: string): string => keyOf(doc, boxId, 0);
/** 木の前提 + 種 → 始まりの見本 (元) */
const STARTS = new Map<string, Sample>();
function sampleRaw(data: PatchData, doc: TreeDoc, boxId: string, seed: number): Sample {
  const b = doc.boxes[boxId];
  if (!b) return { item: freshItem(data, doc.base, doc.itemLevel, "rare"), note: null };
  // 始まりの見本は木の前提と種だけで決まるので元を覚えて写しを返す (狙いが変わっても下の箱の打った並びを使える、S-71b ⑱)
  if (b.out === "start") { const k = `${premiseOf(doc)}|${seed}`; let s0 = STARTS.get(k); if (!s0) putCapped(STARTS, k, (s0 = startItemOf(data, doc, mulberry32(seed))), 512); return { item: handOut(s0.item), note: s0.note }; }
  // 見本は道 (始まり → 親の手の並び、種は見本の番号と道の札) だけで決め、ほかの枝に手を足しても変わらない (S-74。前の「回して着いた人」tree-arrived は R5 で外した)
  const p = doc.boxes[b.parent!]!;
  const base = sampleIn(data, doc, p.id, seed);
  // 分かれ目の行の箱: その行に合う形が出るまで親の見本を別の種で引き直す (10-22 13 通り組んだ #8: 「サフィの外れ 1 つ以上」の行の見本がプレに外れの形で、
  // 効くお告げが「今は意味なし」で押せなかった)。合う形が出なければ親の見本のまま
  if (p.split) {
    const aims = aimsOf(doc);
    for (let k = 0; k < SPLIT_TRIES; k++) {
      const smp = k ? sampleIn(data, doc, p.id, seed + 7919 * k) : base;
      if (splitTo(data, p.split, smp.item, aims) === boxId) return smp;
    }
    return base;
  }
  // ヒネコラのハズレ (打たない、S-39) の箱の見本は親の見本のまま (手を使わない)
  if (!p.hand || b.seen) return base;
  const aims = aimsOf(doc);
  // MOD を変えない手 (神・ヒネコラ、S-39) は親の見本に打つだけ (引き直さない。引き直すと中身の組が親とずれ、神の後のヒネコラが前のヒネコラの箱へ戻れなかった、11-06 オーナー「普通にループしない」)
  if (!p.hand.repeat && keepsMods(data, base.item, p.hand.currency, p.hand.omens)) return sampleFrom(data, doc, b, p, base, seed, boxId, aims);
  // 当たりの箱の狙いを親の見本がもう持っている (まとめた箱「アーマーかライフ」のアーマーの道で、次の当たり「アーマーが付いた」) 時は、
  // 持っていない親の見本を引き直す (付け直せず親の見本のまま「アーマーだけ」が出た、10-27 夜モンキー 2 回目 1。スイッチ hitNew)
  // 引き直しは一番下の箱の 1 回だけ (親をたどる中でも引き直すと、深い木で数が掛け算になりページが固まった)
  // フラクチャーの当たりは、もう付いている狙いが ✦ になる物なので引き直さない
  // 狙い無しの乱数のフラクチャーの箱 (「〇〇がフラクチャーされた場合」): その MOD が固定できる形で付いた親の見本を引く (まれな MOD の箱で、見本に ✦ が付かず親のままだった。スイッチ fracPick)
  if (fracFree(doc, p.hand) && !altDeep && ((b.out === "hit" && b.aim) || b.junkKey)) {
    altDeep = true;
    try {
      const goals = doc.memoAims ?? [];
      for (let k = 0; k < FRAC_TRIES; k++) {
        const alt = k ? sampleIn(data, doc, p.id, seed + 7919 * k) : base, altSeed = seed + 7919 * k;
        const ok = (m: StageMod): boolean => !m.fractured && !m.desecrated && !m.unrevealed && (b.aim ? m.modId === b.aim.modId : junkKeyOf(data, m) === b.junkKey && !goals.some((g) => g.modId === m.modId));
        if ([...alt.item.prefixes, ...alt.item.suffixes].some(ok)) return sampleFrom(data, doc, b, p, alt, seed, boxId, aims, altSeed);
      }
    } finally { altDeep = false; }
  }
  if (!altDeep && b.out === "hit" && b.aim && !(p.hand && effectOf(p.hand.currency) === "fracture") && aimHeldOn(data, base.item, b.aim, { sameText: true })) {
    altDeep = true;
    try {
      for (let k = 1; k < HIT_TRIES; k++) {
        const alt = sampleIn(data, doc, p.id, seed + 7919 * k);
        if (!aimHeldOn(data, alt.item, b.aim, { sameText: true })) return sampleFrom(data, doc, b, p, alt, seed, boxId, aims, seed + 7919 * k);
      }
    } finally { altDeep = false; }
  }
  const r0 = sampleFrom(data, doc, b, p, base, seed, boxId, aims);
  // 道の見本から作れない結果の箱は、↩ で着く人の形 (S-21)
  if (r0.note && b.via?.length) return { item: b.via[seed % b.via.length]!, note: null };
  // boxShape: 親の見本からこの箱の結果が作れない (枠が埋まっている等) 時は、親の見本を別の種で引き直す (道だけの見本は 1 つの乱数、10-28 見張り アミュ B b31)。
  // 狙いを無理に付けた見本 (forced) も引き直す: マジックの埋まった側に付けてレアに上がり、増強の当たりの箱のカードがレアの枠になった (10-28 夜オーナー「増強だっつーのにアイテムカードがレアになってんなバグだね」)
  if (!r0.note || altDeep) return r0;
  altDeep = true;
  try {
    for (let k = 1; k < HIT_TRIES; k++) { const r = sampleFrom(data, doc, b, p, sampleIn(data, doc, p.id, seed + 7919 * k), seed, boxId, aims, seed + 7919 * k); if (!r.note) return r; }
    // 削減の順位の箱は、箱を作る時と同じく親の見本の外れをその順位の段へ差し替えて打つ (差し替えないと順位の箱の見本が作れない、S-65b)
    if (isWhittleHand(p.hand)) for (const v of rankVariants(data, base.item, aims, p.junkKey)) { const r = sampleFrom(data, doc, b, p, { ...base, item: v.item }, seed, boxId, aims); if (!r.note) return r; }
  } finally { altDeep = false; }
  return r0;
}
/** 親の見本 base に親の手を打って、この箱の見本を作る。baseSeed = base が親の何番目の見本か (親を別の種で引き直した時は seed + 7919k) */
export function sampleFrom(data: PatchData, doc: TreeDoc, b: TreeBox, p: TreeBox, base: Sample, seed: number, boxId: string, aims: Aim[], baseSeed = seed): Sample {
  if (!p.hand || b.seen) return base;
  const h = p.hand, ha = handAims(doc, p.id, aims);
  const rs = seed ^ 0x5eed ^ [...pathKeyOf(doc, boxId)].reduce((x, c) => (x * 31 + c.charCodeAt(0)) | 0, 7); // 種は見本の番号と道の札 (S-74 A。箱の id だと組み直しで振り直されるだけで見本が変わった、bone3 の止まり 0 → 26)
  // 打った結果の並びは親の見本・手・種・打つ時のエンジンの設定で決まる (繰り返しの手は当たりの札も) ので覚えて、狙いが変わった時は分け直すだけ (S-71b ⑱、tree-rolls)。
  // 設定は木の tune でなく今の設定 (↩ で着く人の見本は sampleOf を通らずに打つ)
  const rk = `${JSON.stringify(h)}|${rs}|${JSON.stringify(stageTuning())}${h.repeat ? `|${JSON.stringify(ha)}` : ""}`;
  const roll = (i: number): Roll => rollAt(base.item, rk, i, () => mulberry32(rs), (rng) => playHand(data, base.item, h, rng, ha));
  // MOD を変えない手 (神・ヒネコラ、S-39): 親の見本に 1 回打つだけ、作れなかった見本の印 (note) も親のまま = 中身の組が親と同じ (同じ手の戻り S-51 で前の箱へ戻れる)
  // 打てなければ下の打ち直しは乱数の続き (2 つ目) から
  let from = 0;
  if (!h.repeat && keepsMods(data, base.item, h.currency, h.omens)) { const r = roll(0); if (r.applied) return { item: handOut(r.item), note: base.note }; from = 1; }
  let last: Roll | null = null;
  // 箱の形 (道の狙いの組) に合う結果だけ、無ければ合わなかった最初の結果 (途中で狙いが消えた結果が当たりの見本になった、10-28 見張り。boxShape)
  // 道の狙いの組 (heldSets) では絞らない。見本 = 親の見本にエンジンで打った結果 (大本 1)
  // ☑ は打ち直しの間変わらないので 1 回だけ引く (打ち直しのたびに引いて鍵を作っていた)
  // 親の見本の ☑ は、その見本の種で決める (前は見本の物そのもので引き、引けないと元の種の ☑ で数えたので、引き直した親の見本では先に誰かが ☑ を作ったかで結果が変わった。11-07 b18、S-74)
  let held: ReadonlySet<string> | undefined;
  const aimedNow = (): ReadonlySet<string> | undefined => (held ??= sampleAimed(data, doc, p.id, baseSeed));
  // 数え上げられない手の側の鍵の無い箱は一番多い形だけ (ほかの形は整理で足す箱へ行く、S-21・S-74)
  const main = !b.junkKey && (b.out === "any" || b.out === "junk" || b.out === "hit") ? mainSideOf(data, base.item, p.hand) : undefined;
  const fk = failKeyOf(doc, boxId, seed, base.item, aimedNow());
  const failed = fk ? failMemo.get(fk) : undefined;
  if (failed !== undefined) return { item: base.item, note: failed };
  const had = okMemo.get(fk), got = (item: StageItem): Sample => { const c = handOut(item); putCapped(okMemo, fk, c); return { item: c, note: null }; };
  if (had) return { item: had, note: null };
  for (let i = 0, tries = TRIES_LIGHT; i < tries; i++) {
    const r = roll(from + i);
    if (!r.applied) { last = r; break; }
    last = r;
    // 結果の分け方は回す・精査と同じく親の見本の ☑ で (S-60。前は ☑ を渡さず木の狙い全部で数え、☑ の無い狙いが消えた人が「狙いが消えた」の見本になった = 見張り J5)
    const o = boxOutcomeOf(data, doc, p, base.item, r.item, aims, aimedNow());
    // 当たるまでの手が上限まで打っても当たらない = 付かない狙いだけ。引き直しても同じなのでやめる (1 回 5000 回 × 3000 で画面が固まった、10-22)
    if (p.hand.repeat && o.out !== "hit") break;
    if (b.out === "pass") return got(r.item);
    if (b.out !== "any" && o.out !== b.out && !b.mergedOuts?.includes(o.out)) continue;
    if (b.out === "any" && o.out === "lost") continue; // 打った後の箱の見本に狙いが消えた結果を入れない (中身が混ざった、S-71g)
    if (b.junkKey && o.junkKey !== b.junkKey) continue; // 外れの枝の鍵 (狙い無しの乱数のフラクチャー、スイッチ fracPick)
    if (main && o.junkKey !== main) continue;
    // エッセンスの当たりの箱は札が付いた MOD の名前 (tree-run の outBoxOf と同じ)。無限のエッセンスで箱が 2 つ以上なら付いた MOD の箱
    if (b.out === "hit" && b.aim && effectOf(p.hand.currency) === "essence" && !essenceBoxFits(doc, p, b, r.item)) continue;
    if (b.out === "hit" && b.aim && effectOf(p.hand.currency) !== "essence" && !boxAims(b).some((x) => o.hits.some((a) => a.modId === x.modId && a.tier === x.tier))) continue;
    return got(r.item);
  }
  const remember = (note: string): Sample => { if (fk) putCapped(failMemo, fk, note); return { item: base.item, note }; };
  if (last && !last.applied) return remember(`cant:${last.reason ?? ""}`);
  // boxShape: 狙いを手で付ける (forceKey) のはやめる。手で付けるのはエミュの「付ける」の親切 (マジックの埋まった側ならレアにして付ける) で、エンジンの手の結果ではない
  // (増強の当たりの箱の見本がレアになった、10-28 夜オーナー「これはエンジンを参照した動きになってないのと同義では」)。作れない印を返し、親の見本を引き直す (S-74)
  if (b.out === "hit" && b.aim) return remember("cant:unreachable");
  return remember("none");
}
