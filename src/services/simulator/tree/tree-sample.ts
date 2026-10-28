/**
 * tree-sample.ts — ツリーの箱に「着いた時のアイテム」の見本を 1 個作る・箱の手を 1 回打つ (2026-10-22 オーナー「エンジンでカレンシーを使えるように。
 * 外れのやり方を決める時にカレンシーを打たせて決める」)。打つのは全部エンジンの入口 (engine.ts の applyCurrency)、ここで結果は作らない。
 *
 * 見本の作り方: 始まり = 金の指輪のレア + フラクチャー (指名の手 force:…|f をエンジンで打つ。創生の樹の MOD も置ける)。
 * その下の箱 = 木を回して実際にその箱に着いた人のアイテム (tree-arrived、10-25 シミュ 26 本目)。誰も着かない箱だけ、親の見本に親の手を打ち、結果がその箱 (当たり X / 外れ / 外れが消えた / 狙いが消えた) になるまで引き直す (TRIES 回まで)。
 * 引けなかった当たりは、親の見本に指名で付けて作る (note に書く)。分け方は設計 11 の表 (付いた > 消えた > 外れが減った > 外れ)
 */
import { aimDone, aimHits as hits, applyCurrency, room, sideOfMod, baseSocketsOf, catalystOf, forceKey, freshItem, kindOf, mulberry32, omenBlock, OMEN_FOR, revealOffers, runeIdByName, tierIndexOf, unrevealedOf, useReason, type AimHitOpts, type AimTarget, type PatchData, type StageApply, type StageItem, type StageMod } from "../../craft-stage/engine";
import { fractureStart } from "../../simulator/sim-engine";
import { catalystFull, catalystTagOf, fillCatalyst } from "../../simulator/sim-engine";
import { aimHeldOn, isAimMod, junkOf } from "./tree-aim";
import { flag } from "../../../web/release-flags";
import { CATALYSING as CATALYSING_OMEN, ECHO, ECHO as ABYSSAL_ECHO_OMEN, effectOf, isBone, isCatalyst } from "./tree-hands";
import { tr } from "../../../i18n/lang";
import { fractureMarks, START_JUNK, startOf, startRarity, startsFractured, type Aim, type Hand, type OutKind, type TreeBox, type TreeDoc, boxAims } from "./tree-model";
import { withTreeTune } from "./tree-tune";
import { splitTo } from "./tree-shape";
import { boxOutcomeOf, stripStop } from "./tree-outcome";
import { arrivedAt } from "./tree-arrived";
import { autoRuneKeys, passThrough, prepFor } from "./tree-unbounded";
import { isRevealHand, veilKeep, veilPick } from "./tree-veil";
import { fracFree, fractureTarget, junkKeyOf } from "./tree-frac-pick";
export { fractureChoices, fractureTarget } from "./tree-frac-pick"; // フラクチャーの小物は tree-frac-pick へ (1 ファイル 500 行まで、10-28)
import { shapeFit } from "./tree-sample-shape";
export { goalsHeld, heldHitOf } from "./tree-unbounded";

const TRIES = 3000;
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
  // 発現で選ぶ手 (骨の「発現させる」・後から打つ発現) は、その手の当たりの箱の札 (☑。完成の狙いに無い置き石も) だけで選ぶ (スイッチ boneLater)
  if (veilPick(b?.hand)) return b!.outs.flatMap((o) => { const c = doc.boxes[o]; return c?.out === "hit" && c.aim ? boxAims(c) : []; });
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
    // 発現で選んだ置き石 (完成の狙いに無い MOD) は、その手の時だけ当たり。以降の手では冒涜の外れ MOD (10-27 夜オーナー、スイッチ boneLater)
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
 * 箱の手を 1 回打つ (触媒の時はカタリストで品質を上げてから。台本の while と同じ)。
 * 繰り返しの手 (repeat) は、当たりの札 (aims) のどれかが新しく付くまで (か上限まで) 打ち続けた結果を 1 回分として返す。
 * use を渡すと使った物 (カタリストの数・カレンシー・お告げ) を数える (100 人回し tree-run)
 */
