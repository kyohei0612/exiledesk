/**
 * tree-hand-plan.ts — 箱の次に打つ手の決め方 (TreeHandShelf.vue から分けた、2026-10-24)。棚の画面 (TreeHandShelf)・手を決めた時の組み替え (SimTreePage の pickHand)・
 * 開発の時だけの猿の口 (sim-monkey.ts) が同じ関数を呼ぶ (別の打ち方を作らない、メモ feedback-sim-no-own-logic)。中身はエンジンの入口と木の関数を呼ぶだけ
 */
import { catalystBoosts, craftedKindOf, mulberry32, omensAllowedFor, omensFor, runeOf, sideOfMod, socketCapOf, tierRankOf, type PatchData, type StageApply, type StageItem, type StageMod } from "../../../services/craft-stage/engine";
import { craftStage } from "../../../state/craft-stage";
import { bonesFor, essenceShelf, ORBS, runesFor } from "../../../state/for-share/craft-stage-shelf";
import { treeHidden } from "../use-sim-shelf";
import { catalystFull, catalystTagOf, fillCatalyst, stepOutcomes } from "../../../services/simulator/sim-engine";
import { prepFor } from "../../../services/simulator/tree/tree-unbounded";
import { aimHeldOn, reachableAims } from "../../../services/simulator/tree/tree-aim";
import { canSpam, CATALYSING, ECHO, effectOf, engineOmens, isBone, isCatalyst, TREE_CATALYSTS } from "../../../services/simulator/tree/tree-hands";
import { aimsOf, handProblem, possibleOutsOf, sampleOf } from "../../../services/simulator/tree/tree-sample";
import { boxSig, junkSig, linkSameHit, linkSameShape, linkShapeHit, matchItem, sameHandReturn } from "../../../services/simulator/tree/tree-shape";
import { looseOf, stripStops } from "../../../services/simulator/tree/tree-outcome";
import { clearHand, drop, fractureMarks, healLost, kindOfHand, setBack, setHand, subtree, type Aim, type Hand, type HandKind, type OutKind, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { joinSameShape } from "./tree-merge";
import { revealAimsOf } from "./tree-reveal-aims";
import { isRevealHand, veilKeep, veilPick } from "../../../services/simulator/tree/tree-veil";
import { fracFree } from "../../../services/simulator/tree/tree-frac-pick";
import { tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";

/** 起こりうる結果の一覧 (tree-sample の possibleOutsOf)。null = 手の種類ごとの箱 */
export type OnlyOut = ReadonlyArray<{ out: OutKind; aim: Aim | null; junkKey?: string }> | null;
/** 棚で選んだ物 (持った物・掛けたお告げ・当たるまで・狙い無し・骨の反響・フラクチャーで ✦ にする狙い) */
export interface HandPick { held: string; omens: readonly string[]; spam?: boolean; spamMax?: number | null; free?: boolean; echo?: boolean; /** 消去の残したい MOD ([] = 全部消えてよい、tree-model の Hand.keep) */ keep?: readonly Aim[];
  /** 骨の手の発現 (keep = 未発現のまま次へ、pick = 発現させる。tree-model の Hand.veil、スイッチ boneLater) */ veil?: "keep" | "pick" }

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
/** 消去の「残したい MOD」の候補 = この箱のアイテムに付いている MOD (✦ は消えないので出さない。10-27 オーナー「手の窓に今付いている MOD を全部並べる」) */
export const keepChoicesOf = (data: PatchData, item: StageItem): Array<{ aim: Aim; mod: StageMod }> =>
  [...item.prefixes, ...item.suffixes].filter((m) => !m.fractured).map((m) => ({ aim: { modId: m.modId, tier: tierRankOf(data, m.modId, m.tierIndex) }, mod: m }));
/** 棚で選んだ物 → 箱の手 */
export function handOf(p: HandPick): Hand {
  const used = omensFor(p.held, [...p.omens]);
  return {
    // 反響はお告げの並びで掛けた物 (used に入る) か、echo の指定。2 つ入れない (10-26 夜、並びの札と別の印が重なった)
    // 後から打つ発現の手も反響を既定で (骨と同じ。スイッチ boneLater)
    // 未発現のまま次へ (veil keep) は発現しないので反響を既定で付けない
    // boneLater の木は反響を任意 (手の窓の ☑ か棚のお告げで付けた時だけ、10-28 オーナー「そこまで必須って感じで出したくない」)
    currency: p.held, omens: ((isBone(p.held) && p.veil !== "keep") || isRevealHand(p.held)) && (flag("boneLater") ? p.echo === true : p.echo !== false) && !used.includes(ECHO) ? [...used, ECHO] : used,
    catalyst: null, quality: 0,
    repeat: p.spam && canSpam(p.held) ? { until: "hit", max: p.spamMax && p.spamMax > 0 ? Math.round(p.spamMax) : null } : null,
    // 乱数のフラクチャーの狙い無し (固定されうる MOD ごとの箱。印の無い木だけ、applyPick が pick を付ける。スイッチ fracPick)
    ...(p.free && !p.spam && (FREE_EFFECTS.includes(effectOf(p.held)) || (flag("fracPick") && effectOf(p.held) === "fracture")) ? { free: true } : {}),
    ...(p.keep && effectOf(p.held) === "remove" ? { keep: p.keep.map((a) => ({ modId: a.modId, tier: a.tier })) } : {}),
    ...(p.veil && flag("boneLater") && isBone(p.held) ? { veil: p.veil } : {}),
  };
}
export const kindOf = (h: Hand): HandKind => kindOfHand(h, effectOf(h.currency));
/**
 * 当たりの箱の既定 = このツリーの狙いのうち、この箱でまだ付いていない物。木にまだ狙いが無ければ欲しい MOD のメモ
 * (10-22 白紙から組んだ手袋: 狙い 0 で当たるまでにすると MOD の空の当たりの箱を見本で引き直し続け、ページが 5 分固まった)。
 * カオススパムはその全部、足す・入れ替える手はこの手で付きうる物だけ (エンジンの heldOdds。10-22 靴・手袋で、当たりの箱が空のまま 1 箱ずつ MOD・行・段を選ぶのが手間だった)。
 * goals = 完成の狙い
 */
/** エッセンスで付きうる MOD (エンジンの結果で新しく付いた MOD、段はエッセンス自身の段)。無限のエッセンスは筋力・器用さ・知性のうち付きうる物 (棚で ☑ させる、10-27 オーナー) */
export function essenceAimsOf(data: PatchData, item: StageItem, h: Hand): Aim[] {
  const before = new Set([...item.prefixes, ...item.suffixes].map((m) => m.modId));
  const got = (stepOutcomes(data, prepFor(data, item, h.currency), h.currency, engineOmens(h)) ?? []).filter((o) => !o.void).flatMap((o) => [...o.item.prefixes, ...o.item.suffixes].filter((m) => !before.has(m.modId)));
  const out: Aim[] = [];
  // 段はエッセンス自身の段 (T1 = グレーター、完成形の設定の表・poe2db と同じ。10-24 オーナー「エッセンスの MOD と一般 MOD は別物」)
  for (const m of got) if (!out.some((a) => a.modId === m.modId)) out.push({ modId: m.modId, tier: tierRankOf(data, m.modId, m.tierIndex) });
  return out;
}
export function hitAimsOf(data: PatchData, doc: TreeDoc, boxId: string, item: StageItem, h: Hand, goals: readonly Aim[]): Aim[] {
  // 骨を未発現のまま = 当たりは無し (結果は未発現の冒涜が付いた 1 つ)。発現で選ぶ手 = 発現で出うる MOD 全部 (置き石も。スイッチ boneLater)
  if (veilKeep(h) || fracFree(doc, h)) return [];
  // 窓の ☑ は完成の狙いだけ (高貴の窓と同じ。置き石は TreeVeilCheck の「ほかの MOD を選ぶ」、10-28 オーナー)
  if (veilPick(h)) return revealAimsOf(data, doc, boxId, item, h).filter((a) => (doc.memoAims ?? []).some((g) => g.modId === a.modId));
  const kind = kindOf(h);
  // エッセンス = 付く MOD は決まっている。エンジンの結果で新しく付いた MOD を当たりの札に (10-22 オーナー「エッセンスの道」)
  if (kind === "essence") {
    const out = essenceAimsOf(data, item, h);
    // 付く MOD が 1 つに決まらないエッセンス (無限のエッセンス = 筋力・器用さ・知性のうち付いていない系統から等しく 1 つ、エンジンの infiniteChoices) は
    // 出うる MOD ごとに当たりの箱 (前は 1 つ目だけで、ツリーは筋力 100% / エンジンは 1/3 ずつ。10-25 モンキー 4 本目・ジン部長の見立て)。
    // 当たりにするのは完成の狙いの MOD だけ。狙いで無い MOD が付くだけのエッセンス (冒涜の外れを無限のエッセンスで置き換える等) は当たりを作らず、
    // applyPick が結果を「付いた」の箱 1 つにする (10-25 オーナー「ここに関してはあたりなんてもんは存在しない」、前は筋力・器用さ・知性の当たり 3 つ + 狙いが消えたで 4 つ出た)
    const goals = [...(doc.memoAims ?? []), ...aimsOf(doc)];
    return out.filter((a) => goals.some((g) => g.modId === a.modId));
  }
  // フラクチャー: 当たりの札 = この箱で付いている印の狙い (完成の MOD のフラクチャーの印、10-25)。どれが ✦ になるかはエンジンのまま
  if (kind === "fracture") {
    // ✦ の印の無い木 (白ベースから・フラクチャー無し) は乱数で固定: 当たりの札 = アイテムに付いている完成の狙い (未発現・冒涜の MOD は固定されない。スイッチ fracRandom)
    if (flag("fracRandom") && !fractureMarks(doc).length) {
      // 見本を幾つか見て、どれかに付いている完成の狙いは全部札に (見本 1 つだと、そこで冒涜で付いていた冷気耐性が札に入らず、ほかの人で固定された冷気耐性が外れの箱に入った、10-27 夜)
      const items = [item, ...[2, 3, 4].map((seed) => sampleOf(data, doc, boxId, seed).item)];
      const fixable = (it: StageItem): StageItem => { const ms = [...it.prefixes, ...it.suffixes].filter((m) => !m.fractured && !m.unrevealed && !m.desecrated); return { ...it, prefixes: ms.filter((m) => m.side === "prefix"), suffixes: ms.filter((m) => m.side === "suffix") }; };
      return (doc.memoAims ?? []).filter((a) => items.some((it) => aimHeldOn(data, fixable(it), a, { sameText: true }))).map((a) => ({ modId: a.modId, tier: a.tier }));
    }
    return fractureMarks(doc).filter((a) => aimHeldOn(data, item, a, { sameText: true }));
  }
  // 狙い無し (free) も付きうる狙いを出す: 結果は「打った後」+ 付いた狙いの当たりの箱 (10-26 オーナー「当たってたら次の回に消去でそれ決めるんやから」。
  // 前は打った後の 1 箱で、狙いが付いた人も打った後に入り、次のカオスで「狙いが消えた」が並んだ)
  if (kind !== "spam" && kind !== "add" && kind !== "swap" && kind !== "free") return [];
  // 候補 = 木で使っている当たりの狙い + 完成形の狙い (memoAims)。前は木に狙いが 1 つでもあると木の分だけで、完成形の残りの狙いが出ず
  // 「どれでも」が空 = 手にならなかった (10-25 モンキー 3 本目 301 の b4: 木の狙いは付いている火耐性貫通だけ、知性・ライフリーチが候補に無い)
  const pool = [...aimsOf(doc), ...(goals.length ? goals : doc.memoAims ?? [])].filter((a, i, l) => l.findIndex((x) => x.modId === a.modId) === i);
  const open = pool.filter((a) => !aimHeldOn(data, item, a, { sameText: true }));
  // 見本を数個見て、どれかで付く狙いは並べる (1 つだけだと見本に低い段が付いていて T2 が出なかった、10-22 13 通り組んだ #17)。どの見本でも行き先が無ければ全部。
  // 当たるまで (どれでも) も同じ絞り: 前は付いていない狙い全部で、カオスで付かない狙い (冒涜の MOD・アイテムレベルの足りない段) だけが残ると
  // 当たるまでが毎回 5000 回の上限まで回り、精査の 30 人回しでページが固まった (10-25 モンキー 3 本目、クォータースタッフの外れの箱に 2 つ目のカオススパム)
  const items = [1, 2, 3, 4].map((seed) => (seed === 1 ? item : sampleOf(data, doc, boxId, seed).item));
  let reach = reachableAims(data, items, h.currency, engineOmens(h), open, { sameText: true });
  // 触媒の高貴のお告げは品質の無い見本では打てず、表が無い (null) になって狙いが全部並び、左側の高貴なお告げでも付かないサフィが出た
  // (10-27 夜モンキー 2 回目 4)。触媒のお告げは付く MOD の重みを変えるだけで付きうる範囲は変えないので、抜いて聞き直す (スイッチ omenReach)
  if (!reach && flag("omenReach") && h.omens.includes(CATALYSING)) reach = reachableAims(data, items, h.currency, engineOmens(h).filter((o) => o !== CATALYSING), open, { sameText: true });
  if (reach) return reach;
  // 確率の表が無い時 (null): エンジンの起こりうる結果のどれでも MOD が増えないなら当たりは無し (10-26 モンキー 7 の 4: 不在のアミュレットに変成 = MOD 0 のマジック、
  // 前は狙い全部を当たりにして、何も付かない当たりの箱と「外れ 100%」ができた)。結果は打った後の箱 1 つ
  const had = new Set([...item.prefixes, ...item.suffixes].map((m) => m.modId));
  const outs = stepOutcomes(data, prepFor(data, item, h.currency), h.currency, engineOmens(h))?.filter((o) => !o.void);
  if (outs?.length && outs.every((o) => [...o.item.prefixes, ...o.item.suffixes].every((m) => had.has(m.modId)))) return [];
  // エッセンスの MOD (クラフト MOD) は付く MOD を選べない手では付かないので出さない (この箱で打てない手を持った時に、確率の表が無くて狙いが全部並び、合金の MOD まで ☑ に出た。10-27 夜)
  return open.filter((a) => !craftedKindOf(data, a));
}
/**
 * 次に打つ手の窓の「当たりの箱にする MOD」の候補 = 付く MOD を選べない手 (FREE_EFFECTS) で付きうる完成の狙い (狙い無しでも繰り返しでもない形で hitAimsOf に聞く)。
 * 画面 (TreeHandShelf) と猿の口 (sim-monkey の hitChoices・add の opt.hitAims) が同じ物を呼ぶ
 */
export function hitChoicesOf(data: PatchData, doc: TreeDoc, boxId: string, item: StageItem, p: Pick<HandPick, "held" | "omens" | "echo" | "veil">, goals: readonly Aim[]): Aim[] {
  // 印の無い木の乱数のフラクチャーも ☑ で狙いを選べる (候補 = 見本に付いている完成の狙い。スイッチ fracPick)
  if (flag("fracPick") && effectOf(p.held) === "fracture" && !fractureMarks(doc).length) return hitAimsOf(data, doc, boxId, item, { ...handOf({ held: p.held, omens: p.omens }), pick: "random" }, goals);
  if (!FREE_EFFECTS.includes(effectOf(p.held))) return [];
  return hitAimsOf(data, doc, boxId, item, handOf({ held: p.held, omens: p.omens, echo: p.echo, veil: p.veil }), goals);
}
/**
 * チェックした狙い (modId) から、手を決める時に渡す当たりの箱と狙い無しを出す (画面と同じ決め方): 付く MOD を選べない手で 1 つ以上チェック = その狙いの当たりの箱、
 * 何もチェックしない = 狙い無し。当たるまで繰り返す時は狙い無しも「どれでも」も無く、当たりの箱 0 (problemOf が「狙う MOD を選んで」で止める。
 * 10-25 オーナー「カオススパムするなら狙い MOD は絶対設定しないといけない」)。付く MOD を選べない手でなければ null (呼ぶ側の既定のまま)
 */
export function pickedHits(choices: readonly Aim[], checked: readonly string[], held: string, spam: boolean): { aims: Aim[]; free: boolean } | null {
  if (!FREE_EFFECTS.includes(effectOf(held))) return null;
  const aims = choices.filter((a) => checked.includes(a.modId));
  // チェックした物だけが当たりの箱 (TreeHandShelf の hitAims と同じ。10-27 朝に f468861b の (a) を戻した)
  if (aims.length) return { aims, free: false };
  return { aims: [], free: !spam };
}
/** 起こりうる結果の一覧 (この箱の見本 8 つにエンジンで打った行き先を全部たどる。触媒の手は前のカタリストを入れた後で。フラクチャーも同じ) */
export function onlyOf(data: PatchData, doc: TreeDoc, boxId: string, h: Hand, preCat: string | null, hitAims: Aim[]): OnlyOut {
  const l = possibleOutsOf(data, doc, boxId, h, preCat, hitAims);
  if (!l || !hitAims.length) return l;
  // チェックした狙いでない当たり (木のほかの狙いが付いた) は外れとして数える (当たりの箱はチェックした札だけ)
  const out = l.map((e) => (e.out === "hit" && e.aim && !hitAims.some((a) => a.modId === e.aim!.modId && a.tier === e.aim!.tier) ? { out: "junk" as OutKind, aim: null } : e));
  return out.filter((e, i) => out.findIndex((x) => x.out === e.out && x.aim?.modId === e.aim?.modId && x.aim?.tier === e.aim?.tier) === i);
}
/** この箱の見本に打てない手は確定させない (お告げが効かない・消せる物が無い等。オーナー 10-22「進行不能」、tree-sample の handProblem) */
export function problemOf(data: PatchData, item: StageItem, h: Hand, hitAims: Aim[], preCat: string | null, preFill: StageApply | null): string | null {
  // 前に足すカタリストが入らないベース (装飾品だけに入る。前は触媒のお告げの「品質が要る」と出た、10-22 13 通り組んだ #16)
  const full = !!preCat && catalystFull(item, preCat);
  if (preCat && preFill && !preFill.applied && !full) return tr(`前に足すカタリストが入らない: ${preFill.reason ?? ""}`, `The catalyst before this can't be used: ${preFill.reason ?? ""}`);
  // 当たるまで繰り返すのに狙いが 1 つも無い時は決めさせない (MOD を選んでいない・まだ付いていない狙いが無い・このカレンシーでは付かない)
  if (kindOf(h) === "spam" && !hitAims.length && flag("noSpam")) return tr("狙う MOD を選んで (当たるまで繰り返す手は狙う MOD が要る。候補が無い時は、完成の MOD に足してから)", "Pick a target mod (a repeat-until-hit craft needs one; if there are none, add one to the final mods first)");
  if (kindOf(h) === "spam" && !hitAims.length) return tr("狙う MOD を選んで (カオススパムオーブは狙う MOD が要る。候補が無い時は、完成の MOD に足してから)", "Pick a target mod (the Chaos Spam Orb needs one; if there are none, add one to the final mods first)");
  return handProblem(data, preCat && preFill ? preFill.item : item, h);
}
/**
 * 手を決めた時の組み替え (SimTreePage の pickHand と猿の口で同じ)。pre = 前に足す品質だけ上げる手のカタリスト (触媒のお告げ、10-22 オーナーの案 A)。
 * 完成の箱に手を付けたら同じ形の完成の箱もここへ (joinSameShape)。前に作ってまだ行き先も手も無い箱も、今手を付けた箱と同じ形ならつなぐ。返すのは手を付けた箱 (前のカタリストがあればその次)
 */
/** 当たりのまとめ・形の合う箱へで比べる箱の外れの種類と数 (boxSig、置き石も冒涜の外れ MOD。手で「まとめる」の候補も同じ。スイッチ boneLater) */
export function hitLoose(d: TreeDoc): ((id: string) => string | null) | undefined {
  const data = craftStage.data.value;
  return flag("boneLater") && data ? (x) => boxSig(data, d, x) : undefined;
}
/** 同じ当たりの箱にまとめる鍵 = 狙いの側 (エンジンの sideOfMod。setHand の groupOf、10-26 オーナーの決め「同じ側の狙いは当たりの箱 1 つ」) */
export function sideGroup(): ((a: Aim) => string) | undefined {
  const data = craftStage.data.value;
  return data ? (a) => sideOfMod(data, a.modId) : undefined;
}
export function applyPick(d: TreeDoc, id: string, h0: Hand, kind: HandKind, aims: Aim[], pre: string | null, only: OnlyOut): string {
  // ✦ の印の無い木のフラクチャーは乱数で固定する手 (スイッチ fracRandom)
  const h: Hand = flag("fracRandom") && effectOf(h0.currency) === "fracture" && !fractureMarks(d).length ? { ...h0, pick: "random" } : h0;
  // 外れで、打つ前の箱・同じ形の箱と同じ手 = 新しい段を作らずその箱へ戻る (シミュのルール、PC・スマホ共通。tree-shape の sameHandReturn、スイッチ goalShape)。
  // 外れに手がもう付いていれば下を消してから (前に同じ手で段を足して伸びた木)。戻ったかは呼ぶ側が箱の back で見る
  // 触媒 (pre) 付きの手も同じ判定 (PC・スマホで 1 つ、10-27 夕ブラックの決め B4。前は PC が pre のある時は見ず、スマホは pre を見ずに戻っていた)
  const data = craftStage.data.value;
  // 箱の見本の外れの形 = 側ごとに、完成の狙いに無い MOD を種類 (普通 / 冒涜 (発現・未発現) / エッセンスのクラフト MOD) ごとに数えた物。
  // 違う箱へは戻らない・つながない (10-27 夕オーナー「これは冒涜で付けた外れ MOD、これはエッセンスで付けた外れ MOD」= 次に打てる手が変わる違いは形の違い。スイッチ goalShape)
  // 見本ごとに外れの種類が違う箱 (未発現の箱にカオス: 未発現が消えた人と残った人が同じ外れの箱に入る) は、どの形の箱へもつながない
  // (片方の形の箱へつなぐと、もう片方の人がその箱の手を打てない。10-28 冒涜まわりの確かめ、スイッチ boneLater)
  const sigMemo = new Map<string, string | null>();
  const loose = flag("goalShape") && data ? (x: string): string | null => {
    if (sigMemo.has(x)) return sigMemo.get(x)!;
    let s = boxSig(data, d, x);
    if (s !== null && flag("boneLater") && x !== "start") {
      // 比べるのは外れの種類 (普通 / エッセンス / 冒涜) の有無だけ (側は見本ごとに違うのが普通 = 王者の外れはプレにもサフィにも付く)
      const kindsOf = (sig: string): string => { const [p, q] = sig.split("|").map((x2) => x2.split(".").map(Number)); return [0, 1, 2, 3].map((i) => (((p![i] ?? 0) + (q![i] ?? 0)) > 0 ? 1 : 0)).join(""); };
      const kinds = new Set([1, 2, 3, 4].flatMap((k) => { const m = sampleOf(data, d, x, k); return m.note === "none" || m.note?.startsWith("cant:") ? [] : [kindsOf(junkSig(data, d, m.item))]; }));
      if (kinds.size > 1) s = `mixed:${x}`;
    }
    sigMemo.set(x, s);
    return s;
  } : undefined;
  const to = flag("goalShape") ? sameHandReturn(d, id, h, loose) : null;
  if (to) { if (d.boxes[id]?.hand) clearHand(d, id); setBack(d, id, to); return id; }
  const had = new Set(Object.keys(d.boxes));
  let at = id;
  if (pre) { setHand(d, id, { currency: pre, omens: [], catalyst: null, quality: 0 }, "quality"); at = d.boxes[id]!.outs[0]!; }
  setHand(d, at, h, kind, aims, only);
  if (kind === "strip") stripChain(d, at, h);
  joinSameShape(d, id);
  linkSameShape(d, Object.values(d.boxes).filter((b) => !had.has(b.id) || (!b.hand && !b.back && !b.done)).map((b) => b.id), loose);
  // 新しい当たりの箱が別の道の同じ状態の箱と同じなら、先にあった箱へつなぐ (10-26 夜オーナー「形は一緒ならこのツリー組んだ瞬間まとまってくれるよね」)
  linkSameHit(d, Object.values(d.boxes).filter((b) => !had.has(b.id)).map((b) => b.id), flag("boneLater") ? loose : undefined);
  // まとめられない当たりの箱 (来た道で狙いの組が何通りかある) は形の合う箱へ (10-27 オーナーの決め (a))。前からある手も戻りも無い箱も
  linkShapeHit(d, Object.values(d.boxes).filter((b) => !had.has(b.id) || (!b.hand && !b.back && !b.done)).map((b) => b.id), flag("boneLater") ? loose : undefined);
  // 自動でつないだ戻りで狙いを持って着く道ができた箱に「狙いが消えた」を足す (tree-model の healLost)
  healLost(d);
  return at;
}

/**
 * 全部消えてよい消去 (10-27 オーナー「スピリットが消えた時点で破綻…直線になるはず…同じ箱になるまで消去ツリーが生成されるはず」): 消去 1 回ごとの箱を直線に並べ
 * (☑ が無いので全部外れ MOD、消えた / 残ったで分けない)、木の狙い無しの手のある箱と同じ形 (外れの数、tree-outcome の stripStops) になった所で ↩ その箱。
 * 数はこの箱の見本の外れの数から。初めから同じ形なら消去は打たずに ↩ その箱。同じ形の箱が無ければ全部消した所で戻り先を決めずに置く (足りない所)
 */
function stripChain(d: TreeDoc, id: string, h: Hand): void {
  const data = craftStage.data.value, b = d.boxes[id];
  if (!data || !b) return;
  if (flag("goalShape") && stripToShape(data, d, id, h)) return;
  const it0 = sampleOf(data, d, id, 1).item, n = looseOf(it0), stops = stripStops(data, d, id, it0);
  const s = Math.max(-1, ...[...stops.keys()].filter((k) => k <= n));
  const to = s >= 0 ? stops.get(s)! : null;
  if (to && s === n) {
    for (const o of b.outs) drop(d, subtree(d, o));
    b.outs = []; b.hand = null; b.back = to; b.autoBack = true;
    return;
  }
  let at = id;
  for (let i = 1; i < n - Math.max(s, 0); i++) { const c = d.boxes[at]?.outs[0]; if (!c) return; setHand(d, c, h, "strip"); at = c; }
  const last = d.boxes[d.boxes[at]?.outs[0] ?? ""];
  if (last) { last.back = to; if (to) last.autoBack = true; else delete last.autoBack; }
}
/**
 * 全部消えてよい消去の直線を、消去 1 回ごとの結果をエンジンで打って (stepOutcomes、お告げ込み) 全部の結果が同じ形の手のある箱 (matchItem = 形の鍵) に当たる所で止め、
 * その箱へ ↩ (狙いを持つ箱も。10-27 夕モンキー 2: キャストの外れ (スピリット + ✦ + 外れ) に右側の消去で、1 回目でスピリットの箱と同じ形になったのに
 * 消去がもう 1 回並んだ。前の stripStops は狙いを持たない箱だけを止まる所にしていた)。見つからなければ false (前の作り)
 */
/** 外れの形の鍵の ✦ の所 (どの狙いに ✦、外れの ✦ の数。✦ の違う箱へ消去の直線が戻った、10-28 モンキー 3) */
const frPart = (sig: string | null): string | undefined => sig?.split("|")[2];
function stripToShape(data: PatchData, d: TreeDoc, id: string, h: Hand): boolean {
  let it = sampleOf(data, d, id, 1).item;
  const n = looseOf(it), below = new Set(subtree(d, id));
  for (let i = 0; i < n; i++) {
    const outs = (stepOutcomes(data, prepFor(data, it, h.currency), h.currency, engineOmens(h)) ?? []).filter((o) => !o.void).map((o) => o.item);
    if (!outs.length) return false;
    const tos = new Set(outs.map((x) => matchItem(data, d, x)));
    const to = tos.size === 1 ? [...tos][0] : null;
    // 戻る箱は同じレアリティ (MOD 0 まで消えたレアを白の箱へ戻さない、スイッチ stripRarity)
    if (to && to !== "start" && d.boxes[to]?.hand && !below.has(to) && to !== id && (!flag("stripRarity") || sampleOf(data, d, to, 1).item.rarity === outs[0]!.rarity) && (!flag("boneLater") || frPart(junkSig(data, d, outs[0]!)) === frPart(boxSig(data, d, to)))) {
      let at = id;
      for (let k = 0; k < i; k++) { const c = d.boxes[at]?.outs[0]; if (!c) return false; setHand(d, c, h, "strip"); at = c; }
      const last = d.boxes[d.boxes[at]?.outs[0] ?? ""];
      if (!last) return false;
      last.back = to; last.autoBack = true;
      return true;
    }
    it = outs[0]!;
  }
  return false;
}
/** 棚に並ぶ物 (CurrencyShelf と同じ: オーブ・骨・エッセンス、ソケットがあればクラフトのルーン。隠すのはツリーの棚と同じ treeHidden。猿の口) */
export function shelfKeysOf(data: PatchData, it: StageItem): string[] {
  const sockets = socketCapOf(it.base, it.cls.category) > 0 || (it.sockets ?? 0) > 0;
  const runes = sockets ? runesFor(it).flatMap((g) => g.keys).filter((k) => runeOf(k)) : []; // クラフトのルーン・特別なルーン (ほかは treeHidden で外す)
  return [...ORBS.flatMap((g) => g.keys), ...bonesFor(it), ...essenceShelf(data, it).flatMap((g) => g.keys), ...runes].filter((k) => !treeHidden(k));
}
/** 棚で持った物の残り (お告げ以外)。hitAims = 当たりの箱にする MOD (modId の並び、[] = 狙い無し。渡さないと付きうる狙い全部) */
export type PickOpt = Omit<HandPick, "held" | "omens"> & { hitAims?: string[] };
/**
 * 棚で選んだ物 → 手を決める時に渡す物一式 (棚の窓の決め方と同じ。猿の口 sim-monkey の add が呼ぶ)。problem があれば確定させない
 */
export function planPick(data: PatchData, doc: TreeDoc, id: string, it: StageItem, key: string, omens: string[], opt: PickOpt, goals: readonly Aim[]) {
  const afterQ = afterQualityOf(doc, id), autoCat = autoCatOf(data, doc, it);
  const needPre = omensAllowedFor(key).includes(CATALYSING) && !afterQ;
  const preFill = preFillOf(data, it, needPre, autoCat);
  const pick = opt.hitAims ? pickedHits(hitChoicesOf(data, doc, id, it, { held: key, omens, echo: opt.echo, veil: opt.veil }, goals), opt.hitAims, key, !!opt.spam) : null;
  const hand = handOf({ held: key, omens, ...opt, ...(pick ? { free: pick.free } : {}) }), kind = kindOf(hand);
  const aims = pick && !pick.free ? pick.aims : hitAimsOf(data, doc, id, it, hand, goals);
  const preCat = hand.omens.includes(CATALYSING) && !afterQ ? autoCat : null;
  const only = onlyOf(data, doc, id, hand, preCat, aims);
  return { hand, kind, aims, preCat, only, problem: problemOf(data, it, hand, aims, preCat, preFill) };
}
// 伸ばすカタリスト (2026-10-23 エンジンの for-sim から戻した。中身はエンジンの核の catalystBoosts を呼ぶだけ)。付きうる狙い reachableAims は精査も使うので tree-aim.ts (10-25)
/** その MOD を伸ばすカタリスト (keys の並びで最初の物、伸ばす物が無ければ null)。伸びるかはエンジンの catalystBoosts (指輪・アミュレットは MOD の tags、ジュエル・上のベースは中身のタグ) */
function catalystForMod(data: PatchData, item: StageItem, modId: string, keys: readonly string[]): string | null {
  const mod = data.mods.get(modId);
  if (!mod) return null;
  return keys.find((k) => catalystBoosts(item, { modId, tags: mod.tags }, catalystTagOf(k), data)) ?? null;
}
