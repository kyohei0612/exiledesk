/**
 * aim-odds.ts — エミュレーターの「狙う」(2026-10-09)
 *
 * オーナー「MOD がプレフィックスに付いてて、次の MOD を狙いたい時に確率が分からん。狙うボタンを押すと、この状態で一番付く確率が高い物を順に、
 * 使えるカレンシーに確率を出す。並び順は付きやすい順。冒涜も含める。反響も使える (使わない選択肢は無い) からセットで。
 * 安いとかじゃなくて確率を出したい。高貴なら左側・完全高貴、場合によっては上級の方が付きやすいとか」。
 *
 * 出し方: ステージで実際に打つのと同じ applyCurrency を、今のアイテムから何百回も試して数える (お告げ・均質化・強さの下限・同じ系統の除外も
 * そのまま入る)。冒涜は骨を打った後の発現の候補 (反響の引き直しを含めて 6 つ) に狙いが出れば当たり (選べるので)。
 * 未発現の冒涜 MOD がもう付いている時は「発現」の 1 行 (反響込み)。
 */
import { applyCurrency, kindOf } from "./apply-currency";
import { revealOffers, unrevealedOf } from "./apply-desecrate";
import { mulberry32 } from "../htc/rng";
import type { StageItem, StageMod } from "./types";
import type { PatchData } from "../../vendor/poe2htc/engine/types";

export interface AimTarget { modId: string; minTierIndex: number }
/** 試す打ち方 (カレンシー + お告げ)。reveal = 付いている未発現の MOD を発現させる (反響込み) */
export interface AimCombo { currency: string; omens: string[] }
export interface AimOdd extends AimCombo { p: number; n: number }

export const REVEAL = "reveal";
const ECHOES = "OmenofAbyssalEchoes";

/** お告げの組み合わせ (付く MOD の出方が変わる物だけ。片方の側のお告げは 1 つまで) */
function omenSets(kind: string): string[][] {
  switch (kind) {
    case "exalt": {
      const side = [[], ["OmenofSinistralExaltation"], ["OmenofDextralExaltation"]];
      return [...side, ...side.map((s) => [...s, "OmenofGreaterExaltation"])];
    }
    case "chaos":
      return [[], ["OmenofWhittling"], ["OmenofSinistralErasure"], ["OmenofDextralErasure"]];
    case "essence_perfect":
      return [[], ["OmenofSinistralCrystallisation"], ["OmenofDextralCrystallisation"]];
    case "desecrate": {
      const side = [[], ["OmenofSinistralNecromancy"], ["OmenofDextralNecromancy"]];
      const fac = [[], ["OmenoftheSovereign"], ["OmenoftheLiege"], ["OmenoftheBlackblooded"]];
      return side.flatMap((s) => fac.map((f) => [...s, ...f]));
    }
    default:
      return [[]];
  }
}

export const hits = (m: StageMod, t: AimTarget): boolean => !m.unrevealed && m.modId === t.modId && m.tierIndex >= t.minTierIndex;
const has = (item: StageItem, t: AimTarget): boolean => [...item.prefixes, ...item.suffixes].some((m) => hits(m, t));

/** 試す打ち方の一覧 (今のアイテムに打てる物だけ。keys = 棚の使える物) */
export function aimCombos(data: PatchData, item: StageItem, keys: readonly string[]): AimCombo[] {
  const out: AimCombo[] = [];
  if (unrevealedOf(item)) out.push({ currency: REVEAL, omens: [ECHOES] });
  for (const k of keys) {
    const kind = kindOf(k);
    for (const om of omenSets(kind)) {
      // お告げが全部効く時だけ (効かないお告げは使われず、お告げ無しと同じになる)
      const r = applyCurrency(data, item, k, mulberry32(1), om);
      if (!r.applied) continue;
      // コラプトさせる物 (ヴァールなど) は狙う手にしない。打てばその先クラフトできず、外れも当たりも狙いの役に立たない
      // (2026-10-09 オーナー「ヴァールに関しては意味わからん」: 書き換えの目でまれに付くので 1 位に出ていた)
      if (kind === "vaal" || (r.item.corrupted && !item.corrupted)) continue;
      out.push({ currency: k, omens: kind === "desecrate" ? [...om, ECHOES] : om });
    }
  }
  return out;
}

/** 1 つの打ち方で n 回試して、狙いが付いた (冒涜は候補に出た) 割合 */
/**
 * 1 つの打ち方で n 回試して、狙い (全部。最大 4 つ、錬金術で一度に付く数) が揃った割合。冒涜は発現の候補に残りの 1 つが出れば揃った扱い
 */
export function aimOdds(data: PatchData, item: StageItem, ts: AimTarget | readonly AimTarget[], c: AimCombo, n: number, seed: number): number {
  const list = Array.isArray(ts) ? (ts as readonly AimTarget[]) : [ts as AimTarget];
  const missing = (it: StageItem): AimTarget[] => list.filter((t) => !has(it, t));
  const offered = (o: { first: StageMod[]; reroll: StageMod[] }, miss: AimTarget[]): boolean => miss.length === 0 || (miss.length === 1 && [...o.first, ...o.reroll].some((m) => hits(m, miss[0]!)));
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const rng = mulberry32(seed + i * 7919);
    if (c.currency === REVEAL) {
      if (offered(revealOffers(data, item, rng), missing(item))) hit++;
      continue;
    }
    const used = c.omens.filter((o) => o !== ECHOES);
    const r = applyCurrency(data, item, c.currency, rng, used);
    if (!r.applied) continue;
    if (kindOf(c.currency) === "desecrate") {
      if (offered(revealOffers(data, r.item, rng), missing(r.item))) hit++;
    } else if (!missing(r.item).length) hit++;
  }
  return hit / n;
}

/** もう付いているか */
export const aimDone = (item: StageItem, ts: readonly AimTarget[]): boolean => ts.length > 0 && ts.every((t) => has(item, t));
