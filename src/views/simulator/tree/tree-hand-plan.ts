/**
 * tree-hand-plan.ts — 箱の次に打つ手の決め方 (TreeHandShelf.vue から分けた、2026-10-24)。棚の画面 (TreeHandShelf)・手を決めた時の組み替え (SimTreePage の pickHand)・
 * 開発の時だけの猿の口 (sim-monkey.ts) が同じ関数を呼ぶ (別の打ち方を作らない、メモ feedback-sim-no-own-logic)。中身はエンジンの入口と木の関数を呼ぶだけ
 */
import { aimHits, catalystBoosts, heldOdds, makeStageMod, mulberry32, omensFor, tierIndexOf, tierRankOf, type HeldOdds, type PatchData, type StageApply, type StageItem, type StageMod } from "../../../services/craft-stage/engine";
import { catalystFull, catalystTagOf, fillCatalyst, stepOutcomes } from "../../../services/craft-stage/engine-sim";
import { aimHeldOn } from "../../../services/simulator/tree/tree-aim";
import { canSpam, ECHO, effectOf, engineOmens, isBone, isCatalyst, TREE_CATALYSTS } from "../../../services/simulator/tree/tree-hands";
import { aimsOf, handProblem, sampleOf, singleOutOf } from "../../../services/simulator/tree/tree-sample";
import { linkSameShape } from "../../../services/simulator/tree/tree-run";
import { healLost, kindOfHand, setHand, type Aim, type Hand, type HandKind, type OutKind, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { joinSameShape } from "./tree-merge";
import { tr } from "../../../i18n/lang";

/** 結果が 1 通りの手の結果 (tree-sample の singleOutOf) */
export type OnlyOut = { out: OutKind; aim: Aim | null } | null;
/** 棚で選んだ物 (持った物・掛けたお告げ・当たるまで・狙い無し・骨の反響・フラクチャーで ✦ にする狙い) */
export interface HandPick { held: string; omens: readonly string[]; spam?: boolean; spamMax?: number | null; free?: boolean; echo?: boolean; fractureOf?: string | null }

/**
 * 当たりの MOD が決まっていない当たりの箱は、この箱のアイテムが作れない (当たりの形が引けず、見本が親のまま = 変成の後でも白のまま)。
 * 棚は出さずに先に当たりの MOD を選ばせる (10-24 モンキー隊長の 1)
 */
export const needAimOf = (doc: TreeDoc, boxId: string, note: string | null | undefined): boolean => doc.boxes[boxId]?.out === "hit" && !doc.boxes[boxId]?.aim && note === "none";
/** この箱が品質だけ上げる手の後 (通り抜け) か */
export function afterQualityOf(doc: TreeDoc, boxId: string): boolean {
  const b = doc.boxes[boxId], p = b?.out === "pass" && b.parent ? doc.boxes[b.parent] : null;
  return !!p?.hand && isCatalyst(p.hand.currency);
}
/**
 * 前に足すカタリストの既定 = この箱でまだ付いていない狙い (木の狙い、次に欲しい MOD のメモ) を伸ばす物 (エンジンの catalystBoosts)。後から札を押して替えられる。
 * どの狙いも伸ばせない (靴・鎧など品質が乗らない装備) なら null = 前のカタリストは足さない (触媒のお告げはエンジンの omenBlock で掛けられない、10-22 ブラック)。
 * メモも見るのは 10-22 13 通り組んだ #7 (白紙ではいつもライフになった)
 */
export function autoCatOf(data: PatchData, doc: TreeDoc, item: StageItem): string | null {
  for (const a of [...aimsOf(doc), ...(doc.memoAims ?? [])].filter((x) => !aimHeldOn(data, item, x, { sameText: true }))) {
    const c = catalystForMod(data, item, a.modId, TREE_CATALYSTS);
    if (c) return c;
  }
  return null;
}
/**
 * 棚に渡すアイテム = 前にカタリストの手を足す時はそれで品質を最大まで入れた後 (品質 0 では触媒のお告げが「品質が要る」で掛けられない。
 * 前は品質 0 の見本を渡していて、触媒の手を開き直すとお告げが外れていた、10-22)。needPre = 持った物に触媒のお告げが掛けられて、まだ品質を上げる手の後でない
 */
export const preFillOf = (data: PatchData, item: StageItem, needPre: boolean, autoCat: string | null): StageApply | null => (needPre && autoCat ? fillCatalyst(data, item, autoCat, mulberry32(1)) : null);
/** 狙い無し (結果は「打った後」の 1 つ) にできる手 = MOD が付く・入れ替わる手 (10-25 オーナー「全カレンシーで」。前は足す手だけ) */
export const FREE_EFFECTS: readonly string[] = ["add", "swap", "essence"];
/** 棚で選んだ物 → 箱の手 */
export function handOf(p: HandPick): Hand {
  const used = omensFor(p.held, [...p.omens]);
  return {
    currency: p.held, omens: isBone(p.held) && p.echo !== false ? [...used, ECHO] : used,
    catalyst: null, quality: 0,
    repeat: p.spam && canSpam(p.held) ? { until: "hit", max: p.spamMax && p.spamMax > 0 ? Math.round(p.spamMax) : null } : null,
    ...(p.free && !p.spam && FREE_EFFECTS.includes(effectOf(p.held)) ? { free: true } : {}),
    ...(effectOf(p.held) === "fracture" && p.fractureOf ? { fractureOf: p.fractureOf } : {}),
  };
}
export const kindOf = (h: Hand): HandKind => kindOfHand(h, effectOf(h.currency));
/**
 * 当たりの箱の既定 = このツリーの狙いのうち、この箱でまだ付いていない物。木にまだ狙いが無ければ欲しい MOD のメモ
 * (10-22 白紙から組んだ手袋: 狙い 0 で当たるまでにすると MOD の空の当たりの箱を見本で引き直し続け、ページが 5 分固まった)。
 * カオススパムはその全部、足す・入れ替える手はこの手で付きうる物だけ (エンジンの heldOdds。10-22 靴・手袋で、当たりの箱が空のまま 1 箱ずつ MOD・行・段を選ぶのが手間だった)。
 * goals = 完成の狙い (フラクチャーの候補)、fracOf = ✦ にする狙い
 */
export function hitAimsOf(data: PatchData, doc: TreeDoc, boxId: string, item: StageItem, h: Hand, goals: readonly Aim[], fracOf: string | null): Aim[] {
  const kind = kindOf(h);
  // エッセンス = 付く MOD は決まっている。エンジンの結果で新しく付いた MOD を当たりの札に (10-22 オーナー「エッセンスの道」)
  if (kind === "essence") {
    const before = new Set([...item.prefixes, ...item.suffixes].map((m) => m.modId));
    const got = (stepOutcomes(data, item, h.currency, engineOmens(h)) ?? []).filter((o) => !o.void).flatMap((o) => [...o.item.prefixes, ...o.item.suffixes].filter((m) => !before.has(m.modId)));
    const out: Aim[] = [];
    // 段はエッセンス自身の段 (T1 = グレーター、完成形の設定の表・poe2db と同じ。10-24 オーナー「エッセンスの MOD と一般 MOD は別物」)
    for (const m of got) if (!out.some((a) => a.modId === m.modId)) out.push({ modId: m.modId, tier: tierRankOf(data, m.modId, m.tierIndex) });
    return out.slice(0, 1);
  }
  // フラクチャー: 当たりの札 = この箱で付いている狙い (✦ にする MOD を選んだらその 1 つ)
  if (kind === "fracture") {
    const on = [...aimsOf(doc), ...goals].filter((a, i, l) => aimHeldOn(data, item, a, { sameText: true }) && l.findIndex((x) => x.modId === a.modId) === i);
    // 選んでいなければ付いている最初の狙い (必ずどれか 1 つを固定、回す時の tree-sample の fractureTarget と同じ並び。10-24 オーナー)
    return fracOf ? on.filter((a) => a.modId === fracOf) : on.slice(0, 1);
  }
  if (kind !== "spam" && kind !== "add" && kind !== "swap") return [];
  const tree = aimsOf(doc);
  const open = (tree.length ? tree : doc.memoAims ?? []).filter((a) => !aimHeldOn(data, item, a, { sameText: true }));
  if (kind === "spam") return open;
  // 見本を数個見て、どれかで付く狙いは並べる (1 つだけだと見本に低い段が付いていて T2 が出なかった、10-22 13 通り組んだ #17)。どの見本でも行き先が無ければ全部
  const items = [1, 2, 3, 4].map((seed) => (seed === 1 ? item : sampleOf(data, doc, boxId, seed).item));
  return reachableAims(data, items, h.currency, engineOmens(h), open, { sameText: true }) ?? open;
}
/** 結果が 1 通りの手か (この箱の見本 8 つにエンジンで打った行き先を全部たどる。触媒の手は前のカタリストを入れた後で)。✦ にする MOD を選んで、この箱の見本に付いている時は「その狙いが ✦」の 1 通り */
export function onlyOf(data: PatchData, doc: TreeDoc, boxId: string, h: Hand, preCat: string | null, hitAims: Aim[]): OnlyOut {
  if (kindOf(h) === "fracture" && hitAims.length) return { out: "hit", aim: hitAims[0]! };
  return singleOutOf(data, doc, boxId, h, preCat, hitAims);
}
/** この箱の見本に打てない手は確定させない (お告げが効かない・消せる物が無い等。オーナー 10-22「進行不能」、tree-sample の handProblem) */
export function problemOf(data: PatchData, item: StageItem, h: Hand, hitAims: Aim[], preCat: string | null, preFill: StageApply | null): string | null {
  // 前に足すカタリストが入らないベース (装飾品だけに入る。前は触媒のお告げの「品質が要る」と出た、10-22 13 通り組んだ #16)
  const full = !!preCat && catalystFull(item, preCat);
  if (preCat && preFill && !preFill.applied && !full) return tr(`前に足すカタリストが入らない: ${preFill.reason ?? ""}`, `The catalyst before this can't be used: ${preFill.reason ?? ""}`);
  // 当たるまで繰り返すのに狙いが 1 つも無い (まだ付いていない狙いが無い) 時は決めさせない
  if (kindOf(h) === "spam" && !hitAims.length) return tr("狙いが無い (欲しい MOD のメモに足すか、当たりの箱で MOD を選んでから)", "No target yet (add one to the wanted mods memo, or pick a mod in a hit box first)");
  return handProblem(data, preCat && preFill ? preFill.item : item, h);
}
/**
 * 手を決めた時の組み替え (SimTreePage の pickHand と猿の口で同じ)。pre = 前に足す品質だけ上げる手のカタリスト (触媒のお告げ、10-22 オーナーの案 A)。
 * 完成の箱に手を付けたら同じ形の完成の箱もここへ (joinSameShape)。前に作ってまだ行き先も手も無い箱も、今手を付けた箱と同じ形ならつなぐ。返すのは手を付けた箱 (前のカタリストがあればその次)
 */
export function applyPick(d: TreeDoc, id: string, h: Hand, kind: HandKind, aims: Aim[], pre: string | null, only: OnlyOut): string {
  const had = new Set(Object.keys(d.boxes));
  let at = id;
  if (pre) { setHand(d, id, { currency: pre, omens: [], catalyst: null, quality: 0 }, "quality"); at = d.boxes[id]!.outs[0]!; }
  setHand(d, at, h, kind, aims, only);
  joinSameShape(d, id);
  linkSameShape(d, Object.values(d.boxes).filter((b) => !had.has(b.id) || (!b.hand && !b.back && !b.done)).map((b) => b.id));
  // 自動でつないだ戻りで狙いを持って着く道ができた箱に「狙いが消えた」を足す (tree-model の healLost)
  healLost(d);
  return at;
}

// 付きうる狙い・伸ばすカタリスト (2026-10-23 エンジンの for-sim から戻した。中身はエンジンの核の heldOdds・aimHits・catalystBoosts を呼ぶだけ)
interface TierAim { modId: string; tier: number }
interface AimDiffOpts { sameText?: boolean }
const heldOn = (data: PatchData, mods: readonly StageMod[], a: TierAim, o: AimDiffOpts): boolean => {
  const t = { modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) }, opts = o.sameText ? { data, sameText: true } : undefined;
  return mods.some((m) => aimHits(m, t, opts));
};
/**
 * この手で付きうる狙い = items (同じ箱の見本など) のどれかで、クラフト台でそのカレンシーを持った時に出る % (heldOdds。CoE と合わせ済み) が 0 より大きい段がある狙い
 * (並びは aims のまま。オーナー 10-22: 行き先は数え上げず heldOdds の答えをそのまま、錬金・大いなる高貴・骨の候補も heldOdds の物)。
 * もう付いている狙いは見ない (呼ぶ側が外して渡す)。どの見本でも heldOdds に % が 1 つも無い (打てない・確率の表が無い手) 時は null (呼ぶ側が決める)
 */