export function playHand(data: PatchData, item: StageItem, h: Hand, rng: () => number, aims: readonly Aim[] = [], use?: (key: string, n?: number) => void, miss = false, stop?: (it: StageItem) => boolean): StageApply {
  // 消去で全部消えてよい (残したい MOD の ☑ が 0、10-27 オーナー): 消去 1 回ごとに箱を直線に並べる (tree-hand-plan の stripChain)。1 箱でエンジンの消去を 1 回、
  // もう木の箱と同じ形 (stop、tree-outcome の stripStop) か消せる物が無ければ打たずに通す (オーナー「消去 1 つ損する」)
  if (h.keep && !h.keep.length && effectOf(h.currency) === "remove") {
    const c = stop?.(item) ? null : playHand(data, item, { ...h, keep: undefined }, rng, aims, use, miss);
    return c?.applied ? c : { applied: true, item, added: [], removed: [] };
  }
  if (h.repeat) {
    // カオススパム = まとめた設定 (10-25 オーナー・ブラック): 狙いの側に空きがあれば高貴を 1 回 → カオス (お告げ込み) を 1 回ずつ、選んだ狙いのどれかが付いたら当たり。
    // 1 手ずつはエンジンの applyCurrency (applyHand)、当たりはエンジンの aimDone。ツリーの物は繰り返す順番だけ (スパムシミュは使わない、オーナー「あっちはカオスオーブ全部打つ仕組み」)
    const cap = h.repeat.max ?? SPAM_CAP;
    const open = targetsOf(data, aims).filter((t) => !aimDone(item, [t]));
    const done = (x: StageItem): boolean => open.some((t) => aimDone(x, [t]));
    let r: StageApply = { applied: false, item, added: [], removed: [] };
    let it = item;
    if (aims.some((a, i) => !aimDone(item, [targetsOf(data, aims)[i]!]) && room(it, sideOfMod(data, a.modId)))) {
      const e = playHand(data, it, { ...h, currency: "exalt", omens: [], catalyst: null, repeat: null }, rng, aims, use, miss);
      if (e.applied) { it = e.item; r = { ...e, applied: true }; if (done(it)) return r; }
    }
    for (let i = 0; i < cap; i++) {
      const c = playHand(data, it, { ...h, repeat: null }, rng, aims, use, miss);
      if (!c.applied) return it !== item ? { ...c, applied: true, item: it } : c;
      r = c; it = c.item;
      if (done(it)) break;
    }
    return { ...r, item: it };
  }
  // 狙い無しの埋めるだけの高貴は、もう両側満杯なら打たずにそのまま次の箱へ (何も使わない。10-25 オーナー・ブラック、
  // 合金の 50/50 で負けて満杯のまま戻った人がスピリットの後の埋める高貴で止まっていた。分かれ道の箱は作らない)
  // もう嵌まっているルーンの手も打たずに通す (戻りの道でまた来た。10-26 オーナー「もっかい嵌め直しとかないから」)
  if (passThrough(item, h)) return { applied: true, item, added: [], removed: [] };
  const before = item;
  item = prepFor(data, item, h.currency); // 規格外: ルーンの手はソケットを足す・クラフト MOD が上限ならアストリッドを先に嵌める (tree-unbounded)
  // 1 回分はエンジンの入口の applyHand (B6〜B8 10-22): カタリストの手は品質を今の最大まで (もう最大なら通る)・触媒の前のカタリスト・
  // フラクチャーで ✦ にする MOD・骨の後はそのまま発現 (反響は骨に掛けず発現で使う)。
  // 発現は当たりの札に合う候補、無ければ 1 つ目 (2026-10-22 オーナー「冒涜は冒涜で付与かな」)。miss = 外れの箱の見本 (狙いでない候補を選ぶ。黒き血は狙いが必ず候補に入り、見本が外れの箱に着かなかった、10-22)
  const ts = targetsOf(data, aims);
  // 骨を未発現のまま次へ (veil keep) は発現しない。未発現を持ったまま打つほかの手 (フラクチャー・カオスなど) も発現しない = 未発現のまま (スイッチ boneLater。
  // 前は手の後に未発現があれば必ず発現まで打っていた = 骨の手の後だけだった)
  const keepVeil = veilKeep(h) || (flag("boneLater") && !isBone(h.currency) && !isRevealHand(h.currency));
  const r = applyHand(data, item, h.currency, rng, { omens: h.omens, catalyst: h.catalyst, fractureOf: fractureTarget(data, item, h, aims, rng), reveal: keepVeil ? false : (m) => isAimMod(m, ts, aimOpts(data)) !== miss });
  if (use) {
    if (r.applied) for (const k of autoRuneKeys(before, item)) use(k);
    if (r.catalystCount) use(isCatalyst(h.currency) ? h.currency : h.catalyst!, r.catalystCount);
    if (r.applied && !isCatalyst(h.currency)) {
      use(h.currency);
      for (const o of r.handOmensUsed) use(o);
      if (r.echoUsed) use(ECHO);
    }
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
  if (passThrough(item, h)) return null;
  return canUse(data, prepFor(data, item, h.currency), h.currency, { omens: h.omens, catalyst: h.catalyst });
}

/** 箱の見本 (seed が同じなら同じ物。木の設定 tune で打つ) */
export function sampleOf(data: PatchData, doc: TreeDoc, boxId: string, seed: number): Sample {
  // 見本は道だけで決まる (S-74、スイッチ boxShape) ので、木の中身 (位置を除く) が同じなら覚えた見本を返す。
  // 整列・段揃え・引っ張るなど位置だけの変化で全部の箱をエンジンで作り直し、整列が毎回約 1 秒かかった (10-28 夜オーナー「サイトが重い」)
  if (!flag("boxShape")) return withTreeTune(doc, () => sampleIn(data, doc, boxId, seed));
  const sig = docSig(doc);
  if (sig !== memoSig || data !== memoData) { memo.clear(); memoSig = sig; memoData = data; }
  return withTreeTune(doc, () => sampleIn(data, doc, boxId, seed));
}
/** 覚えた見本 (木の中身の鍵が変わったら全部捨てる) */
const memo = new Map<string, Sample>();
let memoSig = "", memoData: PatchData | null = null;
/** 木の中身の鍵 (位置 x・y と、見本に効かないメモの文を除く) */
const docSig = (doc: TreeDoc): string => JSON.stringify(doc, (k, v) => (k === "x" || k === "y" || k === "note" ? undefined : v));
function sampleIn(data: PatchData, doc: TreeDoc, boxId: string, seed: number): Sample {
  if (!flag("boxShape")) return sampleRaw(data, doc, boxId, seed);
  const k = `${boxId}|${seed}|${altDeep ? 1 : 0}`;
  let r = memo.get(k);
  if (!r) { r = sampleRaw(data, doc, boxId, seed); memo.set(k, r); }
  return r;
}
function sampleRaw(data: PatchData, doc: TreeDoc, boxId: string, seed: number): Sample {
  const b = doc.boxes[boxId];
  if (!b) return { item: freshItem(data, doc.base, doc.itemLevel, "rare"), note: null };
  if (b.out === "start") return startItemOf(data, doc, mulberry32(seed));
  // 回して実際にこの箱に着いた人のアイテム (seed 番目、tree-arrived)。誰も着かない箱だけ下の作り方 (引き直し・指名で付ける)
  // boxShape: 見本は道 (始まり → 親の手の並び、種は見本の番号と箱の id 全体) だけで決め、ほかの枝に手を足しても変わらない (S-74 仮、10-28)
  const got = flag("boxShape") ? [] : arrivedAt(data, doc, boxId);
  if (got.length) return { item: got[(Math.max(1, seed) - 1) % got.length]!, note: null };
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
  if (!p.hand) return base;
  const aims = aimsOf(doc);
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
        const alt = k ? sampleIn(data, doc, p.id, seed + 7919 * k) : base;
        const ok = (m: StageMod): boolean => !m.fractured && !m.desecrated && !m.unrevealed && (b.aim ? m.modId === b.aim.modId : junkKeyOf(data, m) === b.junkKey && !goals.some((g) => g.modId === m.modId));
        if ([...alt.item.prefixes, ...alt.item.suffixes].some(ok)) return sampleFrom(data, doc, b, p, alt, seed, boxId, aims);
      }
    } finally { altDeep = false; }
  }
  if (!altDeep && b.out === "hit" && b.aim && !(p.hand && effectOf(p.hand.currency) === "fracture") && aimHeldOn(data, base.item, b.aim, { sameText: true })) {
    altDeep = true;
    try {
      for (let k = 1; k < HIT_TRIES; k++) {
        const alt = sampleIn(data, doc, p.id, seed + 7919 * k);
        if (!aimHeldOn(data, alt.item, b.aim, { sameText: true })) return sampleFrom(data, doc, b, p, alt, seed, boxId, aims);
      }
    } finally { altDeep = false; }
  }
  const r0 = sampleFrom(data, doc, b, p, base, seed, boxId, aims);
  // boxShape: 親の見本からこの箱の結果が作れない (枠が埋まっている等) 時は、親の見本を別の種で引き直す (道だけの見本は 1 つの乱数、10-28 見張り アミュ B b31)。
  // 狙いを無理に付けた見本 (forced) も引き直す: マジックの埋まった側に付けてレアに上がり、増強の当たりの箱のカードがレアの枠になった (10-28 夜オーナー「増強だっつーのにアイテムカードがレアになってんなバグだね」)
  if (!flag("boxShape") || !r0.note || altDeep) return r0;
  altDeep = true;
  try { for (let k = 1; k < HIT_TRIES; k++) { const r = sampleFrom(data, doc, b, p, sampleIn(data, doc, p.id, seed + 7919 * k), seed, boxId, aims); if (!r.note) return r; } } finally { altDeep = false; }
  return r0;
}
/** 親の見本 base に親の手を打って、この箱の見本を作る */
function sampleFrom(data: PatchData, doc: TreeDoc, b: TreeBox, p: TreeBox, base: Sample, seed: number, boxId: string, aims: Aim[]): Sample {
  if (!p.hand) return base;
  const rng = mulberry32(seed ^ 0x5eed ^ (flag("boxShape") ? [...boxId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) : boxId.length * 7919));
  let last: StageApply | null = null;
  // 箱の形 (道の狙いの組) に合う結果だけ、無ければ合わなかった最初の結果 (途中で狙いが消えた結果が当たりの見本になった、10-28 見張り。boxShape)
  const fits = flag("boxShape") ? shapeFit(data, doc, boxId) : null; let loose: Sample | null = null;
  for (let i = 0; i < TRIES; i++) {
    const r = playHand(data, base.item, p.hand, rng, handAims(doc, p.id, aims), undefined, b.out === "junk" || b.out === "lost", stripStop(data, doc, p));
    if (!r.applied) { last = r; break; }
    last = r;
    const o = boxOutcomeOf(data, doc, p, base.item, r.item, aims);
    // 当たるまでの手が上限まで打っても当たらない = 付かない狙いだけ。引き直しても同じなのでやめる (1 回 5000 回 × 3000 で画面が固まった、10-22)
    if (p.hand.repeat && o.out !== "hit") break;
    if (b.out === "pass") return { item: r.item, note: null };
    if (b.out !== "any" && o.out !== b.out && !b.mergedOuts?.includes(o.out)) continue;
    if (b.junkKey && o.junkKey !== b.junkKey) continue; // 外れの枝の鍵 (狙い無しの乱数のフラクチャー、スイッチ fracPick)
    // エッセンスの当たりの箱は札が付いた MOD の名前 (tree-run の outBoxOf と同じ)。無限のエッセンスで箱が 2 つ以上なら付いた MOD の箱
    if (b.out === "hit" && b.aim && effectOf(p.hand.currency) === "essence" && !essenceBoxFits(doc, p, b, r.item)) continue;
    if (b.out === "hit" && b.aim && effectOf(p.hand.currency) !== "essence" && !boxAims(b).some((x) => o.hits.some((a) => a.modId === x.modId && a.tier === x.tier))) continue;
    if (fits && !fits(r.item)) { loose ??= { item: r.item, note: null }; continue; }
    return { item: r.item, note: null };
  }
  if (loose) return loose;
  if (last && !last.applied) return { item: base.item, note: `cant:${last.reason ?? ""}` };
  // boxShape: 狙いを手で付ける (forceKey) のはやめる。手で付けるのはエミュの「付ける」の親切 (マジックの埋まった側ならレアにして付ける) で、エンジンの手の結果ではない
  // (増強の当たりの箱の見本がレアになった、10-28 夜オーナー「これはエンジンを参照した動きになってないのと同義では」)。作れない印を返し、親の見本を引き直す (S-74)
  if (b.out === "hit" && b.aim && flag("boxShape")) return { item: base.item, note: "cant:unreachable" };
  if (b.out === "hit" && b.aim) {
    const r = applyCurrency(data, base.item, forceKey(b.aim.modId, `T${b.aim.tier}`, "n"), rng);
    return { item: r.item, note: r.applied ? "forced" : r.reason ?? null };
  }
  return { item: base.item, note: "none" };
}

