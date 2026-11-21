/**
 * daily-ele.ts — 忍者産のお題の火・冷気・雷耐性を「いずれかの元素耐性」で狙う (D-06c、スイッチ dailyEleAny、オーナー 11-20 夜「Aで」)。
 *
 * お題の狙いの JSON は変えない (印も持たせない)。お題が箱の投稿でない (忍者の週の型・予定から出た) 時だけ、
 * ① 挑戦の木の完成形の一般の火・冷気・雷の狙いを、シミュの「いずれかの元素耐性」(S-10h、tree-ele-any の tidyGoals) にする (✦ を付けた狙いは元素のまま)
 * ② 完成の判定 (daily-cost の holdsAll・missingAims) を、その狙いは違う元素で数える割り当てにする (段の厳しい狙いから順に、まだ使っていない元素耐性で段に届く物を 1 つずつ)。
 * カオス耐性・全ての元素耐性・2 元素・冒涜の耐性は今のまま (まとめるのはエンジンの anyEleMod の系統だけ)。
 * 今のお題がどちらか (と、木を組む時のデータ) は挑戦の画面・16:00 の検算が setEleTopic で置く (daily-judge-day の setJudgeDay と同じ置き方)
 */
import { anyEleIds, anyEleMod, type PatchData, type StageMod } from "../../services/craft-stage/engine";
import { eleAnyText, tidyGoals } from "../../services/simulator/tree/tree-ele-any";
import type { Aim } from "../../services/simulator/tree/tree-model";
import { flag, type Flag } from "../../web/release-flags";

let on = false;
let topicData: PatchData | null = null;
/** 今 判定・組み立てをしているお題が「いずれか」で狙うお題か (箱の投稿でない = fromBox が false の時だけ。分からない時は今までどおり元素ごと) */
export function setEleTopic(fromBox: boolean | null | undefined, data?: PatchData | null): void {
  on = flag("dailyEleAny" as Flag) && fromBox === false;
  if (data) topicData = data;
}
export const eleTopicNow = (): boolean => on;

/** その狙いを「いずれか」で数えるか (今のお題が忍者産で、狙いが一般の火・冷気・雷耐性) */
export const eleAim = (data: PatchData, a: { modId: string }): boolean => on && anyEleMod(data, a.modId);

/**
 * 「いずれか」で数える狙いのうち、品の MOD で埋まらない物 (段の厳しい順に割り当て。段が入れ子なので、厳しい狙いから届く MOD を 1 つずつ取れば足りるかが決まる)。
 * hit = 1 つの MOD が 1 つの元素の狙いに当たるか (daily-cost の dailyHit)。同じ元素の MOD を 2 つの狙いに使わない
 */
export function eleUnmet<A extends { modId: string; tier: number }>(data: PatchData, mods: readonly StageMod[], aims: readonly A[], hit: (m: StageMod, a: { modId: string; tier: number }) => boolean): A[] {
  const used = new Set<number>(), miss: A[] = [];
  for (const a of [...aims].sort((x, y) => x.tier - y.tier)) {
    const ids = anyEleIds(data, a.modId);
    const i = mods.findIndex((m, k) => !used.has(k) && ids.some((id) => hit(m, { modId: id, tier: a.tier })));
    if (i < 0) miss.push(a);
    else used.add(i);
  }
  return aims.filter((a) => miss.includes(a));
}

/**
 * 完成を押した時の訳 (D-35b ③) の狙いの名前: 「いずれか」で数える狙いは元素の語を「いずれかの元素耐性」に (完成形のカードと同じ字、番号は付けない。D-06c ⑥、スイッチ dailyEleReason)。
 * text = 木の狙いの短い名前 (aimShort)。それ以外の狙い・スイッチが切れている間はそのまま
 */
export const eleMissText = (data: PatchData, a: { modId: string }, text: string): string => (flag("dailyEleReason" as Flag) && eleAim(data, a) ? eleAnyText(text) : text);

/** お題の木の完成形の狙いを「いずれか」に (✦ と冒涜で付ける物は元素のまま)。今のお題が忍者産でない・データが無い時はそのまま */
export function eleGoals(list: Aim[], data: PatchData | null | undefined = topicData): Aim[] {
  if (!on || !data) return list;
  const conv = list.map((a) => (!a.fractured && a.via !== "desecrated" && anyEleMod(data, a.modId) ? { ...a, anyEle: 1 } : a));
  return conv.some((a) => a.anyEle) ? tidyGoals(data, conv) : list;
}