function reachableAims<A extends TierAim>(data: PatchData, items: readonly StageItem[], key: string, omens: readonly string[], aims: readonly A[], o: AimDiffOpts = {}): A[] | null {
  const pools = items.flatMap((it) => { const h = heldOdds(data, it, key, omens), ms = h ? poolOf(data, h) : []; return ms.length ? [ms] : []; });
  if (!pools.length) return null;
  return aims.filter((a) => pools.some((ms) => heldOn(data, ms, a, o)));
}
/** heldOdds で % が 0 より大きい段の MOD (数値は段の真ん中、当たりの判定にだけ使う) */
function poolOf(data: PatchData, h: HeldOdds): StageMod[] {
  const out: StageMod[] = [];
  for (const [id, x] of h.byMod) {
    const mod = data.mods.get(id);
    if (!mod) continue;
    for (const t of x.tiers) if (t.w > 0) out.push(makeStageMod(mod, mod.type === "suffix" ? "suffix" : "prefix", t.index, () => 0.5));
  }
  return out;
}
/** その MOD を伸ばすカタリスト (keys の並びで最初の物、伸ばす物が無ければ null)。伸びるかはエンジンの catalystBoosts (指輪・アミュレットは MOD の tags、ジュエル・上のベースは中身のタグ) */
function catalystForMod(data: PatchData, item: StageItem, modId: string, keys: readonly string[]): string | null {
  const mod = data.mods.get(modId);
  if (!mod) return null;
  return keys.find((k) => catalystBoosts(item, { modId, tags: mod.tags }, catalystTagOf(k), data)) ?? null;
}