// ここから下は木の打ち方の組み合わせ (2026-10-23 エンジンの for-sim から戻した。中身はエンジンの核の関数を呼ぶだけ)

/** 段の名前の T で言う狙い (T1 が一番上) */
interface TierAim { modId: string; tier: number }
interface AimDiffOpts { sameText?: boolean }

const targetOf = (data: PatchData, a: TierAim): AimTarget => ({ modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) });
const modsOf = (item: StageItem): StageMod[] => [...item.prefixes, ...item.suffixes];
const heldOn = (data: PatchData, mods: readonly StageMod[], a: TierAim, o: AimDiffOpts): boolean => {
  const t = targetOf(data, a), opts = o.sameText ? { data, sameText: true } : undefined;
  return mods.some((m) => hits(m, t, opts));
};

interface AimDiff<A extends TierAim = TierAim> {
  /** 前に無く後に付いている狙い (並びは aims のまま) */
  hits: A[];
  /** 前に付いていて後に無い狙い */
  lost: A[];
  /** 外れ (固定でも狙いでもない MOD) の数が減った */
  junkGone: boolean;
  /** 新しく ✦ (フラクチャー) になった MOD (無ければ null) と、それが当たる狙い */
  fractured: StageMod | null;
  fracturedHits: A[];
}

