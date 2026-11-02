/**
 * mod-rules.ts — MOD の決まり (系統・重み・出やすさ) の置き場はここだけ (2026-09-29)
 *
 * オーナー「計算式や MOD を見ている所が複数あるなら 1 つに統一して、1 か所直したら全部直る仕組みに」。
 * 前は同じ系統の判定が 3 通り、重みの合計が 6 か所にあり、画面によって答えが違っていた
 * (2 つの系統にまたがる冒涜の MOD「+力 +知性」を、計算機の確率の一部が 1 つ目の系統でしか見ていなかった など)。
 * 計算機・クラフトステージ・規格外の賭け・ビルドコピー・MOD の一覧は、系統と重みを必ずここから取る。
 * 中身は計算機のエンジン (src/vendor/poe2htc/engine/pool.ts) の式を使い、エンジンに無い決まりだけここに足す。
 */
import type { Mod } from "../../vendor/poe2htc/engine/types";
import { excluded, familiesOf, modTierWeight, occupiedFamiliesOf } from "../../vendor/poe2htc/engine/pool";

/**
 * 同じ系統の MOD は 1 品に 1 つ (E-11、基本動作。付け方に例外なし。2026-11-02 オーナー「ファミリーで被るはないな」)。
 * 判定はエンジンの familiesOf / excluded の 1 か所だけで、ここはそれを呼ぶ口。エッセンス・冒涜の発現・普通の MOD で見方を変えない
 * (前はエッセンスの MOD だけ crafted:… に名前を分け、別の見方 essenceClash・rawFamiliesOf も持っていた)。
 */
export function familyKeysOf(mod: Mod): string[] {
  return [...familiesOf(mod)];
}
/** 付いている MOD が塞ぐ系統 (= familyKeysOf。付け方で変わらない) */
export function occupiedKeysOf(mod: Mod): string[] {
  return [...occupiedFamiliesOf(mod)];
}

/** その MOD が、もう付いている系統 (付いている MOD の occupiedKeysOf を集めた物) とぶつかるか (エンジンの excluded) */
export function familyBlocked(mod: Mod, taken: ReadonlySet<string>): boolean {
  return excluded(mod, taken);
}

/** その系統を持つか (深淵のエッセンスの印 = ABYSS_FAMILY など、特定の系統の MOD を見分ける時。ぶつかるかの判定ではない) */
export function hasFamily(mod: Mod, family: string): boolean {
  return familiesOf(mod).includes(family);
}
/** 2 つの MOD が系統を 1 つでも同じくするか (エッセンスの段を同じ系統の一般 MOD の段で数える時など。ぶつかるかは familyBlocked) */
export function sharesFamily(a: Mod, b: Mod): boolean {
  return familyBlocked(a, new Set(familiesOf(b)));
}

/**
 * 前の名前 (11-02 に 1 本へまとめる前)。中身は上の関数そのまま。シミュ (sim-route-helpers・carry-aims)・state/for-share・tests が
 * 呼んでいるので、それぞれの持ち主が上の名前へ移したら消す (一覧は共有メモ jin-family-check-inventory-1102.md)
 * @deprecated familyKeysOf を使う
 */
export const rawFamiliesOf = familyKeysOf;
/** @deprecated hasFamily を使う */
export const hasRawFamily = hasFamily;
/** @deprecated sharesFamily を使う */
export const sharesRawFamily = sharesFamily;
/** @deprecated familyBlocked を使う (エッセンスも同じ判定) */
export const essenceClash = familyBlocked;

/**
 * 段の重みの合計。minIdx の段より上で、MOD レベルが floor 以上・cap (アイテムレベル) 以下の段だけ。
 * floor = 上級・完全のオーブや古代の骨の足切り。エンジンの modTierWeight と同じ式 (引数の順だけ使いやすく)
 */
export function tierWeight(mod: Mod, minIdx: number, cap: number, floor = 0): number {
  return modTierWeight(mod, floor, cap, minIdx);
}

type ShareKey = { side: string; group: string; weight: number };
/**
 * 出やすさ = 同じ側・同じ種類の重みの合計に対する割合 (0〜1)。rows の share を書き換える。
 * MOD の一覧 (クラフトステージ・計算機の狙う MOD) はどちらもこれで割る。重みの合計が 0 の組 (エッセンス = 確定) は 0。
 * base = 合計を取る元 (検索で絞る前の全部。省略時は rows)
 */
export function fillShares<T extends ShareKey & { share: number }>(rows: T[], base: readonly ShareKey[] = rows): T[] {
  const totals = new Map<string, number>();
  for (const r of base) totals.set(`${r.side}|${r.group}`, (totals.get(`${r.side}|${r.group}`) ?? 0) + r.weight);
  for (const r of rows) {
    const t = totals.get(`${r.side}|${r.group}`) ?? 0;
    r.share = t > 0 ? r.weight / t : 0;
  }
  return rows;
}
