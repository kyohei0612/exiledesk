/**
 * tree-hand-plan.ts — 箱の次に打つ手の決め方 (TreeHandShelf.vue から分けた、2026-10-24)。棚の画面 (TreeHandShelf)・手を決めた時の組み替え (SimTreePage の pickHand)・
 * 開発の時だけの猿の口 (sim-monkey.ts) が同じ関数を呼ぶ (別の打ち方を作らない、メモ feedback-sim-no-own-logic)。中身はエンジンの入口と木の関数を呼ぶだけ
 */
import { catalystBoosts, mulberry32, omensFor, tierRankOf, type PatchData, type StageApply, type StageItem } from "../../../services/craft-stage/engine";
import { catalystFull, catalystTagOf, fillCatalyst, stepOutcomes } from "../../../services/craft-stage/engine-sim";
import { aimHeldOn, reachableAims } from "../../../services/simulator/tree/tree-aim";
import { canSpam, ECHO, effectOf, engineOmens, isBone, isCatalyst, TREE_CATALYSTS } from "../../../services/simulator/tree/tree-hands";
import { aimsOf, handProblem, sampleOf, singleOutOf } from "../../../services/simulator/tree/tree-sample";
import { heldSets, linkSameShape } from "../../../services/simulator/tree/tree-shape";
import { aimKey, fractureMarks, healLost, kindOfHand, setHand, type Aim, type Hand, type HandKind, type OutKind, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { joinSameShape } from "./tree-merge";
import { tr } from "../../../i18n/lang";

/** 結果が 1 通りの手の結果 (tree-sample の singleOutOf) */
export type OnlyOut = { out: OutKind; aim: Aim | null } | null;
/** 棚で選んだ物 (持った物・掛けたお告げ・当たるまで・狙い無し・骨の反響・フラクチャーで ✦ にする狙い) */
export interface HandPick { held: string; omens: readonly string[]; spam?: boolean; spamMax?: number | null; free?: boolean; echo?: boolean }

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
/**
 * 狙い無し (結果は「打った後」の 1 つ) にできる手 = 付く MOD を選べない手 (足す・カオス。10-25 オーナー「全カレンシーで」。前は足す手だけ)。
 * エッセンス・合金 (キーは同じ essence:) は付く MOD がそれ自身の 1 つに決まっているので入れない (オーナー「エッセンスではエッセンスでしか付かんでしょうに」)
 */
export const FREE_EFFECTS: readonly string[] = ["add", "swap"];
/** 棚で選んだ物 → 箱の手 */
export function handOf(p: HandPick): Hand {
  const used = omensFor(p.held, [...p.omens]);
  return {
    currency: p.held, omens: isBone(p.held) && p.echo !== false ? [...used, ECHO] : used,
    catalyst: null, quality: 0,
    repeat: p.spam && canSpam(p.held) ? { until: "hit", max: p.spamMax && p.spamMax > 0 ? Math.round(p.spamMax) : null } : null,
    ...(p.free && !p.spam && FREE_EFFECTS.includes(effectOf(p.held)) ? { free: true } : {}),
  };
}
export const kindOf = (h: Hand): HandKind => kindOfHand(h, effectOf(h.currency));
/**
 * 当たりの箱の既定 = このツリーの狙いのうち、この箱でまだ付いていない物。木にまだ狙いが無ければ欲しい MOD のメモ
 * (10-22 白紙から組んだ手袋: 狙い 0 で当たるまでにすると MOD の空の当たりの箱を見本で引き直し続け、ページが 5 分固まった)。
 * カオススパムはその全部、足す・入れ替える手はこの手で付きうる物だけ (エンジンの heldOdds。10-22 靴・手袋で、当たりの箱が空のまま 1 箱ずつ MOD・行・段を選ぶのが手間だった)。
 * goals = 完成の狙い
 */
export function hitAimsOf(data: PatchData, doc: TreeDoc, boxId: string, item: StageItem, h: Hand, goals: readonly Aim[]): Aim[] {
  const kind = kindOf(h);
  // エッセンス = 付く MOD は決まっている。エンジンの結果で新しく付いた MOD を当たりの札に (10-22 オーナー「エッセンスの道」)
  if (kind === "essence") {
    const before = new Set([...item.prefixes, ...item.suffixes].map((m) => m.modId));
    const got = (stepOutcomes(data, item, h.currency, engineOmens(h)) ?? []).filter((o) => !o.void).flatMap((o) => [...o.item.prefixes, ...o.item.suffixes].filter((m) => !before.has(m.modId)));
    const out: Aim[] = [];
    // 段はエッセンス自身の段 (T1 = グレーター、完成形の設定の表・poe2db と同じ。10-24 オーナー「エッセンスの MOD と一般 MOD は別物」)
    for (const m of got) if (!out.some((a) => a.modId === m.modId)) out.push({ modId: m.modId, tier: tierRankOf(data, m.modId, m.tierIndex) });
    // 付く MOD が 1 つに決まらないエッセンス (無限のエッセンス = 筋力・器用さ・知性のうち付いていない系統から等しく 1 つ、エンジンの infiniteChoices) は
    // 出うる MOD ごとに当たりの箱 (前は 1 つ目だけで、ツリーは筋力 100% / エンジンは 1/3 ずつ。10-25 モンキー 4 本目・ジン部長の見立て)
    return out;
  }
  // フラクチャー: 当たりの札 = この箱で付いている印の狙い (完成の MOD のフラクチャーの印、10-25)。どれが ✦ になるかはエンジンのまま
  if (kind === "fracture") return fractureMarks(doc).filter((a) => aimHeldOn(data, item, a, { sameText: true }));
  if (kind !== "spam" && kind !== "add" && kind !== "swap") return [];
  // 候補 = 木で使っている当たりの狙い + 完成形の狙い (memoAims)。前は木に狙いが 1 つでもあると木の分だけで、完成形の残りの狙いが出ず
  // 「どれでも」が空 = 手にならなかった (10-25 モンキー 3 本目 301 の b4: 木の狙いは付いている火耐性貫通だけ、知性・ライフリーチが候補に無い)
  const pool = [...aimsOf(doc), ...(goals.length ? goals : doc.memoAims ?? [])].filter((a, i, l) => l.findIndex((x) => x.modId === a.modId) === i);
  const open = pool.filter((a) => !aimHeldOn(data, item, a, { sameText: true }));
  // 見本を数個見て、どれかで付く狙いは並べる (1 つだけだと見本に低い段が付いていて T2 が出なかった、10-22 13 通り組んだ #17)。どの見本でも行き先が無ければ全部。
  // 当たるまで (どれでも) も同じ絞り: 前は付いていない狙い全部で、カオスで付かない狙い (冒涜の MOD・アイテムレベルの足りない段) だけが残ると
  // 当たるまでが毎回 5000 回の上限まで回り、精査の 30 人回しでページが固まった (10-25 モンキー 3 本目、クォータースタッフの外れの箱に 2 つ目のカオススパム)
  const items = [1, 2, 3, 4].map((seed) => (seed === 1 ? item : sampleOf(data, doc, boxId, seed).item));
  return reachableAims(data, items, h.currency, engineOmens(h), open, { sameText: true }) ?? open;
}
/**
 * 次に打つ手の窓の「当たりの箱にする MOD」の候補 = 付く MOD を選べない手 (FREE_EFFECTS) で付きうる完成の狙い (狙い無しでも繰り返しでもない形で hitAimsOf に聞く)。
 * 画面 (TreeHandShelf) と猿の口 (sim-monkey の hitChoices・add の opt.hitAims) が同じ物を呼ぶ
 */
export function hitChoicesOf(data: PatchData, doc: TreeDoc, boxId: string, item: StageItem, p: Pick<HandPick, "held" | "omens" | "echo">, goals: readonly Aim[]): Aim[] {
  if (!FREE_EFFECTS.includes(effectOf(p.held))) return [];
  return hitAimsOf(data, doc, boxId, item, handOf({ held: p.held, omens: p.omens, echo: p.echo }), goals);
}
/**
 * チェックした狙い (modId) から、手を決める時に渡す当たりの箱と狙い無しを出す (画面と同じ決め方): 付く MOD を選べない手で 1 つ以上チェック = その狙いの当たりの箱、
 * 何もチェックしない = 狙い無し。当たるまで繰り返す時は狙い無しも「どれでも」も無く、当たりの箱 0 (problemOf が「狙う MOD を選んで」で止める。
 * 10-25 オーナー「カオススパムするなら狙い MOD は絶対設定しないといけない」)。付く MOD を選べない手でなければ null (呼ぶ側の既定のまま)
 */
export function pickedHits(choices: readonly Aim[], checked: readonly string[], held: string, spam: boolean): { aims: Aim[]; free: boolean } | null {
  if (!FREE_EFFECTS.includes(effectOf(held))) return null;
  const aims = choices.filter((a) => checked.includes(a.modId));
  if (aims.length) return { aims, free: false };
  return { aims: [], free: !spam };
}
/** 結果が 1 通りの手か (この箱の見本 8 つにエンジンで打った行き先を全部たどる。触媒の手は前のカタリストを入れた後で) (フラクチャーも同じ。✦ になる MOD が 1 つしか無ければ 1 通り) */
export function onlyOf(data: PatchData, doc: TreeDoc, boxId: string, h: Hand, preCat: string | null, hitAims: Aim[]): OnlyOut {
  return singleOutOf(data, doc, boxId, h, preCat, hitAims);
}
/** この箱の見本に打てない手は確定させない (お告げが効かない・消せる物が無い等。オーナー 10-22「進行不能」、tree-sample の handProblem) */
export function problemOf(data: PatchData, item: StageItem, h: Hand, hitAims: Aim[], preCat: string | null, preFill: StageApply | null): string | null {
  // 前に足すカタリストが入らないベース (装飾品だけに入る。前は触媒のお告げの「品質が要る」と出た、10-22 13 通り組んだ #16)
  const full = !!preCat && catalystFull(item, preCat);
  if (preCat && preFill && !preFill.applied && !full) return tr(`前に足すカタリストが入らない: ${preFill.reason ?? ""}`, `The catalyst before this can't be used: ${preFill.reason ?? ""}`);
  // 当たるまで繰り返すのに狙いが 1 つも無い時は決めさせない (MOD を選んでいない・まだ付いていない狙いが無い・このカレンシーでは付かない)
  if (kindOf(h) === "spam" && !hitAims.length) return tr("狙う MOD を選んで (カオススパムオーブは狙う MOD が要る。候補が無い時は、完成の MOD に足してから)", "Pick a target mod (the Chaos Spam Orb needs one; if there are none, add one to the final mods first)");
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
  // 新しい当たりの箱で、合流せず完成の狙いが全部揃う物は完成で止まる (10-25 オーナー「完成したら止まるじゃん」。完成のボタンで外せる、外したら付け直さない)
  const goals = (d.memoAims ?? []).map(aimKey);
  for (const b of Object.values(d.boxes)) {
    if (had.has(b.id) || b.out !== "hit" || !b.aim || b.hand || b.back || b.split) continue;
    if (goals.length && heldSets(d, b.id).every((h) => goals.every((g) => h.includes(g)))) b.done = "main";
  }
  // 自動でつないだ戻りで狙いを持って着く道ができた箱に「狙いが消えた」を足す (tree-model の healLost)
  healLost(d);
  return at;
}

// 伸ばすカタリスト (2026-10-23 エンジンの for-sim から戻した。中身はエンジンの核の catalystBoosts を呼ぶだけ)。付きうる狙い reachableAims は精査も使うので tree-aim.ts (10-25)
/** その MOD を伸ばすカタリスト (keys の並びで最初の物、伸ばす物が無ければ null)。伸びるかはエンジンの catalystBoosts (指輪・アミュレットは MOD の tags、ジュエル・上のベースは中身のタグ) */
function catalystForMod(data: PatchData, item: StageItem, modId: string, keys: readonly string[]): string | null {
  const mod = data.mods.get(modId);
  if (!mod) return null;
  return keys.find((k) => catalystBoosts(item, { modId, tags: mod.tags }, catalystTagOf(k), data)) ?? null;
}