/** 1 手の前 (before) と後 (after) で狙いがどう変わったか */
export function aimDiff<A extends TierAim>(data: PatchData, before: StageItem, after: StageItem, aims: readonly A[], o: AimDiffOpts = {}): AimDiff<A> {
  const bm = modsOf(before), am = modsOf(after);
  const had = aims.filter((a) => heldOn(data, bm, a, o));
  const has = aims.filter((a) => heldOn(data, am, a, o));
  const ts = aims.map((a) => targetOf(data, a)), opts = o.sameText ? { data, sameText: true } : undefined;
  const junk = (it: StageItem): number => { const j = junkOf(it, ts, opts); return j.prefix.length + j.suffix.length; };
  const was = new Set(bm.filter((m) => m.fractured).map((m) => m.modId));
  const fractured = am.find((m) => m.fractured && !was.has(m.modId)) ?? null;
  return {
    hits: has.filter((a) => !had.includes(a)),
    lost: had.filter((a) => !has.includes(a)),
    junkGone: junk(after) < junk(before),
    fractured,
    fracturedHits: fractured ? aims.filter((a) => heldOn(data, [fractured], a, o)) : [],
  };
}

/**
 * 手に付けたお告げを、その手に掛かる物 (now) と続けて打つ発現に掛かる物 (reveal = アビスの反響) に分ける。
 * 骨 (冒涜) の手に付けた反響は骨には掛からず (渡すとエンジンが弾く)、その後の発現で使う。発現の手そのものなら now
 */
function handOmens(key: string, omens: readonly string[]): { now: string[]; reveal: string[] } {
  if (kindOf(key) === "reveal") return { now: [...omens], reveal: [] };
  const rv = OMEN_FOR.reveal ?? [];
  return { now: omens.filter((o) => !rv.includes(o)), reveal: omens.filter((o) => rv.includes(o)) };
}

interface UseSpec {
  /** 手に付けたお告げ (反響は handOmens で発現の側へ分ける) */
  omens?: readonly string[];
  /** 触媒の高貴の前に品質を最大まで入れるカタリスト (お告げに触媒の高貴がある時だけ使う) */
  catalyst?: string | null;
}

/**
 * その手 (key + お告げ + 触媒の前のカタリスト) がこのアイテムに打てない理由。打てるなら null。
 * - お告げ: 1 枚ずつ omenBlock (触媒の時はカタリストで品質を入れた後のアイテムで聞く)。消せる物が無い側のお告げ・効かないお告げ (オーナー 10-22「進行不能」)
 * - カタリストの手: 1 個でも入る・もう最大なら打てる
 * - 触媒の高貴: カタリストが入らず、別の種類の品質しか無ければ打てない
 * - 手そのもの: エンジンの useReason (クラフト台の棚の灰色と同じ判定。乱数で決まる物は打てる扱い、10-25 置き換え)
 */
function canUse(data: PatchData, item: StageItem, key: string, spec: UseSpec = {}): string | null {
  const now = handOmens(key, spec.omens ?? []).now;
  // 後から打つ発現の手: 未発現の MOD があれば打てる (スイッチ boneLater)
  if (isRevealHand(key)) return unrevealedOf(item) ? null : tr("未発現の MOD が無い", "No unrevealed mod");
  const cat = spec.catalyst && now.includes(CATALYSING_OMEN) ? spec.catalyst : null;
  const filled = cat ? fillCatalyst(data, item, cat, mulberry32(1)).item : item;
  for (const o of now) { const why = omenBlock(data, filled, key, now, o); if (why) return why; }
  const rng = mulberry32(1);
  if (kindOf(key) === "catalyst") {
    const r = fillCatalyst(data, item, key, rng);
    return r.count || catalystFull(item, key) || r.random ? null : r.reason ?? tr("打てない", "Can't use");
  }
  let it = item;
  if (cat) {
    const r = fillCatalyst(data, it, cat, rng);
    if (!r.applied && r.count === 0 && catalystOf(it).tag !== catalystTagOf(cat)) return r.random ? null : r.reason ?? tr("打てない", "Can't use");
    it = r.item;
  }
  return useReason(data, it, key, now);
}

interface HandSpec {
  /** 手に付けたお告げ (反響は handOmens で発現の側へ) */
  omens?: readonly string[];
  /** 触媒の高貴の前に品質を最大まで入れるカタリスト (お告げに触媒の高貴がある時だけ) */
  catalyst?: string | null;
  /** フラクチャーの手で ✦ にする MOD (付いていれば打った後にそれを固定。付いていない・打てない時はエンジンの乱数のまま) */
  fractureOf?: string | null;
  /** 未発現が付いた時、そのまま発現で選ぶ候補 (true の候補の最初の物、無ければ 1 つ目)。false = 発現しない。既定 = 1 つ目 */
  reveal?: false | ((m: StageMod) => boolean);
}
interface HandResult extends StageApply {
  /** 触媒の前 (かカタリストの手そのもの) で打ったカタリストの個数 */
  catalystCount: number;
  /** 手そのもので使ったお告げ (発現の前。発現の物は omensUsed) */
  handOmensUsed: string[];
  /** 反響を発現に使った */
  echoUsed: boolean;
}

/**
 * 発現 (魂の井戸) で候補を選んで打つ。候補 3 つ (revealOffers) のうち want に合う最初の物、無ければ 1 つ目。
 * echo = アビスの反響があれば、最初の 3 つに無い時に 1 回引き直した 3 つから (同じ種で引くのでエンジンの reveal:N:reroll と同じ候補、apply-desecrate.ts)。
 * r = 未発現が付いた手の結果 (付いた・消えた MOD は足し合わせる)。発現できなければ r のまま
 */
function revealBy(data: PatchData, r: StageApply, rng: () => number, want: (m: StageMod) => boolean, echo = false): StageApply {
  const seed = Math.floor(rng() * 2 ** 31);
  const offers = revealOffers(data, r.item, mulberry32(seed));
  const n = offers.first.findIndex(want);
  const k = n < 0 && echo ? offers.reroll.findIndex(want) : -1;
  // reveal:N の N は 1 から (エンジンの run-plan と同じ。0 は「その番号の候補が無い」)
  const x = k >= 0 ? applyCurrency(data, r.item, `reveal:${k + 1}:reroll`, mulberry32(seed), [ABYSSAL_ECHO_OMEN]) : applyCurrency(data, r.item, `reveal:${Math.max(0, n) + 1}`, mulberry32(seed));
  return x.applied ? { ...x, added: [...r.added, ...x.added], removed: [...r.removed, ...x.removed] } : r;
}

/** 手を 1 回打つ (上の HandSpec の順)。カタリストの手は品質を今の最大まで (もう最大なら打てた扱いで何もしない) */
function applyHand(data: PatchData, item: StageItem, key: string, rng: () => number, spec: HandSpec = {}): HandResult {
  if (kindOf(key) === "catalyst") {
    const r = fillCatalyst(data, item, key, rng);
    return { ...r, applied: r.applied || r.count > 0 || catalystFull(item, key), catalystCount: r.count, handOmensUsed: [], echoUsed: false };
  }
  const { now, reveal } = handOmens(key, spec.omens ?? []);
  // 後から打つ発現の手 (スイッチ boneLater): 候補 3 つから ☑ の物 (無ければ 1 つ目)。反響はこの手のお告げ
  if (isRevealHand(key)) {
    if (!unrevealedOf(item)) return { applied: false, item, added: [], removed: [], reason: tr("未発現の MOD が無い", "No unrevealed mod"), catalystCount: 0, handOmensUsed: [], echoUsed: false };
    const echo = now.includes(ABYSSAL_ECHO_OMEN);
    return { ...revealBy(data, { applied: true, item, added: [], removed: [] }, rng, spec.reveal || (() => false), echo), catalystCount: 0, handOmensUsed: [], echoUsed: echo };
  }
  let it = item, catalystCount = 0;
  if (spec.catalyst && now.includes(CATALYSING_OMEN)) {
    const c = fillCatalyst(data, it, spec.catalyst, rng);
    if (!c.applied && c.count === 0 && catalystOf(it).tag !== catalystTagOf(spec.catalyst)) return { ...c, catalystCount: 0, handOmensUsed: [], echoUsed: false };
    catalystCount = c.count;
    it = c.item;
  }
  let r = applyCurrency(data, it, key, rng, now);
  const fo = spec.fractureOf;
  if (r.applied && fo && effectOf(key) === "fracture" && [...it.prefixes, ...it.suffixes].some((m) => m.modId === fo)) {
    // 決めた MOD が固定された結果を、エンジンのフラクチャーを打ち直して取る (確定フラクチャーの外れは費用に回る、S-43)。手で固定し直すのは出なかった時だけ
    // (10-28 夜オーナー「エンジンを参照した動きになってない」、スイッチ boxShape)
    const fixedOn = (x: StageItem): boolean => [...x.prefixes, ...x.suffixes].some((m) => m.fractured && m.modId === fo);
    for (let k = 0; flag("boxShape") && k < 64 && !fixedOn(r.item); k++) { const x = applyCurrency(data, it, key, rng, now); if (x.applied) r = x; }
    // スイッチを閉じている時は前と同じくいつも固定し直す (乱数の使い方を変えない = 本番の見本を変えない、10-28 夜 最終チェック長の 1460 の見張り)
    if (!flag("boxShape") || !fixedOn(r.item)) {
      const f = applyCurrency(data, it, forceKey(fo, "T1", "f"), rng);
      if (f.applied) r = { ...r, item: f.item, added: f.added, removed: f.removed };
    }
  }
  const base = { catalystCount, handOmensUsed: r.omensUsed ?? [] };
  if (!r.applied || !unrevealedOf(r.item) || spec.reveal === false) return { ...r, ...base, echoUsed: false };
  const echo = reveal.includes(ABYSSAL_ECHO_OMEN);
  return { ...revealBy(data, r, rng, spec.reveal ?? (() => false), echo), ...base, echoUsed: echo };
}

export interface StartMod { modId: string; tier: number; fractured?: boolean }
interface StartWith {
  /** 始まりのレアリティ。マジック・ノーマルはノーマルから付ける (付けるとマジック)。フラクチャーがあればレア (force がレアにする) */
  rarity: StageItem["rarity"];
  mods: readonly StartMod[];
  /** 先に差すルーン (英語名)。指名の MOD のルーンの分もソケットを開ける */
  runes?: readonly string[];
  /** ソケットだけ開けておく MOD (ルーンの MOD の分。印のスタートで後から付く ✦ の候補・＋の MOD) */
  socketFor?: readonly StartMod[];
}

/** フラクチャー (✦) は 1 つのアイテムに 1 つまで (ゲームのフラクチャーのオーブは 1 つだけ固定する) */
const START_FRACTURE_MAX = 1;

/** 始めのアイテム。note = 打てなかった理由 (無ければ null、その時の item は打てた所まで) */
function startWith(data: PatchData, base: string, itemLevel: number, s: StartWith, rng: () => number): { item: StageItem; note: string | null } {
  const magic = (s.rarity === "magic" || s.rarity === "normal") && !s.mods.some((m) => m.fractured);
  let item = freshItem(data, base, itemLevel, magic ? "normal" : "rare");
  // ソケットはエミュの手で打つ新品と同じく規格外の数から (エミュの fullSockets、2026-10-04 オーナー「ソケットも初めからデフォでマックス」)。
  // 前は 0 で、ツリーの棚に特別なルーン・その他のルーンが出なかった (10-23 オーナー「打つ中身はエミュと同じ」)
  const full = baseSocketsOf(item.base, item.cls.category);
  if (full > (item.sockets ?? 0)) item = { ...item, sockets: full };
  if (s.mods.filter((m) => m.fractured).length > START_FRACTURE_MAX) return { item, note: tr("フラクチャーは 1 つまで", "Only one mod can be fractured") };
  // 選んだルーンを先に差す。ルーンの MOD はそのルーンを差して付く (force が差す)。差すソケットを要る数だけ開けておく (手袋の投射物 +2 = コルの狩り、10-22)
  const runes = s.runes ?? [];
  const byMod = new Set([...s.mods, ...(s.socketFor ?? [])].flatMap((m) => { const r = data.mods.get(m.modId)?.rune; return r ? [r] : []; }));
  const need = runes.length + [...byMod].filter((id) => !runes.some((en) => runeIdByName(en) === id)).length;
  if (need) item = { ...item, sockets: Math.max(item.sockets ?? 0, need) };
  for (const en of runes) {
    const r = applyCurrency(data, item, `rune:${en}`, rng);
    if (!r.applied) return { item: r.item, note: r.reason ?? null };
    item = r.item;
  }
  for (const m of s.mods) {
    // エッセンスの MOD (グレーターの道の始まり) はクラフト MOD の印で付ける
    const src = data.mods.get(m.modId)?.source;
    const r = applyCurrency(data, item, forceKey(m.modId, `T${m.tier}`, m.fractured ? "f" : src === "essence" || src === "perfect_essence" ? "e" : "n"), rng);
    if (!r.applied) return { item: r.item, note: r.reason ?? null };
    item = r.item;
  }
  return { item, note: null };
}
